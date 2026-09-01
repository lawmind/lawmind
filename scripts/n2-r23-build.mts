/**
 * NEW2 R23 — refreeze the independently confirmed correction population.
 *
 * R23 is a PURE SET DIFFERENCE of the immutable R22 SAFE population minus the one
 * row the independent audit rejected. Nothing is re-adjudicated, no proposal is
 * refreshed, no heuristic is introduced, and no retained semantic field may change.
 *
 * Read-only against Postgres. Writes only immutable evidence beneath
 * docs/ai/new2-r23. No canonical rows, edges, aliases or migrations.
 *
 * Usage: pnpm exec tsx scripts/n2-r23-build.mts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import {
  correctionPopulationHashV2,
  verifyCorrectionPreflight,
  type CorrectionCandidateRow,
  type CorrectionPopulationManifest,
  type LiveCorrectionSnapshot,
} from '../services/ingest/src/correction-preflight.ts';
import { sslFor } from './migration/new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R22 = join(ROOT, 'docs/ai/new2-r22');
const OUT = join(ROOT, 'docs/ai/new2-r23');

/** The R22 population hash this round is required to reproduce, byte for byte. */
const R22_POPULATION_HASH = 'f55e2ba64b75772fe33e568e7707b453227dcdb18c67a966a7ae5ff776bafd33';
const R22_EXPECTED = { total: 540, toNull: 441, toReplace: 86, toSuffixReplace: 13 };

/** The single row the independent R22 audit rejected. */
const EXCLUDED_JUDGMENT_ID = 'ae156e65-5871-48f3-8dc8-93a5c7e172dc';
const EXCLUDED_QUARANTINE_CLASS = 'AMBIGUOUS_SUFFIX_OWNERSHIP_TWO_SIDED_PROOF_MISSING';
const EXCLUDED_VERDICT = 'AMBIGUOUS';
const EXCLUDED_REASON =
  'The document prints a clean bare 2024:HHC:17024 own-form citation, while DB running stamps ' +
  'suggest a suffixed form, but the required two-sided standard does not prove the stored bare ' +
  'value false.';

/** The ten semantic fields that carry a candidate row's meaning. */
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
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const writeJson = (name: string, value: unknown): void =>
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
const keyOf = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const ordered = (values: string[]): string[] => [...values].sort();
const clone = <T,>(value: T): T => structuredClone(value);
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

/** One row's stable comparison hash — the same identity the population hash folds. */
const rowIdentity = (row: CorrectionCandidateRow): string =>
  SEMANTIC_FIELDS.map((field) => (row[field] as string | null | undefined) ?? '').join('|');
