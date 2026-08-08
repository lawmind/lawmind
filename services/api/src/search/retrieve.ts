/**
 * Hybrid retrieval — sparse full-text AND dense vector, fused.
 *
 * Sparse runs against `judgments.full_text` through the gin index; dense runs
 * against `judgment_chunks.embedding` through HNSW. The two are fused with
 * Reciprocal Rank Fusion, which needs no score calibration between two ranking
 * systems whose numbers are not comparable (ts_rank is unbounded, cosine distance
 * is 0..2).
 *
 * `overruled_status` is selected in the final query, live, every time. It is
 * never cached, never denormalised and never carried across a request —
 * `docs/CITATION_HARNESS.md` §Overruled status is never cached.
 */
import type { Sql } from 'postgres';

import {
  cleanExtractedText,
  locateParagraph,
  trimToSentenceStart,
} from '../judgments/paragraphs.ts';

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
  /**
   * The paragraph the match sits in, cleaned of reporter typesetting.
   *
   * **Not the raw chunk.** A chunk is a fixed-size window cut wherever the
   * chunker happened to land — the right unit to search, the wrong unit to show.
   * The client lane rendered the raw version on a device and reported it as
   * ~2,600 characters carrying marginal reference letters, page pinpoints and
   * words split across hard wraps. Non-empty was not usable.
   */
  operativeParagraph: string;
  /**
   * The number the COURT printed on that paragraph, when it could be read.
   *
   * Null is common and honest: pre-1990s judgments arrive as scans that lost
   * their numbering, and headnotes are never numbered. Never invented — an
   * advocate told "see paragraph 22" must land on the court's paragraph 22.
   */
  operativeParagraphNumber: number | null;
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
  full_text: string | null;
};

/**
 * Above this, the matched chunk is cleaned but not located.
 *
 * Locating a paragraph means segmenting the whole judgment, because printed
 * numbering only makes sense read forward from the start. The corpus contains
 * judgments of 2.9M characters, and segmenting one of those inside a request
 * would blow the Gate S1 budget to return a paragraph number. Better to show
 * clean text with an honest null number than to be slow.
 */
const LOCATE_MAX_CHARS = 400_000;

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
/**
 * How few AND-matches means the AND was too strict. Below this, the OR pass
 * runs. Not zero: a ranker contributing three candidates to a fusion that takes
 * fifty is not contributing.
 */
const SPARSE_RELAX_BELOW = 10;

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
  if (rows.length >= SPARSE_RELAX_BELOW) {
    return rows.map((r, i) => ({ judgmentId: r.id, rank: i + 1 }));
  }

  const relaxed = await sparseAny(sql, query, filters);
  return relaxed.length > rows.length
    ? relaxed
    : rows.map((r, i) => ({ judgmentId: r.id, rank: i + 1 }));
}

/**
 * The same search with OR instead of AND, run only when AND returned almost
 * nothing.
 *
 * **Why this exists.** `plainto_tsquery` ANDs every lexeme. That is right for
 * three or four words and silently catastrophic for more: the Gate S2 harness
 * measured a 900-character passage matching **1 judgment out of 38,341**, so
 * the sparse half of a hybrid search was contributing a single candidate to a
 * fusion designed to take fifty. Reciprocal Rank Fusion cannot repair a ranker
 * that returned nothing to rank, and nothing failed — search still answered,
 * from the dense half alone, and looked like it was working.
 *
 * The same trap sits under short queries too, just shallower. *"bail
 * anticipatory NDPS commercial quantity twin conditions section 37"* requires
 * every one of those terms in one judgment; drop `twin` and the AND finds
 * nothing while the case an advocate wants is plainly there.
 *
 * **AND first, OR only on failure**, rather than OR always. The AND pass is
 * precise and fast and answers most real queries; the OR pass touches far more
 * of the index and is worth paying for only when the alternative is an empty
 * ranker. `ts_rank` then does the discriminating within the wider set — a
 * judgment matching twelve of the terms outranks one matching two — which is
 * the ordering the AND was crudely approximating by refusing the second
 * judgment outright.
 *
 * Lexemes come from `to_tsvector`, so stopwords and inflections are already
 * gone, and each is `quote_literal`'d before it reaches `to_tsquery` — a raw
 * lexeme can carry an apostrophe or a colon, which are operators there.
 */
