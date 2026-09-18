import { createHash } from 'node:crypto';

export const CORRECTION_DISPOSITIONS = [
  'DETERMINISTIC_TO_NULL',
  'DETERMINISTIC_TO_REPLACE',
  'DETERMINISTIC_SUFFIX_REPLACE',
] as const;

export type CorrectionDisposition = (typeof CORRECTION_DISPOSITIONS)[number];
export type TargetHolderClassification =
  'NOT_APPLICABLE' | 'NO_EXISTING_HOLDER' | 'SAME_JUDGMENT' | 'VERIFIED_COMMON_ORDER_FAMILY';

export type CorrectionCandidateRow = {
  judgmentId: string;
  sourceIdentity: string;
  sourceContentHash: string;
  currentStoredNeutralCitation: string;
  proposedDisposition: string;
  proposedReplacement: string | null;
  evidenceClass?: string;
  evidencePointer?: string;
  targetHolderClassification?: TargetHolderClassification;
  frontierIdentity?: string;
};

export type ManyToOneExplanation = {
  classification: 'VERIFIED_COMMON_ORDER_FAMILY';
  candidateJudgmentIds: string[];
  evidencePointer: string;
  rationale: string;
};

export type CorrectionPopulationManifest = {
  schemaVersion?: 1 | 2;
  populationHash: string;
  candidateCount: number;
  frozenFrontier: { createdAt: string; judgmentId: string };
  rows: CorrectionCandidateRow[];
  proposedKeyHolders: Record<string, string[]>;
  manyToOneExplanations?: Record<string, ManyToOneExplanation>;
};

export type LiveCorrectionSnapshot = {
  frontier: { createdAt: string; judgmentId: string };
  rows: Array<{
    judgmentId: string;
    sourceIdentity: string;
    sourceContentHash: string;
    currentStoredNeutralCitation: string | null;
  }>;
  proposedKeyHolders: Record<string, string[]>;
};

const ordered = (values: string[]): string[] => [...values].sort();
const citationKey = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const isCanonicalCitation = (value: string): boolean =>
  /^\d{4}:[A-Z][A-Z0-9.()/-]*:\d+(?:-[A-Z]+)?$/.test(value);
const isDisposition = (value: string): value is CorrectionDisposition =>
  (CORRECTION_DISPOSITIONS as readonly string[]).includes(value);

/** R21-compatible hash. Do not change: R21 is immutable and re-verifies through this function. */
export function correctionPopulationHash(rows: CorrectionCandidateRow[]): string {
  const identity = [...rows]
    .sort((a, b) => a.judgmentId.localeCompare(b.judgmentId))
    .map((row) =>
      [
        row.judgmentId,
        row.sourceIdentity,
        row.sourceContentHash,
        row.currentStoredNeutralCitation,
        row.proposedDisposition,
        row.proposedReplacement ?? '',
      ].join('|'),
    )
    .join('\n');
  return createHash('sha256').update(identity).digest('hex');
}

/** R22 protects evidence, holder classification and frontier identity as row identity. */
export function correctionPopulationHashV2(rows: CorrectionCandidateRow[]): string {
  const identity = [...rows]
    .sort((a, b) => a.judgmentId.localeCompare(b.judgmentId))
    .map((row) =>
      [
        row.judgmentId,
        row.sourceIdentity,
        row.sourceContentHash,
        row.currentStoredNeutralCitation,
        row.proposedDisposition,
        row.proposedReplacement ?? '',
        row.evidenceClass ?? '',
        row.evidencePointer ?? '',
        row.targetHolderClassification ?? '',
        row.frontierIdentity ?? '',
      ].join('|'),
    )
    .join('\n');
  return createHash('sha256').update(identity).digest('hex');
}

