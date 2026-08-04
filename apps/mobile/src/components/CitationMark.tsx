import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { color, radius, state } from '../theme/tokens';

/**
 * THE STAMP. Retired as a per-result chip; its geometry survives here.
 *
 * `renders/64-verified-silent@2x.png`: "The registry stamp is retired as a
 * per-result chip. Its geometry survives only in the draft footer and on tap."
 * So this is not a badge you may put back on a search result — it is the mark
 * used where the advocate has ASKED (the citation detail screen) or where a
 * document is about to leave the app (the draft footer).
 *
 * Geometry, from `sprints/SPRINT_2.md` §RCC 2: rectangle, radius 2px, 1.5px
 * border, JetBrains Mono 600 at 10px / 0.06em, 20px tall at 1x.
 *
 * THE TWO TONES ARE DISTINGUISHABLE WITH COLOUR REMOVED, because they differ by
 * SHAPE — a dashed edge versus a filled block. Shape is the only property that
 * survives sunlight washout, a dirty screen and colour-vision deficiency.
 * `renders/43-badge-greyscale.png`.
 */
/**
 * DASHED MEANS US. SOLID MEANS THE LAW.
 *
 * That is the whole discriminator, and it is the one that survives greyscale.
 * `doubted` therefore gets its own SOLID neutral tone rather than borrowing the
 * dashed one: a dashed "Doubted · referred" would read as "we could not confirm
 * this", which is a different fact with a different remedy — one sends the
 * advocate to eCourts, the other tells them the law is under reference.
 */
export type CitationMarkTone = 'unconfirmed' | 'moved-quiet' | 'moved' | 'moved-danger';

export function CitationMark({
  label,
  tone,
  testID,
}: {
  label: string;
  tone: CitationMarkTone;
  testID?: string;
}) {
  const dashed = tone === 'unconfirmed';

  return (
    <View
      accessibilityRole="text"
      testID={testID}
      style={[
        styles.mark,
        dashed && styles.unconfirmed,
        tone === 'moved-quiet' && styles.movedQuiet,
        tone === 'moved' && styles.moved,
        tone === 'moved-danger' && styles.movedDanger,
      ]}
    >
      <Text
        variant="eyebrow"
        style={[
          styles.label,
          dashed && styles.labelUnconfirmed,
          tone === 'moved-quiet' && styles.labelUnconfirmed,
          tone === 'moved' && styles.labelMoved,
          tone === 'moved-danger' && styles.labelMovedDanger,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    height: 20,
    borderRadius: radius.base,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  /** Dashed neutral ink. Never red, never an alert triangle — those say the
      product is broken. Dashed says: open, nothing was impressed here. */
  unconfirmed: {
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    backgroundColor: 'transparent',
  },
  /**
   * `doubted` — solid edge, no fill, no amber. The law has moved a little and
   * the judgment still binds, so it earns a mark but not a colour.
   */
  movedQuiet: { borderColor: color.rule, backgroundColor: color.card },
  /** Solid, filled block. Amber means exactly one thing: the law has moved. */
  moved: { borderColor: state.caution, backgroundColor: state.cautionWash },
  movedDanger: { borderColor: state.danger, backgroundColor: state.danger },

  label: { fontSize: 10, letterSpacing: 0.6 },
  labelUnconfirmed: { color: color.inkMuted },
  labelMoved: { color: state.cautionText },
  labelMovedDanger: { color: color.card },
});
