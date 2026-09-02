/**
 * The canonical neutral-citation mutator.
 *
 * `correction-preflight.ts` decides whether a population MAY be written. This
 * decides what the write actually IS, and refuses the two ways a bulk canonical
 * correction goes wrong without erroring:
 *
 *  - an UPDATE keyed on identity alone. A row whose citation moved between the
 *    freeze and the write would be overwritten from a value nobody audited. Every
 *    statement here carries the expected old value in its WHERE clause, so a
 *    drifted row matches NOTHING and is loud instead of silent.
 *  - a partial success. 538 of 539 corrected rows is a population no audit
 *    describes, and the next round would freeze from a corpus whose provenance
 *    has a hole in it. Anything other than exactly one affected row per statement
 *    is terminal for the WHOLE transaction — never for the one row.
 *
 * There is deliberately no "repair" path and no retry. A refusal here means the
 * frozen population no longer describes the database, and the answer to that is
 * another freeze and another audit, not a smaller write.
 */
import {
  CORRECTION_DISPOSITIONS,
  type CorrectionCandidateRow,
  type CorrectionDisposition,
  type CorrectionPopulationManifest,
} from './correction-preflight.ts';

export type CorrectionUpdatePlan = {
  judgmentId: string;
  /** The value the row MUST still hold. Half of the WHERE clause, never assumed. */
  expectedOldValue: string;
  newValue: string | null;
  disposition: CorrectionDisposition;
};

const isDisposition = (value: string): value is CorrectionDisposition =>
  (CORRECTION_DISPOSITIONS as readonly string[]).includes(value);

/**
 * One plan per manifest row, or a throw. The structural rules restated here are
 * the ones a WRITE depends on — a mutator that trusted an upstream check would
 * be trusting a file, and the file is what this round is proving.
 */
export function buildCorrectionPlan(
  manifest: CorrectionPopulationManifest,
): CorrectionUpdatePlan[] {
  const refusals: string[] = [];
  const seen = new Set<string>();
  const plans: CorrectionUpdatePlan[] = [];

  for (const row of manifest.rows as CorrectionCandidateRow[]) {
    if (seen.has(row.judgmentId))
      refusals.push(`PLAN_INVALID:DUPLICATE_JUDGMENT_ID:${row.judgmentId}`);
    seen.add(row.judgmentId);

    if (!isDisposition(row.proposedDisposition)) {
      refusals.push(`PLAN_INVALID:UNEXPECTED_DISPOSITION:${row.judgmentId}`);
      continue;
    }
    if (!row.currentStoredNeutralCitation) {
      refusals.push(`PLAN_INVALID:MISSING_OLD_VALUE:${row.judgmentId}`);
      continue;
    }
    if (row.proposedDisposition === 'DETERMINISTIC_TO_NULL') {
      if (row.proposedReplacement !== null) {
        refusals.push(`PLAN_INVALID:TO_NULL_WITH_REPLACEMENT:${row.judgmentId}`);
        continue;
      }
    } else if (row.proposedReplacement === null) {
      refusals.push(`PLAN_INVALID:REPLACEMENT_WITH_NULL:${row.judgmentId}`);
      continue;
    } else if (row.proposedReplacement === row.currentStoredNeutralCitation) {
      refusals.push(`PLAN_INVALID:REPLACEMENT_EQUALS_OLD:${row.judgmentId}`);
      continue;
    }

    plans.push({
      judgmentId: row.judgmentId,
      expectedOldValue: row.currentStoredNeutralCitation,
      newValue: row.proposedReplacement,
      disposition: row.proposedDisposition,
    });
  }

  if (manifest.rows.length !== manifest.candidateCount)
    refusals.push('PLAN_INVALID:CANDIDATE_COUNT_MISMATCH');
  if (plans.length !== manifest.rows.length) refusals.push('PLAN_INVALID:PLAN_COUNT_MISMATCH');
  if (refusals.length > 0) throw new Error(`CORRECTION_PLAN_REFUSED: ${refusals.join(',')}`);
  return plans;
}

/**
 * What one statement's affected-row count means. Zero and many are different
 * failures and are named differently: zero is drift (the row moved, or never
 * matched), many is an identity that is not an identity. Both are terminal.
 */
export function classifyUpdateResult(plan: CorrectionUpdatePlan, affected: number): string {
  if (affected === 1) return 'APPLIED';
  if (affected === 0) return `UPDATE_MATCHED_NO_ROW:${plan.judgmentId}`;
  return `UPDATE_MATCHED_MANY_ROWS:${plan.judgmentId}:${affected}`;
}

export type PostUpdateRow = {
  judgmentId: string;
  neutralCitation: string | null;
  sourceIdentity: string;
  sourceContentHash: string | null;
};

/**
 * The in-transaction readback. Asserts the post-update state the audit describes,
 * and that the write touched NOTHING but the one column: source identity and
 * content hash are re-compared against the frozen values, because a correction
 * that also moved a source pointer would still read as 539/539 on the citation
 * alone.
 */
export function verifyPostUpdateState(
  plans: CorrectionUpdatePlan[],
  expectedSources: Map<string, { sourceIdentity: string; sourceContentHash: string }>,
  actual: PostUpdateRow[],
): { ok: boolean; refusals: string[]; counts: Record<CorrectionDisposition, number> } {
  const refusals: string[] = [];
  const byId = new Map(actual.map((row) => [row.judgmentId, row]));
  const counts: Record<CorrectionDisposition, number> = {
    DETERMINISTIC_TO_NULL: 0,
    DETERMINISTIC_TO_REPLACE: 0,
    DETERMINISTIC_SUFFIX_REPLACE: 0,
  };

  for (const plan of plans) {
    const row = byId.get(plan.judgmentId);
    if (!row) {
      refusals.push(`POST_STATE_ROW_MISSING:${plan.judgmentId}`);
      continue;
    }
    if (row.neutralCitation !== plan.newValue) {
      refusals.push(`POST_STATE_VALUE_MISMATCH:${plan.judgmentId}`);
      continue;
    }
    const source = expectedSources.get(plan.judgmentId);
    if (!source) {
      refusals.push(`POST_STATE_MISSING_EXPECTED_SOURCE:${plan.judgmentId}`);
      continue;
    }
    if (row.sourceIdentity !== source.sourceIdentity) {
      refusals.push(`POST_STATE_SOURCE_IDENTITY_CHANGED:${plan.judgmentId}`);
      continue;
    }
    if (row.sourceContentHash !== source.sourceContentHash) {
      refusals.push(`POST_STATE_SOURCE_HASH_CHANGED:${plan.judgmentId}`);
      continue;
    }
    counts[plan.disposition] += 1;
  }

  if (actual.length !== plans.length) refusals.push('POST_STATE_ROW_COUNT_MISMATCH');
  return { ok: refusals.length === 0, refusals, counts };
}
