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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `/delete-account` JOINED THIS LIST ON 2 SEPTEMBER 2026, AND ONLY BECAUSE THE
 * SERVER MOVED FIRST.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `AuthBoundary.deleteAccount.test.ts` pinned the opposite until today, on
 * reasoning that was correct at the time: `POST /me/data-requests` resolved its
 * caller with `profileIdFor` and answered an advocate with no `users` row
 * `AUTH_REQUIRED` — rewritten to `403 PROFILE_INCOMPLETE` by `resolveAuthFailure`
 * before it left the server — so letting them in would have shipped a confirm box
 * that refused every time. A deletion path that reliably fails is worse than one
 * that is honestly not there yet.
 *
 * LCC R26 (`ab4b4989`) made the route principal-aware, read here at HEAD in
 * `services/api/src/auth/data-requests.ts` rather than taken from the handoff:
 * `createDataRequest` now refuses only on a missing `authId`, inserts
 * `user_id` as NULL, and `GET /me/data-requests` resolves the same principal so
 * the advocate can see the request they just made.
 *
 * NO PROFILE IS CREATED AS THE PRICE OF ERASURE — not by this gate, not by the
 * screen, not silently by the server. Demanding a name and a phone number before
 * an advocate may ask to be forgotten is the DPDP defect, not the fix for it, and
 * it is why the answer here is one entry in this array rather than a detour
 * through `/onboarding`.
 */
const IDENTITY_ONLY_ROUTES = ['/onboarding', '/delete-account', ...SIGNED_OUT_ROUTES] as const;

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
  if (status === 'unknown') {
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * THE UNRESOLVED WINDOW HOLDS, IT JUST DOES NOT ACT.
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Render nothing and redirect nowhere — unchanged, and both load-bearing:
     * mounting a protected screen here would leak it for the frames before the
     * keychain answers, and redirecting would flash sign-in at an advocate who
     * is already signed in, on every launch.
     *
     * WHAT CHANGED, 1 September 2026, is the third field. `unknown` used to
     * hold nothing, on the reasoning that "a launch is not a destination". That
     * reasoning is right and it was enforced in the wrong place: a plain launch
     * lands on `/today` or `/`, and `isCapturableDestination` already throws
     * both away. Whether a route is worth holding is a property of the ROUTE,
     * not of the auth state that happened to be unresolved when it appeared.
     *
     * Holding nothing here is only safe if the pathname is STILL the advocate's
     * destination when the keychain finally answers, and it need not be. A cold
     * start from an external link puts the app on `/matter/<id>` while the
     * session is `unknown`; the router can settle to `/today` inside that
     * window; `/today` is not capturable; and the signed-out pass that follows
     * captures nothing at all. The link was gone before the gate that exists to
     * hold it ever saw it.
     *
     * The auth routes are excluded HERE as well as in the store, because that
     * one is not recoverable: resuming `/auth/verify` replays a single-use
     * token, and the server answers a replay by revoking every session the
     * advocate has.
     */
    return { render: 'nothing', redirectTo: null, hold: !isOneOf(pathname, SIGNED_OUT_ROUTES) };
  }
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
  const arrivedAt = usePendingDestination((s) => s.arrivedAt);

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
    /**
     * THE ADVOCATE ARRIVED, SO THE HOLD IS SPENT. `app/_layout.tsx` holds every
     * external link before the session status is known, because that is the only
     * moment the link exists; most of those advocates are already signed in and
     * simply land on the screen. Retiring the hold on arrival is what keeps it
     * from firing weeks later on a sign-in that had nothing to do with it.
     */
    else if (decision.render === 'children') arrivedAt(href);
  }, [decision.hold, decision.render, href, capture, arrivedAt]);

  if (decision.redirectTo) return <Redirect href={decision.redirectTo as never} />;
  if (decision.render === 'nothing') return null;
  return <>{children}</>;
}
