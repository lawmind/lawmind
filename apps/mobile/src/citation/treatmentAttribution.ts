import type { TreatmentAttribution } from '../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHO SAID THE LAW MOVED — the client's one copy of the attribution rule.
 * OD-14 layer 4, NEW3 R16 `R16-RCC-01`.
 *
 * PONYTAIL-EXEMPT, for the same reason `renderState.ts` is: this decides what a
 * citation surface may CLAIM, and a second place that decides it is a second
 * place that can decide wrong.
 *
 * ── WHY IT IS NOT PART OF `citationRender()` ────────────────────────────────
 *
 * `renderState.ts` answers two questions — does this authority exist, and has
 * the law moved. This answers a third, and NEW3 R16 requires the three to stay
 * separate concepts. They also have different availability: the moved mark is
 * derived from fields every route sends, while attribution is emitted by four
 * route families and DROPPED by `/search`. Folding it in would make
 * `citationRender()` take a field its commonest caller can never supply.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 *
 * **Only `COURT` may be worded as something the later court HELD.** 95.62% of
 * what drives LAW MOVED in this corpus is a law reporter's editorial headnote
 * and 3.65% is the later court's own reasoning; wording the first as the second
 * is a claim about the law made on a publisher's annotation.
 *
 * `DEFECTIVE` and `UNKNOWN` are not weaker evidence — they are NOT EVIDENCE.
 * `DEFECTIVE` means the record behind the edge is known-broken; `UNKNOWN` means
 * nobody classified it. Neither may be promoted, and neither may be quietly
 * rendered as the other: absence of a classification is not a defect, and a
 * defect is not merely unclassified.
 *
 * ── ABSENCE RENDERS AS ABSENCE ──────────────────────────────────────────────
 *
 * `undefined` is a FIFTH case and it is not `UNKNOWN`. It means the route did
 * not send the field at all — an older server, or `/search`, which drops it.
 * `attributionLine(undefined)` is `null` and every surface renders nothing,
 * because printing "we have not recorded who said so" for a field that was
 * never on the wire is this client inventing a silence it did not observe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * May this attribution be worded as something the later COURT held?
 *
 * Mirrors `mayStateAsHolding()` in
 * `services/api/src/judgments/precedential-effect.ts` exactly. It governs
 * WORDING only — it never governs whether the LAW MOVED mark appears, and a
 * `REPORTER` treatment is shown just as loudly as a `COURT` one.
 */
export function mayStateAsHolding(attribution: TreatmentAttribution | undefined): boolean {
  return attribution === 'COURT';
}

/**
 * The sentence a surface prints beneath an adverse treatment, or `null`.
 *
 * ONLY EVER RENDERED BESIDE A TREATMENT THAT EXISTS. On an authority whose
 * `overruledStatus` is `none` the server derives `UNKNOWN` from an empty edge
 * list — `attributionOf([])` returns it — so printing this line there would
 * attach a note about adverse treatment to a judgment that has none. Callers
 * gate on the treatment, not on this function.
 */
export function attributionLine(attribution: TreatmentAttribution | undefined): string | null {
  switch (attribution) {
    /** The only wording that may name the court as the author of the change. */
    case 'COURT':
      return 'The later court said so in its own reasoning.';
    /**
     * Attributed to the reporter, in the reporter's own terms. Not hedged into
     * "possibly" — the annotation genuinely exists and an advocate may rely on
     * it as an annotation. What it may not do is stand in for the court.
     */
    case 'REPORTER':
      return 'This comes from a law reporter’s editorial note, not the court’s own words.';
    /**
     * Known-broken. Says so, and points at the check the advocate can run
     * without us — the same move `SourceTrustBlock` makes for a suspect date.
     */
    case 'DEFECTIVE':
      return 'The record behind this is damaged — check it against the court’s own copy.';
    /**
     * Stated as unknown, never quietly read as either of the other two. 4,403
     * edges carry no provenance at all.
     */
    case 'UNKNOWN':
      return 'We have not recorded whether this came from the court or from a reporter.';
    /** The field was not on the wire. Nothing is said, because nothing is known. */
    default:
      return null;
  }
}

/**
 * A short label for a list row, where a sentence would not fit.
 *
 * Deliberately NOT a colour, a chip or a badge. Amber `#B4690E` means the law
 * has moved and nothing else — attribution is a fact about our evidence, and
 * this product renders its own uncertainty as neutral ink.
 */
export function attributionLabel(attribution: TreatmentAttribution | undefined): string | null {
  switch (attribution) {
    case 'COURT':
      return 'the court’s own reasoning';
    case 'REPORTER':
      return 'a law reporter’s note';
    case 'DEFECTIVE':
      return 'a damaged record';
    case 'UNKNOWN':
      return 'an unrecorded source';
    default:
      return null;
  }
}

/**
 * WHICH RELATIONSHIPS AN ATTRIBUTION ACTUALLY DESCRIBES.
 *
 * `attributionOf()` server-side filters the edge list to `EDGE_RANK` —
 * `overruled`, `overruled_in_part`, `doubted` — and returns `UNKNOWN` when
 * nothing survives the filter. So EVERY row that merely cites or follows an
 * authority arrives carrying `UNKNOWN`, and it means "there was no adverse edge
 * to classify", not "an adverse edge went unclassified".
 *
 * A surface that printed the `UNKNOWN` line on a `followed` row would be
 * telling an advocate we do not know who moved the law on an authority nobody
 * has moved. This is the gate that stops it, kept here rather than in each
 * card so the client's list and the server's filter cannot drift apart.
 *
 * Open-ended by construction: `relationship` is a text column server-side, not
 * an enum, and an unrecognised value is not adverse until the contract says so.
 */
export function attributionApplies(relationship: string | undefined): boolean {
  return (
    relationship === 'overruled' ||
    relationship === 'overruled_in_part' ||
    relationship === 'doubted'
  );
}
