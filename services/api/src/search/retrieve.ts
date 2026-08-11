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

import { citationLookupKey, classifyQuery, warrantsExactLookup } from './query-shape.ts';

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
  /**
   * Court NAMES, already expanded from the client's category codes by
   * `court-category.ts` — RCC bus 0046. Empty array and `undefined` are
   * different: `undefined` means no court filter was asked for, `[]` means one
   * was and nothing in the corpus matches it, which must return nothing rather
   * than everything.
   */
  courts?: string[] | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  /**
   * Derived from the official case number at ingest. Judgments whose case number
   * states no side carry null and are EXCLUDED when this filter is applied — a
   * filter that silently mis-sorts a matter is worse than one that returns less.
   */
  caseType?: 'criminal' | 'civil' | undefined;
};

/**
 * The court predicate, in ONE place, for the four rankers that need it.
 *
 * Written as a helper rather than repeated inline because it was already
 * repeated inline four times: a fifth ranker that copied three of the four
 * conditions and forgot the court would narrow differently from the other
 * rankers and the difference would show up only as an odd ordering, never as an
 * error. `courts` is added here once and every arm gets it.
 *
 * `courts: []` filters everything out and that is deliberate — the advocate
 * asked for a category the corpus holds nothing in, and answering with the
 * unfiltered corpus would silently ignore the request they can see on screen.
 */
function courtWhere(sql: Sql, filters: SearchFilters) {
  if (filters.courts !== undefined) return sql`AND j.court = ANY(${filters.courts})`;
  return filters.court ? sql`AND j.court = ${filters.court}` : sql``;
}

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

/**
 * Above this many characters, the AND pass is not attempted at all.
 *
 * **Measured 9 August 2026 over the first 30 evaluation queries** (200–900
 * characters each, the CLERC-style citing passages):
 *
 * | | |
 * | --- | --- |
 * | AND-pass candidates | **median 1 of 38,341**, max 2, never near the cap of 50 |
 * | queries falling below `SPARSE_RELAX_BELOW` | **30 of 30 — 100%** |
 *
 * So on this workload the AND pass runs, returns about one row, and is
 * discarded every single time. It is not a fast path that occasionally misses;
 * it is a guaranteed miss with a full index scan attached.
 *
 * **Skipping it cannot change a result.** The AND match set is a strict subset
 * of the OR match set, and {@link sparse} already keeps whichever pass returned
 * more — which, above this length, is always the OR pass. This is latency only.
 *
 * **Character count is a proxy for lexeme count, and it is honest about being
 * one.** The real predictor is how many lexemes `plainto_tsquery` will AND
 * together, but counting them costs the round trip this is trying to save. 200
 * characters sits well above anything an advocate types — the longest query in
 * `queries.hand.json` is far shorter — and well below the 200-character floor
 * `harness/build-queries.ts` puts on a derived passage.
 */
const SPARSE_AND_MAX_CHARS = 200;

