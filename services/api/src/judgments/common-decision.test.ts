/**
 * The failure mode here is a sentence, not a crash: telling an advocate that
 * seven thousand different petitions are "the same case", or showing forty of
 * seven thousand members without saying the list was cut.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type CommonDecision, commonDecisionNote } from './common-decision.ts';

const decision = (over: Partial<CommonDecision>): CommonDecision => ({
  contentHash: 'abc123',
  memberCount: 1,
  isCommonOrder: false,
  members: [],
  truncated: false,
  ...over,
});

describe('commonDecisionNote', () => {
  it('says nothing about an ordinary decision that disposed of one case', () => {
    assert.equal(commonDecisionNote(decision({})), null);
  });

  it('counts the OTHER cases, not the total — the advocate is already reading one of them', () => {
    assert.equal(
      commonDecisionNote(decision({ memberCount: 2, isCommonOrder: true })),
      'This decision also disposed of 1 other case.',
    );
  });

  it('pluralises without a template bug', () => {
    assert.equal(
      commonDecisionNote(decision({ memberCount: 3, isCommonOrder: true })),
      'This decision also disposed of 2 other cases.',
    );
  });

  it('groups a 7,118-petition common order the way an Indian reader expects', () => {
    const note = commonDecisionNote(decision({ memberCount: 7118, isCommonOrder: true }));
    assert.equal(note, 'This decision also disposed of 7,117 other cases.');
  });

  it('never says the cases are the same case — they are different cases with one decision', () => {
    const note = commonDecisionNote(decision({ memberCount: 40, isCommonOrder: true })) ?? '';
    assert.doesNotMatch(note, /same case|duplicate/i);
    assert.match(note, /disposed of/);
  });
});
