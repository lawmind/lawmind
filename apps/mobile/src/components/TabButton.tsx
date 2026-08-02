import { forwardRef } from 'react';
import { StyleSheet, View, type View as RNView } from 'react-native';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { CalendarDays, FileText, FolderOpen, Search } from 'lucide-react-native';

import { Pressable } from './Pressable';
import { Text } from './Text';
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
      <View style={[styles.activeRule, isFocused ? styles.activeRuleOn : null]} />
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

export const tabBarStyles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingBottom: size.tabBarInset },
});

const styles = StyleSheet.create({
  tab: { flex: 1, alignItems: 'center', paddingTop: space.xs, gap: 2 },
  activeRule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: size.tabActiveRule,
    backgroundColor: 'transparent',
  },
  activeRuleOn: { backgroundColor: color.oxblood },
  labelOn: { color: color.ink },
  labelOff: { color: color.inkFaint },
});
