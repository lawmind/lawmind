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

/** A nested `postgres.js` fragment. Composable, and always parameterised. */
export type Frag = ReturnType<Sql>;

import { SEARCH_PHASE, type RetrievalTimings } from './timings.ts';

import { canonicalAct } from '@lawmind/ingest/sections';

import {
  precedentialPolicy,
  unappliedTreatment,
  type OverruledStatus,
  attributionOf,
  precedentialEffectFromEdges,
  type TreatmentEdge,
  type TreatmentAttribution,
  type TreatmentProvenance,
} from '../judgments/precedential-effect.ts';

import {
  citationLookupKey,
  classifyQuery,
  warrantsExactLookup,
  warrantsSectionLookup,
} from './query-shape.ts';

import {
  andBodyTextSafe,
  bodyTextGrade,
  bodyTextState,
  isBodyTextSafe,
  type BodyTextGrade,
  type BodyTextState,
} from './body-text-safety.ts';

import {
  cleanExtractedText,
  locateParagraph,
  locateParagraphByOffset,
  resolveExactSpan,
  trimToSentenceStart,
} from '../judgments/paragraphs.ts';

/**
 * Postgres `query_canceled`. This is what `statement_timeout` looks like when it
 * reaches the driver, and it is the ONE database error a ranker is allowed to
 * absorb — it means "this arm ran out of its budget", not "the data is wrong".
 */
const QUERY_CANCELED = '57014';

/**
 * Was this error PostgreSQL cancelling a statement that ran out of its budget?
 *
 * Exported so the structured route can tell a timeout from a defect without a
 * second opinion about what a timeout looks like. NEW3 R20 requires an admitted
 * bounded qlang arm that reaches `statement_timeout` to answer 200 with
 * `sparse_timeout` and `coverage_unknown` rather than a generic 503 — and that
 * distinction is only safe if "timed out" is decided in ONE place. Any other
 * error is a defect and must still be thrown: a missing column swallowed as a
 * timeout is a broken route that reports itself as a busy one.
 */
export function isStatementTimeout(error: unknown): boolean {
  return isQueryCanceled(error);
}

/**
 * Which half of the search stopped contributing, when one did.
 *
 * **A degraded search must never look like a complete one.** `CITATION_HARNESS.md`
 * holds silent-drop at a zero threshold, and an arm that timed out has dropped
 * authorities the advocate will never know existed. Reporting recall loss is the
 * only honest option available: it cannot be recovered, so it must be visible.
 */
/**
 * `pin_timeout` is the exact-lookup arm — citation, statute section, case
 * title. It means the answer an INDEX should have held was not computed in
 * time, which is a stronger statement than either ranker timing out: those lose
 * candidates, this loses the answer.
 */
export type DegradedArm =
  | 'sparse_timeout'
  | 'dense_timeout'
  | 'pin_timeout'
  /**
   * The sparse arm REFUSED to rank, before running, because the match set it
   * would have had to rank is unbounded. Distinct from `sparse_timeout`: a
   * timeout is a query that was tried and ran out of clock, this is a query
   * that was never going to fit in memory and was not attempted.
   *
   * See {@link SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY}.
   */
  | 'sparse_unbounded'
  /**
   * The party-name arm was NOT RUN because the capability registry disables it
   * for the platform that made the request.
   *
   * Roadmap v7.1 §9.5. Apple's guideline 5.1.1(viii) is broad enough to reach an
   * app that compiles personal information from public databases, and case-first
   * design is the correct mitigation rather than a guarantee. So the switch has
   * to exist BEFORE App Review, not after a rejection under launch pressure.
   *
   * It is a `degraded` arm and not a route refusal, and that distinction is the
   * whole requirement: exact case number, CNR and citation lookup keep working
   * untouched, and the response SAYS the party arm did not run so the client can
   * show the advocate what to type instead. §9.5: a capability that silently
   * vanishes produces support load and a feature-parity claim problem.
   */
  | 'party_name_disabled';

function isQueryCanceled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === QUERY_CANCELED
  );
}

/**
 * Run one ranker; on ITS OWN timeout return nothing and say so.
 *
 * Half a hybrid is a usable search — the file already makes that trade for a
 * cold embedder. What it must not do is silently make it. Any error that is not
 * a cancellation is rethrown: a syntax error or a missing column is a defect,
 * and swallowing it would turn a broken ranker into a permanently quiet one.
 */
async function bounded<T>(
  arm: DegradedArm,
  empty: T,
  run: () => Promise<T>,
  onDegrade: ((arm: DegradedArm) => void) | undefined,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isQueryCanceled(error)) throw error;
    onDegrade?.(arm);
    return empty;
  }
}

/** Standard RRF constant. Damps the influence of any single ranker's top hit. */
const RRF_K = 60;

/**
 * How far into the ranking a continuation can reach.
 *
 * Not a policy number — it is what the rankers actually produce. Each arm
 * returns at most {@link CANDIDATE_DEPTH} candidates and fusion cannot invent
 * more, so asking for result 200 of a hybrid search is asking for something
 * that was never computed. The route reports `hasMore: false` at this boundary
 * rather than returning an empty page, because "there are no more" and "we
 * stopped looking" are different facts and only one of them is true here.
 *
 * The structured path has no such limit: it pages with SQL `OFFSET` over a
 * total order, so every one of an ambiguous citation's candidates is reachable.
 */
export const REACHABLE_DEPTH = 100;

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
  /** The stored column, beside the derived banner. Admin monitor only. */
  overruledStatusStored: string;
  /** Layer 2 of `precedential-effect.ts` — five values, not four. */
  precedentialEffect: string;
  /** Layer 3. False only for a genuine set aside or an unaccountable status. */
  canAddToMatter: boolean;
  /** A verified adverse edge the corpus has not applied. Never a banner. */
  unappliedTreatment: string | null;
  /**
   * WHO the adverse treatment came from — COURT, REPORTER, DEFECTIVE, UNKNOWN.
   *
   * ADDITIVE. It never changes `overruledStatus`, and a client that ignores it
   * behaves exactly as before. What it enables is honest WORDING: 95.62% of the
   * edges behind a LAW MOVED badge are a law reporter's headnote, and "reported
   * as overruled" and "the Supreme Court held" are different claims. Only
   * `COURT` may be stated as a holding — `mayStateAsHolding()`.
   */
  treatmentAttribution: TreatmentAttribution;
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
  /**
   * The body-text quality state, in the quality contract's own vocabulary.
   *
   * **Deliberately not a boolean called `bodyTextSafe`.** NEW2 measured that no
   * writer in this repository has ever emitted `clean`, so the eligibility
   * boolean is true for 90.68% of the corpus on the strength of nothing having
   * looked. A field named "safe" would hand a client a positive claim the data
   * cannot support; `TEXT_UNKNOWN` says the true thing. `body-text-safety.ts`
   * carries the numbers and NEW2's bus 1022 the request.
   *
   * `evidenceWithheld` is the ACTIONABLE half: true means the passage fields on
   * this result are empty by REFUSAL rather than by absence. The result itself
   * is still here — a damaged body is no evidence against `neutral_citation`,
   * `case_title` or `case_number`, so the advocate searching by citation still
   * finds the case.
   *
   * Additive. A client that ignores it renders exactly what it rendered before,
   * minus a passage it should never have been shown.
   */
  bodyText: {
    state: BodyTextState;
    /** How well the damage is PROVEN. Never pooled with `state`. */
    grade: BodyTextGrade;
    evidenceWithheld: boolean;
  };
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
  /** The damage verdict itself, read live. See {@link isBodyTextSafe}. */
  script_quality: string | null;
  /** Which screen convicted it — PROOF vs SCREEN grade. Never pooled with the state. */
  script_quality_method: string | null;
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

/**
 * `SPARSE_RELAX_BELOW` and `SPARSE_AND_MAX_CHARS` lived here and are gone.
 *
 * They were the two knobs of the AND-first / OR-fallback design: how few
 * AND-matches meant "relax", and how long a query had to be before the AND pass
 * was skipped entirely. Both were carefully measured against the workload of
 * their day and both became unreachable the moment `sparse()` stopped having two
 * passes — NEW1 bus 1025. Removed rather than left as dead configuration,
 * because a constant with a long justification above it and no reader is how the
 * next person concludes the AND pass still exists.
 */

