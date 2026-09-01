import { useEffect, type ReactNode } from 'react';
import { Redirect, useGlobalSearchParams, usePathname } from 'expo-router';

import { useSession, type SessionStatus } from '../state/session';
import { usePendingDestination } from '../state/pendingDestination';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GLOBAL AUTH BOUNDARY — the one this app did not have.
 *
 * Before this, `app/index.tsx` redirected unconditionally to `/today` behind a
 * comment saying "there is no auth state to branch on yet", which stopped being
 * true at S5; only `TodayScreen` and `MattersScreen` handled `signed_out`; and
 * every other route — judgment, matter, search, acts, settings, profile,
 * briefing, adjournment, client-update, precedent, subscription — mounted for a
 * signed-out advocate and issued API calls that 401.
 *
 * IT REFUSES TO MOUNT, IT DOES NOT HIDE. Same rule as
 * `components/CapabilityBoundary.tsx`: children are not rendered while the gate
 * is closed, so their fetch effects never run and no protected content reaches
 * the screen — not even for the frame before a redirect settles.
 *
 * `unknown` RENDERS NOTHING, INCLUDING ON PUBLIC ROUTES. It is the state
 * between launch and the keychain answering, and it is brief. Rendering the
 * sign-in screen during it would flash sign-in at an advocate who is already
 * signed in, every launch; rendering a protected screen during it would leak.
 * The splash is still up.
 *
 * THE DESTINATION IS HELD BEFORE THE REDIRECT, NOT AFTER.
 * `state/pendingDestination.ts` records where the advocate was going, on this
 * device only, and `auth/verify.tsx` and onboarding consume it. That is the
 * whole of "followed a link to a judgment, was bounced to sign in, and came
 * back to the judgment".
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Renderable with no tokens at all. Nothing else is. */
const SIGNED_OUT_ROUTES = ['/sign-in', '/auth/verify'] as const;

/**
 * Renderable with tokens but no profile. `/onboarding` is the destination for
 * that state, and the two above stay open so a spent link and a re-sign-in both
 * have somewhere to land.
 */
const IDENTITY_ONLY_ROUTES = ['/onboarding', ...SIGNED_OUT_ROUTES] as const;

function isOneOf(pathname: string, routes: readonly string[]): boolean {
  return routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Where the gate sends this status from this path, and whether the path is
 * worth holding on the way. Pure, so the routing rule is testable without a
 * router, a keychain or a rendered tree — the same reason
 * `state/capabilities.ts` keeps `surfaceEnabled` outside its store.
 */
export function authDecision(
  status: SessionStatus,
  pathname: string,
): { render: 'children' | 'nothing'; redirectTo: string | null; hold: boolean } {
  if (status === 'unknown') return { render: 'nothing', redirectTo: null, hold: false };
  if (status === 'signed_in') return { render: 'children', redirectTo: null, hold: false };

  if (status === 'identity_only') {
    if (isOneOf(pathname, IDENTITY_ONLY_ROUTES)) {
      return { render: 'children', redirectTo: null, hold: false };
    }
    return { render: 'nothing', redirectTo: '/onboarding', hold: true };
  }

  if (isOneOf(pathname, SIGNED_OUT_ROUTES)) {
    return { render: 'children', redirectTo: null, hold: false };
  }
  return { render: 'nothing', redirectTo: '/sign-in', hold: true };
}

/**
 * Rebuilds the href the advocate asked for, params included.
 *
 * A judgment link is `/judgment/abc`, but a shared paragraph is
 * `/judgment/abc?paragraph=23` and resuming to the judgment without the
 * paragraph is a different destination — it lands the advocate at the top of a
 * thirty-page judgment somebody pointed them into the middle of. Route params
 * that expo-router already spent on the path (`id`) are dropped, because
 * re-appending them would produce `/judgment/abc?id=abc`.
 */
export function hrefWithParams(pathname: string, params: Record<string, unknown>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single !== 'string' && typeof single !== 'number') continue;
    const asString = String(single);
    // Consumed by the path itself — `/judgment/[id]` already carries `id`.
    if (pathname.split('/').includes(asString)) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(asString)}`);
  }
  return pairs.length > 0 ? `${pathname}?${pairs.join('&')}` : pathname;
}

export function AuthBoundary({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const capture = usePendingDestination((s) => s.capture);

  const decision = authDecision(status, pathname);
  const href = hrefWithParams(pathname, params as Record<string, unknown>);

  /**
   * THE HOLD IS AN EFFECT, NOT A RENDER SIDE EFFECT. Writing to a zustand store
   * during render is what produces the "cannot update a component while
   * rendering a different component" warning, and here it would also race the
   * redirect: the store update re-renders this boundary mid-commit.
   */
  useEffect(() => {
    if (decision.hold) capture(href);
  }, [decision.hold, href, capture]);

  if (decision.redirectTo) return <Redirect href={decision.redirectTo as never} />;
  if (decision.render === 'nothing') return null;
  return <>{children}</>;
}
