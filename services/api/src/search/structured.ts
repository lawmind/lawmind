/**
 * The rule that lets structured and semantic search coexist without lying.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STRUCTURE DECIDES, SEMANTICS FILLS. NEVER BLENDED.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A structured query is a **filter**, not a ranking. Every row either satisfies
 * `judge:Chandrachud AND section:138` or it does not, and there is no useful
 * notion of a row satisfying it *more*. So the three outcomes are:
 *
 *   1. It parses and matches → return **only** those rows.
 *   2. It parses and matches **nothing** → return **zero results, and say so**,
 *      with any semantic suggestions in a **separate field**.
 *   3. It is not structured at all → today's semantic path, untouched.
 *
 * **An advocate who asked for `judge:Chandrachud` must never receive a judgment
 * by another judge.** That is the failure they least forgive, and blended
 * ranking is what causes it: a fuzzy match scoring above an exact one looks like
 * a good result and is a wrong answer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ZERO IS RETURNED AS ZERO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The tempting behaviour is to fall back to semantic search when a structured
 * query finds nothing, so the advocate always sees *something*. That is exactly
 * the behaviour this file exists to prevent. `judge:"Kania" AND section:138`
 * returning three cheque cases by other judges does not read as *"we found
 * nothing and guessed"* — it reads as **"these are the Kania cases on section
 * 138"**, and the advocate has no way to tell the difference.
 *
 * Zero results is a **first-class answer**. It means the corpus does not contain
 * what was asked for, which is a true and useful thing to know, and it is only
 * useful if it can be trusted.
 */
import type { Sql } from 'postgres';

import { explainQuery } from './qlang/explain.ts';
import { QueryError } from './qlang/lex.ts';
import {
  type StructuredHit,
  countStructured,
  fenceWhere,
  resolveCourts,
  runStructured,
  runStructuredCandidates,
} from './qlang/compile.ts';
import { courtTerms, partitionForFence } from './qlang/bounded.ts';
import {
  FILTERED_MAX_ELIGIBLE_ROWS,
  admitLexical,
  countBoundedPopulation,
  isStatementTimeout,
} from './retrieve.ts';
import type { Node } from './qlang/parse.ts';
import { looksStructured, parse } from './qlang/parse.ts';
import { isCnr, parseCaseNumber } from './case-number.ts';
import { classifyQuery, warrantsExactLookup } from './query-shape.ts';
import { FIELDS } from './qlang/parse.ts';

