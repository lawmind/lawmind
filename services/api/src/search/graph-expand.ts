/**
 * Citation-graph expansion — the one retrieval lever nobody else can copy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS AND NOT MORE EMBEDDING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Gate S2 baseline (8 Aug 2026) split the failure in two: success@5 of 24%
 * against recall@20 of 44%. The twenty-point band is a reranking problem. The
 * remaining **56% never appear in the candidate list at all**, and no amount of
 * reordering reaches them. Diagnosis on the missed queries found nothing broken
 * — the gold judgment simply sits further from the query in embedding space
 * than thirty other judgments about the same doctrine. *Jagmohan Singh* is not
 * the most textually similar judgment about sentencing discretion; it is the
 * one a court would cite.
 *
 * That gap between **similar** and **authoritative** is where every
 * text-similarity retriever loses, and it is the gap the citation graph closes.
 * CLERC (arXiv 2406.17186) reports state-of-the-art zero-shot retrieval getting
 * 48.3% recall@1000 on this task shape, so the difficulty is the field's, not
 * ours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE METHOD — how an advocate actually finds authority
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nobody searches for a case and stops. They find the cases near their problem
 * and then read **what those cases cite**, because the authority for a
 * proposition is what the courts deciding that proposition relied on.
 *
 * So: take the fused candidates, follow their outbound citation edges, and
 * count. A judgment cited by several of the top candidates is being pointed at
 * by several courts that were each reasoning about this query's subject. That
 * is evidence of authority which no embedding of its text can contain, because
 * the evidence lives in OTHER judgments.
 *
 * **This ADDS candidates.** It is the only stage in the pipeline that can
 * surface a judgment neither ranker retrieved, which is why it targets the 56%
 * rather than the twenty points. A reranker cannot do this at any model size.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT MUST NOT BECOME
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A popularity engine. *Kesavananda* is cited by everything; if raw inbound
 * count drove the score, every query would return the same five famous cases
 * and the metric would improve while the product got worse — the failure mode
 * `build-queries.ts` already guards the query set against.
 *
 * Two defences, and they are the load-bearing part of this file:
 *
 *   1. **Only edges FROM the candidate set count.** Global citation count is
 *      never read. A judgment scores because these particular judgments cite
 *      it, not because it is famous.
 *   2. **Corpus-wide inbound count DAMPENS the score.** A judgment cited by
 *      3 of our 20 candidates and by 4,000 judgments overall has told us
 *      almost nothing; one cited by 3 of 20 and by 30 overall has told us a
 *      great deal. This is inverse document frequency, and it is doing exactly
 *      the job IDF does in BM25.
 */
import type { Sql } from 'postgres';

/** How many fused candidates contribute their outbound edges. */
const EXPAND_FROM = 20;

/**
 * The multiplier a graph-derived candidate can reach, expressed as an RRF-style
 * pseudo-rank so it fuses with the existing scores instead of competing on a
 * scale of its own.
 *
 * Deliberately modest. A judgment that dense and sparse BOTH missed is a
 * genuine suggestion, not a certainty, and it should be able to enter the top
 * twenty without displacing something two rankers agreed on.
 */
const GRAPH_RRF_K = 60;

export type GraphSuggestion = {
  judgmentId: string;
  /** How many of the candidates cite it. */
  supportingCandidates: number;
  /** Corpus-wide inbound edges — the damping term. */
  inboundTotal: number;
  score: number;
};

/**
 * Judgments the candidate set points at, scored and ordered.
 *
 * Returns only judgments NOT already among the candidates: re-scoring something
 * the rankers already found is reranking's job, and doing it here would double
 * count a document for the crime of being cited.
 */
export async function expandByCitations(
  sql: Sql,
  candidateIds: readonly string[],
  limit = 10,
): Promise<GraphSuggestion[]> {
  const from = candidateIds.slice(0, EXPAND_FROM);
  if (from.length < 2) return [];

  const rows = await sql<
    { cited_judgment_id: string; supporting: number; inbound_total: number }[]
  >`
    WITH edges AS (
      SELECT DISTINCT jc.citing_judgment_id, jc.cited_judgment_id
        FROM judgment_citations jc
       WHERE jc.citing_judgment_id = ANY(${from as string[]})
         AND jc.cited_judgment_id IS NOT NULL
         AND NOT (jc.cited_judgment_id = ANY(${from as string[]}))
    ),
    support AS (
      SELECT cited_judgment_id, count(*)::int AS supporting
        FROM edges
       GROUP BY cited_judgment_id
      HAVING count(*) >= 2
    )
    SELECT s.cited_judgment_id,
           s.supporting,
           (SELECT count(DISTINCT citing_judgment_id)
              FROM judgment_citations
             WHERE cited_judgment_id = s.cited_judgment_id)::int AS inbound_total
      FROM support s
      -- The cited judgment must be searchable, or promoting it hands the
      -- advocate a row with no text behind it.
      JOIN judgment_chunks c ON c.judgment_id = s.cited_judgment_id AND c.embedding IS NOT NULL
     GROUP BY s.cited_judgment_id, s.supporting
     ORDER BY s.supporting DESC
     LIMIT ${limit * 4}
  `;

  return rows
    .map((r) => ({
      judgmentId: r.cited_judgment_id,
      supportingCandidates: r.supporting,
      inboundTotal: r.inbound_total,
      /**
       * support ÷ log(inbound), the IDF shape.
       *
       * `log` rather than a plain ratio because the damping should be firm at
       * the famous end and gentle in the middle: going from 30 inbound to 60
       * should matter, and from 3,000 to 6,000 should barely register — by then
       * the judgment is universally cited and the signal is long gone either
       * way.
       */
      score: r.supporting / Math.log2(Math.max(r.inbound_total, 2) + 2),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Fold suggestions into an existing fused ranking.
 *
 * They enter at the BOTTOM by construction: a suggestion's pseudo-rank starts
 * after the last candidate, so graph evidence can put an unretrieved authority
 * on the advocate's second screen but never above a judgment that two
 * independent rankers already agreed on. If that turns out to be too timid, the
 * harness is what will say so — `HARNESS_GRAPH=1` against the recorded
 * baseline, not an opinion.
 */
export function fuseSuggestions(
  ranked: readonly string[],
  suggestions: readonly GraphSuggestion[],
): string[] {
  const seen = new Set(ranked);
  const out = [...ranked];
  for (const s of suggestions) {
    if (seen.has(s.judgmentId)) continue;
    seen.add(s.judgmentId);
    out.push(s.judgmentId);
  }
  return out;
}

export const GRAPH_EXPANSION_CONSTANTS = { EXPAND_FROM, GRAPH_RRF_K } as const;
