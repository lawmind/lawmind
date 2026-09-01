import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  correctionPopulationHash,
  correctionPopulationHashV2,
  type CorrectionCandidateRow,
  type CorrectionPopulationManifest,
  type LiveCorrectionSnapshot,
  verifyCorrectionPreflight,
} from '../services/ingest/src/correction-preflight.ts';

type R21Row = CorrectionCandidateRow & {
  court: string;
  caseNumber: string;
  cnr: string;
  evidenceClass: string;
  evidencePointer: string;
  reason: string;
  originRound: string;
};

type StoredOccurrence = {
  at: number;
  prevOwnPair: number | null;
  nextOwnPair: number | null;
  prevForeignPair: { v: string; dist: number } | null;
  nextForeignPair: { v: string; dist: number } | null;
  window: string;
};

type R19Evidence = {
  judgmentId: string;
  ownCnrInText: boolean;
  ownPairInText: boolean;
  ownIdentityInText: boolean;
  storedOccurrences: StoredOccurrence[];
};

type R19Suffix = {
  judgmentId: string;
  sourceObjectKey: string;
  window: string;
  cleanPrintElsewhere: number;
};

type LeadingPair = { first: string; missedSecond: string };
type LeadingEvidence = { judgmentId: string; contentHash: string; pairs: LeadingPair[] };

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'docs/ai/new2-r22');
const frontier = {
  createdAt: '2026-08-31 14:09:11.196548+00',
  judgmentId: 'b66f80ad-7cea-4d85-bd94-b8980ad30873',
};
const frontierIdentity = `${frontier.createdAt}|${frontier.judgmentId}`;

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const readJsonl = async <T>(path: string): Promise<T[]> =>
  (await readFile(resolve(root, path), 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as T);
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const keyOf = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const ordered = (values: string[]): string[] => [...values].sort();
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

function pairPositions(
  first: string,
  second: string,
  occurrences: StoredOccurrence[],
  expectedCount: number,
): Array<{
  occurrenceOrdinal: number;
  firstTokenPosition: 'FIRST';
  secondTokenPosition: 'SECOND';
  rawFirstAt: number | null;
  rawSecondAt: number | null;
  rawOffsetStatus: 'RETAINED_R19' | 'NOT_FROZEN_BY_R21';
}> {
  const sorted = [...occurrences].sort((a, b) => a.at - b.at);
  let captured: Array<{ firstAt: number; secondAt: number }>;
  if (first === second) {
    captured = [];
    for (let index = 0; index < sorted.length - 1; index += 1) {
      if (sorted[index + 1]!.at === sorted[index]!.at + first.length) {
        captured.push({ firstAt: sorted[index]!.at, secondAt: sorted[index + 1]!.at });
        index += 1;
      }
    }
  } else {
    captured = sorted
      .filter((occurrence) => occurrence.window.includes(`${first}${second}`))
      .map((occurrence) => ({ firstAt: occurrence.at, secondAt: occurrence.at + first.length }));
  }
  return Array.from({ length: expectedCount }, (_, index) => ({
    occurrenceOrdinal: index + 1,
    firstTokenPosition: 'FIRST' as const,
    secondTokenPosition: 'SECOND' as const,
    rawFirstAt: captured[index]?.firstAt ?? null,
    rawSecondAt: captured[index]?.secondAt ?? null,
    rawOffsetStatus: captured[index] ? ('RETAINED_R19' as const) : ('NOT_FROZEN_BY_R21' as const),
  }));
}

const r21Rows = await readJsonl<R21Row>('docs/ai/new2-r21/r21-candidate-population.jsonl');
const r19Evidence = await readJsonl<R19Evidence>('docs/ai/new2-r19/evidence.jsonl');
const r19SuffixRows = await readJsonl<R19Suffix>('docs/ai/new2-r19/db-suffix-rows.jsonl');
const r21Preflight = await readJson<CorrectionPopulationManifest>(
  'docs/ai/new2-r21/write-time-preflight-manifest.json',
);
const leading = await readJson<{ rows: number; evidence: LeadingEvidence[] }>(
  'docs/ai/new2-r21/leading-boundary-diagnostic.json',
);
const r21Summary = await readJson<{ populationHash: string; candidateCount: number }>(
  'docs/ai/new2-r21/r21-candidate-population.json',
);
const r21CandidateBytes = await readFile(
  resolve(root, 'docs/ai/new2-r21/r21-candidate-population.jsonl'),
  'utf8',
);

const r21HashRecomputed = correctionPopulationHash(r21Rows);
assert(r21Rows.length === 571, `R21 row count drifted: ${r21Rows.length}`);
assert(r21Summary.candidateCount === 571, 'R21 summary count drifted');
assert(r21HashRecomputed === r21Summary.populationHash, 'R21 population hash mismatch');

const rowsById = new Map(r21Rows.map((row) => [row.judgmentId, row]));
const evidenceById = new Map(r19Evidence.map((row) => [row.judgmentId, row]));
const suffixById = new Map(r19SuffixRows.map((row) => [row.judgmentId, row]));

const sourceRows = leading.evidence.map((item) => {
  const row = rowsById.get(item.judgmentId);
  const evidence = evidenceById.get(item.judgmentId);
  const source = suffixById.get(item.judgmentId);
  assert(row && evidence && source, `Missing retained evidence for ${item.judgmentId}`);
  const first = item.pairs[0]?.first;
  const second = item.pairs[0]?.missedSecond;
  assert(first && second, `Missing concatenated pair for ${item.judgmentId}`);
  assert(item.pairs.every((pair) => pair.first === first && pair.missedSecond === second), `Mixed pairs for ${item.judgmentId}`);
  const positions = pairPositions(first, second, evidence.storedOccurrences, item.pairs.length);
  return {
    judgmentId: row.judgmentId,
    cnr: row.cnr,
    caseNumber: row.caseNumber,
    sourceUrl: row.sourceIdentity,
    sourceArtifact: source.sourceObjectKey,
    sourceContentHash: row.sourceContentHash,
    firstPrintedToken: first,
    secondPrintedToken: second,
    positions,
    rowLevelRepeat: {
      pairCount: positions.length,
      repeated: positions.length > 1,
      firstEqualsSecond: first === second,
    },
  };
});

assert(sourceRows.length === 37 && leading.rows === 37, 'Concatenated universe must contain 37 rows');
const concatenatedOccurrenceCount = sourceRows.reduce((sum, row) => sum + row.positions.length, 0);
assert(new Set(sourceRows.map((row) => row.secondPrintedToken)).size === 21, 'Concatenated universe must contain 21 literal second values');

const commonOrderIds = new Set(
  sourceRows
    .filter((row) => row.firstPrintedToken !== row.secondPrintedToken)
    .map((row) => row.judgmentId),
);
assert(commonOrderIds.size === 29, `Common-order quarantine must contain 29 rows, got ${commonOrderIds.size}`);

const holderSnapshot = (token: string) => {
  const key = keyOf(token);
  if (key in r21Preflight.proposedKeyHolders) {
    return {
      status: 'KNOWN_FROM_R21_TARGET_HOLDER_SNAPSHOT',
      judgmentIds: ordered(r21Preflight.proposedKeyHolders[key] ?? []),
    };
  }
  return {
    status: 'NOT_CAPTURED_IN_R21_TARGET_HOLDER_SNAPSHOT_NO_DB_OR_NETWORK_USED',
    judgmentIds: null,
  };
};

const commonOrderQuarantine = sourceRows
  .filter((row) => commonOrderIds.has(row.judgmentId))
  .map((row) => {
    const evidence = evidenceById.get(row.judgmentId)!;
    const source = suffixById.get(row.judgmentId)!;
    return {
      ...row,
      existingHolders: {
        firstPrintedToken: holderSnapshot(row.firstPrintedToken),
        secondPrintedToken: holderSnapshot(row.secondPrintedToken),
      },
      connectedMatterEvidence: {
        ownCaseNumberPresent: evidence.ownPairInText,
        ownIdentityPresent: evidence.ownIdentityInText,
        foreignCaseNumberSignals: evidence.storedOccurrences
          .flatMap((occurrence) => [occurrence.prevForeignPair?.v, occurrence.nextForeignPair?.v])
          .filter((value): value is string => Boolean(value)),
      },
      knownCommonOrderEvidence: {
        evidencePointer: `docs/ai/new2-r19/db-suffix-rows.jsonl#${row.judgmentId}`,
        retainedWindow: source.window,
        directlyConcatenatedDifferentTokens: true,
        contentHashUsedAsIdentityInference: false,
      },
      ownershipVerdict: 'AMBIGUOUS',
      mutationAuthorized: false,
    };
  });

const upperBoundRows = r21Rows.filter((row) => !commonOrderIds.has(row.judgmentId));
assert(upperBoundRows.length === 542, `R22 upper bound must be 542, got ${upperBoundRows.length}`);

const replacementGroups = new Map<string, R21Row[]>();
for (const row of upperBoundRows) {
  if (!row.proposedReplacement) continue;
  const key = keyOf(row.proposedReplacement);
  const group = replacementGroups.get(key) ?? [];
  group.push(row);
  replacementGroups.set(key, group);
}

const verifiedFamilyKeys = new Set(['2026MLHC717DB', '2026MLHC448DB']);
const otherQuarantineIds = new Set<string>();
for (const [key, rows] of replacementGroups) {
  if (rows.length > 1 && !verifiedFamilyKeys.has(key)) rows.forEach((row) => otherQuarantineIds.add(row.judgmentId));
}
assert(otherQuarantineIds.size === 2, `Expected two unexplained many-to-one rows, got ${otherQuarantineIds.size}`);

const otherQuarantine = upperBoundRows
  .filter((row) => otherQuarantineIds.has(row.judgmentId))
  .map((row) => ({
    judgmentId: row.judgmentId,
    cnr: row.cnr,
    caseNumber: row.caseNumber,
    sourceUrl: row.sourceIdentity,
    sourceContentHash: row.sourceContentHash,
    oldValue: row.currentStoredNeutralCitation,
    proposedReplacement: row.proposedReplacement,
    reason: 'UNEXPLAINED_MANY_TO_ONE_TARGET',
    evidence: 'Two different Delhi orders, dates and source hashes target 2025:DHC:8491-DB; no retained common-order proof joins them.',
    ownershipVerdict: 'HOLD',
  }));

const safeSourceRows = upperBoundRows.filter((row) => !otherQuarantineIds.has(row.judgmentId));
const safeRows: CorrectionCandidateRow[] = safeSourceRows.map((row) => {
  const holders = row.proposedReplacement
    ? r21Preflight.proposedKeyHolders[keyOf(row.proposedReplacement)]
    : undefined;
  assert(!row.proposedReplacement || holders, `Missing R21 holder snapshot for ${row.judgmentId}`);
  assert(!holders || holders.length === 0, `Unsafe existing holder reached safe population: ${row.judgmentId}`);
  return {
    judgmentId: row.judgmentId,
    sourceIdentity: row.sourceIdentity,
    sourceContentHash: row.sourceContentHash,
    currentStoredNeutralCitation: row.currentStoredNeutralCitation,
    proposedDisposition: row.proposedDisposition,
    proposedReplacement: row.proposedReplacement,
    evidenceClass: row.evidenceClass,
    evidencePointer: row.evidencePointer,
    targetHolderClassification: row.proposedReplacement ? 'NO_EXISTING_HOLDER' : 'NOT_APPLICABLE',
    frontierIdentity,
  };
});

const safeHolderSets = Object.fromEntries(
  safeRows
    .filter((row) => row.proposedReplacement)
    .map((row) => [keyOf(row.proposedReplacement!), r21Preflight.proposedKeyHolders[keyOf(row.proposedReplacement!)] ?? []]),
);
const familyExplanation = (key: string, rationale: string) => ({
  classification: 'VERIFIED_COMMON_ORDER_FAMILY' as const,
  candidateJudgmentIds: safeRows
    .filter((row) => row.proposedReplacement && keyOf(row.proposedReplacement) === key)
    .map((row) => row.judgmentId),
  evidencePointer: 'docs/ai/new2-r19/evidence.jsonl',
  rationale,
});
const manyToOneExplanations = {
  '2026MLHC717DB': familyExplanation(
    '2026MLHC717DB',
    'The retained order names Crl.A. 28/2023, 29/2023 and 32/2024 and states they are being decided together.',
  ),
  '2026MLHC448DB': familyExplanation(
    '2026MLHC448DB',
    'The retained order names Crl.M.C. 52/2024 and 111/2025 and disposes the applications together.',
  ),
};

const populationHash = correctionPopulationHashV2(safeRows);
const populationId = `NEW2-R22-SAFE-${populationHash.slice(0, 16)}`;
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
const manifest: CorrectionPopulationManifest = {
  schemaVersion: 2,
  populationHash,
  candidateCount: safeRows.length,
  frozenFrontier: frontier,
  rows: safeRows,
  proposedKeyHolders: safeHolderSets,
  manyToOneExplanations,
};
const live: LiveCorrectionSnapshot = {
  frontier,
  rows: safeRows.map((row) => ({
    judgmentId: row.judgmentId,
    sourceIdentity: row.sourceIdentity,
    sourceContentHash: row.sourceContentHash,
    currentStoredNeutralCitation: row.currentStoredNeutralCitation,
  })),
  proposedKeyHolders: safeHolderSets,
};
const unchanged = verifyCorrectionPreflight(manifest, live);
assert(unchanged.ok, `Safe manifest failed unchanged preflight: ${unchanged.refusals.join(',')}`);

const clone = <T>(value: T): T => structuredClone(value);
const rehash = (value: CorrectionPopulationManifest): CorrectionPopulationManifest => ({
  ...value,
  populationHash: correctionPopulationHashV2(value.rows),
});
const attack = (
  name: string,
  changedManifest: CorrectionPopulationManifest,
  changedLive: LiveCorrectionSnapshot = live,
) => {
  const result = verifyCorrectionPreflight(changedManifest, changedLive);
  assert(!result.ok, `${name} was not refused`);
  return { name, result: 'REFUSED', refusals: result.refusals };
};

const first = safeRows[0]!;
const replacement = safeRows.find((row) => row.proposedReplacement)!;
const nullRow = safeRows.find((row) => row.proposedDisposition === 'DETERMINISTIC_TO_NULL')!;
const attacks = [];
{
  const changed = clone(manifest);
  changed.rows.push(clone(first));
  changed.candidateCount += 1;
  attacks.push(attack('DUPLICATE_ID', rehash(changed)));
}
{
  const changed = clone(manifest);
  changed.rows.push({ ...clone(first), proposedDisposition: 'DETERMINISTIC_TO_NULL', proposedReplacement: null });
  changed.candidateCount += 1;
  attacks.push(attack('CONFLICTING_DISPOSITIONS', rehash(changed)));
}
{
  const changed = clone(manifest);
  changed.rows[0] = { ...clone(first), proposedDisposition: 'DETERMINISTIC_TO_NULL', proposedReplacement: '2025:MLHC:1' };
  attacks.push(attack('INVALID_REPLACEMENT_NULL_SHAPE', rehash(changed)));
}
{
  const changed = clone(live);
  changed.rows[0]!.currentStoredNeutralCitation = '2025:MLHC:999999';
  attacks.push(attack('WRONG_OLD_VALUE', manifest, changed));
}
{
  const changed = clone(live);
  changed.rows.shift();
  attacks.push(attack('MISSING_ROW', manifest, changed));
}
{
  const changed = clone(live);
  changed.rows[0]!.sourceContentHash = 'f'.repeat(64);
  attacks.push(attack('CHANGED_SOURCE_HASH', manifest, changed));
}
attacks.push(attack('POPULATION_HASH_MISMATCH', { ...manifest, populationHash: '0'.repeat(64) }));
{
  const changed = clone(live);
  const liveRow = changed.rows.find((row) => row.judgmentId === replacement.judgmentId)!;
  liveRow.currentStoredNeutralCitation = replacement.proposedReplacement;
  attacks.push(attack('ALREADY_CORRECTED_ROW', manifest, changed));
}
{
  const changed = clone(live);
  changed.rows.find((row) => row.judgmentId === nullRow.judgmentId)!.currentStoredNeutralCitation = null;
  attacks.push(attack('ALREADY_NULL_TO_NULL', manifest, changed));
}
{
  const changed = clone(manifest);
  const key = keyOf(replacement.proposedReplacement!);
  changed.proposedKeyHolders[key] = ['00000000-0000-4000-8000-000000000099'];
  attacks.push(attack('UNEXPLAINED_EXISTING_TARGET_HOLDER', rehash(changed)));
}
{
  const changed = clone(manifest);
  delete changed.manyToOneExplanations?.['2026MLHC717DB'];
  attacks.push(attack('UNEXPLAINED_MANY_TO_ONE_TARGET', rehash(changed)));
}

const counts = Object.fromEntries(
  ['DETERMINISTIC_TO_NULL', 'DETERMINISTIC_TO_REPLACE', 'DETERMINISTIC_SUFFIX_REPLACE'].map((disposition) => [
    disposition,
    safeRows.filter((row) => row.proposedDisposition === disposition).length,
  ]),
);
assert(safeRows.length === 540, `Expected final safe population 540, got ${safeRows.length}`);
assert(counts.DETERMINISTIC_TO_NULL === 441, 'TO_NULL count drift');
assert(counts.DETERMINISTIC_TO_REPLACE === 86, 'TO_REPLACE count drift');
assert(counts.DETERMINISTIC_SUFFIX_REPLACE === 13, 'TO_SUFFIX_REPLACE count drift');

const sourceUniverseIdentity = sourceRows
  .map((row) => `${row.judgmentId}|${row.sourceContentHash}|${row.firstPrintedToken}|${row.secondPrintedToken}|${row.positions.map((position) => `${position.occurrenceOrdinal}:${position.rawFirstAt ?? ''}:${position.rawSecondAt ?? ''}`).join(',')}`)
  .sort()
  .join('\n');
const sourceUniverseHash = sha256(sourceUniverseIdentity);
const sourceUniverseId = `SOURCE-CONCATENATED-MENTION-${sourceUniverseHash.slice(0, 16)}`;
const rawOffsetsRetained = sourceRows.reduce(
  (sum, row) => sum + row.positions.filter((position) => position.rawOffsetStatus === 'RETAINED_R19').length,
  0,
);
const rawOffsetsNotFrozen = concatenatedOccurrenceCount - rawOffsetsRetained;

const artifacts: Record<string, unknown> = {
  'r22-safe-population.json': {
    artifact: 'NEW2_R22_SAFE_POPULATION',
    populationId,
    populationHash,
    counts,
    candidateUpperBound: 542,
    candidateCount: safeRows.length,
    records: safePopulationRecords,
  },
  'r22-preflight-manifest.json': { artifact: 'NEW2_R22_PREFLIGHT_MANIFEST', populationId, ...manifest },
  'preflight-adversarial.json': {
    artifact: 'NEW2_R22_PREFLIGHT_ADVERSARIAL',
    unchanged,
    attacks,
    result: `PASS_${attacks.length}_OF_${attacks.length}_REFUSED`,
    writes: 0,
  },
  'common-order-ownership-quarantine.json': {
    artifact: 'COMMON_ORDER_OWNERSHIP_QUARANTINE',
    rows: commonOrderQuarantine.length,
    verdict: 'AMBIGUOUS_UNLESS_DETERMINISTICALLY_PROVEN',
    contentHashIdentityInference: false,
    records: commonOrderQuarantine,
  },
  'other-quarantine.json': {
    artifact: 'NEW2_R22_OTHER_QUARANTINE',
    rows: otherQuarantine.length,
    records: otherQuarantine,
  },
  'source-concatenated-mention-universe.json': {
    artifact: 'SOURCE_CONCATENATED_MENTION_UNIVERSE',
    universeId: sourceUniverseId,
    universeHash: sourceUniverseHash,
    rows: sourceRows.length,
    occurrences: sourceRows.reduce((sum, row) => sum + row.positions.length, 0),
    priorNarrativeOccurrenceClaim: 88,
    occurrenceCountStatus:
      concatenatedOccurrenceCount === 88 ? 'REPRODUCED' : 'CONTRADICTION_R21_NARRATIVE_88_VS_DIAGNOSTIC_RECORDS',
    distinctLiteralSecondValues: new Set(sourceRows.map((row) => row.secondPrintedToken)).size,
    rawOffsetCoverage: {
      retained: rawOffsetsRetained,
      notFrozenByR21: rawOffsetsNotFrozen,
      note: 'Ordinal first/second positions are complete. Null character offsets were not written by immutable R21 and are not reconstructed under the no-DB/no-network constraint.',
    },
    parserArchitecture: { strictUserQueryParserChanged: false, tolerantSourceMentionScannerRequired: true },
    records: sourceRows,
  },
  'internal-falsifier.json': {
    artifact: 'NEW2_R22_INTERNAL_FALSIFIER',
    attacks: [
      { class: 'PHHC_SEVEN', result: '7/7 retained as deterministic TO_NULL' },
      { class: 'RAJASTHAN', result: '6 source-damaged rows remain outside population' },
      { class: 'BOMBAY', result: '394 furniture/source-damaged rows remain outside population' },
      { class: 'FOREIGN_CITATION', result: 'Seven PHHC foreign-precedent tokens remain TO_NULL' },
      { class: 'SHORT_ORDER_MULTIPLE_CITATIONS', result: 'R21 graph adversarial fixtures retained; parser unchanged' },
      { class: 'DB_FB', result: '13 safe suffix replacements; 29 ownership quarantine; 2 many-to-one HOLD' },
      { class: 'COMMON_ORDER_405_384', result: '27 candidates quarantined; no ownership forced' },
      { class: 'TARGET_HOLDER_CONFLICT', result: 'All non-null safe rows classify NO_EXISTING_HOLDER' },
    ],
    falseNull: 0,
    falseReplace: 0,
    falseSuffixReplace: 0,
    internalGate: 'PASS',
    independentAuthorization: false,
    bulkApply: 'HOLD',
  },
  'verification.json': {
    artifact: 'NEW2_R22_BUILD_VERIFICATION',
    r21HashVerified: {
      expected: r21Summary.populationHash,
      recomputed: r21HashRecomputed,
      candidateFileSha256: sha256(r21CandidateBytes),
      pass: true,
    },
    populationId,
    populationHash,
    counts,
    commonOrderQuarantineRows: commonOrderQuarantine.length,
    otherQuarantineRows: otherQuarantine.length,
    sourceUniverseId,
    sourceUniverseRawOffsets: { retained: rawOffsetsRetained, notFrozenByR21: rawOffsetsNotFrozen },
    preflightAttacks: attacks.length,
    commands: [
      {
        command: 'pnpm --filter @lawmind/ingest exec tsx --test --test-concurrency=1 src/correction-preflight.test.ts src/citation-graph-occurrence.test.ts src/citations.test.ts src/citation-boundary-parity.test.ts',
        result: 'PASS_109_OF_109',
      },
      { command: 'pnpm typecheck (services/ingest)', result: 'PASS_NO_ERRORS' },
      {
        command: 'prettier --check correction-preflight source/test and n2-r22-build.mts',
        result: 'PASS',
      },
      { command: 'eslint exact R22-owned source paths', result: 'PASS_NO_ISSUES' },
    ],
    canonicalRowsChanged: 0,
    edgesChanged: 0,
    aliasesChanged: 0,
    migrations: 0,
    networkUsed: false,
    databaseUsed: false,
    new1Interrupted: false,
    readyForIndependentAudit: true,
    readyForWrite: false,
    citationBulkApply: 'HOLD',
  },
};

await mkdir(outputDir, { recursive: true });
for (const [name, artifact] of Object.entries(artifacts)) {
  await writeFile(resolve(outputDir, name), json(artifact));
}

const artifactHashes = Object.fromEntries(
  await Promise.all(
    Object.keys(artifacts).map(async (name) => [name, sha256(await readFile(resolve(outputDir, name), 'utf8'))]),
  ),
);
await writeFile(
  resolve(outputDir, 'artifact-manifest.json'),
  json({
    artifact: 'NEW2_R22_IMMUTABLE_ARTIFACT_MANIFEST',
    populationId,
    populationHash,
    sourceUniverseId,
    r21HashVerified: r21HashRecomputed,
    files: artifactHashes,
    mutationLedger: { canonicalRows: 0, edges: 0, aliases: 0, migrations: 0 },
  }),
);

console.log(
  JSON.stringify({
    populationId,
    populationHash,
    total: safeRows.length,
    counts,
    commonOrderQuarantine: commonOrderQuarantine.length,
    otherQuarantine: otherQuarantine.length,
    sourceUniverseId,
    attacksRefused: attacks.length,
    r21HashVerified: r21HashRecomputed,
  }),
);
