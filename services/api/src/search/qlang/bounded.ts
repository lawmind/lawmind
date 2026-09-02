/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH HALF OF A STRUCTURED QUERY IS SAFE TO PUT UNDER A FENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `structured.ts` explains why a structured query is a FILTER and never a
 * ranking. This file answers the operational question that sits beside it: when
 * that filter also touches `full_text_tsv`, which part of the expression may be
 * executed FIRST so the tsvector is only ever consulted for rows that already
 * passed everything else.
 *
 * ── THE DEFECT, MEASURED THROUGH THE REAL ROUTE, 2 SEPTEMBER 2026 ───────────
 *
 *     court:"<a real fixed fixture court>" AND bail
 *       15,086 / 15,091 / 15,100 ms   3 of 3   structuredMs   degraded: []
 *
 * The whole request was one statement running to `statement_timeout`. The
 * planner cannot cost a tsquery it has not seen inlined — `retrieve.ts` records
 * the same mistake and its `EXPLAIN` — so it read the `bail` posting list,
 * 4.5 million entries, and applied the COURT as a heap filter afterwards.
 *
 * ── WHY THE FENCE IS SOUND, AND IT IS A PROOF RATHER THAN A HOPE ────────────
 *
 * A query's TOP-LEVEL CONJUNCTS are the nodes reached from the root through
 * `and` edges only. Every row satisfying the whole expression satisfies each of
 * them, individually — that is what `AND` means. So a population fenced on any
 * subset of the conjuncts is a SUPERSET of the answer, and re-applying the full
 * `compileWhere` on top of it returns exactly the rows the unfenced query would
 * have returned. Not approximately: exactly. Nothing is dropped, which is the
 * property `CITATION_HARNESS.md` holds at a zero threshold.
 *
 * `A AND (B OR C) AND D` therefore contributes A, `(B OR C)` and D — the
 * disjunction is a single conjunct and is necessary as a whole even though
 * neither branch is.
 *
 * ── WHY `NOT` IS EXCLUDED FROM THE FENCE, THOUGH IT IS ALSO NECESSARY ───────
 *
 * `NOT court:"X"` is a true necessary condition and a terrible fence: a negated
 * predicate is not sargable, so putting it inside the `MATERIALIZED` population
 * would force the sequential scan the fence exists to prevent. It stays above
 * the fence, where it filters a population that is already small. Correctness is
 * unaffected — the fence is allowed to be a superset — and only the cost changes.
 */
import type { Field, Node } from './parse.ts';

/**
 * The fields whose predicates run against `full_text_tsv`.
 *
 * `party` and `caseno` are deliberately NOT here. They are `ILIKE` against
 * `case_title` / `case_number`, served by trigram indexes, and are not the
 * shape this file was written for. Widening to them would be a change nobody
 * has measured.
 */
const FULL_TEXT_FIELDS = new Set<Field>(['text']);

/** Does this subtree put any work on `full_text_tsv`? */
export function touchesFullText(node: Node): boolean {
  switch (node.kind) {
    case 'and':
    case 'or':
      return touchesFullText(node.left) || touchesFullText(node.right);
    case 'not':
      return touchesFullText(node.operand);
    case 'term':
      return FULL_TEXT_FIELDS.has(node.field);
    case 'near':
      return true;
    case 'range':
      return false;
  }
}

function containsNot(node: Node): boolean {
  switch (node.kind) {
    case 'and':
    case 'or':
      return containsNot(node.left) || containsNot(node.right);
    case 'not':
      return true;
    default:
      return false;
  }
}

/** The top-level conjuncts: everything reachable from the root through `and` only. */
export function conjuncts(node: Node): Node[] {
  if (node.kind !== 'and') return [node];
  return [...conjuncts(node.left), ...conjuncts(node.right)];
}

/**
 * Every lexeme-bearing string in the subtree, in source order.
 *
 * Concatenated by the caller into one `to_tsvector('english', …)` so the
 * document-frequency lookup sees exactly the words the query will search for —
 * the same input `retrieve.ts` gives the sparse arm, so the two cannot disagree
 * about how common a query's rarest word is.
 */
function fullTextValues(node: Node, out: string[]): void {
  switch (node.kind) {
    case 'and':
    case 'or':
      fullTextValues(node.left, out);
      fullTextValues(node.right, out);
      return;
    case 'not':
      fullTextValues(node.operand, out);
      return;
    case 'term':
      if (FULL_TEXT_FIELDS.has(node.field)) out.push(node.value);
      return;
    case 'near':
      /**
       * ONE entry, not two. `tsquery_phrase` is conjunctive with a distance
       * bound, so the pair is a single term whose rarest side bounds it — the
       * same reading `conjunction` mode gives an `AND`. Pushing the two sides
       * separately would make `per_term` demand that BOTH be rare, which is
       * stricter than the operator's own semantics and would refuse a query
       * nothing measured as broad.
       */
      out.push(`${node.left} ${node.right}`);
      return;
    case 'range':
      return;
  }
}

