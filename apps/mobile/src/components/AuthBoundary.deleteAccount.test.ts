import { authDecision } from './AuthBoundary';

/**
 * WHO CAN REACH ACCOUNT DELETION — AND, SINCE 2 SEPTEMBER 2026, THAT IS EVERY
 * ADVOCATE WHO HAS AN ACCOUNT.
 *
 * Apple's guideline 5.1.1(v) is about the ACCOUNT: an app that lets someone
 * create one must let them start deleting it from inside the app. Lawmind does
 * — `/delete-account` posts `{ kind: 'erasure' }` to `POST /me/data-requests`
 * and an operator completes it. The signed-in path is covered by
 * `screens/settings/DeleteAccountScreen.test.tsx`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PIN THAT USED TO BE HERE, AND WHY IT IS GONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file previously asserted the OPPOSITE for `identity_only` — an advocate
 * who followed a magic link and abandoned onboarding: real auth identity, real
 * tokens, no `users` row. It was pinned deliberately and it was right at the
 * time. `POST /me/data-requests` resolved its caller with `profileIdFor`
 * (`SELECT id FROM users WHERE auth_id = …`), got `undefined`, and refused —
 * `AUTH_REQUIRED` in `auth/data-requests.ts`, rewritten by `resolveAuthFailure`
 * in `envelope.ts` to `403 PROFILE_INCOMPLETE` on the way out, because the
 * caller DID have an `authId`. So the wire status was 403, not the 401 the
 * source line reads, and either way the screen would have been a confirm box
 * that refused every time. A deletion path that reliably fails is worse than
 * one that is honestly not there yet.
 *
 * The old note said whoever opened the route must come here, read this, and
 * delete the assertion deliberately, AFTER the endpoint could serve a caller
 * with no `users` row. That is what happened. LCC R26 landed `ab4b4989` and the
 * endpoint was re-read at HEAD rather than taken from the handoff:
 * `createDataRequest` now refuses only a caller with no `authId` at all, inserts
 * `user_id` as NULL, and `GET /me/data-requests` resolves the same principal so
 * the advocate can see the request they just made.
 *
 * WHAT REPLACES THE PIN. The refusal that must survive is the one for a caller
 * with NO identity — signed out. That is asserted below, and it is the only
 * remaining wall on this route.
 */

const DELETE_ROUTE = '/delete-account';

describe('account deletion is reachable for every advocate who has an account', () => {
  it('mounts for a signed-in advocate', () => {
    const d = authDecision('signed_in', DELETE_ROUTE);
    expect(d.render).toBe('children');
    expect(d.redirectTo).toBeNull();
  });

  /**
   * THE CHANGE. `identity_only` is an account — `auth_user` holds the email and
   * name, `auth_session` an IP address and user-agent per session,
   * `auth_verification` magic-link artifacts keyed by the email with no foreign
   * key to cascade from, `refresh_tokens` a hashed family. All personal data
   * under DPDP whether or not onboarding finished.
   */
  it('mounts for identity_only, with no detour through onboarding', () => {
    const d = authDecision('identity_only', DELETE_ROUTE);
    expect(d.render).toBe('children');
    expect(d.redirectTo).toBeNull();
    // Not merely "does not redirect to /onboarding" — nothing is held, because
    // there is nothing to come back from.
    expect(d.hold).toBe(false);
  });

  /**
   * ONBOARDING IS STILL THE DESTINATION FOR EVERYTHING ELSE. Opening one route
   * must not open the app: an `identity_only` advocate still cannot reach the
   * matter file, search, or the drafts tab.
   */
  it.each(['/today', '/matter/m1', '/settings', '/search'])(
    'still sends identity_only from %s to onboarding',
    (route) => {
      const d = authDecision('identity_only', route);
      expect(d.render).toBe('nothing');
      expect(d.redirectTo).toBe('/onboarding');
    },
  );

  it('is behind the sign-in wall when signed out — an account is needed to delete one', () => {
    const d = authDecision('signed_out', DELETE_ROUTE);
    expect(d.render).toBe('nothing');
    expect(d.redirectTo).toBe('/sign-in');
  });

  /**
   * The unresolved window must not decide anything either way — it renders
   * nothing and HOLDS the destination, so a cold start straight onto the
   * deletion screen resumes there once the keychain answers rather than
   * silently landing the advocate on Today.
   */
  it('holds the destination while the session is still unknown', () => {
    const d = authDecision('unknown', DELETE_ROUTE);
    expect(d.render).toBe('nothing');
    expect(d.redirectTo).toBeNull();
    expect(d.hold).toBe(true);
  });
});