export type StructuredOutcome =
  /** Not a structured query at all. The caller runs semantic search as before. */
  | { readonly kind: 'not_structured' }
  /** Parsed, and these rows satisfy it exactly. */
  | {
      readonly kind: 'matched';
      readonly parsed: string;
      readonly total: number;
      readonly hits: StructuredHit[];
    }
  /**
   * Parsed, and **nothing satisfies it**. Distinct from `not_structured` on
   * purpose: the caller must render "no judgment matches this" rather than
   * quietly running a different search.
   */
  | { readonly kind: 'no_match'; readonly parsed: string }
  /**
   * **A bare citation matched more than one judgment.** Contract §4 P0's third
   * outcome, alongside exact match and zero — verified live against production
   * data, not hypothetical: `cite:"2020 INSC 189"` resolves to three distinct
   * Supreme Court judgments (same date, same court, different parties) in the
   * corpus today. A citation is supposed to identify ONE judgment; when it does
   * not, silently returning all matches as an ordinary `matched` list is
   * indistinguishable from a confident, wrong single answer. Every row here is
   * real — nothing invented, nothing dropped — but the caller MUST render this
   * as an explicit disambiguation, never as a plain result list.
   *
   * Scoped narrowly to a **bare `cite:` term** — not a compound expression like
   * `cite:"x" AND court:"y"` — because that is Contract §4's own example and the
   * case this project has actually observed. A field like `judge:` or `party:`
   * returning several rows is normal, expected behaviour, not ambiguity, and
   * must never be routed through this branch.
   */
  | {
      readonly kind: 'ambiguous';
      readonly parsed: string;
      readonly total: number;
      readonly hits: StructuredHit[];
    }
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * PARSED, AND ITS LEXICAL HALF COULD NOT BE SAFELY EXECUTED
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The one outcome that is NOT a statement about the corpus. `no_match` says
   * *"we looked and there is nothing"*; this says *"we did not look, and we are
   * not going to pretend otherwise"*.
   *
   * **The event it replaces, measured through the real route on 2 September
   * 2026:** `court:"<a real court>" AND bail` ran for 15,086 / 15,091 /
   * 15,100 ms, three times in three, and ended as an HTTP 503 whose copy reads
   * *"Nothing is wrong with the record — the server is busy."* The server was
   * not busy — `poolWaitMs` was 0 on every one of those samples — the query
   * could not complete, and a retry bought another fifteen seconds of the same.
   *
   * The caller renders this with the vocabulary the wire already carries and
   * every client already parses: `degraded: ['sparse_unbounded']`,
   * `emptyBecause.reason = 'query_too_broad_to_rank'`, and a
   * `retrievalOutcome` of `coverage_unknown`. No new response semantics were
   * invented for it, deliberately — those belong to NEW3, and the existing
   * vocabulary already says exactly the true thing.
   *
   * `remedy: 'add_more_terms'` is true here rather than an apology: a second
   * discriminating word lowers the rarest document frequency below the
   * corpus-wide bar, and the same query is then admitted and answered.
   */
  /**
   * Parsed and ADMITTED, and then the bounded arm ran out of its statement
   * budget anyway.
   *
   * NEW3 R20, verbatim in effect: *"If an admitted bounded qlang arm reaches
   * statement timeout: HTTP 200, degraded includes sparse_timeout,
   * retrievalOutcome.state=coverage_unknown with reason sparse_timeout, no
   * trusted total=0 and no generic 503 TIMEOUT copy. Do not auto-retry and do
   * not widen the client or statement timeout."*
   *
   * Distinct from {@link StructuredOutcome} `unbounded` in the way that matters
   * to an advocate: there the arm was never attempted because it could not have
   * finished; here it was attempted, admitted on measured evidence, and still
   * did not. Both are `coverage_unknown` and neither may render as "there is no
   * law on this", but they are different facts and the reason field says which.
   */
  | { readonly kind: 'timed_out'; readonly parsed: string }
  | {
      readonly kind: 'unbounded';
      readonly parsed: string;
      /** `min(df)` over the lexemes the query would have ranked. */
      readonly rarestDf: number;
      /** The fenced population, when one was counted. */
      readonly population?: number;
      /** Did that count hit its cap? Then it proves only "at least the cap". */
      readonly populationCapped?: boolean;
    }
  /** Did not parse. Carries the offset so the client can point at the mistake. */
  | {
      readonly kind: 'invalid';
      readonly message: string;
      readonly offset: number;
      readonly validFields?: readonly string[];
    };

/**
 * A single, bare identity term — `cite:`, `caseno:` or `cnr:` — not wrapped in
 * AND/OR/NOT/range/near.
 *
 * `caseno:` joined this list on evidence, not by analogy. A case number is a
 * REGISTRY SERIAL and is unique only within a court: serial 2231 of 2006 exists
 * in 13 courts and 17 case types, serial 1 of 2019 in 24 courts and 172 types.
 * So more than one match is not a ranked list to be shown confidently — it is
 * the same "a citation is supposed to identify ONE judgment" problem, and the
 * caller must render a disambiguation rather than a winner.
 *
 * `cnr:` is here for completeness rather than expectation: it is a national key
 * and resolved to exactly one judgment in 60 of 60 probes. If it ever resolves
 * to two — a common order filed under one CNR would do it — the right answer is
 * still to show both rather than to pick.
 */
