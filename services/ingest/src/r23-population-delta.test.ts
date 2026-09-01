/**
 * NEW2 R23 delta gate. Proves the frozen R23 SAFE population is exactly the
 * independently audited R22 SAFE population minus one row, without re-reading a
 * single source document. Artifact-only: no database, no network.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  correctionPopulationHashV2,
  verifyCorrectionPreflight,
  type CorrectionCandidateRow,
  type CorrectionPopulationManifest,
  type LiveCorrectionSnapshot,
} from './correction-preflight.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const R22 = join(ROOT, 'docs/ai/new2-r22');
const R23 = join(ROOT, 'docs/ai/new2-r23');

const R22_POPULATION_HASH = 'f55e2ba64b75772fe33e568e7707b453227dcdb18c67a966a7ae5ff776bafd33';
const EXCLUDED_JUDGMENT_ID = 'ae156e65-5871-48f3-8dc8-93a5c7e172dc';
const SEMANTIC_FIELDS = [
  'judgmentId',
  'sourceIdentity',
  'sourceContentHash',
  'currentStoredNeutralCitation',
  'proposedDisposition',
  'proposedReplacement',
  'evidenceClass',
  'evidencePointer',
  'targetHolderClassification',
  'frontierIdentity',
] as const;

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const rowHash = (row: CorrectionCandidateRow): string =>
  sha(SEMANTIC_FIELDS.map((field) => (row[field] as string | null | undefined) ?? '').join('|'));

const parent = readJson<CorrectionPopulationManifest>(join(R22, 'r22-preflight-manifest.json'));
const child = readJson<CorrectionPopulationManifest & { populationId: string }>(
  join(R23, 'r23-preflight-manifest.json'),
);
const lineage = readJson<{
  parent: { populationHash: string; rowCount: number };
  child: { populationId: string; populationHash: string; rowCount: number };
  excluded: { judgmentId: string; r22Class: string; parentRowHash: string };
  deltaProof: { parentMinusChild: string[]; childMinusParent: string[]; r22MinusOneExact: boolean };
  retainedRowComparison: {
    rows: number;
    retainedSetHash: string;
    rowFieldsChangedFromParent: number;
    hashes: Array<{ judgmentId: string; rowHash: string }>;
  };
  quarantineCensus: { total: number; intersectionWithSafe: number };
}>(join(R23, 'lineage.json'));

test('the R22 parent still hashes to the audited population', () => {
  assert.equal(correctionPopulationHashV2(parent.rows), R22_POPULATION_HASH);
  assert.equal(parent.rows.length, 540);
  assert.equal(lineage.parent.populationHash, R22_POPULATION_HASH);
});

test('R23 is the parent minus exactly one judgment id', () => {
  const parentIds = new Set(parent.rows.map((row) => row.judgmentId));
  const childIds = new Set(child.rows.map((row) => row.judgmentId));
  const removed = [...parentIds].filter((id) => !childIds.has(id));
  const added = [...childIds].filter((id) => !parentIds.has(id));
  assert.deepEqual(removed, [EXCLUDED_JUDGMENT_ID]);
  assert.deepEqual(added, []);
  assert.equal(child.rows.length, 539);
  assert.deepEqual(lineage.deltaProof.parentMinusChild, [EXCLUDED_JUDGMENT_ID]);
  assert.deepEqual(lineage.deltaProof.childMinusParent, []);
  assert.equal(lineage.deltaProof.r22MinusOneExact, true);
});

test('no retained semantic field changed from the parent', () => {
  const parentById = new Map(parent.rows.map((row) => [row.judgmentId, row]));
  let changed = 0;
  for (const row of child.rows) {
    const source = parentById.get(row.judgmentId);
    assert.ok(source, `retained row absent from parent: ${row.judgmentId}`);
    for (const field of SEMANTIC_FIELDS) {
      if ((source[field] ?? null) !== (row[field] ?? null)) changed += 1;
    }
  }
  assert.equal(changed, 0);
  assert.equal(lineage.retainedRowComparison.rowFieldsChangedFromParent, 0);
});

test('the per-row comparison hashes reproduce, and so does the retained set hash', () => {
  const byId = new Map(child.rows.map((row) => [row.judgmentId, row]));
  assert.equal(lineage.retainedRowComparison.hashes.length, 539);
  for (const entry of lineage.retainedRowComparison.hashes) {
    const row = byId.get(entry.judgmentId);
    assert.ok(row, `lineage names a row R23 does not hold: ${entry.judgmentId}`);
    assert.equal(rowHash(row), entry.rowHash);
  }
  const recomputed = sha(
    lineage.retainedRowComparison.hashes
      .map((entry) => `${entry.judgmentId}|${entry.rowHash}`)
      .join('\n'),
  );
  assert.equal(recomputed, lineage.retainedRowComparison.retainedSetHash);
});

test('the excluded row is the audited HHC suffix row and it is quarantined, not corrected', () => {
  const excluded = parent.rows.find((row) => row.judgmentId === EXCLUDED_JUDGMENT_ID);
  assert.ok(excluded);
  assert.equal(excluded.proposedDisposition, 'DETERMINISTIC_SUFFIX_REPLACE');
  assert.equal(lineage.excluded.r22Class, 'DETERMINISTIC_SUFFIX_REPLACE');
  assert.equal(lineage.excluded.parentRowHash, rowHash(excluded));

  const quarantine = readJson<{ quarantineClass: string; records: Array<{ judgmentId: string }> }>(
    join(R23, 'hhc-ambiguous-suffix-quarantine.json'),
  );
  assert.equal(quarantine.quarantineClass, 'AMBIGUOUS_SUFFIX_OWNERSHIP_TWO_SIDED_PROOF_MISSING');
  assert.deepEqual(
    quarantine.records.map((record) => record.judgmentId),
    [EXCLUDED_JUDGMENT_ID],
  );
});

test('the quarantine census is 32 and disjoint from SAFE', () => {
  const census = readJson<{
    commonOrderOwnershipAmbiguous: number;
    delhiUnexplainedManyToOne: number;
    hhcAmbiguousSuffix: number;
    total: number;
    records: string[];
  }>(join(R23, 'quarantine-census.json'));
  assert.equal(census.commonOrderOwnershipAmbiguous, 29);
  assert.equal(census.delhiUnexplainedManyToOne, 2);
  assert.equal(census.hhcAmbiguousSuffix, 1);
  assert.equal(census.total, 32);
  assert.equal(new Set(census.records).size, 32);

  const safeIds = new Set(child.rows.map((row) => row.judgmentId));
  assert.deepEqual(
    census.records.filter((id) => safeIds.has(id)),
    [],
  );
  assert.equal(lineage.quarantineCensus.intersectionWithSafe, 0);
});

test('the frozen R23 counts are 539 / 441 / 86 / 12', () => {
  const population = readJson<{
    populationId: string;
    populationHash: string;
    candidateCount: number;
    counts: Record<string, number>;
    records: Array<Record<string, string | null>>;
  }>(join(R23, 'r23-safe-population.json'));
  assert.equal(population.candidateCount, 539);
  assert.equal(population.records.length, 539);
  assert.equal(population.counts['DETERMINISTIC_TO_NULL'], 441);
  assert.equal(population.counts['DETERMINISTIC_TO_REPLACE'], 86);
  assert.equal(population.counts['DETERMINISTIC_SUFFIX_REPLACE'], 12);
  assert.equal(population.populationHash, correctionPopulationHashV2(child.rows));
  assert.equal(population.populationId, `NEW2-R23-SAFE-${population.populationHash.slice(0, 16)}`);
  assert.equal(population.populationId, lineage.child.populationId);
});

test('the R23 manifest passes its own unchanged preflight', () => {
  const live: LiveCorrectionSnapshot = {
    frontier: child.frozenFrontier,
    rows: child.rows.map((row) => ({
      judgmentId: row.judgmentId,
      sourceIdentity: row.sourceIdentity,
      sourceContentHash: row.sourceContentHash,
      currentStoredNeutralCitation: row.currentStoredNeutralCitation,
    })),
    proposedKeyHolders: child.proposedKeyHolders,
  };
  assert.deepEqual(verifyCorrectionPreflight(child, live), { ok: true, refusals: [] });
});

test('every recorded adversarial attack was refused, and the frozen artifacts hash', () => {
  const adversarial = readJson<{
    attacks: Array<{ name: string; expected: string; result: string; refusals: string[] }>;
    result: string;
  }>(join(R23, 'preflight-adversarial.json'));
  const required = [
    'DUPLICATE_ID',
    'CONFLICTING_DISPOSITIONS',
    'TO_NULL_WITH_REPLACEMENT',
    'REPLACEMENT_WITH_NULL',
    'REPLACEMENT_EQUALS_OLD',
    'UNKNOWN_DISPOSITION',
    'MISSING_SOURCE_HASH',
    'MALFORMED_CITATION',
    'WRONG_POPULATION_HASH',
    'CHANGED_OLD_VALUE',
    'MISSING_ROW',
    'ALREADY_CORRECTED',
    'ALREADY_NULL_TO_NULL',
    'TARGET_HOLDER_CONFLICT',
    'UNEXPLAINED_MANY_TO_ONE_TARGET',
  ];
  const names = new Set(adversarial.attacks.map((attack) => attack.name));
  for (const name of required) assert.ok(names.has(name), `missing attack: ${name}`);
  for (const attack of adversarial.attacks) {
    assert.equal(attack.result, 'REFUSED');
    assert.ok(attack.refusals.some((refusal) => refusal.startsWith(attack.expected)));
  }

  const manifest = readJson<{
    populationHash: string;
    lineageHash: string;
    files: Record<string, string>;
    readyForWrite: boolean;
    citationBulkApply: string;
    readyForR23DeltaAudit: boolean;
  }>(join(R23, 'artifact-manifest.json'));
  for (const [file, expected] of Object.entries(manifest.files)) {
    assert.equal(sha(readFileSync(join(R23, file), 'utf8')), expected, `artifact drifted: ${file}`);
  }
  assert.equal(manifest.lineageHash, manifest.files['lineage.json']);
  assert.equal(manifest.readyForR23DeltaAudit, true);
  assert.equal(manifest.readyForWrite, false);
  assert.equal(manifest.citationBulkApply, 'HOLD');
});
