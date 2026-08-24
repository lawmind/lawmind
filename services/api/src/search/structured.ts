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
import { type StructuredHit, countStructured, runStructured } from './qlang/compile.ts';
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
  const [total, hits] = await Promise.all([
    countStructured(sql, ast),
    runStructured(sql, ast, limit, offset),
  ]);

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