const IDENTITY_FIELDS = new Set(['cite', 'caseno', 'cnr']);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BAND IN WHICH MATERIALISING THE MATCH SET IS THE RIGHT PLAN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The rarest lexeme's document frequency, above which the query's match set is
 * NOT small enough to materialise. `qlang/compile.ts`'s `runStructuredCandidates`
 * carries the three measurements this is set from; the derivation is here.
 *
 * **Measured, this box, 2 September 2026, against the live corpus of
 * 18,761,920 judgments:**
 *
 * | candidates | materialised | storage | plain plan |
 * | --- | --- | --- | --- |
 * | 94 | **10 ms** | 21 kB, memory | 15,165 ms |
 * | 153,857 | 412 ms | 9,261 kB, memory | 8,138 ms |
 * | 827,690 | 100,077 ms | 32,768 kB, **DISK** | 81,920 ms |
 *
 * The cliff is not the row count, it is `work_mem` — 32 MB on this box, and
 * commonly 4 MB on a managed Postgres. So the threshold is set from the ROW
 * WIDTH the middle row measures, 9,261 kB / 153,857 = **61.6 bytes per
 * candidate**, and not from fitting a curve to three points.
 *
 * `0.008 × 18,761,920 ≈ 150,000 candidates ≈ 9.2 MB` — at or under the largest
 * materialisation actually observed to stay in memory, and roughly a third of
 * this box's `work_mem`.
 *
 * **It is a document frequency and not a row count on purpose.** A row count
 * would need the corpus size at request time, and the only cheap source for that
 * is `pg_class.reltuples`, which this repository has already recorded reading
 * zero on this database after a crash. A `df` is read from the same table the
 * bound above it reads and needs nothing else. The consequence is stated rather
 * than hidden: **as the corpus grows, the same `df` admits proportionally more
 * candidates.** At double the corpus this admits ~300,000 (~18 MB), which is
 * still inside this box's `work_mem` and is the point at which the number should
 * be re-measured rather than re-guessed.
 */
const STRUCTURED_MAX_CANDIDATE_DOCUMENT_FREQUENCY = 0.008;

function isBareCitationTerm(node: Node): boolean {
  return node.kind === 'term' && IDENTITY_FIELDS.has(node.field);
}

/**
 * Try to answer a query structurally.
 *
 * **Returns `not_structured` rather than throwing** for ordinary prose, because
 * the common case is an advocate typing a sentence and that must never produce a
 * syntax error. `looksStructured` is deliberately conservative for the same
 * reason: it requires a field name or an explicit operator, so lower-case "or"
 * in *"bail or parole"* stays a description.
 */
