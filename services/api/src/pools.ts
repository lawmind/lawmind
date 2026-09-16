/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO POOLS, BECAUSE ONE QUEUE IS THE THING THAT ACTUALLY FAILS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Measured first, 22 Aug 2026, against the local Postgres this API talks to:**
 *
 *     max_connections     100
 *     shared_buffers      2GB
 *     sessions in use     16 (7 active) — the ingest fleet, not this API
 *     THIS API's pool     max: 10, shared by every route
 *
 * So Postgres is nowhere near its limit and never was. The resource that runs
 * out is **this process's own connection queue**: ten concurrent research
 * queries — each allowed 15 s by `statement_timeout` — occupy all ten slots,
 * and `postgres.js` then makes every other caller WAIT. Not fail: wait, with no
 * timeout of its own. A sign-in, a save-to-matter, a citation lookup and the
 * healthcheck all queue behind a burst of concept searches, and the API looks
 * dead while the database is idle.
 *
 * That is the failure to fix, and it is fixed by giving expensive work its own
 * queue rather than by making the database bigger.
 *
 *     CORE      auth · matters · judgments · citations · admin · health
 *               8 connections, 10 s statements. Short, indexed, transactional.
 *
 *     RESEARCH  /search, saved-search feeds, counter-arguments — anything that
 *               runs a ranker over the corpus.
 *               6 connections, 15 s statements, and an admission gate in front.
 *
 * 14 connections against `max_connections = 100` with the fleet holding 16:
 * comfortably inside, and the two numbers are deliberately NOT a percentage of
 * anything. They are "how many can one request need" times "how many requests
 * of this class do we let run at once", which is a number this file can defend.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE ADMISSION GATE, WHEN THE POOL ALREADY QUEUES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A pool queue is unbounded and invisible. The 200th queued search is
 * indistinguishable from the 1st until it eventually runs, 40 minutes later,
 * for a user who left. An admission gate makes the queue FINITE and makes
 * exceeding it an answer — 503 with a `Retry-After` — instead of a hang.
 *
 * `SEARCH_BUSY` is an honest state and it is not the same as an empty result.
 * `docs/CITATION_HARNESS.md` holds silent drop at zero: a search that returns
 * `[]` because the server was busy is exactly that silent drop wearing a
 * success status code.
 */
import postgres, { type Sql } from 'postgres';

import { sslFor } from './db-ssl.ts';

/** One request's peak concurrent statements in `hybridSearch` (sparse ‖ dense). */
export const RESEARCH_STATEMENTS_PER_REQUEST = 2;

/** How many research requests may be in flight at once. */
export const RESEARCH_CONCURRENCY = Number(process.env['RESEARCH_CONCURRENCY'] ?? 3);

/** Sized from the two above, never guessed: 3 × 2 = 6. */
export const RESEARCH_POOL_MAX = RESEARCH_CONCURRENCY * RESEARCH_STATEMENTS_PER_REQUEST;

export const CORE_POOL_MAX = Number(process.env['CORE_POOL_MAX'] ?? 8);

/**
 * The core statement ceiling.
 *
 * Lower than research's on purpose: nothing on the core path should take ten
 * seconds, so ten seconds is the point at which something is wrong and the
 * right response is to stop holding a connection. It is a backstop, not a
 * budget — see `env.pgStatementTimeoutMs`'s note, which this mirrors.
 */
export const CORE_STATEMENT_TIMEOUT_MS = Number(process.env['CORE_STATEMENT_TIMEOUT_MS'] ?? 10_000);

