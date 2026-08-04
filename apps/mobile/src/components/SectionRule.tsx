import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { color, space } from '../theme/tokens';

/**
 * Eyebrow plus a 1px rule filling the remaining width. Most emphasis in this
 * product should come from a rule or from space rather than from colour — this
 * is the component that makes that cheap to reach for.
 *
 * The eyebrow drops its letterspaced-uppercase treatment in Hindi; `Text`
 * handles that, and no caller needs to know.
 */
export function SectionRule({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant="eyebrow" style={[styles.label, accent ? styles.accent : null]}>
        {label}
      </Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  accent: { color: color.oxblood },
  /**
   * THE LABEL SHRINKS; THE RULE NEVER DISAPPEARS.
   *
   * At an OS text scale of 2.0 the eyebrow grows wide enough to consume the
   * whole row: with no `flexShrink` it pushed past the right edge and squeezed
   * the rule to nothing, so the section heading lost both its rule and its last
   * characters. `flexShrink` lets the label wrap instead of overflow, and
   * `minWidth` keeps a visible rule at any setting — the rule is how a section
   * reads as a section, and most emphasis in this product is supposed to come
   * from a rule or from space rather than from colour.
   */
  label: { flexShrink: 1 },
  rule: { flex: 1, minWidth: space.md, height: 1, backgroundColor: color.rule },
});
