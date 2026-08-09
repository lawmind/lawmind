/**
 * Render a parsed query back into a sentence a person can check.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A CORRECTNESS FEATURE, NOT A COURTESY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A query language's characteristic failure is not the query that is rejected —
 * that one announces itself. It is the query that parses into something
 * *plausible and wrong*, returns twenty results, and looks entirely healthy.
 * `a AND b OR c` grouping as `a AND (b OR c)` instead of `(a AND b) OR c`
 * changes which judgments come back, and nothing in the results would say so.
 *
 * So the server states its interpretation and the client shows it. If the
 * sentence does not match what the advocate meant, they can see that **before**
 * they rely on the answer. That is the only defence against a misparse, because
 * by definition a misparse produces results rather than errors.
 *
 * The sentence is deliberately plain English rather than a re-serialisation of
 * the syntax. Echoing `judge:"Kania" AND NOT section:302` back proves only that
 * we can print what was typed; saying *"decided by a judge matching Kania, and
 * not referring to section 302"* proves we understood it.
 */
import type { Field, Node } from './parse.ts';

/** How each field reads in a sentence. Singular, lower case, no trailing stop. */
const PHRASING: Record<Field, (value: string) => string> = {
  party: (v) => `involving a party matching ${quote(v)}`,
  judge: (v) => `decided by a judge matching ${quote(v)}`,
  cite: (v) => `reported as ${quote(v)}`,
  caseno: (v) => `with case number ${quote(v)}`,
  court: (v) => `from ${quote(v)}`,
  date: (v) => `decided in ${v}`,
  act: (v) => `referring to the ${quote(v)}`,
  section: (v) => `referring to section ${v}`,
  type: (v) => `on the ${v} side`,
  text: (v) => `containing ${quote(v)}`,
};

function quote(v: string): string {
  return `“${v}”`;
}

/**
 * Wrap a clause in parentheses when it is a compound sitting inside another
 * compound. Without this, `(a OR b) AND c` and `a OR (b AND c)` read
 * identically — which would make the sentence useless for the one job it has.
 */
function group(node: Node, rendered: string): string {
  return node.kind === 'and' || node.kind === 'or' ? `(${rendered})` : rendered;
}

/**
 * Turn an AST into a sentence.
 *
 * **Total over the AST.** Every node kind is handled explicitly rather than
 * through a default branch, so adding a node type to the grammar is a compile
 * error here rather than a clause that silently disappears from the explanation
 * — which would hide exactly the thing this file exists to reveal.
 */
export function explain(node: Node): string {
  switch (node.kind) {
    case 'term': {
      const phrasing = PHRASING[node.field];
      const value = node.wildcard ? `${node.value} (any ending)` : node.value;
      return phrasing(value);
    }
    case 'range':
      return `decided between ${node.from} and ${node.to}`;
    case 'near':
      return `${quote(node.left)} within ${node.distance} word${node.distance === 1 ? '' : 's'} of ${quote(node.right)}`;
    case 'not':
      return `not ${group(node.operand, explain(node.operand))}`;
    case 'and':
      return `${group(node.left, explain(node.left))}, and ${group(node.right, explain(node.right))}`;
    case 'or':
      return `either ${group(node.left, explain(node.left))}, or ${group(node.right, explain(node.right))}`;
  }
}

/**
 * The full sentence shown to the advocate.
 *
 * Prefixed with the subject so it reads as a claim about what will be returned
 * — *"Judgments decided by …"* — rather than as a fragment. A fragment is easy
 * to skim past; a claim invites checking, which is the point.
 */
export function explainQuery(node: Node): string {
  return `Judgments ${explain(node)}.`;
}