function structuralRefusals(manifest: CorrectionPopulationManifest): string[] {
  const refusals: string[] = [];
  const rowsById = new Map<string, CorrectionCandidateRow[]>();

  for (const row of manifest.rows) {
    const records = rowsById.get(row.judgmentId) ?? [];
    records.push(row);
    rowsById.set(row.judgmentId, records);

    if (!row.judgmentId) refusals.push('MANIFEST_INVALID:MISSING_JUDGMENT_ID');
    if (!row.sourceContentHash) {
      refusals.push(`MANIFEST_INVALID:MISSING_SOURCE_HASH:${row.judgmentId}`);
    } else if (!/^[a-f0-9]{64}$/i.test(row.sourceContentHash)) {
      refusals.push(`MANIFEST_INVALID:MALFORMED_SOURCE_HASH:${row.judgmentId}`);
    }
    if (!row.sourceIdentity)
      refusals.push(`MANIFEST_INVALID:MISSING_SOURCE_IDENTITY:${row.judgmentId}`);
    if (!row.currentStoredNeutralCitation) {
      refusals.push(`MANIFEST_INVALID:MISSING_OLD_VALUE:${row.judgmentId}`);
    } else if (!isCanonicalCitation(row.currentStoredNeutralCitation)) {
      refusals.push(`MANIFEST_INVALID:MALFORMED_CANONICAL_CITATION:${row.judgmentId}:OLD`);
    }
    if (!isDisposition(row.proposedDisposition)) {
      refusals.push(`MANIFEST_INVALID:UNEXPECTED_DISPOSITION:${row.judgmentId}`);
      continue;
    }

    if (row.proposedDisposition === 'DETERMINISTIC_TO_NULL') {
      if (row.proposedReplacement !== null)
        refusals.push(`MANIFEST_INVALID:TO_NULL_WITH_REPLACEMENT:${row.judgmentId}`);
    } else if (row.proposedReplacement === null) {
      refusals.push(`MANIFEST_INVALID:REPLACEMENT_WITH_NULL:${row.judgmentId}`);
    } else {
      if (!isCanonicalCitation(row.proposedReplacement))
        refusals.push(`MANIFEST_INVALID:MALFORMED_CANONICAL_CITATION:${row.judgmentId}:NEW`);
      if (row.proposedReplacement === row.currentStoredNeutralCitation)
        refusals.push(`MANIFEST_INVALID:REPLACEMENT_EQUALS_OLD:${row.judgmentId}`);
    }

    if (manifest.schemaVersion === 2) {
      if (!row.evidenceClass)
        refusals.push(`MANIFEST_INVALID:MISSING_EVIDENCE_CLASS:${row.judgmentId}`);
      if (!row.evidencePointer)
        refusals.push(`MANIFEST_INVALID:MISSING_EVIDENCE_POINTER:${row.judgmentId}`);
      if (!row.frontierIdentity)
        refusals.push(`MANIFEST_INVALID:MISSING_FRONTIER_IDENTITY:${row.judgmentId}`);
      if (!row.targetHolderClassification)
        refusals.push(`MANIFEST_INVALID:MISSING_TARGET_HOLDER_CLASSIFICATION:${row.judgmentId}`);
    }
  }

  for (const [judgmentId, records] of rowsById) {
    if (records.length < 2) continue;
    refusals.push(`MANIFEST_INVALID:DUPLICATE_JUDGMENT_ID:${judgmentId}`);
    if (new Set(records.map((row) => JSON.stringify(row))).size > 1)
      refusals.push(`MANIFEST_INVALID:DUPLICATE_CONFLICTING_MANIFEST_RECORD:${judgmentId}`);
    if (new Set(records.map((row) => row.proposedDisposition)).size > 1)
      refusals.push(`MANIFEST_INVALID:CONFLICTING_DISPOSITIONS:${judgmentId}`);
  }

  if (manifest.schemaVersion !== 2) return refusals;

  const replacementGroups = new Map<string, CorrectionCandidateRow[]>();
  for (const row of manifest.rows) {
    if (!row.proposedReplacement) continue;
    const key = citationKey(row.proposedReplacement);
    const group = replacementGroups.get(key) ?? [];
    group.push(row);
    replacementGroups.set(key, group);

    if (!(key in manifest.proposedKeyHolders)) {
      refusals.push(`MANIFEST_INVALID:MISSING_TARGET_HOLDER_SET:${key}`);
      continue;
    }
    const holders = ordered(manifest.proposedKeyHolders[key] ?? []);
    switch (row.targetHolderClassification) {
      case 'NO_EXISTING_HOLDER':
        if (holders.length !== 0) refusals.push(`TARGET_HOLDER_CONFLICT:${key}`);
        break;
      case 'SAME_JUDGMENT':
        if (holders.length !== 1 || holders[0] !== row.judgmentId)
          refusals.push(`TARGET_HOLDER_CONFLICT:${key}`);
        break;
      case 'VERIFIED_COMMON_ORDER_FAMILY':
        if (!row.evidencePointer) refusals.push(`TARGET_HOLDER_CONFLICT:${key}`);
        break;
      default:
        refusals.push(`TARGET_HOLDER_CONFLICT:${key}`);
    }
  }

  for (const [key, rows] of replacementGroups) {
    if (rows.length < 2) continue;
    const explanation = manifest.manyToOneExplanations?.[key];
    const actualIds = ordered(rows.map((row) => row.judgmentId));
    if (
      !explanation ||
      explanation.classification !== 'VERIFIED_COMMON_ORDER_FAMILY' ||
      !explanation.evidencePointer ||
      !explanation.rationale ||
      JSON.stringify(ordered(explanation.candidateJudgmentIds)) !== JSON.stringify(actualIds)
    ) {
      refusals.push(`UNEXPLAINED_MANY_TO_ONE_TARGET:${key}`);
    }
  }

  return refusals;
}

