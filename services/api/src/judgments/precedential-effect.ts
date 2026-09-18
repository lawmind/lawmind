/**
 * OD-14 — THREE LAYERS THAT WERE ONE COLUMN, SEPARATED PERMANENTLY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT, RE-MEASURED LIVE 21 AUG 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *     overruled_status   strongest verified edge   judgments
 *     ────────────────   ───────────────────────   ─────────
 *     set_aside          overruled                        73
 *     doubted            doubted                          17
 *     partly_set_aside   overruled_in_part                 8
 *
 * Not one row disagrees with its edge, and not one row lacks an edge. So the
 * evidence was never wrong — **73 judgments are labelled with an act that did
 * not happen to them**, because `overruled_status` had four values and no way
 * to say "overruled".
 *
 * Set aside and overruled are different acts:
 *
 *   * SET ASIDE — an appellate court undid THIS judgment in THIS case. The
 *     decision between the parties is gone.
 *   * OVERRULED — a later, usually larger bench held the PROPOSITION is no
 *     longer good law. The original decision between the original parties
 *     stands, and the judgment is frequently still citable for propositions the
 *     later court never reached.
 *
 * E.V. Chinnaiah was overruled by seven judges in *State of Punjab v. Davinder
 * Singh*. Nothing in Chinnaiah's own case was set aside. Lawmind currently
 * refuses to let an advocate add it to a matter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE LAYERS, AND WHY COLLAPSING ANY TWO OF THEM CAUSED THIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. VERIFIED TREATMENT EDGE — `judgment_citations.relationship` plus the
 *      phrase in `evidence`. What a later court DID. Source of truth, seven
 *      values, already correct, never written by this module.
 *
 *   2. DERIVED PRECEDENTIAL EFFECT — what that act means for whether this
 *      authority is still good law. DERIVED, never stored, on the same
 *      reasoning `CITATION_HARNESS.md` gives for `overruled_status` itself:
 *      verification is permanent, good-law status is not.
 *
 *   3. PRODUCT POLICY — the banner, the add-to-matter refusal, the ranking
 *      treatment. A decision about what Lawmind DOES, which can be revised
 *      three times without any of the evidence changing.
 *
 * Layer 3 reached down and rewrote layer 1's word. `set_aside` was chosen for
 * an overruling **because set_aside was the value that produced the strongest
 * warning**, and the strongest warning was what an overruling deserved. The
 * behaviour was right and it was bought by writing down something untrue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE CHANGES, AND THE THREE THINGS IT DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CHANGES: the add-to-matter refusal now keys on the EFFECT, so an overruled
 * authority whose own decision was never disturbed can be relied on again.
 *
 * DOES NOT weaken any warning. `bannerStatus` for an overruling is still
 * `set_aside`, the strongest class, and LAW MOVED still renders. A warning is
 * the one thing that must never be traded for correctness of a label.
 *
 * DOES NOT widen the wire enum. `apps/mobile/src/api/contract.ts` types
 * `OverruledStatus` as exactly four values and switches on them exhaustively; a
 * fifth value arriving at a client that has never seen it renders **an
 * overruled judgment with no mark at all**, which `CLAUDE.md` rates as severe
 * as a hallucination. The true word ships ADDITIVELY as `precedentialEffect`
 * alongside the unchanged field, and RCC adopts it when they are ready.
 *
 * DOES NOT store anything. No column, no backfill, no ALTER on an 18.7M-row
 * table that four live writers never let go quiet. The effect is a function of
 * the edge and the stored status, both of which are already read on every
 * render.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNKNOWN STAYS UNKNOWN, AND UNKNOWN STILL REFUSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `review_required` is returned whenever a stored adverse status cannot be
 * explained by a verified edge in a way this module recognises. It is not
 * guessed into the nearest neighbour.
 *
 * Its POLICY is nevertheless `refuse`, and the two are not in tension: the
 * classification is honest about not knowing, and the product is conservative
 * about acting on not knowing. A stored strongest-class status this module
 * cannot account for is exactly the case where quietly becoming addable would
 * be the dangerous direction.
 */

