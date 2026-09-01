import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  correctionPopulationHash,
  type CorrectionPopulationManifest,
  type LiveCorrectionSnapshot,
  verifyCorrectionPreflight,
} from './correction-preflight.ts';

const row = {
  judgmentId: '00000000-0000-4000-8000-000000000001',
  sourceIdentity: 'source://one',
  sourceContentHash: 'a'.repeat(64),
  currentStoredNeutralCitation: '2025:MLHC:405',
  proposedDisposition: 'DETERMINISTIC_SUFFIX_REPLACE',
  proposedReplacement: '2025:MLHC:405-DB',
};
const manifest: CorrectionPopulationManifest = {
  populationHash: correctionPopulationHash([row]),
  candidateCount: 1,
  frozenFrontier: { createdAt: '2026-09-01T00:00:00.000Z', judgmentId: row.judgmentId },
  rows: [row],
  proposedKeyHolders: { '2025MLHC405DB': [] },
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

test('accepts an unchanged protected population', () => {
  assert.deepEqual(verifyCorrectionPreflight(manifest, live), { ok: true, refusals: [] });
});

test('refuses one altered old value', () => {
  const changed = structuredClone(live);
  changed.rows[0]!.currentStoredNeutralCitation = '2025:MLHC:406';
  assert.match(verifyCorrectionPreflight(manifest, changed).refusals.join(','), /OLD_VALUE_DRIFT/);
});

test('refuses one missing row', () => {
  const changed = structuredClone(live);
  changed.rows = [];
  assert.match(verifyCorrectionPreflight(manifest, changed).refusals.join(','), /MISSING_ROW/);
});

test('refuses one changed source hash', () => {
  const changed = structuredClone(live);
  changed.rows[0]!.sourceContentHash = 'b'.repeat(64);
  assert.match(
    verifyCorrectionPreflight(manifest, changed).refusals.join(','),
    /SOURCE_CONTENT_HASH_DRIFT/,
  );
});

test('refuses one population-hash mismatch', () => {
  const changed = structuredClone(manifest);
  changed.populationHash = '0'.repeat(64);
  assert.match(
    verifyCorrectionPreflight(changed, live).refusals.join(','),
    /POPULATION_HASH_MISMATCH/,
  );
});
