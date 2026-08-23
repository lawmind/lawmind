/**
 * Generation costs money, so a repeated tap must not buy the work twice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS IS SHAPED AGAINST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An advocate on Indian mobile data taps "generate hearing pack". Nothing
 * happens for eight seconds, so they tap again. That is not abuse and it is not
 * an edge case — it is the ordinary behaviour of every user of every app on a
 * slow connection, and it must not produce two of anything: two jobs, two credit
 * redemptions, two model bills, or two packs the advocate then has to choose
 * between.
 *
 * Three separate guards, because they catch different mistakes:
 *
 *   `idempotency_key`   the client says "this is the same tap". Unique per user.
 *   `params_hash`       the server says "this is the same work", even under a
 *                       different key — a reinstalled app generating fresh keys
 *                       must not re-buy what it already has.
 *   credit redemption   tied to the job id, so a retry cannot spend twice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS ENFORCED HERE AND WHAT IS ENFORCED BY THE DATABASE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything that must survive concurrency is a unique index in `0077`, not a
 * check in this file. Two simultaneous requests both pass any check written in
 * TypeScript; only one of them survives `premium_jobs_idempotency_uq`. What this
 * module adds on top is the things an index cannot express: the per-user
 * concurrency cap, the global queue cap, the retry ceiling, and cancellation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CAPS ARE REFUSALS, NOT QUEUES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * When a cap is hit the request is REFUSED with a reason, never silently
 * enqueued behind an unknown wait. A queue an advocate cannot see is worse than
 * a refusal they can act on, and an unbounded queue in front of a paid model is
 * how one bad afternoon becomes a bill nobody authorised.
 */
import { createHash } from 'node:crypto';

import type { Sql } from 'postgres';

import type { Capability } from '../entitlements/capabilities.ts';
import { isoColumn } from '../iso-time.ts';

/**
 * How many jobs one advocate may have in flight.
 *
 * Two, not one: a hearing pack for tomorrow and a counter-argument for a
 * different matter are legitimately concurrent, and one is a cap an ordinary
 * working day trips over. Not ten: each is minutes of model time on somebody
 * else's bill.
 */
export const MAX_LIVE_JOBS_PER_USER = 2;

/**
 * The whole-system ceiling. Deliberately low while nothing is activated, and
 * deliberately a NUMBER IN CODE rather than an env var: raising it should be a
 * reviewed change, because the thing it bounds is money.
 */
export const MAX_LIVE_JOBS_GLOBAL = 20;

/** A job that has not heartbeat in this long is STALLED, not running. */
export const HEARTBEAT_STALE_MS = 5 * 60_000;

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type PremiumJob = {
  readonly id: string;
  readonly userId: string;
  readonly capability: Capability;
  readonly state: JobState;
  readonly matterId: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly costUsd: number;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly errorFamily: string | null;
};

type Row = {
  id: string;
  user_id: string;
  capability: string;
  state: JobState;
  matter_id: string | null;
  attempts: number;
  max_attempts: number;
  cost_usd: string;
  created_at: string;
  finished_at: string | null;
  error_family: string | null;
};

const shape = (r: Row): PremiumJob => ({
  id: r.id,
  userId: r.user_id,
  capability: r.capability as Capability,
  state: r.state,
  matterId: r.matter_id,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  costUsd: Number(r.cost_usd),
  createdAt: r.created_at,
  finishedAt: r.finished_at,
  errorFamily: r.error_family,
});

/**
 * Casting the MONEY column to text is deliberate; casting a timestamp would not be.
 *
 * A numeric goes to text so a fixed-point value never becomes a float in
 * JavaScript. A timestamp cast the same way arrives as
 * "2026-08-23 04:12:09.11+00", which Hermes parses as Invalid Date — so the two
 * `_at` columns go through `isoColumn`. The guard in `iso-time.test.ts` caught
 * exactly this here, and it greps the source text, so this note deliberately
 * does not spell out the pattern it is looking for.
 */
const COLUMNS =
  'id, user_id, capability, state, matter_id, attempts, max_attempts, ' +
  'cost_usd::text AS cost_usd, ' +
  `${isoColumn('created_at')} AS created_at, ` +
  `${isoColumn('finished_at')} AS finished_at, error_family`;

/**
 * The server's own "is this the same work" fingerprint.
 *
 * Sorted keys, so a client that serialises its parameters in a different order
 * does not buy the same pack twice. It hashes the PARAMETERS, never the matter
 * contents — a hash of privileged text stored in a jobs table is privileged text
 * stored in a jobs table.
 */
