/**
 * The AST partition the structured route's population fence is built from.
 *
 * The property under test is not performance. It is that **a fence can only ever
 * be a superset of the answer** — every conjunct it holds is necessarily true of
 * every matching row — because a fence that is not a superset silently drops
 * judgments, which `CITATION_HARNESS.md` holds at a zero threshold.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from './parse.ts';
import { conjuncts, partitionForFence, touchesFullText } from './bounded.ts';

const at = (q: string) => partitionForFence(parse(q));

test('a top-level AND contributes every conjunct; an OR contributes itself, whole', () => {
  // `A AND (B OR C) AND D` -> three conjuncts. The disjunction is necessary as
  // a WHOLE even though neither branch is, so it counts once and is not split.
  assert.equal(
    conjuncts(parse('court:"X" AND (judge:"A" OR judge:"B") AND type:criminal')).length,
    3,
  );
  assert.equal(conjuncts(parse('judge:"A" OR judge:"B"')).length, 1);
});

test('a NOT is never put in the fence, though it is a necessary condition', () => {
  /* Correctness is unaffected — a fence may be a superset — but a negated
   * predicate is not sargable, so fencing on it would force the sequential scan
   * the fence exists to prevent. */
  const p = at('court:"Allahabad High Court" AND NOT type:civil AND bail');
  assert.equal(p.fence.length, 1);
  assert.ok(!touchesFullText(p.fence[0]!));
});

test('NO full-text node is ever put in the fence', () => {
  for (const q of [
    'court:"X" AND bail',
    'court:"X" AND "anticipatory bail"',
    'bail NEAR/5 custody AND court:"X"',
    'court:"X" AND (bail OR parole)',
  ]) {
    for (const node of at(q).fence) {
      assert.ok(!touchesFullText(node), `${q} fenced on full-text work`);
    }
  }
});

test('the shortcut statistic follows the SHAPE, not the words', () => {
  // A plain conjunction: min(df) over the joined text is exactly what the sparse
  // arm computes, so both paths decide identically on identical input.
  assert.equal(at('court:"X" AND bail').shortcut, 'conjunction');
  assert.equal(at('bail AND murder').shortcut, 'conjunction');

  // A union is not bounded by its rarest member, so each term is measured alone.
  assert.equal(at('court:"X" AND (bail OR parole)').shortcut, 'per_term');

  // A negated full-text node matches the COMPLEMENT: df says nothing about it.
  assert.equal(at('court:"X" AND NOT bail').shortcut, 'never');

  // `lexeme_document_frequency` measures whole lexemes, never prefixes.
  assert.equal(at('court:"X" AND bail*').shortcut, 'never');
});

test('a NEAR is ONE term, not two — it is conjunctive with a distance bound', () => {
  /* Two entries would make `per_term` demand that both sides be rare, which is
   * stricter than the operator's own semantics and would refuse a query nothing
   * measured as broad. */
  const p = at('bail NEAR/5 custody OR judge:"A"');
  assert.deepEqual(p.fullTextTerms, ['bail custody']);
});

test('a query with no full-text work is left completely alone', () => {
  for (const q of [
    'judge:"Kania" AND section:138',
    'cite:"(2019) 5 SCC 1"',
    'cnr:"BRHC010328902006"',
  ]) {
    const p = at(q);
    assert.equal(p.hasFullText, false, q);
    assert.equal(p.fullTextTerms.length, 0, q);
  }
});

test('a full-text query with nothing to fence on reports an empty fence', () => {
  // There is no positive structural conjunct, so there is no population to
  // bound: the only honest outcomes are "the words are rare enough" or a refusal.
  assert.deepEqual(at('bail AND murder').fence, []);
  assert.deepEqual(at('bail').fence, []);
});

test('every fence conjunct is one of the ORIGINAL conjuncts, never a rewrite', () => {
  /* The superset proof rests on the fence holding nodes the parser produced. A
   * conjunct that had been normalised or simplified would need its own proof. */
  const ast = parse('court:"X" AND type:criminal AND bail');
  const all = conjuncts(ast);
  for (const f of partitionForFence(ast).fence) {
    assert.ok(all.includes(f), 'fence carried a node that is not a top-level conjunct');
  }
});