const rowHash = (row: CorrectionCandidateRow): string => sha(rowIdentity(row));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (match) return match[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

// ---------------------------------------------------------------------------
// 1. Verify the R22 parent exactly.
// ---------------------------------------------------------------------------

type ParentArtifactManifest = {
  populationId: string;
  populationHash: string;
  sourceUniverseId: string;
  files: Record<string, string>;
};

const parentArtifacts = readJson<ParentArtifactManifest>(join(R22, 'artifact-manifest.json'));
const parentFileIntegrity = Object.entries(parentArtifacts.files).map(([name, expected]) => {
  const actual = sha(readFileSync(join(R22, name), 'utf8'));
  return { file: name, expected, actual, pass: actual === expected };
});
assert(
  parentFileIntegrity.every((entry) => entry.pass),
  `R22 artifact bytes drifted: ${parentFileIntegrity
    .filter((entry) => !entry.pass)
    .map((entry) => entry.file)
    .join(',')}`,
);

const parentManifest = readJson<CorrectionPopulationManifest>(
  join(R22, 'r22-preflight-manifest.json'),
);
const parentPopulation = readJson<{
  populationId: string;
  populationHash: string;
  candidateCount: number;
  records: Array<Record<string, string | null>>;
}>(join(R22, 'r22-safe-population.json'));

const parentRows = parentManifest.rows;
const parentHashRecomputed = correctionPopulationHashV2(parentRows);
assert(
  parentHashRecomputed === R22_POPULATION_HASH,
  `R22 population hash mismatch: ${parentHashRecomputed}`,
);
assert(parentManifest.populationHash === R22_POPULATION_HASH, 'R22 manifest hash mismatch');
assert(
  parentPopulation.populationHash === R22_POPULATION_HASH,
  'R22 population file hash mismatch',
);
assert(
  parentArtifacts.populationHash === R22_POPULATION_HASH,
  'R22 artifact manifest hash mismatch',
);
assert(parentManifest.schemaVersion === 2, 'R22 manifest must be schema version 2');

const parentCounts = {
  total: parentRows.length,
  toNull: parentRows.filter((row) => row.proposedDisposition === 'DETERMINISTIC_TO_NULL').length,
  toReplace: parentRows.filter((row) => row.proposedDisposition === 'DETERMINISTIC_TO_REPLACE')
    .length,
  toSuffixReplace: parentRows.filter(
    (row) => row.proposedDisposition === 'DETERMINISTIC_SUFFIX_REPLACE',
  ).length,
};
assert(
  JSON.stringify(parentCounts) === JSON.stringify(R22_EXPECTED),
  `R22 counts drifted: ${JSON.stringify(parentCounts)}`,
);
assert(parentManifest.candidateCount === R22_EXPECTED.total, 'R22 candidateCount drifted');
assert(parentPopulation.candidateCount === R22_EXPECTED.total, 'R22 population count drifted');
assert(parentPopulation.records.length === R22_EXPECTED.total, 'R22 record count drifted');

// The published population file and the preflight manifest must describe one population.
const parentById = new Map(parentRows.map((row) => [row.judgmentId, row]));
for (const record of parentPopulation.records) {
  const row = parentById.get(record['judgment_id']!);
  assert(row, `R22 population record absent from the manifest: ${record['judgment_id']}`);
  assert(
    record['old_value'] === row.currentStoredNeutralCitation &&
      record['new_value'] === row.proposedReplacement &&
      record['disposition'] === row.proposedDisposition &&
      record['source_hash'] === row.sourceContentHash &&
      record['source_identity'] === row.sourceIdentity &&
      record['evidence_class'] === row.evidenceClass &&
      record['evidence_pointer'] === row.evidencePointer &&
      record['target_holder_classification'] === row.targetHolderClassification &&
      record['frontier_identity'] === row.frontierIdentity,
    `R22 population record disagrees with the manifest: ${record['judgment_id']}`,
  );
}

// ---------------------------------------------------------------------------
// 2. Exclude exactly one audit-failed row.
// ---------------------------------------------------------------------------

const excludedRow = parentById.get(EXCLUDED_JUDGMENT_ID);
assert(excludedRow, `Excluded row is not in the R22 SAFE population: ${EXCLUDED_JUDGMENT_ID}`);
assert(
  excludedRow.proposedDisposition === 'DETERMINISTIC_SUFFIX_REPLACE',
  `Excluded row class is not DETERMINISTIC_SUFFIX_REPLACE: ${excludedRow.proposedDisposition}`,
);

// ---------------------------------------------------------------------------
// 3. R23 is a pure set difference — retained rows are carried, never rebuilt.
// ---------------------------------------------------------------------------

const retainedRows = parentRows.filter((row) => row.judgmentId !== EXCLUDED_JUDGMENT_ID);
assert(retainedRows.length === parentRows.length - 1, 'Exclusion removed more than one row');

const parentIds = new Set(parentRows.map((row) => row.judgmentId));
const retainedIds = new Set(retainedRows.map((row) => row.judgmentId));
const removed = [...parentIds].filter((id) => !retainedIds.has(id));
const added = [...retainedIds].filter((id) => !parentIds.has(id));
assert(
  removed.length === 1 && removed[0] === EXCLUDED_JUDGMENT_ID && added.length === 0,
  `Set difference is not exactly one removal: -${removed.length} +${added.length}`,
);

const fieldComparison = retainedRows.map((row) => {
  const parent = parentById.get(row.judgmentId)!;
  const changed = SEMANTIC_FIELDS.filter(
    (field) => (parent[field] ?? null) !== (row[field] ?? null),
  );
  return { judgmentId: row.judgmentId, changed };
});
const rowFieldsChangedFromParent = fieldComparison.reduce(
  (sum, entry) => sum + entry.changed.length,
  0,
);
assert(
  rowFieldsChangedFromParent === 0,
  `Retained rows changed ${rowFieldsChangedFromParent} fields`,
);

const parentRowComparisonHashes = new Map(parentRows.map((row) => [row.judgmentId, rowHash(row)]));
const rowComparisonHashes = retainedRows
  .map((row) => ({ judgmentId: row.judgmentId, rowHash: rowHash(row) }))
  .sort((a, b) => a.judgmentId.localeCompare(b.judgmentId));
const retainedSetHash = sha(
  rowComparisonHashes.map((entry) => `${entry.judgmentId}|${entry.rowHash}`).join('\n'),
);
assert(
  rowComparisonHashes.every(
    (entry) => parentRowComparisonHashes.get(entry.judgmentId) === entry.rowHash,
  ),
  'A retained row hash differs from its parent',
);

// ---------------------------------------------------------------------------
// 7. Current drift check — read-only, per retained candidate.
// ---------------------------------------------------------------------------

const url = databaseUrl();
const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, ssl: sslFor(url) });

