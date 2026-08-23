/**
 * The capability vocabulary — the only place a premium "thing you can do" is named.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE NAMES AND NOT PLAN NAMES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 owns the paywall, the plan names and the prices. None of those appear
 * here and none may. A capability is a VERB — a thing the advocate may do — and
 * a plan is a commercial bundle of verbs that marketing will rename twice before
 * launch. Naming the bundle in the schema means migrating the database when
 * somebody changes a word on a pricing page.
 *
 * The same reason rules out a `PRO` boolean. Two revenue models are live and the
 * founder has picked neither: a recurring subscription, and a one-off Hearing
 * Pack bought for one hearing. A boolean cannot express the second, and the
 * migration from boolean to capability happens after money is already flowing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `PROVISIONAL` IS A REAL STATE AND IT IS THE DEFAULT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These names come from the round brief's candidate list, and the brief says
 * plainly that they are *subject to NEW3 product spec*. So each carries its own
 * status: a `PROVISIONAL` capability is one the server can gate on and the
 * product has not confirmed. It is not a placeholder — the gate is real — but
 * nobody may quote it back as an agreed product surface.
 */

/**
 * `SAFETY_CRITICAL` capabilities can NEVER be gated.
 *
 * This is not a commercial decision and it is not NEW3's to reverse. Adverse
 * treatment of an authority — the LAW MOVED mark, `overruled_status`, a verified
 * later bench that set something aside — is the fact an advocate is humiliated in
 * open court for not knowing. Putting it behind a payment is selling somebody
 * their own professional risk back to them, and one occurrence of an advocate
 * filing on a set-aside authority *because they had not paid* is the same
 * company-ending event as a hallucinated citation.
 *
 * The type exists so that `requireCapability` can refuse to gate one, in code,
 * rather than relying on everyone remembering.
 */
export type CapabilityKind = 'PREMIUM' | 'SAFETY_CRITICAL';

export type CapabilityStatus = 'PROVISIONAL' | 'CONFIRMED';

export type CapabilityDef = {
  readonly name: string;
  readonly kind: CapabilityKind;
  readonly status: CapabilityStatus;
  /** How it may be held. Both are possible for the same capability. */
  readonly grantModels: readonly ('recurring' | 'credit')[];
  /** What it lets the advocate do, in the product's own terms. */
  readonly what: string;
  /**
   * The CHEAP signal a free user may see about it, if any.
   *
   * A contextual premium preview must never trigger the expensive computation it
   * is previewing — that is the whole point of the distinction. Where a
   * capability has no honestly cheap signal, this is null and the product shows
   * nothing rather than a fabricated number.
   */
  readonly cheapPreview: string | null;
};

export const CAPABILITIES = {
  matter_automation: {
    name: 'matter_automation',
    kind: 'PREMIUM',
    status: 'PROVISIONAL',
    grantModels: ['recurring'],
    what: 'Automatic upkeep of a matter — cause-list sync, timeline assembly, alerting.',
    cheapPreview: 'count of matter events already recorded, which is a stored count',
  },
  hearing_pack: {
    name: 'hearing_pack',
    kind: 'PREMIUM',
    status: 'PROVISIONAL',
    grantModels: ['recurring', 'credit'],
    what: 'A generated pack for one hearing: issues, authorities, counter-positions, risks.',
    cheapPreview:
      'counts derived from what is ALREADY held for the matter — authorities added, ' +
      'events recorded, verified adverse treatments found. No generation.',
  },
  counterargument_analysis: {
    name: 'counterargument_analysis',
    kind: 'PREMIUM',
    status: 'PROVISIONAL',
    grantModels: ['recurring', 'credit'],
    what: 'The other side of an argument, sourced to authorities rather than invented.',
    cheapPreview: null,
  },
  continuous_monitoring: {
    name: 'continuous_monitoring',
    kind: 'PREMIUM',
    status: 'PROVISIONAL',
    grantModels: ['recurring'],
    what: 'Standing watch on saved authorities and matters for new treatment.',
    /**
     * Deliberately null even though a count is trivially available.
     *
     * "3 of your authorities have movement" IS the product. Showing the number
     * to a non-subscriber gives away the answer and, worse, tells them there is
     * something wrong without telling them what — which is the anxious,
     * manipulative shape of preview this product will not ship.
     */
    cheapPreview: null,
  },
  premium_generation: {
    name: 'premium_generation',
    kind: 'PREMIUM',
    status: 'PROVISIONAL',
    grantModels: ['recurring', 'credit'],
    what: 'Long-form drafting beyond the free allowance.',
    cheapPreview: null,
  },
  /**
   * The one that is not for sale, present so that the ban is checkable.
   *
   * Nothing grants it and `requireCapability` refuses to gate it — see
   * `CapabilityKind`. It exists in this table so a future engineer adding a
   * paywall to the currentness surface hits a test rather than a launch.
   */
  adverse_treatment_visibility: {
    name: 'adverse_treatment_visibility',
    kind: 'SAFETY_CRITICAL',
    status: 'CONFIRMED',
    grantModels: [],
    what: 'Seeing that an authority has been overruled, doubted or set aside. Never gated.',
    cheapPreview: null,
  },
} as const satisfies Record<string, CapabilityDef>;

export type Capability = keyof typeof CAPABILITIES;

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

export function isCapability(name: string): name is Capability {
  return Object.hasOwn(CAPABILITIES, name);
}

/** True where gating this capability would withhold a safety fact. */
export function isSafetyCritical(name: Capability): boolean {
  return CAPABILITIES[name].kind === 'SAFETY_CRITICAL';
}
