import { serve } from '@hono/node-server';
import { createDatabase } from '@lawmind/db';
import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

import { createApp } from './app.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';

const db = createDatabase(env.databaseUrl());
const rawSql = postgres(env.databaseUrl(), { max: 10 });

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

const app = createApp({
  ping: async () => {
    await db.execute(sql`SELECT 1`);
  },
  search: { sql: rawSql, embedQuery },
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
