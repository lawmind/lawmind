/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RELEASE_CAPABILITIES_R8_3 — WHAT THIS BACKEND CLAIMS, AND WHAT IT REFUSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R8.3 §6, and the reason it is a release blocker rather than a nicety.
 *
 * A LIMITED V1 is not "the backend generally looks okay". It is a statement that
 * some capabilities are proven, some are narrowed, and some are OFF — and the
 * whole point of shipping one is that the OFF ones stay off while client work
 * proceeds against the proven ones. That only holds if the server enforces it.
 *
 * §6 states the failure directly: *"A disabled capability cannot become usable
 * because a client screen exists or a feature flag is stale."* Both halves of
 * that have already happened in this repository. A finished feature mounted by
 * no route shipped nothing; a saved-search feed reached a sparse path the search
 * route refused, because the refusal lived in one caller instead of in the
 * capability. So this file is the capability, and the routes ask it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS CODE AND NOT A ROW IN `platform_config`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `platform_config` already holds kill switches and flags and it is the right
 * place for an OPERATIONAL decision — "stop harvesting now", "close signups".
 * A release capability is not operational. It is a claim about what evidence
 * exists, it is versioned with the code that implements it, and it must be
 * identical on every replica the moment that code deploys.
 *
 * A DB-resident capability set can be stale relative to the binary, can differ
 * between a restored snapshot and production, and can be changed without a
 * commit — which is exactly the "stale feature flag" §6 names. This one moves
 * only by an edit, a review and a deploy, and `RELEASE_CAPABILITIES_VERSION` is
 * carried into the release manifest so a frozen candidate names the capability
 * set it was frozen with.
 *
 * The kill switches are still live and still win: a capability being ENABLED
 * here does not survive an operator turning it off. Enforcement is AND, never OR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR STATES, AND WHY NONE OF THEM IS A BOOLEAN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ENABLED               proven for LIMITED V1 within the stated scope.
 *   LIMITED               usable, and NARROWER than a reader would assume from
 *                         the name. The `reason` says how, and the narrowing is
 *                         enforced in the route, not in copy.
 *   DISABLED              the server refuses. Not hidden, not degraded — refused,
 *                         with a machine-readable reason a client can render.
 *   EXPERIMENTAL_INTERNAL the code path exists and may be exercised by a lane's
 *                         own harness. It is unreachable from any user route.
 *
 * `LIMITED` is the state that earns its keep. Collapsing it into ENABLED is how
 * "37.18% of statute references are linked" becomes "statute coverage", and
 * collapsing it into DISABLED throws away a capability advocates can use today.
 */

/**
 * Bump on ANY change to the set below.
 *
 * Recorded in the release manifest and returned on the wire, so "which
 * capability set was this candidate frozen with" is answerable by query rather
 * than by reading a commit log.
 */
export const RELEASE_CAPABILITIES_VERSION = 'RELEASE_CAPABILITIES_R8_3.2';

export type CapabilityState = 'ENABLED' | 'LIMITED' | 'DISABLED' | 'EXPERIMENTAL_INTERNAL';

export type Capability = {
  readonly state: CapabilityState;
  /**
   * Why it is in this state, in terms of EVIDENCE rather than intention.
   *
   * Read by FIFTH and eventually rendered to a client, so it names the measured
   * fact that would have to change, not a plan. "Gold V3 does not exist" is a
   * reason; "pending further work" is not.
   */
  readonly reason: string;
  /** When this state was last decided. */
  readonly asOf: string;
  /**
   * What would move it. Absent when nothing short of a product decision would.
   *
   * Deliberately separate from `reason`: an operator needs to know the state,
   * and a lane needs to know what to bring. Merging them produces a sentence
   * that does neither job.
   */
  readonly unblockedBy?: string;
};

/**
 * The capability names are a CONTRACT. RCC and NEW3 will branch on them, so a
 * rename is a breaking change and needs the version bump above.
 */
