/**
 * The A/B rig decides whether a model ships. Its arithmetic gets checked
 * against values computable by hand.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lnChoose, mcnemarExactP, queriesToSettle } from './stats.ts';

test('lnChoose matches exact binomial coefficients', () => {
  assert.ok(Math.abs(Math.exp(lnChoose(16, 11)) - 4368) < 1e-6);
  assert.ok(Math.abs(Math.exp(lnChoose(16, 12)) - 1820) < 1e-6);
  assert.ok(Math.abs(Math.exp(lnChoose(5, 0)) - 1) < 1e-9);
  assert.ok(Math.abs(Math.exp(lnChoose(5, 5)) - 1) < 1e-9);
});

test("the first real run's p value, computed by hand", () => {
  // 11 gained, 5 lost. Two-sided tail = 2 · Σ C(16,k)/2^16 for k = 11..16
  //   = 2 · (4368 + 1820 + 560 + 120 + 16 + 1) / 65536
  //   = 2 · 6885 / 65536 = 0.21011...
  const p = mcnemarExactP(11, 5)!;
  assert.ok(Math.abs(p - (2 * 6885) / 65536) < 1e-9, `got ${p}`);
  assert.ok(p > 0.05, 'the first reranker run must NOT read as significant');
});

test('a clean sweep is significant; an even split is not', () => {
  assert.ok(mcnemarExactP(20, 0)! < 0.001);
  assert.equal(mcnemarExactP(8, 8), 1);
});

test('direction does not change the two-sided p', () => {
  // A change that loses 11 and gains 5 is exactly as surprising as its mirror.
  assert.equal(mcnemarExactP(11, 5), mcnemarExactP(5, 11));
});

test('no disagreement is null, not p = 1', () => {
  // "Nothing changed" and "the evidence is balanced" are different statements.
  // Only one of them means the two arms were compared at all.
  assert.equal(mcnemarExactP(0, 0), null);
  assert.equal(mcnemarExactP(1, 1), 1);
});

test('p is never above 1, even when the doubled tail would exceed it', () => {
  for (let d = 1; d <= 40; d++) {
    for (let g = 0; g <= d; g++) {
      const p = mcnemarExactP(g, d - g)!;
      assert.ok(p > 0 && p <= 1, `p=${p} for ${g}/${d}`);
    }
  }
});

test('the sample size to settle grows as the effect shrinks', () => {
  const strong = queriesToSettle(14, 2, 100)!;
  const weak = queriesToSettle(11, 5, 100)!;
  assert.ok(weak > strong, `weak ${weak} should need more than strong ${strong}`);
  /**
   * The first run's answer, checked against the formula by hand.
   *
   *   π = 11/16 = 0.6875, discordance rate = 16/100
   *   n_d = [1.96·0.5 + 0.8416·√(0.6875·0.3125)]² / 0.1875²
   *       = [0.98 + 0.3901]² / 0.035156 = 53.4
   *   n   = 53.4 / 0.16 = 334
   *
   * It must be comfortably ABOVE the 100 that failed to settle — a formula
   * answering "148" for a run that had already run 100 and come back at
   * p = 0.21 was not merely imprecise, it pointed the wrong way.
   */
  assert.ok(weak > 300 && weak < 380, `got ${weak}`);
  assert.ok(weak > 100, 'must exceed the run size that already failed to settle');
});

test('a perfectly balanced result cannot be settled by more queries', () => {
  // No effect to detect, so no n makes it detectable. Null rather than
  // Infinity, because the caller should say "nothing to see" and not "run
  // forever".
  assert.equal(queriesToSettle(8, 8, 100), null);
  assert.equal(queriesToSettle(0, 0, 100), null);
});