export function paramsHash(capability: Capability, params: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))),
  );
  return createHash('sha256').update(`${capability}:${canonical}`).digest('hex');
}

export type StartRefusal =
  | { readonly ok: false; readonly reason: string; readonly code: 'USER_CAP' | 'GLOBAL_CAP' };

export type StartResult =
  | { readonly ok: true; readonly job: PremiumJob; readonly created: boolean }
  | StartRefusal;

/**
 * Create the job, or return the one that already exists.
 *
 * `created: false` is the normal, healthy answer to a second tap — the caller
 * returns the existing job and the user sees one pack being made. It is not an
 * error and must not be rendered as one.
 *
 * The caps are checked INSIDE the transaction, after the advisory lock, because
 * a cap checked outside is a cap two simultaneous requests both pass.
 */
export async function startJob(
  sql: Sql,
  input: {
    userId: string;
    capability: Capability;
    idempotencyKey: string;
    params: Record<string, unknown>;
    matterId?: string | null;
    maxAttempts?: number;
  },
): Promise<StartResult> {
  const hash = paramsHash(input.capability, input.params);

  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'premium-job:' + input.userId}))`;

    // Same tap, or same work already in flight. Either is the existing job.
    const [existing] = await tx<Row[]>`
      SELECT ${tx.unsafe(COLUMNS)} FROM premium_jobs
       WHERE user_id = ${input.userId}
         AND (idempotency_key = ${input.idempotencyKey}
              OR (params_hash = ${hash} AND capability = ${input.capability}
                  AND state IN ('queued', 'running')))
       ORDER BY created_at ASC LIMIT 1`;
    if (existing) return { ok: true as const, job: shape(existing), created: false };

    const [live] = await tx<{ n: string }[]>`
      SELECT count(*)::text AS n FROM premium_jobs
       WHERE user_id = ${input.userId} AND state IN ('queued', 'running')`;
    if (Number(live!.n) >= MAX_LIVE_JOBS_PER_USER) {
      return {
        ok: false as const,
        code: 'USER_CAP' as const,
        reason:
          `${MAX_LIVE_JOBS_PER_USER} generations are already running for this account. ` +
          'Refused rather than queued: a wait an advocate cannot see is worse than a ' +
          'refusal they can act on.',
      };
    }

    const [global] = await tx<{ n: string }[]>`
      SELECT count(*)::text AS n FROM premium_jobs WHERE state IN ('queued', 'running')`;
    if (Number(global!.n) >= MAX_LIVE_JOBS_GLOBAL) {
      return {
        ok: false as const,
        code: 'GLOBAL_CAP' as const,
        reason:
          'The generation queue is at its system-wide ceiling. This is a deliberate cost ' +
          'bound, not an outage; the request was not charged and can be retried.',
      };
    }

    const [row] = await tx<Row[]>`
      INSERT INTO premium_jobs
        (user_id, capability, idempotency_key, params_hash, matter_id, max_attempts)
      VALUES (${input.userId}, ${input.capability}, ${input.idempotencyKey}, ${hash},
              ${input.matterId ?? null}, ${input.maxAttempts ?? 3})
      RETURNING ${tx.unsafe(COLUMNS)}`;
    return { ok: true as const, job: shape(row!), created: true };
  });
}

/**
 * Claim a queued job for a worker.
 *
 * `FOR UPDATE SKIP LOCKED` so two workers never take the same job, and the
 * attempt counter increments HERE rather than on completion — a job that dies
 * mid-run must still have consumed an attempt, or a crash loop retries forever
 * against a provider that bills for every one.
 */
export async function claimJob(sql: Sql, jobId: string): Promise<PremiumJob | null> {
  const [row] = await sql<Row[]>`
    UPDATE premium_jobs SET state = 'running', started_at = COALESCE(started_at, now()),
           heartbeat_at = now(), attempts = attempts + 1
     WHERE id = (SELECT id FROM premium_jobs
                  WHERE id = ${jobId} AND state = 'queued'
                    AND attempts < max_attempts
                  FOR UPDATE SKIP LOCKED)
    RETURNING ${sql.unsafe(COLUMNS)}`;
  return row ? shape(row) : null;
}

/** A worker saying it is still alive. Silence, not exit, is what marks a stall. */
export async function heartbeat(sql: Sql, jobId: string): Promise<void> {
  await sql`UPDATE premium_jobs SET heartbeat_at = now()
             WHERE id = ${jobId} AND state = 'running'`;
}

/**
 * Add what a model call cost to this job.
 *
 * Called after every provider call, so "what did this feature cost" is a query
 * rather than an estimate, and a job that is burning money can be seen doing it
 * rather than discovered on an invoice.
 */
export async function addCost(sql: Sql, jobId: string, costUsd: number): Promise<void> {
  await sql`UPDATE premium_jobs SET cost_usd = cost_usd + ${costUsd} WHERE id = ${jobId}`;
}

export async function finishJob(sql: Sql, jobId: string): Promise<void> {
  await sql`UPDATE premium_jobs SET state = 'succeeded', finished_at = now()
             WHERE id = ${jobId} AND state = 'running'`;
}

/**
 * Fail the job, with a FAMILY rather than only a message.
 *
 * A family can be counted; a message can only be read one at a time. "17 jobs
 * failed on `provider_timeout` today" is an operational fact that changes what
 * you do next; seventeen distinct strings are a scroll.
 *
 * Returns whether the job is EXHAUSTED — out of attempts — because that is the
 * moment a reserved credit must be given back, and the caller is the only one
 * that knows whether a credit was reserved.
 */
export async function failJob(
  sql: Sql,
  jobId: string,
  errorFamily: 'provider_timeout' | 'provider_error' | 'invalid_input' | 'internal' | 'cancelled',
  detail?: string,
): Promise<{ exhausted: boolean }> {
  const [row] = await sql<{ attempts: number; max_attempts: number }[]>`
    UPDATE premium_jobs
       SET state = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
           finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
           error_family = ${errorFamily}, error_detail = ${detail ?? null}
     WHERE id = ${jobId} AND state = 'running'
    RETURNING attempts, max_attempts`;
  if (!row) return { exhausted: false };
  return { exhausted: row.attempts >= row.max_attempts };
}

/**
 * Cancel — a real state, not a delete.
 *
 * An advocate who backs out of a generation has still spent whatever the model
 * had already consumed, and a deleted row hides that. Cancellation is refused on
 * a finished job: cancelling something that already succeeded would let a client
 * retroactively unspend a credit.
 */
export async function cancelJob(
  sql: Sql,
  jobId: string,
  userId: string,
): Promise<{ cancelled: boolean }> {
  const rows = await sql<{ id: string }[]>`
    UPDATE premium_jobs SET state = 'cancelled', cancelled_at = now(), finished_at = now()
     WHERE id = ${jobId} AND user_id = ${userId} AND state IN ('queued', 'running')
    RETURNING id`;
  return { cancelled: rows.length > 0 };
}

/**
 * Jobs whose worker went silent.
 *
 * **Silence, not exit.** A worker that exits is noticed by whatever supervises
 * it; a worker whose provider call never settles looks perfect forever, and that
 * is the failure this repository has already paid for in the ingest fleet. The
 * signal is a heartbeat that stopped, and the job goes back to `queued` so the
 * attempt ceiling still applies.
 */
export async function requeueStalled(sql: Sql, staleMs = HEARTBEAT_STALE_MS): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE premium_jobs
       SET state = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
           error_family = 'provider_timeout',
           error_detail = 'worker heartbeat stopped — requeued on silence, not on exit',
           finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
     WHERE state = 'running'
       AND heartbeat_at IS NOT NULL
       AND heartbeat_at < now() - (${staleMs}::text || ' milliseconds')::interval
    RETURNING id`;
  return rows.length;
}

