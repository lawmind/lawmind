/**
 * Where a licensed harvest puts what it fetched, and how it remembers what it
 * still owes.
 *
 * Three jobs, one module, because they are three views of one fact — a request
 * was made, it cost something, and it was for a reason:
 *
 *  1. **The archive.** The raw response, content-hashed, immutable.
 *  2. **The ledger.** Every request including the refusals, so *"did we stay
 *     inside the licence"* is a `SELECT` rather than a recollection.
 *  3. **The queue.** Resumable and de-duplicated, because the same document
 *     fetched twice is money spent on nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ARCHIVE IS THE ASSET
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/HARVEST_ENGINE.md` §1. The licence is perpetual on what we **ingest**,
 * not on what we understood at the time. So the body is stored whole and parsed
 * later, from the archive, as many times as we like. **A parser bug is then a
 * re-run rather than a repurchase**, and during the licence window that turns
 * "get the parser right" from a blocker into a follow-up.
 */
import { createHash } from 'node:crypto';

import type { Sql } from 'postgres';

export type Outcome = 'ok' | 'refused' | 'error';

export type FetchRecord = {
  source: string;
  url: string;
  method?: string | undefined;
  outcome: Outcome;
  httpStatus?: number | undefined;
  durationMs?: number | undefined;
  refusalReason?: string | undefined;
  /** Paise. **Undefined, never 0**, where the source is not per-request priced. */
  costPaise?: number | undefined;
  body?: string | undefined;
  accountLabel?: string | undefined;
  workItemKey?: string | undefined;
};

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Write one fetch. **Called for every request, including the ones we refused to
 * send** — a ledger with gaps proves nothing about the gaps, which is the same
 * reasoning `court/guard.ts` records for the eCourts ledger.
 *
 * The hash and byte count are derived here rather than taken from the caller,
 * so a caller cannot record a body it did not actually store.
 */
export async function recordFetch(sql: Sql, r: FetchRecord): Promise<string> {
  const body = r.outcome === 'refused' ? null : (r.body ?? null);
  const hash = body === null ? null : sha256(body);
  const bytes = body === null ? null : Buffer.byteLength(body, 'utf8');

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO harvest_fetches
      (source, url, method, outcome, http_status, duration_ms, refusal_reason,
       cost_paise, body, body_sha256, bytes, account_label, work_item_key)
    VALUES (
      ${r.source}, ${r.url}, ${r.method ?? 'GET'}, ${r.outcome},
      -- A refusal never reached the network, so it has no status. The check
      -- constraint enforces this too; sending null here means the constraint
      -- never has to fire.
      ${r.outcome === 'refused' ? null : (r.httpStatus ?? null)},
      ${r.durationMs ?? null}, ${r.refusalReason ?? null},
      ${r.costPaise ?? null}, ${body}, ${hash}, ${bytes},
      ${r.accountLabel ?? null}, ${r.workItemKey ?? null}
    )
    RETURNING id
  `;
  return row!.id;
}

/**
 * Have we already got this? Asked **before** spending, never after.
 *
 * Keyed on the work item rather than the URL: the same judgment may be reachable
 * by several routes, and paying twice because we asked in two different ways is
 * the failure this exists to prevent.
 */
export async function alreadyFetched(
  sql: Sql,
  source: string,
  workItemKey: string,
): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM harvest_fetches
     WHERE source = ${source} AND work_item_key = ${workItemKey} AND outcome = 'ok'`;
  return (row?.n ?? 0) > 0;
}

export type QueueItem = {
  source: string;
  itemKey: string;
  citation?: string | undefined;
  priority?: number | undefined;
};

/**
 * Add work. **Idempotent by (source, item_key)** — the unique index is the
 * de-duplication guarantee, and `ON CONFLICT DO NOTHING` means enqueueing the
 * same worklist twice is a no-op rather than a double spend.
 *
 * Returns how many rows were genuinely new, which is the number an operator
 * actually wants: "I added 38,341 and 12 were new" is a different day from
 * "I added 38,341".
 */
