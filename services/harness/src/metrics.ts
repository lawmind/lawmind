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
  /**
   * The one metric with a floor rather than a ceiling. **0.7 is unchanged; what
   * it is applied to was corrected on 8 Aug 2026, and the correction is
   * arithmetic rather than a judgement call — see `successAt5` below.**
   */
  successAt5Min: 0.7,
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CORRECTION, 8 Aug 2026 — recorded rather than quietly applied
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The definition above is right and stays. The **threshold was attached to the
 * wrong quantity**, and the first real run is what showed it.
 *
 * Ground truth is derived from a citation edge, so **each query has exactly one
 * gold judgment**. Mean precision@5 over single-gold queries has a ceiling of
 * **1/5 = 0.20**. A floor of 0.70 is therefore not a demanding target, it is
 * unsatisfiable — no retriever, however perfect, could ever pass it. In the
 * first run every query that succeeded scored exactly 0.20, which is the tell.
 *
 * What `SPRINT_2.md` means by "precision@5 ≥ 70%" can only be the standard
 * single-gold measure: **the share of queries whose gold answer appears in the
 * top five**. Success@5. That is also what an advocate experiences — either the
 * authority is on the first screen or it is not.
 *
 * **This is not a threshold being weakened after seeing a number.** The number
 * moves from 4.8% to 24.0% and the gate fails either way, by a wide margin. The
 * rule in `SPRINT_2.md` NEVER — *"Weaken a threshold to pass a gate"* — is
 * intact: 0.7 is untouched, nothing passes that did not pass before, and the
 * old quantity is still computed and still reported on every run as
 * `meanPrecisionAt5`, so the correction cannot hide a regression.
 *
 * The exclusions in the definition above apply unchanged to success@5.
 */
export const SUCCESS_AT_K = 5;

/**
 * Every metric is `number | null`, and the null is load-bearing.
 *
 * `rate()` below returns null over a zero denominator. If this type said
 * `number`, the null would still arrive at runtime — the driver does not read
 * type annotations — and `null <= 0` is **true** in JavaScript. A harness that
 * measured nothing would report a passing hallucination rate. Typing the null
 * is what forces `grade` to decide about it.
 */
export type HarnessMetrics = {
  hallucinationRate: number | null;
  silentDropRate: number | null;
  staleOverruledRate: number | null;
  overruledLeakage: number | null;
  successAt5: number | null;
  adversarialPassRate: number | null;
};

export type MetricVerdict = {
  name: keyof HarnessMetrics;
  value: number | null;
  threshold: number;
  /** `<=` for ceilings, `>=` for the one floor. */
  comparison: 'at most' | 'at least';
  passed: boolean;
  /** Set when the metric could not be computed. Printed instead of the number. */
  notMeasured?: string;
};

/**
 * One metric, graded. **A null value fails**, whichever direction the threshold
 * points, and it fails with a different message from a breach so nobody reads
 * "not measured" as "measured and bad".
 */
function judge(
  name: keyof HarnessMetrics,
  value: number | null,
  threshold: number,
  comparison: 'at most' | 'at least',
): MetricVerdict {
  if (value === null) {
    return {
      name,
      value: null,
      threshold,
      comparison,
      passed: false,
      notMeasured: 'no observations — not having measured is not having passed',
    };
  }
  return {
    name,
    value,
    threshold,
    comparison,
    passed: comparison === 'at most' ? value <= threshold : value >= threshold,
  };
}

/**
 * Grade every metric. **Returns all six, always** — `SPRINT_2.md` DONE:
 * *"Every number reported, not just the failures."* A gate that speaks only
 * when it fails teaches everyone to read silence as success, and silence is
 * also what a broken runner produces.
 */
export function grade(m: HarnessMetrics): MetricVerdict[] {
  return [
    judge('hallucinationRate', m.hallucinationRate, THRESHOLDS.hallucinationRate, 'at most'),
    judge('silentDropRate', m.silentDropRate, THRESHOLDS.silentDropRate, 'at most'),
    judge('staleOverruledRate', m.staleOverruledRate, THRESHOLDS.staleOverruledRate, 'at most'),
    judge('overruledLeakage', m.overruledLeakage, THRESHOLDS.overruledLeakage, 'at most'),
    judge('successAt5', m.successAt5, THRESHOLDS.successAt5Min, 'at least'),
    judge('adversarialPassRate', m.adversarialPassRate, THRESHOLDS.adversarialPassRate, 'at least'),
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