/**
 * A bare neutral citation, rewritten to the `cite:"..."` the parser understands.
 *
 * ── WHY THIS EXISTS — MEASURED, 22 Aug 2026, NEW1 ───────────────────────────
 *
 * `looksStructured` needs a field name, an operator or a quote, so
 * `2023:AHC:170543` is prose to it. The advocate typing the same citation WITH
 * `cite:` in front got a different pipeline, and the gap was not small:
 *
 *   cite:"2023:AHC:170543"   answerStructured          4 - 352 ms
 *   2023:AHC:170543          hybridSearch          12,158 ms  (sparse arm alone)
 *
 * Same corpus, same box, same minute. The cause is the AND-first sparse arm:
 * `plainto_tsquery` turns the citation into `'2023' & 'ahc' & '170543'`, and
 * although the AND matches exactly ONE row, GIN must read the posting lists of
 * the common lexemes to prove it — `EXPLAIN (ANALYZE, BUFFERS)` shows
 * `read=150,912` blocks against a 16 GB `judgments_full_text_idx` and 2 GB of
 * `shared_buffers`. An index eight times the size of the cache is read from disk
 * every time. The bare citation was paying 1.2 GB of I/O to reach an answer the
 * exact lookup already had.
 *
 * ── AND IT IS A SAFETY FIX BEFORE IT IS A SPEED FIX ─────────────────────────
 *
 * `2025:AHC:32900` resolves to TWO judgments. On this path that returns
 * `ambiguous`, which the route renders as a disambiguation because
 * `CITATION_HARNESS.md` §A3d.4 allows exactly one target or nothing. On the
 * hybrid path it returned neither: `exactCitation` declines to pin when it finds
 * two, so the advocate got an ordinary ranked list with no indication that the
 * citation they typed names more than one case. The slow spelling was also the
 * unsafe one.
 *
 * ── WHY A REWRITE AND NOT A NEW BRANCH ──────────────────────────────────────
 *
 * Everything downstream — `countStructured`, the `isBareCitationTerm`
 * ambiguity rule, `explainQuery`'s interpretation — is already correct for
 * `cite:`. A second code path would have to re-earn all of it, and the two would
 * drift. This produces the identical AST, so the two spellings become the same
 * query rather than two queries that agree today.
 *
 * `warrantsExactLookup` is the SAME guard `retrieve.ts` uses before pinning, so
 * the two mechanisms cannot disagree about what a citation is. The quote is
 * escaped because a citation is user input reaching a parser: no citation format
 * contains a double quote, and a would-be injection therefore fails to parse and
 * falls through to prose rather than becoming a query.
 */
function bareCitationAsField(query: string): string | null {
  const shape = classifyQuery(query);
  if (!warrantsExactLookup(shape) || shape.citation === null) return null;
  if (shape.citation.includes('"')) return null;
  return `cite:"${shape.citation}"`;
}

/**
 * A bare CNR or a bare case number, rewritten to the operator that answers it.
 *
 * ── THE DEFECT THIS EXISTS FOR — MEASURED, 24 Aug 2026, LCC ─────────────────
 *
 * Same shape as the bare-citation rewrite above and found the same way: by
 * asking the real route for judgments we already knew were in the corpus.
 * 60 judgments, four spellings each:
 *
 *     caseno:"CWJC/2231/2006"    96.7% found   p50   917 ms
 *     CWJC/2231/2006              1.7% found   p50     3 ms   95.0% returned ZERO
 *     CWJC 2231 of 2006          10.3% found   p50    83 ms   34.5% multi-court
 *     cnr:"BRHC010328902006"    100.0% found   p50     2 ms
 *
 * **An advocate typing their own case number got an empty result set in three
 * milliseconds.** `full_text_tsv` is built from `full_text` alone, so the case
 * number is not in the searchable text and nothing routed the query to the
 * column holding it. The typed form was worse than empty: `plainto_tsquery`
 * split it into `'cwjc' & '2231' & '2006'` and ANDed those against body text,
 * so a third of them returned a plausible ranked list of unrelated judgments
 * from other courts.
 *
 * CNR is checked FIRST because it is unambiguous — a 16-character national key,
 * btree-indexed, one judgment or none. A case number is a registry serial and
 * is only unique within a court; it goes through `caseno:`, whose bare-term
 * ambiguity rule below refuses to pin.
 */
function bareIdentifierAsField(query: string): string | null {
  const text = query.trim();
  if (text.includes('"')) return null;
  if (isCnr(text)) return `cnr:"${text.toUpperCase()}"`;
  return parseCaseNumber(text) === null ? null : `caseno:"${text}"`;
}

