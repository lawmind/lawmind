/**
 * Hybrid retrieval — sparse full-text AND dense vector, fused.
 *
 * Sparse runs against `judgments.full_text` through the gin index; dense runs
 * against `judgment_chunks.embedding` through ivfflat. The two are fused with
 * Reciprocal Rank Fusion, which needs no score calibration between two ranking
 * systems whose numbers are not comparable (ts_rank is unbounded, cosine distance
 * is 0..2).
 *
 * `overruled_status` is selected in the final query, live, every time. It is
 * never cached, never denormalised and never carried across a request —
 * `docs/CITATION_HARNESS.md` §Overruled status is never cached.
 */
import type { Sql } from 'postgres';

/** Standard RRF constant. Damps the influence of any single ranker's top hit. */
const RRF_K = 60;

/** How deep each ranker goes before fusion. */
const CANDIDATE_DEPTH = 50;

export type SearchFilters = {
  court?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  /**
   * Derived from the official case number at ingest. Judgments whose case number
   * states no side carry null and are EXCLUDED when this filter is applied — a
   * filter that silently mis-sorts a matter is worse than one that returns less.
   */
  caseType?: 'criminal' | 'civil' | undefined;
};

export type RetrievedJudgment = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string | null;
  reporterCitations: string[];
  court: string;
  judgmentDate: string;
  overruledStatus: string;
  overruledByJudgmentId: string | null;
  overruledParas: number[] | null;
  overruledNote: string | null;
  /** The chunk that actually matched, when dense retrieval contributed. */
  operativeParagraph: string;
};

type Ranked = { judgmentId: string; rank: number };

/** The final read's shape. Named so the lookup map keeps it. */
type JudgmentRow = {
  id: string;
  case_title: string;
  neutral_citation: string | null;
  reporter_citations: string[];
  court: string;
  judgment_date: string;
  overruled_status: string;
  overruled_by_judgment_id: string | null;
  overruled_paras: number[] | null;
  overruled_note: string | null;
};

function rrf(lists: Ranked[][]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const { judgmentId, rank } of list) {
      scores.set(judgmentId, (scores.get(judgmentId) ?? 0) + 1 / (RRF_K + rank));
    }
  }
  return scores;
}

/** Sparse half: lexical match over the full text, through the gin index. */
async function sparse(sql: Sql, query: string, filters: SearchFilters): Promise<Ranked[]> {
  // Reads the STORED tsvector. Computing it here instead cost 20.8s per query —
  // `docs/SCHEMA_TRUTH.md` §judgments records the measurement.
  const rows = await sql<{ id: string }[]>`
    SELECT j.id
    FROM judgments j, plainto_tsquery('english', ${query}) AS q
    WHERE j.full_text_tsv @@ q
      ${filters.court ? sql`AND j.court = ${filters.court}` : sql``}
      ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
      ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
    ORDER BY ts_rank(j.full_text_tsv, q) DESC
    LIMIT ${CANDIDATE_DEPTH}
  `;
  return rows.map((r, i) => ({ judgmentId: r.id, rank: i + 1 }));
}

/** Dense half: nearest chunks by cosine distance, reduced to their judgments. */
async function dense(
  sql: Sql,
  queryVector: string,
  filters: SearchFilters,
): Promise<{ ranked: Ranked[]; bestChunk: Map<string, string> }> {
  const rows = await sql<{ judgment_id: string; chunk_text: string; distance: number }[]>`
    SELECT c.judgment_id, c.chunk_text, (c.embedding <=> ${queryVector}::vector) AS distance
    FROM judgment_chunks c
    JOIN judgments j ON j.id = c.judgment_id
    WHERE TRUE
      ${filters.court ? sql`AND j.court = ${filters.court}` : sql``}
      ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
      ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
    ORDER BY c.embedding <=> ${queryVector}::vector
    LIMIT ${CANDIDATE_DEPTH * 4}
  `;

  const bestChunk = new Map<string, string>();
  const ranked: Ranked[] = [];
  for (const row of rows) {
    // Rows arrive nearest-first, so the first sighting of a judgment is its best chunk.
    if (bestChunk.has(row.judgment_id)) continue;
    bestChunk.set(row.judgment_id, row.chunk_text);
    ranked.push({ judgmentId: row.judgment_id, rank: ranked.length + 1 });
    if (ranked.length >= CANDIDATE_DEPTH) break;
  }
  return { ranked, bestChunk };
}

export async function hybridSearch(
  sql: Sql,
  query: string,
  queryVector: string | null,
  filters: SearchFilters,
  limit: number,
): Promise<RetrievedJudgment[]> {
  const sparseRanked = await sparse(sql, query, filters);
  // A corpus with no embeddings yet still searches, lexically. Returning nothing
  // because half the pipeline is cold would be worse than returning less.
  const denseResult = queryVector
    ? await dense(sql, queryVector, filters)
    : { ranked: [] as Ranked[], bestChunk: new Map<string, string>() };

  const scores = rrf([sparseRanked, denseResult.ranked]);
  const ordered = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (ordered.length === 0) return [];

  const ids = ordered.map(([id]) => id);
  // Final read: every rendered field comes from this row, including
  // overruled_status, read live at render time.
  const rows = await sql<JudgmentRow[]>`
    SELECT id, case_title, neutral_citation, reporter_citations, court,
           -- ::text keeps this a calendar date. The column type is date; the
           -- driver otherwise hydrates it to a Date and JSON renders a midnight
           -- timestamp, so the client would show a time a judgment never had.
           judgment_date::text AS judgment_date,
           overruled_status, overruled_by_judgment_id, overruled_paras, overruled_note
    FROM judgments WHERE id = ANY(${ids})
  `;

  const byId = new Map<string, JudgmentRow>(rows.map((r) => [r.id, r]));
  const results: RetrievedJudgment[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    results.push({
      judgmentId: r.id,
      caseTitle: r.case_title,
      neutralCitation: r.neutral_citation,
      reporterCitations: r.reporter_citations,
      court: r.court,
      judgmentDate: r.judgment_date,
      overruledStatus: r.overruled_status,
      overruledByJudgmentId: r.overruled_by_judgment_id,
      overruledParas: r.overruled_paras,
      overruledNote: r.overruled_note,
      operativeParagraph: denseResult.bestChunk.get(id) ?? '',
    });
  }
  return results;
}
