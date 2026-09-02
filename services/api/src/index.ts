import { serve } from '@hono/node-server';
import { createAuth, mailerFrom } from '@lawmind/auth';
import { createDatabase } from '@lawmind/db';
import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { sql } from 'drizzle-orm';

import { createApp } from './app.ts';
import { createRolePools } from './pools.ts';
import { sameDatabaseRefusal, verifyDistinctDatabases } from './ops/db-identity.ts';
import { ActivationOutbox, type OutboxStats } from './product/activation-outbox.ts';
import { installActivationOutbox } from './product/activation.ts';
import { createAdmission } from './search/admission.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { runPreflight } from './preflight.ts';

const db = createDatabase(env.databaseUrl());
/**
 * Every statement this API sends is bounded — see `env.pgStatementTimeoutMs`.
 *
 * `idle_in_transaction_session_timeout` is the second half of the same
 * guarantee: `statement_timeout` cancels a running statement, but a connection
 * that opened a transaction and then stopped being driven holds its locks
 * indefinitely and no statement timeout ever fires. Both are needed for "a
 * request cannot monopolize Postgres" to be true rather than mostly true.
 */
/**
 * TWO pools, not one — `pools.ts` holds the measurement that decided the sizes.
 *
 * `rawSql` is the CORE handle and keeps its name because every route below
 * already takes it; what changed is that the rankers no longer share it.
 */
/**
 * TWO DATA ROLES as well as two workload queues — `pools.ts` explains why those
 * are different axes, and `db-split.ts` resolves the URLs.
 *
 * In the default configuration both roles resolve to `DATABASE_URL` and this is
 * exactly the behaviour that existed before: one database, the same two pools,
 * plus one short-statement pool for user-owned work. Nothing needs a new
 * variable to keep working.
 */
const databases = env.databases();
const rolePools = createRolePools(
  databases.corpusUrl,
  databases.userUrl,
  env.pgStatementTimeoutMs(),
);
const pools = rolePools.corpus;
const rawSql = pools.core;
/** User-owned work — matters, annotations, alerts, billing. `ops/db-roles.ts`. */
const userSql = rolePools.user;
const admission = createAdmission();

/**
 * Fail closed, not open — REB §1. Every other degradation path in this file
 * (the embedder, mail) is a deliberate choice to keep serving with a smaller
 * surface; citation correctness is not one of those, because a `cite:` search
 * that silently stopped matching is indistinguishable from one that correctly
 * found nothing. `preflight.ts` documents exactly what is checked and why.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A DECLARED SPLIT IS VERIFIED AGAINST THE SERVERS, NOT AGAINST THE URLS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `resolveDatabases` has already refused a split whose two URLs name one
 * database. That check is syntactic and cannot see two hostnames resolving to
 * one server — a proxy endpoint beside a private one is the ordinary way to
 * configure Railway, and both spellings reach the same files.
 *
 * So in split mode the two handles are asked who they are. `ops/db-identity.ts`
 * compares `(system_identifier, current_database())`, which is the cluster's
 * data directory plus the database inside it — precisely the scope a `TRUNCATE`
 * has.
 *
 * Startup is the right place: a misconfiguration discovered by a restore has
 * already destroyed the thing the check protects.
 */
if (databases.mode === 'split') {
  const verdict = await verifyDistinctDatabases(rawSql, userSql);
  if (!verdict.distinct) {
    logger.fatal({ event: 'db_split_same_database' }, sameDatabaseRefusal(verdict));
    process.exit(1);
  }
  logger.info(
    {
      event: 'db_split_verified',
      corpus: verdict.corpus.database,
      user: verdict.user.database,
      // Different databases in ONE cluster are genuinely isolated for TRUNCATE
      // and share a disk, a WAL and a failure domain. Worth an operator knowing.
      same_cluster: verdict.sameCluster,
    },
    'corpus and user databases verified distinct',
  );
}

const preflightFailures = await runPreflight(rawSql);
if (preflightFailures.length > 0) {
  logger.fatal(
    { failures: preflightFailures },
    'startup preflight failed — refusing to boot with a citation-safety-critical gap',
  );
  process.exit(1);
}

/**
 * A model that will not load must never take the API down.
 *
 * transformers.js throws "Unable to get model file path or buffer" from inside
 * its own async file loader — `at async <anonymous>`, a context nothing awaits.
 * The rejection therefore never reaches the `await` in `embedQuery`, its
 * try/catch cannot see it, and Node's default for an unhandled rejection is to
 * kill the process. That crash-looped production: `api listening`, one healthy
 * `/health`, then dead on the first `/search`.
 *
 * Logging and continuing is the right call HERE specifically, because the only
 * thing that can fail this way is optional: search degrades to lexical-only and
 * every other route is unaffected. This is not a licence to swallow rejections
 * generally.
 */
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection — process kept alive deliberately');
});

/**
 * The query is embedded by the SAME model and dtype as the corpus — see
 * `services/embed/src/embed.ts`. If the model cannot load, search degrades to
 * lexical-only rather than failing: half a hybrid is still a usable search, and
 * an outage that returns nothing looks identical to an empty corpus.
 *
 * The breaker matters because `getEmbedder` caches a rejected promise: without
 * it every subsequent search retries a load that has already failed, paying the
 * timeout each time and emitting another unhandled rejection.
 */
let embedderFailures = 0;
const EMBEDDER_FAILURE_LIMIT = 3;