/** Sparse half: lexical match over the full text, through the gin index. */
async function sparse(
  sql: Sql,
  query: string,
  filters: SearchFilters,
  onDegrade?: (arm: DegradedArm) => void,
  signals?: RetrievalSignals,
): Promise<Ranked[]> {
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THERE IS ONE SPARSE PASS NOW, AND IT IS THE RARE-TERM AND
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This used to run `plainto_tsquery` over EVERY term first and fall back to a
   * relaxed pass only when that returned almost nothing. NEW1's arm A is exactly
   * that shape, measured over 60 semantic gold queries: **58% timeouts, 16 of 60
   * gold found, p50 15,013 ms.** The first pass was not a fast path that
   * occasionally missed — it was spending the entire request budget before the
   * relaxed pass could run at all, which is why implementing arm D as a FALLBACK
   * changed nothing (measured here: concept p50 still 15,013 ms).
   *
   * NEW1 said "instead of, not in addition to" and meant it. So the rare-term
   * AND is now the whole arm.
   *
   * **For a short query the two are the same query.** A three-word search has
   * three lexemes, the three rarest of three is all of them, and this ANDs them
   * exactly as `plainto_tsquery` did. Nothing is lost on the shape that already
   * worked; what is removed is the full-AND pass over a long query, which is the
   * shape that never worked.
   */
  return sparseAny(sql, query, filters, onDegrade, signals);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RELAXED PASS IS AN **AND OVER THE THREE RAREST LEXEMES**, NOT AN OR OVER
 * FORTY — NEW1 bus 1025, measured, 22 Aug 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 60 semantic gold queries, every arm under production's own 15,000 ms
 * `statement_timeout`, same session, same box:
 *
 *     arm                                found/60  @1  @5  timeouts   p50
 *     A  what this function used to do        16    9  10   35 (58%)  15,013 ms
 *     C  same, all-common fallback DELETED     0    0   0   60 (100%) 15,019 ms
 *     D  rarest-3 ANDed        <- SHIPPED     34   17  22    4 ( 7%)     815 ms
 *     E  rarest-3 ORed                         8    4   7   51        15,016 ms
 *
 * **2.1x the recall, 18x faster at p50, 9x fewer timeouts.** And two results
 * that mattered more than the winner:
 *
 * **Deleting the all-common fallback is the WORST arm** (C: 100% timeouts, zero
 * gold), so the proposal to remove it is refuted rather than deferred. The
 * fallback was never what cost the time.
 *
 * **Arm E says it is the OR, not the lexeme count**: three ORed lexemes still
 * timed out 51 times in 60. `ORDER BY ts_rank` must read the `full_text_tsv` of
 * every matching row, and an OR over any number of terms makes that match set
 * enormous — the 781,289 ms measurement in the note below is the same mechanism
 * at 40 terms.
 *
 * **The control is the number that decides how much any of this matters.** Arm
 * B, dense-only, reached **0 of 60** — those authorities have no chunk at all.
 * For High Court concept queries the lexical arm is not one half of a hybrid, it
 * is the whole of search. That is a coverage fact about the product and it
 * belongs in launch language before any latency number does.
 *
 * What the AND costs, stated plainly: a judgment matching two of the three
 * rarest terms is no longer reached. That is a real recall loss against arm A's
 * OR — except that arm A timed out 58% of the time and reached 16, and this
 * reaches 34. The loss is theoretical; the gain is measured.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * (Historical, and still true of why the ORIGINAL AND-first pass exists)
 * ─────────────────────────────────────────────────────────────────────────────
 *
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
/**
 * How many of the rarest lexemes the relaxed pass ANDs together.
 *
 * Three, from NEW1's measurement rather than from taste, and explicitly ONE
 * POINT rather than an optimum: *"an optimum on a grid edge is not an
 * optimum"*. If this is tuned it should be swept against the same 60 queries,
 * not argued.
 */
const SPARSE_RARE_LEXEMES = 3;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BOUND ON THE RANKED SET — WHAT THE 96 MiB OUT-OF-MEMORY ACTUALLY NEEDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `statement_timeout` bounds TIME. It does not bound MEMORY, and the incident
 * that produced this constant was not slow — it 500'd:
 *
 *     PostgresError: out of memory   code 53200
 *     "Failed on request of size 100663296 in memory context ExecutorState"
 *
 * Two mechanisms have been proposed and BOTH are refuted by measurement, which
 * is why this bound is stated in terms of the match SET and not of either:
 *
 *   * *one pathological judgment whose tsvector detoasts to 96 MiB* — NEW1
 *     measured the corpus (bus 1063): no tsvector exceeds 4 MiB and the largest
 *     detoasts to about 388 KiB. No such judgment exists.
 *   * *the `ORDER BY ts_rank` sort growing its memtuples array* — refuted here.
 *     `EXPLAIN (ANALYZE, BUFFERS)` on the real shape reports **`Sort Method:
 *     top-N heapsort  Memory: 31kB`**. The sort is bounded by the `LIMIT` and
 *     is three orders of magnitude too small.
 *
 * What is NOT refuted, and is measured, is that everything else in this plan
 * scales with the number of MATCHING ROWS, in `ExecutorState`, which is the
 * context the error names. On a match set of 13,492 rows the arm read 42,797
 * blocks (~334 MB) and took 9,018 ms, because `ts_rank` detoasts the tsvector
 * of every matching row.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE PLANNER CANNOT HELP, BY CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The tsquery is built INSIDE the query from a bind parameter, so the planner
 * never sees the lexemes. `EXPLAIN` returns the identical plan and the identical
 * estimate — **`rows=84744`** — for every query, against measured upper bounds
 * of:
 *
 *     anticipatory bail / dowry / harassment      295,681      3.5x the estimate
 *     appeal / judgment                         3,670,878       43x
 *     court                                    16,965,472      200x
 *
 * So there is no statistics fix and no plan hint. The size has to be bounded by
 * us, from data we already hold.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY DOCUMENT FREQUENCY IS THE RIGHT BOUND, AND WHY 0.05
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The lexemes are ANDed, so **the match set cannot exceed the document count of
 * the RAREST of them.** That is a hard upper bound, it is already read by this
 * function from `lexeme_document_frequency`, and it costs one index scan.
 *
 * 0.05 is ~935,000 documents. At the measured 0.67 ms per ranked row that is
 * over ten minutes of `ts_rank` — far outside any request budget and squarely
 * inside the region where a match-set-proportional allocation reaches tens of
 * MiB. The threshold is stated as an upper bound on a cost that was measured
 * before it was chosen, not fitted to an outcome afterwards.
 *
 * **This does not delete the all-common fallback.** NEW1 measured that removing
 * it is the worst available arm (bus 1025: 100% timeouts, zero gold). The
 * fallback still runs and still ranks — it is only refused when its own rarest
 * term is common enough that the ranking could not have completed anyway. A
 * query refused here previously returned a 500 or a timeout; it now returns the
 * dense arm's results and says `sparse_unbounded`, which is a degradation the
 * contract already knows how to render and an advocate can act on.
 */
const SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY = 0.05;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AB-2 — THE BOUND WAS ASKING THE WRONG QUESTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * {@link SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY} answers *"is this lexeme
 * globally common"*. The question an advocate's request actually poses is
 * *"is this query unsafe over THIS population"* — and `filters` is a parameter
 * of the very function that refuses, sitting unread.
 *
 * NEW3 measured `bail` refused inside a court+month window. **Measured again
 * here, 30 August 2026, across eight scopes, `rarestDf` for `bail` was
 * `0.25773984261292154` in ALL EIGHT** — unfiltered, in one court, and in an
 * Allahabad July-2026 window holding **54 documents**. The refusal is a
 * property of the word and of nothing else.
 *
 * **What the refusal was protecting, measured.** The exact query it refuses,
 * run against that 54-document window:
 *
 *     Limit > Sort > Index Scan using judgments_date_court_idx
 *     Index Cond: judgment_date >= '2026-07-01' AND <= '2026-07-31'
 *                 AND court = 'Allahabad High Court'
 *     Rows Removed by Filter: 53
 *     Execution Time: 18.204 ms
 *
 * Eighteen milliseconds. The guard is honest about unfiltered `bail` and
 * nonsense about this one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COST CURVE THE NEW BOUND IS SET FROM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `bail`, filter-first, measured on this box 30 August 2026 — population, the
 * capped population probe, and the full filtered rank:
 *
 * | population | probe | rank | plan |
 * | --- | --- | --- | --- |
 * | 54 | 2.5 ms | 12 ms | Index Scan `judgments_date_court_idx` |
 * | 5,489 | 2.5 ms | 1,363 ms | Index Scan `judgments_date_court_idx` |
 * | 12,827 | 1.3 ms | 3,503 ms | Index Scan `judgments_court_idx` |
 * | 38,379 | 3.7 ms | 13,940 ms | BitmapAnd court + `full_text_tsv` |
 * | 107,941 | 12.6 ms | 12,891 ms | BitmapAnd date/court + `full_text_tsv` |
 * | ≥250,000 | 27.3 ms | 11,265 ms | Gather Merge over the same BitmapAnd |
 *
 * Two things fall out. **Ranking costs about 1 ms per matched row** —
 * `0.2577 × 12,827 = 3,305` rows against 3,503 ms, and `0.2577 × 5,489 = 1,414`
 * against 1,363 ms — which agrees with the 0.67 ms/row this file already
 * records. And **the probe is cheap at every size measured**, because a capped
 * `LIMIT` on an existing sargable index cannot degrade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS DESIGN AND NOT THE OTHER THREE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **A per-court/month counts table.** `coverage_cell` already exists and was
 *   the obvious source. It is court × YEAR, and its `held` was measured on
 *   19 August: admission would then depend on a stale artifact owned by a
 *   different concern, and a month-scoped query would be judged on a year.
 * - **Ask the planner.** `EXPLAIN` from the request path costs a second parse
 *   and returns an estimate this file has already measured as wrong by 200x
 *   (`rows=84744` against 16,965,472).
 * - **Drop the guard and rely on `statement_timeout`.** That is the site-stall
 *   behaviour, re-bought.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT CANNOT MAKE ANY QUERY WORSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The probe runs **only when the corpus-wide rule has already refused, and only
 * when a narrowing filter is present.** A query admitted today never touches
 * this code and pays nothing. A query refused today either becomes admitted or
 * stays refused with one extra bounded index probe. The corpus-wide rule is a
 * ceiling that is never raised: this can only ADMIT more, and only inside a
 * population it has counted.
 */
const FILTERED_ADMISSION_BUDGET_MS = 5_000;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COST IS PER ELIGIBLE ROW, NOT PER MATCHED ROW — AND THE FIRST VERSION OF
 * THIS BOUND GOT IT WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The bound was first written as `rarestDf × population ≤ maxRankedRows`, which
 * is the natural reading of "how many rows will `ts_rank` read". It admitted the
 * 54-document court-month `bail` — and that query then took **10,799 ms**.
 *
 * The plan says why, and it is the mistake this repository has already recorded
 * once. The hand-written `EXPLAIN` that justified the bound inlined
 * `to_tsquery('english','bail')` as a literal, so the planner could cost the
 * match and chose `judgments_date_court_idx`: 18.204 ms. **The real query builds
 * its tsquery inside a CTE from `string_agg`, so the planner cannot see it** —
 * exactly the condition {@link SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY}'s note
 * describes — and it picked something else entirely:
 *
 *     Bitmap Heap Scan on judgments
 *       Rows Removed by Index Recheck: 471836
 *       Heap Blocks: exact=1651 lossy=64527
 *       Buffers: shared hit=1815415 read=629413
 *       ->  BitmapAnd
 *             ->  Bitmap Index Scan on judgments_full_text_idx   rows=4518732
 *             ->  Bitmap Index Scan on judgments_judgment_date_idx  rows=96074
 *       Filter: court = 'Allahabad High Court'   Rows Removed: 26237
 *
 * It read four and a half million `bail` postings and applied the COURT as a
 * heap filter, to return one row out of a 54-document window.
 *
 * So admission alone was never the fix. {@link rankWithinBoundedPopulation}
 * fences the population first, and the cost of that plan is proportional to the
 * ELIGIBLE rows it reads, not to the matched ones. Measured, filter-first:
 * 54 rows / 12 ms · 5,489 / 1,363 ms · 12,827 / 3,503 ms — **0.22, 0.248 and
 * 0.27 ms per eligible row.** One constant, three populations, no fitting.
 */
const MEASURED_MS_PER_ELIGIBLE_ROW = 0.25;

/**
 * The most judgments a FILTERED query may be admitted to scan.
 *
 * 20,000 at the measured rate is the 5,000 ms budget, against a
 * `CORE_STATEMENT_TIMEOUT_MS` of 10,000 — roughly a factor of two of headroom on
 * a box also running the embedding fleet. It admits the 12,827-document small
 * High Court and the 5,489-document court-month, and refuses the 38,379-document
 * Supreme-Court-wide `bail`, which is a genuinely broad question and is told so.
 *
 * **Note it does not consult `rarestDf` at all.** The old form did, and that was
 * the error above: the term's frequency decides how many rows COME BACK, and the
 * population decides how many are READ. The budget is spent on reading.
 */
export const FILTERED_MAX_ELIGIBLE_ROWS = Math.round(
  FILTERED_ADMISSION_BUDGET_MS / MEASURED_MS_PER_ELIGIBLE_ROW,
);

/** Does this request narrow the corpus at all? An empty filter set cannot. */
function narrowsPopulation(filters: SearchFilters): boolean {
  return (
    filters.court !== undefined ||
    filters.courts !== undefined ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined ||
    filters.caseType !== undefined
  );
}

/**
 * Count the eligible population, stopping at `cap`.
 *
 * `SELECT 1 ... LIMIT cap` inside a subquery so Postgres can stop early: the
 * question is never "how many are there" but "are there more than `cap`", and
 * counting past the answer is work nobody reads. Every predicate is the SAME
 * one the ranker will apply, `courtWhere` included, so the number cannot
 * describe a different population from the one being admitted.
 *
 * Uses `judgment_date` range predicates rather than `date_part(year, ...)`
 * precisely so `judgments_date_court_idx` stays usable — the EXPLAIN above is
 * the receipt.
 */
export async function countBoundedPopulation(
  sql: Sql,
  /**
   * The eligibility predicate, already composed by the caller and ANDed onto
   * `WHERE true`.
   *
   * A FRAGMENT rather than a `SearchFilters`, because the two routes that share
   * this bound do not share an eligibility. The hybrid arm screens unsafe body
   * text before it will rank a document; the structured route deliberately does
   * NOT, because a `judge:` or `cite:` query resolves IDENTITY fields and
   * identity is not damaged by a body that failed to extract
   * (`qlang/compile.ts`, `StructuredHit.bodyText`). Forcing one predicate on
   * both would silently drop rows from the structured route, which is the one
   * failure `CITATION_HARNESS.md` holds at a zero threshold.
   *
   * So the BOUND lives here exactly once — the cap, the early-stopping `LIMIT`,
   * and the "capped proves only *at least cap*, and unknown is not small" rule
   * — while each caller counts the population it is actually about to execute
   * over. A probe that counted a different population from the one executed
   * would be worse than no probe: it would be a number that reads like evidence.
   */
  where: Frag,
  cap: number,
): Promise<{ population: number; capped: boolean }> {
  const rows = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM (
      SELECT 1
      FROM judgments j
      WHERE true
        ${where}
      LIMIT ${cap}
    ) bounded`;
  const population = Number(rows[0]!.n);
  return { population, capped: population >= cap };
}

/** The hybrid arm's eligibility: the request's filters, plus the body-text screen. */
function hybridEligibility(sql: Sql, filters: SearchFilters): Frag {
  return sql`
        ${andBodyTextSafe(sql)}
        ${courtWhere(sql, filters)}
        ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
        ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
        ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}`;
}

/**
 * Rank inside a population that has already been COUNTED and found small.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `MATERIALIZED`, AND WHY IT IS THE WHOLE FIX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `MATERIALIZED` is an optimisation FENCE. Without it Postgres inlines the CTE
 * and is free to reorder — which is precisely how a 54-document window came to
 * be answered by reading 4,518,732 `bail` postings, because the planner cannot
 * cost a tsquery it cannot see and guessed that the full-text index was the
 * selective one. With the fence the structured predicates run FIRST, on
 * `judgments_date_court_idx`, and the tsvector is only ever consulted for rows
 * that already passed them.
 *
 * The plan is therefore chosen by construction rather than by the planner's
 * luck with an opaque parameter. That matters more than the milliseconds: the
 * fast plan was reproducible from an inlined `EXPLAIN` and the slow one was
 * what production actually ran, and nothing in between reported a fault.
 *
 * **`LIMIT` inside the fence is a second belt.** The caller has already proved
 * the population is at or under {@link FILTERED_MAX_ELIGIBLE_ROWS}, so this can
 * only bind if the corpus grew between the probe and the rank — in which case
 * truncating is the correct failure, because the alternative is an unbounded
 * scan the request never agreed to.
 *
 * Row identity is carried, not the tsvector, so the fence holds ids and the
 * vectors are fetched by primary key for the rows that survive.
 */
async function rankWithinBoundedPopulation(
  sql: Sql,
  lexemes: { lexeme: string; df: string }[],
  filters: SearchFilters,
): Promise<Ranked[]> {
  const rows = await sql<{ id: string }[]>`
    WITH eligible AS MATERIALIZED (
      SELECT j.id
      FROM judgments j
      WHERE true
        ${andBodyTextSafe(sql)}
        ${courtWhere(sql, filters)}
        ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
        ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
        ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
      LIMIT ${FILTERED_MAX_ELIGIBLE_ROWS}
    ),
    q AS (
      SELECT to_tsquery(
        'english',
        string_agg(quote_literal(lexeme), ' & ')
      ) AS tsq
      FROM unnest(${lexemes.map((l) => l.lexeme)}::text[]) AS lexeme
    )
    -- The scalar-subquery form and the total order, for the reasons the
    -- corpus-wide ranker in {@link sparseAny} records at length. Both sites had
    -- the same two defects because they are the same query with a different
    -- population in front of it, and fixing one would have left the other to be
    -- rediscovered. THE \`MATERIALIZED\` FENCE ABOVE IS UNTOUCHED: it is what
    -- makes the structured predicates run first, and this changes only how the
    -- tsquery reaches the scan and how ties are settled.
    SELECT j.id
    FROM eligible e
    JOIN judgments j ON j.id = e.id
    WHERE (SELECT tsq FROM q) IS NOT NULL
      AND j.full_text_tsv @@ (SELECT tsq FROM q)
    ORDER BY ts_rank(j.full_text_tsv, (SELECT tsq FROM q)) DESC, j.judgment_date DESC, j.id DESC
    LIMIT ${CANDIDATE_DEPTH}`;
  return rows.map((r, i) => ({ judgmentId: r.id, rank: i + 1 }));
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE LEXICAL ADMISSION RULE, SHARED — NOT TWO THAT AGREE TODAY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The lexemes this query would rank, and the verdict on whether ranking them is
 * bounded. Lifted out of {@link sparseAny} unchanged so the STRUCTURED route
 * (`qlang/`) executes its `full_text_tsv` work under the same rule rather than
 * under a second approximation of it.
 *
 * **Why that mattered, measured 2 September 2026 through the real route.**
 * `court:"<a real court>" AND bail` took **15,086 / 15,091 / 15,100 ms**, all
 * of it inside `structuredMs`, and returned `degraded: []`. The structured path
 * compiled the bare term to `j.full_text_tsv @@ plainto_tsquery('english','bail')`
 * ANDed with the court predicate and had NEITHER protection this file already
 * had: no document-frequency admission — the same word corpus-wide is refused
 * here in about a millisecond — and no `MATERIALIZED` population fence. It ran
 * to `statement_timeout` every time. Two mechanisms for one question is how a
 * bound that is correct in one file becomes absent in another, so there is now
 * one.
 *
 * The verdict is returned rather than acted on, because the two callers do
 * different things with a refusal: the hybrid arm returns no candidates and
 * lets the dense arm answer, and the structured route has no other arm and must
 * say so on the wire.
 */
export type LexicalAdmission = {
  /** The rarest lexemes kept, with their measured document frequency. */
  readonly lexemes: { lexeme: string; df: string }[];
  /** `min(df)` across {@link lexemes}. `Infinity` when nothing was measurable. */
  readonly rarestDf: number;
  /** May this be ranked at all? */
  readonly admitted: boolean;
  /** Did the corpus-wide rule admit it on its own, without a filtered probe? */
  readonly corpusWideAdmitted: boolean;
  /** The filtered probe's count, when one ran. */
  readonly population?: number;
  /** Did the probe hit its cap? A capped probe proves only "at least cap". */
  readonly populationCapped?: boolean;
};

/**
 * Choose the lexemes and decide whether ranking them is bounded.
 *
 * `eligibility` is the caller's own population predicate — see
 * {@link countBoundedPopulation} for why it is a fragment and not a filter set.
 * `undefined` means the request narrows nothing, in which case the eligible
 * population IS the corpus and the probe would re-derive, at a cost, the number
 * the corpus-wide rule has just used.
 */
export async function admitLexical(
  sql: Sql,
  query: string,
  eligibility: Frag | undefined,
  signals?: RetrievalSignals,
): Promise<LexicalAdmission> {
  /**
   * The lexeme selection, lifted out of the ranking query so its answer can be
   * INSPECTED before anything is ranked.
   *
   * It is the same three CTEs, unchanged, and it is cheap: an index scan on
   * `lexeme_document_frequency` per term, measured at single-digit milliseconds.
   * Splitting it costs one round trip and buys the only bound available.
   */
  const lexemes = await sql<{ lexeme: string; df: string }[]>`
    WITH scored AS (
      SELECT
        l.lexeme,
        coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
      FROM unnest(to_tsvector('english', ${query})) AS l
      LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ),
    discriminating AS (
      SELECT lexeme, df FROM scored WHERE df <= ${SPARSE_MAX_DOCUMENT_FREQUENCY}
    )
    SELECT lexeme, df::text AS df FROM (
      SELECT lexeme, df FROM discriminating
      UNION ALL
      SELECT lexeme, df FROM scored WHERE NOT EXISTS (SELECT 1 FROM discriminating)
    ) candidates
    ORDER BY df ASC, length(lexeme) DESC
    LIMIT ${SPARSE_RARE_LEXEMES}`;

  if (lexemes.length === 0) {
    return { lexemes, rarestDf: Infinity, admitted: false, corpusWideAdmitted: false };
  }

  /**
   * ANDed terms, so the rarest bounds the match set. `df = 0` means the corpus
   * sample never saw the lexeme, which `scored` above treats as RARE on purpose
   * — failing that way costs latency, failing the other way costs recall, and a
   * recall failure leaves no trace.
   */
  const rarestDf = Math.min(...lexemes.map((l) => Number(l.df)));
  // Recorded whether or not it refuses. A df only ever published on refusal
  // would make the field's presence the signal, and then nobody could tell a
  // query that comfortably passed from one that nearly did not.
  if (signals && Number.isFinite(rarestDf)) signals.sparseRarestDf = rarestDf;

  if (rarestDf <= SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY) {
    return { lexemes, rarestDf, admitted: true, corpusWideAdmitted: true };
  }

  /**
   * AB-2. The corpus-wide rule has refused; ask the question it could not.
   */
  if (eligibility === undefined) {
    return { lexemes, rarestDf, admitted: false, corpusWideAdmitted: false };
  }
  const { population, capped } = await countBoundedPopulation(
    sql,
    eligibility,
    FILTERED_MAX_ELIGIBLE_ROWS + 1,
  );
  if (signals) {
    signals.filteredPopulation = population;
    signals.filteredPopulationCapped = capped;
  }
  // A capped probe proves only "at least `cap`", which is never a reason to
  // admit. Unknown is not small.
  const admitted = !capped && population <= FILTERED_MAX_ELIGIBLE_ROWS;
  if (signals) signals.filteredAdmission = admitted ? 'admitted' : 'refused';
  return {
    lexemes,
    rarestDf,
    admitted,
    corpusWideAdmitted: false,
    population,
    populationCapped: capped,
  };
}

async function sparseAny(
  sql: Sql,
  query: string,
  filters: SearchFilters,
  onDegrade?: (arm: DegradedArm) => void,
  /** Out-parameter: the refusal cause, carried to the response rather than re-derived. */
  signals?: RetrievalSignals,
): Promise<Ranked[]> {
  /**
   * The lexeme choice and the admission verdict, from the one shared rule —
   * {@link admitLexical}. The filtered probe is offered an eligibility only when
   * the request actually narrows the corpus: with no filters the eligible
   * population IS the corpus, and the probe would re-derive, at a cost, the
   * number the corpus-wide rule has just used.
   */
  const admission = await admitLexical(
    sql,
    query,
    narrowsPopulation(filters) ? hybridEligibility(sql, filters) : undefined,
    signals,
  );
  const { lexemes } = admission;

  if (lexemes.length === 0) return [];

  if (!admission.corpusWideAdmitted) {
    if (!admission.admitted) {
      onDegrade?.('sparse_unbounded');
      return [];
    }
    return rankWithinBoundedPopulation(sql, lexemes, filters);
  }

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
      -- Three, not forty, and ANDed rather than ORed. NEW1 bus 1025 measured
      -- the alternatives; the note above this function carries the table.
      LIMIT ${SPARSE_RARE_LEXEMES}
    ),
    q AS (
      SELECT to_tsquery('english', string_agg(quote_literal(lexeme), ' & ')) AS tsq FROM lex
    )
    -- \`(SELECT tsq FROM q)\` RATHER THAN A JOIN AGAINST \`q\`, AND THE REASON IS
    -- THE PLAN, NOT THE STYLE.
    --
    -- Written as \`FROM judgments j, q\` this is a join, so the planner builds a
    -- Nested Loop with the one-row aggregate as the outer relation and the
    -- \`judgments\` scan as the inner. A parallel-aware scan cannot sit on the
    -- inner side of a nested loop, so the whole match set is read by ONE
    -- backend — and the cost here is \`ts_rank\` detoasting the \`full_text_tsv\`
    -- of every matched row, which is exactly the work that parallelises.
    --
    -- As an uncorrelated scalar subquery it becomes an InitPlan, evaluated once
    -- before the scan, and the scan is then free to be a Parallel Bitmap Heap
    -- Scan. Measured on this box, 2 September 2026, warm, over the three fixed
    -- Gate-S1 research queries:
    --
    --   | matched rows | join (1 backend) | InitPlan (4 workers) |
    --   | ---          | ---              | ---                  |
    --   | 13,533       | 336 ms           | 105 ms               |
    --   | 21,635       | 878 ms           | 152 ms               |
    --   | 40,031       | 1,490 ms         | 207 ms               |
    --
    -- Same index, same match set, same ranks. The buffers are identical
    -- (322,936 against 323,224); they are simply read by five processes rather
    -- than one. NOTHING about admission, lexeme choice or ranking moves.
    --
    -- The three InitPlan scans below all read the same one-row in-memory CTE at
    -- ~0.03 ms total, so naming \`q\` three times costs nothing measurable.
    SELECT j.id
    FROM judgments j
    WHERE (SELECT tsq FROM q) IS NOT NULL
      AND j.full_text_tsv @@ (SELECT tsq FROM q)
      ${andBodyTextSafe(sql)}
      ${courtWhere(sql, filters)}
      ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
      ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
    -- THE TIE-BREAK IS A CORRECTNESS FIX, NOT NEATNESS — AND THE COLUMN CHOICE
    -- WAS MEASURED, NOT ASSUMED.
    --
    -- \`ts_rank\` saturates. Measured here on the fixed suite: for
    -- \`corroboration & dying & declaration\`, **87 judgments score exactly
    -- 0.9999997**, the maximum, and \`LIMIT 50\` takes fifty of them. Which
    -- fifty was decided by heap order — so the same request answered by a
    -- different plan returned a different 37 authorities, and neither set was
    -- more correct. An advocate cannot see that and cannot act on it. It also
    -- makes the parallel plan above safe by construction rather than by luck: a
    -- Gather Merge over per-worker heapsorts breaks ties any way it likes.
    --
    -- **\`j.id\` ALONE WAS TRIED FIRST AND IT COST GOLD.** A uuid is total but
    -- uncorrelated with anything an advocate wants, and on the TRAIN split it
    -- displaced three targets that the previous heap order had happened to
    -- return — including \`2025:RJ-JP:22340-DB\`, a neutral citation that names
    -- NINE connected matters, where the tie is between nine equally-cited
    -- documents and uuid order picked a different one.
    --
    -- \`judgment_date DESC\` is the repo's own answer, already in use one
    -- function below: *"the id makes it total, so two identical requests cannot
    -- return two different pages"*. Among authorities the ranker cannot separate,
    -- the later one is the one an advocate wants first, and \`id DESC\` after it
    -- keeps the order total. \`judgment_date\` is \`NOT NULL\` (0001, and zero
    -- nulls measured), so there is no NULLS-FIRST trap to guard against.
    ORDER BY ts_rank(j.full_text_tsv, (SELECT tsq FROM q)) DESC, j.judgment_date DESC, j.id DESC
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
        chunk_text: string | null;
        distance: number;
        char_offset: number | null;
        char_length: number | null;
      }[]
    >`
      WITH chunk_candidates AS MATERIALIZED (
        SELECT c.judgment_id, c.chunk_text, c.text_quality, c.char_offset, c.char_length,
               c.embedding <=> ${queryVector}::vector AS d
        FROM judgment_chunks c
        ORDER BY c.embedding <=> ${queryVector}::vector
        LIMIT ${annDepth}
      ),
      -- NEW1's tranche. A SECOND index over a DIFFERENT set of documents, not a
      -- denser sampling of the same one: 81,720 documents against
      -- judgment_chunks' 40,161, overlapping on 10,007, so the union reaches
      -- 111,874 -- 2.786x. Measured 28 Aug 2026, both tables counted directly.
      --
      -- Its own MATERIALIZED CTE with its own ORDER BY ... LIMIT because that is
      -- the only shape new1_tranche_passages_hnsw can accelerate; folding the
      -- two arms into one ORDER BY over a union would scan both sets of vectors
      -- and lose both indexes.
      tranche_candidates AS MATERIALIZED (
        SELECT p.judgment_id, p.char_offset, p.body_length,
               p.embedding <=> ${queryVector}::vector AS d
        FROM new1_tranche_passages p
        ORDER BY p.embedding <=> ${queryVector}::vector
        LIMIT ${annDepth}
      ),
      candidates AS (
        SELECT judgment_id, chunk_text, text_quality, char_offset, char_length, d
        FROM chunk_candidates
        UNION ALL
        -- The tranche stores no text and no per-passage quality, so both are
        -- reconstructed rather than invented.
        --
        -- char_offset = -1 is chunk.ts's "the position could not be VERIFIED",
        -- and chunk.ts is explicit that it must never be treated as a literal
        -- offset -- 7,535 of 418,116 rows, 1.802%. judgment_chunks spells the
        -- same state NULL, so it is mapped to NULL here and the whole pipeline
        -- below sees one convention instead of two. A row in that state still
        -- ranks -- its vector is real -- it just carries no quotable passage,
        -- which is the same honest degrade a chunk with no backfilled offset
        -- already makes.
        --
        -- text_quality NULL takes the multiplier of 1.0 below, which is what an
        -- unscored chunk already gets. Deliberate, not a shortcut: the damage
        -- refusal for both arms alike is andBodyTextSafe, on the JUDGMENT.
        SELECT t.judgment_id,
               NULL::text AS chunk_text,
               NULL::numeric AS text_quality,
               CASE WHEN t.char_offset >= 0 THEN t.char_offset END AS char_offset,
               CASE WHEN t.char_offset >= 0 THEN t.body_length END AS char_length,
               t.d
        FROM tranche_candidates t
      )
      SELECT c.judgment_id,
             -- "sourceText.slice(offset, offset + bodyLength) is exactly the
             -- body" -- chunk.ts's own words, and the invariant it VERIFIES
             -- before it will store an offset at all. So the tranche's passage
             -- is recovered from the judgment rather than stored twice, and
             -- what comes back is the verified span rather than
             -- judgment_chunks.chunk_text, which carries a synthesised heading
             -- in front of the same body.
             COALESCE(
               c.chunk_text,
               CASE WHEN c.char_offset IS NOT NULL AND c.char_length IS NOT NULL
                    THEN substr(j.full_text, c.char_offset + 1, c.char_length) END
             ) AS chunk_text,
             c.char_offset, c.char_length,
             -- Down-ranked, never excluded: damaged text is still the judgment.
             -- quality 1.0 leaves distance untouched; 0.5 costs it 50%. Unscored
             -- chunks (no Latin tokens, e.g. Devanagari) are treated as clean
             -- rather than penalised for being unassessable.
             c.d * (2 - LEAST(COALESCE(c.text_quality, 1.0), 1.0)) AS distance
      FROM candidates c
      JOIN judgments j ON j.id = c.judgment_id
      WHERE TRUE
        -- P0. A vector built from a glyph dump is a real vector pointing at
        -- nothing, and text_quality does not catch it: 22 of 24 chunks whose
        -- judgment is PROVEN damaged score above the 0.85 floor and take the
        -- 1.0 multiplier above (NEW2, bus 1005). The multiplier stays as a
        -- ranking nudge; the refusal is this line.
        ${andBodyTextSafe(sql)}
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
  /**
   * Ranking and evidence are tracked SEPARATELY now, and they used to be the
   * same Set by accident.
   *
   * `bestChunk.has(...)` was the dedup key, which was correct only while every
   * matched row was guaranteed to carry text. A tranche passage whose offset
   * was never verified ranks but cannot be quoted, and under the old shape its
   * judgment would have been re-admitted on every later row -- a duplicate in
   * the ranked list, which RRF would then have scored twice.
   */
  const seen = new Set<string>();
  for (const row of rows) {
    // Rows arrive nearest-first, so the first sighting of a judgment is its best chunk.
    if (seen.has(row.judgment_id)) continue;
    seen.add(row.judgment_id);
    // No text means no evidence, never empty evidence: `''` would read
    // downstream as "we looked and the passage was blank".
    if (row.chunk_text != null) {
      bestChunk.set(row.judgment_id, {
        text: row.chunk_text,
        charOffset: row.char_offset,
        charLength: row.char_length,
      });
    }
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
 * The party-name lookup, on the trigram index, under its OWN small budget.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE BUDGET IS THE DESIGN AND NOT A PRECAUTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * {@link exactCaseTitle} matches a normalised title byte-for-byte, which almost
 * never fires: an advocate types `Garware Nylons v Pimpri Chinchwad` and the
 * corpus holds `M/S GARWARE NYLONS LTD. versus PIMPRI CHINCHWAD MAHANAGAR
 * PALIKA AND ORS.` So case-name search fell entirely to the sparse full-text
 * arm, measured at **p50 17.1s, p95 28.2s, every response degraded** — the
 * worst path in the benchmark once citations and sections were routed.
 *
 * `judgments_case_title_trgm` was already there and unused by search.
 * `word_similarity` — how well the query matches some CONTIGUOUS EXTENT of the
 * title — is the right operator, because the stored title carries `M/S`,
 * `LTD.` and `AND ORS.` that the advocate never types. It scored the correct
 * judgment at 0.750 in 1,092 ms where plain `similarity()` took 13,360 ms.
 *
 * **But it is fast only when the party names are distinctive.** Measured on the
 * same box: `Garware Nylons v Pimpri Chinchwad` 3.1s, and `Allen Berry & Co v
 * Union of India` **cancelled at 30s** — `Union of India` is in a large share
 * of Indian case titles, so its trigrams select an enormous candidate set. An
 * unbudgeted trigram route would simply move the slowness, not remove it.
 *
 * So it gets a budget of its own, smaller than the request's. When it hits, it
 * replaces a 17–28s ranker with a ~1–3s index probe. When it does not, it costs
 * {@link CASE_TITLE_BUDGET_MS} and the query falls through to exactly the
 * pipeline that handles it today. The worst case is bounded and small; the best
 * case is most of the request.
 *
 * `SET LOCAL` inside a transaction, so the ceiling applies to this statement
 * and is discarded with it — never leaked onto a pooled connection that the
 * next request will reuse.
 */
/**
 * Exact title first, trigram second — the cheaper and stricter answer wins.
 *
 * An exact normalised match is unambiguous and rides a btree; there is no
 * reason to run a similarity probe when it fires. The trigram probe is the
 * fallback for the ordinary case, where the advocate typed the party names and
 * the corpus holds the registry's full title.
 */
async function caseNamePins(
  sql: Sql,
  queryText: string,
  filters: SearchFilters,
  limit: number,
  signals?: RetrievalSignals,
  /**
   * How long the trigram probe may run. Defaulted to the explicit-case-name
   * budget so every existing caller is unchanged.
   */
  budgetMs: number = CASE_TITLE_BUDGET_MS,
): Promise<string[]> {
  /**
   * The exact set takes the PAGE, not `floor(limit/2)` slots.
   *
   * NEW1's second recommendation, and it follows from the first: when the exact
   * title match IS the answer, budgeting two slots for it means an advocate
   * asking for a title printed on 14 judgments is shown two of them and twelve
   * unrelated fuzzy matches. 29 of 229 golds sat at probe rank 3-20 and could
   * not be pinned at all under the old budget.
   *
   * The trigram probe still runs when the exact route finds NOTHING, which is
   * the case it was written for - a title the advocate typed approximately.
   */
  const exact = await exactCaseTitle(sql, queryText, filters);
  if (signals) signals.exactTitleCandidates = exact.length;
  if (exact.length > 0) return exact;
  return caseTitleTrigram(sql, queryText, filters, limit, budgetMs);
}

const CASE_TITLE_BUDGET_MS = 2500;

/**
 * The same probe, on weaker evidence, and therefore on a shorter clock.
 *
 * A `case_name` query carries an explicit `v` — the advocate has SAID this is a
 * case. A `party_name` query is inferred from shape alone, so it is wrong more
 * often, and the cost of being wrong is paid by whoever typed it.
 *
 * **Measured, 30 August 2026.** Six party-name fixtures drawn from six different
 * courts resolved their own judgment at p50 33–113 ms, so 1,200 ms leaves an
 * order of magnitude of headroom for every case the probe can actually answer.
 * What it cuts is the case it cannot: `Ram Kumar` — two of the most frequent
 * tokens in Indian cause titles — burned the full 2,500 ms budget on a
 * `case_title ILIKE '%RAM%'` narrowing that is not a narrowing, and then
 * refused anyway. That query went from 0.9 ms to 2,566.7 ms when the routing
 * changed, which is a regression the routing fix caused and must pay for.
 *
 * It does not make that query GOOD — a common-name search still costs its budget
 * and still falls through. It bounds it. The residual is recorded in
 * `docs/ai/lcc-r12/search-battery.json` rather than left for someone to find.
 */
const PARTY_NAME_BUDGET_MS = 1200;

/**
 * The lowest `word_similarity` that may be PINNED at the top of the page.
 *
 * Measured over seven real advocate-style queries against the corpus: every
 * correct match scored 0.696–0.893, and the nearest wrong neighbours sat at
 * 0.39–0.59. 0.65 separates them with room on both sides, and erring high is
 * the safe direction — a query that pins nothing falls through to the ordinary
 * pipeline, while a wrong pin puts another party's case at rank 1.
 */
const CASE_TITLE_MIN_SIMILARITY = 0.65;

/**
 * The rarest word in the query, by MEASURED document frequency.
 *
 * **Not the longest.** `sparseAny`'s comment already records this lane
 * measuring and rejecting length as a proxy for rarity (bus 0664): `court` is
 * five characters and appears in 90.6% of documents. Repeating the mistake here
 * cost 3 of 7 lookups in testing — `Bharati Vidyapeeth v State of Maharashtra`
 * selected `MAHARASHTRA` (11 characters) over `VIDYAPEETH` (10), and narrowed
 * to a set of millions instead of a set of dozens. Reading
 * `lexeme_document_frequency` instead fixed the token on all seven.
 *
 * **Absent means rare**, the same direction the sparse arm chose and for the
 * same reason: a word nobody measured is far more likely to be a party's name
 * than a word the corpus is saturated with, and failing the other way costs
 * recall silently.
 */
async function rarestToken(sql: Sql, query: string): Promise<string | null> {
  const words = [
    ...new Set(
      query
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4),
    ),
  ];
  if (words.length === 0) return null;

  /**
   * **Each word is STEMMED before its frequency is looked up, because the table
   * is keyed by lexemes and not by words.**
   *
   * The first version of this passed `w.toLowerCase()` straight to
   * `lexeme_document_frequency`. That table is built from `to_tsvector` output,
   * so it holds `other`, not `others`; `anoth`, not `another`. Every inflected
   * word therefore missed, "absent means rare" fired, and the WORST possible
   * token was chosen as the best.
   *
   * Measured on `POONAM Vs STATE OF U.P. AND 4 OTHERS` — an ordinary registry
   * title — the chosen token was `OTHERS`, and the probe narrowed to every case
   * title in the corpus containing "others" and then exceeded its budget. NEW1's
   * launch benchmark saw the consequence from the outside: a query naming one
   * case returning a different case at the top of the page.
   *
   * `LEFT JOIN LATERAL ... LIMIT 1` takes the first lexeme a word produces.
   * A word that produces NONE is an english stopword — `AND`, `THROUGH`,
   * `AGAINST` — and is DROPPED rather than kept: it is absent from the table
   * because it is the commonest kind of word there is, which is the exact
   * opposite of what "absent" is allowed to mean here.
   *
   * Absent WITH a lexeme still means rare, and that direction is unchanged: a
   * party's surname the frequency sample never saw is genuinely rare, and
   * failing the other way costs recall silently.
   */
  const rows = await sql<{ word: string; lexeme: string | null; document_count: string | null }[]>`
    WITH w(word) AS (SELECT unnest(${words}::text[]))
    SELECT w.word, l.lexeme, f.document_count
      FROM w
      LEFT JOIN LATERAL (
        SELECT lexeme FROM unnest(to_tsvector('english', w.word)) AS lexeme LIMIT 1
      ) l ON TRUE
      LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme`;

  let best: string | null = null;
  let bestDf = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    if (r.lexeme === null) continue; // a stopword, not a rare word
    const df = r.document_count === null ? 0 : Number(r.document_count);
    if (df < bestDf) {
      bestDf = df;
      best = r.word;
    }
  }
  return best;
}