async function sparseAny(sql: Sql, query: string, filters: SearchFilters): Promise<Ranked[]> {
  const rows = await sql<{ id: string }[]>`
    WITH lex AS (
      SELECT lexeme FROM unnest(to_tsvector('english', ${query}))
      -- A cap, because a whole paragraph of terms turns the index scan into a
      -- sequential one. Longest first is a weak proxy for rarest first, and it
      -- is honest about being a proxy: "preventive" discriminates and "made"
      -- does not, and in this corpus the long word is nearly always the rarer.
      ORDER BY length(lexeme) DESC
      LIMIT 40
    ),
    q AS (
      SELECT to_tsquery('english', string_agg(quote_literal(lexeme), ' | ')) AS tsq FROM lex
    )
    SELECT j.id
    FROM judgments j, q
    WHERE q.tsq IS NOT NULL
      AND j.full_text_tsv @@ q.tsq
      ${filters.court ? sql`AND j.court = ${filters.court}` : sql``}
      ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
      ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
    ORDER BY ts_rank(j.full_text_tsv, q.tsq) DESC
    LIMIT ${CANDIDATE_DEPTH}
  `;
  return rows.map((r, i) => ({ judgmentId: r.id, rank: i + 1 }));
}

/**
 * How wide HNSW searches its graph. **pgvector's default is 40, and 40 is wrong
 * here in two separate ways.**
 *
 * Measured against exact sequential-scan ground truth over 40 advocate queries,
 * k=50, on the full 616,197-chunk corpus:
 *
 *   ef_search   recall@50   short candidate lists
 *          40       76.5%   40 of 40   <- the default
 *          64       92.7%   0
 *         100       95.1%   0
 *         200       96.9%   0
 *         400       98.7%   0
 *
 * The recall column is the obvious failure: the default silently loses a quarter
 * of the authorities an exact search would have found, and a missing authority
 * looks exactly like one that does not exist.
 *
 * The right-hand column is the one that would not have been caught. **pgvector
 * returns FEWER rows than LIMIT when `ef_search` is below it** — it does not
 * error, it just stops early. `annDepth` below is 200, so anything under 200
 * quietly halves the candidate list before RRF ever sees it, and no recall@50
 * measurement taken at LIMIT 50 would reveal it. 200 is therefore a floor set by
 * `annDepth`, not only by the recall curve.
 *
 * Server-side execution time at this setting: **10.7 ms median, 18.0 ms p95**,
 * against 1,100.5 ms for the same query without the index.
 */
const HNSW_EF_SEARCH = Number(process.env['HNSW_EF_SEARCH'] ?? 200);

/**
 * Dense half: nearest chunks by cosine distance, reduced to their judgments.
 *
 * Two-stage on purpose. A vector index can only accelerate
 * `ORDER BY embedding <=> $1`; ordering by that distance MULTIPLIED by
 * `text_quality` is a different expression, and the planner falls back to
 * scanning every vector. That fallback is not theoretical — measured over the
 * full 616,197-chunk corpus it costs **2.9 s median, 3.1 s p95** for the dense
 * stage alone, against a 3 s budget for the entire request.
 *
 * So the ANN search runs alone inside a MATERIALIZED CTE — the fence matters,
 * because a plain subquery gets pulled up and the multiplier lands back in front
 * of the index — and the quality re-rank happens outside on the candidates.
 * Ranking semantics are unchanged; only the plan is.
 */