/**
 * Query embedding gets a hard time budget and never exceeds it.
 *
 * A failure is not the only way this hurts: a model that HANGS is worse than one
 * that throws. On a cold container `getEmbedder` blocks fetching weights, and
 * without this every `/search` waits on that download — measured at over 180s
 * against a Gate S1 budget of 3s for the whole request. The circuit breaker below
 * cannot help, because it counts failures and a hang never fails.
 *
 * So the race is the guarantee: dense retrieval either contributes within budget
 * or it does not contribute at all. Losing the dense half costs recall; losing
 * the response costs the product.
 */
const EMBED_TIMEOUT_MS = Number(process.env['EMBED_TIMEOUT_MS'] ?? 2000);

const embedQuery = async (text: string): Promise<string | null> => {
  if (embedderFailures >= EMBEDDER_FAILURE_LIMIT) return null;

  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), EMBED_TIMEOUT_MS);
  });

  try {
    const embed = (async () => {
      const embedder = await getEmbedder();
      const [embedded] = await embedder.embed([text]);
      return embedded ? toVectorLiteral(embedded.vector) : null;
    })();

    const vector = await Promise.race([embed, budget]);
    if (vector === null) {
      // Distinguish a timeout from an empty result: only a timeout counts toward
      // the breaker, and only a timeout should be logged as degradation.
      logger.warn(
        { timeout_ms: EMBED_TIMEOUT_MS },
        'query embedding exceeded its budget — this search is lexical-only',
      );
    }
    embedderFailures = 0;
    return vector;
  } catch (error) {
    embedderFailures++;
    logger.error(
      { err: error, failures: embedderFailures },
      embedderFailures >= EMBEDDER_FAILURE_LIMIT
        ? 'query embedding disabled after repeated failures — search is lexical-only until restart'
        : 'query embedding unavailable — falling back to lexical search',
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Authentication. better-auth owns identity and the magic-link lifecycle; we mint
 * the token pair on top of it — `sprints/SPRINT_5.md`.
 *
 * `mailerFrom` throws rather than falling back to the console transport in
 * production. A missing mail key must not become a service where every sign-in
 * logs success and no advocate ever receives a link.
 */
const mailer = mailerFrom(
  { resendApiKey: env.resendApiKey, mailFrom: env.mailFrom, nodeEnv: env.nodeEnv },
  (line: string) => logger.info({ transport: 'console' }, line),
);
logger.info({ mail_transport: mailer.name }, 'mail transport selected');

const authSecret = env.authSecret();
/**
 * better-auth's own tables are USER tables — `auth_user`, `auth_session`,
 * `auth_account`, `auth_verification` are all in `ops/db-roles.ts` under
 * identity. Constructing it on the corpus handle worked for as long as the two
 * roles were one database and would have made a split deployment unable to
 * authenticate a single request.
 */
const auth = createAuth({
  sql: userSql,
  secret: authSecret,
  baseUrl: env.authBaseUrl(),
  mailer,
});

const app = createApp({
  ping: async () => {
    await db.execute(sql`SELECT 1`);
  },
  search: { sql: rawSql, userSql, researchSql: pools.research, admission, embedQuery },
  auth: { auth, sql: userSql, secret: authSecret },
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  logger.info({ port: info.port, env: env.nodeEnv }, 'api listening');

  /**
   * Warm the embedder once, at boot, in the background.
   *
   * **This is what makes dense retrieval work at all.** Measured on the live
   * container: fp32 takes ~19s to fetch and load cold, then embeds a query in
   * 23ms. `embedQuery` allows each request 2s. Without a warm, every single
   * search expires that budget against a load that has barely started, dense
   * never contributes, and search is silently lexical-only forever — which is
   * exactly what production did until this was added back.
   *
   * It was removed once after appearing to crash-loop a deploy. The real cause
   * was a rejection escaping from inside transformers.js's own async file
   * loader, which the `unhandledRejection` handler above now absorbs. Warming
   * can no longer take the process down.
   *
   * Deliberately after `serve` and deliberately not awaited: `/health` must stay
   * answerable while this runs, or Railway fails the healthcheck and rolls back a
   * container that was working.
   */
  const warmStarted = Date.now();
  void getEmbedder()
    .then((embedder) => embedder.embed(['anticipatory bail']))
    .then(() => {
      logger.info(
        { warm_ms: Date.now() - warmStarted },
        'embedder warm — dense retrieval contributing',
      );
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'embedder warm failed — search stays lexical-only');
    });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ACTIVATION OUTBOX — INSTALLED HERE, FLUSHED ON THE WAY OUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R4 hidden risk #17: activation writes were `void promise.catch(log)`, so every
 * in-flight write vanished on a deploy and NOTHING COUNTED IT. A funnel with
 * unmeasured loss cannot carry a paywall experiment — "this variant converts
 * worse" and "this variant's writes were dropped during a deploy" are the same
 * numbers.
 *
 * Installed after `serve`, deliberately, for the same reason the embedder warm
 * is: nothing here may delay `/health` answering.
 */
const activationOutbox = new ActivationOutbox(rawSql);
installActivationOutbox(activationOutbox);

/**
 * Flush on the way out. The ordinary deploy then loses nothing at all.
 *
 * `once`, because SIGTERM followed by SIGINT during a slow shutdown would
 * otherwise run the flush twice and double-count the loss. The deadline is
 * bounded: a shutdown that waits indefinitely for a database that is already
 * gone turns a clean deploy into a hung one, and anything still queued when it
 * passes is COUNTED as lost rather than quietly forgotten.
 */
let flushed = false;
const flushActivation = (signal: string) => {
  if (flushed) return;
  flushed = true;
  void activationOutbox.flush(5_000).then((stats: OutboxStats) => {
    logger.info({ signal, ...stats }, 'activation outbox flushed');
    process.exit(0);
  });
};
process.once('SIGTERM', () => flushActivation('SIGTERM'));
process.once('SIGINT', () => flushActivation('SIGINT'));
