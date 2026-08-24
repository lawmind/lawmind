/**
 * THE EVENT CONTRACT — P12 of the NEW3 product/premium/release round.
 *
 * Built BEFORE any paywall exists, per the round's own instruction: "Build
 * the event contract before optimizing paywalls." Nothing here fires yet —
 * no premium screen exists to fire it from. This is the shape every future
 * premium/activation screen must emit against, so instrumentation is not an
 * afterthought bolted onto a shipped paywall.
 *
 * TWO HARD RULES, both from the founder's orchestrator corrections:
 *
 * 1. NO CONFIDENTIAL CONTENT. No matter fact, client name, note, document
 *    text, search query string, or judgment content may appear in an event's
 *    properties — ever, by construction. `EventProps` below is a closed set
 *    of primitives and enums; there is no free-text field for a search query
 *    or a matter note to leak through. `scrub.ts` is the second, independent
 *    line of defence, not the first.
 * 2. NOT CONVERSION-ONLY. `subscription_cancelled` carries `cancelReason`
 *    and `premiumUsageBeforeCancel`; `refund` and `billing_failure` are
 *    first-class events. An experiment that lifts `purchase_completed` while
 *    driving up `refund` or `subscription_cancelled` is not a win — the
 *    round's own instruction — and that comparison is only possible if both
 *    sides are named events from day one.
 *
 * `ExperimentContext` is a property bag attachable to ANY event, not a
 * separate event type — "one user must stay in the same variant" is an
 * assignment-store invariant (`assignExperiment` below), not a per-event one.
 */

/** Attached to any event fired while the user is in a running experiment. Never invented locally — `experimentId`/`variant` always come from a server-issued assignment (`assignExperiment`), so two devices can never disagree about which arm a user is in. */
export type ExperimentContext = {
  experimentId: string;
  variant: string;
};

type Base = {
  /** ISO 8601, set by the client at fire time — never trusted from props. */
  at: string;
  experiment?: ExperimentContext;
};

/**
 * WHERE a paywall/preview was shown or a matter/authority action happened —
 * a closed enum, never a free-text screen name, so a typo can't silently
 * create a new, unaggregatable context bucket.
 */
export type PremiumContext =
  | 'after_matter_created'
  | 'after_authority_saved'
  | 'locked_insight_tapped'
  | 'second_matter_attempt'
  | 'hearing_prep_value'
  | 'matter_change_detected'
  | 'settings_upgrade_row';

/** Every event this contract knows about, and the properties it carries. Additive-only — a new event is a new key, never a repurposed one. */
export type AnalyticsEvent =
  // ---- activation funnel (correction #7 — measured BEFORE any paywall) ----
  | (Base & { name: 'onboarding_completed' })
  | (Base & { name: 'first_successful_search' })
  | (Base & { name: 'primary_authority_opened'; judgmentId: string })
  | (Base & { name: 'authority_saved'; judgmentId: string; matterId: string })
  | (Base & { name: 'matter_created'; matterId: string; ordinal: number })
  | (Base & { name: 'matter_specific_value_experienced'; matterId: string; kind: 'briefing' | 'authority_map' | 'counterarguments' })
  | (Base & { name: 'premium_intent_signalled'; context: PremiumContext })
  // ---- paywall / preview (P3–P6) ----
  | (Base & { name: 'paywall_impression'; context: PremiumContext })
  | (Base & { name: 'premium_preview_seen'; context: PremiumContext; costClass: 'cheap' | 'expensive' })
  | (Base & { name: 'premium_preview_opened'; context: PremiumContext })
  | (Base & { name: 'premium_outcome_generated'; kind: 'hearing_pack' | 'argument_map' | 'matter_scan'; costClass: 'cheap' | 'expensive' })
  | (Base & { name: 'premium_outcome_opened'; kind: 'hearing_pack' | 'argument_map' | 'matter_scan' })
  | (Base & { name: 'second_matter_attempt' })
  | (Base & { name: 'hearing_pack_preview' })
  // ---- purchase (P11, P7) ----
  | (Base & { name: 'purchase_started'; productId: string })
  | (Base & { name: 'purchase_completed'; productId: string })
  | (Base & { name: 'purchase_restored'; productId: string })
  | (Base & { name: 'hearing_pack_purchase'; productId: string })
  | (Base & { name: 'subscription_conversion'; productId: string; fromTrial: boolean })
  // ---- churn (P21) — first-class, never omitted from an experiment readout ----
  | (Base & { name: 'subscription_cancelled'; cancelReason: CancelReason; premiumUsageBeforeCancel: number })
  | (Base & { name: 'refund'; productId: string })
  | (Base & { name: 'billing_failure'; productId: string; reason: 'declined' | 'expired_card' | 'unknown' })
  | (Base & { name: 'winback_eligible' });

export type CancelReason =
  | 'too_expensive'
  | 'not_accurate_enough'
  | 'not_useful_enough'
  | 'missing_court_or_data'
  | 'only_needed_one_matter'
  | 'technical_problems'
  | 'other';

export type AnalyticsEventName = AnalyticsEvent['name'];
