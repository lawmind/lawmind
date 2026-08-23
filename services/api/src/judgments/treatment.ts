/**
 * `GET /judgments/:id/treatment` and `GET /judgments/:id/graph` —
 * `docs/API_CONTRACTS.md` §Feature-parity endpoints.
 *
 * Both read `judgment_citations`, which holds judgment-to-judgment edges
 * extracted from judgment text with the court's OWN annotation attached
 * (`docs/SCHEMA_TRUTH.md` §judgment_citations).
 *
 * **Treatment is not prediction.** These endpoints state what courts DID —
 * cites, followed, approved, distinguished, doubted, overruled,
 * overruled_in_part — every count traceable to a judgment id and every
 * relationship justified by a phrase the court printed.
 * They must never return a probability, a score or a forecast; that is the one
 * competitor feature `docs/FEATURE_PARITY.md` §4 declines, because it cannot be
 * sourced to a primary record or verified by any tier.
 *
 * `relationship` answers a DIFFERENT question from `verificationState`. A
 * judgment can be `verified` and `overruled`, or `unverified` and `followed`.
 * Every row therefore carries all three citation fields, not just the one that
 * happens to be interesting.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { dateQualityFor, isDateContradicted } from './date-quality.ts';

export const treatmentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const graphQuery = z.object({
  depth: z.coerce.number().int().min(1).max(2).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

type CitingRow = {
  judgment_id: string;
  case_title: string;
  neutral_citation: string | null;
  court: string;
  judgment_date: string;
  relationship: string;
  evidence: string | null;
  overruled_status: string;
};

async function judgmentExists(sql: Sql, id: string): Promise<boolean> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM judgments WHERE id = ${id}`;
  return Boolean(row);
}

export async function getTreatment(
  c: Context,
  sql: Sql,
  id: string,
  q: z.infer<typeof treatmentQuery>,
): Promise<Response> {
  if (!(await judgmentExists(sql, id)))
    return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  const asOf = new Date().toISOString();

  // Counts are computed over the WHOLE treatment set, never the page. A count
  // that shrank as you paginated would misstate how the law has moved.
  const counts = await sql<{ relationship: string; n: string }[]>`
    SELECT relationship, count(*)::text AS n
    FROM judgment_citations
    WHERE cited_judgment_id = ${id}
    GROUP BY relationship
  `;
  const byRelationship = Object.fromEntries(counts.map((r) => [r.relationship, Number(r.n)]));

  const offset = q.cursor ? Number(q.cursor) : 0;
  const rows = await sql<CitingRow[]>`
    SELECT j.id AS judgment_id, j.case_title, j.neutral_citation, j.court,
           j.judgment_date::text AS judgment_date,
           c.relationship, c.evidence, j.overruled_status
    FROM judgment_citations c
    JOIN judgments j ON j.id = c.citing_judgment_id
    WHERE c.cited_judgment_id = ${id}
    -- Treatments before bare references, then most recent: a bench that overruled
    -- this authority matters more than one that mentioned it in passing.
    -- overruled_in_part ranks with overruled/doubted, not with cites at the
    -- bottom -- a partial overruling IS the law moving (CITATION_HARNESS.md
    -- section "Overruled status is never cached"), not an ordinary reference.
    ORDER BY CASE c.relationship
               WHEN 'overruled' THEN 0 WHEN 'overruled_in_part' THEN 1
               WHEN 'doubted' THEN 2 WHEN 'distinguished' THEN 3
               WHEN 'followed' THEN 4 WHEN 'approved' THEN 4 ELSE 5 END,
             j.judgment_date DESC
    LIMIT ${q.limit + 1} OFFSET ${offset}
  `;

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const total = Object.values(byRelationship).reduce((t, n) => t + n, 0);

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE ORDER OF THIS LIST IS ITSELF A CLAIM
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Within a relationship band the sort is `judgment_date DESC`, and what that
   * renders to an advocate is *this is the latest word on this authority*. NEW2
   * measured 4.68% of the corpus carrying a date some independent witness
   * contradicts, so on those rows the ordering rests on a date we have reason to
   * doubt.
   *
   * The response does NOT drop or reorder them — the problem is derived legal
   * certainty, not discoverability, and a treatment list that quietly omits a
   * doubting bench is a far worse defect than one shown in the wrong position.
   * What it does is carry the state per row and say, once, whether the ordering
   * claim survives: `datesContradicted > 0` means a client must not present this
   * page as a reliable chronology. `date-quality.ts`.
   */
  const dateStates = await dateQualityFor(sql, page.map((r) => r.judgment_id));
  const datesContradicted = page.filter((r) => isDateContradicted(dateStates.get(r.judgment_id))).length;

  return ok(c, {
    judgmentId: id,
    asOf,
    counts: {
      followed: byRelationship['followed'] ?? 0,
      // Split from `followed` 11 Aug 2026, Stage 7 (`docs/ai/
      // CITATION_GRAPH_STAGE7.md`) — its own printed word, its own count. Added
      // here in the SAME commit as the split, not after, per the lesson RCC
      // bus 0035 already taught this file once: a relationship value that
      // exists in `judgment_citations` but not in this object is a gap
      // `total` hides rather than reveals.
      approved: byRelationship['approved'] ?? 0,
      distinguished: byRelationship['distinguished'] ?? 0,
      doubted: byRelationship['doubted'] ?? 0,
      overruled: byRelationship['overruled'] ?? 0,
      overruledInPart: byRelationship['overruled_in_part'] ?? 0,
      cites: byRelationship['cites'] ?? 0,
    },
    treatments: page.map((r) => ({
      judgmentId: r.judgment_id,
      caseTitle: r.case_title,
      neutralCitation: r.neutral_citation,
      court: r.court,
      judgmentDate: r.judgment_date,
      /** Four values, `null` = nothing has looked. `judgmentDate` is never rewritten. */
      dateQuality: dateStates.get(r.judgment_id) ?? null,
      relationship: r.relationship,
      // The phrase the court printed. Present only for a real treatment, so any
      // row claiming one can be audited back to its own text.
      evidence: r.evidence,
      // Tier 1 by construction — these rows ARE corpus judgments.
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      overruledStatus: r.overruled_status,
      asOf,
    })),
    total,
    returned: page.length,
    truncated: hasMore,
    /**
     * How many rows ON THIS PAGE carry a date an independent witness
     * contradicts. Counted rather than acted on: the server states the fact and
     * writes no copy (`chronologyReliable` below is the same fact as a boolean,
     * for a client that needs one bit).
     */
    datesContradicted,
    /** `false` means: do not present this page's order as a chronology. */
    chronologyReliable: datesContradicted === 0,
    nextCursor: hasMore ? String(offset + q.limit) : null,
  });
}

