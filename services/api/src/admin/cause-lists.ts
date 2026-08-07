/**
 * Cause list sync health — `docs/ADMIN_SURFACE.md` §14, shapes from
 * `docs/API_CONTRACTS.md` §Cause list sync.
 *
 * Every briefing is built from a cause list, and **a parser that silently returns
 * an empty list is worse than an outage**, because briefings still go out with
 * stale dates. This is the surface where a human sees that happening.
 *
 * The read endpoint is open; the two privileged ones are not. `retry` and
 * `escalate` change what advocates receive, and there is no authentication in this
 * service yet — auth is A2/S5. An anonymous caller able to escalate could mark
 * every briefing in the system unconfirmed, which is a denial of the product
 * dressed as a safety feature. They answer honestly with 401 rather than being
 * left open, exactly as `POST /verify/confirm` does.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fetchCauseList } from '../court/ecourts.ts';
import { escalate, markDatesNotConfirmed, recordSync, type SyncRow } from '../court/sync.ts';
import { fail, ok } from '../envelope.ts';

/** The admin view is about what is wrong now; an unfiltered read shows the week. */
const DEFAULT_WINDOW_DAYS = 7;

export const causeListQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  court: z.string().min(1).max(100).optional(),
  status: z.enum(['ok', 'empty', 'stale', 'failed']).optional(),
});

export const escalateBody = z.object({
  notifyAdvocates: z.boolean(),
});

const shape = (row: SyncRow) => ({
  id: row.id,
  court: row.court,
  listDate: row.list_date,
  status: row.status,
  itemCount: row.item_count,
  retryCount: row.retry_count,
  escalatedAt: row.escalated_at,
  error: row.error,
  startedAt: row.started_at,
  completedAt: row.completed_at,
});

async function findSync(sql: Sql, id: string): Promise<SyncRow | undefined> {
  const [row] = await sql<SyncRow[]>`
    SELECT id, court, list_date::text AS list_date, status, item_count, retry_count,
           escalated_at::text AS escalated_at, error,
           started_at::text AS started_at, completed_at::text AS completed_at
    FROM cause_list_syncs WHERE id = ${id}
  `;
  return row;
}

export async function listCauseLists(
  c: Context,
  sql: Sql,
  query: z.infer<typeof causeListQuery>,
): Promise<Response> {
  const rows = await sql<SyncRow[]>`
    SELECT id, court, list_date::text AS list_date, status, item_count, retry_count,
           escalated_at::text AS escalated_at, error,
           started_at::text AS started_at, completed_at::text AS completed_at
    FROM cause_list_syncs
    WHERE ${
      query.date
        ? sql`list_date = ${query.date}::date`
        : sql`list_date > current_date - ${DEFAULT_WINDOW_DAYS}::int`
    }
      ${query.court ? sql`AND court = ${query.court}` : sql``}
      ${query.status ? sql`AND status = ${query.status}` : sql``}
    ORDER BY list_date DESC, court ASC
  `;

  /**
   * Per-court freshness. The briefing states its as-of date, so the admin must be
   * able to say when each court was last successfully read.
   *
   * **`lastConfirmedDate: null` means never pulled, not long ago.** A court absent
   * from every sync is a different problem from a court that failed today — one is
   * a court we have never set up, the other is a court that broke — and reporting
   * both as "stale" would hide the first inside the second.
   *
   * `ok` and `empty` both count as confirmed: a court that published no listings
   * has told us something. Only `failed` and `stale` mean we did not hear.
   */
  const stale = await sql<{ court: string; last_ok: string | null; failing: number }[]>`
    SELECT court,
           max(list_date) FILTER (WHERE status IN ('ok', 'empty'))::text AS last_ok,
           count(*) FILTER (WHERE status IN ('failed', 'stale'))          AS failing
    FROM cause_list_syncs
    GROUP BY court
    HAVING max(list_date) FILTER (WHERE status IN ('ok', 'empty')) IS DISTINCT FROM current_date
    ORDER BY court ASC
  `;

  return ok(c, {
    syncs: rows.map(shape),
    staleCourts: stale.map((s) => ({
      court: s.court,
      lastConfirmedDate: s.last_ok,
      failingSyncs: Number(s.failing),
    })),
    asOf: new Date().toISOString(),
  });
}

export async function retryCauseList(
  c: Context,
  sql: Sql,
  id: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) {
    return fail(
      c,
      'AUTH_REQUIRED',
      'retrying a cause list changes what advocates receive and must be attributable; authentication ships in S5',
      401,
    );
  }

  const row = await findSync(sql, id);
  if (!row) return fail(c, 'NOT_FOUND', 'no cause list sync with that id', 404);

  // Goes through the guard like every other request. A retry from the admin is
  // not a privileged path to the network — with the switch off it is refused and
  // the refusal is written to the ledger, same as any other attempt.
  const result = await fetchCauseList(sql, row.court);
  const updated = await recordSync(sql, row.court, row.list_date, result);
  const escalated = await escalate(sql, updated);

  return ok(c, { sync: shape(escalated) });
}

export async function escalateCauseList(
  c: Context,
  sql: Sql,
  id: string,
  userId: string | undefined,
  body: z.infer<typeof escalateBody>,
): Promise<Response> {
  if (!userId) {
    return fail(
      c,
      'AUTH_REQUIRED',
      'escalating marks advocates’ briefings unconfirmed and must be attributable; authentication ships in S5',
      401,
    );
  }

  const row = await findSync(sql, id);
  if (!row) return fail(c, 'NOT_FOUND', 'no cause list sync with that id', 404);

  if (row.status === 'ok' || row.status === 'empty') {
    // Refused rather than obeyed. Both statuses mean the court told us something,
    // and marking those briefings unconfirmed would teach advocates that the mark
    // means "somebody clicked a button" rather than "check this date".
    return fail(
      c,
      'NOTHING_TO_ESCALATE',
      `this sync is '${row.status}' — the court was heard from, so its dates are confirmed`,
      409,
    );
  }

  const briefingsMarked = await markDatesNotConfirmed(
    sql,
    row.court,
    row.list_date,
    row.error ?? `escalated by hand: cause list ${row.status} for ${row.court} on ${row.list_date}`,
  );

  const [updated] = await sql<SyncRow[]>`
    UPDATE cause_list_syncs SET escalated_at = coalesce(escalated_at, now())
    WHERE id = ${id}
    RETURNING id, court, list_date::text AS list_date, status, item_count, retry_count,
              escalated_at::text AS escalated_at, error,
              started_at::text AS started_at, completed_at::text AS completed_at
  `;

  /**
   * **`advocatesNotified` is false because nobody was told.**
   *
   * The third step of the fixed escalation — notify affected advocates directly —
   * is S3's, and delivery does not exist. `notifyAdvocates: true` is accepted and
   * recorded as requested, and it still returns false, because the alternative is
   * an admin who believes the calls have been made walking away from advocates
   * who are about to miss a hearing. Reporting an unsent notification as sent is
   * the same class of lie as showing an unverified citation as confirmed.
   */
  return ok(c, {
    sync: updated ? shape(updated) : shape(row),
    briefingsMarked,
    advocatesNotified: false,
    notificationNote: body.notifyAdvocates
      ? 'notification was requested but direct delivery ships with the daily loop in S3 — nobody has been told; contact them yourself'
      : 'notification was not requested',
  });
}
