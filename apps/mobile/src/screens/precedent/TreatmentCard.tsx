import { StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import type { Treatment, TreatmentRelationship } from '../../api/contract';
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
  followed: 'FOLLOWED',
  distinguished: 'DISTINGUISHED',
  doubted: 'DOUBTED',
  overruled: 'OVERRULED',
};

export function TreatmentCard({
  treatment,
  onOpen,
}: {
  treatment: Treatment;
  onOpen: () => void;
}) {
  const lawMoved = treatment.relationship === 'overruled';

  /**
   * `doubted` gets the caution INK but no wash and no band — DESIGN_SYSTEM
   * §Non-negotiable rule 3: doubted is still binding law, so it is one muted
   * line rather than a banner. Shouting equally for all three states is how you
   * train an advocate to ignore the state that disables an authority.
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
          The law has moved — this reliance was overruled
        </Text>
      ) : null}

      <View style={styles.topRow}>
        <Text variant="eyebrow" style={{ color: labelColour }}>
          {RELATIONSHIP_LABEL[treatment.relationship]}
        </Text>
        <Text variant="record">
          {treatment.court} · {treatment.judgmentDate.slice(0, 4)}
        </Text>
      </View>

      <Text variant="legal" scale="holding" style={styles.title}>
        {treatment.caseTitle}
      </Text>

      <Text opticalNudge variant="record" style={styles.citation}>
        {treatment.neutralCitation}
        {treatment.paragraph === undefined ? '' : ` · ¶ ${treatment.paragraph}`}
      </Text>

      {/*
        THE TREATING JUDGMENT'S OWN STATUS, SEPARATELY.
        Read live at render and never cached — `CITATION_HARNESS.md` binding
        rule 1. A node that is itself no longer good law says so here, in its
        own line, so it is never confused with what it did to the authority
        above it.
      */}
      {treatment.overruledStatus !== 'none' ? (
        <Text variant="ui" style={styles.ownStatus}>
          {treatment.overruledStatus === 'set_aside'
            ? 'This judgment has itself been set aside.'
            : treatment.overruledStatus === 'partly_set_aside'
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
  citation: { color: color.inkFaint },
  ownStatus: { color: state.cautionText },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.xs,
  },
  unconfirmedText: { color: color.inkMuted },
});