export async function getGraph(
  c: Context,
  sql: Sql,
  id: string,
  q: z.infer<typeof graphQuery>,
): Promise<Response> {
  if (!(await judgmentExists(sql, id)))
    return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  const asOf = new Date().toISOString();

  // Both directions: what this judgment cited, and what has cited it. A citation
  // network read one way only is half the picture — an advocate needs to know
  // both what an authority rests on and what has since been said about it.
  //
  // `truncated` is a CORRECTNESS field. A network rendered as complete when it is
  // not misstates how much law bears on the authority, so the count before
  // truncation is returned alongside, and nodes come most-connected first so a
  // truncated graph keeps the authorities that matter.
  const [totalRow] = await sql<{ n: string }[]>`
    SELECT count(DISTINCT other)::text AS n FROM (
      SELECT cited_judgment_id AS other FROM judgment_citations
        WHERE citing_judgment_id = ${id} AND cited_judgment_id IS NOT NULL
      UNION
      SELECT citing_judgment_id AS other FROM judgment_citations
        WHERE cited_judgment_id = ${id}
    ) t
  `;
  const totalNodes = Number(totalRow?.n ?? 0);

  const edges = await sql<
    { from_id: string; to_id: string; relationship: string; other: string; degree: string }[]
  >`
    WITH linked AS (
      SELECT citing_judgment_id AS from_id, cited_judgment_id AS to_id,
             relationship, cited_judgment_id AS other
      FROM judgment_citations
      WHERE citing_judgment_id = ${id} AND cited_judgment_id IS NOT NULL
      UNION ALL
      SELECT citing_judgment_id AS from_id, cited_judgment_id AS to_id,
             relationship, citing_judgment_id AS other
      FROM judgment_citations
      WHERE cited_judgment_id = ${id}
    ),
    ranked AS (
      SELECT l.*, (SELECT count(*) FROM judgment_citations x
                   WHERE x.cited_judgment_id = l.other)::text AS degree
      FROM linked l
    )
    SELECT * FROM ranked ORDER BY degree::int DESC LIMIT ${q.limit}
  `;

  const otherIds = [...new Set(edges.map((e) => e.other))];
  const nodes =
    otherIds.length === 0
      ? []
      : await sql<
          {
            id: string;
            case_title: string;
            neutral_citation: string | null;
            court: string;
            judgment_date: string;
            overruled_status: string;
          }[]
        >`
          SELECT id, case_title, neutral_citation, court,
                 judgment_date::text AS judgment_date, overruled_status
          FROM judgments WHERE id = ANY(${otherIds})
        `;

  const nodeDateStates = await dateQualityFor(sql, nodes.map((n) => n.id));

  return ok(c, {
    rootId: id,
    asOf,
    nodes: nodes.map((n) => ({
      judgmentId: n.id,
      caseTitle: n.case_title,
      neutralCitation: n.neutral_citation,
      court: n.court,
      judgmentDate: n.judgment_date,
      /** Same four values as the treatment list. Additive; nothing is hidden. */
      dateQuality: nodeDateStates.get(n.id) ?? null,
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      // Read live on every request. A graph node showing a stale overruled status
      // is the trap `CITATION_HARNESS.md` names — never cached, never carried.
      overruledStatus: n.overruled_status,
      asOf,
      depth: 1,
    })),
    edges: edges.map((e) => ({
      from: e.from_id,
      to: e.to_id,
      relationship: e.relationship,
    })),
    totalNodes,
    returned: nodes.length,
    truncated: totalNodes > nodes.length,
  });
}
