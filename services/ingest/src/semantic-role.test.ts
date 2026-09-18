/**
 * Semantic role verification — the failure it exists to catch, asserted both ways.
 *
 * The dangerous case is a REAL quotation under the WRONG role. So every rule is
 * tested with the same span in two positions: once where the structure supports
 * the role and once where it contradicts it. A verifier that accepts both is
 * worthless, and a verifier tested only on the accepting side looks identical to
 * one that works.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractDate, verifyRole } from './semantic-role.ts';

/** A short judgment with a clean recital → reasoning → operative structure. */
const JUDGMENT = [
  'IN THE HIGH COURT OF JUDICATURE AT MADRAS',
  'This civil revision petition arises out of the order dated 28.01.2019.',
  'It is contended by the learned counsel for the petitioner that the delay of 1650 days',
  'occurred because he was transferred and could not contact his counsel, and that the',
  'trial Court ought to have condoned the delay in the interest of justice.',
  'Per contra, learned counsel for the respondent submitted that no sufficient cause',
  'whatsoever has been shown for the inordinate delay.',
  'The question that arises for consideration is whether the delay of 1650 days ought',
  'to have been condoned by the trial Court.',
  'Having considered the rival submissions and perused the material on record, we are',
  'of the considered opinion that the trial Court has rightly rejected the application',
  'for condoning the delay.',
  'In the result, this Civil Revision Petition stands dismissed. No costs.',
].join('\n');

const ok = { documentTextSafety: 'UNKNOWN' as const, fullText: JUDGMENT };

describe('holding — after the submission boundary, in the court’s own voice', () => {
  it('ACCEPTS a holding that sits after a court-voice marker', () => {
    const v = verifyRole({
      ...ok,
      role: 'holding',
      span: 'the trial Court has rightly rejected the application for condoning the delay',
    });
    assert.equal(v.outcome, 'CANONICAL_ACCEPT');
    assert.equal(v.precedingMarkerKind, 'court');
  });

  it('REFUSES a party contention filed as a holding — the failure this exists for', () => {
    const v = verifyRole({
      ...ok,
      role: 'holding',
      span: 'the trial Court ought to have condoned the delay in the interest of justice',
    });
    assert.equal(v.outcome, 'ROLE_MISMATCH');
    assert.equal(v.rule, 'span_sits_inside_a_recital_of_submissions');
  });

  it('REFUSES a respondent submission filed as a holding', () => {
    const v = verifyRole({
      ...ok,
      role: 'holding',
      span: 'no sufficient cause whatsoever has been shown for the inordinate delay',
    });
    assert.equal(v.outcome, 'ROLE_MISMATCH');
  });
});

describe('argument — the exact mirror of the holding test', () => {
  it('ACCEPTS a contention that sits inside a recital of submissions', () => {
    const v = verifyRole({
      ...ok,
      role: 'argument_petitioner',
      span: 'the trial Court ought to have condoned the delay in the interest of justice',
    });
    assert.equal(v.outcome, 'CANONICAL_ACCEPT');
  });

  it('REFUSES the court’s own words filed as a party argument', () => {
    const v = verifyRole({
      ...ok,
      role: 'argument_petitioner',
      span: 'the trial Court has rightly rejected the application for condoning the delay',
    });
    assert.equal(v.outcome, 'ROLE_MISMATCH');
  });

  it('no span can satisfy both holding and argument', () => {
    const spans = [
      'the trial Court ought to have condoned the delay in the interest of justice',
      'the trial Court has rightly rejected the application for condoning the delay',
    ];
    for (const span of spans) {
      const asHolding = verifyRole({ ...ok, role: 'holding', span }).outcome;
      const asArgument = verifyRole({ ...ok, role: 'argument_petitioner', span }).outcome;
      assert.ok(
        !(asHolding === 'CANONICAL_ACCEPT' && asArgument === 'CANONICAL_ACCEPT'),
        `both roles accepted the same span: ${span}`,
      );
    }
  });
});