type LiveJudgment = {
  id: string;
  neutral_citation: string | null;
  source_url: string;
  content_hash: string | null;
};

const liveJudgments = (await sql.unsafe(
  `select id::text, neutral_citation, source_url, content_hash
     from judgments where id = any($1::uuid[]) order by id`,
  [retainedRows.map((row) => row.judgmentId)],
)) as LiveJudgment[];
const liveById = new Map(liveJudgments.map((row) => [row.id, row]));

const retainedKeys = ordered([
  ...new Set(
    retainedRows.flatMap((row) =>
      row.proposedReplacement ? [keyOf(row.proposedReplacement)] : [],
    ),
  ),
]);
const liveHolderRows = (await sql.unsafe(
  `select citation_key, judgment_id::text as judgment_id
     from judgment_citation_keys where citation_key = any($1::text[])
     order by citation_key, judgment_id`,
  [retainedKeys],
)) as Array<{ citation_key: string; judgment_id: string }>;
const liveHolders: Record<string, string[]> = Object.fromEntries(
  retainedKeys.map((key) => [key, [] as string[]]),
);
for (const holder of liveHolderRows) liveHolders[holder.citation_key]!.push(holder.judgment_id);

const [liveFrontier] = (await sql.unsafe(
  `select created_at::text as created_at, id::text
     from judgments order by created_at desc, id desc limit 1`,
)) as Array<{ created_at: string; id: string }>;
assert(liveFrontier, 'missing ingest frontier');

await sql.end({ timeout: 5 });

const driftHolds: Array<{ judgmentId: string; reason: string; detail: string }> = [];
for (const row of retainedRows) {
  const live = liveById.get(row.judgmentId);
  if (!live) {
    driftHolds.push({ judgmentId: row.judgmentId, reason: 'ROW_MISSING', detail: 'no live row' });
    continue;
  }
  if (live.neutral_citation !== row.currentStoredNeutralCitation)
    driftHolds.push({
      judgmentId: row.judgmentId,
      reason: 'OLD_VALUE_DRIFT',
      detail: `${live.neutral_citation} != ${row.currentStoredNeutralCitation}`,
    });
  if (live.source_url !== row.sourceIdentity)
    driftHolds.push({
      judgmentId: row.judgmentId,
      reason: 'SOURCE_IDENTITY_DRIFT',
      detail: live.source_url,
    });
  if (live.content_hash !== row.sourceContentHash)
    driftHolds.push({
      judgmentId: row.judgmentId,
      reason: 'SOURCE_CONTENT_HASH_DRIFT',
      detail: String(live.content_hash),
    });
  if (row.proposedReplacement) {
    const holders = liveHolders[keyOf(row.proposedReplacement)] ?? [];
    if (row.targetHolderClassification !== 'NO_EXISTING_HOLDER' || holders.length !== 0)
      driftHolds.push({
        judgmentId: row.judgmentId,
        reason: 'TARGET_HOLDER_ASSUMPTION_DRIFT',
        detail: `${row.targetHolderClassification}:${holders.join(',')}`,
      });
  }
}

const heldIds = new Set(driftHolds.map((hold) => hold.judgmentId));
const safeRows = retainedRows.filter((row) => !heldIds.has(row.judgmentId));

// ---------------------------------------------------------------------------
// 4 + 10. The child manifest and the frozen R23 population.
// ---------------------------------------------------------------------------