async function dense(
  sql: Sql,
  queryVector: string,
  filters: SearchFilters,
): Promise<{ ranked: Ranked[]; bestChunk: Map<string, string> }> {
  const filtered = Boolean(filters.court ?? filters.dateFrom ?? filters.dateTo ?? filters.caseType);
  // Filters are applied AFTER the ANN search, so a narrow filter can eliminate
  // most candidates. Over-fetch when one is present rather than return a short
  // list — PD-10 filters are meant to narrow results, not to lose them.
  const annDepth = CANDIDATE_DEPTH * (filtered ? 40 : 4);

  const rows = await sql.begin(async (tx) => {
    // SET LOCAL, so these die with the transaction instead of leaking into
    // whatever the pooled connection serves next.
    await tx`SET LOCAL hnsw.ef_search = ${sql.unsafe(String(HNSW_EF_SEARCH))}`;
    /**
     * The safety net for a short candidate list, set unconditionally.
     *
     * A filtered search asks for 2,000 candidates while `ef_search` caps at
     * 1,000, so a single graph pass cannot fill that LIMIT — measured: 1,000 rows
     * returned for a LIMIT of 2,000, with no error. Iterative scan keeps
     * searching until the LIMIT is met; the same measurement returns the full
     * 2,000 in 1,483 ms.
     *
     * Unconditional rather than `if (filtered)` because the unfiltered path has
     * `ef_search` exactly equal to `annDepth` — it fills today with no margin at
     * all, and the failure mode of losing that margin is silent. This costs
     * nothing when the LIMIT is already satisfied.
     *
     * `relaxed_order` rather than `strict_order`: the outer query re-sorts by the
     * quality-weighted distance anyway, so exact index order would be bought and
     * then thrown away.
     */
    await tx`SET LOCAL hnsw.iterative_scan = relaxed_order`;
    return tx<{ judgment_id: string; chunk_text: string; distance: number }[]>`
      WITH candidates AS MATERIALIZED (
        SELECT c.judgment_id, c.chunk_text, c.text_quality,
               c.embedding <=> ${queryVector}::vector AS d
        FROM judgment_chunks c
        ORDER BY c.embedding <=> ${queryVector}::vector
        LIMIT ${annDepth}
      )
      SELECT c.judgment_id, c.chunk_text,
             -- Down-ranked, never excluded: damaged text is still the judgment.
             -- quality 1.0 leaves distance untouched; 0.5 costs it 50%. Unscored
             -- chunks (no Latin tokens, e.g. Devanagari) are treated as clean
             -- rather than penalised for being unassessable.
             c.d * (2 - LEAST(COALESCE(c.text_quality, 1.0), 1.0)) AS distance
      FROM candidates c
      JOIN judgments j ON j.id = c.judgment_id
      WHERE TRUE
        ${filters.court ? sql`AND j.court = ${filters.court}` : sql``}
        ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
        ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
        ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
      ORDER BY distance
      LIMIT ${CANDIDATE_DEPTH * 4}
    `;
  });

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
           overruled_status, overruled_by_judgment_id, overruled_paras, overruled_note,
           -- Fetched so the matched chunk can be mapped back to the paragraph the
           -- court actually printed. Bounded: see LOCATE_MAX_CHARS.
           left(full_text, ${LOCATE_MAX_CHARS}) AS full_text
    FROM judgments WHERE id = ANY(${ids})
  `;

  const byId = new Map<string, JudgmentRow>(rows.map((r) => [r.id, r]));
  const results: RetrievedJudgment[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;

    // Chunk -> printed paragraph. Falls back to the cleaned chunk when the
    // judgment is too large to segment in-request, or when the passage cannot be
    // located: showing clean text with a null number is honest, and inventing a
    // number is the one thing this must never do.
    const chunk = denseResult.bestChunk.get(id) ?? '';
    const located = chunk && r.full_text ? locateParagraph(r.full_text, chunk) : null;

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
      // A located paragraph begins where the court began it. A chunk begins
      // wherever the chunker cut, so its leading partial sentence is dropped —
      // a mid-word start is indistinguishable from the court's own phrasing.
      operativeParagraph: located
        ? cleanExtractedText(located.text)
        : trimToSentenceStart(cleanExtractedText(chunk)),
      operativeParagraphNumber: located?.paragraphNumber ?? null,
    });
  }
  return results;
}