/**
 * Did this query reach the parser ONLY because it contains a bare AND/OR/NOT?
 *
 * ── THE DEFECT THIS EXISTS FOR — MEASURED, 22 Aug 2026, NEW1 ────────────────
 *
 * `looksStructured` treats a bare `AND`/`OR`/`NOT` as an operator, and is
 * case-SENSITIVE so that lower-case "or" in *"bail or parole"* stays prose. What
 * it did not anticipate is that Indian case titles are stored in UPPER CASE and
 * routinely contain the word AND:
 *
 *   POONAM Vs STATE OF U.P. AND 4 OTHERS
 *   MANOHAR LAL Vs STATE OF HARYANA AND OTHERS
 *   SMT. VINITA BAHUGUNA Vs UNION OF INDIA AND 2 OTHERS
 *
 * `AND ANOTHER`, `AND OTHERS`, `AND ORS` is registry formatting, not a boolean.
 * **100 of 229 case-title queries in LAUNCH_BENCHMARK_V1 — 43.7% — were parsed
 * as boolean expressions**, matched nothing, and the route returned ZERO
 * results in about two milliseconds. Cross-tabulated against the outcome, which
 * is the test that separates a mechanism from a coincidence of magnitudes:
 *
 *   misrouted here      n=100    found in top 20:   4  ( 4.0%)   median    2 ms
 *   not misrouted       n=129    found in top 20:  97  (75.2%)   median 2,559 ms
 *
 * An advocate typing an ordinary case name got nothing, instantly, with no
 * search performed at all.
 *
 * ── WHY THE FIX IS HERE AND NOT IN `looksStructured` ────────────────────────
 *
 * Returning zero for a structured query that matches nothing is CORRECT and is
 * the route's deliberate contract: a filter is not a suggestion, and blending
 * ranked results into `judge:"Kania" AND section:138` would answer a question
 * nobody asked. That reasoning holds completely for a query with an explicit
 * field in it.
 *
 * It does not hold when the "structured" reading was itself an INFERENCE. If
 * the only evidence was an upper-case AND, then a zero match is much better
 * evidence that the inference was wrong than that the corpus is empty. So the
 * outcome is downgraded to `not_structured` and the caller runs ordinary
 * search — which is what it would have done had the heuristic never fired.
 *
 * Narrow on purpose: a query carrying a field prefix, a quote, or NEAR/n is
 * untouched, keeps its zero, and keeps its interpretation. Only the inferred
 * case is allowed to fall through, and only when it found nothing.
 */
