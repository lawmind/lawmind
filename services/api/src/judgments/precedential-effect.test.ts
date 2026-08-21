/**
 * OD-14 regression fixtures.
 *
 * The defect these lock down is not a crash and not a wrong shape — it is a
 * TRUE-LOOKING label. 73 judgments read `set_aside` for an act that was an
 * overruling, every one of them backed by a correct `overruled` edge, and
 * nothing in the type system or the tests could tell. So the assertions here
 * are about MEANING, and the two that matter most are the two directions of
 * getting it wrong:
 *
 *   * an overruling must not refuse add-to-matter (the OD-14 bite), AND
 *   * a genuine set aside must still refuse (the safety this cannot cost).
 *
 * The live corpus shape is pinned separately in
 * `docs/ai/lcc-od14/treatment-fixture.json`, generated from the graph, so a
 * future re-derivation that changes 73 rows has to change a checked-in file
 * too.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  precedentialEffect,
  precedentialPolicy,
  strongestTreatment,
  type PrecedentialEffect,
} from './precedential-effect.ts';

const ALL_EFFECTS: PrecedentialEffect[] = [
  'none',
  'overruled',
  'overruled_in_part',
  'set_aside',
  'partly_set_aside',
  'doubted',
  'review_required',
];

describe('precedentialEffect — evidence decides the act', () => {
  it('THE OD-14 CASE: stored set_aside explained by an overruled edge is an OVERRULING', () => {
    const effect = precedentialEffect({
      overruledStatus: 'set_aside',
      inboundRelationships: ['overruled'],
    });
    assert.equal(effect, 'overruled');

    const policy = precedentialPolicy(effect);
    // The bite: E.V. Chinnaiah is addable again.
    assert.equal(policy.addToMatter, 'allow');
    // And the warning is not the price of it.
    assert.equal(policy.bannerStatus, 'set_aside');
    assert.equal(policy.citableForUntouchedPropositions, true);
  });

  it('a genuine set aside — no edge behind it — still REFUSES', () => {
    const effect = precedentialEffect({
      overruledStatus: 'set_aside',
      inboundRelationships: [],
    });
    assert.equal(effect, 'set_aside');
    assert.equal(precedentialPolicy(effect).addToMatter, 'refuse');
    assert.equal(precedentialPolicy(effect).citableForUntouchedPropositions, false);
  });

  it('an overruled_in_part edge is not widened to a whole overruling', () => {
    const effect = precedentialEffect({
      overruledStatus: 'partly_set_aside',
      inboundRelationships: ['overruled_in_part'],
    });
    assert.equal(effect, 'overruled_in_part');
    assert.equal(precedentialPolicy(effect).addToMatter, 'allow');
  });

  it('doubted stays doubted, and stays addable', () => {
    const effect = precedentialEffect({
      overruledStatus: 'doubted',
      inboundRelationships: ['doubted'],
    });
    assert.equal(effect, 'doubted');
    assert.equal(precedentialPolicy(effect).addToMatter, 'allow');
    assert.equal(precedentialPolicy(effect).bannerStatus, 'doubted');
  });

  it('the strongest edge wins when a judgment was treated more than once', () => {
    assert.equal(strongestTreatment(['doubted', 'overruled', 'followed']), 'overruled');
    assert.equal(strongestTreatment(['doubted', 'overruled_in_part']), 'overruled_in_part');
  });

  it('distinguished and followed are NOT adverse treatment and change nothing', () => {
    assert.equal(strongestTreatment(['distinguished', 'followed', 'approved', 'cites']), null);
    assert.equal(
      precedentialEffect({ overruledStatus: 'none', inboundRelationships: ['distinguished'] }),
      'none',
    );
  });

  it('NEVER downgrades: a stored set_aside explained only by a doubted edge is REVIEW_REQUIRED', () => {
    const effect = precedentialEffect({
      overruledStatus: 'set_aside',
      inboundRelationships: ['doubted'],
    });
    assert.equal(effect, 'review_required');
    // Honest about not knowing; conservative about acting on it.
    assert.equal(precedentialPolicy(effect).addToMatter, 'refuse');
    assert.equal(precedentialPolicy(effect).bannerStatus, 'set_aside');
  });

  it('a good-law judgment with an unapplied edge is still none — this function does not flip standing', () => {
    // propagate-treatment.ts owns that transition, with the fan-out and the
    // alerts. A second implementation here would skip both.
    assert.equal(
      precedentialEffect({ overruledStatus: 'none', inboundRelationships: ['overruled'] }),
      'none',
    );
  });
});

describe('precedentialPolicy — the wire contract cannot grow a fifth value', () => {
  it('every effect maps to one of exactly the four OverruledStatus values', () => {
    const wire = new Set(['none', 'set_aside', 'partly_set_aside', 'doubted']);
    for (const e of ALL_EFFECTS) {
      assert.ok(
        wire.has(precedentialPolicy(e).bannerStatus),
        `${e} produced a bannerStatus outside the four-value wire enum`,
      );
    }
  });

  it('every effect has a policy, a reason, and no silent default', () => {
    for (const e of ALL_EFFECTS) {
      const p = precedentialPolicy(e);
      assert.ok(p.addToMatter === 'allow' || p.addToMatter === 'refuse', e);
      assert.ok(p.because.length > 10, `${e} has no usable reason`);
    }
  });

  it('refusal implies not citable, and citable implies not refused — they cannot disagree', () => {
    for (const e of ALL_EFFECTS) {
      const p = precedentialPolicy(e);
      assert.equal(
        p.addToMatter === 'refuse',
        !p.citableForUntouchedPropositions,
        `${e} refuses add-to-matter while claiming it is still citable, or the reverse`,
      );
    }
  });

  it('exactly two effects refuse, and both are cases where nothing is left to rely on', () => {
    const refusing = ALL_EFFECTS.filter((e) => precedentialPolicy(e).addToMatter === 'refuse');
    assert.deepEqual(refusing.sort(), ['review_required', 'set_aside']);
  });
});
