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
  locateParagraphByOffset,
  resolveExactSpan,
  trimToSentenceStart,
} from '../judgments/paragraphs.ts';

/** Standard RRF constant. Damps the influence of any single ranker's top hit. */
const RRF_K = 60;

/** How deep each ranker goes before fusion. */
const CANDIDATE_DEPTH = 50;

/**
 * Sparse-arm term selection: drop any lexeme appearing in more than this share
 * of sampled documents.
 *
 * **0.5 is NEW1's recommendation, not a tuned value** (bus 0664): "a term in
 * >50% of documents contributes almost nothing to `ts_rank`'s ordering and costs
 * most of the scan", chosen as the smallest-quality-risk change available. In
 * the measured sample only 3 of the 40 length-selected terms cleared it, and
 * `court` alone (90.6%) accounted for essentially the whole match set.
 *
 * **This is a LATENCY change and has not been shown to be a quality change.**
 * Narrowing a candidate set can cost recall, and recall is already the failing
 * axis — NEW1's baseline has 14 of 25 gold authorities never retrieved, with
 * `gold:presence` proving all 278 gold ids are present AND embedded. NEW1 owns
 * the benchmark and re-measures `recall@20` before this is trusted; if it comes
 * back worse, this constant is where the change is reverted.
 */
const SPARSE_MAX_DOCUMENT_FREQUENCY = 0.5;

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
  /**
   * True when `operativeParagraph` was located from a verified
   * `judgment_chunks.char_offset`/`char_length` (Stage 13) rather than fuzzy
   * substring-probing the chunk text against the segmented judgment.
   *
   * The exact path cannot match the wrong occurrence of a repeated phrase;
   * the fuzzy path can. Both can legitimately produce a correct paragraph —
   * this is provenance, not a quality signal to hide the fuzzy case behind.
   * False whenever no paragraph was located at all (`operativeParagraphNumber`
   * is then also null).
   */
  operativeParagraphVerified: boolean;
  /**
   * Stage 13's own deliverable: the chunk's literal span in the judgment's
   * own text, byte-identical, never approximated. Distinct from
   * `operativeParagraph` — that is the printed paragraph CONTAINING this
   * span (cleaned of reporter typesetting, sized for reading); this is the
   * raw span the match itself rests on (uncleaned, sized for citation-grade
   * verification: "does this text genuinely appear here").
   *
   * Null whenever no verified `char_offset`/`char_length` is available for
   * the matched chunk — a row not yet backfilled, a lexical-only match with
   * no dense chunk behind it, or a chunk whose position review needs no
   * further reason: the bounds check in `resolveExactSpan` failing is reason
   * enough. Never a guessed or clamped span.
   */
  exactSpan: { text: string; charOffset: number; charLength: number } | null;
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
  /** sha256 of `full_text`. Null means not yet computed, never "no duplicate". */
  content_hash: string | null;
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
    WITH scored AS (
      -- MEASURED document frequency, not length. The rule here used to be
      -- "longest first, as a weak proxy for rarest first", and that comment
      -- asserted the proxy holds in this corpus. NEW1 measured it and it does
      -- not (bus 0664): \`court\` is five characters and appears in 90.6% of
      -- documents, \`state\` 73.3%, while the terms that actually discriminate
      -- are ALSO five characters and were being discarded. Of the 40 terms the
      -- length rule chose, 3 appeared in at least half the corpus and 21 in
      -- under 5%.
      --
      -- The cost was not marginal: the resulting OR'd tsquery matched 6,866,609
      -- of 7,296,068 rows (94.1%), and \`ORDER BY ts_rank(...)\` over that set
      -- took 781,289 ms against 4.47 ms for the same filter unranked, because
      -- \`ts_rank\` must read the tsvector of every matching row.
      --
      -- \`ts_rank\` has no IDF, so the corpus is measured once into
      -- \`lexeme_document_frequency\` (migration 0055) and read here.
      SELECT
        l.lexeme,
        -- ABSENT MEANS RARE, and the direction is deliberate. A lexeme missing
        -- from the sample scores 0 and is therefore kept and ranked first.
        -- Failing the other way -- dropping a term nobody measured -- costs
        -- RECALL, and a recall failure leaves no trace: nothing errors, the
        -- authority simply never appears.
        coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
      FROM unnest(to_tsvector('english', ${query})) AS l
      LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ),
    discriminating AS (
      SELECT lexeme, df FROM scored WHERE df <= ${SPARSE_MAX_DOCUMENT_FREQUENCY}
    ),
    lex AS (
      -- If EVERY term is common the query still has to be answered, so the
      -- filter falls back to the unfiltered set rather than producing an empty
      -- tsquery. An empty ranker is the failure this whole function was
      -- rewritten to avoid once already.
      SELECT lexeme FROM (
        SELECT lexeme, df FROM discriminating
        UNION ALL
        SELECT lexeme, df FROM scored
        WHERE NOT EXISTS (SELECT 1 FROM discriminating)
      ) candidates
      -- Rarest first. \`length DESC\` survives only as a tie-break, which is
      -- where a length heuristic honestly belongs: it breaks ties between terms
      -- the corpus has never seen, where it is the only signal available.
      ORDER BY df ASC, length(lexeme) DESC
      -- A cap, because a whole paragraph of terms turns the index scan into a
      -- sequential one.
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
/** A dense-arm match's chunk text plus its verified position, when known. */
export type BestChunk = { text: string; charOffset: number | null; charLength: number | null };

async function dense(
  sql: Sql,
  queryVector: string,
  filters: SearchFilters,
): Promise<{ ranked: Ranked[]; bestChunk: Map<string, BestChunk> }> {
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
    return tx<
      {
        judgment_id: string;
        chunk_text: string;
        distance: number;
        char_offset: number | null;
        char_length: number | null;
      }[]
    >`
      WITH candidates AS MATERIALIZED (
        SELECT c.judgment_id, c.chunk_text, c.text_quality, c.char_offset, c.char_length,
               c.embedding <=> ${queryVector}::vector AS d
        FROM judgment_chunks c
        ORDER BY c.embedding <=> ${queryVector}::vector
        LIMIT ${annDepth}
      )
      SELECT c.judgment_id, c.chunk_text, c.char_offset, c.char_length,
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

  const bestChunk = new Map<string, BestChunk>();
  const ranked: Ranked[] = [];
  for (const row of rows) {
    // Rows arrive nearest-first, so the first sighting of a judgment is its best chunk.
    if (bestChunk.has(row.judgment_id)) continue;
    bestChunk.set(row.judgment_id, {
      text: row.chunk_text,
      charOffset: row.char_offset,
      charLength: row.char_length,
    });
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
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * TWO BRANCHES, NOT ONE `OR` — AND THIS IS A 7.3M-ROW SCAN, NOT A STYLE CHOICE
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This was one predicate: `neutral_citation_key = $1 OR EXISTS (SELECT 1 FROM
   * unnest(reporter_citations) rc WHERE <normalised rc> = $1)`. Measured on the
   * local cluster, 17 Aug 2026, `EXPLAIN`:
   *
   *   the OR as written       Seq Scan + Function Scan     7,296,068 rows
   *   the neutral arm ALONE   Index Scan using judgments_neutral_citation_key
   *
   * **The index was never missing.** `judgments_neutral_citation_key` already
   * matches the first arm byte-for-byte and is 70 MB. But a correlated `EXISTS`
   * over `unnest()` cannot use an index at all — the array is expanded per row —
   * and because the arms are `OR`ed, a row failing the first might still pass the
   * second, so **every row must be read**. One unindexable arm discarded a
   * perfectly good index across the whole table, on the `/search` hot path,
   * inside Gate S1's 3-second budget.
   *
   * Sparsity makes it sharper rather than milder: measured over a 3,760-row
   * sample, **20 rows (0.53%)** carry any reporter citation. The arm that forced
   * the scan can match under 1% of the corpus.
   *
   * `UNION`, never `UNION ALL` — a judgment matching BOTH arms must count once,
   * which is exactly what `OR` did. The per-branch `LIMIT 2` is safe for the same
   * reason the outer one is: this function only distinguishes "exactly one" from
   * "not exactly one", so any branch returning 2 already settles the question.
   *
   * **EACH BRANCH IS PARENTHESISED, and that is not style.** `SELECT … LIMIT 2
   * UNION SELECT … LIMIT 2` is a SYNTAX error in PostgreSQL — a `LIMIT` binds to
   * the whole set operation, so an un-parenthesised branch carrying one is
   * rejected at PARSE time, `42601`, before a row is read or a function is
   * resolved. The first version of this query shipped without the parentheses
   * and NEW1 caught it (bus 0638) with a four-case isolation: the error fires
   * even in a statement that never mentions `lawmind_citation_keys`, which is
   * what proves it is the `LIMIT`/`UNION` shape and not the missing migration.
   *
   * That distinction matters because the two failures look identical from the
   * outside and only one of them is fixed by deploying. See below.
   *
   * REQUIRES migration `0052` (`lawmind_citation_keys` + its GIN index). Deploy
   * order is migration-then-code, as always; ahead of it this throws `42883`
   * (`function … does not exist`) rather than silently returning nothing, which
   * is the right failure — a citation lookup that quietly stops matching is
   * indistinguishable from a corpus gap. `42601` would have been the WRONG
   * failure: a permanent parse error that no migration clears.
   */
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM (
      (SELECT j.id
       FROM judgments j
       WHERE upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) = ${key}
         ${courtWhere(sql, filters)}
         ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
         ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
         ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
       LIMIT 2)

      UNION

      (SELECT j.id
       FROM judgments j
       WHERE lawmind_citation_keys(j.reporter_citations) @> ARRAY[${key}::text]
         ${courtWhere(sql, filters)}
         ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
         ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
         ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
       LIMIT 2)

      UNION

      /**
       * ── THE CONCORDANCE ARM, AND WHY ITS ABSENCE WAS THE WHOLE BUG
       *
       * judgment_citation_aliases exists for exactly one purpose, stated in
       * migration 0027: an advocate searching AIR 1973 SC 1461 — the
       * ordinary way to cite *Kesavananda* — got nothing, because we hold it
       * only as 1973 INSC 91 and [1973] SUPP. 1 S.C.R. 1. *"A zero result
       * reads as 'no such case', which is the worst failure available to a
       * product whose promise is that a citation is real."*
       *
       * qlang's cite: field has matched aliases since it was written. This
       * function did not, and the two are the same question asked on two paths:
       * *which judgment is this citation*. Measured 19 Aug 2026 — **all 4,394
       * alias keys are unreachable by the two arms above**, which is not a
       * surprise but the table's entire reason for existing: it holds the
       * citations that are NOT in the row's own fields. So every one of them
       * resolved under cite:AIR 1973 SC 1461 and none under the same citation
       * typed into ordinary search, which then fell back to the sparse ranker —
       * the arm NEW1 measured at 18.0% recall and which loses a party surname
       * appearing once to boilerplate a long judgment repeats.
       *
       * This is the third instance of one family: exactCitation was fixed 17
       * Aug, qlang's cite: was catastrophic separately and fixed 18 Aug, and
       * this arm existed in one and not the other the whole time.
       *
       * ── SHAPE COPIED DELIBERATELY, NOT REINVENTED
       *
       * j.id = ANY (ARRAY(SELECT …)) is the form compile.ts already proved:
       * a scalar array expression plans as an InitPlan evaluated ONCE plus a
       * Bitmap Index Scan on judgments_pkey, where a correlated EXISTS has
       * to be re-run per candidate row. judgment_citation_aliases_key is
       * UNIQUE on alias_key, so the constructed array is at most one element —
       * bounded by the index, not by hope.
       */
      (SELECT j.id
       FROM judgments j
       WHERE j.id = ANY (ARRAY(
               SELECT a.judgment_id FROM judgment_citation_aliases a WHERE a.alias_key = ${key}))
         ${courtWhere(sql, filters)}
         ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
         ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
         ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
       LIMIT 2)
    ) matched
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
 * Exact case-title lookup — the same architecture as {@link exactCitation},
 * for the query shape it does not cover.
 *
 * `query-shape.ts` already classifies `X v Y` queries as `case_name`
 * (`CASE_NAME_RE`) on the documented assumption that *"the lexical ranker is
 * already strong"* for them. Measured, not assumed — `docs/CURRENT_PLAN.md`
 * Q1.25: it is not. `S. N. DUTT versus UNION OF INDIA`, searched by its own
 * exact printed title, does not appear in the sparse ranker's top 50 —
 * `full_text_tsv` is one unweighted tsvector, and the one discriminating
 * token (a party's surname, appearing once in the heading) loses to
 * boilerplate ("Union of India", "versus") a long judgment repeats dozens of
 * times. Reproduced against four real cases, worse as the corpus grows, not
 * better — more candidates to be outranked by, not fewer. A term-frequency
 * problem no amount of query retyping fixes; a structural match against the
 * title itself does.
 *
 * **Exact only, deliberately — same asymmetry as `exactCitation`**: a
 * missed match costs nothing (falls through to the ordinary pipeline
 * unchanged); a wrongly-claimed one would pin the wrong judgment at rank 1.
 * Case-insensitive and whitespace-normalised only (an advocate is unlikely
 * to reproduce a title's exact capitalisation or spacing) — never fuzzy or
 * similarity-scored, which would reopen exactly the "tune ranking without a
 * controlled experiment" risk this fix exists to close, not reintroduce.
 *
 * **Requiring the WHOLE (normalised) query to equal the WHOLE (normalised)
 * title is what keeps this safe without a separate "is the query ABOUT this"
 * guard** — unlike `exactCitation`, which needed `citationIsTheQuery`
 * because a looser, digit-stripped key could still match a citation merely
 * MENTIONED inside a longer passage. A full-string case-title match cannot
 * accidentally fire on a sentence that happens to contain a case name; it
 * only fires when the query IS the title, verbatim, which is exactly the
 * measured failure this closes.
 */
async function exactCaseTitle(
  sql: Sql,
  queryText: string,
  filters: SearchFilters,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT j.id
    FROM judgments j
    WHERE lower(btrim(regexp_replace(j.case_title, '\\s+', ' ', 'g'))) =
          lower(btrim(regexp_replace(${queryText}, '\\s+', ' ', 'g')))
      ${courtWhere(sql, filters)}
      ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
      ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
    LIMIT 2
  `;
  // Same asymmetry as exactCitation: two matches (two judgments printed with
  // literally the same title -- not impossible, e.g. a common surname
  // dispute pattern) means we do not know which the advocate meant, so
  // neither is pinned. Both still reach them through the ordinary pipeline.
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

/**
 * Which ranker(s) a search runs. `hybrid` is production and the default —
 * **nothing about the live search path changes by adding this.**
 *
 * `sparse` and `dense` exist for the Stage 10 bake-off
 * (`docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md` §3, `docs/ai/STAGES_9_20_PLAN.md`).
 * The design pass named this as the single concrete engineering gap in the way
 * of a six-arm comparison: this function has always computed the two candidate
 * lists separately and then fused them, with no way to ask for one alone, so
 * "is the dense half earning its keep" was unanswerable by measurement.
 *
 * An **additive parameter, not a redesign** — the shape already supported it.
 */
export type RetrievalMode = 'hybrid' | 'sparse' | 'dense';

export async function hybridSearch(
  sql: Sql,
  query: string,
  queryVector: string | null,
  filters: SearchFilters,
  limit: number,
  mode: RetrievalMode = 'hybrid',
): Promise<RetrievedJudgment[]> {
  // Each arm is skipped rather than computed-and-discarded: an isolated-arm
  // measurement that still paid for the other half would report the fused
  // system's latency and call it the arm's.
  const sparseRanked = mode === 'dense' ? [] : await sparse(sql, query, filters);
  // A corpus with no embeddings yet still searches, lexically. Returning nothing
  // because half the pipeline is cold would be worse than returning less.
  const denseResult =
    queryVector && mode !== 'sparse'
      ? await dense(sql, queryVector, filters)
      : { ranked: [] as Ranked[], bestChunk: new Map<string, BestChunk>() };

  /**
   * RRF over one list is not fusion, but it is order-preserving — `1/(k+rank)`
   * is monotonically decreasing in rank — so an isolated arm keeps exactly the
   * order its own ranker produced. Running the single list through the same
   * function rather than around it means the two paths cannot drift apart.
   */
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
  /**
   * Pinning runs in EVERY mode, deliberately.
   *
   * It is a third mechanism — exact lookup — and not part of either ranker, so
   * it contributes the same result to all three arms and cannot bias a
   * comparison between them. Suppressing it in isolated modes would measure a
   * system nobody runs; leaving it in measures the real arms of the real
   * pipeline. `docs/ai/STAGES_9_20_PLAN.md` §10.
   */
  const shape = classifyQuery(query);
  const pinned =
    warrantsExactLookup(shape) && shape.citation !== null
      ? await exactCitation(sql, shape.citation, filters)
      : shape.shape === 'case_name'
        ? await exactCaseTitle(sql, query, filters)
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
           content_hash,
           left(full_text, ${LOCATE_MAX_CHARS}) AS full_text
    FROM judgments WHERE id = ANY(${ids})
  `;

  const byId = new Map<string, JudgmentRow>(rows.map((r) => [r.id, r]));
  const results: RetrievedJudgment[] = [];
  /**
   * One slot per DOCUMENT, not per row.
   *
   * 1,476 High Court rows sit in duplicate groups on `content_hash` -- 925 of
   * them redundant copies of a document already in the corpus. Nothing in
   * retrieval read that fact, so the same judgment could occupy several of the
   * five slots an advocate actually reads, pushing distinct authorities off the
   * page.
   *
   * **This is a collapse, not a silent drop.** A dropped citation is one the
   * advocate never learns about; a collapsed duplicate is the SAME DOCUMENT,
   * byte-identical by sha256, and the one kept is the highest-ranked member of
   * its own group. Nothing an advocate could act on is removed --
   * `CITATION_HARNESS.md`'s zero silent-drop threshold counts distinct
   * authorities, and the count of those is unchanged.
   *
   * Rows with a NULL `content_hash` are never collapsed: absent is not equal.
   */
  const seenHash = new Set<string>();
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    if (r.content_hash !== null) {
      if (seenHash.has(r.content_hash)) continue;
      seenHash.add(r.content_hash);
    }

    // Chunk -> printed paragraph. Falls back to the cleaned chunk when the
    // judgment is too large to segment in-request, or when the passage cannot be
    // located: showing clean text with a null number is honest, and inventing a
    // number is the one thing this must never do.
    const best = denseResult.bestChunk.get(id);
    const chunk = best?.text ?? '';
    /**
     * Exact position first, always — Stage 13. A chunk carrying a verified
     * `char_offset`/`char_length` is located by walking to that literal
     * position (`locateParagraphByOffset`), which cannot match the wrong
     * occurrence of a phrase repeated elsewhere in the judgment the way a
     * substring probe can. `locateParagraph`'s fuzzy probe runs ONLY when the
     * exact position is unavailable (row not yet backfilled) or fails its own
     * bounds check (e.g. the offset lands past `LOCATE_MAX_CHARS`'s
     * truncation) — the same honest degrade this field has always made when a
     * paragraph cannot be located at all, one level up.
     */
    let located =
      chunk && r.full_text && best?.charOffset != null && best?.charLength != null
        ? locateParagraphByOffset(r.full_text, best.charOffset, best.charLength)
        : null;
    const verified = located !== null;
    if (!located && chunk && r.full_text) {
      located = locateParagraph(r.full_text, chunk);
    }

    // Stage 13's exact span. Computed independently of whether a paragraph
    // was located — a chunk can carry a verified position even when it sits
    // in a judgment too large to segment in-request (`LOCATE_MAX_CHARS`), and
    // the raw span is a strictly weaker claim than "this is a whole
    // paragraph" so it can succeed where paragraph location does not.
    const rawSpan =
      r.full_text && best?.charOffset != null && best?.charLength != null
        ? resolveExactSpan(r.full_text, best.charOffset, best.charLength)
        : null;
    const exactSpan = rawSpan
      ? { text: rawSpan.text, charOffset: rawSpan.charOffset, charLength: rawSpan.text.length }
      : null;

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
      operativeParagraphVerified: verified,
      exactSpan,
    });
  }
  await fillParagraphFallback(sql, results, query);
  return results;
}

