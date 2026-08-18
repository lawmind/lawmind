/**
 * The grader's own failure modes. Every test here is about a way a gate can
 * report success without having asked a question.
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type HarnessMetrics, grade, meanNdcgAtK, ndcgAtK, rate, THRESHOLDS } from './metrics.ts';

const perfect: HarnessMetrics = {
  hallucinationRate: 0,
  silentDropRate: 0,
  staleOverruledRate: 0,
  overruledLeakage: 0,
  adversarialPassRate: 1,
  structuredExactness: 1,
  fieldPrecision: 1,
  successAt5: 0.8,
};

test('a clean run passes every metric', () => {
  const verdicts = grade(perfect);
  // Seven graded from 9 Aug 2026: five absolute ceilings plus the two
  // deterministic gates. success@5 is measured but NOT among them.
  assert.equal(verdicts.length, 7);
  assert.ok(verdicts.every((v) => v.passed));
});

test('every metric is reported, not only the failures', () => {
  // SPRINT_2.md DONE: "Every number reported, not just the failures." A gate
  // that speaks only when it fails teaches everyone to read silence as success.
  const verdicts = grade({ ...perfect, staleOverruledRate: 0.1 });
  assert.equal(verdicts.length, 7);
  assert.equal(verdicts.filter((v) => v.passed).length, 6);
});

test('an unmeasured metric FAILS — this is the whole point', () => {
  // `null <= 0` is true in JavaScript. Without the explicit null branch, a
  // harness that observed nothing would report a flawless hallucination rate.
  // successAt5 is excluded: it is a diagnostic now, so it has no verdict to
  // fail. Every metric that IS graded must still fail when unmeasured.
  const graded = (Object.keys(perfect) as (keyof HarnessMetrics)[]).filter(
    (k) => k !== 'successAt5',
  );
  for (const key of graded) {
    const verdicts = grade({ ...perfect, [key]: null });
    const v = verdicts.find((x) => x.name === key)!;
    assert.equal(v.passed, false, `${key} passed while unmeasured`);
    assert.ok(v.notMeasured, `${key} failed without saying it was unmeasured`);
  }
});

test('not-measured is distinguishable from measured-and-bad', () => {
  const unmeasured = grade({ ...perfect, fieldPrecision: null }).find(
    (v) => v.name === 'fieldPrecision',
  )!;
  const bad = grade({ ...perfect, fieldPrecision: 0.1 }).find((v) => v.name === 'fieldPrecision')!;

  assert.ok(unmeasured.notMeasured);
  assert.equal(bad.notMeasured, undefined);
  assert.equal(bad.value, 0.1);
});

test('a rate over zero attempts is null, never zero', () => {
  assert.equal(rate(0, 0), null);
  assert.equal(rate(0, 10), 0);
  assert.equal(rate(3, 10), 0.3);
});

test('the ceilings are zero and the floor is 0.7 — stated, so a change is visible', () => {
  // Not a tautology. `SPRINT_2.md` NEVER list: "Weaken a threshold to pass a
  // gate." Pinning the numbers here means loosening one shows up in a diff of
  // the tests, not only in a diff of the constants.
  assert.equal(THRESHOLDS.hallucinationRate, 0);
  assert.equal(THRESHOLDS.silentDropRate, 0);
  assert.equal(THRESHOLDS.staleOverruledRate, 0);
  assert.equal(THRESHOLDS.overruledLeakage, 0);
  assert.equal(THRESHOLDS.adversarialPassRate, 1);
  assert.equal(THRESHOLDS.structuredExactness, 1);
  assert.equal(THRESHOLDS.fieldPrecision, 1);
});

test('SUCCESS@5 IS NO LONGER GRADED, and that is the re-spec', () => {
  /**
   * It carried a floor of 0.70 and the lane spent weeks failing it. CLERC — the
   * method our evaluation set uses — publishes a zero-shot ceiling of 48.3%
   * recall@1000 and says existing models "struggle significantly". A gate nobody
   * in the literature can pass does not protect anything; it gets rationalised
   * around, or it stops the product forever.
   *
   * It is still MEASURED and still printed. This test pins the distinction: a
   * catastrophic success@5 must not fail the gate, and a fabricated citation
   * still must.
   */
  const graded = grade({ ...perfect, successAt5: 0.01 });
  assert.ok(
    graded.every((v) => v.passed),
    'success@5 is still gating — the re-spec did not take effect',
  );
  assert.ok(
    !graded.some((v) => v.name === 'successAt5'),
    'success@5 appears in the graded set and must not',
  );
});

test('THE NEW GATES CAN FAIL — a threshold nothing can breach is not a gate', () => {
  /**
   * The negative control. `hallucinationRate: generationReady ? 0 : null` once
   * reported a PASS with no model anywhere in the package, and the lesson was
   * that a metric which cannot fail is not a metric. Both new thresholds are
   * 1.0, so this proves the grader actually reads them.
   */
  const exactness = grade({ ...perfect, structuredExactness: 0.99 });
  assert.ok(exactness.some((v) => v.name === 'structuredExactness' && !v.passed));

  const precision = grade({ ...perfect, fieldPrecision: 0.999 });
  assert.ok(precision.some((v) => v.name === 'fieldPrecision' && !v.passed));

  // And null — never measured — must fail both, as it does for every other gate.
  const unmeasured = grade({ ...perfect, structuredExactness: null, fieldPrecision: null });
  assert.equal(unmeasured.filter((v) => !v.passed).length, 2);
});