/**
 * Party-name lookup: narrow on the trigram index by the rarest word, then rank
 * what remains by `word_similarity`. Under its own budget throughout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NARROW-THEN-RANK, AND WHY THE POOL IS NOT CAPPED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * {@link exactCaseTitle} matches a normalised title byte-for-byte, which almost
 * never fires: an advocate types `Garware Nylons v Pimpri Chinchwad` and the
 * corpus holds `M/S GARWARE NYLONS LTD. versus PIMPRI CHINCHWAD MAHANAGAR
 * PALIKA AND ORS.` So case-name search fell entirely to the sparse full-text
 * arm — measured **p50 17.1s, p95 28.2s, every response degraded**, the worst
 * path in the benchmark once citations and sections were routed.
 *
 * `judgments_case_title_trgm` was already there and unused by search. An
 * `ILIKE` on one rare word rides it and is selective: 46–414 ms for five of
 * seven test queries, against 17–28 s through the ranker.
 *
 * **A `LIMIT` on the candidate pool was tried and removed.** Capping at 300
 * rows before ranking made the cap decide which candidates existed, and it
 * chose them in physical order — `U.O.I. v Jai Prakash Singh` missed its own
 * judgment because the right row was not among the arbitrary 300. That is the
 * same silent recall loss this file refuses in the sparse arm. Ranking the
 * whole `ILIKE` set is correct, and {@link CASE_TITLE_BUDGET_MS} is what makes
 * it safe: when the chosen word is not rare enough the query exceeds its budget
 * and the search falls through to the pipeline that handles it today.
 * `PRAKASH` did exactly that at 14,955 ms — bounded, honest, and no worse than
 * the behaviour it replaced.
 *
 * **Same-named cases are not disambiguated here and must not be.** The corpus
 * holds several `Kannadasan v State of Tamil Nadu` and several `Bharati
 * Vidyapeeth v State of Maharashtra`. This returns up to half the page so the
 * alternatives stay visible, rather than picking one reading for the advocate —
 * the rule `exactCitation` follows when a lookup is not unique.
 *
 * `SET LOCAL` inside a transaction, so the ceiling is discarded with the
 * statement and never leaks onto a pooled connection the next request reuses.
 */