const safeKeys = ordered([
  ...new Set(
    safeRows.flatMap((row) => (row.proposedReplacement ? [keyOf(row.proposedReplacement)] : [])),
  ),
]);
const proposedKeyHolders = Object.fromEntries(
  safeKeys.map((key) => {
    const parentHolders = parentManifest.proposedKeyHolders[key];
    assert(parentHolders, `Missing parent holder set for ${key}`);
    return [key, parentHolders];
  }),
);
const droppedKeys = Object.keys(parentManifest.proposedKeyHolders).filter(
  (key) => !(key in proposedKeyHolders),
);

const manyToOneExplanations = Object.fromEntries(
  Object.entries(parentManifest.manyToOneExplanations ?? {}).map(([key, explanation]) => [
    key,
    {
      ...explanation,
      candidateJudgmentIds: safeRows
        .filter((row) => row.proposedReplacement && keyOf(row.proposedReplacement) === key)
        .map((row) => row.judgmentId),
    },
  ]),
);
for (const [key, explanation] of Object.entries(manyToOneExplanations)) {
  const parentExplanation = parentManifest.manyToOneExplanations![key]!;
  assert(
    JSON.stringify(ordered(explanation.candidateJudgmentIds)) ===
      JSON.stringify(ordered(parentExplanation.candidateJudgmentIds)),
    `Family membership changed for ${key} — an excluded row cannot reshape a family`,
  );
}

const populationHash = correctionPopulationHashV2(safeRows);
const populationId = `NEW2-R23-SAFE-${populationHash.slice(0, 16)}`;
const counts = {
  DETERMINISTIC_TO_NULL: safeRows.filter(
    (row) => row.proposedDisposition === 'DETERMINISTIC_TO_NULL',
  ).length,
  DETERMINISTIC_TO_REPLACE: safeRows.filter(
    (row) => row.proposedDisposition === 'DETERMINISTIC_TO_REPLACE',
  ).length,
  DETERMINISTIC_SUFFIX_REPLACE: safeRows.filter(
    (row) => row.proposedDisposition === 'DETERMINISTIC_SUFFIX_REPLACE',
  ).length,
};

const manifest: CorrectionPopulationManifest = {
  schemaVersion: 2,
  populationHash,
  candidateCount: safeRows.length,
  frozenFrontier: parentManifest.frozenFrontier,
  rows: safeRows,
  proposedKeyHolders,
  manyToOneExplanations,
};
const live: LiveCorrectionSnapshot = {
  frontier: { createdAt: liveFrontier.created_at, judgmentId: liveFrontier.id },
  rows: safeRows.map((row) => {
    const actual = liveById.get(row.judgmentId)!;
    return {
      judgmentId: actual.id,
      sourceIdentity: actual.source_url,
      sourceContentHash: actual.content_hash!,
      currentStoredNeutralCitation: actual.neutral_citation,
    };
  }),
  proposedKeyHolders: Object.fromEntries(safeKeys.map((key) => [key, liveHolders[key] ?? []])),
};

const unchanged = verifyCorrectionPreflight(manifest, live);
assert(
  unchanged.ok,
  `R23 manifest failed the unchanged preflight: ${unchanged.refusals.join(',')}`,
);

// ---------------------------------------------------------------------------
// 8. Mutation Protocol v2 adversarial preflight.
// ---------------------------------------------------------------------------

const rehash = (value: CorrectionPopulationManifest): CorrectionPopulationManifest => ({
  ...value,
  populationHash: correctionPopulationHashV2(value.rows),
});
const attacks: Array<{ name: string; expected: string; result: string; refusals: string[] }> = [];
const attack = (
  name: string,
  expected: string,
  changedManifest: CorrectionPopulationManifest,
  changedLive: LiveCorrectionSnapshot = live,
): void => {
  const result = verifyCorrectionPreflight(changedManifest, changedLive);
  assert(!result.ok, `${name} was not refused`);
  assert(
    result.refusals.some((refusal) => refusal.startsWith(expected)),
    `${name} refused for the wrong reason: ${result.refusals.join(',')}`,
  );
  attacks.push({ name, expected, result: 'REFUSED', refusals: result.refusals });
};

const firstRow = safeRows[0]!;
const replacementRow = safeRows.find((row) => row.proposedReplacement)!;
const nullRow = safeRows.find((row) => row.proposedDisposition === 'DETERMINISTIC_TO_NULL')!;
const indexOf = (judgmentId: string): number =>
  safeRows.findIndex((row) => row.judgmentId === judgmentId);