/** Layer 1. The relationship vocabulary `judgment_citations` actually carries. */
export type TreatmentRelationship =
  | 'cites'
  | 'followed'
  | 'distinguished'
  | 'overruled'
  | 'overruled_in_part'
  | 'approved'
  | 'doubted';

/** The four wire values. Unchanged, and this module never adds a fifth. */
export type OverruledStatus = 'none' | 'set_aside' | 'partly_set_aside' | 'doubted';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A FOURTH LAYER: WHO SAYS SO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The three layers above answer *what happened* and *what it means*. They do not
 * answer **who we heard it from**, and until 25 Aug 2026 nothing in production
 * did — `judgment_citations.treatment_provenance` was written by NEW2 and read
 * by nobody, which R4 recorded as `PROVEN_BY_LIVE_DB` storage and `FALSE`
 * consumption.
 *
 * It matters because the corpus is not what anyone assumed. NEW2 hand-read every
 * one of the 137 edges that drive a LAW MOVED badge:
 *
 *     REPORTER_EDITORIAL_ANNOTATION   131   (95.62%)
 *     COURT_REASONING_EXPLICIT          5   ( 3.65%)
 *     MODALITY_DEFECT                   1
 *
 * So the overwhelming majority of what Lawmind shows as "the law has moved" is a
 * **law reporter's headnote saying a later court overruled this**, not the later
 * court's own words. Both are useful. They are not the same claim, and saying
 * the second when we only have the first is exactly the overstatement that ends
 * a legal product.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES **NOT** DO — READ THIS BEFORE "SIMPLIFYING" IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It does not remove a single warning. If reporter evidence were demoted out of
 * the badge, 98 LAW MOVED marks would become 5, and an advocate would file on 93
 * authorities a reporter has recorded as overruled. **That is a catastrophic
 * direction to move in and it is not what "provenance-aware" means here.**
 *
 * `bannerStatus` and `addToMatter` are therefore UNCHANGED for reporter-derived
 * and unknown-provenance treatment. What changes is that the wire now carries
 * WHO said it, so the wording can be honest — "reported as overruled" rather
 * than "the Supreme Court held" — and so the admin monitor can see the split.
 *
 * The ONE behaviour that does change is `MODALITY_DEFECT`, and only in the
 * direction of not making a claim: see `attributionOf` below.
 */
export type TreatmentProvenance =
  'COURT_REASONING_EXPLICIT' | 'REPORTER_EDITORIAL_ANNOTATION' | 'MODALITY_DEFECT';

export type TreatmentAttribution =
  /** The later court's own reasoning. The only class that may be stated as a holding. */
  | 'COURT'
  /** A law reporter's editorial note. Shown, and shown AS a reported signal. */
  | 'REPORTER'
  /** The evidence is known-broken. Never the basis of a claim about the law. */
  | 'DEFECTIVE'
  /** Nobody has classified it. Unknown is not reporter and it is not court. */
  | 'UNKNOWN';

/** One inbound adverse edge, with the provenance that was previously discarded. */
export type TreatmentEdge = {
  relationship: string;
  /** `null` means unclassified — 4,403 edges today. Never read as "court". */
  provenance: TreatmentProvenance | null;
};

const ATTRIBUTION_FOR: Readonly<Record<TreatmentProvenance, TreatmentAttribution>> = {
  COURT_REASONING_EXPLICIT: 'COURT',
  REPORTER_EDITORIAL_ANNOTATION: 'REPORTER',
  MODALITY_DEFECT: 'DEFECTIVE',
};

/**
 * The strongest ATTRIBUTION among the edges behind a treatment.
 *
 * "Strongest" is COURT > REPORTER > UNKNOWN > DEFECTIVE, and the ordering is the
 * whole design:
 *
 *   * COURT wins because one edge carrying the later court's own reasoning is
 *     enough to state the holding, whatever else is also present.
 *   * DEFECTIVE ranks LAST, not first. A broken edge alongside a good one does
 *     not poison the good one — it is simply the least useful thing we hold.
 *     Only when it is ALL we hold does it decide the answer, and then it decides
 *     it as `DEFECTIVE`, which claims nothing.
 *   * UNKNOWN sits above DEFECTIVE and below REPORTER. It is not evidence, but
 *     it is not known-broken either, and collapsing the two would either
 *     manufacture confidence or destroy 4,403 edges' worth of signal.
 *
 * An empty list is `UNKNOWN`, never `COURT`. Absence of evidence is the thing
 * this file exists to stop reading as evidence.
 */