export async function getJob(sql: Sql, jobId: string, userId: string): Promise<PremiumJob | null> {
  const [row] = await sql<Row[]>`
    SELECT ${sql.unsafe(COLUMNS)} FROM premium_jobs
     WHERE id = ${jobId} AND user_id = ${userId}`;
  return row ? shape(row) : null;
}

/** Model spend per capability — the "cost per premium outcome" number. */
export async function costPerOutcome(
  sql: Sql,
): Promise<{ capability: string; succeeded: number; totalUsd: number; usdPerSuccess: number }[]> {
  const rows = await sql<
    { capability: string; succeeded: string; total_usd: string }[]
  >`
    SELECT capability,
           count(*) FILTER (WHERE state = 'succeeded')::text AS succeeded,
           COALESCE(SUM(cost_usd), 0)::text AS total_usd
      FROM premium_jobs GROUP BY capability`;
  return rows.map((r) => {
    const succeeded = Number(r.succeeded);
    const totalUsd = Number(r.total_usd);
    return {
      capability: r.capability,
      succeeded,
      totalUsd,
      // Spend over SUCCESSES, not over attempts. Failed work is still spend, and
      // dividing by attempts would make a job that fails twice look cheap.
      usdPerSuccess: succeeded === 0 ? 0 : totalUsd / succeeded,
    };
  });
}
