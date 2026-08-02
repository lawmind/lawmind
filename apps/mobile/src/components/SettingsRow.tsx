import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { Pressable } from './Pressable';
import { Text } from './Text';
import { color, control, size, space } from '../theme/tokens';

/**
 * A FIXED-WIDTH CONTROL COLUMN. This is the fix for the misaligned toggles.
 *
 * Every control — switch, value text, chevron — terminates on ONE right-hand
 * axis regardless of type, and rows with and without a subtitle keep the same
 * optical centre. Let the control size the column and the axis moves per row,
 * which is exactly what looked wrong in v1.
 */
export function SettingsRow({
  label,
  subtitle,
  value,
  control: controlNode,
  onPress,
}: {
  label: string;
  subtitle?: string;
  /** Right-hand value text, for a row that opens a picker rather than toggling. */
  value?: string;
  /** A Switch, or anything else that terminates the row. */
  control?: ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.row}>
      <View style={styles.labels}>
        <Text variant="ui">{label}</Text>
        {subtitle ? (
          <Text variant="ui" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.controlColumn}>
        {controlNode ??
          (value ? (
            <Text variant="ui" style={styles.value}>
              {value}
            </Text>
          ) : onPress ? (
            <ChevronRight color={color.inkFaint} size={20} strokeWidth={1.5} />
          ) : null)}
      </View>
    </View>
  );

  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.settingsRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  labels: { flex: 1, minWidth: 0 },
  subtitle: { color: color.inkMuted },
  controlColumn: {
    width: Math.max(control.switchTrack.width, size.settingsControlColumn),
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  value: { color: color.inkMuted },
});