export function structuredOnlyByBareOperator(source: string): boolean {
  // \\b inside a template literal, because \b there is a BACKSPACE character
  // rather than a word boundary -- and the resulting regex then quietly matches
  // nothing instead of failing loudly.
  if (new RegExp(String.raw`\b(?:${FIELDS.join('|')}):`, 'i').test(source)) return false;
  if (/NEAR\/\d/i.test(source)) return false;
  if (/"/.test(source)) return false;
  // The word boundaries are load-bearing: without them this fires on ANDHRA,
  // NOTICE and ORDER, which appear in a large share of Indian case titles.
  return /\b(?:AND|OR|NOT)\b/.test(source);
}

export async function answerStructured(
  sql: Sql,
  query: string,
  limit: number,
  /**
   * P3. The continuation offset, in rows.
   *
   * This is the path where pagination is not a nicety. A bare citation can
   * resolve to fifteen judgments — measured: `2026:PHHC:027747-DB` resolves to
   * 15, and NEW1's launch benchmark found the case the advocate asked for was
   * NOT among the five the route showed (bus 1016). A disambiguation list that
   * cannot contain the answer is a "nothing" wearing a "something"'s clothes.
   *
   * `runStructured` orders by `judgment_date DESC, id DESC` — a TOTAL order —
   * so paging here is exact: no row is repeated, none is skipped, and every
   * candidate is reachable.
   */
  offset = 0,
): Promise<StructuredOutcome> {
  /* Citation first, then CNR / case number. A neutral citation and a case
   * number cannot both parse from one string, but the order is fixed anyway so
   * the routing is a rule rather than a race between two regexes. */
  const asField = looksStructured(query)
    ? null
    : (bareCitationAsField(query) ?? bareIdentifierAsField(query));
  if (asField !== null) query = asField;
  else if (!looksStructured(query)) return { kind: 'not_structured' };

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * AN INFERRED BOOLEAN MAY NOT PRE-EMPT AN EXACT IDENTITY ROUTE — NEW1 bus 1021
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `structuredOnlyByBareOperator` below already rescues the case where the
   * inferred boolean matches NOTHING. NEW1 measured the other half:
   *
   *     `MATA DIN SINGH Vs D.D.C. AND OTHERS`
   *       -> containing "MATA" AND "DIN" AND "SINGH" AND "Vs" AND "D.D.C."
   *          AND "OTHERS"
   *       -> matches 10 judgments, so the fall-through never fires
   *       -> the request ends before `hybridSearch`, so `exactCaseTitle` NEVER
   *          RUNS, and the judgment printed with EXACTLY that title is not among
   *          the five returned
   *
   * 9 of 229 gold titles (3.9%), and 5 of those lose the gold judgment entirely.
   * `ac1c7c4` fixed the zero-match case; this is the non-zero case, and no
   * amount of ranking can reach it because the ranker is never asked.
   *
   * The rule stays narrow, exactly as the zero-match rescue does. A query
   * carrying a real field prefix, a quote or NEAR/n is untouched — the advocate
   * asked for a filter and gets one. This fires ONLY when the boolean was
   * inferred from registry formatting AND the query independently reads as a
   * case name, which is the population where an exact-title index scan has an
   * answer the boolean cannot see.
   */
  if (structuredOnlyByBareOperator(query) && classifyQuery(query).shape === 'case_name') {
    return { kind: 'not_structured' };
  }

  let ast;
  try {
    ast = parse(query);
  } catch (error) {
    if (error instanceof QueryError) {
      return {
        kind: 'invalid',
        message: error.message,
        offset: error.offset,
        ...(error.valid ? { validFields: error.valid } : {}),
      };
    }
    throw error;
  }

  const parsed = explainQuery(ast);

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE LEXICAL HALF GOES THROUGH THE SAME BOUND THE SPARSE ARM USES
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Everything above this line is identity and metadata resolution — `cite:`,
   * `cnr:`, `caseno:`, `judge:` — served by indexes, measured in single-digit
   * milliseconds, and untouched. What follows applies ONLY to a query that puts
   * work on `full_text_tsv`, which is the shape that ran for fifteen seconds.
   *
   * Three outcomes, in the order they are decided:
   *
   * 1. **The corpus-wide document-frequency rule admits it.** The rarest lexeme
   *    is discriminating, GIN can serve it, and the query runs exactly as it did
   *    before — no fence, no extra statement, no change. This is the common case
   *    and it must not be made slower to fix the rare one.
   * 2. **The rule refuses, and the query carries a positive structural conjunct
   *    to fence with.** The population is COUNTED first, capped; if it is small
   *    enough the query runs inside a `MATERIALIZED` fence over exactly that
   *    population. Same constants, same cap, same probe as `retrieve.ts` — one
   *    mechanism, not two that agree today.
   * 3. **Neither.** The query is refused, in milliseconds, and SAYS SO.
   *
   * ── WHY THE PROBE IS NOT A COST THIS ADDS ──────────────────────────────────
   *
   * It runs only where the corpus-wide rule has ALREADY refused, which is
   * precisely the population that was previously spending fifteen seconds
   * reaching a timeout. A query admitted today never reaches this code and pays
   * nothing — the same argument `retrieve.ts` makes for the sparse arm's probe,
   * and it holds here for the same reason.
   */
  const partition = partitionForFence(ast);
  let plan: 'plain' | 'candidates' = 'plain';

  /**
   * Court patterns are resolved to names FIRST, and unconditionally, because
   * every decision below depends on the predicate being indexable. `qlang/
   * compile.ts` carries the measurement: the same fenced query is 23,760 ms with
   * `court ILIKE '%…%'` and 139 ms with `court = ANY(…)`, because a leading `%`
   * leaves `judgments_court_idx` unused and Postgres reads the table.
   *
   * Unconditional rather than only-when-full-text: a purely structural
   * `court:"…" AND type:criminal` gets the same index, and the resolution is one
   * round trip over a couple of dozen names.
   */
  const courts = courtTerms(ast);
  const resolvedCourts = courts.length > 0 ? await resolveCourts(sql, courts) : undefined;

  if (partition.hasFullText) {
    /**
     * STEP 1 — the corpus-wide question, asked with the statistic this query's
     * SHAPE makes valid. `qlang/bounded.ts` carries the reasoning: `conjunction`
     * is one lookup over the joined text and is byte-for-byte the sparse arm's
     * own decision; `per_term` measures each full-text node separately because a
     * union is not bounded by its rarest member; `never` cannot be measured at
     * all and is not asked.
     *
     * The eligibility is deliberately NOT handed to `admitLexical` here. It
     * would run the filtered probe once per term and, worse, would skip the
     * probe entirely for a query the corpus-wide rule happened to admit — which
     * is the exact shape that could then be fenced without anyone having counted
     * the population, and truncated by the fence's own `LIMIT`. A silent drop.
     * The probe is step 2, explicit, and runs exactly once.
     */
    const measured =
      partition.shortcut === 'never'
        ? []
        : partition.shortcut === 'per_term'
          ? await Promise.all(
              partition.fullTextTerms.map((term) => admitLexical(sql, term, undefined, undefined)),
            )
          : [await admitLexical(sql, partition.fullTextQuery, undefined, undefined)];

    /**
     * The worst case across whatever was measured. `Infinity` when the shape
     * allowed no measurement at all — a negation or a wildcard — which is
     * `never`, not `zero`, and is treated as such everywhere below.
     */
    const rarestDf = measured.length === 0 ? Infinity : Math.max(...measured.map((m) => m.rarestDf));

    /**
     * ── ADMISSION 1: is the MATCH SET small? ──────────────────────────────────
     *
     * Free — the document frequencies are already in hand. When it holds, the
     * whole predicate goes inside a materialised CTE and both answers come out
     * of one scan. `qlang/compile.ts`'s `runStructuredCandidates` carries the
     * measurements; the threshold's derivation is on the constant below.
     */
    if (rarestDf <= STRUCTURED_MAX_CANDIDATE_DOCUMENT_FREQUENCY) {
      plan = 'candidates';
    } else if (
      /**
       * `[].every(…)` is TRUE, so an unmeasurable shape — `never`, which
       * measures nothing — would otherwise read as "the corpus-wide rule
       * admitted it" and fall through to the plain plan. It did, and
       * `court:"…" AND NOT bail` ran for 15,041 ms because of it. Absence of a
       * measurement is not a passing measurement.
       */
      measured.length === 0 ||
      !measured.every((m) => m.corpusWideAdmitted)
    ) {
      /**
       * ── ADMISSION 2: is the POPULATION small? ───────────────────────────────
       *
       * The match set is not small, so ask the question the corpus-wide rule
       * could not: how big is the population this query's own positive structure
       * narrows to? Same cap, same early-stopping probe, and the same "capped
       * proves only *at least cap*, and unknown is not small" rule as the sparse
       * arm — `countBoundedPopulation` in `retrieve.ts` is the one implementation.
       */
      /**
       * NO FENCE means nothing to narrow with: the eligible population IS the
       * corpus, the corpus-wide rule has already refused, and there is no
       * question left to ask or probe worth paying for.
       *
       * Refusing there is the SAME answer the hybrid path already gives for the
       * same words — `search/route.ts` records it measured, `anticipatory bail`
       * returns zero results and `sparse_unbounded`. A structured spelling of a
       * query the lexical arm refuses must refuse too, or the two paths disagree
       * about whether the corpus was searched, which is exactly the second
       * approximation NEW3 R20 forbids.
       */
      const probe =
        partition.fence.length > 0
          ? await countBoundedPopulation(
              sql,
              fenceWhere(sql, partition.fence, resolvedCourts),
              FILTERED_MAX_ELIGIBLE_ROWS + 1,
            )
          : null;
      if (probe !== null && !probe.capped && probe.population <= FILTERED_MAX_ELIGIBLE_ROWS) {
        /**
         * The population is counted and small, so the CANDIDATES — which are a
         * subset of it — are small too, and the same materialised shape serves
         * both admissions. One execution path, two ways of earning it.
         */
        plan = 'candidates';
      } else {
        /**
         * Neither bound holds and the query DOES narrow structurally, so this is
         * a genuinely broad question and the honest answer is to say so — in
         * milliseconds, with the reason, instead of fifteen seconds and a 503
         * whose copy says the server was busy.
         *
         * An INFERRED boolean gets the same rescue the zero-match case gets
         * below: if the only evidence that this was a structured query was an
         * upper-case AND out of a case title, then a refusal here is much better
         * evidence that the inference was wrong than that the query is too
         * broad — and ordinary search applies this identical bound and reaches
         * an identical, cheap, truthful refusal if it really is.
         */
        if (structuredOnlyByBareOperator(query)) return { kind: 'not_structured' };
        return {
          kind: 'unbounded',
          parsed,
          rarestDf,
          /* Present only when a probe actually ran. A query with nothing to
           * narrow it was never counted, and publishing a zero there would read
           * as "we looked and the population was empty". */
          ...(probe === null ? {} : { population: probe.population, populationCapped: probe.capped }),
        };
      }
    }
    /**
     * ── WHAT STILL KEEPS THE PLAN IT HAS TODAY ───────────────────────────────
     *
     * Only queries the corpus-wide rule ADMITS and whose match set is too large
     * to materialise — `bail AND murder`, measured at 8,138 ms with 153,857
     * matches. Materialising those 153,857 candidates measured 412 ms, but the
     * same shape at 827,690 candidates measured 100,077 ms because the CTE
     * spilled past `work_mem`. Admitting it on that evidence would trade a known
     * cost for an unmeasured cliff, and the query is answered correctly today.
     *
     * The numbers are recorded rather than remembered: `docs/ai/lcc-r25/`.
     */
  }

  let total: number;
  let hits: StructuredHit[];
  try {
    [total, hits] =
      plan === 'candidates'
        ? await runStructuredCandidates(sql, ast, limit, offset, resolvedCourts).then(
            (r) => [r.total, r.hits] as [number, StructuredHit[]],
          )
        : await Promise.all([
            countStructured(sql, ast, resolvedCourts),
            runStructured(sql, ast, limit, offset, resolvedCourts),
          ]);
  } catch (error) {
    /**
     * A statement that ran out of its budget is an ANSWER — an incomplete one,
     * said so — and never a 503 whose copy claims the server was busy. Anything
     * else is a defect and is rethrown: swallowing a missing column as a timeout
     * would turn a broken route into a permanently quiet one.
     */
    if (!isStatementTimeout(error)) throw error;
    return { kind: 'timed_out', parsed };
  }

  if (total === 0) {
    // An INFERRED boolean that matched nothing was probably never a query —
    // fall through to ordinary search rather than answering zero. See
    // `structuredOnlyByBareOperator`.
    if (structuredOnlyByBareOperator(query)) return { kind: 'not_structured' };
    return { kind: 'no_match', parsed };
  }

  /**
   * A bare citation resolving to more than one judgment is ambiguity, not an
   * ordinary result list — Contract §4 P0's third outcome. Every other field
   * returning several rows (`judge:`, `party:`, …) is normal and stays
   * `matched`; this branch fires only for the narrow, safety-critical case.
   */
  if (total > 1 && isBareCitationTerm(ast)) {
    return { kind: 'ambiguous', parsed, total, hits };
  }

  return { kind: 'matched', parsed, total, hits };
}