const ATTRIBUTION_RANK: Readonly<Record<TreatmentAttribution, number>> = {
  COURT: 1,
  REPORTER: 2,
  UNKNOWN: 3,
  DEFECTIVE: 4,
};

export function attributionOf(edges: readonly TreatmentEdge[]): TreatmentAttribution {
  const adverse = edges.filter((e) => EDGE_RANK[e.relationship] !== undefined);
  if (adverse.length === 0) return 'UNKNOWN';
  let best: TreatmentAttribution = 'DEFECTIVE';
  for (const e of adverse) {
    const a = e.provenance === null ? 'UNKNOWN' : (ATTRIBUTION_FOR[e.provenance] ?? 'UNKNOWN');
    if (ATTRIBUTION_RANK[a] < ATTRIBUTION_RANK[best]) best = a;
  }
  return best;
}

/**
 * May this treatment be worded as something the later COURT held?
 *
 * Only `COURT`. Everything else is reported, unclassified, or broken, and the
 * copy has to say so — `CLAUDE.md`: copy is licence protection, not an audit.
 * This governs WORDING only; it never governs whether the warning appears.
 */
export function mayStateAsHolding(attribution: TreatmentAttribution): boolean {
  return attribution === 'COURT';
}

/**
 * Edges that may DRIVE a currentness determination.
 *
 * `MODALITY_DEFECT` is excluded, and this is the one place provenance changes
 * behaviour rather than wording. The class exists because NEW2 found a 1985
 * DISSENT saying an authority *"is sought to be overruled by the judgment
 * proposed to be delivered by my learned Brother"* stored as `overruled` — and
 * it is the sole driver of a live `set_aside`. Polarity is right and mood is
 * wrong: nothing was overruled, somebody proposed to overrule.
 *
 * A defective edge is therefore not evidence of anything and cannot propagate.
 * It is still RETURNED and still visible; it just cannot make a claim.
 */
export function edgesThatMayDrive(edges: readonly TreatmentEdge[]): TreatmentEdge[] {
  return edges.filter((e) => e.provenance !== 'MODALITY_DEFECT');
}

/**
 * Layer 2. What the act means for this authority's standing.
 *
 * `set_aside` and `partly_set_aside` are about THIS case. `overruled` and
 * `overruled_in_part` are about the PROPOSITION. `doubted` is a later court
 * expressing reservation without deciding. They are five different facts and
 * this is the first type in the codebase that can hold all five.
 */
export type PrecedentialEffect =
  | 'none'
  | 'overruled'
  | 'overruled_in_part'
  | 'set_aside'
  | 'partly_set_aside'
  | 'doubted'
  | 'review_required'
  /**
   * The stored adverse status has NO usable evidence behind it — every adverse
   * edge is a `MODALITY_DEFECT`, which NEW2 adjudicated as *not a treatment at
   * all*.
   *
   * DISTINCT FROM `review_required`, and the distinction is the whole point.
   * `review_required` means "a later court may have done something and we cannot
   * confirm what" — genuine ambiguity, and refusing is the cautious side.
   * `evidence_defect` means "we recorded something that was never a change of
   * status", which is a fact about OUR PARSER and not a fact about the law.
   *
   * The live instance is *Divisional Personnel Officer, Southern Railway v.
   * T. R. Challappan*, 1975 INSC 212 — one adverse edge, and its evidence is
   * Tulsiram Patel's DISSENT saying the case "is sought to be overruled by the
   * judgment proposed to be delivered by my learned Brother". A subjunctive. The
   * mood was read as a holding.
   *
   * A defect in our own parsing must SUBTRACT a warning, never ADD a prohibition.
   * Refusing here told an advocate on a departmental-penalty-after-acquittal
   * matter that the leading authority on it could not be saved, because of a
   * verb's mood in a 1985 dissent. NEW3's 10-matter regression caught it four
   * hours after it shipped.
   */
  | 'evidence_defect';

