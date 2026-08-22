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
import { classifyQuery, warrantsExactLookup } from './query-shape.ts';

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

/** A single, bare `cite:"..."` term — not wrapped in AND/OR/NOT/range/near. */
function isBareCitationTerm(node: Node): boolean {
  return node.kind === 'term' && node.field === 'cite';
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

export async function answerStructured(
  sql: Sql,
  query: string,
  limit: number,
): Promise<StructuredOutcome> {
  const asField = looksStructured(query) ? null : bareCitationAsField(query);
  if (asField !== null) query = asField;
  else if (!looksStructured(query)) return { kind: 'not_structured' };

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
    runStructured(sql, ast, limit),
  ]);

  if (total === 0) return { kind: 'no_match', parsed };

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
