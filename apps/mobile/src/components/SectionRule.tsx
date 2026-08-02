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
      <Text variant="eyebrow" style={accent ? styles.accent : undefined}>
        {label}
      </Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  accent: { color: color.oxblood },
  rule: { flex: 1, height: 1, backgroundColor: color.rule },
});
