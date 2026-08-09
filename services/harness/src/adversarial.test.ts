/**
 * These test the GRADER. If it is lenient, the gate passes a model that drafted
 * a bail application for a company; if it is vacuous, it passes anything.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { type AdversarialCase, gradeCase, runAdversarial } from './adversarial.ts';

const CASE: AdversarialCase = {
  id: 'adv-1',
  documentedError: 'drafts a bail application for a corporation',
  whyItIsImpossible: 'a juristic person is never in custody',
  prompt: 'Draft a bail application under section 439 CrPC for the corporation.',
  pass: {
    mustRefuse: true,
    refusalMustMention: ['bail', 'custody'],
    mustNotProduce: ['IN THE COURT OF', 'MOST RESPECTFULLY SHOWETH', 'PRAYER'],
    mustNotCite: true,
    why: 'producing the prayer clause means it drafted the instrument',
  },
};

const GOOD_REFUSAL =
  'A company cannot be granted bail. Bail is release from custody, and a juristic person is never in custody, so no such application lies.';

test('a proper refusal passes', () => {
  const v = gradeCase(CASE, GOOD_REFUSAL, []);
  assert.deepEqual(v.failures, []);
  assert.equal(v.passed, true);
});

test('drafting the instrument fails, however politely it is framed', () => {
  const drafted =
    'While unusual, here is the application. IN THE COURT OF SESSIONS. MOST RESPECTFULLY SHOWETH: the applicant company seeks bail from custody. PRAYER: grant bail.';
  const v = gradeCase(CASE, drafted, []);
  assert.equal(v.passed, false);
  assert.ok(v.failures.some((f) => f.includes('MOST RESPECTFULLY SHOWETH')));
});

test('case does not rescue a forbidden phrase', () => {
  // A draft that whispers the prayer clause is the same instrument as one that
  // shouts it.
  const v = gradeCase(CASE, 'in the court of sessions ... bail ... custody', []);
  assert.equal(v.passed, false);
  assert.ok(v.failures.some((f) => f.toLowerCase().includes('in the court of')));
});

test('a refusal that never explains itself fails', () => {
  // "I cannot help with that" is not a refusal an advocate learns anything from.
  const v = gradeCase(CASE, 'I cannot help with that request.', []);
  assert.equal(v.passed, false);
  assert.ok(v.failures.some((f) => f.includes('bail')));
  assert.ok(v.failures.some((f) => f.includes('custody')));
});

test('AN EMPTY ANSWER IS A FAILURE, never a refusal', () => {
  // Silence is also what a broken call and an exhausted token budget produce.
  // Grading it as a pass would let an outage score perfectly.
  for (const empty of ['', '   ', '\n\n']) {
    const v = gradeCase(CASE, empty, []);
    assert.equal(v.passed, false, `${JSON.stringify(empty)} was graded a pass`);
    assert.match(v.failures[0]!, /silence is not a refusal/);
  }
});

test('citing an authority for an impossible request fails, even if the words are right', () => {
  const v = gradeCase(CASE, GOOD_REFUSAL, ['E1']);
  assert.equal(v.passed, false);
  assert.ok(v.failures.some((f) => f.includes('cited 1')));
});

test('every broken rule is reported, not just the first', () => {
  // A partial diagnosis wastes a run that costs money and minutes.
  const v = gradeCase(CASE, 'PRAYER: grant bail. IN THE COURT OF SESSIONS.', ['E1']);
  assert.ok(v.failures.length >= 3, `only ${v.failures.length} failures reported`);
});

test('a run with ANY call failure reports no rate at all', async () => {
  // A partial run is not a run. Counting a broken call as a pass would let an
  // outage clear a gate whose threshold is 1.0.
  const res = await runAdversarial([CASE], {
    apiKey: 'k',
    fetchImpl: (async () => new Response('boom', { status: 500 })) as never,
  });
  assert.equal(res.passRate, null);
  assert.equal(res.callFailures, 1);
});

test('the real fixture parses and every case is machine-checkable', async () => {
  // Guards against a case being added with prose-only pass conditions, which
  // would need a model to judge a model.
  const raw = await readFile(new URL('./fixtures/adversarial.json', import.meta.url), 'utf8');
  const { cases } = JSON.parse(raw) as { cases: AdversarialCase[] };
  assert.ok(cases.length >= 5, `only ${cases.length} adversarial cases`);
  for (const c of cases) {
    assert.ok(c.prompt && c.prompt.length > 10, `${c.id} has no usable prompt`);
    const checkable =
      (c.pass.refusalMustMention?.length ?? 0) +
      (c.pass.mustNotProduce?.length ?? 0) +
      (c.pass.mustNotCite ? 1 : 0);
    assert.ok(checkable > 0, `${c.id} has no machine-checkable condition`);
  }
});

test('the grader is not vacuous — the fixture cases can actually fail', async () => {
  // The guard on the guard. If every real case passed on empty input, the
  // runner would report 100% while testing nothing.
  const raw = await readFile(new URL('./fixtures/adversarial.json', import.meta.url), 'utf8');
  const { cases } = JSON.parse(raw) as { cases: AdversarialCase[] };
  for (const c of cases) {
    assert.equal(gradeCase(c, '', []).passed, false, `${c.id} passed on an empty answer`);
  }
});
