import { authDecision } from './AuthBoundary';
import { isCapturableDestination } from '../state/pendingDestination';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE UNKNOWN WINDOW — the frames between launch and the keychain answering,
 * and the second half of the Android auth-resume P0.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `unknown` was treated as "not a destination": render nothing, redirect
 * nowhere, HOLD NOTHING. Two of those three are right and stay. The third was
 * wrong, and the reason is an ordering nobody wrote down.
 *
 * A cold start from an external link puts the app on `/matter/<id>` while the
 * session is still `unknown`. Holding nothing there is only safe if the
 * pathname is still `/matter/<id>` when the keychain finally answers — and it
 * need not be. `app/index.tsx` and the router's own settling can move the app
 * to `/today` inside that window, and `/today` is not capturable, so the
 * signed-out pass that follows captures NOTHING. The link is gone before the
 * gate that was supposed to hold it ever sees it.
 *
 * The old assertion's reasoning — "a launch is not a destination" — is honoured
 * by `isCapturableDestination`, not by the gate. A plain launch lands on
 * `/today` or `/`, and the store refuses both. That filter is the right place
 * for it: it is a property of the ROUTE, not of the auth state that happened to
 * be unresolved when the route appeared.
 *
 * WHAT MUST NOT CHANGE, and is asserted here alongside:
 *   - no protected screen mounts while the answer is unknown
 *   - no redirect fires, so an already-signed-in advocate never sees sign-in
 *     flash at them on launch
 */

const PROTECTED = [
  '/judgment/abc',
  '/matter/m1',
  '/matters',
  '/search',
  '/acts/bns-2023',
  '/settings',
  '/adjournment/m1',
  '/coverage',
];

describe('unknown auth holds the destination without mounting or redirecting', () => {
  it.each(PROTECTED)('mounts nothing, redirects nowhere and holds %s', (path) => {
    const d = authDecision('unknown', path);
    expect(d.render).toBe('nothing');
    expect(d.redirectTo).toBeNull();
    expect(d.hold).toBe(true);
  });

  /**
   * THE AUTH ROUTES ARE NOT HELD, AT ANY STATUS. `/auth/verify` carries a
   * single-use token and replaying it is read by the server as a REPLAY, which
   * revokes every session the advocate has. The gate refuses to hold it and the
   * store refuses to capture it — two independent refusals, because this one is
   * not recoverable.
   */
  it.each(['/sign-in', '/auth/verify'])('never holds %s', (path) => {
    expect(authDecision('unknown', path).hold).toBe(false);
    expect(isCapturableDestination(path)).toBe(false);
  });

  /**
   * The gate is handed `usePathname()`, which carries no query — so the token
   * form is refused by the store, which is handed the reconstructed href. This
   * is the refusal that actually fires in the app, and it is asserted where it
   * lives rather than where it would be convenient.
   */
  it('refuses a verify link carrying its token, at the store', () => {
    expect(isCapturableDestination('/auth/verify?token=abc')).toBe(false);
  });

  /**
   * A LAUNCH IS STILL NOT A DESTINATION — enforced where it belongs. The gate
   * may hold `/today`; the store throws it away, so the outcome the old
   * assertion protected is unchanged.
   */
  it('holds Today at the gate and the store discards it anyway', () => {
    expect(authDecision('unknown', '/today').hold).toBe(true);
    expect(isCapturableDestination('/today')).toBe(false);
    expect(isCapturableDestination('/')).toBe(false);
  });
});
