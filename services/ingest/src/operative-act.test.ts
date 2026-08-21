/**
 * Fixtures are real operative sentences from the 90-row gold, shortened.
 *
 * The negative tests matter more than the positive ones. This rule DEMOTES
 * documents out of an authority class, so a false positive removes real law from
 * the index — and the two ways it could happen are a recital of history and a
 * footer that swallows the order.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OPERATIVE_ACT_VERSION, operativeRegion, procedurallyDisposed } from './operative-act.ts';

const pad = (s: string) => 'x '.repeat(1200) + s;

describe('procedurallyDisposed — catches the operative act', () => {
  const cases: [string, string][] = [
    ['WITHDRAWN', 'Accordingly, the writ petition is dismissed as withdrawn.'],
    ['NOT_PRESSED', 'the instant writ petition stands dismissed as not pressed, as such, disposed of.'],
    ['WANT_OF_PROSECUTION', 'the writ petition is dismissed for want of prosecution.'],
    ['WANT_OF_PROSECUTION', 'Learned counsel for the petitioners pleads no instructions.'],
    ['INFRUCTUOUS', 'the civil miscellaneous appeal is dismissed as having become infructuous.'],
    ['ABATED', 'the Civil Miscellaneous Appeal is dismissed as abated.'],
    ['REGISTRY_DEFAULT', 'the petition stands dismissed for non-compliance of office objections.'],
    ['ADJOURNED', 'At the request of Advocate for the applicant, Stand over to 09/04/2025.'],
    ['ADJOURNED', 'List this matter on 07th May, 2026 for further orders.'],
    ['NO_OPINION_EXPRESSED', 'It is made clear that this Court has not expressed any opinion on any point.'],
    ['NO_OPINION_EXPRESSED', 'This order does not pronounce on the finality of the rights of the parties.'],
    ['DECIDED_BY_REFERENCE', 'For orders see detailed reasons recorded in a separate order of even date.'],

  ];
  for (const [reason, sentence] of cases) {
    it(`${reason}: ${sentence.slice(0, 46)}…`, () => {
      const v = procedurallyDisposed(pad(sentence));
      assert.equal(v.procedural, true, `not caught: ${sentence}`);
      assert.ok(v.reasons.includes(reason as never), `expected ${reason}, got ${v.reasons.join(',')}`);
    });
  }

  it('survives a line break inside the phrase', () => {
    // The bail phrase in hc-classify.ts failed on exactly this for as long as it
    // existed. Every phrase rule in this repo starts whitespace-flexible now.
    assert.equal(procedurallyDisposed(pad('the appeal is dismissed as\nwithdrawn.')).procedural, true);
  });
});

describe('procedurallyDisposed — the false positives that would remove real law', () => {
  /**
   * THE test. A reasoned judgment that RECITES a withdrawal in its history must
   * survive: matching anywhere in the document instead of in the operative
   * region would convict it, and a demote-only rule would then be quietly
   * deleting authorities.
   */
  it('does not convict a judgment that merely recites an earlier withdrawal', () => {
    const judgment =
      'The petitioner had earlier approached this Court and that writ petition was dismissed as withdrawn. ' +
      'x '.repeat(1400) +
      'For the reasons recorded above, the impugned order is quashed and set aside. The writ petition is allowed.';
    assert.equal(procedurallyDisposed(judgment).procedural, false);
  });

  it('leaves an ordinary reasoned disposal alone', () => {
    for (const s of [
      'For the reasons recorded above, finding no merit in this writ petition the same is hereby dismissed.',
      'In the result, the judgment and decree passed by the courts below are hereby set aside and appeal allowed.',
      'the accused is acquitted of the offence alleged. He is set at liberty. The appeal is allowed as above.',
    ]) {
      assert.equal(procedurallyDisposed(pad(s)).procedural, false, `wrongly demoted: ${s}`);
    }
  });

  /**
   * The measured regression. `DELAY_CONDONED` was in the pattern list and looked
   * right on the gold; on the corpus BOTH of its demotions in a read sample of
   * 22 were wrong, including this one — an acquittal. A demote-only rule that
   * removes an acquittal from the authority set is doing the exact damage the
   * design was supposed to make impossible.
   */
  it('does not convict an order that condones delay and then decides the case', () => {
    /* The padding is deliberately SHORT so the delay sentence is inside the
     * operative window. An earlier version of this test padded to 2,400
     * characters and passed for the wrong reason — the phrase fell outside the
     * window, so the test proved nothing about the pattern list. Asserted
     * explicitly below. */
    const order =
      'The delay in filing the revision is condoned. ' +
      'x '.repeat(300) +
      'Accordingly, the revision filed by applicant is allowed. Applicant is permitted to compound ' +
      'the offence. Applicant is acquitted from the said offences.';
    assert.ok(
      operativeRegion(order).includes('is condoned'),
      'fixture is broken: the delay phrase must be INSIDE the window for this test to mean anything',
    );
    assert.equal(procedurallyDisposed(order).procedural, false);
  });

  it('returns false on empty and null text rather than throwing', () => {
    assert.equal(procedurallyDisposed(null).procedural, false);
    assert.equal(procedurallyDisposed('').procedural, false);
  });
});

describe('operativeRegion — a footer must never swallow the order', () => {
  /**
   * Measured failure: cutting at the EARLIEST footer marker returned Karnataka
   * orders ending mid-cause-title, and two real procedural orders went
   * undetected. Both conditions below were added because one alone was not
   * enough.
   */
  it('keeps the order when a "To 1." block sits in the cause title of a short document', () => {
    const doc =
      'IN THE HIGH COURT. To\n1. The Registrar\n2. The Respondent. ' +
      'x '.repeat(200) +
      'Consequently, the petition stands dismissed for non-compliance of office objections.';
    assert.ok(operativeRegion(doc).includes('non-compliance of office objections'));
    assert.equal(procedurallyDisposed(doc).procedural, true);
  });

  it('does strip a genuine trailing service list', () => {
    const doc =
      'x '.repeat(1500) +
      'the writ petition is allowed. ' +
      'To\n1. The District Collector, Chengalpattu District.\n2. The Revenue Divisional Officer.';
    const region = operativeRegion(doc);
    assert.ok(region.includes('the writ petition is allowed'));
    assert.ok(!region.includes('District Collector'));
  });

  it('reports the window it examined, and stamps its version', () => {
    const v = procedurallyDisposed(pad('the appeal is dismissed as withdrawn.'));
    assert.ok(v.window > 0);
    assert.equal(v.method, `operative_act_${OPERATIVE_ACT_VERSION}`);
  });
});