export type CapabilityName =
  // ── §5.1 exact / identity research ─────────────────────────────────────────
  | 'search.exact_identity'
  | 'search.structured_filters'
  | 'search.pagination'
  // ── §5.2 judgment reader / source evidence ─────────────────────────────────
  | 'judgment.reader'
  | 'judgment.exact_span'
  // ── §5.3 statutes ──────────────────────────────────────────────────────────
  | 'statute.lookup'
  | 'statute.linked_judgments'
  | 'statute.old_new_correspondence'
  // ── §5.4 matters / saved authorities ───────────────────────────────────────
  | 'matter.workspace'
  | 'matter.saved_authorities'
  | 'matter.briefing'
  // ── §5.5 currentness / treatment ───────────────────────────────────────────
  | 'treatment.resolved_signals'
  | 'treatment.good_law_claim'
  /* ── §5.6 broad semantic ───────────────────────────────────────────────────
   *
   * These names and states are NEW1's, taken verbatim from
   * `docs/ai/new1-r83/SEMANTIC_CAPABILITY_RELEASE_SCOPE_R8_3.md` §1, which it
   * published as paste-ready rows. Retyping them under my own names would have
   * produced TWO capability sets disagreeing about the same evidence, which is
   * the one thing §6 cannot survive — a client would branch on one and FIFTH
   * would verify the other. The lane that measured the evidence names the
   * capability; this file is where it becomes enforceable.
   */
  | 'search.semantic.broad'
  | 'search.semantic.supporting_authority'
  | 'search.semantic.adverse_authority'
  | 'search.semantic.counterarguments'
  | 'search.semantic.long_input'
  | 'search.semantic.abstention'
  | 'generation.evidence_from_passages'
  | 'generation.premium_jobs'
  // ── §5.7 / §5.8 ────────────────────────────────────────────────────────────
  | 'language.hindi'
  | 'court.ecourts_live'
  | 'court.cause_list_harvest';

const AS_OF = '2026-08-26';

