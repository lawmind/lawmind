import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from './Pressable';
import { Text } from './Text';
import { color, radius, size, space } from '../theme/tokens';

/**
 * 2px radius, 52px tall. One accent per card: the action.
 *
 * A bound reporter has square corners; soft ones were doing most of the
 * "startup toy" work. There is no `large`, no `pill` and no `ghost` — the four
 * below are the whole set, and `primary` is the oxblood that the restraint rule
 * counts.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  const surface = disabled ? styles.disabled : styles[variant];
  const labelColor = disabled
    ? color.inkFaint
    : variant === 'primary'
      ? color.card
      : color.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      haptic={!disabled}
      onPress={onPress}
      style={style}
    >
      <View style={[styles.base, surface]}>
        <Text variant="uiStrong" style={{ color: labelColor }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: size.button,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  primary: { backgroundColor: color.oxblood },
  secondary: { backgroundColor: color.card, borderWidth: 1, borderColor: color.ink },
  tertiary: { backgroundColor: color.card, borderWidth: 1, borderColor: color.rule },
  disabled: { backgroundColor: color.rule },
});
