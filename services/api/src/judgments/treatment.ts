/**
 * `GET /judgments/:id/treatment` and `GET /judgments/:id/graph` —
 * `docs/API_CONTRACTS.md` §Feature-parity endpoints.
 *
 * Both read `judgment_citations`, which holds judgment-to-judgment edges
 * extracted from judgment text with the court's OWN annotation attached
 * (`docs/SCHEMA_TRUTH.md` §judgment_citations).
 *
 * **Treatment is not prediction.** These endpoints state what courts DID —
 * followed, distinguished, doubted, overruled — every count traceable to a
 * judgment id and every relationship justified by a phrase the court printed.
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
    ORDER BY CASE c.relationship
               WHEN 'overruled' THEN 0 WHEN 'doubted' THEN 1
               WHEN 'distinguished' THEN 2 WHEN 'followed' THEN 3 ELSE 4 END,
             j.judgment_date DESC
    LIMIT ${q.limit + 1} OFFSET ${offset}
  `;

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const total = Object.values(byRelationship).reduce((t, n) => t + n, 0);

  return ok(c, {
    judgmentId: id,
    asOf,
    counts: {
      followed: byRelationship['followed'] ?? 0,
      distinguished: byRelationship['distinguished'] ?? 0,
      doubted: byRelationship['doubted'] ?? 0,
      overruled: byRelationship['overruled'] ?? 0,
      cites: byRelationship['cites'] ?? 0,
    },
    treatments: page.map((r) => ({
      judgmentId: r.judgment_id,
      caseTitle: r.case_title,
      neutralCitation: r.neutral_citation,
      court: r.court,
      judgmentDate: r.judgment_date,
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

  return ok(c, {
    rootId: id,
    asOf,
    nodes: nodes.map((n) => ({
      judgmentId: n.id,
      caseTitle: n.case_title,
      neutralCitation: n.neutral_citation,
      court: n.court,
      judgmentDate: n.judgment_date,
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
