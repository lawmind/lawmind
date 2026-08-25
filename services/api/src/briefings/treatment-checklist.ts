/**
 * THE ONE PLACE A CHECKLIST SENTENCE ABOUT AN AUTHORITY'S STANDING IS WRITTEN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS ITS OWN FILE, AND WHY BOTH SIDES CALL IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A briefing has two halves that both talk about the same authority:
 *
 *   * `blocks.authorities` — IDs only, resolved LIVE on every render, because
 *     `CITATION_HARNESS.md` holds that verification is permanent and good-law
 *     status is not;
 *   * `blocks.checklist` — prose, GENERATED at 23:00 and stored in the blob.
 *
 * OD-14 fixed the derivation and the render path. It did not fix the fact that
 * the second half is frozen. A briefing generated last night and opened outside
 * court this morning served a live authority block and a checklist written
 * against a status that may since have changed — and the failure is asymmetric
 * in the dangerous direction: an authority SET ASIDE after generation gets its
 * live banner and **no checklist item at all**, because the item is only ever
 * written by the sweep.
 *
 * So the generation path writes these items and the RENDER path rewrites them,
 * from the same function, against state read in the same request. Storing them
 * is still worth doing — a briefing must be readable with the network off — but
 * the stored copy is a fallback, never the answer when a live read succeeded.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE SENTENCE MAY AND MAY NOT SAY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It states the ACT and the SCOPE, and it never invents either. It never says
 * "good law" and it never says an authority is safe: the absence of a checklist
 * item means no adverse treatment was FOUND, which is not the same claim.
 *
 * The instruction — replace it, or find out what survived — comes from
 * `precedentialPolicy`, never from the stored column.
 */
import type { PrecedentialState } from '../judgments/treatment-lookup.ts';

export type ChecklistItem = { id: string; text: string; basis: string };

/**
 * Stable and structured, so the render path can replace exactly these items and
 * leave every other checklist item — the date, the missing order — untouched.
 */
export const TREATMENT_ITEM_PREFIX = 'authority-moved-';

export const isTreatmentItem = (item: ChecklistItem): boolean =>
  item.id.startsWith(TREATMENT_ITEM_PREFIX);

/**
 * One item per authority whose standing has changed, in the order given.
 *
 * `effect === 'none'` produces NOTHING, deliberately. That covers both the
 * ordinary case and `unappliedTreatment` — a verified adverse edge the corpus
 * has not applied, 2 judgments today. `precedential-effect.ts` is explicit that
 * the unapplied edge is reported and never acted on, and turning it into a
 * generated instruction here would be this lane broadening treatment semantics
 * on its own. It is already sent on the render side, so it is not silent.
 */
