import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { Glass } from '../../src/components/Glass';
import { TABS, TabButton, tabBarStyles } from '../../src/components/TabButton';

/**
 * The four tabs. `expo-router/ui` rather than the default tab navigator,
 * because the bar is glass with a 2px oxblood active rule and 30px of home-
 * indicator inset — none of which the default bar can express.
 *
 * `TabList` sits DIRECTLY under `Tabs`: the router discovers triggers by
 * walking children and does not descend into a custom component. `asChild`
 * hands the row to `Glass` without an extra wrapping view.
 */
export default function TabsLayout() {
  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <Glass edge="top" style={tabBarStyles.bar}>
          {TABS.map(({ name, href, label, Icon }) => (
            <TabTrigger asChild href={href} key={name} name={name}>
              <TabButton Icon={Icon} label={label} />
            </TabTrigger>
          ))}
        </Glass>
      </TabList>
    </Tabs>
  );
}
