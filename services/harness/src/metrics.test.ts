/**
 * The grader's own failure modes. Every test here is about a way a gate can
 * report success without having asked a question.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type HarnessMetrics, grade, rate, THRESHOLDS } from './metrics.ts';

const perfect: HarnessMetrics = {
  hallucinationRate: 0,
  silentDropRate: 0,
  staleOverruledRate: 0,
  overruledLeakage: 0,
  successAt5: 0.8,
  adversarialPassRate: 1,
};

test('a clean run passes every metric', () => {
  const verdicts = grade(perfect);
  assert.equal(verdicts.length, 6);
  assert.ok(verdicts.every((v) => v.passed));
});

test('every metric is reported, not only the failures', () => {
  // SPRINT_2.md DONE: "Every number reported, not just the failures." A gate
  // that speaks only when it fails teaches everyone to read silence as success.
  const verdicts = grade({ ...perfect, successAt5: 0.1 });
  assert.equal(verdicts.length, 6);
  assert.equal(verdicts.filter((v) => v.passed).length, 5);
});

test('an unmeasured metric FAILS — this is the whole point', () => {
  // `null <= 0` is true in JavaScript. Without the explicit null branch, a
  // harness that observed nothing would report a flawless hallucination rate.
  for (const key of Object.keys(perfect) as (keyof HarnessMetrics)[]) {
    const verdicts = grade({ ...perfect, [key]: null });
    const v = verdicts.find((x) => x.name === key)!;
    assert.equal(v.passed, false, `${key} passed while unmeasured`);
    assert.ok(v.notMeasured, `${key} failed without saying it was unmeasured`);
  }
});

test('not-measured is distinguishable from measured-and-bad', () => {
  const unmeasured = grade({ ...perfect, successAt5: null }).find((v) => v.name === 'successAt5')!;
  const bad = grade({ ...perfect, successAt5: 0.1 }).find((v) => v.name === 'successAt5')!;

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
  assert.equal(THRESHOLDS.successAt5Min, 0.7);
  assert.equal(THRESHOLDS.adversarialPassRate, 1);
});

test('an adversarial pass rate just short of 1 fails', () => {
  // Four of five is not "mostly safe". Each of the five is a documented output
  // that a real published dataset actually produces.
  const v = grade({ ...perfect, adversarialPassRate: 0.8 }).find(
    (x) => x.name === 'adversarialPassRate',
  )!;
  assert.equal(v.passed, false);
});

test('precision exactly at the floor passes; a hair under does not', () => {
  const at = grade({ ...perfect, successAt5: 0.7 }).find((v) => v.name === 'successAt5')!;
  const under = grade({ ...perfect, successAt5: 0.6999 }).find((v) => v.name === 'successAt5')!;
  assert.equal(at.passed, true);
  assert.equal(under.passed, false);
});
