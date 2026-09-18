/**
 * P11 — DETERMINISTIC PROJECTIONS OVER eCOURTS OBSERVATIONS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OBSERVATION IS NOT EVENT, AND THIS FILE EXISTS TO KEEP THEM APART
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Migration `0061` gave us `ecourts_observation` — append-only, trigger-enforced,
 * every row carrying its payload hash, its endpoint, the grant's data type and
 * the conditions version that authorised the request. That table records **what
 * a registry's website said, and when we read it.** Nothing more.
 *
 * The single most dangerous thing this product could do with that table is treat
 * a row in it as a fact about the world:
 *
 *     a case appearing on a cause list means it was LISTED.
 *     It does not mean a hearing happened.
 *
 * Cases are listed and passed over. They are listed and adjourned before
 * reaching the item. They are listed for a bench that does not sit that day. An
 * advocate told "your matter was heard on the 14th" when it was passed over is
 * being told something false about their own case, by a system they trusted
 * enough to stop checking.
 *
 * So every projection here is named for what was OBSERVED, never for what
 * happened, and the vocabulary makes the wrong sentence unspellable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING IS OVERWRITTEN. A CHANGED NEXT DATE IS TWO FACTS, NOT ONE CORRECTION.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `next_listing_date` moves. It moved because the registry re-listed the matter,
 * or because the first reading was wrong, and **from the observation alone those
 * are indistinguishable.** Both observations are kept, both are returned, and the
 * derivation reports the latest-known value ALONGSIDE the fact that it changed.
 *
 * `ecourts_transition` is where a change becomes a row a person can be notified
 * about. It carries `from_observation_id` and `to_observation_id` so the
 * evidence for any notification is two rows a human can open — and
 * `evidence_pruned_at` for when retention eventually removes them, so a
 * transition whose evidence is gone says so rather than looking freshly proved.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A FRESH ORDER IS A CANDIDATE. IT IS NOT A DOCUMENT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An `order_ref` appearing on a case-status page means an order is AVAILABLE at
 * that reference. Linking it to a corpus judgment requires identity
 * verification — the same discipline the citation harness runs on — and until
 * that passes it is `ORDER_AVAILABILITY_CANDIDATE` and nothing else. A wrong
 * link puts another case's order in an advocate's matter, which is the
 * cross-contamination failure `CLAUDE.md` §6 forbids in a different guise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE. NO DATABASE, NO HTTP, NO CLOCK.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every function takes observations and returns a projection. `now` is a
 * parameter where it is needed at all. That is what lets the rules be tested
 * exhaustively before a single live observation exists — and there are **zero**
 * live observations today: `ecourts_fetch_ledger` holds 52 rows and every one is
 * `refused` / `kill_switch_off`, because `FQ-ECOURTS-ACTOR` has not been
 * answered. Building the derivation now means the day the switch flips, the
 * first observation lands on rules that were written without the pressure of
 * live data.
 */

/** Exactly the observation columns these rules read. Migration 0061. */
export type Observation = {
  id: string;
  observationKind: string;
  source: string;
  /** When WE read it. Always ours, never the registry's. */
  observedAt: string;
  /** When the SOURCE says its content was true, where it says so at all. */
  sourceAssertedAt: string | null;
  court: string | null;
  cnr: string | null;
  caseNumber: string | null;
  listingDate: string | null;
  nextListingDate: string | null;
  disposalDate: string | null;
  caseStatus: string | null;
  bench: string | null;
  courtNumber: string | null;
  itemNumber: number | null;
  orderRef: string | null;
  payloadSha256: string | null;
  extractionState: string | null;
};

/**
 * The projection vocabulary.
 *
 * Every name is a statement about what was SEEN. There is deliberately no
 * `HEARING_OCCURRED`, no `ADJOURNED`, no `ORDER_PASSED` — those are facts about
 * a courtroom, and a website is not a courtroom.
 */
