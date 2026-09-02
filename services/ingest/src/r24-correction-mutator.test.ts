/**
 * NEW2 R24 mutator gate. The two failures a bulk canonical correction can have
 * without erroring — an update keyed on identity alone, and a partial success —
 * are the only ones tested here, because they are the only ones a green run
 * cannot tell you about. Artifact-only: no database, no network.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCorrectionPlan,
  classifyUpdateResult,
  verifyPostUpdateState,
  type CorrectionUpdatePlan,
} from './correction-mutator.ts';
import type {
  CorrectionCandidateRow,
  CorrectionPopulationManifest,
} from './correction-preflight.ts';

const row = (over: Partial<CorrectionCandidateRow> = {}): CorrectionCandidateRow => ({
  judgmentId: '00000000-0000-0000-0000-000000000001',
  sourceIdentity: 'https://example.invalid/a.pdf',
  sourceContentHash: 'a'.repeat(64),
  currentStoredNeutralCitation: '2011:APRIL:27',
  proposedDisposition: 'DETERMINISTIC_TO_NULL',
  proposedReplacement: null,
  evidenceClass: 'PROVEN_NOT_A_CITATION',
  evidencePointer: 'docs/ai/new2-r19/evidence.jsonl#1',
  targetHolderClassification: 'NOT_APPLICABLE',
  frontierIdentity: 'f',
  ...over,
});

const manifest = (rows: CorrectionCandidateRow[]): CorrectionPopulationManifest => ({
  schemaVersion: 2,
  populationHash: 'unused',
  candidateCount: rows.length,
  frozenFrontier: { createdAt: 'x', judgmentId: 'y' },
  rows,
  proposedKeyHolders: {},
});

const plan = (over: Partial<CorrectionUpdatePlan> = {}): CorrectionUpdatePlan => ({
  judgmentId: '00000000-0000-0000-0000-000000000001',
  expectedOldValue: '2011:APRIL:27',
  newValue: null,
  disposition: 'DETERMINISTIC_TO_NULL',
  ...over,
});

test('a plan carries the expected old value, so the WHERE clause can never key on identity alone', () => {
  const [only] = buildCorrectionPlan(manifest([row()]));
  assert.equal(only?.expectedOldValue, '2011:APRIL:27');
  assert.equal(only?.newValue, null);
});

test('every structural violation refuses the WHOLE plan rather than dropping a row', () => {
  const cases: Array<[string, CorrectionCandidateRow[]]> = [
    ['TO_NULL_WITH_REPLACEMENT', [row({ proposedReplacement: '2024:PHHC:1' })]],
    [
      'REPLACEMENT_WITH_NULL',
      [row({ proposedDisposition: 'DETERMINISTIC_TO_REPLACE', proposedReplacement: null })],
    ],
    [
      'REPLACEMENT_EQUALS_OLD',
      [
        row({
          proposedDisposition: 'DETERMINISTIC_TO_REPLACE',
          currentStoredNeutralCitation: '2024:PHHC:1',
          proposedReplacement: '2024:PHHC:1',
        }),
      ],
    ],
    ['UNEXPECTED_DISPOSITION', [row({ proposedDisposition: 'DELETE_THE_ROW' })]],
    ['DUPLICATE_JUDGMENT_ID', [row(), row()]],
  ];
  for (const [why, rows] of cases) {
    assert.throws(() => buildCorrectionPlan(manifest(rows)), new RegExp(why), why);
  }
});

test('an update affecting zero or many rows is terminal, and the two are named differently', () => {
  assert.equal(classifyUpdateResult(plan(), 1), 'APPLIED');
  assert.match(classifyUpdateResult(plan(), 0), /^UPDATE_MATCHED_NO_ROW:/);
  assert.match(classifyUpdateResult(plan(), 2), /^UPDATE_MATCHED_MANY_ROWS:.*:2$/);
});

test('the in-transaction readback refuses a value the audit did not describe', () => {
  const plans = [
    plan(),
    plan({
      judgmentId: 'b',
      expectedOldValue: '2024:PHHC:001381',
      newValue: '2024:PHHC:001398',
      disposition: 'DETERMINISTIC_TO_REPLACE',
    }),
  ];
  const sources = new Map([
    [plans[0]!.judgmentId, { sourceIdentity: 's1', sourceContentHash: 'h1' }],
    ['b', { sourceIdentity: 's2', sourceContentHash: 'h2' }],
  ]);
  const good = verifyPostUpdateState(plans, sources, [
    {
      judgmentId: plans[0]!.judgmentId,
      neutralCitation: null,
      sourceIdentity: 's1',
      sourceContentHash: 'h1',
    },
    {
      judgmentId: 'b',
      neutralCitation: '2024:PHHC:001398',
      sourceIdentity: 's2',
      sourceContentHash: 'h2',
    },
  ]);
  assert.equal(good.ok, true);
  assert.deepEqual(good.counts, {
    DETERMINISTIC_TO_NULL: 1,
    DETERMINISTIC_TO_REPLACE: 1,
    DETERMINISTIC_SUFFIX_REPLACE: 0,
  });

  const stillOld = verifyPostUpdateState(plans, sources, [
    {
      judgmentId: plans[0]!.judgmentId,
      neutralCitation: '2011:APRIL:27',
      sourceIdentity: 's1',
      sourceContentHash: 'h1',
    },
    {
      judgmentId: 'b',
      neutralCitation: '2024:PHHC:001398',
      sourceIdentity: 's2',
      sourceContentHash: 'h2',
    },
  ]);
  assert.equal(stillOld.ok, false);
  assert.match(stillOld.refusals[0]!, /^POST_STATE_VALUE_MISMATCH:/);
});

test('a correction that also moved the source pointer is caught, though the citation reads correct', () => {
  const plans = [plan()];
  const sources = new Map([
    [plans[0]!.judgmentId, { sourceIdentity: 's1', sourceContentHash: 'h1' }],
  ]);
  const movedHash = verifyPostUpdateState(plans, sources, [
    {
      judgmentId: plans[0]!.judgmentId,
      neutralCitation: null,
      sourceIdentity: 's1',
      sourceContentHash: 'DIFFERENT',
    },
  ]);
  assert.equal(movedHash.ok, false);
  assert.match(movedHash.refusals[0]!, /^POST_STATE_SOURCE_HASH_CHANGED:/);

  const movedUrl = verifyPostUpdateState(plans, sources, [
    {
      judgmentId: plans[0]!.judgmentId,
      neutralCitation: null,
      sourceIdentity: 'DIFFERENT',
      sourceContentHash: 'h1',
    },
  ]);
  assert.equal(movedUrl.ok, false);
  assert.match(movedUrl.refusals[0]!, /^POST_STATE_SOURCE_IDENTITY_CHANGED:/);
});

test('a missing row is a refusal, never a silently smaller success', () => {
  const plans = [plan(), plan({ judgmentId: 'b' })];
  const sources = new Map([
    [plans[0]!.judgmentId, { sourceIdentity: 's1', sourceContentHash: 'h1' }],
    ['b', { sourceIdentity: 's2', sourceContentHash: 'h2' }],
  ]);
  const short = verifyPostUpdateState(plans, sources, [
    {
      judgmentId: plans[0]!.judgmentId,
      neutralCitation: null,
      sourceIdentity: 's1',
      sourceContentHash: 'h1',
    },
  ]);
  assert.equal(short.ok, false);
  assert.ok(short.refusals.some((r) => r.startsWith('POST_STATE_ROW_MISSING:')));
  assert.ok(short.refusals.includes('POST_STATE_ROW_COUNT_MISMATCH'));
});
