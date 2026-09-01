import { createHash } from 'node:crypto';

export type CorrectionCandidateRow = {
  judgmentId: string;
  sourceIdentity: string;
  sourceContentHash: string;
  currentStoredNeutralCitation: string;
  proposedDisposition: string;
  proposedReplacement: string | null;
};

export type CorrectionPopulationManifest = {
  populationHash: string;
  candidateCount: number;
  frozenFrontier: { createdAt: string; judgmentId: string };
  rows: CorrectionCandidateRow[];
  proposedKeyHolders: Record<string, string[]>;
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

export function correctionPopulationHash(rows: CorrectionCandidateRow[]): string {
  const identity = [...rows]
    .sort((a, b) => a.judgmentId.localeCompare(b.judgmentId))
    .map((r) =>
      [
        r.judgmentId,
        r.sourceIdentity,
        r.sourceContentHash,
        r.currentStoredNeutralCitation,
        r.proposedDisposition,
        r.proposedReplacement ?? '',
      ].join('|'),
    )
    .join('\n');
  return createHash('sha256').update(identity).digest('hex');
}

/** Fail-closed checks a future mutator must pass before opening a transaction. */
export function verifyCorrectionPreflight(
  manifest: CorrectionPopulationManifest,
  live: LiveCorrectionSnapshot,
): { ok: boolean; refusals: string[] } {
  const refusals: string[] = [];
  if (manifest.rows.length !== manifest.candidateCount) refusals.push('CANDIDATE_COUNT_MISMATCH');
  if (correctionPopulationHash(manifest.rows) !== manifest.populationHash)
    refusals.push('POPULATION_HASH_MISMATCH');

  const liveById = new Map(live.rows.map((r) => [r.judgmentId, r]));
  for (const expected of manifest.rows) {
    const actual = liveById.get(expected.judgmentId);
    if (!actual) {
      refusals.push(`MISSING_ROW:${expected.judgmentId}`);
      continue;
    }
    if (actual.currentStoredNeutralCitation !== expected.currentStoredNeutralCitation)
      refusals.push(`OLD_VALUE_DRIFT:${expected.judgmentId}`);
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
      refusals.push(`CANONICAL_IDENTITY_CONFLICT_DRIFT:${key}`);
  }
  for (const key of Object.keys(live.proposedKeyHolders)) {
    if (!(key in manifest.proposedKeyHolders)) refusals.push(`UNEXPECTED_PROPOSED_KEY:${key}`);
  }

  return { ok: refusals.length === 0, refusals };
}
