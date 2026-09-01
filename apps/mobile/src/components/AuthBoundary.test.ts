import { authDecision, hrefWithParams } from './AuthBoundary';

/**
 * THE GLOBAL AUTH GATE, AS A TABLE.
 *
 * NEW3 R15 P1 named the shape of what was missing: every route except Today and
 * Matters mounted for a signed-out advocate and issued API calls that 401, and
 * `app/index.tsx` redirected unconditionally to `/today` behind a comment saying
 * there was no auth state to branch on — which stopped being true at S5.
 *
 * `authDecision` is pure so the rule can be asserted without a router, a
 * keychain or a rendered tree. The same reason `state/capabilities.ts` keeps
 * `surfaceEnabled` outside its store.
 */

const PROTECTED = [
  '/judgment/abc',
  '/matter/m1',
  '/matters',
  '/search',
  '/acts',
  '/acts/bns-2023',
  '/settings',
  '/profile',
  '/adjournment/m1',
  '/cause-list',
  '/coverage',
  '/subscription',
  '/matter-sharing/m1',
  '/today',
];

describe('signed_out', () => {
  it.each(PROTECTED)('refuses to mount %s and sends the advocate to sign in', (path) => {
    const d = authDecision('signed_out', path);
    expect(d.redirectTo).toBe('/sign-in');
    // NOT MERELY HIDDEN. Children unmounted means their fetch effects never
    // run, so no protected content reaches the screen and nothing 401s.
    expect(d.render).toBe('nothing');
    expect(d.hold).toBe(true);
  });

  it('lets sign-in itself render', () => {
    expect(authDecision('signed_out', '/sign-in')).toEqual({
      render: 'children',
      redirectTo: null,
      hold: false,
    });
  });

  /** The magic link lands here with no session yet — that is the whole point. */
  it('lets the verify screen render', () => {
    expect(authDecision('signed_out', '/auth/verify').render).toBe('children');
  });

  it('does not hold a destination it is already rendering', () => {
    expect(authDecision('signed_out', '/sign-in').hold).toBe(false);
    expect(authDecision('signed_out', '/auth/verify').hold).toBe(false);
  });
});

describe('identity_only — tokens, no profile', () => {
  it('sends a protected route to onboarding, holding the destination', () => {
    const d = authDecision('identity_only', '/judgment/abc');
    expect(d.redirectTo).toBe('/onboarding');
    expect(d.render).toBe('nothing');
    // Held, not spent: `auth/verify.tsx` deliberately does not consume for this
    // state, so the link survives onboarding and is resumed after it.
    expect(d.hold).toBe(true);
  });

  it('lets onboarding render', () => {
    expect(authDecision('identity_only', '/onboarding').render).toBe('children');
  });

  it('lets a re-sign-in and a fresh verify render', () => {
    expect(authDecision('identity_only', '/sign-in').render).toBe('children');
    expect(authDecision('identity_only', '/auth/verify').render).toBe('children');
  });
});

describe('signed_in', () => {
  it.each([...PROTECTED, '/sign-in', '/onboarding'])('mounts %s', (path) => {
    expect(authDecision('signed_in', path)).toEqual({
      render: 'children',
      redirectTo: null,
      hold: false,
    });
  });
});

/**
 * `unknown` IS THE STATE BETWEEN LAUNCH AND THE KEYCHAIN ANSWERING.
 *
 * Redirecting on it would flash sign-in at an already-signed-in advocate on
 * every single launch and then bounce them back; rendering the child would leak
 * a protected screen for the frames before the answer arrives. Neither.
 *
 * ── THE THIRD FIELD CHANGED, 1 September 2026 ───────────────────────────────
 *
 * This block used to assert `hold: false` for every path, on the reasoning that
 * "a launch is not a destination". That reasoning survives; the place it is
 * enforced does not. A plain launch lands on `/today` or `/`, and
 * `isCapturableDestination` refuses both — so the filter belongs to the ROUTE.
 * Holding nothing at the gate lost a cold-start deep link outright whenever the
 * router settled off it before the keychain answered, which was the Android
 * auth-resume P0. The hold rule now lives in `AuthBoundary.unknown.test.ts`,
 * with the ordering that produced the loss written out; what stays here is the
 * pair that did not change.
 */
describe('unknown', () => {
  it.each([...PROTECTED, '/sign-in'])('renders nothing at %s and redirects nowhere', (path) => {
    const d = authDecision('unknown', path);
    expect(d.render).toBe('nothing');
    expect(d.redirectTo).toBeNull();
  });
});

/**
 * AN INVALID ROUTE IS STILL A ROUTE. It is protected like any other, so a
 * signed-out advocate signs in and then lands on `+not-found` — which is the
 * truthful answer to the address they typed, and it terminates rather than
 * looping.
 */
describe('an invalid destination', () => {
  it('is gated like any other and then answered honestly', () => {
    expect(authDecision('signed_out', '/no-such-screen').redirectTo).toBe('/sign-in');
    expect(authDecision('signed_in', '/no-such-screen').render).toBe('children');
  });
});

describe('hrefWithParams', () => {
  it('keeps a query param that changes the destination', () => {
    expect(hrefWithParams('/judgment/abc', { id: 'abc', paragraph: '23' })).toBe(
      '/judgment/abc?paragraph=23',
    );
  });

  /**
   * A ROUTE PARAM IS ALREADY IN THE PATH. Re-appending it would produce
   * `/judgment/abc?id=abc`, which is a different string for the same screen and
   * would defeat the "already held" check on capture.
   */
  it('drops params expo-router already spent on the path', () => {
    expect(hrefWithParams('/judgment/abc', { id: 'abc' })).toBe('/judgment/abc');
    expect(hrefWithParams('/matter/m1', { id: 'm1' })).toBe('/matter/m1');
  });

  it('is the bare path when there is nothing to carry', () => {
    expect(hrefWithParams('/matters', {})).toBe('/matters');
  });

  it('encodes rather than concatenating', () => {
    expect(hrefWithParams('/search', { q: 'bail & arrest' })).toBe('/search?q=bail%20%26%20arrest');
  });

  it('ignores undefined and non-scalar params instead of stringifying them', () => {
    expect(hrefWithParams('/search', { q: undefined, filters: { court: 'sc' } })).toBe('/search');
  });
});
