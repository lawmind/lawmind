import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  RESUME_WINDOW_MS,
  isCapturableDestination,
  usePendingDestination,
} from './pendingDestination';

/**
 * THE HELD LINK — the whole of "followed a link to a judgment, was bounced to
 * sign in, and came back to the judgment".
 *
 * These assertions are about a defect with a specific shape: `auth/verify.tsx`
 * always replaced to `/today`, so the destination was DISCARDED and the link the
 * advocate followed was already spent. Every case below is a way that could
 * silently come back — a destination that resumes to sign-in, one that replays a
 * single-use token, or one that survives being used and fires again next week.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
  usePendingDestination.setState({ held: null, hydrated: false });
});

const store = () => usePendingDestination.getState();

describe('isCapturableDestination', () => {
  it('holds a judgment, a matter and a paragraph deep link', () => {
    expect(isCapturableDestination('/judgment/abc')).toBe(true);
    expect(isCapturableDestination('/matter/8f21c4')).toBe(true);
    expect(isCapturableDestination('/judgment/abc?paragraph=23')).toBe(true);
  });

  /**
   * RESUMING TO SIGN-IN IS THE LOOP THIS PREVENTS. The guard redirects to
   * `/sign-in`, the router settles there, and a capture from that settling pass
   * would replace the judgment with the sign-in screen itself.
   */
  it('refuses the auth routes', () => {
    expect(isCapturableDestination('/sign-in')).toBe(false);
    expect(isCapturableDestination('/onboarding')).toBe(false);
  });

  /**
   * A MAGIC LINK IS SINGLE USE, AND A REPLAY REVOKES EVERY SESSION THE ADVOCATE
   * HAS — `state/session.ts`, the server's own rule. Resuming to `/auth/verify`
   * would present the same spent token a second time.
   */
  it('refuses the verify route and its token', () => {
    expect(isCapturableDestination('/auth/verify')).toBe(false);
    expect(isCapturableDestination('/auth/verify?token=abc')).toBe(false);
  });

  it('does not hold Today, which is where an unresumed sign-in lands anyway', () => {
    expect(isCapturableDestination('/today')).toBe(false);
    expect(isCapturableDestination('/')).toBe(false);
  });
});

describe('capture and consume', () => {
  it('resumes the exact destination, params included', () => {
    store().capture('/judgment/abc?paragraph=23');
    expect(store().consume()).toBe('/judgment/abc?paragraph=23');
  });

  /** Consuming is destructive: a resumed destination must not fire again. */
  it('consumes exactly once', () => {
    store().capture('/matter/m1');
    expect(store().consume()).toBe('/matter/m1');
    expect(store().consume()).toBeNull();
  });

  it('returns null when nothing was ever held', () => {
    expect(store().consume()).toBeNull();
  });

  /**
   * THE FIRST CAPTURE WINS. The redirect settles through at least one more
   * route, and a second capture would displace the judgment the advocate
   * actually asked for.
   */
  it('a second capture inside the window does not displace the first', () => {
    store().capture('/judgment/abc');
    store().capture('/matter/m1');
    expect(store().consume()).toBe('/judgment/abc');
  });

  /**
   * AN EXPIRED DESTINATION IS NOT A DESTINATION. Signing in on Monday must not
   * jump to a judgment abandoned last Thursday.
   */
  it('expires past the resume window, and clears itself doing so', () => {
    store().capture('/judgment/abc');
    const later = Date.now() + RESUME_WINDOW_MS + 1;
    expect(store().consume(later)).toBeNull();
    expect(store().held).toBeNull();
  });

  it('still resumes just inside the window', () => {
    store().capture('/judgment/abc');
    expect(store().consume(Date.now() + RESUME_WINDOW_MS - 1000)).toBe('/judgment/abc');
  });

  it('a refused route is never held in the first place', () => {
    store().capture('/sign-in');
    expect(store().held).toBeNull();
    expect(store().consume()).toBeNull();
  });
});

/**
 * THE COLD START IS THE CASE THIS EXISTS FOR. The magic-link round trip leaves
 * the app for a mail client, and on Android coming back through the deep link
 * can be a fresh process. An in-memory value would already be gone.
 */
describe('surviving a process death', () => {
  it('a held destination is read back after a restart', async () => {
    store().capture('/judgment/abc?paragraph=23');
    // Whatever the previous process wrote is all the next one has.
    usePendingDestination.setState({ held: null, hydrated: false });
    await store().hydrate();
    expect(store().consume()).toBe('/judgment/abc?paragraph=23');
  });

  it('a consumed destination does not come back after a restart', async () => {
    store().capture('/judgment/abc');
    store().consume();
    usePendingDestination.setState({ held: null, hydrated: false });
    await store().hydrate();
    expect(store().consume()).toBeNull();
  });
});
