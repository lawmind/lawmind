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
  /** The CORPUS role; defaults to `sql` so single-database use is unchanged. */
  corpusSql: Sql = sql,
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

  /**
   * `overruled_status` lives on `judgments` and is reached through
   * `judgment_id_matched` — never taken from `overruled_status_shown`, which is
   * what was RENDERED, not what is true now. This monitor reports the CURRENT
   * corpus state, and that rule is unchanged.
   *
   * What changed is that `citation_checks` is user-owned and `judgments` is
   * corpus-owned (NEW3 R20, `SOFT_CORPUS_REFERENCE`), so the aggregate is done
   * in two steps: the matched ids from the user role, then ONE grouped count
   * over exactly those ids from the corpus role.
   *
   * An `INNER JOIN` is preserved in meaning: an id the active corpus generation
   * does not carry contributes to no bucket, exactly as a non-matching join row
   * did. It is not silently counted as `none`, which would report a judgment
   * this release cannot see as good law.
   */
/**
   * **The unit of this count is a CHECK ROW, not a judgment**, and keeping that
   * right is the whole difficulty of moving the aggregate across the boundary.
   * The join it replaces counted one row per `citation_checks` row; grouping the
   * corpus side instead would count each judgment once and quietly report a
   * smaller, different number that still looks like a plausible monitor.
   *
   * So the user side keeps its per-row grain and carries a count per matched
   * judgment; the corpus side supplies the status for those ids; the sum happens
   * here.
   */
  const perJudgment = await sql<{ judgment_id_matched: string; n: number }[]>`
    SELECT cc.judgment_id_matched, count(*)::int AS n
      FROM citation_checks cc
     WHERE cc.judgment_id_matched IS NOT NULL ${range}
     GROUP BY cc.judgment_id_matched`;
  const matchedIds = perJudgment.map((r) => r.judgment_id_matched);

  const statusOf = new Map<string, string>();
  if (matchedIds.length > 0) {
    for (const j of await corpusSql<{ id: string; overruled_status: string }[]>`
      SELECT j.id, j.overruled_status::text AS overruled_status
        FROM judgments j WHERE j.id = ANY(${matchedIds}::uuid[])`) {
      statusOf.set(j.id, j.overruled_status);
    }
  }

  const checksPerStatus = new Map<string, number>();
  for (const r of perJudgment) {
    const status = statusOf.get(r.judgment_id_matched);
    // An id the active corpus generation does not carry contributes to no
    // bucket, exactly as a non-matching INNER JOIN row did. It is NOT counted as
    // `none`, which would report a judgment this release cannot see as good law.
    if (status === undefined) continue;
    checksPerStatus.set(status, (checksPerStatus.get(status) ?? 0) + r.n);
  }
  const byOverruledStatus = [...checksPerStatus].map(([overruled_status, n]) => ({
    overruled_status,
    n,
  }));

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
