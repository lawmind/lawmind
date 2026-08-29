/**
 * THE SIX MONITORING FIELDS — semantics frozen now, values null until earned.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY FREEZE A SHAPE THAT CARRIES NOTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ecourts_observation` holds **zero rows** and nothing in the tree writes to
 * it. Every one of these fields is therefore null or `never_attempted`, and will
 * be for as long as `USER_MONITORING_PRODUCT = DISABLED_NOT_READY`.
 *
 * They are published anyway because the frozen contract names them, and because
 * the meaning of each has to be settled while nothing depends on it. A field
 * whose semantics are decided on the day it first carries a value is a field
 * whose semantics are decided under pressure — and the pressure here runs one
 * way, towards implying we are watching a case when we are not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE THING THESE FIELDS MUST NEVER DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **`null` here means "we are not watching this", never "nothing has changed".**
 * An advocate who reads a monitoring block as a quiet all-clear and misses a
 * hearing has been harmed by our shape, not by their reading. The contract's
 * instruction to RCC is explicit: render these as *"you are keeping this date
 * yourself"*, never as *"monitoring is on"*, and **no polling frequency and no
 * SLA may appear anywhere in the client**, including onboarding copy, store
 * screenshots and marketing.
 *
 * `lastObservationOutcome` is the field most likely to be misread, so its
 * disabled value is `never_attempted` rather than null: null invites "unknown,
 * probably fine", and `never_attempted` cannot be read as a result.
 */

/** The five outcomes an observation attempt can have. Four are unreachable in v1. */
export type ObservationOutcome =
  /** No attempt has ever been made. The only value v1 emits. */
  | 'never_attempted'
  /** A listing was served, parsed, and written. */
  | 'observed'
  /** The source answered and published no listing for that day. NOT "no hearing". */
  | 'source_reported_none'
  /** We asked and could not interpret the answer. Never evidence of absence. */
  | 'unreadable'
  /** The request failed. Never evidence of absence. */
  | 'fetch_failed';

export type MonitoringFields = {
  /**
   * What we have UNDERTAKEN to do — not what we did. Null while no policy is
   * offered, because an advocate cannot be given a policy nobody priced.
   * `MONITORING_PRODUCT` monetisation is forbidden until capacity and retention
   * are measured, and both are unmeasured.
   */
  monitoringPolicy: null;
  /** When a court was last successfully OBSERVED for this matter. */
  lastObservedAt: null;
  /**
   * When the next observation is PLANNED. Null while nothing is scheduled.
   *
   * A date here is a commitment, so it may only ever be populated from a real
   * scheduler entry — never computed from a policy string, which would be a
   * promise derived from a description of a promise.
   */
  nextPlannedObservationAt: null;
  /**
   * WHICH source produced the last observation, in the five-dimension source-key
   * vocabulary — state, district, court complex, establishment, court, plus a
   * date and civil/criminal. **Never a bare court string**: "one court, one
   * request" was measured wrong by more than an order of magnitude, and a court
   * name cannot identify what was actually fetched.
   */
  observationSource: null;
  /** See {@link ObservationOutcome}. `never_attempted` is not a result. */
  lastObservationOutcome: ObservationOutcome;
  /**
   * Why monitoring is not currently doing what it says. Populated whenever the
   * product is enabled but degraded, so a silent degradation is impossible.
   *
   * Null in v1 because the product is not enabled at all — the honest statement
   * about a disabled capability is `available: false` with a reason, which
   * `POST /court/lookup` already returns, not a degradation note on a service
   * that is not running.
   */
  monitoringDegradedReason: null;
};

/**
 * The v1 answer, and the ONLY one this module can currently produce.
 *
 * It takes no arguments deliberately. A signature that accepted a matter id
 * would imply the answer varies per matter, and the first caller to see it vary
 * would be the first caller to believe monitoring exists.
 */
export function disabledMonitoringFields(): MonitoringFields {
  return {
    monitoringPolicy: null,
    lastObservedAt: null,
    nextPlannedObservationAt: null,
    observationSource: null,
    lastObservationOutcome: 'never_attempted',
    monitoringDegradedReason: null,
  };
}

/**
 * The product state, published beside the fields so a client never has to infer
 * it from six nulls.
 */
export const USER_MONITORING_PRODUCT = 'DISABLED_NOT_READY' as const;