/** Layer 3. What the product does, and nothing about what happened. */
export type PrecedentialPolicy = {
  /** The one refusal in the product. Now keyed on the act, not on the label. */
  addToMatter: 'allow' | 'refuse';
  /** Which of the four wire values RCC receives. Never a fifth. */
  bannerStatus: OverruledStatus;
  /**
   * Whether the authority may still be cited for propositions the later court
   * did not reach. False for a judgment whose own decision was undone.
   */
  citableForUntouchedPropositions: boolean;
  /** Why, in one clause, for the refusal message and the admin monitor. */
  because: string;
};

/**
 * Evidence → effect. Only relationships that ARE a change in standing appear.
 *
 * `cites`, `followed`, `approved` and `distinguished` are absent on purpose.
 * Distinguishing is not adverse treatment — a court declining to apply an
 * authority to different facts leaves it entirely intact — and a lookup that
 * mapped it to anything would be the same category error this module exists to
 * undo. Absent from a lookup is a refusal the type system can see.
 */
const EFFECT_FOR_EDGE: Readonly<Partial<Record<TreatmentRelationship, PrecedentialEffect>>> = {
  overruled: 'overruled',
  overruled_in_part: 'overruled_in_part',
  doubted: 'doubted',
};

/** Strongest first, so a judgment treated twice takes the graver reading. */
const EDGE_RANK: Readonly<Record<string, number>> = {
  overruled: 1,
  overruled_in_part: 2,
  doubted: 3,
};

/**
 * The strongest verified edge among those that change standing, or null.
 *
 * Exported so a caller reading edges for another reason can rank them the same
 * way rather than reimplementing the order — `propagate-treatment.ts` has its
 * own copy of this ordering in SQL and the two must not drift.
 */
export function strongestTreatment(relationships: readonly string[]): TreatmentRelationship | null {
  let best: string | null = null;
  for (const r of relationships) {
    if (EDGE_RANK[r] === undefined) continue;
    if (best === null || EDGE_RANK[r]! < EDGE_RANK[best]!) best = r;
  }
  return (best as TreatmentRelationship | null) ?? null;
}

/**
 * Layer 1 + the stored status → layer 2.
 *
 * The stored status is an INPUT and not an override, because the two sources
 * answer different questions and both are real:
 *
 *   * an edge is a later court's own words, extracted and verified;
 *   * a stored status with no edge is a human determination — an admin acting
 *     on `dispute_upheld`, which `propagate-treatment.ts` says outranks a regex
 *     over a citing sentence.
 *
 * So a stored `set_aside` with no supporting edge really is a set aside and is
 * returned as one. A stored `set_aside` WITH an `overruled` edge is the OD-14
 * case: the edge is the evidence and the label was the coercion.
 */
/**
 * A verified adverse edge the CORPUS has not applied — reported, never acted on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE FUNCTION AND NOT A CHANGE TO {@link precedentialEffect}
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `precedentialEffect` returns `none` when the stored status is `none`, however
 * strong the inbound edge, and its comment gives the reason: flipping standing
 * there would be a second implementation of a status change, and
 * `ADMIN_SURFACE.md` §15 requires exactly one — `applyOverruledChange`, which
 * also fans out to everyone who saved, exported or copied the authority. That
 * reasoning is correct and is not disturbed here.
 *
 * But the consequence was that the fact became invisible. Measured 22 Aug 2026,
 * the whole population is **2 judgments** — `BHARATI VIDYAPEETH` (2004 INSC 140)
 * and `SOCIETY FOR UN-AIDED P. SCHOOL OF RAJASTHAN` — each carrying a verified
 * `overruled_in_part` edge while every surface rendered "no adverse treatment
 * recorded". `propagate-treatment.ts` skips both DELIBERATELY and correctly:
 * `partly_set_aside` needs the affected paragraph numbers, none could be read
 * near the citation, and it refuses to widen to `set_aside` because naming the
 * wrong paragraph tells an advocate a live passage is dead.
 *
 * So this reports and does not decide. It writes nothing, notifies nobody, and
 * changes no banner or refusal — those stay with the one writer. What it removes
 * is the silence, which `CITATION_HARNESS.md` holds at a zero threshold.
 *
 * **The open question it exposes is the founder's, not this module's:** what an
 * advocate should see when a later court partly overruled an authority and we
 * cannot say which paragraphs. Recorded in `docs/FOUNDER_QUEUE.md`.
 */
