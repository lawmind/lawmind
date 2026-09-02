/**
 * NEW2 R24 execution lineage gate.
 *
 * Proves the population that was WRITTEN is the population that was AUDITED:
 * the R23 artifact bytes still hash to their manifest, the R24 execution
 * manifest is a semantic copy of them row for row, and the receipt's before/after
 * values are exactly the audited old and new values — no substitution, no
 * addition, no quiet shrink from 539 to 538.
 *
 * Artifact-only: no database, no network.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  correctionPopulationHashV2,
  type CorrectionPopulationManifest,
} from './correction-preflight.ts';
import { buildCorrectionPlan } from './correction-mutator.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const R23 = join(ROOT, 'docs/ai/new2-r23');
const R24 = join(ROOT, 'docs/ai/new2-r24');

const R23_POPULATION_ID = 'NEW2-R23-SAFE-e5caecc2b05a4d04';
const R23_HASH = 'e5caecc2b05a4d047291f4b2bad45e108b6a7135006da502cced8d5b6ab990b4';
const EXPECTED = { total: 539, toNull: 441, toReplace: 86, toSuffixReplace: 12 };

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const parentArtifacts = readJson<{
  populationId: string;
  populationHash: string;
  files: Record<string, string>;
}>(join(R23, 'artifact-manifest.json'));
const parent = readJson<CorrectionPopulationManifest>(join(R23, 'r23-preflight-manifest.json'));
const exec = readJson<
  CorrectionPopulationManifest & {
    populationId: string;
    populationHash: string;
    executionHash: string;
    rowsHashV2: string;
  }
>(join(R24, 'r24-exec-manifest.json'));
const receipt = readJson<{
  execution: {
    populationId: string;
    populationHash: string;
    executionHash: string;
    rowsHashV2: string;
  };
  parent: { populationId: string; populationHash: string; independentAudit: string };
  transaction: { outcome: string; applied: number; perDisposition: Record<string, number> };
  postcommitReadback: { exact: number; expected: number; pass: boolean };
  inTransactionValidation: { validation: string };
  values: {
    before: Array<{ judgmentId: string; value: string }>;
    after: Array<{ judgmentId: string; value: string | null }>;
  };
  unchanged: {
    quarantine: { changed: boolean };
    edges: { changed: boolean };
    aliases: { changed: boolean };
  };
  canonicalCorrection: string;
}>(join(R24, 'receipt.json'));

test('the audited R23 artifacts still hash to their own manifest', () => {
  for (const [name, expected] of Object.entries(parentArtifacts.files)) {
    assert.equal(sha(readFileSync(join(R23, name), 'utf8')), expected, name);
  }
  assert.equal(parentArtifacts.populationId, R23_POPULATION_ID);
  assert.equal(parentArtifacts.populationHash, R23_HASH);
  assert.equal(correctionPopulationHashV2(parent.rows), R23_HASH);
});

test('the execution manifest is a semantic copy of the audited population, row for row', () => {
  assert.equal(exec.rows.length, EXPECTED.total);
  assert.equal(exec.candidateCount, EXPECTED.total);
  assert.equal(exec.rowsHashV2, R23_HASH);
  assert.equal(correctionPopulationHashV2(exec.rows), R23_HASH);

  const parentById = new Map(parent.rows.map((row) => [row.judgmentId, row]));
  assert.equal(new Set(exec.rows.map((row) => row.judgmentId)).size, EXPECTED.total);
  for (const row of exec.rows) {
    assert.deepEqual(row, parentById.get(row.judgmentId), row.judgmentId);
  }
  assert.deepEqual(exec.frozenFrontier, parent.frozenFrontier);
  assert.deepEqual(exec.proposedKeyHolders, parent.proposedKeyHolders);
  assert.deepEqual(exec.manyToOneExplanations, parent.manyToOneExplanations);
});

test('the dispositions written are the dispositions audited', () => {
  const counts = {
    DETERMINISTIC_TO_NULL: 0,
    DETERMINISTIC_TO_REPLACE: 0,
    DETERMINISTIC_SUFFIX_REPLACE: 0,
  };
  for (const row of exec.rows) counts[row.proposedDisposition as keyof typeof counts] += 1;
  assert.deepEqual(counts, {
    DETERMINISTIC_TO_NULL: EXPECTED.toNull,
    DETERMINISTIC_TO_REPLACE: EXPECTED.toReplace,
    DETERMINISTIC_SUFFIX_REPLACE: EXPECTED.toSuffixReplace,
  });
  assert.deepEqual(receipt.transaction.perDisposition, counts);
  assert.equal(receipt.transaction.applied, EXPECTED.total);
});

test('the receipt binds the write to the audit, and to nothing else', () => {
  assert.equal(receipt.parent.populationId, R23_POPULATION_ID);
  assert.equal(receipt.parent.populationHash, R23_HASH);
  assert.equal(receipt.parent.independentAudit, 'PASS');
  assert.equal(receipt.execution.rowsHashV2, R23_HASH);
  assert.equal(receipt.execution.populationId, exec.populationId);
  assert.equal(receipt.execution.populationHash, exec.executionHash);
  assert.equal(exec.populationHash, R23_HASH);
});

test('the receipt bytes hash to the recorded receipt hash', () => {
  const recorded = readJson<{ sha256: string }>(join(R24, 'receipt-hash.json'));
  assert.equal(sha(readFileSync(join(R24, 'receipt.json'), 'utf8')), recorded.sha256);
});

test('every before value is the audited old value and every after value the audited new value', () => {
  const plans = buildCorrectionPlan(exec);
  assert.equal(plans.length, EXPECTED.total);
  const before = new Map(receipt.values.before.map((row) => [row.judgmentId, row.value]));
  const after = new Map(receipt.values.after.map((row) => [row.judgmentId, row.value]));
  assert.equal(before.size, EXPECTED.total);
  assert.equal(after.size, EXPECTED.total);
  for (const plan of plans) {
    assert.equal(before.get(plan.judgmentId), plan.expectedOldValue, plan.judgmentId);
    assert.equal(after.get(plan.judgmentId), plan.newValue, plan.judgmentId);
  }
  assert.equal([...after.values()].filter((value) => value === null).length, EXPECTED.toNull);
});

test('the round committed, read back exactly, and changed nothing around it', () => {
  assert.equal(receipt.transaction.outcome, 'COMMITTED');
  assert.equal(receipt.inTransactionValidation.validation, 'PASS');
  assert.equal(receipt.postcommitReadback.exact, EXPECTED.total);
  assert.equal(receipt.postcommitReadback.expected, EXPECTED.total);
  assert.equal(receipt.postcommitReadback.pass, true);
  assert.equal(receipt.unchanged.quarantine.changed, false);
  assert.equal(receipt.unchanged.edges.changed, false);
  assert.equal(receipt.unchanged.aliases.changed, false);
  assert.equal(receipt.canonicalCorrection, 'PASS');
});

test('no quarantined judgment was written', () => {
  const quarantine = readJson<{ records: string[]; total: number }>(
    join(R23, 'quarantine-census.json'),
  );
  assert.equal(quarantine.total, 32);
  assert.equal(quarantine.records.length, 32);
  const written = new Set(exec.rows.map((row) => row.judgmentId));
  for (const id of quarantine.records) assert.equal(written.has(id), false, id);
});
