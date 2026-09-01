/**
 * "Run this all-or-nothing, whether or not something already is."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS MOVED HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `court/guard.ts` has carried `Db` and `atomically` since the eCourts quota
 * reservation needed them, and its note gives the reason they must not be
 * duplicated: *"two copies of the limiter is two limiters, and the second one
 * always drifts."* The same is true of the transaction helper itself.
 *
 * R16's idempotency wrapper needs exactly this, and so does
 * `training/consent.ts` — a consent grant is a `users` update plus a
 * `training_consent_events` append, and it opened its own transaction long
 * before anything wrapped it. Neither has any business importing an eCourts
 * authorisation guard to get a generic helper, so the helper is here and
 * `court/guard.ts` re-exports it. No court call site changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TRAP IT EXISTS TO CLOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * postgres.js gives a TRANSACTION handle `savepoint` and NOT `begin`. So
 * `sql.begin(...)` inside code that has been handed a transaction throws
 * `sql.begin is not a function` — at runtime, on the write path, only when the
 * outer transaction exists. That is precisely the shape of failure that reaches
 * production: it typechecks, the unit test that calls the handler directly
 * passes, and only the wrapped path breaks.
 */
import type { Sql, TransactionSql } from 'postgres';

/**
 * The pool, or an open transaction. Widened deliberately: a function that is
 * only safe inside a transaction should be callable from one without being
 * reimplemented beside it.
 */
export type Db = Sql | TransactionSql;

/**
 * Run `fn` in its own atomic unit, whether or not one is already open.
 *
 * A pool gives a transaction; inside a transaction the only nested atomic unit
 * Postgres offers is a savepoint. Callers that must be all-or-nothing should not
 * have to know which they were handed, and a test that wraps the world in a
 * rolled-back transaction should not silently lose that guarantee.
 */
export async function atomically<T>(sql: Db, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  const run = 'begin' in sql ? sql.begin.bind(sql) : sql.savepoint.bind(sql);
  return (await run((tx: TransactionSql) => fn(tx))) as unknown as T;
}