export function unappliedTreatment(input: {
  overruledStatus: OverruledStatus;
  inboundRelationships: readonly string[];
}): TreatmentRelationship | null {
  if (input.overruledStatus !== 'none') return null;
  return strongestTreatment(input.inboundRelationships);
}

/**
 * The provenance-aware entry point. Prefer this over `precedentialEffect`.
 *
 * `precedentialEffect` still exists and still takes bare relationship strings,
 * because five surfaces called it before provenance existed and a flag-day
 * rewrite of all of them in one commit is how a currentness bug ships. What it
 * now does is delegate here with every edge marked `UNKNOWN` — which is the
 * honest reading of a caller that did not ask about provenance, and which
 * produces byte-identical behaviour to before for every case except the one
 * below.
 *
 * THE ONE BEHAVIOURAL CHANGE, and why it is not a weakening:
 *
 * When a stored adverse status is backed ONLY by `MODALITY_DEFECT` edges, the
 * old code dropped those edges, found no edge at all, and fell into the branch
 * commented *"A human determination with no edge behind it. Taken at its word."*
 * — which is false twice over. It was not a human determination, and the edge it
 * was taken from is known-broken. That path granted a defect the authority of an
 * admin's deliberate decision.
 *
 * It now returns `review_required`, which refuses `addToMatter` and keeps the
 * banner. Strictly MORE cautious, and it says the true thing: the recorded
 * treatment could not be verified against a usable edge.
 */
export function precedentialEffectFromEdges(input: {
  overruledStatus: OverruledStatus;
  edges: readonly TreatmentEdge[];
}): PrecedentialEffect {
  const usable = edgesThatMayDrive(input.edges);
  const hadAdverseEdges = input.edges.some((e) => EDGE_RANK[e.relationship] !== undefined);
  const hasUsableAdverse = usable.some((e) => EDGE_RANK[e.relationship] !== undefined);

  /**
   * Every adverse edge behind a stored status is defective.
   *
   * Not silence — a broken witness, which is a different answer from no witness.
   * And not `review_required` either: that would refuse add-to-matter, and a
   * defect in our own parsing is not grounds to tell an advocate that good law
   * is unusable. See `evidence_defect`.
   */
  if (input.overruledStatus !== 'none' && hadAdverseEdges && !hasUsableAdverse) {
    return 'evidence_defect';
  }

  return precedentialEffect({
    overruledStatus: input.overruledStatus,
    inboundRelationships: usable.map((e) => e.relationship),
  });
}

export function precedentialEffect(input: {
  overruledStatus: OverruledStatus;
  /** Every relationship on an inbound edge. Order irrelevant. */
  inboundRelationships: readonly string[];
}): PrecedentialEffect {
  const edge = strongestTreatment(input.inboundRelationships);

  if (input.overruledStatus === 'none') {
    /**
     * An edge exists and the corpus still calls it good law. That is
     * `propagate-treatment.ts`'s unapplied backlog, not a finding this function
     * may make on its own — flipping standing here would be the second
     * implementation of a status change that `ADMIN_SURFACE.md` §15 forbids,
     * and it would skip the fan-out and the alerts.
     */
    return 'none';
  }

  if (edge === null) {
    /* A human determination with no edge behind it. Taken at its word. */
    return input.overruledStatus === 'set_aside'
      ? 'set_aside'
      : input.overruledStatus === 'partly_set_aside'
        ? 'partly_set_aside'
        : 'doubted';
  }

  const fromEdge = EFFECT_FOR_EDGE[edge];
  if (fromEdge === undefined) return 'review_required';

  /**
   * The one guard against a silent DOWNGRADE.
   *
   * A stored `set_aside` explained by a merely `doubted` edge is not a doubting
   * — something set that status and this function cannot see what. Returning
   * `doubted` would quietly turn the strongest warning into the weakest one, so
   * it returns `review_required` instead and the policy below refuses.
   */
  const storedRank =
    input.overruledStatus === 'set_aside'
      ? 1
      : input.overruledStatus === 'partly_set_aside'
        ? 2
        : 3;
  if (EDGE_RANK[edge]! > storedRank) return 'review_required';

  return fromEdge;
}

