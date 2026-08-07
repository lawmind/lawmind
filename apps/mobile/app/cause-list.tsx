import { Stack, useRouter } from 'expo-router';

import { CauseListScreen } from '../src/screens/causelist/CauseListScreen';

/**
 * The daily cause list — inventory rows 97–99, canvas `12e`.
 *
 * A Stack route rather than a fifth tab: `DESIGN_SYSTEM.md` fixes the bar at
 * four tabs, and the cause list is opened FROM Today on a hearing morning
 * rather than lived in. Adding a tab for it would also push the four the
 * product decided on into five, which is a design decision and not a routing
 * one.
 */
export default function Route() {
  const router = useRouter();
  void router;
  return (
    <>
      <Stack.Screen options={{ title: 'Cause list' }} />
      <CauseListScreen />
    </>
  );
}
