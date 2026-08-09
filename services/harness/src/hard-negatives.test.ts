/**
 * Unit tests for the generator. The rule that actually matters — that a near
 * miss never resolves back to the judgment it was derived from — needs the
 * corpus and lives in `hard-negatives.live.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nearMissesFor, perturbLastDigit, transposeLastDigits } from './hard-negatives.ts';

test('the last digit moves, and nothing else does', () => {
  assert.equal(perturbLastDigit('(2019) 4 SCC 221'), '(2019) 4 SCC 222');
  assert.equal(perturbLastDigit('AIR 1973 SC 1461'), 'AIR 1973 SC 1462');
  assert.equal(perturbLastDigit('2026 INSC 668'), '2026 INSC 669');
});

test('the year is not the thing perturbed', () => {
  // Changing 2019 to 2020 produces a citation from a different volume year,
  // which is a different kind of wrong and much easier to spot. The dangerous
  // near miss shares everything except the page.
  const out = perturbLastDigit('(2019) 4 SCC 221')!;
  assert.ok(out.includes('2019'), 'the year moved instead of the page');
  assert.ok(out.includes('4 SCC'), 'the volume moved instead of the page');
});

test('a transposition changes the number without changing its digits', () => {
  assert.equal(transposeLastDigits('(2019) 4 SCC 221'), '(2019) 4 SCC 212');
  assert.equal(transposeLastDigits('AIR 1973 SC 1461'), 'AIR 1973 SC 1416');
});

test('a transposition that changes nothing is refused, not returned', () => {
  // "22" swaps to "22". Returning it would put a duplicate of the original into
  // the negative set, which weakens the set while the count looks healthy.
  assert.equal(transposeLastDigits('(2019) 4 SCC 22'), null);
  assert.equal(transposeLastDigits('(2019) 4 SCC 5'), null);
});

test('a citation with no trailing number yields nothing rather than a guess', () => {
  assert.equal(perturbLastDigit('no numbers here'), null);
  assert.equal(transposeLastDigits('no numbers here'), null);
  assert.deepEqual(nearMissesFor('no numbers here', 'j1'), []);
});

test('reporter punctuation survives — the near miss must still LOOK real', () => {
  // The whole point is that an advocate cannot tell it apart by eye. A
  // perturbation that mangles the format produces an obvious fake and tests
  // nothing.
  const out = perturbLastDigit('[1950] 1 S.C.R. 536')!;
  assert.equal(out, '[1950] 1 S.C.R. 537');
});

test('each near miss carries its origin so a failure names its own cause', () => {
  const set = nearMissesFor('(2019) 4 SCC 221', 'judgment-abc');
  assert.equal(set.length, 2);
  assert.ok(set.every((n) => n.originalJudgmentId === 'judgment-abc'));
  assert.ok(set.every((n) => n.original === '(2019) 4 SCC 221'));
  assert.deepEqual(set.map((n) => n.method).sort(), ['last-digit', 'transpose']);
});

test('no near miss is ever equal to the original', () => {
  // The one invariant the whole set rests on.
  for (const c of [
    '(2019) 4 SCC 221',
    'AIR 1973 SC 1461',
    '[1950] 1 S.C.R. 536',
    '2026 INSC 668',
  ]) {
    for (const n of nearMissesFor(c, 'j')) {
      assert.notEqual(n.nearMiss, n.original, `${c} produced a near miss identical to itself`);
    }
  }
});