/** Is any `full_text_tsv` node in this subtree under a `NOT`? */
function hasNegatedFullText(node: Node, negated = false): boolean {
  switch (node.kind) {
    case 'and':
    case 'or':
      return hasNegatedFullText(node.left, negated) || hasNegatedFullText(node.right, negated);
    case 'not':
      return hasNegatedFullText(node.operand, true);
    case 'term':
      return negated && FULL_TEXT_FIELDS.has(node.field);
    case 'near':
      return negated;
    case 'range':
      return false;
  }
}

/** Does any `full_text_tsv` node carry a trailing wildcard? */
function hasFullTextWildcard(node: Node): boolean {
  switch (node.kind) {
    case 'and':
    case 'or':
      return hasFullTextWildcard(node.left) || hasFullTextWildcard(node.right);
    case 'not':
      return hasFullTextWildcard(node.operand);
    case 'term':
      return FULL_TEXT_FIELDS.has(node.field) && node.wildcard;
    default:
      return false;
  }
}

/**
 * How — and whether — the corpus-wide document-frequency rule may admit this
 * query WITHOUT a population fence.
 *
 * The rule `retrieve.ts` states is *"ANDed terms, so the rarest bounds the match
 * set"*. That is true of a conjunction and false of everything else, so the
 * statistic has to change with the shape rather than the shape being refused.
 *
 * - **`conjunction`** — every full-text node is a plain positive top-level
 *   conjunct. `min(df)` over the whole query is exactly the sparse arm's own
 *   measure, and the two paths make an identical decision on identical input.
 * - **`per_term`** — a disjunction is present, so the match set is a UNION and
 *   `min(df)` would report a wide query as narrow. Each full-text term is
 *   measured SEPARATELY and every one of them must clear the bar: a union of at
 *   most `PARSE_LIMITS` terms, each under 5% of the corpus, is still bounded.
 *   This is why `kesavananda OR bharati` is answered rather than refused —
 *   refusing a union of two rare words to fix a common one would be exactly the
 *   "fix by deleting a working arm" this round is not allowed to make.
 * - **`never`** — no measurement can support a shortcut, so the fence is the
 *   only way through:
 *   - a **negated** full-text node matches the COMPLEMENT. `bail` reads
 *     `df = 0.2577`; `NOT bail` is the other 74%, and the number says nothing
 *     about it in either direction.
 *   - a **wildcard** compiles to `to_tsquery('…:*')`, and
 *     `lexeme_document_frequency` measures whole lexemes, never prefixes. There
 *     is no measurement, and an unmeasured query must not be admitted on one.
 */
export type ShortcutMode = 'conjunction' | 'per_term' | 'never';

export type FencePartition = {
  /** Does this query touch `full_text_tsv` at all? */
  readonly hasFullText: boolean;
  /**
   * Conjuncts safe and useful to execute first: positive, and free of any
   * `full_text_tsv` work. Empty means there is nothing to fence with.
   */
  readonly fence: Node[];
  /** Every full-text node's text, separately — the input for `per_term`. */
  readonly fullTextTerms: string[];
  /** All of them joined — the input for `conjunction`. */
  readonly fullTextQuery: string;
  /** Which statistic, if any, may admit this without a fence. */
  readonly shortcut: ShortcutMode;
};

export function partitionForFence(node: Node): FencePartition {
  const values: string[] = [];
  fullTextValues(node, values);
  const fence = conjuncts(node).filter((c) => !touchesFullText(c) && !containsNot(c));

  const everyFullTextIsPlainConjunct = conjuncts(node).every(
    (c) => !touchesFullText(c) || c.kind === 'near' || c.kind === 'term',
  );
  const shortcut: ShortcutMode =
    hasNegatedFullText(node) || hasFullTextWildcard(node)
      ? 'never'
      : everyFullTextIsPlainConjunct
        ? 'conjunction'
        : 'per_term';

  return {
    hasFullText: values.length > 0,
    fence,
    fullTextTerms: values,
    fullTextQuery: values.join(' '),
    shortcut,
  };
}

/** Every `court:` term in the query, with its offset — the key `ResolvedCourts` uses. */
export function courtTerms(
  node: Node,
  out: { offset: number; value: string; wildcard: boolean }[] = [],
) {
  switch (node.kind) {
    case 'and':
    case 'or':
      courtTerms(node.left, out);
      courtTerms(node.right, out);
      return out;
    case 'not':
      courtTerms(node.operand, out);
      return out;
    case 'term':
      if (node.field === 'court')
        out.push({ offset: node.offset, value: node.value, wildcard: node.wildcard });
      return out;
    default:
      return out;
  }
}
