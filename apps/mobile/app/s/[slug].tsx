import { Redirect, useLocalSearchParams } from 'expo-router';

import { ScreenShell } from '../../src/screens/ScreenShell';
import { APP_SCREENS } from '../../src/screens/manifest';
import { REAL_ROUTES } from '../../src/screens/realRoutes';

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
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BUILD SCAFFOLDING, AND IT LEFT THE BINARY — NEW3 R18, bus 1704.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `SLUG_ROUTE_CLASSIFICATION = C_INTERNAL_SCREEN_MANIFEST_TOOL`,
 * `SLUG_ROUTE_DECISION = DEV_GUARD`, `SLUG_ROUTE_CAPABILITY = NONE` —
 * `docs/product/V1_CLAIMS_REGISTER_R16.md` §2. Measured at HEAD 13f558d1: of 98
 * manifest rows, 17 redirect to a real screen and 81 mount `ScreenShell` in a
 * RELEASE build; 54 of those carry `notes` prose and 53 of those render it.
 * Sampled: `sign-in-enrolment-number :: "Second frame. Enrolment number, not
 * email"` — describing a sign-in mechanism this product does not have, on a
 * screen an advocate could reach.
 *
 * THE GUARD IS THE FIX, NOT AN AUDIT OF TODAY'S STRINGS. A hundred rows of
 * internal design prose behind an unguarded dynamic route is a standing
 * GENERATOR of unadjudicated claims: every future row is a new
 * production-reachable sentence written by somebody documenting a mockup.
 * Auditing today's contents proves today's contents.
 *
 * It was worse than unaudited. `r16Surfaces.test.ts` skips `manifest.ts` by
 * filename, so the audit that exists to catch claims was structurally incapable
 * of catching the one that was there. Guarding the route makes that exemption
 * CORRECT rather than dangerous — an audit may legitimately skip a file that
 * cannot reach production.
 *
 * `manifest.ts` IS NOT EDITED FOR THIS. Its prose is fine where it belongs; the
 * route is what was wrong. Same guard, same shape as `app/directory.tsx` and
 * `app/gallery.tsx`, which were fixed this way for this exact exposure —
 * `__DEV__` is false in a release bundle and the metro minifier drops the dead
 * branch, so in production this answers with the same "that route does not
 * exist" an unknown slug gets. Development use is untouched.
 *
 * WHAT THIS COSTS: the 17 rows that redirect to a real screen stop redirecting
 * in production too. Nothing in the app links to `/s/<slug>` — the only two
 * places that do are `directory.tsx` and the `+not-found` recovery action, and
 * both are already `__DEV__`-guarded — so no production path loses a
 * destination. Those 17 real screens keep their own routes and are reached by
 * them.
 */
export default function Route() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  // AFTER the hook, not before it: `directory.tsx` can guard on its first line
  // because it calls none, and a conditional hook here would be a rules-of-hooks
  // violation for the sake of one statement's position. `__DEV__` is a build
  // constant either way, so the branch below is dead code the minifier drops.
  if (!__DEV__) return <Redirect href="/+not-found" />;

  const screen = APP_SCREENS.find((s) => s.slug === slug);

  if (!screen) return <Redirect href="/+not-found" />;

  // Built in a sprint since S0 — go to the real screen, not to a shell
  // describing it. See `realRoutes.ts` for why several rows share one.
  const real = REAL_ROUTES[screen.slug];
  if (real) return <Redirect href={real} />;

  return <ScreenShell n={screen.n} />;
}