/** Fail-closed checks a future mutator must pass before opening a transaction. */
export function verifyCorrectionPreflight(
  manifest: CorrectionPopulationManifest,
  live: LiveCorrectionSnapshot,
): { ok: boolean; refusals: string[] } {
  const refusals = structuralRefusals(manifest);
  if (manifest.rows.length !== manifest.candidateCount) refusals.push('CANDIDATE_COUNT_MISMATCH');
  const computedHash =
    manifest.schemaVersion === 2
      ? correctionPopulationHashV2(manifest.rows)
      : correctionPopulationHash(manifest.rows);
  if (computedHash !== manifest.populationHash) refusals.push('POPULATION_HASH_MISMATCH');

  // Structural invalidity is terminal: do not consult live rows or the frontier.
  if (refusals.some((refusal) => refusal.startsWith('MANIFEST_INVALID:'))) {
    return { ok: false, refusals };
  }

  const liveById = new Map(live.rows.map((row) => [row.judgmentId, row]));
  for (const expected of manifest.rows) {
    const actual = liveById.get(expected.judgmentId);
    if (!actual) {
      refusals.push(`MISSING_ROW:${expected.judgmentId}`);
      continue;
    }
    if (actual.currentStoredNeutralCitation !== expected.currentStoredNeutralCitation) {
      refusals.push(`OLD_VALUE_DRIFT:${expected.judgmentId}`);
      if (
        expected.proposedDisposition === 'DETERMINISTIC_TO_NULL' &&
        actual.currentStoredNeutralCitation === null
      )
        refusals.push(`ALREADY_NULL_TO_NULL:${expected.judgmentId}`);
      if (
        expected.proposedReplacement !== null &&
        actual.currentStoredNeutralCitation === expected.proposedReplacement
      )
        refusals.push(`ALREADY_CORRECTED_ROW:${expected.judgmentId}`);
    }
    if (actual.sourceContentHash !== expected.sourceContentHash)
      refusals.push(`SOURCE_CONTENT_HASH_DRIFT:${expected.judgmentId}`);
    if (actual.sourceIdentity !== expected.sourceIdentity)
      refusals.push(`SOURCE_IDENTITY_DRIFT:${expected.judgmentId}`);
  }

  if (live.rows.length !== manifest.rows.length) refusals.push('LIVE_CANDIDATE_COUNT_DRIFT');
  const frozen = `${manifest.frozenFrontier.createdAt}|${manifest.frozenFrontier.judgmentId}`;
  const current = `${live.frontier.createdAt}|${live.frontier.judgmentId}`;
  if (current < frozen) refusals.push('INGEST_FRONTIER_BEHIND_FREEZE');

  for (const [key, expected] of Object.entries(manifest.proposedKeyHolders)) {
    const actual = live.proposedKeyHolders[key];
    if (!actual || JSON.stringify(ordered(actual)) !== JSON.stringify(ordered(expected)))
      refusals.push(`TARGET_HOLDER_CONFLICT_DRIFT:${key}`);
  }
  for (const key of Object.keys(live.proposedKeyHolders)) {
    if (!(key in manifest.proposedKeyHolders)) refusals.push(`UNEXPECTED_PROPOSED_KEY:${key}`);
  }

  return { ok: refusals.length === 0, refusals };
}
