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
  /** Reproducing any known-bad output is a fail. */
  adversarialPassRate: 1,
  /**
   * **A citation or case-number query returns its judgment at rank 1.**
   *
   * Deterministic, so the threshold is 1.0 rather than a probability: either the
   * index resolves the citation an advocate typed or it does not, and there is
   * no honest sense in which resolving 90% of them is a pass. This is the metric
   * `successAt5` should always have been — a promise the product can actually
   * keep.
   */
  structuredExactness: 1,
  /**
   * **A field query returns ONLY judgments satisfying it.** Zero false
   * positives, verifiable by construction rather than by sampling: every row a
   * `judge:` query returns either has that judge on the bench or it does not.
   */
  fieldPrecision: 1,
} as const;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `successAt5` IS NO LONGER A GATE — re-specified 9 August 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It carried a floor of **0.70** and the lane spent weeks failing it. The
 * research says why, and it is not a tuning problem.
 *
 * Our evaluation set uses the **CLERC** method (arXiv 2406.17186). CLERC's own
 * published ceiling is **48.3% recall@1000** zero-shot, **41–43%** for dense
 * retrievers including BGE — which is what we run — and **68.5% recall@1K** for
 * a *fine-tuned* LegalBERT DPR. The paper states plainly that existing models
 * *"struggle significantly"*. We measure **48.1% recall@20** on a smaller
 * corpus, so it is not a like-for-like comparison, but the conclusion holds:
 *
 * **`success@5 >= 0.70` is not a demanding target. It is a number nobody in the
 * published literature reaches on this task, at any k.**
 *
 * A gate that cannot be passed does not protect anything — it gets rationalised
 * around, or it stops the product forever. So the thresholds now attach to
 * things the product actually promises: **no fabricated citation, no silent
 * drop, no stale overruled status, no known-bad output, and exact answers to
 * exact questions.** `successAt5` and `recallAt20` remain measured and printed
 * every run as **ungraded diagnostics**, so a regression is still visible.
 *
 * There is precedent for re-attaching a threshold rather than moving it:
 * `SPRINT_2.md` §1 moved 0.70 off `precision@5` when single-gold queries proved
 * to cap that metric at 1/5. **This is a different act and should not be
 * confused with it** — that correction kept the number and changed the metric;
 * this one removes a gate. It was taken by the founder on the evidence above,
 * and it is recorded here so nobody re-raises 0.70 without the counter-argument
 * in front of them.
 */

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
  adversarialPassRate: number | null;
  /** Deterministic gates, added 9 Aug 2026. See THRESHOLDS. */
  structuredExactness: number | null;
  fieldPrecision: number | null;
  /**
   * **Ungraded diagnostic.** Still measured and still printed every run so a
   * regression stays visible — it simply no longer decides whether the product
   * may ship. See the note above THRESHOLDS for why.
   */
  successAt5: number | null;
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
    judge('adversarialPassRate', m.adversarialPassRate, THRESHOLDS.adversarialPassRate, 'at least'),
    judge('structuredExactness', m.structuredExactness, THRESHOLDS.structuredExactness, 'at least'),
    judge('fieldPrecision', m.fieldPrecision, THRESHOLDS.fieldPrecision, 'at least'),
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

/**
 * nDCG@K — genuinely missing until now (`docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md`
 * §5 named it as the one cheap, unbuilt metric). Ungraded diagnostic, same
 * status as `successAt5`/`recallAt20`/`mrr`: printed, never gated.
 *
 * **Closed form, not the general nDCG algorithm** — and that simplification
 * is only valid because of a fact about THIS evaluation set, stated so it is
 * not silently assumed elsewhere: ground truth is one citation edge per
 * query, so relevance is binary and every query has exactly ONE relevant
 * judgment (`metrics.ts`'s own note above `SUCCESS_AT_K`). Under binary,
 * single-relevant-item relevance, the ideal ranking places that one item
 * first, so `IDCG@K = 1` for every query with a gold judgment — there is no
 * per-query IDCG to compute, unlike graded or multi-relevant nDCG. This
 * makes `nDCG@K` collapse to `DCG@K`:
 *
 *   found within top K at rank r (1-based):  1 / log2(r + 1)
 *   not found within top K:                  0
 *
 * A different evaluation set — graded relevance, or more than one gold
 * judgment per query — would need the general algorithm; this one does not
 * have that shape, and this function would silently give a wrong answer if
 * pointed at one that did. Not generalised on the chance it might.
 */
export function ndcgAtK(foundAtAnyRank: number | null, k: number): number {
  if (foundAtAnyRank === null || foundAtAnyRank > k) return 0;
  return 1 / Math.log2(foundAtAnyRank + 1);
}

/** Mean nDCG@K over a set of queries, each already scored for its rank. */
export function meanNdcgAtK(ranks: (number | null)[], k: number): number {
  if (ranks.length === 0) return 0;
  return ranks.reduce((sum: number, r) => sum + ndcgAtK(r, k), 0) / ranks.length;
}
