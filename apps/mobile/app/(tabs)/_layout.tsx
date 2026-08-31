import { StyleSheet } from 'react-native';
import { useSegments } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../src/components/Glass';
import {
  TABS,
  TabActiveRule,
  TabButton,
  tabBarPaddingBottom,
  tabBarStyles,
} from '../../src/components/TabButton';
import { useSurfaceEnabled } from '../../src/state/capabilities';

/**
 * The four tabs. `expo-router/ui` rather than the default tab navigator,
 * because the bar is glass with a 2px oxblood active rule and a bottom inset
 * that clears the system bar — none of which the default bar can express.
 *
 * THE INSET IS THE DEVICE'S, AND `size.tabBarInset` IS ONLY ITS FLOOR. It was a
 * flat 30dp until 31 Aug 2026, which is the iOS home indicator and nothing else.
 * Measured on a physical Galaxy S24 (Android 16, three-button navigation): the
 * system nav bar occupies y2205–2340 of a 2340px screen while the tab row ran
 * to y2256, so the label row — `Today`, `Search`, `Matters` — was drawn inside
 * the navigation bar, beside Android's own buttons. `Math.max` rather than a
 * plain swap because a device reporting a SMALLER bottom inset than 30dp must
 * not tighten the bar below the spacing it already ships with.
 *
 * `TabList` sits DIRECTLY under `Tabs`: the router discovers triggers by
 * walking children and does not descend into a custom component. `asChild`
 * hands the row to `Glass` without an extra wrapping view.
 *
 * THE ACTIVE INDEX IS READ FROM THE ROUTE, not from the triggers. A trigger
 * knows only whether IT is focused, and a rule that slides needs to know where
 * it is sliding FROM as well as to — which only the bar can know. `useSegments`
 * is the router's own answer to that and cannot drift from the actual route.
 *
 * The rule is an extra child of `TabList` alongside the four triggers. It is
 * absolutely positioned, so it takes no space in the row, and it is not a
 * `TabTrigger`, so the router's child walk simply passes over it.
 */
export default function TabsLayout() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  /**
   * DRAFTING IS NOT IN V1 — R12 §3/§7. `POST /documents` 404s (it is blocked on
   * the countersigned DPA) and `generation.evidence_from_passages` is DISABLED
   * in the server's own registry. A tab that opens onto a feature that cannot
   * write is worse than no tab: the advocate finds it, tries it, and learns
   * the app is unfinished on the one screen that was supposed to save them
   * time.
   *
   * The route file stays in place, inert. Nothing is deleted; it is simply not
   * reachable, and it becomes reachable again by moving one row in
   * `state/capabilities.ts`.
   */
  const draftingEnabled = useSurfaceEnabled('drafting');
  const tabs = TABS.filter((tab) => tab.name !== 'drafts' || draftingEnabled);
  // Falls back to the first tab before the route settles, which is where the
  // rule already sits — so there is no opening slide from nowhere.
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => segments.includes(tab.name as never))
  );

  return (
    <Tabs>
      <TabSlot />
      {/*
       * `StyleSheet.flatten` IS REQUIRED, NOT TIDINESS. `TabList asChild` hands
       * this style to a `<Slot>` child, and expo-router throws on an array —
       * "You are passing an array of styles to a child of <Slot>". Observed as a
       * red-box error on device 31 Aug 2026 when this was first written as
       * `style={[...]}`. Do not collapse it back to an array literal.
       */}
      <TabList asChild>
        <Glass
          edge="top"
          style={StyleSheet.flatten([
            tabBarStyles.bar,
            { paddingBottom: tabBarPaddingBottom(insets.bottom) },
          ])}
        >
          <TabActiveRule activeIndex={activeIndex} />
          {tabs.map(({ name, href, label, Icon }) => (
            <TabTrigger asChild href={href} key={name} name={name}>
              <TabButton Icon={Icon} label={label} />
            </TabTrigger>
          ))}
        </Glass>
      </TabList>
    </Tabs>
  );
}
