/**
 * How fast to pull from a licensed source — start slow, earn speed, give it back
 * instantly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A CONTROLLER AND NOT A CONSTANT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A fixed delay is wrong in both directions. Too slow and a two-month extraction
 * becomes a two-year subscription at ₹50,000 a month — the rate limit is the
 * whole cost (`docs/SUPREME_TODAY_LICENCE.md` §8b). Too fast and we trip a limit
 * nobody told us about, on a service run by a company that is also our most
 * direct competitor, with a licence we intend to rely on.
 *
 * **We do not know their ceiling.** So the honest design is one that discovers
 * it without ever testing it aggressively: begin far below any plausible limit,
 * increase in small steps while the service is plainly healthy, and **retreat
 * immediately and hard at the first sign of strain.**
 *
 * That is AIMD — additive increase, multiplicative decrease — the control law
 * behind TCP congestion avoidance, for the same reason: it converges on a
 * capacity you were never told, and it is provably biased toward yielding.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUDGET IS NOT THE PACE, AND IT OUTRANKS IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A controller that only measures how the server *feels* will happily run at a
 * healthy pace straight through a contractual daily cap. So there are two
 * independent limits and the budget always wins:
 *
 * - **Pace** — adaptive, discovered, about not hurting them.
 * - **Budget** — fixed, contractual, about not breaching the agreement.
 *
 * `nextDelayMs` returns `null` when the budget is spent. **Null means stop, not
 * slow down**, and the caller must treat it that way.
 */

export type PaceLimits = {
  /** Where we begin. Deliberately timid: politeness is cheap on day one. */
  startIntervalMs: number;
  /** Never faster than this, however healthy the service looks. */
  floorIntervalMs: number;
  /** Never slower than this while still running — beyond it, stop and re-plan. */
  ceilingIntervalMs: number;
  /** Consecutive clean responses before the interval is allowed to shrink. */
  successesBeforeSpeedUp: number;
  /** Each speed-up removes this fraction of the current interval. */
  speedUpFactor: number;
  /** Each retreat multiplies the interval by this. Bigger than the speed-up. */
  slowDownFactor: number;
  /** Hard contractual caps. Reaching either stops the run. */
  maxRequestsPerDay: number;
  maxRequestsPerMonth: number;
};

/**
 * Defaults chosen to be defensible in a conversation with the licensor rather
 * than optimal: **one request every five seconds to start**, never faster than
 * one per second, and a retreat that costs four times what a speed-up gains.
 *
 * `maxRequestsPerDay` is deliberately a placeholder, not an estimate. **The
 * per-account ceiling is the single number to obtain before signing**
 * (`SUPREME_TODAY_LICENCE.md` §8b) and it must be set from the contract, never
 * guessed — an absent limit must never read as permission, which is the same
 * rule the eCourts grant conditions follow.
 */
export const DEFAULT_PACE: PaceLimits = {
  startIntervalMs: 5_000,
  floorIntervalMs: 1_000,
  ceilingIntervalMs: 120_000,
  successesBeforeSpeedUp: 20,
  speedUpFactor: 0.9,
  slowDownFactor: 2.0,
  maxRequestsPerDay: 1_000,
  maxRequestsPerMonth: 25_000,
};

/** What the last request told us about how the service is coping. */
export type Signal =
  | 'ok'
  /** 429, 503, or an explicit Retry-After. Unambiguous: back off. */
  | 'throttled'
  /** 5xx or a transport error. Treated as strain, not as our fault. */
  | 'error'
  /**
   * Succeeded, but slowly. The early warning that matters — a service under
   * load slows before it refuses, and a controller that waits for a 429 has
   * already spent the goodwill it was trying to protect.
   */
  | 'slow';

export type PaceState = {
  intervalMs: number;
  consecutiveOk: number;
  requestsToday: number;
  requestsThisMonth: number;
  /** Set once a retreat happens, and never fully forgotten — see `ceilingSeen`. */
  ceilingSeen: number | null;
};

