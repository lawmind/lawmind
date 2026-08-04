import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { textQuality } from './quality.ts';

describe('textQuality', () => {
  it('scores clean modern judgment text at or near 1', () => {
    const clean =
      'The appellant was convicted under Section 302 of the Penal Code and sentenced ' +
      'to imprisonment for life by the Sessions Judge.';
    assert.equal(textQuality(clean), 1);
  });

  it('scores real OCR damage below clean text', () => {
    // Both strings are from the 1950 corpus, verbatim.
    const damaged = "Oot. l't, 806 SUPREME COURT REPORTS KANDOKOlU CHELLA Y AMMA";
    const clean = 'Oct. 17, 806 SUPREME COURT REPORTS KANDOKOLU CHELLA Y AMMA';
    const dq = textQuality(damaged);
    const cq = textQuality(clean);
    assert.ok(dq !== null && cq !== null);
    assert.ok(dq < cq, `expected damaged ${dq} < clean ${cq}`);
  });

  it('returns null when there is nothing to assess', () => {
    // Scoring unassessable text as perfect is the dishonesty this column avoids.
    assert.equal(textQuality(''), null);
    assert.equal(textQuality('   \n  '), null);
    assert.equal(textQuality('1985 302 14-19'), null);
  });

  it('does not punish ordinary legal punctuation', () => {
    const legal = "the accused's plea, co-accused, S.C.R. 806, para 14–19 — allowed";
    const score = textQuality(legal);
    assert.ok(score !== null && score > 0.8, `legal punctuation scored ${score}`);
  });

  it('leaves Devanagari unscathed', () => {
    // No Latin tokens at all, so there is nothing this heuristic can judge.
    assert.equal(textQuality('जमानत सह-अभियुक्त के साथ समानता'), null);
  });

  it('cannot see a confidently wrong character, and that is the point', () => {
    // 1985 misread as 1935 is well-formed and scores clean. Documented, not fixed:
    // this measures visible corruption, never correctness.
    assert.equal(textQuality('decided in 1935 by the Court'), 1);
  });

  it('stays inside numeric(4,3) range', () => {
    for (const s of ['a', 'aB cD eF', 'x'.repeat(50)]) {
      const q = textQuality(s);
      assert.ok(q !== null && q >= 0 && q <= 1);
      assert.ok(String(q).replace(/^\d\.?/, '').length <= 3);
    }
  });
});