/**
 * Layer 2 → layer 3. The only place the product's behaviour is decided.
 *
 * Read it as a table, because that is what it is, and the whole point of OD-14
 * is that this table is now visible in one place instead of being spread across
 * a column's value list, a route's `if`, and a client's switch.
 */
export function precedentialPolicy(effect: PrecedentialEffect): PrecedentialPolicy {
  switch (effect) {
    case 'none':
      return {
        addToMatter: 'allow',
        bannerStatus: 'none',
        citableForUntouchedPropositions: true,
        because: 'no adverse treatment recorded',
      };

    /**
     * THE OD-14 CHANGE, and the only behavioural change in this module.
     *
     * Still the strongest banner — a later bench held the proposition is no
     * longer good law and an advocate must see that before anything else. But
     * ADDABLE, because the decision between the original parties stands and the
     * judgment frequently remains citable for propositions the overruling court
     * never reached. Refusing it was Lawmind declining to let an advocate rely
     * on law that is still law.
     */
    case 'overruled':
      return {
        addToMatter: 'allow',
        bannerStatus: 'set_aside',
        citableForUntouchedPropositions: true,
        because: 'a later bench overruled the proposition; this decision itself stands',
      };

    case 'overruled_in_part':
      return {
        addToMatter: 'allow',
        bannerStatus: 'partly_set_aside',
        citableForUntouchedPropositions: true,
        because: 'part of the proposition was overruled; the rest is undisturbed',
      };

    /**
     * UNCHANGED, and this is the case `CLAUDE.md` §6 is actually about: an
     * appellate court undid this judgment in this case, so there is no decision
     * left to rely on. The one refusal in the product.
     */
    case 'set_aside':
      return {
        addToMatter: 'refuse',
        bannerStatus: 'set_aside',
        citableForUntouchedPropositions: false,
        because: 'this judgment was set aside — the decision between the parties is gone',
      };

    case 'partly_set_aside':
      return {
        addToMatter: 'allow',
        bannerStatus: 'partly_set_aside',
        citableForUntouchedPropositions: true,
        because: 'part of this judgment was set aside; the named paragraphs say which',
      };

    case 'doubted':
      return {
        addToMatter: 'allow',
        bannerStatus: 'doubted',
        citableForUntouchedPropositions: true,
        because: 'a later court expressed doubt without deciding',
      };

    /**
     * Honest about not knowing, conservative about acting on it. The banner
     * stays at full strength for the same reason: a status we cannot account
     * for is not a status we may quietly downgrade.
     */
    case 'review_required':
      return {
        addToMatter: 'refuse',
        bannerStatus: 'set_aside',
        citableForUntouchedPropositions: false,
        because: 'the recorded treatment of this authority could not be verified against an edge',
      };

    case 'evidence_defect':
      /**
       * ALLOW, and no banner.
       *
       * Both halves are deliberate and both are the opposite of the cautious
       * reflex. The stored status exists only because our parser read a
       * subjunctive as a holding, so:
       *
       *   * showing LAW MOVED would be asserting a change in the law that never
       *     happened — a hallucination in the direction nobody watches for; and
       *   * refusing add-to-matter would deny an advocate good law over a
       *     grammatical mood.
       *
       * The disclosure is NOT lost. `treatmentAttribution` is `DEFECTIVE` on
       * every surface, and the briefing checklist still emits an item saying the
       * evidence is a known defect in our record. What goes away is the false
       * claim and the false prohibition, not the visibility.
       */
      return {
        addToMatter: 'allow',
        bannerStatus: 'none',
        citableForUntouchedPropositions: true,
        because:
          'the only recorded treatment of this authority is a defect in our own reading, not an act of any court',
      };
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LAYER 2b — HOW MUCH OF THE JUDGMENT THE ADVERSE TREATMENT REACHED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A separate axis from WHAT happened, and the binding addendum requires it:
 *
 *   > *"A verified adverse treatment whose affected proposition/paragraph is
 *   > unresolved must NOT render as 'no adverse treatment.' Scope remains
 *   > UNKNOWN; do not invent the affected paragraph."*
 *
 * The concrete population is small and real: judgments where the treatment is
 * VERIFIED and the paragraphs it touched could not be read — an unreadable body
 * (`body_text_safe = false`) or an overruling judgment that names no paragraph.
 * Two of them today.
 *
 * The failure this prevents is precise. A `partly_set_aside` with no
 * `overruled_paras` is *"part of this judgment has fallen and we cannot tell you
 * which part"*. The tempting simplifications are both wrong: treating it as
 * fully set aside overstates and blocks good law, treating it as unaffected
 * understates and is the exact thing `CITATION_HARNESS.md` holds at a zero
 * threshold.
 *
 * **No paragraph number is ever invented.** `UNRESOLVED` is a refusal to guess,
 * and it is the honest output of a pipeline that read a document it could not
 * parse.
 *
 * The server states the FACT. Copy — "review the later decision before relying
 * on this" — is the client's, and deliberately not written here: the amber LAW
 * MOVED mark and its wording belong to one place, and this module is not it.
 */
export type TreatmentScope =
  /** No adverse treatment to scope. */
  | 'NOT_APPLICABLE'
  /** The whole judgment fell. There is nothing left to delimit. */
  | 'WHOLE_JUDGMENT'
  /** The affected paragraphs are recorded and can be shown. */
  | 'RESOLVED'
  /** Verified adverse treatment; WHICH propositions fell is not known. */
  | 'UNRESOLVED';

export function treatmentScope(input: {
  effect: PrecedentialEffect;
  /** `judgments.overruled_paras`. Null or empty means nothing was recorded. */
  overruledParas: readonly number[] | null;
}): TreatmentScope {
  switch (input.effect) {
    case 'none':
      return 'NOT_APPLICABLE';
    /**
     * A full set-aside has no scope question: the judgment is gone, not partly
     * gone. Recording `overruled_paras` on one would be a contradiction, and
     * asking "which paragraphs" invites a client to render a narrowing that
     * does not exist.
     */
    case 'set_aside':
      return 'WHOLE_JUDGMENT';
    /**
     * `review_required` is already the state that means "we cannot account for
     * this", so its scope is unresolved by construction rather than by
     * inspection of a column.
     */
    case 'review_required':
      return 'UNRESOLVED';
    /**
     * There is no scope question, because there was no treatment. Asking "which
     * paragraphs were affected" of an edge that turned out to be a subjunctive
     * invites a client to render a narrowing of something that never narrowed.
     */
    case 'evidence_defect':
      return 'NOT_APPLICABLE';
    default:
      return input.overruledParas !== null && input.overruledParas.length > 0
        ? 'RESOLVED'
        : 'UNRESOLVED';
  }
}

/**
 * The no-signal statement, scoped — the addendum's wording rule made into a
 * value rather than left to prose.
 *
 * *"No adverse treatment found in LawMind's resolved sources as of [DATE]."*
 * Never "good law", and never an unqualified negative: we can only speak for
 * the sources we have resolved, and only as at the moment we read them.
 *
 * Returned as STRUCTURE, not as a sentence. The client owns the words; what the
 * server owes it is the two facts that make the sentence honest — the scope of
 * the claim and the instant it was true.
 */
export type CurrentnessClaim = {
  /** `none` here means "nothing found", never "nothing exists". */
  adverseTreatment: PrecedentialEffect;
  scope: TreatmentScope;
  /** What we searched. Never "all Indian courts". */
  basis: 'lawmind_resolved_sources';
  asOf: string;
};

export function currentnessClaim(input: {
  effect: PrecedentialEffect;
  overruledParas: readonly number[] | null;
  asOf: string;
}): CurrentnessClaim {
  return {
    adverseTreatment: input.effect,
    scope: treatmentScope(input),
    basis: 'lawmind_resolved_sources',
    asOf: input.asOf,
  };
}
