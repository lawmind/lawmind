import type { CorpusFreshness, CorpusFreshnessObject } from '../../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE COVERAGE SCREEN MAY SAY ABOUT FRESHNESS. THE ONLY PLACE IT IS
 * DECIDED. Founder design D-5; NEW3 R16 `R16-RCC-03`.
 *
 * ── QUOTE BOTH LAGS OR NEITHER ──────────────────────────────────────────────
 *
 * `docs/product/V1_CAPABILITY_REGISTRY_R15.json` states this as a RULE and not
 * a preference, and D-5 calls a single lag "the single most misleading number in
 * the product". It is worth being precise about why, because the misleading
 * number is TRUE:
 *
 *   `naive.lagDays`         `max(judgment_date)` — the newest ROW we hold.
 *   `legalCurrency.lagDays` the newest MONTH at or above 60% of a trailing
 *                           baseline — the newest month we can actually search.
 *
 * On 25 August 2026 those read 8 and 56. August held 480 judgments against a
 * 117,332/month baseline: a newest date, and no coverage. An advocate reading "8
 * days behind" would conclude last month's judgment is probably in here. It is
 * not, and they would find that out in court.
 *
 * So the pair is atomic. Either both numbers render, labelled and adjacent, or
 * NEITHER renders and the screen says it cannot state a currency.
 *
 * ── FAILURE TO OBSERVE IS NEVER "UP TO DATE" ────────────────────────────────
 *
 * NEW3 R16 names this directly. Every path out of this module that is not
 * `both` says what is missing. There is no state here that means "fine" by
 * omission, and there is no default, fallback or optimistic value anywhere in
 * the file — a request that failed produces `unavailable`, and a measurement
 * that could not be taken produces `unmeasured`.
 *
 * ── NO SLA, AND NO PROMISE ABOUT TOMORROW ───────────────────────────────────
 *
 * D-5: "A freshness observation is not a promise about tomorrow, and must not be
 * shaped like one." Nothing here returns a rate, a cadence, an expected time, or
 * a direction of travel. It returns what was measured and when.
 *
 * ── THIS IS OUR OWN UNCERTAINTY, NEVER THE LAW MOVING ───────────────────────
 *
 * Amber `#B4690E` is reserved for `overruledStatus`. Nothing in this module or
 * its screen carries a colour; a corpus gap is a fact about us.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** How current the law we hold is, in the only forms we may state it. */
export type FreshnessStatement =
  /**
   * BOTH LAGS, TOGETHER. The only state that quotes a number of days.
   * `naiveLagDays` is carried so it can be shown LOSING to the honest one —
   * hiding it would leave an advocate to recompute it themselves and believe it.
   */
  | {
      kind: 'both';
      naiveLagDays: number;
      naiveNewestDate: string | null;
      currencyLagDays: number;
      currencyAsOf: string | null;
      frontierMonth: string | null;
    }
  /**
   * WE HOLD JUDGMENTS BUT CANNOT STATE A CURRENCY. Reached when either half of
   * the pair is null — most importantly when NO month clears the baseline floor,
   * which is a real and reportable condition and is the opposite of current.
   */
  | { kind: 'unmeasured'; naiveNewestDate: string | null; why: string }
  /** The request did not come back. Says so, and claims nothing else. */
  | { kind: 'unavailable'; reason: string };

/**
 * Derives the statement from the route's response.
 *
 * TOTAL, AND DELIBERATELY SO. There is no branch that returns undefined and no
 * caller that has to decide what a missing value means — the whole point of a
 * single decision site is that the screen renders a state rather than composing
 * one.
 */
export function freshnessStatement(freshness: CorpusFreshness): FreshnessStatement {
  const naiveLagDays = freshness.naive.lagDays;
  const currencyLagDays = freshness.legalCurrency.lagDays;

  /**
   * BOTH, OR NEITHER. Written as one condition rather than two guards so the
   * rule cannot be half-satisfied by a later edit — there is no path in this
   * function that reaches a lag number without the other beside it.
   */
  if (naiveLagDays === null || currencyLagDays === null) {
    return {
      kind: 'unmeasured',
      naiveNewestDate: freshness.naive.newestJudgmentDate,
      why:
        currencyLagDays === null
          ? 'No recent month is complete enough for us to say how current this is.'
          : 'We hold no dated judgment to measure against.',
    };
  }

  return {
    kind: 'both',
    naiveLagDays,
    naiveNewestDate: freshness.naive.newestJudgmentDate,
    currencyLagDays,
    currencyAsOf: freshness.legalCurrency.dataAsOf,
    frontierMonth: freshness.legalCurrency.honestFrontierMonth,
  };
}

/** How far behind the SOURCE we are — a different question, separately answered. */
export type UpstreamStatement =
  | {
      kind: 'measured';
      measuredAt: string;
      /** Null is rendered as "not stated", never as zero. */
      sourceLagDays: number | null;
      completeness: number | null;
      /** Documents the SOURCE would not serve. Not our gap and not recoverable by us. */
      sourceUnavailableCount: number;
    }
  | { kind: 'unavailable'; reason: string };

export function upstreamStatement(observation: CorpusFreshnessObject): UpstreamStatement {
  return {
    kind: 'measured',
    measuredAt: observation.upstreamMeasuredAt,
    sourceLagDays: observation.sourceLagDays,
    completeness: observation.upstreamLocalCompleteness,
    sourceUnavailableCount: observation.sourceUnavailableCount,
  };
}

/**
 * "1 day" / "29 days". Plural handled because "1 days behind" on a screen about
 * precision is the kind of detail that costs the sentence its authority.
 */
export function describeDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * "July 2026" from `2026-07-01`. Returns the input unchanged when it is not the
 * shape we expect, rather than throwing or printing a wrong month — a month
 * label is not worth taking a settings screen down for.
 */
export function describeMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "31 July 2026". Never a raw ISO string on screen — `CoverageScreen`'s rule. */
export function describeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * "96.97%". Two decimals, matching `CoverageScreen`'s existing percentage, and
 * never rounded up to a flat 97% — the gap is the point of the number.
 */
export function describeCompleteness(share: number): string {
  return `${(share * 100).toFixed(2)}%`;
}