export type ProjectionKind =
  /** The case appeared on a cause list for a date. Nothing about what happened. */
  | 'LISTED_OBSERVED'
  /** A case-status page named a next date. */
  | 'NEXT_DATE_OBSERVED'
  /** A next date we had previously observed is no longer the one shown. */
  | 'NEXT_DATE_CHANGED'
  /** A status page showed a disposal date. Still an observation. */
  | 'DISPOSAL_OBSERVED'
  /** An order reference appeared. NOT a document, NOT linked to the corpus. */
  | 'ORDER_AVAILABILITY_CANDIDATE'
  /** Two observations of the same case disagree and neither supersedes. */
  | 'CONFLICTING_OBSERVATIONS'
  /** The extraction itself failed. Says nothing about the case. */
  | 'EXTRACTION_UNUSABLE';

export type Projection = {
  kind: ProjectionKind;
  cnr: string | null;
  court: string | null;
  /** The observation ids this projection rests on. Never fewer than one. */
  evidence: string[];
  /** Machine-readable detail. Shape depends on `kind` and is documented below. */
  detail: Record<string, string | number | null>;
};

/**
 * Sort key: the SOURCE's own assertion time where it gave one, our read time
 * otherwise.
 *
 * Ordering purely by `observedAt` would let a stale page fetched late overwrite
 * a fresher page fetched early — the registry's own timestamp is the better
 * clock when it exists, and our read time is the honest fallback when it does
 * not.
 */
export function effectiveAt(o: Observation): string {
  return o.sourceAssertedAt ?? o.observedAt;
}

const byTime = (a: Observation, b: Observation) =>
  effectiveAt(a) < effectiveAt(b) ? -1 : effectiveAt(a) > effectiveAt(b) ? 1 : 0;

/**
 * Project one case's observations. Input need not be sorted.
 *
 * The caller groups by case identity, because "what counts as the same case" is
 * a decision this module must not make silently — a CNR is authoritative and a
 * court-plus-case-number pair is not always unique across years.
 */
export function project(observations: readonly Observation[]): Projection[] {
  const out: Projection[] = [];
  const ordered = [...observations].sort(byTime);

  for (const o of ordered) {
    /* An extraction that failed is evidence about our parser, never about the
     * case. It is projected so the failure is visible rather than absent. */
    if (o.extractionState !== null && o.extractionState !== 'ok') {
      out.push({
        kind: 'EXTRACTION_UNUSABLE',
        cnr: o.cnr,
        court: o.court,
        evidence: [o.id],
        detail: { extractionState: o.extractionState, observedAt: o.observedAt },
      });
      continue;
    }

    if (o.listingDate !== null) {
      out.push({
        kind: 'LISTED_OBSERVED',
        cnr: o.cnr,
        court: o.court,
        evidence: [o.id],
        detail: {
          listingDate: o.listingDate,
          bench: o.bench,
          courtNumber: o.courtNumber,
          itemNumber: o.itemNumber,
          /* Named so that no consumer can read this as attendance. */
          means: 'the case appeared on a list for this date; whether it was reached is unknown',
        },
      });
    }

    if (o.nextListingDate !== null) {
      out.push({
        kind: 'NEXT_DATE_OBSERVED',
        cnr: o.cnr,
        court: o.court,
        evidence: [o.id],
        detail: { nextListingDate: o.nextListingDate, effectiveAt: effectiveAt(o) },
      });
    }

    if (o.disposalDate !== null) {
      out.push({
        kind: 'DISPOSAL_OBSERVED',
        cnr: o.cnr,
        court: o.court,
        evidence: [o.id],
        detail: { disposalDate: o.disposalDate, caseStatus: o.caseStatus },
      });
    }

    if (o.orderRef !== null) {
      out.push({
        kind: 'ORDER_AVAILABILITY_CANDIDATE',
        cnr: o.cnr,
        court: o.court,
        evidence: [o.id],
        detail: {
          orderRef: o.orderRef,
          /* Stated in the row, not only in this file's comments, because the
           * row is what a consumer reads. */
          means: 'an order exists at this reference; it is NOT linked to a corpus judgment',
        },
      });
    }
  }

  /* Changes are derived across observations, so they come after the per-row
   * pass rather than being detected inside it. */
  out.push(...nextDateChanges(ordered));
  return out;
}

/**
 * Every time the observed next date moved, as its own projection.
 *
 * BOTH observations are kept as evidence and NEITHER is discarded. The reading
 * that changed may be the correction of a bad parse or a genuine re-listing, and
 * the observation cannot tell them apart — so the projection reports the change
 * and refuses to characterise it.
 */