export type Pools = {
  /**
   * Everything that is not a ranker, on the CORPUS role.
   *
   * Keeps the name every route already takes. What changed 2 September 2026 is
   * that it is now one of two ROLES rather than the only handle — see
   * {@link createRolePools}.
   */
  core: Sql;
  /** Rankers only, admission-gated. Corpus role. */
  research: Sql;
  end: () => Promise<void>;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WORKLOAD SPLIT AND THE DATA-ROLE SPLIT ARE DIFFERENT AXES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything above this line divides work by COST: cheap indexed statements get
 * their own queue so a burst of rankers cannot starve a sign-in. That split is
 * unchanged and still correct.
 *
 * This one divides data by OWNERSHIP: published law on one database, an
 * advocate's matters on another, so a corpus rollback cannot reach the matters.
 * `db-roles.ts` says which table is which and `db-split.ts` resolves the two
 * URLs.
 *
 * **They compose rather than replace.** The corpus role keeps both queues,
 * because that is where the rankers run. The user role needs one: nothing on it
 * is a ranker, every statement is a short indexed read or write, and giving it a
 * second queue would be sizing for a workload that does not exist.
 *
 * ── WHY THE THREE POOLS ARE NOT RESIZED WHEN THE ROLES SHARE A DATABASE ─────
 *
 * In `single` mode all three point at one database and the connection count
 * rises from 14 to 14 + `USER_POOL_MAX`. That is deliberate: a pool whose size
 * changes with an unrelated configuration flag is a pool nobody can reason
 * about, and the numbers here are defended in the header above as "how many can
 * one request need times how many of this class run at once", which does not
 * change because two URLs happen to be equal. 22 against `max_connections = 100`
 * with the ingest fleet holding 16 is comfortably inside.
 */
export const USER_POOL_MAX = Number(process.env['USER_POOL_MAX'] ?? 8);

/**
 * better-auth's pool. Magic-link sign-in and verification only — every other
 * request authenticates from a signed access token without touching it.
 */
export const AUTH_POOL_MAX = Number(process.env['AUTH_POOL_MAX'] ?? 2);

export type RolePools = {
  /** Published law and everything derived from it. Two queues: core and research. */
  corpus: Pools;
  /** An advocate's own work. One queue — nothing here is a ranker. */
  user: Sql;
  /**
   * The USER database, for `createAuth` and nothing else.
   *
   * ── WHY BETTER-AUTH CANNOT SHARE `user` (LCC R30) ─────────────────────────
   *
   * `createAuth` wraps its client in `drizzle(...)`, and drizzle-orm's
   * postgres-js driver REPLACES that client's json (114) and jsonb (3802)
   * serializers with an identity function, because drizzle stringifies JSON
   * itself. Handed `user`, it silently changed what every raw `sql.json(obj)`
   * on the user pool sends: the object reached postgres.js's `Bind` unencoded
   * and threw `ERR_INVALID_ARG_TYPE`. That was all six R16 creates — and the
   * unkeyed `POST /matters` — answering 500 on the Galaxy S24, while every
   * suite built its app with `auth: null` and stayed green.
   *
   * A client drizzle has touched is drizzle's. `jsonSerializerDefects` below is
   * the startup check that keeps it that way.
   */
  auth: Sql;
  end: () => Promise<void>;
};

export function createRolePools(
  corpusUrl: string,
  userUrl: string,
  researchStatementTimeoutMs: number,
): RolePools {
  const corpus = createPools(corpusUrl, researchStatementTimeoutMs);
  const userOptions = {
    ssl: sslFor(userUrl),
    connection: {
      idle_in_transaction_session_timeout: 30_000,
      statement_timeout: CORE_STATEMENT_TIMEOUT_MS,
    },
  };
  const user = postgres(userUrl, { ...userOptions, max: USER_POOL_MAX });
  const auth = postgres(userUrl, { ...userOptions, max: AUTH_POOL_MAX });
  return {
    corpus,
    user,
    auth,
    end: async () => {
      await Promise.all([corpus.end(), user.end(), auth.end()]);
    },
  };
}

/**
 * The roles whose json/jsonb serializer no longer encodes an object — empty when
 * every handle is stock.
 *
 * Checked by calling the serializer, not by comparing it to a reference: what
 * matters is what `sql.json(obj)` will put on the wire, and an identity function
 * returns the object itself.
 */
export function jsonSerializerDefects(handles: Record<string, Sql>): string[] {
  const probe = { r30: [1] };
  const expected = JSON.stringify(probe);
  const defects: string[] = [];
  for (const [role, sql] of Object.entries(handles)) {
    const serializers = sql.options.serializers as Record<number, (x: unknown) => unknown>;
    for (const oid of [114, 3802]) {
      if (serializers[oid]?.(probe) !== expected) defects.push(`${role}:${oid}`);
    }
  }
  return defects;
}

export function createPools(url: string, researchStatementTimeoutMs: number): Pools {
  const shared = {
    ssl: sslFor(url),
    connection: {
      /**
       * The second half of "a request cannot monopolize Postgres". A statement
       * timeout cancels a RUNNING statement; a connection that opened a
       * transaction and then stopped being driven holds its locks forever and
       * no statement timeout ever fires.
       */
      idle_in_transaction_session_timeout: 30_000,
    },
  };

  const core = postgres(url, {
    ...shared,
    max: CORE_POOL_MAX,
    connection: { ...shared.connection, statement_timeout: CORE_STATEMENT_TIMEOUT_MS },
  });

  const research = postgres(url, {
    ...shared,
    max: RESEARCH_POOL_MAX,
    connection: { ...shared.connection, statement_timeout: researchStatementTimeoutMs },
  });

  return {
    core,
    research,
    end: async () => {
      await Promise.all([core.end(), research.end()]);
    },
  };
}