export function treatmentChecklistItems(
  states: Iterable<PrecedentialState>,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  for (const m of states) {
    if (m.effect === 'none') continue;

    /**
     * `evidence_defect` gets its OWN sentence, and it is not a warning.
     *
     * The generic wording below opens with "<case> has moved", which is exactly
     * the claim this effect exists to withdraw — the authority did not move, our
     * parser misread a verb's mood. Falling through to it would reintroduce the
     * false statement one layer down from where it was removed.
     *
     * It is still SAID. Dropping the item entirely would hide a known defect in
     * our own record from the one person who might notice it is wrong.
     */
    if (m.effect === 'evidence_defect') {
      items.push({
        id: `${TREATMENT_ITEM_PREFIX}${m.judgmentId}`,
        text:
          `${m.caseTitle} is recorded in our data as having a change of status, and that ` +
          `record is a defect in our own reading rather than an act of any court. ` +
          `Treat the authority as undisturbed, and read the later decision if you want to be sure.`,
        basis:
          `precedentialEffect = evidence_defect ` +
          `(judgments.overruled_status = ${m.storedStatus}; every adverse edge is MODALITY_DEFECT)`,
      });
      continue;
    }

    /**
     * Two sentences, and which comes second is the whole point.
     *
     * `citableForUntouchedPropositions` is layer 3 asking the only question an
     * advocate can act on the night before a hearing: is there anything left of
     * this authority to argue from? When there is not, the instruction is to
     * replace it. When there is, the instruction is to find out what survived —
     * never to drop it.
     *
     * This is the OD-14 defect exactly. The old code branched on the stored
     * column, so the 73 judgments carrying `set_aside` for what their own
     * verified edge calls `overruled` were told *"has been set aside. Do not
     * rely on it — find a replacement authority."* Both halves are false: a
     * later bench held the PROPOSITION is no longer good law, nothing in that
     * case was set aside, and the authority is frequently still citable for
     * propositions the overruling court never reached.
     */
    const survives = m.policy.citableForUntouchedPropositions;

    /**
     * Scope, stated and never guessed. `RESOLVED` means the affected paragraphs
     * are recorded and can be named; `UNRESOLVED` means the treatment is
     * verified and WHICH propositions fell is not known — a fact the advocate
     * must be told rather than an omission to be smoothed over. No paragraph
     * number is ever invented.
     */
    const scopeLine =
      m.scope === 'RESOLVED' && m.overruledParas && m.overruledParas.length > 0
        ? ` The affected paragraphs are recorded: ${m.overruledParas.join(', ')}.`
        : m.scope === 'UNRESOLVED'
          ? ' Which propositions were affected is not recorded — read the later decision.'
          : '';

    /**
     * WHO said it, in the advocate's own words — and the item is NEVER dropped
     * for any value of it.
     *
     * 95.62% of the edges behind a LAW MOVED item are a law reporter's headnote
     * rather than the later court's own reasoning. Both are worth telling an
     * advocate at 23:00 the night before a hearing. They are not the same claim,
     * and stating the second while holding only the first is the overstatement
     * that ends a legal product.
     *
     * Phrasing follows `CLAUDE.md`: copy is licence protection, not an audit. It
     * says what we HOLD — "a law reporter's editorial note" — never what we
     * failed to do, and never the word "unverified".
     */
    const sourceLine =
      m.attribution === 'COURT'
        ? ' The later court said so in its own reasoning.'
        : m.attribution === 'REPORTER'
          ? " This is a law reporter's editorial note rather than the later court's own words — read the later decision before you rely on it either way."
          : m.attribution === 'DEFECTIVE'
            ? ' The evidence behind this is a known defect in our record — treat the move itself as unconfirmed and read the later decision.'
            : ' Whether this comes from the later court or from a law reporter is not established — read the later decision.';

    items.push({
      id: `${TREATMENT_ITEM_PREFIX}${m.judgmentId}`,
      text: survives
        ? `${m.caseTitle} has moved: ${m.policy.because}.${scopeLine}${sourceLine} It may still be relied on for propositions the later court did not reach — check which before the hearing.`
        : `${m.caseTitle} has moved: ${m.policy.because}.${scopeLine}${sourceLine} Do not rely on it — find a replacement authority before the hearing.`,
      /**
       * PROVENANCE, not a restatement of the verdict. Both inputs are named,
       * because a stored `set_aside` explained by an `overruled` edge and a
       * stored `set_aside` explained by nothing are different situations that a
       * reader of this blob must be able to tell apart.
       */
      basis:
        `precedentialEffect = ${m.effect} ` +
        `(judgments.overruled_status = ${m.storedStatus}; scope ${m.scope}; ` +
        `attribution ${m.attribution})`,
    });
  }

  return items;
}

/**
 * Replace the stored treatment items with freshly derived ones, in place.
 *
 * Order matters and is preserved: the stored checklist's non-treatment items
 * keep their positions, and the live treatment items take the slot where the
 * first stored treatment item was — so a briefing does not visibly reshuffle
 * between an offline read and an online one. When there were none stored, they
 * append.
 */
export function withLiveTreatmentItems(
  stored: readonly ChecklistItem[],
  live: readonly ChecklistItem[],
): ChecklistItem[] {
  const firstTreatmentAt = stored.findIndex(isTreatmentItem);
  const others = stored.filter((i) => !isTreatmentItem(i));
  if (firstTreatmentAt === -1) return [...others, ...live];

  const before = stored.slice(0, firstTreatmentAt).filter((i) => !isTreatmentItem(i));
  return [...before, ...live, ...others.slice(before.length)];
}