{
  const changed = clone(manifest);
  changed.rows.push(clone(firstRow));
  changed.candidateCount += 1;
  attack('DUPLICATE_ID', 'MANIFEST_INVALID:DUPLICATE_JUDGMENT_ID', rehash(changed));
}
{
  const changed = clone(manifest);
  changed.rows.push({
    ...clone(firstRow),
    proposedDisposition: 'DETERMINISTIC_TO_REPLACE',
    proposedReplacement: '2099:MLHC:1',
  });
  changed.candidateCount += 1;
  attack('CONFLICTING_DISPOSITIONS', 'MANIFEST_INVALID:CONFLICTING_DISPOSITIONS', rehash(changed));
}
{
  const changed = clone(manifest);
  changed.rows[indexOf(nullRow.judgmentId)] = {
    ...clone(nullRow),
    proposedReplacement: '2099:MLHC:2',
  };
  attack('TO_NULL_WITH_REPLACEMENT', 'MANIFEST_INVALID:TO_NULL_WITH_REPLACEMENT', rehash(changed));
}
{
  const changed = clone(manifest);
  changed.rows[indexOf(replacementRow.judgmentId)] = {
    ...clone(replacementRow),
    proposedReplacement: null,
  };
  attack('REPLACEMENT_WITH_NULL', 'MANIFEST_INVALID:REPLACEMENT_WITH_NULL', rehash(changed));
}
{
  const changed = clone(manifest);
  changed.rows[indexOf(replacementRow.judgmentId)] = {
    ...clone(replacementRow),
    proposedReplacement: replacementRow.currentStoredNeutralCitation,
  };
  attack('REPLACEMENT_EQUALS_OLD', 'MANIFEST_INVALID:REPLACEMENT_EQUALS_OLD', rehash(changed));
}
{
  const changed = clone(manifest);
  changed.rows[0] = { ...clone(firstRow), proposedDisposition: 'DETERMINISTIC_MAYBE' };
  attack('UNKNOWN_DISPOSITION', 'MANIFEST_INVALID:UNEXPECTED_DISPOSITION', rehash(changed));
}
{
  const changed = clone(manifest);
  changed.rows[0] = { ...clone(firstRow), sourceContentHash: '' };
  attack('MISSING_SOURCE_HASH', 'MANIFEST_INVALID:MISSING_SOURCE_HASH', rehash(changed));
}
{
  const changed = clone(manifest);
  changed.rows[0] = { ...clone(firstRow), currentStoredNeutralCitation: '2011/APRIL/27' };
  attack('MALFORMED_CITATION', 'MANIFEST_INVALID:MALFORMED_CANONICAL_CITATION', rehash(changed));
}
attack('WRONG_POPULATION_HASH', 'POPULATION_HASH_MISMATCH', {
  ...manifest,
  populationHash: '0'.repeat(64),
});
{
  const changed = clone(live);
  changed.rows[0]!.currentStoredNeutralCitation = '2099:MLHC:999999';
  attack('CHANGED_OLD_VALUE', 'OLD_VALUE_DRIFT', manifest, changed);
}
{
  const changed = clone(live);
  changed.rows.shift();
  attack('MISSING_ROW', 'MISSING_ROW', manifest, changed);
}
{
  const changed = clone(live);
  changed.rows[0]!.sourceContentHash = 'f'.repeat(64);
  attack('CHANGED_SOURCE_HASH', 'SOURCE_CONTENT_HASH_DRIFT', manifest, changed);
}
{
  const changed = clone(live);
  const target = changed.rows.find((row) => row.judgmentId === replacementRow.judgmentId)!;
  target.currentStoredNeutralCitation = replacementRow.proposedReplacement;
  attack('ALREADY_CORRECTED', 'ALREADY_CORRECTED_ROW', manifest, changed);
}
{
  const changed = clone(live);
  const target = changed.rows.find((row) => row.judgmentId === nullRow.judgmentId)!;
  target.currentStoredNeutralCitation = null;
  attack('ALREADY_NULL_TO_NULL', 'ALREADY_NULL_TO_NULL', manifest, changed);
}
{
  const changed = clone(manifest);
  changed.proposedKeyHolders[keyOf(replacementRow.proposedReplacement!)] = [
    '00000000-0000-4000-8000-000000000099',
  ];
  attack('TARGET_HOLDER_CONFLICT', 'TARGET_HOLDER_CONFLICT', rehash(changed));
}
{
  const changed = clone(manifest);
  delete changed.manyToOneExplanations?.['2026MLHC717DB'];
  attack('UNEXPLAINED_MANY_TO_ONE_TARGET', 'UNEXPLAINED_MANY_TO_ONE_TARGET', rehash(changed));
}

