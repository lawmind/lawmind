import { forwardRef, useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View, type View as RNView } from 'react-native';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { CalendarDays, FileText, FolderOpen, Search } from 'lucide-react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Pressable } from './Pressable';
import { Text } from './Text';
import { easing } from '../theme/easing';
import { haptics } from '../theme/haptics';
import { color, size, space } from '../theme/tokens';

/**
 * FOUR TABS, never a hamburger. Primary actions live in the bottom third —
 * the advocate is holding a physical file with the other hand.
 *
 * Active = `oxblood` 2px top rule + `ink` filled icon + `ink` label.
 * Inactive = `ink-faint`. No filled icons anywhere except the active tab.
 *
 * The bar itself is composed in `app/(tabs)/_layout.tsx` rather than here:
 * `expo-router/ui` discovers its triggers by walking the children of `Tabs`,
 * and it does not descend into a custom component. Wrapping the `TabList` in a
 * `TabBar` component would silently produce a tab bar with no tabs.
 */
export const TABS = [
  { name: 'today', href: '/today', label: 'Today', Icon: CalendarDays },
  { name: 'search', href: '/search', label: 'Search', Icon: Search },
  { name: 'matters', href: '/matters', label: 'Matters', Icon: FolderOpen },
  { name: 'drafts', href: '/drafts', label: 'Drafts', Icon: FileText },
] as const;

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  Icon: (typeof TABS)[number]['Icon'];
};

export const TabButton = forwardRef<RNView, TabButtonProps>(function TabButton(
  { label, Icon, isFocused, onPress, ...rest },
  ref
) {
  return (
    <Pressable
      {...rest}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      // A tab carries `shift`, not `tap`: it is a change of place, not a press.
      haptic={false}
      onPress={(event) => {
        if (!isFocused) haptics.shift();
        onPress?.(event);
      }}
      ref={ref}
      style={styles.tab}
    >
      <Icon
        color={isFocused ? color.ink : color.inkFaint}
        fill={isFocused ? color.ink : 'transparent'}
        size={22}
        strokeWidth={isFocused ? 1.7 : 1.6}
      />
      <Text variant="ui" style={isFocused ? styles.labelOn : styles.labelOff}>
        {label}
      </Text>
    </Pressable>
  );
});

/**
 * THE ACTIVE RULE IS ONE RULE THAT MOVES, not four that switch on and off.
 *
 * It used to live inside each `TabButton` as a hard `backgroundColor` swap:
 * the rule at the old tab vanished and a different rule at the new tab
 * appeared. Two events. What the eye is told by a rule that TRAVELS is that
 * there is one marker and it went somewhere — which is the truth about tabs,
 * and it makes the destination obvious in peripheral vision.
 *
 * That is only expressible from the BAR, because nothing inside one tab can
 * move to another. It is absolutely positioned, so it takes no space in the row
 * and the four triggers stay direct children of `TabList` — which the router
 * requires, since it discovers triggers by walking children.
 *
 * 180ms and `easing.inOut`, because this is a thing MOVING on screen rather
 * than entering it. Tabs are used tens of times a day, so the budget is
 * near-imperceptible: the rule travels and nothing else does. The icon and
 * label still change instantly.
 */
export function TabActiveRule({ activeIndex }: { activeIndex: number }) {
  const { width } = useWindowDimensions();
  const tabWidth = width / TABS.length;
  const offset = useSharedValue(activeIndex * tabWidth);

  useEffect(() => {
    offset.value = withTiming(activeIndex * tabWidth, {
      duration: 180,
      easing: easing.inOut,
      // A position change, so Reduce Motion jumps it. The rule is still
      // exactly where it must be — it simply gets there without travelling.
      reduceMotion: ReduceMotion.System,
    });
  }, [activeIndex, tabWidth, offset]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.activeRule, { width: tabWidth }, style]}
    />
  );
}

export const tabBarStyles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingBottom: size.tabBarInset },
});

const styles = StyleSheet.create({
  tab: { flex: 1, alignItems: 'center', paddingTop: space.xs, gap: 2 },
  activeRule: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: size.tabActiveRule,
    backgroundColor: color.oxblood,
  },
  labelOn: { color: color.ink },
  labelOff: { color: color.inkFaint },
});
