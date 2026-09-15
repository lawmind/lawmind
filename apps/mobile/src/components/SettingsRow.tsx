import { type ReactNode } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
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
  /**
   * THE COLUMN IS FIXED IN LAYOUT, NOT IN PIXELS.
   *
   * React Native scales `fontSize` with the OS text setting but nothing else,
   * so a column sized in raw pixels stays put while the value text inside it
   * doubles. At 2.0x the column was narrower than the word it held and
   * "English" wrapped as "Engl / ish" — a mid-word break, observed on a Galaxy
   * S24 at 2.0x.
   *
   * Scaling the column by the same factor keeps the single right-hand axis this
   * component exists to enforce AND lets the value fit. A control node (a
   * Switch) is a fixed-size object and does not scale, which is why the switch
   * track remains the floor rather than the basis.
   */
  const fontScale = PixelRatio.getFontScale();
  const controlColumnWidth = Math.max(
    control.switchTrack.width,
    size.settingsControlColumn * fontScale
  );

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
      <View style={[styles.controlColumn, { width: controlColumnWidth }]}>
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
  /**
   * `accessibilityRole` IS THE DIFFERENCE BETWEEN A LABEL AND A CONTROL.
   *
   * The row's own text is announced either way — `RNPressable` is `accessible`
   * by default and TalkBack composes the child labels. What was missing is that
   * it is actionable: without a role, an advocate using a screen reader hears
   * "Delete account" read out exactly as the static rows around it are, with
   * nothing saying it can be activated. Every other tappable row in this app
   * declares one; this shared component did not, so it was absent from every
   * settings surface at once.
   */
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  );
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
  /** Width is applied per-render — it depends on the OS font scale. */
  controlColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  value: { color: color.inkMuted },
});
