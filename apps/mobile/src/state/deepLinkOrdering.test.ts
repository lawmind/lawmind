import AsyncStorage from '@react-native-async-storage/async-storage';

import { authDecision } from '../components/AuthBoundary';
import { resumeAction } from './resumeGate';
import {
  RESUME_WINDOW_MS,
  deepLinkHref,
  usePendingDestination,
  type HeldDestination,
} from './pendingDestination';
import type { SessionStatus } from './session';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEEP-LINK ORDERING MATRIX.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The pieces are asserted individually elsewhere — `pendingDestination.test.ts`
 * for the store's rules, `AuthBoundary.test.ts` for the gate's, and
 * `pendingDestination.hydration.test.ts` for the race between them. This file
 * asserts the SEQUENCES, because every defect this round closed was an ordering
 * that no single component got wrong on its own.
 *
 * ONE RULE RUNS THROUGH ALL OF IT:
 *
 *   the LATEST EXPLICIT user or external destination beats an OLDER PERSISTED
 *   one, and router settling noise displaces neither.
 *
 * `visit()` replays a pass of the boundary the way the app experiences one: the
 * gate decides, and the store is offered the pathname only if the gate says
 * hold. The async read lands wherever the test puts it.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  usePendingDestination.setState({ held: null, hydrated: false, generation: 0 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const store = () => usePendingDestination.getState();

/**
 * One pass of the boundary: the gate decides, the store is offered the path if
 * held — and a hold is RETIRED when the advocate actually arrives, which is the
 * other half of the same effect.
 */
function visit(status: SessionStatus, pathname: string): void {
  const decision = authDecision(status, pathname);
  if (decision.hold) store().capture(pathname);
  else if (decision.render === 'children') store().arrivedAt(pathname);
}

/** What `app/_layout.tsx` does the moment an external link arrives. */
function externalLink(url: { hostname?: string | null; path?: string | null }): void {
  const href = deepLinkHref(url);
  if (href) store().capture(href);
}

function persisted(href: string, ageMs: number): string {
  return JSON.stringify({ href, capturedAt: Date.now() - ageMs } satisfies HeldDestination);
}

/** Where `auth/verify.tsx` would send the advocate at this moment. */
function resumesTo(status: SessionStatus): string | null {
  const action = resumeAction(status, store().hydrated, true);
  if (action !== 'resume') return null;
  return store().consume() ?? '/today';
}

describe('cold install, first protected deep link', () => {
  /**
   * NOTHING ON DISK, AND THE SESSION HAS NOT ANSWERED. This is the case the
   * `unknown` hold exists for: the link is captured while the keychain is still
   * being read, so it no longer matters whether the router is still sitting on
   * that route when the answer arrives.
   */
  it('holds the link before the keychain answers and resumes to it exactly', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);
    const hydrating = store().hydrate();

    visit('unknown', '/matter/m1');
    await hydrating;

    // The router settles to Today inside the unresolved window — the ordering
    // that used to lose the link outright, because nothing had held it yet.
    visit('unknown', '/today');
    visit('signed_out', '/today');
    visit('signed_out', '/sign-in');

    expect(resumesTo('signed_in')).toBe('/matter/m1');
  });
});

describe('a stale persisted destination against a newer link', () => {
  it('the newer link wins when it is captured before the read lands', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockResolvedValue(persisted('/matter/older', 20 * 60 * 1000));
    const hydrating = store().hydrate();

    visit('unknown', '/matter/newer');
    await hydrating;

    expect(resumesTo('signed_in')).toBe('/matter/newer');
  });

  it('the newer link wins when it arrives after the read lands', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockResolvedValue(persisted('/matter/older', 20 * 60 * 1000));
    await store().hydrate();
    expect(store().held?.href).toBe('/matter/older');

    visit('unknown', '/matter/newer');

    expect(resumesTo('signed_in')).toBe('/matter/newer');
  });
});

describe('two distinct external links inside the resume window', () => {
  /**
   * No sign-out and no session change at all — the advocate simply followed a
   * second shared link while the first was still inside its thirty minutes.
   * The second is what they are looking at, so it is what resumes.
   */
  it('resumes the second', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    visit('signed_out', '/judgment/first');

    // Minutes later. Well past the settle window, well inside the resume one.
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 5 * 60 * 1000);
    visit('signed_out', '/judgment/second');

    expect(store().held?.href).toBe('/judgment/second');
  });
});

describe('router settling in the same frame', () => {
  it('does not displace the destination with the routes it passes through', () => {
    visit('unknown', '/matter/m1');
    // The settling pass, frames later: an intermediate route and then sign-in.
    visit('signed_out', '/today');
    visit('signed_out', '/sign-in');

    expect(store().held?.href).toBe('/matter/m1');
  });

  it('a repeat of the same destination does not restart its clock', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000_000);
    visit('unknown', '/matter/m1');
    const first = store().held?.capturedAt;

    // The boundary re-renders and offers the same href again, past the settle
    // window. Restarting the clock here would keep a stale link alive forever.
    (Date.now as jest.Mock).mockReturnValue(2_000_000 + 10_000);
    visit('signed_out', '/matter/m1');

    expect(store().held?.capturedAt).toBe(first);
  });
});