/**
 * Evidence fallback for sparse-only matches — Q1.32, `judgment_paragraphs`
 * (migration 0049), the founder's data-before-embeddings decision (13 Aug
 * 2026, via LCC bus 0133). A judgment reached only through the sparse
 * ranker carries no dense chunk and so no `operativeParagraph` — correct,
 * not a bug (`passagesForRerank`'s own comment already says so), but no
 * longer the only option: `judgment_paragraphs` holds paragraph-level
 * evidence, byte-exact against `full_text`, with no vector, for a growing
 * share of the corpus (`docs/CURRENT_PLAN.md` Q1.29 measured 93.2% of
 * judgments carrying no chunk at all — this is that population's fix).
 *
 * **Query-aware, not "the first paragraph"** — same reasoning
 * `passagesForRerank` already applies to its own fallback: paragraph 0 of
 * an Indian judgment is the cause title and coram, nearly content-free.
 * Ranks a judgment's own paragraphs by `ts_rank` against the query and
 * takes the best one.
 *
 * **`operativeParagraphVerified: true` and a populated `exactSpan`** — not
 * a downgrade from the chunk-based path. `judgment_paragraphs.char_offset`/
 * `char_length` are exactly what Stage 13 requires: a byte-exact span
 * against `full_text`, computed once at paragraph-extraction time. This
 * fallback is evidence-complete, not a weaker substitute.
 *
 * **One batched query for every candidate missing a passage**, not one
 * per row — the same shape `passagesForRerank` already uses (`DISTINCT
 * ON`), for the same reason: Gate S1's 3-second budget has no room for a
 * per-candidate round trip inside a request already waiting on two
 * rankers. Runs unconditionally, in every retrieval mode — it changes
 * DISPLAY only, never ranking or order, so it cannot bias the Stage 10
 * arm comparison the way a ranking change would.
 */