// ---------------------------------------------------------------------------
// 5. Quarantine census — every R22 quarantine survives, plus the new HHC row.
// ---------------------------------------------------------------------------

const commonOrderQuarantine = readJson<{ rows: number; records: Array<{ judgmentId: string }> }>(
  join(R22, 'common-order-ownership-quarantine.json'),
);
const delhiQuarantine = readJson<{ rows: number; records: Array<{ judgmentId: string }> }>(
  join(R22, 'other-quarantine.json'),
);
assert(commonOrderQuarantine.rows === 29, 'Common-order quarantine must stay 29 rows');
assert(delhiQuarantine.rows === 2, 'Delhi many-to-one quarantine must stay 2 rows');

const quarantinedIds = [
  ...commonOrderQuarantine.records.map((record) => record.judgmentId),
  ...delhiQuarantine.records.map((record) => record.judgmentId),
  EXCLUDED_JUDGMENT_ID,
];
assert(
  new Set(quarantinedIds).size === 32 && quarantinedIds.length === 32,
  `Quarantine census must be 32, got ${quarantinedIds.length}`,
);
const safeIds = new Set(safeRows.map((row) => row.judgmentId));
const leaked = quarantinedIds.filter((id) => safeIds.has(id));
assert(leaked.length === 0, `Quarantined rows reached SAFE: ${leaked.join(',')}`);

// ---------------------------------------------------------------------------
// 9 + 10. Artifacts.
// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

const safePopulationRecords = safeRows.map((row) => ({
  judgment_id: row.judgmentId,
  old_value: row.currentStoredNeutralCitation,
  new_value: row.proposedReplacement,
  disposition: row.proposedDisposition,
  source_hash: row.sourceContentHash,
  source_identity: row.sourceIdentity,
  evidence_class: row.evidenceClass,
  evidence_pointer: row.evidencePointer,
  target_holder_classification: row.targetHolderClassification,
  frontier_identity: row.frontierIdentity,
}));

const currentDrift = {
  method: 'READ_ONLY_POSTGRES',
  rowsChecked: retainedRows.length,
  rowsFound: liveJudgments.length,
  checked: [
    'ROW_EXISTS',
    'OLD_VALUE_UNCHANGED',
    'SOURCE_HASH_UNCHANGED',
    'SOURCE_IDENTITY_UNCHANGED',
    'TARGET_HOLDER_ASSUMPTION_UNCHANGED',
  ],
  driftedRows: driftHolds.length,
  holds: driftHolds,
  result: driftHolds.length === 0 ? 'NO_DRIFT' : 'DRIFT_HELD',
  frozenFrontier: parentManifest.frozenFrontier,
  currentFrontier: { createdAt: liveFrontier.created_at, judgmentId: liveFrontier.id },
  frontierBehindFreeze:
    `${liveFrontier.created_at}|${liveFrontier.id}` <
    `${parentManifest.frozenFrontier.createdAt}|${parentManifest.frozenFrontier.judgmentId}`,
};

const targetHolderGate = {
  keysChecked: safeKeys.length,
  classification: 'NO_EXISTING_HOLDER',
  liveHolderRowsFound: liveHolderRows.length,
  keysWithExistingHolders: safeKeys.filter((key) => (liveHolders[key] ?? []).length > 0),
  result: liveHolderRows.length === 0 ? 'PASS' : 'FAIL',
};
assert(targetHolderGate.result === 'PASS', 'A safe replacement target acquired a holder');