async function sparse(sql: Sql, query: string, filters: SearchFilters): Promise<Ranked[]> {
  if (query.length > SPARSE_AND_MAX_CHARS) return sparseAny(sql, query, filters);
  // Reads the STORED tsvector. Computing it here instead cost 20.8s per query —
  // `docs/SCHEMA_TRUTH.md` §judgments records the measurement.
  const rows = await sql<{ id: string }[]>`
    SELECT j.id
    FROM judgments j, plainto_tsquery('english', ${query}) AS q
    WHERE j.full_text_tsv @@ q
      ${courtWhere(sql, filters)}
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
      ${courtWhere(sql, filters)}
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
  const filtered = Boolean(
    filters.court ?? filters.courts ?? filters.dateFrom ?? filters.dateTo ?? filters.caseType,
  );
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
        ${courtWhere(sql, filters)}
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

/**
 * Exact citation lookup — the fast path a similarity pipeline should never own.
 *
 * When the query IS a citation there is exactly one right answer, and it lives
 * in an indexed column. `docs/RETRIEVAL_ARCHITECTURE.md` §6b.2: embedding models
 * are poor at digits, and `(2019) 4 SCC 221` and `(2019) 4 SCC 212` are
 * different cases that sit almost on top of each other in vector space.
 *
 * **A miss costs nothing.** Returning null falls through to the hybrid pipeline
 * that handles the query today, which is why the classifier is allowed to be
 * strict. The asymmetry is the whole design: a missed citation is a slower
 * correct answer, a wrongly-claimed one pins the wrong judgment at rank 1.
 *
 * Compared on the NORMALISED form, because `(2019) 4 S.C.C. 221` and
 * `(2019) 4 SCC 221` are one citation typeset two ways —
 * `@lawmind/ingest/citations` owns that rule and is not re-implemented here.
 */
async function exactCitation(
  sql: Sql,
  normalised: string,
  filters: SearchFilters,
): Promise<string | null> {
  const key = citationLookupKey(normalised);
  const rows = await sql<{ id: string }[]>`
    SELECT j.id
    FROM judgments j
    WHERE (
      upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) = ${key}
      OR EXISTS (
        SELECT 1 FROM unnest(j.reporter_citations) AS rc
        WHERE upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) = ${key}
      )
    )
      ${courtWhere(sql, filters)}
      ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
      ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
    LIMIT 2
  `;
  /**
   * **Two matches means we do not know**, so nothing is pinned. One citation
   * resolving to two judgments is a corpus defect, and guessing which one the
   * advocate meant is exactly the confident-wrong-answer this product cannot
   * afford. Both still reach the advocate through the ordinary pipeline.
   */
  if (rows.length !== 1) return null;
  return rows[0]!.id;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE CROSS-ENCODER IS ALLOWED TO SEE — never an empty string
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `operativeParagraph` is a **display** field, and the contract says so:
 * *"An empty `operativeParagraph` is legitimate. A result matched by the lexical
 * ranker alone has no dense chunk behind it and therefore no paragraph to show."*
 * That is a correct decision about what to render.
 *
 * **It is a catastrophic decision about what to rank on**, and the two uses of
 * the one field had quietly diverged. Measured 9 Aug 2026 over 500 candidates
 * from 25 real queries: **37.6% carried an empty `operativeParagraph`** — every
 * judgment BM25 found that the dense arm's top-50 did not. A cross-encoder
 * scoring a query against `""` returns a low score, necessarily and every time,
 * so **the reranker was systematically deleting two candidates in five from the
 * top five** — and doing it to exactly the lexical matches that carry section
 * numbers and citations.
 *
 * Graph suggestions had a quieter version of the same problem: they were handed
 * `chunk_index 0`, which in an Indian judgment is the cause title, the coram and
 * counsel's names. Nearly content-free for relevance, and handed to the model as
 * if it were the reasoning.
 *
 * This resolves both with one mechanism: **for every candidate lacking a
 * passage, the chunk of that judgment nearest the query vector**. One batched
 * query, `DISTINCT ON` over the pgvector distance.
 *
 * **`operativeParagraph` is not touched.** The display contract is right; only
 * the ranking input was wrong, and conflating them again is how this returns.
 */
export async function passagesForRerank(
  sql: Sql,
  results: readonly RetrievedJudgment[],
  queryVector: string | null,
): Promise<string[]> {
  const missing = results
    .map((r, i) => ({ i, id: r.judgmentId, empty: r.operativeParagraph.trim().length === 0 }))
    .filter((x) => x.empty);
  const passages = results.map((r) => r.operativeParagraph);
  if (missing.length === 0) return passages;

  const ids = missing.map((m) => m.id);
  /**
   * Without a query vector the embedder is cold. Fall back to the first chunk:
   * weak, but a cause title still beats an empty string, and returning nothing
   * here would silently keep the defect this function exists to remove.
   */
  const rows = queryVector
    ? await sql<{ judgment_id: string; chunk_text: string }[]>`
        SELECT DISTINCT ON (c.judgment_id) c.judgment_id, c.chunk_text
          FROM judgment_chunks c
         WHERE c.judgment_id = ANY(${ids}) AND c.embedding IS NOT NULL
         ORDER BY c.judgment_id, c.embedding <=> ${queryVector}::vector`
    : await sql<{ judgment_id: string; chunk_text: string }[]>`
        SELECT DISTINCT ON (c.judgment_id) c.judgment_id, c.chunk_text
          FROM judgment_chunks c
         WHERE c.judgment_id = ANY(${ids}) AND c.embedding IS NOT NULL
         ORDER BY c.judgment_id, c.chunk_index`;

  const byId = new Map(rows.map((r) => [r.judgment_id, r.chunk_text]));
  for (const m of missing) {
    const text = byId.get(m.id);
    // Still empty only when the judgment genuinely has no embedded chunk, which
    // means it should not have been retrievable at all. Left as it is rather
    // than papered over with the case title.
    if (text) passages[m.i] = trimToSentenceStart(cleanExtractedText(text));
  }
  return passages;
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

  /**
   * A citation-shaped query pins its exact match at rank 1.
   *
   * Pinned rather than score-boosted: RRF scores are relative, and a boost large
   * enough to guarantee rank 1 would be a magic number tuned against whatever
   * the other rankers happened to return that day. An exact citation match is
   * not "very relevant", it is **the answer**, and the code should say so.
   *
   * Everything else keeps its order and nothing is dropped — the pinned
   * judgment is moved to the front of the list it was already in, or added to
   * it. `CITATION_HARNESS.md`'s zero silent-drop threshold is untouched.
   */
  const shape = classifyQuery(query);
  const pinned =
    warrantsExactLookup(shape) && shape.citation !== null
      ? await exactCitation(sql, shape.citation, filters)
      : null;

  const ordered = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([id]) => id !== pinned)
    .slice(0, pinned === null ? limit : Math.max(0, limit - 1));
  if (pinned !== null) ordered.unshift([pinned, Number.POSITIVE_INFINITY]);
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
