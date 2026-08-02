import { Redirect } from 'expo-router';

/**
 * Boots into Today, the primary screen.
 *
 * The real entry is Splash → sign-in → tabs (inventory rows 1, 2, 73). Those
 * are shells in Sprint 0 and there is no auth state to branch on yet, so
 * wiring a fake gate here would be a decision made by scaffolding rather than
 * by S5. Splash lives at `/s/splash` until then.
 */
export default function Index() {
  return <Redirect href="/today" />;
}
