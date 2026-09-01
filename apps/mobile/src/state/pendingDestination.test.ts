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
  usePendingDestination.setState({ held: null, hydrated: false, generation: 0 });
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
   * THE FIRST CAPTURE WINS WITHIN THE SETTLE. The redirect settles through at
   * least one more route, and a second capture from that same pass would
   * displace the judgment the advocate actually asked for. Two captures in the
   * same tick are that pass.
   */
  it('a second capture inside the settle window does not displace the first', () => {
    store().capture('/judgment/abc');
    store().capture('/matter/m1');
    expect(store().consume()).toBe('/judgment/abc');
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * BUT A REAL NAVIGATION LATER IS NOT A SETTLING PASS, AND IT WINS.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The guard was bounded by `RESUME_WINDOW_MS` — thirty minutes — so it ate
   * genuine navigations. OBSERVED on a physical Galaxy S24, 1 September 2026:
   * signed in on Settings → Sign out (Settings captured, correctly) → follow a
   * shared `/matter/<id>` link → sign in → landed on **Settings**. The link the
   * advocate followed lost to the screen they happened to be on.
   *
   * This is the falsifier for that: it fails against the old thirty-minute rule
   * and passes against the settle window.
   */
  it('a capture after the settle window replaces the held destination', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-01T10:00:00.000Z'));
      store().capture('/settings');
      jest.setSystemTime(new Date('2026-09-01T10:02:00.000Z'));
      store().capture('/matter/81f06002-af68-4e8c-bef5-6fea1e77e4cf');
      expect(store().consume()).toBe('/matter/81f06002-af68-4e8c-bef5-6fea1e77e4cf');
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * AND IT NEEDS NO SIGN-OUT TO BITE. Two shared links followed within half an
   * hour resumed the FIRST one — the same defect with no session change at all.
   */
  it('the second of two followed links is the one resumed', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-01T10:00:00.000Z'));
      store().capture('/judgment/abc');
      jest.setSystemTime(new Date('2026-09-01T10:05:00.000Z'));
      store().capture('/judgment/xyz?paragraph=23');
      expect(store().consume()).toBe('/judgment/xyz?paragraph=23');
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * RE-CAPTURING THE SAME HREF WRITES NOTHING — the loop guard, and the reason
   * the first attempt at this fix took the device down.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `AuthBoundary` calls `capture(href)` from an effect while the gate is held,
   * so every re-render calls again with the same string. Narrowing the settle
   * window let those repeats through, each one wrote the store, each write
   * re-rendered a subscriber, and the S24 answered "Maximum update depth
   * exceeded". `capturedAt` not moving is the observable form of "wrote
   * nothing", and it is also what keeps the thirty-minute expiry honest.
   */
  it('re-capturing the same destination does not restart its clock', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-01T10:00:00.000Z'));
      store().capture('/matter/m1');
      const first = store().held?.capturedAt;
      jest.setSystemTime(new Date('2026-09-01T10:20:00.000Z'));
      store().capture('/matter/m1');
      expect(store().held?.capturedAt).toBe(first);
      // And it still expires on the ORIGINAL capture, not the repeat.
      jest.setSystemTime(new Date('2026-09-01T10:31:00.000Z'));
      expect(store().consume()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  /** The settle guard still holds at its own boundary, which is what it is for. */
  it('holds the first through a settling pass a frame later', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-01T10:00:00.000Z'));
      store().capture('/judgment/abc');
      jest.setSystemTime(new Date('2026-09-01T10:00:00.500Z'));
      store().capture('/matter/m1');
      expect(store().consume()).toBe('/judgment/abc');
    } finally {
      jest.useRealTimers();
    }
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
    /*
      Whatever the previous process wrote is all the next one has — INCLUDING
      the mutation generation, which a fresh process starts at zero. It is what
      tells hydration that nothing in memory outranks disk yet; carrying the old
      process's count over would simulate a restart that did not happen.
    */
    usePendingDestination.setState({ held: null, hydrated: false, generation: 0 });
    await store().hydrate();
    expect(store().consume()).toBe('/judgment/abc?paragraph=23');
  });

  it('a consumed destination does not come back after a restart', async () => {
    store().capture('/judgment/abc');
    store().consume();
    usePendingDestination.setState({ held: null, hydrated: false, generation: 0 });
    await store().hydrate();
    expect(store().consume()).toBeNull();
  });
});
