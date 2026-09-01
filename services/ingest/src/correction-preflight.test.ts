import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  correctionPopulationHashV2,
  type CorrectionCandidateRow,
  type CorrectionPopulationManifest,
  type LiveCorrectionSnapshot,
  verifyCorrectionPreflight,
} from './correction-preflight.ts';

const row: CorrectionCandidateRow = {
  judgmentId: '00000000-0000-4000-8000-000000000001',
  sourceIdentity: 'source://one',
  sourceContentHash: 'a'.repeat(64),
  currentStoredNeutralCitation: '2025:MLHC:405',
  proposedDisposition: 'DETERMINISTIC_SUFFIX_REPLACE',
  proposedReplacement: '2025:MLHC:405-DB',
  evidenceClass: 'SUFFIX_REPLACEMENT_CONFIRMED',
  evidencePointer: 'evidence://one',
  targetHolderClassification: 'NO_EXISTING_HOLDER',
  frontierIdentity: '2026-09-01T00:00:00.000Z|00000000-0000-4000-8000-000000000001',
};
const manifest: CorrectionPopulationManifest = {
  schemaVersion: 2,
  populationHash: correctionPopulationHashV2([row]),
  candidateCount: 1,
  frozenFrontier: { createdAt: '2026-09-01T00:00:00.000Z', judgmentId: row.judgmentId },
  rows: [row],
  proposedKeyHolders: { '2025MLHC405DB': [] },
  manyToOneExplanations: {},
};
const live: LiveCorrectionSnapshot = {
  frontier: { createdAt: '2026-09-01T00:00:01.000Z', judgmentId: row.judgmentId },
  rows: [
    {
      judgmentId: row.judgmentId,
      sourceIdentity: row.sourceIdentity,
      sourceContentHash: row.sourceContentHash,
      currentStoredNeutralCitation: row.currentStoredNeutralCitation,
    },
  ],
  proposedKeyHolders: { '2025MLHC405DB': [] },
};

const refusal = (
  changedManifest: CorrectionPopulationManifest = manifest,
  changedLive: LiveCorrectionSnapshot = live,
): string => verifyCorrectionPreflight(changedManifest, changedLive).refusals.join(',');

const rehash = (changed: CorrectionPopulationManifest): CorrectionPopulationManifest => ({
  ...changed,
  populationHash: correctionPopulationHashV2(changed.rows),
});

test('accepts an unchanged protected population', () => {
  assert.deepEqual(verifyCorrectionPreflight(manifest, live), { ok: true, refusals: [] });
});

test('refuses duplicate ID and conflicting manifest record before live checks', () => {
  const duplicate = { ...row, proposedDisposition: 'DETERMINISTIC_TO_NULL', proposedReplacement: null };
  const changed = rehash({ ...manifest, candidateCount: 2, rows: [row, duplicate] });
  const result = refusal(changed, { ...live, rows: [] });
  assert.match(result, /MANIFEST_INVALID:DUPLICATE_JUDGMENT_ID/);
  assert.match(result, /MANIFEST_INVALID:DUPLICATE_CONFLICTING_MANIFEST_RECORD/);
  assert.match(result, /MANIFEST_INVALID:CONFLICTING_DISPOSITIONS/);
  assert.doesNotMatch(result, /MISSING_ROW/);
});

test('refuses invalid replacement/null shapes', () => {
  const nullWithValue = { ...row, proposedDisposition: 'DETERMINISTIC_TO_NULL' };
  assert.match(
    refusal(rehash({ ...manifest, rows: [nullWithValue] })),
    /MANIFEST_INVALID:TO_NULL_WITH_REPLACEMENT/,
  );
  const replacementWithoutValue = { ...row, proposedReplacement: null };
  assert.match(
    refusal(rehash({ ...manifest, rows: [replacementWithoutValue] })),
    /MANIFEST_INVALID:REPLACEMENT_WITH_NULL/,
  );
});

test('refuses replacement equal to old and malformed citations', () => {
  const same = { ...row, proposedReplacement: row.currentStoredNeutralCitation };
  assert.match(
    refusal(rehash({ ...manifest, rows: [same] })),
    /MANIFEST_INVALID:REPLACEMENT_EQUALS_OLD/,
  );
  const malformed = { ...row, proposedReplacement: 'not-a-citation' };
  assert.match(
    refusal(rehash({ ...manifest, rows: [malformed] })),
    /MANIFEST_INVALID:MALFORMED_CANONICAL_CITATION/,
  );
});

