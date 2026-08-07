/**
 * Cause-list sync outcomes, and the escalation that keeps an unconfirmed date
 * from being presented as a confirmed one.
 *
 * The policy is fixed by `docs/SCHEMA_TRUTH.md` and `sprints/SPRINT_3.md` and is
 * implemented literally: **retry once → mark affected briefings
 * `dates_not_confirmed` → notify affected advocates.** This module owns the first
 * two. Notification is S3's, and its absence is visible in the admin rather than
 * assumed away — `escalated_at` is what a human acts on today.
 *
 * The rule underneath it: an outage is survivable, a silent stale date is not. A
 * briefing that says "we could not confirm tomorrow's listing" sends the advocate
 * to check; a briefing that shows last week's date as though it were today's
 * sends them to the wrong court on the wrong day.
 */
import type { Sql } from 'postgres';

import type { CauseListResult } from './ecourts.ts';

export type SyncRow = {
  id: string;
  court: string;
  list_date: string;
  status: 'ok' | 'empty' | 'stale' | 'failed';
  item_count: number;
  retry_count: number;
  escalated_at: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
};

/**
 * Write the outcome of one court-day pull.
 *
 * Upserts on (court, list_date) — the sweep is idempotent and a retry must update
 * the day's row rather than growing a second one. `retry_count` increments on
 * every write after the first, which is what the escalation counts against.
 */
export async function recordSync(
  sql: Sql,
  court: string,
  listDate: string,
  result: CauseListResult,
): Promise<SyncRow> {
  const itemCount = result.status === 'ok' ? result.items.length : 0;
  const error = result.status === 'failed' ? result.error : null;

  const [row] = await sql<SyncRow[]>`
    INSERT INTO cause_list_syncs (court, list_date, status, item_count, completed_at, error)
    VALUES (${court}, ${listDate}, ${result.status}, ${itemCount}, now(), ${error})
    ON CONFLICT (court, list_date) DO UPDATE SET
      status       = excluded.status,
      item_count   = excluded.item_count,
      completed_at = excluded.completed_at,
      error        = excluded.error,
      retry_count  = cause_list_syncs.retry_count + 1
    RETURNING id, court, list_date::text AS list_date, status, item_count, retry_count,
              escalated_at::text AS escalated_at, error,
              started_at::text AS started_at, completed_at::text AS completed_at
  `;
  if (!row) throw new Error('cause_list_syncs upsert returned no row');
  return row;
}

/**
 * Mark every briefing that depended on this court-day as unconfirmed.
 *
 * **Only briefings whose date came from a cause list.** A date the advocate typed
 * is a first-class source (PD-12) and a scraper outage says nothing about it —
 * marking those unconfirmed would teach advocates that the mark means "our
 * scraper is unhappy" rather than "check this date", and a warning that cries
 * wolf is worse than none.
 *
 * `dates_confirmed_at` is cleared in the same statement, because a briefing
 * cannot be both, and the check constraint would reject the row otherwise.
 */
export async function markDatesNotConfirmed(
  sql: Sql,
  court: string,
  listDate: string,
  reason: string,
): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE briefings SET
      dates_not_confirmed_at     = now(),
      dates_not_confirmed_reason = ${reason},
      dates_confirmed_at         = NULL
    WHERE hearing_date = ${listDate}::date
      AND hearing_date_source = 'cause_list'
      AND matter_id IN (SELECT id FROM matters WHERE court = ${court})
    RETURNING id
  `;
  return rows.length;
}

/**
 * The fixed escalation, applied to one sync row.
 *
 * `ok` and `empty` both mean we heard from the court, so both confirm the day —
 * **a court that publishes no listings has told us something**, and treating that
 * as a failure would escalate on every genuinely quiet Tuesday until nobody reads
 * the escalations.
 *
 * `failed` and `stale` mean we did not hear. The first attempt is left alone for
 * a retry; from the second, the briefings are marked and the row is escalated.
 * Retry once, then stop pretending.
 */
export async function escalate(sql: Sql, row: SyncRow): Promise<SyncRow> {
  if (row.status === 'ok' || row.status === 'empty') return row;
  if (row.retry_count < 1) return row;

  const affected = await markDatesNotConfirmed(
    sql,
    row.court,
    row.list_date,
    row.error ?? `cause list ${row.status} for ${row.court} on ${row.list_date}`,
  );

  const [updated] = await sql<SyncRow[]>`
    UPDATE cause_list_syncs SET escalated_at = now()
    WHERE id = ${row.id} AND escalated_at IS NULL
    RETURNING id, court, list_date::text AS list_date, status, item_count, retry_count,
              escalated_at::text AS escalated_at, error,
              started_at::text AS started_at, completed_at::text AS completed_at
  `;
  // Already escalated is not an error — the sweep is idempotent, and re-running it
  // must not reset a mark a human is already acting on.
  void affected;
  return updated ?? row;
}
