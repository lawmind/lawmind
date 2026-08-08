/**
 * The six metrics Gate S2 turns on, and their thresholds.
 *
 * **Definitions are fixed HERE, before any measurement.** `sprints/SPRINT_2.md`
 * NEVER list: *"Weaken a threshold to pass a gate. All five are zero or
 * absolute."* A definition settled after seeing the number is a weakened
 * threshold wearing a different hat, so the reasoning lives in this file and a
 * change to it should be as uncomfortable as changing the number.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `admin/citations.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `services/api/src/admin/citations.ts` reports **production aggregates** over
 * live `citation_checks` rows. It cannot measure hallucination, and the reason
 * is structural rather than a missing feature: a live query has no known-correct
 * answer, so "did the system return something that does not exist" is
 * unanswerable from production data alone. You can only ask it of a query whose
 * right answer you already hold.
 *
 * That is what this package is. The monitor watches; the harness grades.
 */

/** Every threshold. Zero or absolute — none is a target to approach. */
export const THRESHOLDS = {
  /** References shown as verified that no tier confirms ÷ total references. */
  hallucinationRate: 0,
  /** References removed without an unverified state shown. */
  silentDropRate: 0,
  /** `overruled_status != none` rendered without the LAW MOVED treatment. */
  staleOverruledRate: 0,
  /** Count, not a rate — one leak is a failure. */
  overruledLeakage: 0,
  /** The one metric with a floor rather than a ceiling. */
  precisionAt5Min: 0.7,
  /** Reproducing any known-bad output is a fail. */
  adversarialPassRate: 1,
} as const;

/**
 * **`precision@5` — the definition, fixed before measuring.**
 *
 * `A0.4` in `docs/LCC_MASTER_PLAN.md` exists because "relevant" is genuinely
 * ambiguous in legal retrieval and the ambiguity is exploitable: a generous
 * reading inflates the number and a strict one deflates it, and whichever is
 * chosen after seeing the result is not a measurement.
 *
 * **A result at rank ≤ 5 counts as relevant when it is one of the judgment IDs
 * the query's ground truth names. Nothing else counts.**
 *
 * Deliberately excluded, each for a stated reason:
 *
 * - **Topical similarity does not count.** A judgment about the same section of
 *   the BNS that does not answer the question is what a keyword search already
 *   returns; counting it measures nothing we are trying to build.
 * - **A superseded judgment does not count as relevant** even when it is
 *   textually the best match, because an advocate cannot use it. This is the
 *   one place the metric deliberately disagrees with pure IR practice: our
 *   product's job is not "find similar text", it is "find law you can rely on".
 * - **A judgment from a court that cannot bind the querent does not count.**
 *   Ground truth records the court; a High Court decision is not an answer to a
 *   question about binding Supreme Court authority.
 * - **Rank beyond 5 does not count**, even at rank 6. The advocate reads five.
 */
export const PRECISION_AT_K = 5;

export type HarnessMetrics = {
  hallucinationRate: number;
  silentDropRate: number;
  staleOverruledRate: number;
  overruledLeakage: number;
  precisionAt5: number;
  adversarialPassRate: number;
};

export type MetricVerdict = {
  name: keyof HarnessMetrics;
  value: number;
  threshold: number;
  /** `<=` for ceilings, `>=` for the one floor. */
  comparison: 'at most' | 'at least';
  passed: boolean;
};

/**
 * Grade every metric. **Returns all six, always** — `SPRINT_2.md` DONE:
 * *"Every number reported, not just the failures."* A gate that speaks only
 * when it fails teaches everyone to read silence as success, and silence is
 * also what a broken runner produces.
 */
export function grade(m: HarnessMetrics): MetricVerdict[] {
  return [
    {
      name: 'hallucinationRate',
      value: m.hallucinationRate,
      threshold: THRESHOLDS.hallucinationRate,
      comparison: 'at most',
      passed: m.hallucinationRate <= THRESHOLDS.hallucinationRate,
    },
    {
      name: 'silentDropRate',
      value: m.silentDropRate,
      threshold: THRESHOLDS.silentDropRate,
      comparison: 'at most',
      passed: m.silentDropRate <= THRESHOLDS.silentDropRate,
    },
    {
      name: 'staleOverruledRate',
      value: m.staleOverruledRate,
      threshold: THRESHOLDS.staleOverruledRate,
      comparison: 'at most',
      passed: m.staleOverruledRate <= THRESHOLDS.staleOverruledRate,
    },
    {
      name: 'overruledLeakage',
      value: m.overruledLeakage,
      threshold: THRESHOLDS.overruledLeakage,
      comparison: 'at most',
      passed: m.overruledLeakage <= THRESHOLDS.overruledLeakage,
    },
    {
      name: 'precisionAt5',
      value: m.precisionAt5,
      threshold: THRESHOLDS.precisionAt5Min,
      comparison: 'at least',
      passed: m.precisionAt5 >= THRESHOLDS.precisionAt5Min,
    },
    {
      name: 'adversarialPassRate',
      value: m.adversarialPassRate,
      threshold: THRESHOLDS.adversarialPassRate,
      comparison: 'at least',
      passed: m.adversarialPassRate >= THRESHOLDS.adversarialPassRate,
    },
  ];
}

/**
 * A rate over zero attempts is `null`, never `0`.
 *
 * The distinction is the one this codebase keeps making: **an absent check is
 * not a negative result.** A hallucination rate of 0 means "we asked and found
 * none"; over an empty set it would mean "we never asked", and reporting that
 * as a passing 0.0% is precisely how a gate gets passed by a broken runner.
 * The grader treats `null` as a failure, because not having measured is not
 * having passed.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}
