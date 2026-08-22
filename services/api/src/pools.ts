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
  /** Everything that is not a ranker. */
  core: Sql;
  /** Rankers only, admission-gated. */
  research: Sql;
  end: () => Promise<void>;
};

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
