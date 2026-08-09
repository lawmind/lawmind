/**
 * The grader's own failure modes. Every test here is about a way a gate can
 * report success without having asked a question.
 */
import { readFile } from 'node:fs/promises';
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
    const assignment = new RegExp(`${metric}\s*:([^,\n]*)`).exec(src);
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
    successAt5: 1,
    adversarialPassRate: null,
  });
  for (const name of ['hallucinationRate', 'silentDropRate', 'adversarialPassRate']) {
    const v = verdicts.find((x) => x.name === name)!;
    assert.equal(v.passed, false, `${name} passed while unmeasured`);
    assert.ok(v.notMeasured, `${name} did not report itself as not measured`);
  }
});
