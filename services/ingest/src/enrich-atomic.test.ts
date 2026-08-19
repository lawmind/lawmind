/**
 * The atomic tasks are the ones whose whole value is that a rejection names ONE
 * object. These tests hold the two properties that makes true: the claim value
 * is the QUOTE (so `verifyClaims` can prove it), and everything the model
 * asserted about the object rides beside it as unverified `extra`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ATOMIC_TASKS, buildAtomicPrompt, claimsFromAtomic, isAtomicTask, locateSpan } from './enrich-atomic.ts';
import { MIN_EVIDENCE_CHARS, verifyClaims } from './enrich.ts';

const JUDGMENT =
  'The appellant filed the suit on 12.03.2009 seeking a permanent injunction.\n' +
  'The learned counsel for the respondent submitted that the suit was barred by\n' +
  'limitation. We are of the view that the plaint discloses no cause of action.\n' +
  'The appeal is accordingly dismissed with no order as to costs.';

describe('ATOMIC_TASKS', () => {
  it('is exactly migration 0054\'s vocabulary, in the database\'s own spelling', () => {
    assert.deepEqual([...ATOMIC_TASKS], [
      'issue',
      'relief',
      'procedural_event',
      'date_event',
      'fact_proposition',
      'party_action',
      'court_action',
      'reasoning_proposition',
      'statute_role',
    ]);
  });

  it('does not answer to a name the CHECK constraint has never heard of', () => {
    assert.equal(isAtomicTask('section_role'), false, '0054 spells it statute_role');
    assert.equal(isAtomicTask('holding'), false, 'holding is a composite task, not an atomic one');
    assert.equal(isAtomicTask('statute_role'), true);
  });
});

describe('buildAtomicPrompt', () => {
  it('asks for one kind of object and says so', () => {
    const p = buildAtomicPrompt('court_action', JUDGMENT);
    assert.match(p, /something THE COURT DID/);
    assert.doesNotMatch(p, /holdings/);
    assert.match(p, /"objects":\[/);
  });

  it('carries the minimum evidence length the verifier actually enforces', () => {
    assert.match(buildAtomicPrompt('issue', JUDGMENT), new RegExp(`at least ${MIN_EVIDENCE_CHARS} characters`));
  });

  it('is pure — the same task and text produce the same string, so input_hash is stable', () => {
    assert.equal(buildAtomicPrompt('relief', JUDGMENT), buildAtomicPrompt('relief', JUDGMENT));
  });

  it('names the task-specific fields for the tasks that have them', () => {
    assert.match(buildAtomicPrompt('statute_role', JUDGMENT), /"section":"<section>","role":"<role>"/);
    assert.match(buildAtomicPrompt('date_event', JUDGMENT), /"date":"<date>"/);
    assert.doesNotMatch(buildAtomicPrompt('issue', JUDGMENT), /"party"/);
  });
});

describe('claimsFromAtomic', () => {
  it('makes the QUOTE the claim value, so the string match proves the claim', () => {
    const [c] = claimsFromAtomic('court_action', {
      objects: [{ quote: 'The appeal is accordingly dismissed', value: 'the appeal was dismissed', court: 'this Court' }],
    });
    assert.ok(c);
    assert.equal(c.value, 'The appeal is accordingly dismissed');
    assert.equal(c.evidence, c.value);
    assert.equal(c.kind, 'court_action');
    assert.equal(c.extra?.['objectValue'], 'the appeal was dismissed');
    assert.equal(c.extra?.['court'], 'this Court');
  });

  it('drops an object with no quote rather than keeping an unprovable one', () => {
    assert.equal(claimsFromAtomic('issue', { objects: [{ value: 'whether the suit is barred' }] }).length, 0);
  });

  it('returns nothing for a response of the wrong shape', () => {
    assert.equal(claimsFromAtomic('issue', { issues: [{ quote: 'x' }] }).length, 0);
    assert.equal(claimsFromAtomic('issue', null).length, 0);
  });

  it('a fabricated span is REJECTED by the verifier, and a real one survives it', () => {
    const claims = claimsFromAtomic('fact_proposition', {
      objects: [
        { quote: 'the plaint discloses no cause of action', value: 'no cause of action' },
        { quote: 'the plaintiff was awarded exemplary damages', value: 'damages awarded' },
      ],
    });
    const verdicts = verifyClaims(claims, JUDGMENT);
    assert.equal(verdicts[0]?.verified, true);
    assert.equal(verdicts[1]?.verified, false, 'a span the judgment does not contain must not verify');
  });
});

describe('locateSpan', () => {
  it('finds a span that verified across a line break in the source', () => {
    const at = locateSpan(JUDGMENT, 'the suit was barred by limitation');
    assert.ok(at !== null && at > 0);
    assert.match(JUDGMENT.slice(at!, at! + 20), /the suit was barred/);
  });

  it('returns null rather than a guess when the span is not there', () => {
    assert.equal(locateSpan(JUDGMENT, 'exemplary damages were awarded'), null);
  });
});