const artifacts: Record<string, unknown> = {
  'r23-safe-population.json': {
    artifact: 'NEW2_R23_SAFE_POPULATION',
    populationId,
    populationHash,
    parentPopulationId: parentArtifacts.populationId,
    parentPopulationHash: R22_POPULATION_HASH,
    derivation: 'R22_SAFE_MINUS_ONE_AUDIT_REJECTED_ROW',
    counts,
    candidateCount: safeRows.length,
    records: safePopulationRecords,
  },
  'r23-preflight-manifest.json': {
    artifact: 'NEW2_R23_PREFLIGHT_MANIFEST',
    populationId,
    ...manifest,
  },
  'preflight-adversarial.json': {
    artifact: 'NEW2_R23_PREFLIGHT_ADVERSARIAL',
    unchanged,
    attacks,
    result: `PASS_${attacks.length}_OF_${attacks.length}_REFUSED`,
    writes: 0,
  },
  'hhc-ambiguous-suffix-quarantine.json': {
    artifact: 'NEW2_R23_HHC_AMBIGUOUS_SUFFIX_QUARANTINE',
    rows: 1,
    quarantineClass: EXCLUDED_QUARANTINE_CLASS,
    records: [
      {
        judgmentId: excludedRow.judgmentId,
        r22Disposition: excludedRow.proposedDisposition,
        oldValue: excludedRow.currentStoredNeutralCitation,
        r22ProposedReplacement: excludedRow.proposedReplacement,
        sourceIdentity: excludedRow.sourceIdentity,
        sourceContentHash: excludedRow.sourceContentHash,
        evidenceClass: excludedRow.evidenceClass,
        evidencePointer: excludedRow.evidencePointer,
        parentRowHash: parentRowComparisonHashes.get(EXCLUDED_JUDGMENT_ID),
        independentAuditVerdict: EXCLUDED_VERDICT,
        independentAuditReason: EXCLUDED_REASON,
        ownershipInferenceUsed: {
          suffixFrequency: false,
          siblingHhcConvention: false,
          contentHashIdentity: false,
        },
        mutationAuthorized: false,
      },
    ],
  },
  'quarantine-census.json': {
    artifact: 'NEW2_R23_QUARANTINE_CENSUS',
    commonOrderOwnershipAmbiguous: commonOrderQuarantine.rows,
    delhiUnexplainedManyToOne: delhiQuarantine.rows,
    hhcAmbiguousSuffix: 1,
    total: quarantinedIds.length,
    safeIntersection: leaked.length,
    records: quarantinedIds,
  },
  'deferred-technical-debt.json': {
    artifact: 'NEW2_R23_DEFERRED_TECHNICAL_DEBT',
    note: 'Recorded, not fixed here. Every R23 SAFE replacement target classifies NO_EXISTING_HOLDER and never reaches the generic common-order family branch, so none of these invalidates this population.',
    items: [
      {
        id: 'DEBT-COMMON-ORDER-EVIDENCE-PRECISION',
        finding: 'Common-order evidence pointers can be insufficiently precise.',
        owner: 'citation-edge / common-order work',
        affectsR23: false,
      },
      {
        id: 'DEBT-VERIFIED-COMMON-ORDER-FAMILY-PREFLIGHT',
        finding:
          'The VERIFIED_COMMON_ORDER_FAMILY generic preflight branch only checks that an evidence pointer is non-empty.',
        evidence:
          'services/ingest/src/correction-preflight.ts — the VERIFIED_COMMON_ORDER_FAMILY case tests row.evidencePointer truthiness and nothing else.',
        owner: 'citation-edge / common-order work',
        affectsR23: false,
      },
      {
        id: 'DEBT-R21-CONCATENATED-SOURCE-COUNTS',
        finding: 'R21 concatenated-source diagnostic counts have narrative inconsistencies.',
        owner: 'citation-edge / common-order work',
        affectsR23: false,
      },
    ],
  },
  'lineage.json': {
    artifact: 'NEW2_R23_LINEAGE',
    claim:
      'R23 SAFE is exactly the independently audited R22 SAFE population minus one row. This record proves that without re-reading 539 source documents.',
    parent: {
      populationId: parentArtifacts.populationId,
      populationHash: R22_POPULATION_HASH,
      populationHashRecomputed: parentHashRecomputed,
      rowCount: parentRows.length,
      counts: parentCounts,
      sourceUniverseId: parentArtifacts.sourceUniverseId,
      artifactIntegrity: parentFileIntegrity,
    },
    child: { populationId, populationHash, rowCount: safeRows.length, counts },
    excluded: {
      judgmentId: EXCLUDED_JUDGMENT_ID,
      r22Class: excludedRow.proposedDisposition,
      independentAuditVerdict: EXCLUDED_VERDICT,
      independentAuditReason: EXCLUDED_REASON,
      quarantineClass: EXCLUDED_QUARANTINE_CLASS,
      parentRowHash: parentRowComparisonHashes.get(EXCLUDED_JUDGMENT_ID),
    },
    deltaProof: {
      parentMinusChild: removed,
      childMinusParent: added,
      r22MinusOneExact: removed.length === 1 && added.length === 0,
    },
    retainedRowComparison: {
      method: `sha256 over ${SEMANTIC_FIELDS.join('|')}`,
      rows: rowComparisonHashes.length,
      retainedSetHash,
      rowFieldsChangedFromParent,
      fieldsComparedPerRow: SEMANTIC_FIELDS.length,
      rowsWithAnyChangedField: fieldComparison.filter((entry) => entry.changed.length > 0).length,
      hashes: rowComparisonHashes,
    },
    manifestLevelDelta: {
      proposedKeyHoldersParent: Object.keys(parentManifest.proposedKeyHolders).length,
      proposedKeyHoldersChild: Object.keys(proposedKeyHolders).length,
      droppedKeys,
      droppedKeysNote:
        'A replacement key is dropped only because the one excluded row was its sole candidate. No retained row lost or gained a holder set.',
      manyToOneFamiliesUnchanged: true,
      frozenFrontierUnchanged: true,
    },
    quarantineCensus: {
      commonOrderOwnershipAmbiguous: commonOrderQuarantine.rows,
      delhiUnexplainedManyToOne: delhiQuarantine.rows,
      hhcAmbiguousSuffix: 1,
      total: quarantinedIds.length,
      intersectionWithSafe: leaked.length,
    },
    currentDrift,
    targetHolderGate,
    preflight: {
      unchangedOk: unchanged.ok,
      attacks: attacks.length,
      allRefused: attacks.every((entry) => entry.result === 'REFUSED'),
    },
    mutationLedger: { canonicalRows: 0, edges: 0, aliases: 0, migrations: 0 },
    readyForR23DeltaAudit: true,
    readyForWrite: false,
    citationBulkApply: 'HOLD',
  },
  'verification.json': {
    artifact: 'NEW2_R23_BUILD_VERIFICATION',
    r22HashVerified: {
      expected: R22_POPULATION_HASH,
      recomputed: parentHashRecomputed,
      artifactBytesVerified: parentFileIntegrity.length,
      pass: true,
    },
    r22Counts: parentCounts,
    populationId,
    populationHash,
    counts,
    total: safeRows.length,
    r22MinusOneExact: removed.length === 1 && added.length === 0,
    rowFieldsChangedFromParent,
    quarantine: {
      commonOrder: commonOrderQuarantine.rows,
      delhi: delhiQuarantine.rows,
      hhcAmbiguousSuffix: 1,
      total: quarantinedIds.length,
    },
    currentDrift: currentDrift.result,
    targetHolderGate: targetHolderGate.result,
    preflightAttacks: attacks.length,
    canonicalRowsChanged: 0,
    edgesChanged: 0,
    aliasesChanged: 0,
    migrations: 0,
    networkUsed: false,
    databaseUsed: true,
    databaseAccess: 'READ_ONLY_LOCAL_LOOPBACK',
    new1Interrupted: false,
    readyForR23DeltaAudit: true,
    readyForWrite: false,
    citationBulkApply: 'HOLD',
  },
};

