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
import { looksStructured, parse } from './qlang/parse.ts';

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
  /** Did not parse. Carries the offset so the client can point at the mistake. */
  | {
      readonly kind: 'invalid';
      readonly message: string;
      readonly offset: number;
      readonly validFields?: readonly string[];
    };

/**
 * Try to answer a query structurally.
 *
 * **Returns `not_structured` rather than throwing** for ordinary prose, because
 * the common case is an advocate typing a sentence and that must never produce a
 * syntax error. `looksStructured` is deliberately conservative for the same
 * reason: it requires a field name or an explicit operator, so lower-case "or"
 * in *"bail or parole"* stays a description.
 */
export async function answerStructured(
  sql: Sql,
  query: string,
  limit: number,
): Promise<StructuredOutcome> {
  if (!looksStructured(query)) return { kind: 'not_structured' };

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
  return { kind: 'matched', parsed, total, hits };
}
