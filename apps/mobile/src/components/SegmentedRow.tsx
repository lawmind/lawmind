import { StyleSheet, View } from 'react-native';

import { Pressable } from './Pressable';
import { Text } from './Text';
import { color, radius, space } from '../theme/tokens';

/**
 * A single choice among a few, drawn as a row of segments.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * N-8 — WHY THIS FILE EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate C reported the *Case type* and *Our side* chips as visually selected
 * while the accessibility tree said otherwise. The cause was not a wrong value
 * anywhere — it was that **nobody ever told the accessibility tree**, and that
 * this component existed TWICE.
 *
 * `NewMatterScreen.tsx` and `ManageMatterScreen.tsx` each carried their own
 * `SegmentedRow`, with byte-identical styles and two different bugs:
 *
 *   NewMatterScreen     no `accessibilityRole` and no `accessibilityState`
 *   ManageMatterScreen  `accessibilityRole="button"`, still no state — so the
 *                       tree reported a button whose `selected` defaulted false,
 *                       which is the `selected="false"` in the Gate-C finding
 *
 * Fixing one copy would have left the other wrong and a later round would have
 * found it again. **The duplication is the root cause**, so there is now one
 * component. The styles below are moved verbatim from those two screens and
 * nothing about the appearance changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A SCREEN READER IS TOLD, AND WHY IN THESE WORDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `accessibilityRole="button"` with `accessibilityState={{ selected }}`, which
 * is the convention `FiltersSheet`'s `Chip` already established and the one
 * `TabButton` follows with `role="tab"`. TalkBack announces "<label>, selected"
 * and VoiceOver "<label>, selected button" — the state an advocate using a
 * screen reader needs in order to know what the matter will be created as.
 *
 * `radio` + `checked` would be the more literal role for a single-choice group,
 * and it is deliberately NOT used here: it is only meaningful inside a
 * `radiogroup`, React Native's support for that container role is thin, and
 * introducing a second selection convention in a product that already has one
 * would make the next component a coin toss. If the product ever moves to
 * `radio`, it moves everywhere at once — `Chip`, `TabButton` and this — as one
 * decision rather than as drift.
 *
 * `accessibilityState` is passed rather than `aria-selected`: React Native maps
 * the former on both platforms, and the latter is web-only.
 *
 * **The touch target needs nothing added.** `minHeight: 44` is in `segment`, and
 * the house `Pressable` enforces a 44x44 floor of its own — so the target was
 * never the defect and is not touched here.
 */
export function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map((o) => {
        /**
         * Computed once and used for BOTH the style and the state, so the
         * accessibility tree cannot disagree with the pixels. Reading
         * `value === o.value` twice is how the two drifted in the first place.
         */
        const selected = value === o.value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected ? styles.segmentOn : null]}
          >
            <Text variant="ui" style={selected ? styles.segmentOnLabel : undefined}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Moved verbatim from the two screens that used to each own a copy. */
const styles = StyleSheet.create({
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  segment: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
  },
  segmentOn: { backgroundColor: color.ink, borderColor: color.ink },
  segmentOnLabel: { color: color.card },
});