export const RELEASE_CAPABILITIES: Readonly<Record<CapabilityName, Capability>> = {
  /* ── §5.1 EXACT / IDENTITY — the spine of a limited V1 ───────────────────── */
  'search.exact_identity': {
    state: 'LIMITED',
    reason:
      'Neutral citation, reporter citation, CNR, case number and case title resolve through an ' +
      'identity predicate rather than similarity. LIMITED, not ENABLED, because a UNIQUE claim is ' +
      'gated on three separate freshness checks and a citation implicated by any of them returns ' +
      'UNIQUE_UNCONFIRMED_STALE_INDEX — the candidate, without the word "only". Shared-neutral and ' +
      'common-order identity returns every reachable candidate and never a rank-1 pin.',
    asOf: AS_OF,
    unblockedBy: "FIFTH's identity battery after the pin repair and fixture purge (§5.1).",
  },
  'search.structured_filters': {
    state: 'ENABLED',
    reason:
      'Court, date, act and section filters are SQL predicates with a real COUNT(*) behind them. ' +
      'The structured path reports a true total; the hybrid path deliberately reports none.',
    asOf: AS_OF,
  },
  'search.pagination': {
    state: 'ENABLED',
    reason:
      'Continuation is total-ordered, so paging cannot skip a candidate, and hasMore is OBSERVED by ' +
      'over-fetching rather than inferred from a full page. A page failure is distinguishable from ' +
      'the corpus ending.',
    asOf: AS_OF,
  },

  /* ── §5.2 JUDGMENT READER ────────────────────────────────────────────────── */
  'judgment.reader': {
    state: 'LIMITED',
    reason:
      'The reader refuses body-derived evidence for a judgment whose body text is convicted damaged, ' +
      'exactly as retrieval does, and states the refusal as bodyText.evidenceWithheld rather than ' +
      'rendering an empty page. It is LIMITED and not ENABLED for a second, unclosed reason: the ' +
      'corpus holds text for documents whose original source artifact is not retained, so no surface ' +
      'may claim "verified from the retained official PDF", and high-confidence reporter/editorial ' +
      'text may not be presented as the court\'s own reasoning while the content-use question is open.',
    asOf: AS_OF,
    unblockedBy:
      'The content-use decision on reporter/editorial material, and retained-artifact state per document.',
  },
  'judgment.exact_span': {
    state: 'LIMITED',
    reason:
      'A verified character offset is returned only where one exists; it is null rather than clamped ' +
      'or guessed everywhere else. Coverage is partial and is not reported as complete.',
    asOf: AS_OF,
  },

  /* ── §5.3 STATUTES ───────────────────────────────────────────────────────── */
  'statute.lookup': {
    state: 'ENABLED',
    reason: '848 Acts and 36,480 sections are held and looked up deterministically.',
    asOf: AS_OF,
  },
  'statute.linked_judgments': {
    state: 'LIMITED',
    reason:
      '688,123 of 862,594 statute references are linked to a held Act — 79.77%, NOT complete ' +
      'coverage, and it must never be presented as such. The remaining 20.23% are references to Acts ' +
      'we do not hold or that no deterministic rule could pin safely.',
    asOf: AS_OF,
    unblockedBy:
      "FIFTH's independent stratified precision attack on the join, including alias/collision and " +
      'negative controls (§5.3, §7 Correction 7).',
  },
  'statute.old_new_correspondence': {
    state: 'DISABLED',
    reason:
      'BNS/BNSS/BSA-to-IPC/CrPC/Evidence correspondence is asserted only where official evidence is ' +
      'held for the mapping. It is not, corpus-wide, so the capability is off rather than partial: a ' +
      'wrong section correspondence is a wrong charge.',
    asOf: AS_OF,
    unblockedBy: 'Official correspondence tables ingested and verified per Act.',
  },

  /* ── §5.4 MATTERS ────────────────────────────────────────────────────────── */
  'matter.workspace': {
    state: 'ENABLED',
    reason: 'Tenant-isolated CRUD, timeline and matter state. No cross-user access path.',
    asOf: AS_OF,
    unblockedBy: "FIFTH's tenant-isolation battery (§5.4).",
  },
  'matter.saved_authorities': {
    state: 'ENABLED',
    reason:
      'Save and remove work against live treatment state, and set_aside refuses add-to-matter — ' +
      'the one case where the product declines to let an authority be used.',
    asOf: AS_OF,
  },
  'matter.briefing': {
    state: 'LIMITED',
    reason:
      'A briefing assembles held facts and live treatment state. It may NOT fabricate a semantic ' +
      'stance: its authority list and treatment checklist are rewritten from live rows at render, ' +
      'never served from the stored blob, and no part of it argues from a semantic candidate.',
    asOf: AS_OF,
  },

  /* ── §5.5 CURRENTNESS / TREATMENT ────────────────────────────────────────── */
  'treatment.resolved_signals': {
    state: 'LIMITED',
    reason:
      'Bounded semantics only: "no adverse signal found in resolved sources as of [date]". Citation ' +
      'resolution is not legal treatment, a treatment edge is not current legal status, and ' +
      'reporter-derived treatment stays attributed as reporter-derived. 95.62% of the edges behind a ' +
      'LAW MOVED mark are a reporter headnote rather than the later court\'s own words.',
    asOf: AS_OF,
  },
  'treatment.good_law_claim': {
    state: 'DISABLED',
    reason:
      'No generic "good law" guarantee and no "live/fresh law" claim. Source freshness is incomplete ' +
      'by measurement: the ingest fleet stopped 2026-08-19 19:56 and 40 of 53 upstream 2026 ' +
      'partitions have grown since, so max(judgment_date) is our walk\'s frontier and NOT the ' +
      "frontier of published law. \"Our ingest has not run for a week\" and \"the law is not " +
      'published yet" are different sentences and only one of them is true.',
    asOf: AS_OF,
    unblockedBy:
      'Source freshness decomposed and closed per source/court, and a resumed ingest walk (NEW2 §11).',
  },

  /* ── §5.6 BROAD SEMANTIC — NEW1's rows, enforced ─────────────────────────
   *
   * `EXPERIMENTAL_INTERNAL` rather than `DISABLED` for `broad`, and that is
   * NEW1's call rather than a softening of mine: the tranche and the bounded
   * HNSW exist and its own harness will exercise them. The two states differ in
   * INTENT and not in reach — `isUserReachable` is false for both, so no request
   * touches the dense arm either way.
   */
  'search.semantic.broad': {
    state: 'EXPERIMENTAL_INTERNAL',
    reason:
      'Route-reachable passage cond_s@5 is 0.3715, 95% CI [0.327, 0.444]; end-to-end s@5 is 0.0136; ' +
      'Gold V3 does not exist, so there is no set against which enabling this could be justified. ' +
      'The index and the 418,116-passage tranche are real and NEW1 may exercise them from its own ' +
      'harness; the dense arm is NOT run on a user request. Exact, structured and lexical retrieval ' +
      'are unaffected.',
    asOf: AS_OF,
    unblockedBy:
      'Gold V3 existing, AND a measured generation-evidence rate, AND a validated role policy (NEW1 §8).',
  },
  'search.semantic.supporting_authority': {
    state: 'DISABLED',
    reason:
      'c@1, c@5 and c@100 are all 0 over 6 tasks; c@500 is 0.3333. The authorities rank at 100-500, ' +
      'so this is a ranking failure at human-readable depth and not an absent representation. n=6 is ' +
      'small and is enough for DISABLED — a family that scores zero where a person reads is not ' +
      'rescued by a larger sample.',
    asOf: AS_OF,
    unblockedBy: 'A larger task set, then a reranker round — in that order.',
  },
  'search.semantic.adverse_authority': {
    state: 'DISABLED',
    reason:
      'c@5 is 0 over 4 tasks and reaches 0.50 only at depth 100+. An adverse authority found at ' +
      'depth 100 is an adverse authority the advocate never saw.',
    asOf: AS_OF,
    unblockedBy: 'A larger task set, then a reranker round.',
  },
  'search.semantic.counterarguments': {
    state: 'DISABLED',
    reason:
      'Derived from supporting_authority and adverse_authority, both of which are zero at served ' +
      'depth. The adverse authority that would change the argument is exactly the one that did not ' +
      'get ranked.',
    asOf: AS_OF,
    unblockedBy: 'The two rows it derives from.',
  },
  'search.semantic.long_input': {
    state: 'LIMITED',
    reason:
      'Over 500 characters is a guided REFUSAL family, never a silent truncation. A shortened query ' +
      'returns results about a question the advocate did not ask. LIMITED rather than DISABLED ' +
      'because the refusal is the correct behaviour and is served, not a stopgap: the route answers, ' +
      'and what it answers is "not this shape, and here is why".',
    asOf: AS_OF,
  },
  'search.semantic.abstention': {
    state: 'DISABLED',
    reason:
      'NOT_DEPLOYABLE. Absolute-similarity abstention is a measured SIGNAL failure, not an untuned ' +
      'threshold, so no cut-off exists that would make it safe. An abstention failure must never be ' +
      'promoted to a confidence.',
    asOf: AS_OF,
    unblockedBy: 'A different feature set. Not a wider grid, and not a re-tuned threshold.',
  },
  'generation.evidence_from_passages': {
    state: 'DISABLED',
    reason:
      'Generation-evidence eligibility is NOT_MEASURED: the rhetorical role is not on the wire, so ' +
      'the server cannot yet say what share of served evidence is court-authored text a proposition ' +
      'may rest on. High-confidence reporter/editorial text may not support a generated legal ' +
      'proposition while that is unmeasured and the content-use question is open.',
    asOf: AS_OF,
    unblockedBy:
      "NEW1's bounded experiment, role on the wire, and FIFTH's precision measurement of the role labels.",
  },
  'generation.premium_jobs': {
    state: 'DISABLED',
    reason:
      'Premium generation is not required for LIMITED V1 (§5.4) and every generation route depends on ' +
      'a semantic evidence set that is off. Separately, the countersigned DPA owed before ' +
      'sensitive-class routing is not held.',
    asOf: AS_OF,
    unblockedBy: 'The countersigned DPA, and the generation-evidence capabilities above.',
  },

  /* ── §5.7 / §5.8 ─────────────────────────────────────────────────────────── */
  'language.hindi': {
    state: 'DISABLED',
    reason:
      'Corpus language metadata is not trustworthy enough to support a Hindi capability claim. ' +
      'Devanagari retention through extraction is separately unproven — a zero defect count and a ' +
      'zero script count are the same number.',
    asOf: AS_OF,
    unblockedBy: 'Language metadata validated per source, and script retention measured.',
  },
  'court.ecourts_live': {
    state: 'DISABLED',
    reason:
      'Authorization is settled and unexpired; ACTIVATION is not. Turning this on requires the ' +
      "grant's exact operational conditions transcribed into the repo and real observations against " +
      'them. The kill switch ecourts_harvest is OFF and its stored reason says the same.',
    asOf: AS_OF,
    unblockedBy: "The registrar's stated conditions in-repo, and a rate/ledger observation run.",
  },
  'court.cause_list_harvest': {
    state: 'DISABLED',
    reason:
      'Bulk cause-list harvesting is off for the same activation reason. Tier 3 per-citation ' +
      'confirmation is unchanged and unaffected: it is a human solving the CAPTCHA and vouching, and ' +
      'citations/verify.ts holds no HTTP client.',
    asOf: AS_OF,
    unblockedBy: 'court.ecourts_live.',
  },
};

