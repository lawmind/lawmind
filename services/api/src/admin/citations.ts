/**
 * The citation monitor — production aggregates of the metrics
 * `docs/CITATION_HARNESS.md` gates a release on, computed from
 * `citation_checks` rather than the fixed 30-query harness set.
 *
 * `failureRate` and `silentDropRate` read `docs/SCHEMA_TRUTH.md#citation_checks`
 * literally: *"`shown_to_user` measures silent-drop rate. A stripped citation
 * with no unverified state shown is a harness failure."* `silentDropRate` is
 * therefore rows where `shown_to_user = false` — a citation the pipeline
 * extracted and then never told the advocate about, in ANY state — divided by
 * every row attempted. It is not the same population as `failureRate`, which
 * counts rows that WERE shown but as `unverified`/`failed`.
 *
 * `falseVerifiedRate` is `admin/disputes.ts`'s formula, imported rather than
 * reimplemented — one number, one query, so this surface and the disputes list
 * cannot drift onto two different definitions of the same rate.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { falseVerifiedRate } from './disputes.ts';

export const citationsMonitorQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function getCitationsMonitor(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  query: z.infer<typeof citationsMonitorQuery>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'the citation monitor is a privileged surface', 401);

  const range = sql`
    ${query.from ? sql`AND cc.created_at >= (${query.from}::text)::timestamptz` : sql``}
    ${query.to ? sql`AND cc.created_at <= (${query.to}::text)::timestamptz` : sql``}
  `;

  const [totals] = await sql<{ n: number; shown: number }[]>`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE shown_to_user = true)::int AS shown
    FROM citation_checks cc WHERE true ${range}`;
  const total = totals?.n ?? 0;
  const shown = totals?.shown ?? 0;

  const byVerificationState = await sql<{ verification_state: string; n: number }[]>`
    SELECT verification_state, count(*)::int AS n
    FROM citation_checks cc WHERE true ${range}
    GROUP BY verification_state`;

  // `overruled_status` lives on `judgments`, joined via judgment_id_matched —
  // never taken from `overruled_status_shown`, which is what was RENDERED, not
  // what is true now. This monitor reports the CURRENT corpus state.
  const byOverruledStatus = await sql<{ overruled_status: string; n: number }[]>`
    SELECT j.overruled_status, count(*)::int AS n
    FROM citation_checks cc
    JOIN judgments j ON j.id = cc.judgment_id_matched
    WHERE true ${range}
    GROUP BY j.overruled_status`;

  const failed = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM citation_checks cc
    WHERE verification_state IN ('unverified', 'failed') ${range}`;

  return ok(c, {
    total,
    byVerificationState: Object.fromEntries(
      byVerificationState.map((r) => [r.verification_state, r.n]),
    ),
    byOverruledStatus: Object.fromEntries(byOverruledStatus.map((r) => [r.overruled_status, r.n])),
    // Both null-safe against total = 0 — an empty range is a fact, not a
    // divide-by-zero to paper over with a fabricated 0%.
    failureRate: total > 0 ? (failed[0]?.n ?? 0) / total : null,
    silentDropRate: total > 0 ? (total - shown) / total : null,
    falseVerifiedRate: await falseVerifiedRate(sql),
  });
}