async function fillParagraphFallback(
  sql: Sql,
  results: RetrievedJudgment[],
  query: string,
): Promise<void> {
  const missing = results
    .map((r, i) => ({ i, id: r.judgmentId, empty: r.operativeParagraph.trim().length === 0 }))
    .filter((x) => x.empty);
  if (missing.length === 0) return;

  const ids = missing.map((m) => m.id);
  const rows = await sql<
    {
      judgment_id: string;
      paragraph_text: string;
      paragraph_number: number | null;
      char_offset: number;
      char_length: number;
    }[]
  >`
    SELECT DISTINCT ON (judgment_id)
      judgment_id, paragraph_text, paragraph_number, char_offset, char_length
    FROM judgment_paragraphs
    WHERE judgment_id = ANY(${ids})
    ORDER BY judgment_id,
      ts_rank(to_tsvector('english', paragraph_text), plainto_tsquery('english', ${query})) DESC
  `;
  const byId = new Map(rows.map((r) => [r.judgment_id, r]));
  for (const m of missing) {
    const row = byId.get(m.id);
    // Genuinely no paragraphs for this judgment either yet — stays empty,
    // which is still the honest answer, not a regression from before.
    if (!row) continue;
    const result = results[m.i]!;
    result.operativeParagraph = cleanExtractedText(row.paragraph_text);
    result.operativeParagraphNumber = row.paragraph_number;
    result.operativeParagraphVerified = true;
    result.exactSpan = {
      text: row.paragraph_text,
      charOffset: row.char_offset,
      charLength: row.char_length,
    };
  }
}
