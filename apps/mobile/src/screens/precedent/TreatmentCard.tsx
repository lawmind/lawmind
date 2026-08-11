import { StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import type { Treatment, TreatmentRelationship } from '../../api/contract';
import { citationDisplay } from '../../citation/citationDisplay';
import { citationRender } from '../../citation/renderState';
import { color, radius, space, state } from '../../theme/tokens';

/**
 * ONE ROW OF THE CITATION NETWORK.
 *
 * TWO INDEPENDENT QUESTIONS ARE RENDERED HERE AND THEY MUST NOT MERGE:
 *
 *   `relationship`     — what THIS later judgment did to the authority being
 *                        read. Followed it, distinguished it, doubted it,
 *                        overruled it.
 *   `overruledStatus`  — whether THIS judgment is itself still good law.
 *
 * A judgment that overruled our authority can itself have been overruled since.
 * Collapsing the two would tell an advocate the law moved without saying which
 * way, which is worse than saying nothing.
 *
 * AMBER IS SPENT ONLY ON "THE LAW HAS MOVED". `relationship: 'overruled'` earns
 * it because the authority the advocate is reading no longer stands. Followed
 * and distinguished are ordinary ink — they are the normal life of a precedent,
 * not a warning, and colouring them would train the eye to ignore the one that
 * matters.
 */

const RELATIONSHIP_LABEL: Record<TreatmentRelationship, string> = {
  cites: 'CITED',
  followed: 'FOLLOWED',
  distinguished: 'DISTINGUISHED',
  doubted: 'DOUBTED',
  overruled: 'OVERRULED',
  overruled_in_part: 'OVERRULED IN PART',
};

/**
 * An unrecognised relationship RENDERS ITSELF rather than nothing.
 *
 * `judgment_citations.relationship` is a text column server-side, not an enum,
 * so a seventh value can appear without this union knowing. Until 11 Aug 2026 a
 * lookup miss returned `undefined` and the eyebrow rendered BLANK — a treatment
 * row with no stated relationship, which reads as "we have nothing to say about
 * this" when the truth is "we did not recognise what the court did".
 */
const relationshipLabel = (relationship: TreatmentRelationship): string =>
  RELATIONSHIP_LABEL[relationship] ?? String(relationship).replace(/_/g, ' ').toUpperCase();

/**
 * THE NODE'S OWN STATUS, DIFFERENTIATED BY THE INK THAT ALREADY EXISTS.
 *
 * Until 11 Aug 2026 all three states drew `state.cautionText`. The wording
 * distinguished them and the colour did not, so a judgment that had itself been
 * SET ASIDE carried the same weight as one merely doubted — the quieter version
 * of the bug fixed the same night on `CompareSummary` and `DocumentReview`.
 *
 * `CITATION_HARNESS.md` §"When the law moves" carves out no exception for a
 * graph node. It maps to ink rather than to a chip deliberately: there is no
 * reference geometry for a `CitationMark` inside a node, and inventing one is a
 * design decision rather than a client fix. Each colour here is already in use
 * elsewhere — `state.danger` as text in `Input.error` and
 * `DocumentReview.riskHeading`, `inkMuted` as `ResultCard.doubtedLine`.
 *
 * IT DOES NOT OVERRULE DESIGN_SYSTEM §Non-negotiable rule 3 — IT OBEYS IT, AND
 * THE OLD CODE DID NOT. The previous comment here cited rule 3 for "doubted gets
 * the caution INK". Read verbatim, rule 3 says: *"`set_aside` (danger band,
 * primary action disabled) · `partly_set_aside` (caution band, adds with a note)
 * · `doubted` (no band, ONE MUTED LINE)"*. Muted is `inkMuted`. Caution ink on
 * `doubted` was never what the rule said, and citing the rule above the line
 * that contradicted it is why it survived.
 *
 * ONE DELIBERATE DEPARTURE, stated rather than hidden: rule 3 gives `set_aside`
 * a danger BAND, and this is danger INK. A band is the treatment for the surface
 * where that authority is the subject being read — `JudgmentScreen` draws it,
 * full-bleed, replacing the header. Here the subject is the authority ABOVE this
 * row; this line is a fact about a judgment that treated it. Banding every row
 * of a citation network is how the band stops meaning anything.
 */
const OWN_STATUS_INK = {
  danger: state.danger,
  caution: state.cautionText,
  none: color.inkMuted,
} as const;

/**
 * DID THIS BENCH MOVE THE LAW ON THE AUTHORITY ABOVE IT?
 *
 * `overruled_in_part` COUNTS. It tested `=== 'overruled'` until 11 Aug 2026, so
 * a bench that overruled this authority in part was drawn as an ordinary
 * citing judgment — no amber, no headline — while 20 such rows sat in
 * production. Partly overruled is the law moving; it moves less far, which is
 * what the wording says, not whether it is said at all.
 */
const movesTheLaw = (relationship?: TreatmentRelationship): boolean =>
  relationship === 'overruled' || relationship === 'overruled_in_part';

export function TreatmentCard({
  treatment,
  onOpen,
}: {
  treatment: Treatment;
  onOpen: () => void;
}) {
  const lawMoved = movesTheLaw(treatment.relationship);
  const { moved } = citationRender(treatment);
  // One helper decides the citation slot on every surface. A treating judgment
  // can carry no citation exactly as a search result can.
  const citation = citationDisplay(treatment);

  /**
   * THE RELATIONSHIP LABEL — what this bench DID to the authority above it.
   * Overruling and doubting both moved the law on that authority, so both take
   * caution ink; following and distinguishing are the ordinary life of a
   * precedent and take ordinary ink.
   *
   * NOT governed by DESIGN_SYSTEM rule 3, which this block used to cite. Rule 3
   * governs `overruled_status` — whether a judgment is still good law — and this
   * is `relationship`. The two are the independent fields this file exists to
   * keep apart, so a rule about one is not authority for the other. Behaviour
   * unchanged; only the citation was wrong.
   */
  const labelColour = lawMoved
    ? state.cautionText
    : treatment.relationship === 'doubted'
      ? state.cautionText
      : treatment.relationship === 'distinguished'
        ? color.inkMuted
        : color.ink;

  return (
    <Pressable onPress={onOpen} style={[styles.card, lawMoved && styles.cardMoved]}>
      {lawMoved ? (
        <Text variant="uiStrong" style={styles.movedHeadline}>
          {treatment.relationship === 'overruled_in_part'
            ? 'The law has moved — this reliance was overruled in part'
            : 'The law has moved — this reliance was overruled'}
        </Text>
      ) : null}

      <View style={styles.topRow}>
        <Text variant="eyebrow" style={{ color: labelColour }}>
          {relationshipLabel(treatment.relationship)}
        </Text>
        <Text variant="record">
          {treatment.court} · {treatment.judgmentDate.slice(0, 4)}
        </Text>
      </View>

      <Text variant="legal" scale="holding" style={styles.title}>
        {treatment.caseTitle}
      </Text>

      <Text opticalNudge variant="record" style={styles.citation}>
        {citation.text}
        {treatment.paragraph === undefined ? '' : ` · ¶ ${treatment.paragraph}`}
      </Text>

      {/*
        THE PHRASE THE COURT PRINTED — what makes the claim above checkable.

        `treatment.ts` sends `evidence` on every row and says why: "present only
        for a real treatment, so any row claiming one can be audited back to its
        own text." The client did not declare the field until 11 Aug 2026, so
        this card asserted that a later bench distinguished or overruled an
        authority and offered nothing to check it against — an unsourced claim
        about what a court did, which is the shape of claim this product exists
        not to make.

        Set as the court's words, not as UI chrome: legal face, quoted, and
        never truncated with an ellipsis we spliced in. Absent on plenty of rows
        where the extractor found no phrase, and absent is ordinary — the line
        is omitted rather than replaced by an apology for it.
      */}
      {treatment.evidence ? (
        <Text variant="legal" style={styles.evidence}>
          “{treatment.evidence}”
        </Text>
      ) : null}

      {/*
        THE TREATING JUDGMENT'S OWN STATUS, SEPARATELY.
        Read live at render and never cached — `CITATION_HARNESS.md` binding
        rule 1. A node that is itself no longer good law says so here, in its
        own line, so it is never confused with what it did to the authority
        above it.
      */}
      {moved.kind === 'moved' ? (
        <Text variant="ui" style={{ color: OWN_STATUS_INK[moved.band] }}>
          {/*
            The wording stays local rather than coming from `moved.headline`,
            and the word doing the work is "itself". `headline` answers "is this
            authority still good law"; this line answers "is the judgment that
            TREATED it still good law", which is a different question and the
            whole reason the two are drawn apart. Only the weight is shared.
          */}
          {moved.status === 'set_aside'
            ? 'This judgment has itself been set aside.'
            : moved.status === 'partly_set_aside'
              ? 'Part of this judgment has itself been set aside.'
              : 'This judgment has itself been doubted.'}
        </Text>
      ) : null}

      {/*
        VERIFIED IS SILENT. Only the exception draws — an authority we could not
        confirm exists is marked in neutral ink with a dashed edge, never amber,
        because our uncertainty is not the law moving.
      */}
      {treatment.verificationState !== 'verified' ? (
        <View style={styles.unconfirmed}>
          <Text variant="ui" style={styles.unconfirmedText}>
            We could not confirm this judgment exists
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  cardMoved: { backgroundColor: state.cautionWash, borderColor: state.caution },
  movedHeadline: { color: state.cautionText },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.xs },
  title: { color: color.ink },
  evidence: { color: color.ink },
  citation: { color: color.inkFaint },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.xs,
  },
  unconfirmedText: { color: color.inkMuted },
});