test('refuses unexpected disposition, missing source hash and missing old value', () => {
  const changed = {
    ...row,
    proposedDisposition: 'MAYBE',
    sourceContentHash: '',
    currentStoredNeutralCitation: '',
  };
  const result = refusal(rehash({ ...manifest, rows: [changed] }));
  assert.match(result, /MANIFEST_INVALID:UNEXPECTED_DISPOSITION/);
  assert.match(result, /MANIFEST_INVALID:MISSING_SOURCE_HASH/);
  assert.match(result, /MANIFEST_INVALID:MISSING_OLD_VALUE/);
});

test('refuses wrong old value, missing row and changed source hash', () => {
  const wrongOld = structuredClone(live);
  wrongOld.rows[0]!.currentStoredNeutralCitation = '2025:MLHC:406';
  assert.match(refusal(manifest, wrongOld), /OLD_VALUE_DRIFT/);

  const missing = structuredClone(live);
  missing.rows = [];
  assert.match(refusal(manifest, missing), /MISSING_ROW/);

  const changedHash = structuredClone(live);
  changedHash.rows[0]!.sourceContentHash = 'b'.repeat(64);
  assert.match(refusal(manifest, changedHash), /SOURCE_CONTENT_HASH_DRIFT/);
});

test('refuses population hash mismatch', () => {
  assert.match(
    refusal({ ...manifest, populationHash: '0'.repeat(64) }),
    /POPULATION_HASH_MISMATCH/,
  );
});

test('refuses already-corrected row and already-null TO_NULL', () => {
  const corrected = structuredClone(live);
  corrected.rows[0]!.currentStoredNeutralCitation = row.proposedReplacement;
  assert.match(refusal(manifest, corrected), /ALREADY_CORRECTED_ROW/);

  const nullRow = {
    ...row,
    proposedDisposition: 'DETERMINISTIC_TO_NULL',
    proposedReplacement: null,
    targetHolderClassification: 'NOT_APPLICABLE' as const,
  };
  const nullManifest = rehash({ ...manifest, rows: [nullRow], proposedKeyHolders: {} });
  const alreadyNull = structuredClone(live);
  alreadyNull.rows[0]!.currentStoredNeutralCitation = null;
  alreadyNull.proposedKeyHolders = {};
  assert.match(refusal(nullManifest, alreadyNull), /ALREADY_NULL_TO_NULL/);
});

test('refuses unexplained existing target holder', () => {
  const changed = rehash({
    ...manifest,
    proposedKeyHolders: { '2025MLHC405DB': ['00000000-0000-4000-8000-000000000099'] },
  });
  assert.match(refusal(changed), /TARGET_HOLDER_CONFLICT/);
});

test('refuses unexplained many-to-one targeting', () => {
  const second = {
    ...row,
    judgmentId: '00000000-0000-4000-8000-000000000002',
    sourceIdentity: 'source://two',
    sourceContentHash: 'b'.repeat(64),
  };
  const changed = rehash({ ...manifest, candidateCount: 2, rows: [row, second] });
  assert.match(refusal(changed), /UNEXPLAINED_MANY_TO_ONE_TARGET/);
});

test('accepts many-to-one only with exact verified common-order explanation', () => {
  const second = {
    ...row,
    judgmentId: '00000000-0000-4000-8000-000000000002',
    sourceIdentity: 'source://two',
    sourceContentHash: 'b'.repeat(64),
  };
  const rows = [row, second];
  const changed = rehash({
    ...manifest,
    candidateCount: 2,
    rows,
    manyToOneExplanations: {
      '2025MLHC405DB': {
        classification: 'VERIFIED_COMMON_ORDER_FAMILY',
        candidateJudgmentIds: rows.map((candidate) => candidate.judgmentId),
        evidencePointer: 'evidence://common-order',
        rationale: 'Both case numbers are expressly disposed in the same retained order text.',
      },
    },
  });
  const changedLive: LiveCorrectionSnapshot = {
    ...live,
    rows: [
      live.rows[0]!,
      {
        judgmentId: second.judgmentId,
        sourceIdentity: second.sourceIdentity,
        sourceContentHash: second.sourceContentHash,
        currentStoredNeutralCitation: second.currentStoredNeutralCitation,
      },
    ],
  };
  assert.deepEqual(verifyCorrectionPreflight(changed, changedLive), { ok: true, refusals: [] });
});