export function initialState(limits: PaceLimits = DEFAULT_PACE): PaceState {
  return {
    intervalMs: limits.startIntervalMs,
    consecutiveOk: 0,
    requestsToday: 0,
    requestsThisMonth: 0,
    ceilingSeen: null,
  };
}

/**
 * Fold one response into the pace.
 *
 * **A retreat also records where we were when it happened.** Without that the
 * controller climbs back to the same wall and hits it again, forever — the
 * sawtooth that looks adaptive and is really a slow-motion loop. `ceilingSeen`
 * makes the next approach stop short of the last known limit.
 */
export function observe(
  state: PaceState,
  signal: Signal,
  limits: PaceLimits = DEFAULT_PACE,
): PaceState {
  const counted: PaceState = {
    ...state,
    requestsToday: state.requestsToday + 1,
    requestsThisMonth: state.requestsThisMonth + 1,
  };

  if (signal !== 'ok') {
    return {
      ...counted,
      consecutiveOk: 0,
      intervalMs: Math.min(limits.ceilingIntervalMs, counted.intervalMs * limits.slowDownFactor),
      // Remember the fastest pace that ever caused strain. Never forget it
      // downward: if we were already retreating, keep the slower memory.
      ceilingSeen:
        counted.ceilingSeen === null
          ? counted.intervalMs
          : Math.max(counted.ceilingSeen, counted.intervalMs),
    };
  }

  const consecutiveOk = counted.consecutiveOk + 1;
  if (consecutiveOk < limits.successesBeforeSpeedUp) {
    return { ...counted, consecutiveOk };
  }

  /**
   * Speed up — but never past a pace that has already caused strain.
   *
   * `ceilingSeen` is a soft wall rather than a hard one: we approach to 110% of
   * the interval that last hurt and stop. If their capacity genuinely improves,
   * a separate decision re-plans the run; a controller should not talk itself
   * into re-testing a known limit.
   */
  const softFloor =
    counted.ceilingSeen === null
      ? limits.floorIntervalMs
      : Math.max(limits.floorIntervalMs, counted.ceilingSeen * 1.1);

  return {
    ...counted,
    consecutiveOk: 0,
    intervalMs: Math.max(softFloor, counted.intervalMs * limits.speedUpFactor),
  };
}

/**
 * How long to wait before the next request — or **null, meaning stop**.
 *
 * Null is returned only for a spent budget, never for a slow pace. The
 * distinction is load-bearing: a caller that treats "wait longer" and "you are
 * done for today" the same will either stall forever or breach the cap.
 */
export function nextDelayMs(state: PaceState, limits: PaceLimits = DEFAULT_PACE): number | null {
  if (state.requestsToday >= limits.maxRequestsPerDay) return null;
  if (state.requestsThisMonth >= limits.maxRequestsPerMonth) return null;
  return Math.round(state.intervalMs);
}

/**
 * When the run at this pace would finish — the number that decides how many
 * months of licence fee to commit to.
 *
 * Returns null where the budget cannot complete it at all, which is itself the
 * answer: renegotiate the ceiling or cut the target.
 */
export function projectCompletion(
  remainingDocuments: number,
  state: PaceState,
  limits: PaceLimits = DEFAULT_PACE,
): { days: number; months: number } | null {
  if (remainingDocuments <= 0) return { days: 0, months: 0 };

  const perDayByPace = Math.floor(86_400_000 / Math.max(state.intervalMs, 1));
  const perDay = Math.min(perDayByPace, limits.maxRequestsPerDay);
  if (perDay <= 0) return null;

  const days = Math.ceil(remainingDocuments / perDay);
  // Billing is monthly, so a part-month costs a whole one. Round up.
  const months = Math.ceil((days * perDay) / limits.maxRequestsPerMonth);
  return { days, months: Math.max(months, Math.ceil(days / 30)) };
}