describe('quoted precedent is that court’s reasoning, not this one’s', () => {
  const withQuote = [
    'Having considered the submissions, we refer to the judgment which held as follows:',
    '"The limitation period is mandatory and no court may extend it on sympathy alone."',
    'We are of the considered opinion that the principle applies squarely here.',
  ].join('\n');

  it('REFUSES a reasoning claim taken from inside the block quote', () => {
    const v = verifyRole({
      documentTextSafety: 'UNKNOWN',
      fullText: withQuote,
      role: 'reasoning_proposition',
      span: 'The limitation period is mandatory and no court may extend it on sympathy alone',
    });
    assert.equal(v.outcome, 'ROLE_MISMATCH');
    assert.equal(v.rule, 'span_is_inside_quoted_material');
  });

  it('ACCEPTS the court’s own sentence after the quote closes', () => {
    const v = verifyRole({
      documentTextSafety: 'UNKNOWN',
      fullText: withQuote,
      role: 'reasoning_proposition',
      span: 'the principle applies squarely here',
    });
    assert.equal(v.outcome, 'CANONICAL_ACCEPT');
  });
});

describe('relief — a prayer is not a grant', () => {
  it('ACCEPTS a disposal in the operative part', () => {
    const v = verifyRole({
      ...ok,
      role: 'relief_granted',
      span: 'this Civil Revision Petition stands dismissed',
    });
    assert.equal(v.outcome, 'CANONICAL_ACCEPT');
  });

  it('REFUSES relief recited inside a submission', () => {
    const pleaded = [
      'It is submitted by learned counsel for the petitioner that the impugned order',
      'be set aside and the petition be allowed with costs.',
    ].join('\n');
    const v = verifyRole({
      documentTextSafety: 'UNKNOWN',
      fullText: pleaded,
      role: 'relief_granted',
      span: 'the petition be allowed with costs',
    });
    assert.equal(v.outcome, 'ROLE_MISMATCH');
  });
});

describe('relief SOUGHT is a prayer, and a prayer is a party submission', () => {
  it('ACCEPTS a prayer recited inside a submission', () => {
    const pleaded = [
      'It is submitted by learned counsel for the petitioner that the impugned order',
      'be set aside and the petition be allowed with costs.',
    ].join('\n');
    const v = verifyRole({
      documentTextSafety: 'UNKNOWN',
      fullText: pleaded,
      role: 'relief',
      span: 'the petition be allowed with costs',
    });
    assert.equal(v.outcome, 'CANONICAL_ACCEPT');
  });

  it('REFUSES a prayer certified from the operative part — the v1 defect', () => {
    /**
     * v1 put `relief` beside `relief_granted` and certified three prayers as
     * operative directions. `enrich-atomic.ts`: "What was asked for, not what
     * was granted — what the court ordered is a court_action."
     */
    const v = verifyRole({
      ...ok,
      role: 'relief',
      span: 'this Civil Revision Petition stands dismissed',
    });
    assert.equal(v.outcome, 'ROLE_MISMATCH');
    assert.equal(v.rule, 'nearest_voice_is_the_court');
  });

  it('relief_granted from the SAME span is still accepted — the two roles are mirrors', () => {
    const v = verifyRole({
      ...ok,
      role: 'relief_granted',
      span: 'this Civil Revision Petition stands dismissed',
    });
    assert.equal(v.outcome, 'CANONICAL_ACCEPT');
  });
});

describe('issue — framing, and only framing', () => {
  it('ACCEPTS a question the court set itself', () => {
    const v = verifyRole({
      ...ok,
      role: 'issue',
      span: 'whether the delay of 1650 days ought to have been condoned',
    });
    assert.equal(v.outcome, 'CANONICAL_ACCEPT');
  });

  it('does NOT accept a declarative sentence as an issue', () => {
    const v = verifyRole({
      ...ok,
      role: 'issue',
      span: 'the trial Court has rightly rejected the application for condoning the delay',
    });
    assert.equal(v.outcome, 'ROLE_UNPROVEN');
  });
});