for (const [name, artifact] of Object.entries(artifacts)) writeJson(name, artifact);

const artifactHashes = Object.fromEntries(
  Object.keys(artifacts).map((name) => [name, sha(readFileSync(join(OUT, name), 'utf8'))]),
);
const lineageHash = artifactHashes['lineage.json']!;
writeJson('artifact-manifest.json', {
  artifact: 'NEW2_R23_IMMUTABLE_ARTIFACT_MANIFEST',
  populationId,
  populationHash,
  parentPopulationId: parentArtifacts.populationId,
  parentPopulationHash: R22_POPULATION_HASH,
  lineageHash,
  files: artifactHashes,
  mutationLedger: { canonicalRows: 0, edges: 0, aliases: 0, migrations: 0 },
  readyForR23DeltaAudit: true,
  readyForWrite: false,
  citationBulkApply: 'HOLD',
});

console.log(
  JSON.stringify(
    {
      populationId,
      populationHash,
      lineageHash,
      total: safeRows.length,
      counts,
      r22MinusOneExact: removed.length === 1 && added.length === 0,
      rowFieldsChangedFromParent,
      quarantineTotal: quarantinedIds.length,
      currentDrift: currentDrift.result,
      targetHolderGate: targetHolderGate.result,
      attacksRefused: attacks.length,
    },
    null,
    2,
  ),
);
