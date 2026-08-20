/**
 * Eligibility has now failed in BOTH directions, and these tests hold the middle.
 *
 * Too narrow: `hc_document_class IS NOT NULL` reached 2.7% of the corpus because
 * 93.7% has never been classified. Too wide in the other sense: Tier A as a
 * universal predicate excludes bail orders, which is right for a holding and
 * wrong for a procedural event, since a bail order is a document made of them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ATOMIC_TASKS } from './enrich-atomic.ts';
import { isProceduralTask, PROCEDURAL_TASK_NAMES, profileFor } from './enrich-eligibility.ts';

describe('profileFor', () => {
  it('a holding is substantive: bail orders out, 2,000-character floor', () => {
    const p = profileFor('holding');
    assert.equal(p.name, 'substantive');
    assert.equal(p.includeBailOrders, false);
    assert.equal(p.minChars, 2000);
  });

  it('a procedural event reaches bail orders, which Tier A excludes by construction', () => {
    const p = profileFor('procedural_event');
    assert.equal(p.name, 'procedural');
    assert.equal(p.includeBailOrders, true);
    assert.ok(
      p.minChars < 2000,
      'a procedural event is a sentence in a one-page order, not an argument',
    );
  });

  /**
   * `issue` ran at 10,486 tokens per verified object because it was being asked
   * of 2,200-character orders that frame no issue — the model returned an empty
   * array, correctly, sixty times. The floor is measured: across 1,732 documents,
   * the share yielding a verified issue rises 29.0% -> 44.3% -> 63.8% across the
   * 2,500 / 5,000 / 7,500-character bands.
   */
  it('issue, relief and reasoning need a REASONED judgment, not merely a substantive one', () => {
    for (const t of ['issue', 'relief', 'reasoning_proposition']) {
      const p = profileFor(t);
      assert.equal(p.name, 'reasoned', `${t} should not be asked of a two-page disposal`);
      assert.equal(p.minChars, 5000);
      assert.equal(p.includeBailOrders, false);
    }
  });

  it('the four machinery tasks share one profile and the reasoning tasks share the other', () => {
    for (const t of ['procedural_event', 'date_event', 'party_action', 'court_action']) {
      assert.equal(profileFor(t).name, 'procedural', `${t} should reach procedural decisions`);
    }
    for (const t of ['fact_proposition', 'statute_role']) {
      assert.equal(profileFor(t).name, 'substantive', `${t} reads reasoning, not machinery`);
    }
    for (const t of ['issue', 'relief', 'reasoning_proposition']) {
      assert.notEqual(profileFor(t).name, 'procedural', `${t} reads reasoning, not machinery`);
    }
  });

  it('every atomic task has a profile — a new one cannot arrive unaccounted for', () => {
    for (const t of ATOMIC_TASKS) assert.ok(profileFor(t).name, `${t} has no eligibility profile`);
  });

  it('NO profile filters on document class — UNKNOWN is not BAD, in either direction', () => {
    const profiles = [
      ...new Set([...ATOMIC_TASKS, 'holding', 'metadata'].map((t) => profileFor(t))),
    ];
    for (const p of profiles) {
      assert.ok(
        !('requiresKnownClass' in p),
        'class is a prioritiser in the selector, never a filter here',
      );
      assert.ok(p.minChars > 0, 'a document with no usable text is out under every profile');
    }
  });

  it('the composite and non-legal-object tasks are unchanged', () => {
    for (const t of [
      'metadata',
      'treatment',
      'citation_extraction',
      'case_structure',
      'authorities',
    ]) {
      assert.equal(profileFor(t).name, 'substantive');
      assert.equal(isProceduralTask(t), false);
    }
  });

  it('names the procedural set explicitly, so the SQL and the tests cannot drift apart', () => {
    assert.deepEqual([...PROCEDURAL_TASK_NAMES].sort(), [
      'court_action',
      'date_event',
      'party_action',
      'procedural_event',
    ]);
  });
});