/** The state of one capability. Unknown names cannot occur — the type forbids them. */
export function capabilityState(name: CapabilityName): CapabilityState {
  return RELEASE_CAPABILITIES[name].state;
}

/**
 * May a user-facing route do this?
 *
 * `EXPERIMENTAL_INTERNAL` returns FALSE, which is the whole reason that state
 * exists as something other than a synonym for ENABLED: a lane's harness may
 * import the code path directly, and no request may reach it.
 */
export function isUserReachable(name: CapabilityName): boolean {
  const state = RELEASE_CAPABILITIES[name].state;
  return state === 'ENABLED' || state === 'LIMITED';
}

/**
 * The refusal payload for a disabled capability.
 *
 * A REFUSAL, deliberately, and not an empty result. An empty 200 renders as
 * "there is no law on this" on a phone — that is the exact defect
 * `retrievalOutcome` was built for — and a capability that is off must not be
 * indistinguishable from a capability that looked and found nothing.
 */
export function capabilityRefusal(name: CapabilityName) {
  const cap = RELEASE_CAPABILITIES[name];
  return {
    capability: name,
    state: cap.state,
    reason: cap.reason,
    asOf: cap.asOf,
    registryVersion: RELEASE_CAPABILITIES_VERSION,
    ...(cap.unblockedBy === undefined ? {} : { unblockedBy: cap.unblockedBy }),
  };
}

/** The whole set, for `GET /release/capabilities` and the release manifest. */
export function capabilityRegistry() {
  return {
    registryVersion: RELEASE_CAPABILITIES_VERSION,
    asOf: AS_OF,
    capabilities: RELEASE_CAPABILITIES,
  };
}
