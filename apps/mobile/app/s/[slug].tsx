import { Redirect, useLocalSearchParams } from 'expo-router';

import { ScreenShell } from '../../src/screens/ScreenShell';
import { APP_SCREENS } from '../../src/screens/manifest';

/**
 * Every app screen in the inventory, from one route.
 *
 * This replaced 87 near-identical route files — six lines each, differing by a
 * single number. They were 87 places to drift, and none of them held anything a
 * real screen would keep. When a screen becomes real, extract it: add
 * `app/s/<slug>.tsx` and expo-router prefers the static route over this dynamic
 * one automatically.
 *
 * IT IS NOT A CATCH-ALL. A slug absent from the manifest falls through to
 * `+not-found` rather than rendering a blank shell that looks like a real
 * screen. That property is the whole reason this is a lookup and not a
 * pass-through, and it is what "no dead route" actually means.
 *
 * Admin sections and launch assets are deliberately unreachable here — the first
 * live on the desk, the second are App Store material with no screen.
 */
export default function Route() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const screen = APP_SCREENS.find((s) => s.slug === slug);

  if (!screen) return <Redirect href="/+not-found" />;

  return <ScreenShell n={screen.n} />;
}