describe('background and resume', () => {
  /**
   * The mail round trip WITHOUT a process death: the store is already hydrated
   * and holds the link, and coming back must not read over it. A second hydrate
   * is exactly what an over-eager foreground listener would do.
   */
  it('a second hydrate on resume does not disturb a live destination', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);
    await store().hydrate();

    visit('signed_out', '/judgment/abc?paragraph=23');
    await store().hydrate();

    expect(resumesTo('signed_in')).toBe('/judgment/abc?paragraph=23');
  });
});

describe('the process was killed during the mail round trip', () => {
  /**
   * The destination exists NOWHERE but on disk, and the verify screen's effects
   * run before the layout's. Deciding before the read lands spends the link on
   * Today — and marks it consumed, so the read that follows is correctly
   * discarded. Everything behaves as designed and the link is gone.
   */
  it('does not decide before the store has answered', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(persisted('/matter/m1', 60_000));

    // The verify exchange returns before the read lands.
    expect(resumeAction('signed_in', store().hydrated, true)).toBe('wait');
    expect(store().held).toBeNull();

    await store().hydrate();

    expect(resumesTo('signed_in')).toBe('/matter/m1');
  });
});

describe('an expired pending destination', () => {
  it('falls back to Today rather than resuming last week', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockResolvedValue(persisted('/matter/m1', RESUME_WINDOW_MS + 60_000));
    await store().hydrate();

    expect(resumesTo('signed_in')).toBe('/today');
  });
});

describe('an invalid internal route', () => {
  /**
   * Still a route, so it is held and resumed like any other and answered by
   * `+not-found`. That is the truthful reply to the address the advocate was
   * sent, and it terminates rather than looping.
   */
  it('is held and resumed, and terminates at not-found', () => {
    visit('unknown', '/no-such-screen');
    expect(store().held?.href).toBe('/no-such-screen');
    expect(authDecision('signed_in', '/no-such-screen').render).toBe('children');
  });
});

describe('the verify route can never become the resume destination', () => {
  /**
   * A magic link is single use and the server reads a second presentation as a
   * REPLAY, which revokes every session the advocate has. Two independent
   * refusals, because this one is not recoverable by a second navigation.
   */
  it('is refused at the gate and at the store, and resumes to Today', () => {
    expect(authDecision('unknown', '/auth/verify').hold).toBe(false);
    expect(authDecision('signed_out', '/auth/verify').hold).toBe(false);

    store().capture('/auth/verify?token=abc');
    expect(store().held).toBeNull();

    usePendingDestination.setState({ hydrated: true });
    expect(resumesTo('signed_in')).toBe('/today');
  });
});

describe('a deep link followed by an advocate who is already signed in', () => {
  /**
   * THE HOLD IS TAKEN AND THEN RETIRED, and both halves matter.
   *
   * It is taken because `app/_layout.tsx` sees the link while the session is
   * still `unknown` — there is no way to know yet that this advocate will not
   * be bounced, and the link exists only at that moment.
   *
   * It is retired on arrival because they were not bounced. Left in place it
   * would arm: a session ending half an hour later would resume to a judgment
   * the advocate had already read and closed. OBSERVED on a physical Galaxy S24,
   * 1 September 2026 — a signed-in cold start on `lawmind://coverage` landed
   * correctly and left `/coverage` held with nothing to consume it.
   */
  it('mounts the screen and does not leave the link armed', () => {
    externalLink({ hostname: 'matter', path: 'm1' });
    expect(store().held?.href).toBe('/matter/m1');

    const d = authDecision('signed_in', '/matter/m1');
    expect(d.render).toBe('children');
    expect(d.redirectTo).toBeNull();
    expect(d.hold).toBe(false);

    visit('signed_in', '/matter/m1');
    expect(store().held).toBeNull();
  });

  /**
   * ARRIVING SOMEWHERE ELSE RETIRES NOTHING. A bounced advocate passes through
   * `/sign-in` and Today on the way, and a hold that any arrival cleared would
   * not survive its own redirect.
   */
  it('keeps the hold while the advocate is somewhere else', () => {
    externalLink({ hostname: 'matter', path: 'm1' });

    visit('signed_out', '/sign-in');
    visit('signed_in', '/today');

    expect(store().held?.href).toBe('/matter/m1');
  });
});

describe('the cold start that the router never resolved', () => {
  /**
   * THE DEVICE FAILURE, AS A TEST. `AuthBoundary` refuses to mount a protected
   * screen, so during the unresolved window there is no navigator and
   * expo-router never applies the deep link — `usePathname()` reported `/` for
   * the entire launch on a physical Galaxy S24, 1 September 2026. The gate
   * therefore sees nothing worth holding, and the link is discarded before
   * anything can hold it.
   *
   * Reading the destination off the LINK closes it, and this asserts the whole
   * sequence: the router contributes nothing at any point below.
   */
  it('resumes to the link even though the pathname never left the root', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);

    externalLink({ hostname: 'matter', path: 'cedfe466' });
    await store().hydrate();

    // Every pass the gate ever sees. None of them is the destination.
    visit('unknown', '/');
    visit('signed_out', '/');
    visit('signed_out', '/sign-in');
    visit('signed_out', '/auth/verify');

    expect(resumesTo('signed_in')).toBe('/matter/cedfe466');
  });
});