export function nextDateChanges(ordered: readonly Observation[]): Projection[] {
  const out: Projection[] = [];
  let last: Observation | null = null;
  for (const o of ordered) {
    if (o.nextListingDate === null) continue;
    if (last !== null && last.nextListingDate !== o.nextListingDate) {
      out.push({
        kind: 'NEXT_DATE_CHANGED',
        cnr: o.cnr,
        court: o.court,
        evidence: [last.id, o.id],
        detail: {
          fromDate: last.nextListingDate,
          toDate: o.nextListingDate,
          fromObservedAt: effectiveAt(last),
          toObservedAt: effectiveAt(o),
          means: 'the shown next date changed; whether it was re-listed or re-read is unknown',
        },
      });
    }
    last = o;
  }
  return out;
}

export type LatestKnown = {
  nextListingDate: string | null;
  /** The observation that supplied it. Null when nothing ever showed one. */
  fromObservationId: string | null;
  asOf: string | null;
  /** True when at least one earlier observation showed a DIFFERENT date. */
  changed: boolean;
  /** Every distinct next date ever observed, oldest first. */
  history: { date: string; observationId: string; asOf: string }[];
};

/**
 * The latest-known next date, WITH its history rather than instead of it.
 *
 * A single date is what a screen wants and it is not what the evidence is. The
 * return type carries both so that a caller which wants to render "next hearing:
 * 14 March" can, and one which wants to say "changed from 2 March on 19 Feb"
 * also can, from the same call.
 *
 * There is no tie-breaking on equal timestamps beyond the input order, and that
 * is deliberate: two observations asserting different dates at the same instant
 * is a CONFLICT, and `conflicts()` reports it rather than this function
 * silently picking one.
 */
export function latestKnownNextDate(observations: readonly Observation[]): LatestKnown {
  const ordered = [...observations].sort(byTime).filter((o) => o.nextListingDate !== null);
  const history: LatestKnown['history'] = [];
  for (const o of ordered) {
    const prev = history[history.length - 1];
    if (prev?.date === o.nextListingDate) continue;
    history.push({ date: o.nextListingDate!, observationId: o.id, asOf: effectiveAt(o) });
  }
  const last = ordered[ordered.length - 1];
  return {
    nextListingDate: last?.nextListingDate ?? null,
    fromObservationId: last?.id ?? null,
    asOf: last ? effectiveAt(last) : null,
    changed: history.length > 1,
    history,
  };
}

/**
 * Observations that disagree at the same effective instant.
 *
 * Not a defect to be resolved here. Two registry pages read at the same moment
 * showing different next dates is a real thing that happens during a re-listing,
 * and the honest projection is that we do not know which is current.
 */
export function conflicts(observations: readonly Observation[]): Projection[] {
  const byInstant = new Map<string, Observation[]>();
  for (const o of observations) {
    if (o.nextListingDate === null) continue;
    const k = effectiveAt(o);
    byInstant.set(k, [...(byInstant.get(k) ?? []), o]);
  }
  const out: Projection[] = [];
  for (const [instant, group] of byInstant) {
    const distinct = new Set(group.map((g) => g.nextListingDate));
    if (distinct.size <= 1) continue;
    out.push({
      kind: 'CONFLICTING_OBSERVATIONS',
      cnr: group[0]!.cnr,
      court: group[0]!.court,
      evidence: group.map((g) => g.id),
      detail: {
        instant,
        distinctValues: [...distinct].join(' | '),
        means: 'two readings at the same instant disagree; neither supersedes the other',
      },
    });
  }
  return out;
}

/**
 * The one sentence this module exists to make impossible to write.
 *
 * Exported as a named refusal rather than left out, so that a future caller
 * looking for "did the hearing happen" finds the answer instead of inventing it.
 */
export const HEARING_OCCURRED_IS_NOT_DERIVABLE =
  'A cause-list or case-status observation cannot establish that a hearing took ' +
  'place. Cases are listed and passed over, listed before a bench that does not ' +
  'sit, and listed then adjourned without being reached. LISTED_OBSERVED is the ' +
  'strongest claim the evidence supports.';