async function caseTitleTrigram(
  sql: Sql,
  queryText: string,
  filters: SearchFilters,
  limit: number,
  budgetMs: number = CASE_TITLE_BUDGET_MS,
): Promise<string[]> {
  try {
    return await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = ${budgetMs}`);
      const token = await rarestToken(tx as unknown as Sql, queryText);
      if (token === null) return [];
      const rows = await tx<{ id: string }[]>`
        SELECT j.id
        FROM judgments j
        WHERE j.case_title ILIKE ${'%' + token + '%'}
          AND word_similarity(${queryText}, j.case_title) >= ${CASE_TITLE_MIN_SIMILARITY}
          ${courtWhere(tx as unknown as Sql, filters)}
          ${filters.dateFrom ? tx`AND j.judgment_date >= ${filters.dateFrom}` : tx``}
          ${filters.dateTo ? tx`AND j.judgment_date <= ${filters.dateTo}` : tx``}
          ${filters.caseType ? tx`AND j.case_type = ${filters.caseType}` : tx``}
        ORDER BY word_similarity(${queryText}, j.case_title) DESC
        LIMIT ${limit}`;
      return rows.map((r) => r.id);
    });
  } catch (error) {
    // Its own budget expiring on a word that is not rare enough is the expected
    // outcome, not a fault. Anything else is a defect and must not be hidden.
    if (!isQueryCanceled(error)) throw error;
    return [];
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SECTION QUERY IS AN INDEX LOOKUP, NOT A FULL-TEXT SEARCH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `section 302 IPC` was measured, through the real API on the 18,698,968-row
 * corpus, **still executing at 60 seconds** (LOCAL_CONTENDED). The mechanism is
 * the one {@link sparseAny}'s comment already names: `ORDER BY ts_rank(...)`
 * must read the `full_text_tsv` of every row the match set contains, and
 * `section`, `302` and `ipc` intersect on a very large one. It is not fixable
 * by tuning the ranker — a candidate cap does not help either, because the GIN
 * bitmap is built in full before any `LIMIT` applies (pool of 500 measured at
 * 10.2s, pool of 20,000 at 26.7s: the cost is finding the rows, not ranking
 * them).
 *
 * The query does not belong there at all. `judgment_statute_refs` is 862,594
 * rows with a btree on `(act_key, section_number)` — the same question, asked
 * of the index built to answer it:
 *
 * | | full-text | this |
 * | --- | --- | --- |
 * | IPC s.302 | >45,000 ms (cancelled) | 1,261 ms |
 * | NI Act s.138 | — | 943 ms |
 * | CrPC s.482 | — | 737 ms |
 * | BNS s.103 | — | 759 ms |
 *
 * **`judgments` is joined ONLY when a filter needs it.** With the join present
 * unconditionally, NI s.138 cost 8,050 ms against 943 ms without: every
 * matching reference has to be resolved to its judgment before five can be
 * returned. Ordering is therefore by `occurrences` — how much the judgment
 * actually turns on the provision — and the date tie-break is dropped rather
 * than paid for on every query that does not filter.
 *
 * **Coverage is 2.28% of the corpus and that is not hidden.** 426,473 of
 * 18,698,968 judgments carry any statute reference, because `sections.ts`
 * records a reference only where the court NAMED the act beside the section.
 * These pins are therefore an addition to the ranked results, never a
 * replacement for them — the remaining slots stay with the ordinary pipeline,
 * so a judgment the extractor missed is still reachable.
 */
async function sectionJudgments(
  sql: Sql,
  act: string,
  section: string,
  filters: SearchFilters,
  limit: number,
): Promise<string[]> {
  const needsJudgments =
    filters.court !== undefined ||
    filters.courts !== undefined ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined ||
    filters.caseType !== undefined;

  const key = canonicalAct(act);
  const rows = needsJudgments
    ? await sql<{ judgment_id: string }[]>`
        SELECT r.judgment_id
        FROM judgment_statute_refs r
        JOIN judgments j ON j.id = r.judgment_id
        WHERE r.act_key = ${key} AND upper(r.section_number) = ${section.toUpperCase()}
          ${courtWhere(sql, filters)}
          ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
          ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
          ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
        ORDER BY r.occurrences DESC
        LIMIT ${limit}`
    : await sql<{ judgment_id: string }[]>`
        SELECT r.judgment_id
        FROM judgment_statute_refs r
        WHERE r.act_key = ${key} AND upper(r.section_number) = ${section.toUpperCase()}
        ORDER BY r.occurrences DESC
        LIMIT ${limit}`;
  return rows.map((r) => r.judgment_id);
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
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ABSTAINING ON AMBIGUITY WAS THE DOMINANT CASE-TITLE FAILURE — NEW1 bus 1021
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This used to take `LIMIT 2` and return `null` unless exactly one row came
 * back, on `exactCitation`'s asymmetry: two matches means we do not know which
 * was meant, so pin neither. **The reasoning was right and the outcome was the
 * opposite of what it intended.**
 *
 * NEW1 decomposed 229 real case-title queries against frozen gold
 * `ba9357cba2fbf297`:
 *
 *     the title is UNIQUE in the corpus     155    rank 1 in 146    94.2%
 *     the title names 2+ judgments           74    rank 1 in   9    12.2%
 *     pooled - the 67.69% we were quoting   229                     67.69%
 *
 * 32.3% of real titles are printed on more than one judgment, and they are not
 * duplicates: `MANOHAR LAL Vs STATE OF HARYANA AND OTHERS` is **14** different
 * cases between 2012 and 2024. On every one of those this function abstained,
 * the query fell through to `caseTitleTrigram`, and because the query IS the
 * title **every twin scored `word_similarity` = 1.000** - so `ORDER BY
 * word_similarity DESC` was decided by physical row order. The advocate got an
 * arbitrary member of the set at rank 1, presented as the answer.
 *
 * **That is an identity claim we cannot support, which is exactly what
 * abstaining was meant to avoid.** Abstention did not produce silence; it
 * produced a guess one layer down.
 *
 * So: pin the WHOLE matched set, bounded, and let the ambiguity reach the
 * advocate as ambiguity - `exactCitation`'s own rule, which has always returned
 * a candidate list rather than picking. Simulated by NEW1 on the same gold:
 *
 *     s@1          67.69%  ->  83.41%
 *     coverage@5   71.62%  ->  95.63%
 *     latency      p50 1,608 ms / p95 19,196 ms  ->  p50 1 ms / p95 1 ms
 *
 * The latency collapse is not a bonus, it is the same fact: the exact route is
 * an index scan on `judgments_case_title_normalised_idx` at 0.8 ms, and every
 * one of those 74 queries was paying a 2,500 ms trigram probe to answer a
 * question the index had already answered.
 *
 * **Ordered by `judgment_date DESC, id`, and that is not a relevance claim.**
 * NEW1 measured three candidate tie-breaks against gold - date-descending puts
 * the gold judgment first in 20 of 74, `length(full_text) DESC` in 43 of 74,
 * physical order in 31 of 74 - and recommended AGAINST the one that scores best,
 * because none of them is relevance and picking the highest-scoring guess is
 * still a guess. Date-descending is chosen for being the ordering a lawyer
 * expects from a filtered list, the same reason `runStructured` uses it. The
 * client shows court, date and case number on each row so the advocate can
 * choose; that is the answer, not a better sort.
 */
const EXACT_TITLE_MAX_PINS = 10;

async function exactCaseTitle(
  sql: Sql,
  queryText: string,
  filters: SearchFilters,
): Promise<string[]> {
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE MATERIALIZED FENCE IS LOAD-BEARING — MEASURED, NOT DEFENSIVE
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The first version of this change put `ORDER BY judgment_date DESC LIMIT 10`
   * directly on the equality query. Inlined into an `EXPLAIN` by hand it planned
   * perfectly — index scan on `judgments_case_title_normalised_idx`, total cost
   * 18.72. Through the driver it took **15 seconds and was cancelled**, on every
   * case-title query, turning a working route into a 500.
   *
   * The difference is that the title arrives as a BIND PARAMETER. With a
   * parameterised right-hand side and an `ORDER BY ... LIMIT 10` on top, the
   * planner reasons that walking `judgments_judgment_date_idx` BACKWARDS and
   * filtering will hit ten matches early — and for a title that appears once in
   * 18.7M rows it never does:
   *
   *     Limit  (cost=1660.60..2649.33 rows=10)
   *       ->  Incremental Sort  (cost=1660.60..9255009.45)
   *             ->  Index Scan Backward using judgments_judgment_date_idx
   *                   Filter: lower(btrim(regexp_replace(case_title, ...))) = $1
   *
   * Nine million cost units against eighteen. `MATERIALIZED` fences the match so
   * the ordering cannot reach back into index selection — the same mechanism,
   * and the same reason, as the CTE in {@link dense}: *"a plain subquery gets
   * pulled up and the multiplier lands back in front of the index"*.
   *
   * The inner `LIMIT` is a second, independent bound: a normalised title shared
   * by hundreds of judgments (they exist — NEW2 measured a neutral citation on
   * 1,257) must not be materialised in full to return ten.
   */
  const rows = await sql<{ id: string }[]>`
    WITH hits AS MATERIALIZED (
      SELECT j.id, j.judgment_date
      FROM judgments j
      -- The regex needs TWO backslashes in TypeScript so the SQL text carries
      -- one, byte-for-byte what judgments_case_title_normalised_idx was created
      -- with. A single backslash is not a valid escape in a template literal,
      -- silently becomes the LETTER s, and the expression then matches no index
      -- at all: a sequential scan over 18.7M rows that still returns the right
      -- answer, so nothing fails except the clock.
      WHERE lower(btrim(regexp_replace(j.case_title, '\\s+', ' ', 'g'))) =
            lower(btrim(regexp_replace(${queryText}, '\\s+', ' ', 'g')))
        ${courtWhere(sql, filters)}
        ${filters.dateFrom ? sql`AND j.judgment_date >= ${filters.dateFrom}` : sql``}
        ${filters.dateTo ? sql`AND j.judgment_date <= ${filters.dateTo}` : sql``}
        ${filters.caseType ? sql`AND j.case_type = ${filters.caseType}` : sql``}
      LIMIT ${EXACT_TITLE_MAX_PINS * 5}
    )
    -- An ordering, not a ranking. See the note on the function. The id makes it
    -- total, so two identical requests cannot return two different pages.
    SELECT id FROM hits
    ORDER BY judgment_date DESC, id DESC
    LIMIT ${EXACT_TITLE_MAX_PINS}
  `;
  return rows.map((r) => r.id);
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
    .map((r, i) => ({
      i,
      id: r.judgmentId,
      empty: r.operativeParagraph.trim().length === 0 && !r.bodyText.evidenceWithheld,
    }))
    .filter((x) => x.empty);
  const passages = results.map((r) => r.operativeParagraph);
  if (missing.length === 0) return passages;

  const ids = missing.map((m) => m.id);
  /**
   * Without a query vector the embedder is cold. Fall back to the first chunk:
   * weak, but a cause title still beats an empty string, and returning nothing
   * here would silently keep the defect this function exists to remove.
   */
  // P0. What a cross-encoder is handed is body text, so it is subject to the
  // same refusal as what an advocate is shown — a damaged body cannot inform a
  // ranking any more than it can support a citation.
  const rows = queryVector
    ? await sql<{ judgment_id: string; chunk_text: string }[]>`
        SELECT DISTINCT ON (c.judgment_id) c.judgment_id, c.chunk_text
          FROM judgment_chunks c
          JOIN judgments j ON j.id = c.judgment_id
         WHERE c.judgment_id = ANY(${ids}) AND c.embedding IS NOT NULL
           ${andBodyTextSafe(sql)}
         ORDER BY c.judgment_id, c.embedding <=> ${queryVector}::vector`
    : await sql<{ judgment_id: string; chunk_text: string }[]>`
        SELECT DISTINCT ON (c.judgment_id) c.judgment_id, c.chunk_text
          FROM judgment_chunks c
          JOIN judgments j ON j.id = c.judgment_id
         WHERE c.judgment_id = ANY(${ids}) AND c.embedding IS NOT NULL
           ${andBodyTextSafe(sql)}
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

/**
 * What the ranker learned that the RESPONSE has to say.
 *
 * `exactTitleCandidates` is the case-title sibling of the structured path's
 * `ambiguous: true`. NEW1 bus 1021: 32.3% of real case-title queries name more
 * than one judgment — `R.SARAVANAN Vs THE SUPERINTENDENT OF POLICE` is 16
 * different cases — and until now the advocate was shown one of them at rank 1
 * with nothing saying the others existed. That is an identity claim we cannot
 * support. The number reaches the client so it can render a disambiguation
 * instead of a result.
 *
 * 0 means the exact-title route did not fire at all; 1 means it resolved
 * uniquely. Only >1 is ambiguity.
 */
export type RetrievalSignals = {
  exactTitleCandidates: number;
  /**
   * The document frequency of the RAREST lexeme the sparse arm kept, and the
   * number that actually decides whether it will rank at all.
   *
   * Surfaced because NEW1's 1222 corrected a diagnosis of mine that would
   * otherwise have shaped the wrong fix. I inferred from the envelope that query
   * LENGTH drove the refusal — "one or two terms leaves an estimated set in the
   * millions, four terms cuts it to something bounded". Measured over 48 common
   * legal queries at four lengths each, running production's own rule:
   *
   *     1-2 terms   6/13 refused (46%)
   *     3-5 terms   4/20 refused (20%)
   *     6+  terms   4/15 refused (27%)
   *
   * Not monotone, not the driver. `min(df)` is. A twelve-word, perfectly
   * well-formed sentence — *"when may a court grant anticipatory bail to a person
   * apprehending arrest"* — is refused at rarestDf 0.0564, because
   * `SPARSE_RARE_LEXEMES` keeps only the three rarest and every lexeme in it is
   * common in a corpus of criminal judgments. Adding words helps only when the
   * added words are RARE.
   *
   * So this is carried to the response rather than re-derived there. NEW1's
   * warning is the reason it is a number and not a category: a server that
   * decides "short query, therefore degraded" mislabels that twelve-word sentence
   * as answerable and a five-term arbitration query as degraded. The refusal
   * cause is exact, already computed in the same statement, and free.
   *
   * Null when the sparse arm did not run or reached no lexeme scoring.
   */
  sparseRarestDf?: number | undefined;
  /**
   * AB-2. How many judgments the request's own filters left eligible, when the
   * corpus-wide rule refused and the filtered probe therefore ran.
   *
   * Absent when the query was admitted outright or narrows nothing — its
   * PRESENCE is the signal that a filtered admission decision was taken, which
   * is why it is not defaulted to zero.
   */
  filteredPopulation?: number | undefined;
  /**
   * True when the probe stopped at its cap, so `filteredPopulation` is a floor
   * and not a count. A capped probe never admits: unknown is not small.
   */
  filteredPopulationCapped?: boolean | undefined;
  /** What the filtered bound decided, once it was asked. */
  filteredAdmission?: 'admitted' | 'refused' | undefined;
};

/** Per-request capability decisions, resolved by the route and passed down. */
export type HybridSearchOptions = {
  /**
   * When false, a query classified `party_name` does not reach the title probe
   * and does not suppress the sparse arm. Absent or true is the normal path.
   */
  partyNameArm?: boolean | undefined;
  /**
   * Diagnostics sink for per-phase timings — `search/timings.ts`.
   *
   * Optional and additive, like `signals` and `partyNameArm` before it: every
   * existing caller passes nothing and behaves exactly as it did. It is a SINK
   * and never an input; no branch below reads back from it, so a run with
   * timings and a run without take the identical code path.
   */
  timings?: RetrievalTimings | undefined;
};

export async function hybridSearch(
  sql: Sql,
  query: string,
  queryVector: string | null,
  filters: SearchFilters,
  limit: number,
  mode: RetrievalMode = 'hybrid',
  /**
   * Called once per arm that ran out of its statement budget. Optional and
   * additive — every existing caller keeps its behaviour — but the search route
   * passes it, because a response that cannot say it is incomplete is the
   * silent drop this codebase measures at a zero threshold.
   */
  onDegrade?: (arm: DegradedArm) => void,
  /**
   * P3. How many ranked results to skip — the continuation offset.
   *
   * Defaulted, so every existing caller (the harness, the benchmark, the
   * counter-argument path) keeps the page it already had. Bounded by the
   * candidate depth the rankers actually produce: see {@link REACHABLE_DEPTH}.
   */
  offset = 0,
  /**
   * Out-parameter for facts the CALLER must put on the wire but the ranker is
   * the only thing that knows. Filled in place; absent for every existing
   * caller, which then behaves exactly as before.
   */
  signals?: RetrievalSignals,
  /**
   * Per-request capability decisions the RANKER cannot take for itself.
   *
   * Additive and optional, like `offset` and `signals` before it: every existing
   * caller keeps its behaviour. It exists because which platform made the
   * request is a fact about the CLIENT, and a ranker that reached for a header
   * would be deciding release policy from inside a SQL module.
   */
  options?: HybridSearchOptions,
): Promise<RetrievedJudgment[]> {
  /**
   * The phase sink, defaulted to a no-op so every call site below is
   * UNCONDITIONAL. An `if (options?.timings)` at each of eight places would be
   * two code paths, and the instrumented one would be the one nobody runs in
   * production — which is how instrumentation comes to hide the defect it was
   * added for.
   */
  const clock: RetrievalTimings = options?.timings ?? {
    phase: async (_name, run) => run(),
    phaseSync: (_name, run) => run(),
    add: () => {},
  };
  // Each arm is skipped rather than computed-and-discarded: an isolated-arm
  // measurement that still paid for the other half would report the fused
  // system's latency and call it the arm's.
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE EXACT LOOKUP RUNS FIRST, AND DECIDES WHETHER THE SPARSE ARM RUNS AT ALL
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This block used to sit AFTER both rankers, so a citation query paid for the
   * full-text scan and then had its answer pinned on top of it. This file's own
   * header already argues why that is backwards — *"a citation is an exact-match
   * problem ... a nearest-neighbour search is both slower and less accurate at
   * finding it"* — but the code only acted on it at ranking time, not at routing
   * time.
   *
   * **The measurement that decided it.** The sparse AND pass, timed directly
   * against the 18,698,968-row corpus (LOCAL_CONTENDED, 22 Aug 2026):
   *
   * | query | sparse AND pass | exact lookup |
   * | --- | --- | --- |
   * | `1995 INSC 227` | cancelled at budget | ~30 ms |
   * | `section 302 IPC` | cancelled at budget | 1,261 ms |
   *
   * On a quiet box the citation case completed in ~14 s instead of being
   * cancelled. Either way the sparse arm spends the entire request budget on a
   * query whose answer a unique index already holds.
   *
   * **What skipping it costs, stated plainly.** For `1995 INSC 227` the sparse
   * arm's other hits are roughly "judgments containing 1995, INSC and 227" —
   * mostly the cases CITING that judgment. That is a real question, and it has
   * its own precise answer in the citation graph (`GET /judgments/:id/graph`,
   * `judgment_citations`) rather than in a full-text coincidence of three
   * tokens. The dense arm still runs, so related authorities still fill the
   * page.
   *
   * The skip is conditional on the lookup actually HITTING. A citation that
   * resolves to nothing, or to two judgments, pins nothing and falls through to
   * the ordinary pipeline unchanged — the asymmetry {@link warrantsExactLookup}
   * describes, preserved.
   */
  const shape = clock.phaseSync(SEARCH_PHASE.classification, () => classifyQuery(query));
  /**
   * §9.5's kill switch, resolved once and read twice below.
   *
   * `partySuppressed` is deliberately narrow: it is true ONLY for a query the
   * classifier called `party_name`. A `case_name` query — "X v. Y" — still gets
   * its title probe, because that is a case identifier and not a person search,
   * and disabling it would take the exact-lookup capability away with the one
   * Apple's guideline is actually about.
   */
  const partyArmPermitted = options?.partyNameArm !== false;
  const partySuppressed = shape.shape === 'party_name' && !partyArmPermitted;
  if (partySuppressed) onDegrade?.('party_name_disabled');
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE EXACT LOOKUPS ARE BOUNDED TOO, AND THAT WAS LEARNED THE HARD WAY
   * ───────────────────────────────────────────────────────────────────────────
   *
   * These three routes are meant to be index scans measured in single-digit
   * milliseconds, so for a long time nothing wrapped them. Then a plan changed
   * — `exactCaseTitle`'s note records exactly how — and instead of a slow search
   * the advocate got **HTTP 500 at fifteen seconds**, on every case-name query,
   * because a `statement_timeout` cancellation from an unwrapped query is an
   * unhandled error rather than a degraded arm.
   *
   * A pin that cannot be computed in time is a pin we do not have. That is a
   * recall loss and it is reportable — `degraded` already exists to say so —
   * and it is emphatically not a server fault to show an advocate. The rankers
   * still run, so the page still fills.
   */
  const pins = await clock.phase(SEARCH_PHASE.pins, () =>
    bounded(
      'pin_timeout',
      [] as (string | null)[],
      async () =>
        warrantsExactLookup(shape) && shape.citation !== null
          ? [await exactCitation(sql, shape.citation, filters)]
          : warrantsSectionLookup(shape, query) && shape.act !== null && shape.section !== null
            ? await sectionJudgments(sql, shape.act, shape.section, filters, Math.floor(limit / 2))
            : /**
               * `party_name` joins `case_name` here rather than getting a route
               * of its own. AB-1 was never a missing retrieval path — the title
               * probe existed and worked — it was a query that never arrived at
               * it. Giving the new shape a second probe would be building the
               * thing that already exists.
               */
              shape.shape === 'case_name' || (shape.shape === 'party_name' && partyArmPermitted)
              ? await caseNamePins(
                  sql,
                  query,
                  filters,
                  Math.floor(limit / 2),
                  signals,
                  shape.shape === 'party_name' ? PARTY_NAME_BUDGET_MS : CASE_TITLE_BUDGET_MS,
                )
              : [],
      onDegrade,
    ),
  );
  const pinned: string[] = [];
  for (const id of pins) if (id !== null && !pinned.includes(id)) pinned.push(id);

  /**
   * Skipped only for the shapes whose answer came from an index, and only when
   * it actually did.
   *
   * **`party_name` is here, and that is the CASE-FIRST requirement.** For a
   * bare party name the title matches ARE the answer; the sparse arm's hits are
   * the judgments that CITE the authority, which is a different and usually
   * larger question. Letting them fuse is how `SATENDER KUMAR ANTIL` put its
   * own citing judgments above itself.
   *
   * Still conditional on `pinned.length > 0`, so a probe that found nothing
   * costs the query nothing: the ordinary pipeline runs exactly as before.
   */
  const skipSparse =
    pinned.length > 0 &&
    (shape.shape === 'citation' ||
      shape.shape === 'section' ||
      shape.shape === 'case_name' ||
      (shape.shape === 'party_name' && partyArmPermitted));

  const emptyDense = { ranked: [] as Ranked[], bestChunk: new Map<string, BestChunk>() };
  /**
   * The two arms run CONCURRENTLY, and that is a boundedness fix rather than a
   * speed one.
   *
   * Awaited one after the other, a request's worst case is the SUM of both
   * statement budgets — 30s under a 15s cap, which is not a bound anyone would
   * choose. Started together it is the MAX, so the ceiling the timeout promises
   * is the ceiling the request actually has.
   *
   * Safe because the arms were always independent: each reads, neither sees the
   * other's output, and fusion happens strictly after both. It costs a second
   * pool connection for the overlap; the connection-SECONDS are unchanged,
   * only their arrangement.
   */
  const [sparseRanked, denseResult] = await clock.phase(SEARCH_PHASE.arms, () =>
    Promise.all([
      mode === 'dense' || skipSparse
        ? Promise.resolve([] as Ranked[])
        : clock.phase(SEARCH_PHASE.sparse, () =>
            bounded(
              'sparse_timeout',
              [] as Ranked[],
              // `onDegrade` is passed BOTH ways on purpose: `bounded` reports the
              // clock running out, and the arm itself reports refusing to start.
              () => sparse(sql, query, filters, onDegrade, signals),
              onDegrade,
            ),
          ),
      // A corpus with no embeddings yet still searches, lexically. Returning
      // nothing because half the pipeline is cold would be worse than less.
      queryVector && mode !== 'sparse'
        ? clock.phase(SEARCH_PHASE.dense, () =>
            bounded('dense_timeout', emptyDense, () => dense(sql, queryVector, filters), onDegrade),
          )
        : Promise.resolve(emptyDense),
    ]),
  );

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
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * P3 — ONE ORDERED LIST, THEN A WINDOW ONTO IT
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The whole ranking is built first and the page is a slice of it, rather than
   * the page being built directly. That is what makes the pins keep their
   * position on page 1 without special-casing, and what makes page 2 the
   * genuinely next results rather than a second first page.
   *
   * **Re-running the rankers per page is correct here, and it was MEASURED
   * before it was chosen.** The obvious worry is `dense()`'s
   * `hnsw.iterative_scan = relaxed_order`: an approximate index under a relaxed
   * order has no obligation to return the same neighbours twice, and a
   * re-running design over an unstable ranker silently repeats and silently
   * skips. Measured 22 Aug 2026 — three identical requests, real query vector,
   * limit 20, across a concept query, a statutory query and a case name:
   *
   *     order identical across 3 runs   true, true, true
   *     membership identical            true, true, true
   *
   * So the snapshot-a-cursor design buys nothing on this corpus and costs a
   * store, an expiry and a class of stale-cursor bugs. The honest caveat is
   * recorded rather than engineered away: a page turned WHILE ingest adds a
   * matching judgment can shift, which is why `filters` are part of the
   * continuation identity and why the client asks for a page number rather than
   * being handed an opaque token that implies a frozen result set.
   *
   * The tie-break on id makes the sort a TOTAL order. Without it two judgments
   * with equal RRF scores — common, since RRF scores are sums of a few
   * reciprocals — could swap between calls and produce exactly the duplicate
   * this measurement says does not otherwise happen.
   */
  const pinnedSet = new Set(pinned);
  const fused: [string, number][] = [...scores.entries()]
    .filter(([id]) => !pinnedSet.has(id))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const whole: [string, number][] = [
    ...pinned.map((id): [string, number] => [id, Number.POSITIVE_INFINITY]),
    ...fused,
  ];

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE DUPLICATE COLLAPSE HAPPENS OVER THE WHOLE CONTINUATION, NOT PER PAGE
   * ───────────────────────────────────────────────────────────────────────────
   *
   * NEW1's pagination contract names this exactly: *"content-hash collapse
   * decided over the whole continuation, not per page, or the second copy simply
   * arrives on page 2."* Which is what a per-page collapse does — it is not
   * merely untidy, it hands the advocate the same judgment twice and spends a
   * slot they were owed a distinct authority in.
   *
   * One indexed read over at most `REACHABLE_DEPTH` primary keys, before the
   * slice, so the page boundaries are drawn on the DEDUPLICATED list.
   *
   * A null `content_hash` is never collapsed: absent is not equal. And this is
   * a COLLAPSE, not a drop — the rows are byte-identical by sha256 and the one
   * kept is the highest-ranked member of its own group, so the count of
   * distinct authorities is unchanged and `CITATION_HARNESS.md`'s zero
   * silent-drop threshold is untouched.
   */
  const hashRows = await clock.phase(
    SEARCH_PHASE.dedup,
    () => sql<{ id: string; content_hash: string | null }[]>`
    SELECT id, content_hash FROM judgments WHERE id = ANY(${whole.map(([id]) => id)})`,
  );
  const hashById = new Map(hashRows.map((r) => [r.id, r.content_hash]));
  const seenHashGlobal = new Set<string>();
  const deduped = whole.filter(([id]) => {
    const hash = hashById.get(id) ?? null;
    if (hash === null) return true;
    if (seenHashGlobal.has(hash)) return false;
    seenHashGlobal.add(hash);
    return true;
  });

  const ordered = deduped.slice(offset, offset + limit);
  if (ordered.length === 0) return [];

  const ids = ordered.map(([id]) => id);
  // Final read: every rendered field comes from this row, including
  // overruled_status, read live at render time.
  const hydrateAt = performance.now();
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
           -- P0's belt, behind the braces the arms already wear. Every arm
           -- refuses damaged bodies at its own WHERE, but the PINS do not go
           -- through an arm: an exact citation or an exact title resolves a
           -- judgment from an indexed identity column, which is precisely the
           -- metadata route that MUST keep working on a damaged document. So
           -- the verdict is read here too, and the body evidence is withheld
           -- row by row below rather than the row being dropped.
           script_quality, script_quality_method,
           left(full_text, ${LOCATE_MAX_CHARS}) AS full_text
    FROM judgments WHERE id = ANY(${ids})
  `;
  clock.add(SEARCH_PHASE.hydrate, performance.now() - hydrateAt);

  const byId = new Map<string, JudgmentRow>(rows.map((r) => [r.id, r]));

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE DERIVED PRECEDENTIAL EFFECT, ON THE SURFACE MOST AUTHORITIES ARE SEEN ON
   * ───────────────────────────────────────────────────────────────────────────
   *
   * OD-14 split treatment into three layers — verified edge → derived effect →
   * product policy — and `precedential-effect.ts` was wired into add-to-matter
   * alone. Search, which is where an advocate meets almost every authority,
   * still rendered the stored column raw: `P. KANNADASAN` came back
   * `set_aside` for what its own verified edge calls `overruled`.
   *
   * **ONE batched query for the whole page**, the same shape
   * `fillParagraphFallback` and `passagesForRerank` use, and for the same
   * reason: a per-result round trip inside a request already waiting on two
   * rankers is how a 3-second budget is spent on bookkeeping. The predicate is
   * an indexed `cited_judgment_id = ANY(...)` over at most `limit` ids.
   *
   * Read live, per request, never cached — `CITATION_HARNESS.md` §Overruled
   * status is never cached. `bannerStatus` is still one of the same four wire
   * values, so a client reading only `overruledStatus` is unaffected.
   */
  const edgesAt = performance.now();
  const edgeRows = await sql<
    { cited_judgment_id: string; relationship: string; treatment_provenance: string | null }[]
  >`
    SELECT DISTINCT cited_judgment_id, relationship, treatment_provenance
      FROM judgment_citations
     WHERE cited_judgment_id = ANY(${ids})
       AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;
  clock.add(SEARCH_PHASE.edges, performance.now() - edgesAt);
  const edgesById = new Map<string, TreatmentEdge[]>();
  for (const e of edgeRows) {
    const edge: TreatmentEdge = {
      relationship: e.relationship,
      provenance: e.treatment_provenance as TreatmentProvenance | null,
    };
    const list = edgesById.get(e.cited_judgment_id);
    if (list) list.push(edge);
    else edgesById.set(e.cited_judgment_id, [edge]);
  }
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
  // The collapse already happened, over the whole continuation, before the
  // slice — see the note above `hashRows`. Nothing to do per page.
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;

    /**
     * P0. Convicted body → no body evidence, on every route including the pins.
     *
     * `full_text` is blanked rather than the row dropped, so every expression
     * below that reads it — paragraph location, the fuzzy probe, the exact span
     * — degrades through the SAME honest path it already takes for a judgment
     * too large to segment. No second branch, and therefore no second branch to
     * forget when a new evidence field is added.
     */
    const bodySafe = isBodyTextSafe(r.script_quality);
    if (!bodySafe) r.full_text = null;

    // Chunk -> printed paragraph. Falls back to the cleaned chunk when the
    // judgment is too large to segment in-request, or when the passage cannot be
    // located: showing clean text with a null number is honest, and inventing a
    // number is the one thing this must never do.
    const best = bodySafe ? denseResult.bestChunk.get(id) : undefined;
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

    const inbound = edgesById.get(r.id) ?? [];
    const effect = precedentialEffectFromEdges({
      overruledStatus: r.overruled_status as OverruledStatus,
      edges: inbound,
    });
    const policy = precedentialPolicy(effect);
    /* Bare relationships on purpose — see the note in `search/route.ts`: this
     * asks whether an unapplied adverse edge exists at all, and a defective one
     * is still worth a human's eye. */
    const unapplied = unappliedTreatment({
      overruledStatus: r.overruled_status as OverruledStatus,
      inboundRelationships: inbound.map((e) => e.relationship),
    });
    const treatmentAttribution = attributionOf(inbound);

    results.push({
      judgmentId: r.id,
      caseTitle: r.case_title,
      neutralCitation: r.neutral_citation,
      reporterCitations: r.reporter_citations,
      court: r.court,
      judgmentDate: r.judgment_date,
      // Derived, not the stored column — see the batched edge read above.
      overruledStatus: policy.bannerStatus,
      overruledStatusStored: r.overruled_status,
      precedentialEffect: effect,
      canAddToMatter: policy.addToMatter === 'allow',
      unappliedTreatment: unapplied,
      treatmentAttribution,
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
      bodyText: {
        state: bodyTextState(r.script_quality),
        grade: bodyTextGrade(r.script_quality, r.script_quality_method),
        evidenceWithheld: !bodySafe,
      },
    });
  }
  await clock.phase(SEARCH_PHASE.fallback, () => fillParagraphFallback(sql, results, query));
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
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * P0 — AND THIS IS THE PATH THAT MATTERED MOST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured 22 Aug 2026 against the live corpus: `judgment_paragraphs` holds
 * **4,018,647 paragraphs across 1,736,980 documents whose body text is
 * convicted** — five orders of magnitude more exposure than the 24 damaged
 * chunks in the dense arm, because paragraph extraction ran over the whole
 * corpus and embedding did not. One of them, verbatim, from a proof-grade
 * `text-damage-v2.0` row:
 *
 *     !"# !$%&%"'((
 *     )*+ (((! % %"'!,&
 *
 * Nothing filtered it. It would have rendered as `operativeParagraph` with
 * `operativeParagraphVerified: true` and a byte-exact `exactSpan` — the
 * strongest evidence claim this API makes, on text that is not text.
 */
async function fillParagraphFallback(
  sql: Sql,
  results: RetrievedJudgment[],
  query: string,
): Promise<void> {
  const missing = results
    .map((r, i) => ({
      i,
      id: r.judgmentId,
      // Two reasons a result is skipped here, and they are different facts: an
      // already-filled passage needs nothing, a convicted body may have nothing.
      empty: r.operativeParagraph.trim().length === 0 && !r.bodyText.evidenceWithheld,
    }))
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
    SELECT DISTINCT ON (p.judgment_id)
      p.judgment_id, p.paragraph_text, p.paragraph_number, p.char_offset, p.char_length
    FROM judgment_paragraphs p
    JOIN judgments j ON j.id = p.judgment_id
    WHERE p.judgment_id = ANY(${ids})
      -- P0. See the note above this function: 4,018,647 paragraphs across
      -- 1,736,980 convicted documents were reachable through this query.
      ${andBodyTextSafe(sql)}
    ORDER BY p.judgment_id,
      ts_rank(to_tsvector('english', p.paragraph_text), plainto_tsquery('english', ${query})) DESC
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