export async function enqueue(sql: Sql, items: readonly QueueItem[]): Promise<number> {
  if (items.length === 0) return 0;
  let added = 0;
  // One statement per item rather than a multi-row VALUES: the worklist is
  // built once, the cost is irrelevant beside a network fetch, and per-row
  // conflict counting is what makes the return value truthful.
  for (const item of items) {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO harvest_queue (source, item_key, citation, priority)
      VALUES (${item.source}, ${item.itemKey}, ${item.citation ?? null}, ${item.priority ?? 100})
      ON CONFLICT (source, item_key) DO NOTHING
      RETURNING id
    `;
    added += rows.length;
  }
  return added;
}

export type Claimed = { id: string; itemKey: string; citation: string | null };

/**
 * Take the next item, atomically.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes more than one worker safe: two workers
 * never claim the same row, and neither waits for the other. It costs nothing
 * with a single worker and means the second one needs no new code.
 */
export async function claimNext(sql: Sql, source: string): Promise<Claimed | null> {
  const [row] = await sql<{ id: string; item_key: string; citation: string | null }[]>`
    UPDATE harvest_queue SET state = 'in_flight', claimed_at = now(), attempts = attempts + 1
     WHERE id = (
       SELECT id FROM harvest_queue
        WHERE source = ${source} AND state = 'pending'
        ORDER BY priority, created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, item_key, citation
  `;
  return row ? { id: row.id, itemKey: row.item_key, citation: row.citation } : null;
}

export async function complete(sql: Sql, id: string): Promise<void> {
  await sql`UPDATE harvest_queue SET state = 'done', completed_at = now() WHERE id = ${id}`;
}

/**
 * Fail an item **with a reason, always**. The constraint requires one, and the
 * reason is the point: an item that failed silently is one nobody will ever
 * look at again.
 */
export async function fail(sql: Sql, id: string, reason: string): Promise<void> {
  await sql`
    UPDATE harvest_queue SET state = 'failed', last_error = ${reason.slice(0, 2000)}
     WHERE id = ${id}`;
}

/**
 * Return items a crashed worker never released.
 *
 * A claim is a timestamp rather than a boolean precisely so this is possible:
 * anything in flight longer than a run could plausibly take is orphaned, and
 * without this the queue would slowly bleed items to processes that died.
 */
export async function releaseStaleClaims(sql: Sql, source: string, olderThanMinutes = 30) {
  const [row] = await sql<{ n: number }[]>`
    WITH released AS (
      UPDATE harvest_queue
         SET state = 'pending', claimed_at = NULL
       WHERE source = ${source}
         AND state = 'in_flight'
         AND claimed_at < now() - make_interval(mins => ${olderThanMinutes})
      RETURNING id
    )
    SELECT count(*)::int AS n FROM released`;
  return row?.n ?? 0;
}

export type Progress = {
  pending: number;
  inFlight: number;
  done: number;
  failed: number;
  skipped: number;
  spentPaise: number;
  fetches: number;
};

/**
 * Where the run is — and what it has cost.
 *
 * `spentPaise` comes from the ledger rather than from a counter held in memory,
 * so it survives a restart and cannot drift from what was actually recorded.
 * The number that decides how many months of licence to commit to should be a
 * `SELECT`, not a variable.
 */
export async function progress(sql: Sql, source: string): Promise<Progress> {
  const [q] = await sql<
    { pending: number; in_flight: number; done: number; failed: number; skipped: number }[]
  >`
    SELECT count(*) FILTER (WHERE state = 'pending')::int   AS pending,
           count(*) FILTER (WHERE state = 'in_flight')::int AS in_flight,
           count(*) FILTER (WHERE state = 'done')::int      AS done,
           count(*) FILTER (WHERE state = 'failed')::int    AS failed,
           count(*) FILTER (WHERE state = 'skipped')::int   AS skipped
      FROM harvest_queue WHERE source = ${source}`;

  const [f] = await sql<{ spent: number; fetches: number }[]>`
    SELECT coalesce(sum(cost_paise), 0)::int AS spent, count(*)::int AS fetches
      FROM harvest_fetches WHERE source = ${source}`;

  return {
    pending: q?.pending ?? 0,
    inFlight: q?.in_flight ?? 0,
    done: q?.done ?? 0,
    failed: q?.failed ?? 0,
    skipped: q?.skipped ?? 0,
    spentPaise: f?.spent ?? 0,
    fetches: f?.fetches ?? 0,
  };
}
