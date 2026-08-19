import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mayEnterJudgments, routeTribunalRecord } from './tribunal-routing.ts';

describe('routeTribunalRecord — Maharashtra RERA', () => {
  it('excludes Roznama from authority, by default and by name', () => {
    const r = routeTribunalRecord('rera_mh', 'Roznama');
    assert.equal(r.route, 'procedural_record');
    assert.equal(r.authorityEligible, false);
  });

  it('excludes the whitespace variants that are actually in the live data', () => {
    /**
     * 41,791 records carry `Roznama` "+ whitespace variants" (bus 0610). An
     * exact-string match would have routed the variants to legal_document —
     * the exact failure this module exists to prevent, arriving through a
     * trailing space.
     */
    for (const variant of ['Roznama ', ' Roznama', 'Roznama\t', 'ROZNAMA', 'roznama  ']) {
      const r = routeTribunalRecord('rera_mh', variant);
      assert.equal(r.authorityEligible, false, `variant ${JSON.stringify(variant)} leaked through`);
    }
  });

  it('admits the four reasoned types', () => {
    for (const type of ['Order', 'Judgement', 'Operative Part in Appeal / Application']) {
      const r = routeTribunalRecord('rera_mh', type);
      assert.equal(r.route, 'legal_document', type);
      assert.equal(r.authorityEligible, true, type);
    }
  });

  it('holds an unrecognised type instead of guessing it into either bucket', () => {
    const r = routeTribunalRecord('rera_mh', 'Interim Directions');
    assert.equal(r.route, 'unclassified');
    assert.equal(r.authorityEligible, false, 'unknown must not default to authority');
  });
});

describe('routeTribunalRecord — Delhi RERA has no type column', () => {
  it('holds Delhi records rather than trusting the URL path that says "Judgements"', () => {
    /**
     * The inference is reasonable and it is not evidence. Maharashtra's listing
     * looked like a decision table too and was 85% Roznama — detectable only
     * because the type field existed to read. Delhi has no such field, so the
     * same error would be invisible rather than merely unnoticed.
     */
    for (const raw of ['', 'Judgement', 'Final Order']) {
      const r = routeTribunalRecord('rera_dl', raw);
      assert.equal(r.route, 'unclassified', JSON.stringify(raw));
      assert.equal(r.authorityEligible, false, JSON.stringify(raw));
    }
  });

  it('does not let a plausible-looking type string promote Delhi to authority', () => {
    /** `Judgement` IS an authority-eligible type for Maharashtra. Not here. */
    assert.equal(routeTribunalRecord('rera_mh', 'Judgement').authorityEligible, true);
    assert.equal(routeTribunalRecord('rera_dl', 'Judgement').authorityEligible, false);
  });
});

describe('routeTribunalRecord — CCI and CAT', () => {
  it('routes a CCI order to legal_document, never to judgments', () => {
    const r = routeTribunalRecord('cci', 'Order');
    assert.equal(r.route, 'legal_document');
    assert.match(r.reason, /regulator-shaped/);
  });

  it('routes a CAT order to legal_document', () => {
    assert.equal(routeTribunalRecord('cat', 'Order').route, 'legal_document');
  });
});

describe('mayEnterJudgments', () => {
  it('refuses every tribunal source, including the reasoned ones', () => {
    for (const source of ['cci', 'cat', 'rera_mh'] as const) {
      const verdict = mayEnterJudgments(routeTribunalRecord(source, 'Order'));
      assert.equal(verdict.allowed, false, source);
    }
  });
});
