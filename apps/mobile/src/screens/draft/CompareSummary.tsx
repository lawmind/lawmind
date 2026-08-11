import { StyleSheet, View } from 'react-native';

import { CitationMark, movedTone } from '../../components/CitationMark';
import { Text } from '../../components/Text';
import type { CompareResponse } from '../../api/contract';
import { citationRender } from '../../citation/renderState';
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
 *
 * THE OVERRULED MARK COMES FROM `citationRender`, NOT FROM THIS FILE. Until
 * 11 Aug 2026 this surface drew one amber band reading "The law has moved on
 * this authority" for all three overruled states, which was wrong in both
 * directions at once: it painted `set_aside` — the one state where Lawmind
 * refuses to let an authority be used — in caution amber rather than the danger
 * red `JudgmentScreen` gives it, and it banded `doubted`, which is still
 * binding law and which `CITATION_HARNESS.md` §"When the law moves" says gets
 * no band at all, because "a notification that shouted equally for all three
 * would train advocates to ignore it".
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

          {citationChanges.map((c, i) => {
            const { moved } = citationRender(c);
            const band = moved.kind === 'moved' ? moved.band : 'none';
            return (
              <View
                key={`${c.paragraphIndex}-${i}`}
                style={[
                  styles.card,
                  band === 'caution' && styles.cardCaution,
                  band === 'danger' && styles.cardDanger,
                ]}
              >
                <Text opticalNudge variant="record">
                  PARAGRAPH {c.paragraphIndex + 1} · {c.kind.toUpperCase()}
                </Text>

                {/*
                THREE STATES, THREE TREATMENTS — `CITATION_HARNESS.md`
                §"When the law moves", and the same mapping `ResultCard` uses,
                from the same `CitationMark` tones. Until 11 Aug 2026 this
                surface drew ONE amber band reading "The law has moved on this
                authority" for all three states, which was wrong in both
                directions at once: it painted `set_aside` — the one state where
                Lawmind refuses to let an authority be used — in caution amber
                rather than danger, and it banded `doubted`, which still binds
                and which the spec says gets no band, because "a notification
                that shouted equally for all three would train advocates to
                ignore it".

                ALL THREE STATES CARRY A CHIP, because this is a list and the
                state has to be legible without opening anything.
              */}
                {moved.kind === 'moved' ? (
                  <CitationMark label={moved.chipLabel} tone={movedTone(moved.band)} />
                ) : null}

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

                {/* What still stands is stated FIRST — it is what the advocate
                  is about to rely on. */}
                {moved.kind === 'moved' && moved.whatStillStands ? (
                  <Text variant="ui" style={styles.stillStands}>
                    {moved.whatStillStands}
                  </Text>
                ) : null}

                {/* `doubted` gets no band, so it gets the sentence instead — the
                  chip alone would not say that it still binds. */}
                {moved.kind === 'moved' && moved.band === 'none' ? (
                  <Text variant="ui" style={styles.doubtedLine}>
                    {moved.headline}
                  </Text>
                ) : null}
              </View>
            );
          })}
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
  /**
   * The card wash follows the band, exactly as `ResultCard` does it.
   * `partly_set_aside` is amber — the one thing amber means. `set_aside` is
   * danger red, never amber.
   */
  cardCaution: { backgroundColor: state.cautionWash, borderColor: state.caution },
  cardDanger: {
    backgroundColor: color.card,
    borderColor: state.danger,
    borderLeftColor: state.danger,
  },

  stillStands: { color: color.ink },
  /** `doubted` — one muted line and no wash, because it still binds. */
  doubtedLine: { color: color.inkMuted },
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
