import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import type { CompareResponse } from '../../api/contract';
import { color, radius, space, state } from '../../theme/tokens';

/**
 * WHAT CHANGED BETWEEN TWO VERSIONS OF A DRAFT — `FEATURE_PARITY.md` §2.4.
 *
 * PROSE CHANGES AND CITATION CHANGES ARE REPORTED SEPARATELY, AND CITATIONS GO
 * FIRST.
 *
 * A word swapped for a politer word and an authority added to a filing are not
 * the same event. The first is style. The second re-enters verification, can
 * introduce law that has since been overruled, and is the change that can put
 * an advocate in front of a cost order. Rendering both as grey strikethrough —
 * which is what a text diff does — buries the one that matters inside a list of
 * the ones that do not.
 *
 * So: citation changes are listed first, individually, each carrying its own
 * verification and overruled state. Prose changes are summarised as a count,
 * because a count is all they warrant.
 */
export function CompareSummary({ data }: { data: CompareResponse }) {
  const { textChanges, citationChanges } = data;

  return (
    <View style={styles.host}>
      {citationChanges.length ? (
        <View style={styles.group}>
          <Text variant="eyebrow" style={styles.citationHeading}>
            CITATIONS CHANGED · {citationChanges.length}
          </Text>

          {citationChanges.map((c, i) => (
            <View key={`${c.paragraphIndex}-${i}`} style={styles.card}>
              <Text opticalNudge variant="record">
                PARAGRAPH {c.paragraphIndex + 1} · {c.kind.toUpperCase()}
              </Text>

              {c.before ? (
                <Text variant="legal" style={styles.before}>
                  {c.before}
                </Text>
              ) : null}
              {c.after ? (
                <Text variant="legal" style={styles.after}>
                  {c.after}
                </Text>
              ) : null}

              {/*
                A CHANGED CITATION RE-ENTERS VERIFICATION, so its state is shown
                here rather than assumed to carry over from the previous
                version. Verified stays silent; only the exceptions draw.
              */}
              {c.verificationState !== 'verified' ? (
                <View style={styles.unconfirmed}>
                  <Text variant="uiStrong">We could not confirm this reference</Text>
                </View>
              ) : null}

              {c.overruledStatus !== 'none' ? (
                <View style={styles.moved}>
                  <Text variant="uiStrong" style={styles.movedText}>
                    The law has moved on this authority
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.summary}>
        <Text variant="eyebrow">SUMMARY OF CHANGES</Text>
        <Text variant="ui" style={styles.muted}>
          {textChanges.length === 0
            ? 'No prose changed.'
            : `${textChanges.length} ${textChanges.length === 1 ? 'paragraph' : 'paragraphs'} of prose changed.`}
          {citationChanges.length === 0
            ? ' No citations changed.'
            : ` ${citationChanges.length} ${citationChanges.length === 1 ? 'citation' : 'citations'} changed — listed above.`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: space.sm, gap: space.sm },
  group: { gap: space.xs },
  citationHeading: { color: color.oxblood },
  card: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderLeftWidth: 3,
    borderLeftColor: color.oxblood,
    borderRadius: radius.base,
    padding: space.sm,
    gap: 4,
  },
  before: { color: color.inkMuted, textDecorationLine: 'line-through' },
  after: { color: color.ink },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.xs,
  },
  moved: {
    backgroundColor: state.cautionWash,
    borderWidth: 1,
    borderColor: state.caution,
    borderRadius: radius.base,
    padding: space.xs,
  },
  movedText: { color: state.cautionText },
  summary: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  muted: { color: color.inkMuted },
});