describe('procedural_event — the date must parse AND be in the case’s lifetime', () => {
  it('ACCEPTS a date inside the lifetime', () => {
    const v = verifyRole({
      ...ok,
      role: 'procedural_event',
      span: 'the order dated 28.01.2019',
      judgmentDate: '2021-06-14',
    });
    assert.equal(v.outcome, 'CANONICAL_ACCEPT');
  });

  it('REFUSES a date after the judgment was delivered', () => {
    const v = verifyRole({
      ...ok,
      role: 'procedural_event',
      span: 'the order dated 28.01.2019',
      judgmentDate: '2015-01-01',
    });
    assert.equal(v.outcome, 'ROLE_MISMATCH');
  });

  it('does not invent a date out of a case number', () => {
    assert.equal(extractDate('I.A.No.413 of 2018'), null);
    assert.equal(extractDate('H.M.O.P.No.141 of 2012'), null);
    assert.equal(extractDate('28.01.2019')?.toISOString().slice(0, 10), '2019-01-28');
    assert.equal(extractDate('14th June, 2021')?.toISOString().slice(0, 10), '2021-06-14');
    // 31 February is not a date, and must not roll forward into March.
    assert.equal(extractDate('31.02.2019'), null);
  });
});

describe('damaged and noisy text can never produce evidence', () => {
  it('a document the contract calls UNSAFE_VERIFIED decides nothing at all', () => {
    const v = verifyRole({
      role: 'holding',
      span: 'the trial Court has rightly rejected the application',
      fullText: JUDGMENT,
      documentTextSafety: 'UNSAFE_VERIFIED',
    });
    assert.equal(v.outcome, 'SOURCE_TEXT_DAMAGED');
    // Not MODEL_UNSUPPORTED. 59.2% of the old counter was this case.
    assert.notEqual(v.outcome, 'MODEL_UNSUPPORTED');
  });

  it('a substring found inside glyph noise is GLYPH_NOISE_MATCH, not a verification', () => {
    /* Real glyph garbage, with the needle appearing ONCE inside it — which is
     * how the 25-of-773 case actually looks. A short span will eventually match
     * somewhere in three thousand characters of substitution codes. */
    const noise = '74< =7/ 12- <.50 7==-4;-< 8*2 9=1 <.50 7==-4;-< 12- 74< %3 18 (0 ';
    const v = verifyRole({
      role: 'holding',
      span: 'the trial Court',
      fullText: noise.repeat(20) + 'the trial Court' + noise.repeat(20),
      documentTextSafety: 'UNKNOWN',
    });
    assert.equal(v.outcome, 'GLYPH_NOISE_MATCH');
  });

  it('an absent span in a readable document is MODEL_UNSUPPORTED', () => {
    const v = verifyRole({
      ...ok,
      role: 'holding',
      span: 'the Supreme Court directed the State to pay compensation of one crore rupees',
    });
    assert.equal(v.outcome, 'MODEL_UNSUPPORTED');
  });
});

describe('the default is a refusal to promote, never an acceptance', () => {
  it('a span with no voice marker before it is UNPROVEN', () => {
    const v = verifyRole({
      role: 'holding',
      span: 'The parties are before this Court',
      fullText: 'The parties are before this Court in a dispute about a boundary wall.',
      documentTextSafety: 'UNKNOWN',
    });
    assert.equal(v.outcome, 'ROLE_UNPROVEN');
  });

  it('an unknown role is UNPROVEN and names itself', () => {
    const v = verifyRole({
      ...ok,
      role: 'topic',
      span: 'the trial Court has rightly rejected the application',
    });
    assert.equal(v.outcome, 'ROLE_UNPROVEN');
    assert.match(v.rule, /role_not_adjudicable/);
  });
});
