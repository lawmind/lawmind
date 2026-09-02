import { authDecision } from './AuthBoundary';

/**
 * WHO CAN REACH ACCOUNT DELETION, AND THE ONE WHO CANNOT.
 *
 * Apple's guideline 5.1.1(v) is about the ACCOUNT: an app that lets someone
 * create one must let them start deleting it from inside the app. Lawmind does
 * — `/delete-account` posts `{ kind: 'erasure' }` to `POST /me/data-requests`
 * and an operator completes it. That path works for a signed-in advocate and is
 * covered by `screens/settings/DeleteAccountScreen.test.tsx`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `identity_only` IS AN ACCOUNT THAT CANNOT ASK TO BE DELETED — AND THE REASON
 * IS ON THE SERVER, NOT HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An advocate who followed a magic link and then abandoned onboarding is
 * `identity_only`: real auth identity, real tokens, no `users` row. The gate
 * sends every route except onboarding and the auth routes to `/onboarding`, so
 * `/delete-account` is unreachable for them.
 *
 * OPENING THE ROUTE WOULD NOT FIX IT, AND THAT IS THE POINT OF THIS TEST.
 * `app.ts:373` resolves the caller with `profileIdFor(sql, authId)`, which is
 * `SELECT id FROM users WHERE auth_id = …` (`auth/middleware.ts:54-61`) and
 * returns `undefined` when no `users` row exists. `createDataRequest` answers a
 * missing id with `401 AUTH_REQUIRED` before it reads anything
 * (`auth/data-requests.ts`). So an `identity_only` advocate let through to this
 * screen would get a confirm box that 401s every time — a deletion path that
 * reliably fails is worse than a route that honestly is not there yet.
 *
 * The fix is a server one and it is filed, not invented here: RCC does not
 * write `services/**`, and faking deletion for a population the endpoint
 * refuses would be the exact failure `CLAUDE.md` §7 names.
 *
 * WHAT THIS TEST IS FOR. It fails the moment someone adds `/delete-account` to
 * `IDENTITY_ONLY_ROUTES` — which is the right change to make, but only AFTER
 * the endpoint can serve a caller with no `users` row. Whoever makes it must
 * come here, read this, and delete the assertion deliberately. That is the
 * whole mechanism.
 */

const DELETE_ROUTE = '/delete-account';

describe('account deletion is reachable for the advocate the endpoint can serve', () => {
  it('mounts for a signed-in advocate', () => {
    const d = authDecision('signed_in', DELETE_ROUTE);
    expect(d.render).toBe('children');
    expect(d.redirectTo).toBeNull();
  });

  it('is behind the sign-in wall when signed out — an account is needed to delete one', () => {
    const d = authDecision('signed_out', DELETE_ROUTE);
    expect(d.render).toBe('nothing');
    expect(d.redirectTo).toBe('/sign-in');
  });

  /**
   * PINNED DELIBERATELY. See the module note: this is a known gap whose repair
   * is on the server, and opening the route before that repair lands would ship
   * a confirm box that 401s.
   */
  it('is NOT open to identity_only, because POST /me/data-requests would 401', () => {
    const d = authDecision('identity_only', DELETE_ROUTE);
    expect(d.render).toBe('nothing');
    expect(d.redirectTo).toBe('/onboarding');
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