test('an adversarial pass rate just short of 1 fails', () => {
  // Four of five is not "mostly safe". Each of the five is a documented output
  // that a real published dataset actually produces.
  const v = grade({ ...perfect, adversarialPassRate: 0.8 }).find(
    (x) => x.name === 'adversarialPassRate',
  )!;
  assert.equal(v.passed, false);
});

test('a deterministic gate passes at exactly 1.0 and fails a hair under', () => {
  // The boundary, on a metric that still gates. 0.9999 is not "essentially
  // exact" — it means one citation an advocate typed resolved to the wrong
  // judgment, which is the failure the whole product exists to prevent.
  const at = grade({ ...perfect, structuredExactness: 1 }).find(
    (v) => v.name === 'structuredExactness',
  )!;
  const under = grade({ ...perfect, structuredExactness: 0.9999 }).find(
    (v) => v.name === 'structuredExactness',
  )!;
  assert.equal(at.passed, true);
  assert.equal(under.passed, false);
});

/* ------------------------------------------------------------------------- */
/* A KEY IS NOT A MEASUREMENT                                                 */
/* ------------------------------------------------------------------------- */

test('no Gate S2 metric is derived from the presence of an env var', async () => {
  /**
   * The regression this exists for, found live on 9 Aug 2026.
   *
   * `run-cli.ts` computed `generationReady = Boolean(process.env.OPENROUTER_API_KEY)`
   * and then set `hallucinationRate: generationReady ? 0 : null`. The moment a
   * key was added, hallucinationRate and silentDropRate reported 0 — a PASS —
   * with no model ever called and no generation path in the package at all.
   *
   * Asserted against the SOURCE because that is where the mistake lives; a unit
   * test of `grade()` cannot see it, and `grade()` was always correct.
   */
  const src = await readFile(new URL('./run-cli.ts', import.meta.url), 'utf8');

  const metricNames = [
    'hallucinationRate',
    'silentDropRate',
    'adversarialPassRate',
    'staleOverruledRate',
    'overruledLeakage',
    'successAt5',
  ];
  for (const metric of metricNames) {
    const assignment = new RegExp(`${metric}\\s*:([^,\\n]*)`).exec(src);
    if (!assignment) continue;
    assert.doesNotMatch(
      assignment[1]!,
      /process\.env|Ready\b/,
      `${metric} is assigned from an environment flag — a key is not a measurement`,
    );
  }
});

test('an unimplemented generation path cannot be mistaken for a clean one', () => {
  // Belt and braces, through the public surface. The three generation metrics
  // are null while no model is called, and null must fail — otherwise "we never
  // ran it" and "we ran it and found nothing wrong" are indistinguishable.
  const verdicts = grade({
    hallucinationRate: null,
    silentDropRate: null,
    staleOverruledRate: 0,
    overruledLeakage: 0,
    adversarialPassRate: null,
    structuredExactness: 1,
    fieldPrecision: 1,
    successAt5: 1,
  });
  for (const name of ['hallucinationRate', 'silentDropRate', 'adversarialPassRate']) {
    const v = verdicts.find((x) => x.name === name)!;
    assert.equal(v.passed, false, `${name} passed while unmeasured`);
    assert.ok(v.notMeasured, `${name} did not report itself as not measured`);
  }
});

test('nDCG@K: rank 1 scores exactly 1.0 — the ideal ranking', () => {
  assert.equal(ndcgAtK(1, 5), 1);
});

test('nDCG@K: not found within K scores exactly 0', () => {
  assert.equal(ndcgAtK(null, 5), 0);
});

test('nDCG@K: found, but past K, scores exactly 0 — not a partial credit', () => {
  // The general algorithm would still give some credit for "found somewhere
  // in the full ranking"; @K by definition does not look past K.
  assert.equal(ndcgAtK(6, 5), 0);
});

test('nDCG@K: found exactly at the boundary K counts', () => {
  assert.equal(ndcgAtK(5, 5), 1 / Math.log2(6));
});

test('nDCG@K: decreases monotonically as rank worsens', () => {
  const at1 = ndcgAtK(1, 20);
  const at2 = ndcgAtK(2, 20);
  const at10 = ndcgAtK(10, 20);
  assert.ok(at1 > at2, 'rank 1 must score higher than rank 2');
  assert.ok(at2 > at10, 'rank 2 must score higher than rank 10');
});

test('mean nDCG@K over an empty set is 0, not NaN', () => {
  assert.equal(meanNdcgAtK([], 5), 0);
});

test('mean nDCG@K: a mix of found-early, found-late-past-K, and not-found', () => {
  // rank 1 -> 1.0, rank 10 (past K=5) -> 0, not found -> 0
  const mean = meanNdcgAtK([1, 10, null], 5);
  assert.equal(mean, (1 + 0 + 0) / 3);
});

test('mean nDCG@K: all queries at the ideal rank averages to exactly 1.0', () => {
  assert.equal(meanNdcgAtK([1, 1, 1], 5), 1);
});
