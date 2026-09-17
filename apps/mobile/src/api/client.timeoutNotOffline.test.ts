/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A TIMEOUT IS OUR DEADLINE. IT IS NEVER A CLAIM ABOUT THE ADVOCATE'S SIGNAL.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `SearchScreen` renders "You appear to be offline" for `code: 'network'` and
 * something truthful for `code: 'timeout'`, and that mapping has been correct
 * since 31 August 2026. This file tests the layer BENEATH it — the one that
 * decides which code the screen receives — because the 31 August round fixed
 * the screen and left this wrong, and the defect went on reproducing.
 *
 * WHAT WAS ACTUALLY OBSERVED, physical Galaxy S24 (SM-S921B), Android 16,
 * 1 September 2026: `POST /search` answered `status 200, duration_ms 15243` in
 * the server's own log while the phone showed "You appear to be offline" on
 * full WiFi. A probe on the failing line reported what the abort really throws:
 *
 *     { name: "Error", ctor: "FetchError", isError: true,
 *       msg: "fetch failed: Fetch request has been canceled" }
 *
 * Not an `AbortError`. Expo's native fetch has replaced React Native's
 * `whatwg-fetch` polyfill and rejects a cancelled request with a `FetchError`
 * named `Error`, so the old `cause.name === 'AbortError'` test was false on
 * every timeout this app has ever had on a device.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE FIXTURES ARE SHAPED THIS WAY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first case rejects with EXACTLY what the device throws — a plain `Error`
 * named `Error`, carrying Expo's own message. It is the falsifier: it fails
 * against the name check and passes against the signal, which is the whole
 * point of the change. A test that rejected with a well-behaved `AbortError`
 * would have passed before the fix and proved nothing.
 *
 * The last case is the one that must NOT move: a genuine connection failure —
 * no abort, so `signal.aborted` is false — still says offline, because that is
 * true and an advocate in a dead corridor needs to be told.
 */
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:9999';

import { api } from './client';

/** Expo's native fetch: a cancelled request, exactly as the device throws it. */
function expoCancellation(): Error {
  const e = new Error('fetch failed: Fetch request has been canceled');
  e.name = 'Error';
  return e;
}

/** The standards-compliant rejection, which some runtimes do still produce. */
function standardAbortError(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

describe('a cancelled request is reported as a timeout, whatever it throws', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-expect-error test double, not a full Fetch implementation
    global.fetch = fetchMock;
  });

  /**
   * THE FALSIFIER. This is the device's actual rejection, and it is the case
   * the old rule got wrong: `name` is `Error`, so a name check reads it as a
   * network failure and the screen says the advocate is offline.
   */
  it("Expo's FetchError cancellation is a timeout, not a network failure", async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      // The client's own timer has fired: our signal is aborted, and the
      // rejection that follows carries no standard identity.
      Object.defineProperty(init.signal, 'aborted', { value: true, configurable: true });
      return Promise.reject(expoCancellation());
    });

    const r = await api.statutes();

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error.code).toBe('timeout');
    expect(r.error.code).not.toBe('network');
  });

  /**
   * AND THE COPY IS THE HALF THE ADVOCATE READS. `SearchScreen` derives its
   * banner from the code, but the message travels with it, and it must not
   * assert anything about their connection either.
   */
  it('and its message makes no claim about the connection', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      Object.defineProperty(init.signal, 'aborted', { value: true, configurable: true });
      return Promise.reject(expoCancellation());
    });

    const r = await api.statutes();

    if (r.ok) throw new Error('unreachable');
    expect(r.error.message).not.toMatch(/offline/i);
    expect(r.error.message).not.toMatch(/could not reach/i);
    // It says whose deadline it was, and that the work may still be running.
    expect(r.error.message).toMatch(/longer than we wait for/i);
  });

  /** The standard rejection still works — the name check is kept as a fallback. */
  it('a standards-compliant AbortError is still a timeout', async () => {
    fetchMock.mockRejectedValue(standardAbortError());

    const r = await api.statutes();

    if (r.ok) throw new Error('unreachable');
    expect(r.error.code).toBe('timeout');
  });

  /**
   * AND IT NAMES NO OPERATION.
   *
   * OBSERVED on the physical S24, 17 September 2026, over a cellular link that
   * had attached but carried no data: the advocate tapped `Send me a link` on
   * the SIGN-IN screen and was told **"The search took longer than we wait for.
   * It may still be running."** There is no search on that screen. The sentence
   * was the transport's, written for `/search` and then handed to every route,
   * and `SignInScreen` renders `error.message` verbatim because it has no
   * timeout copy of its own.
   *
   * It also mis-stated the stakes. "It may still be running" invites the
   * advocate to wait for a search to land; what was actually in doubt was
   * whether a sign-in email had been sent — a thing you retry, not a thing you
   * wait for.
   *
   * This asserts on a route that is NOT search, which is the point: the message
   * travels with the transport, so it has to be true of every caller. It fails
   * against the old copy and passes against the new.
   */
  it('names no operation, because every route shares this one sentence', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      Object.defineProperty(init.signal, 'aborted', { value: true, configurable: true });
      return Promise.reject(expoCancellation());
    });

    // `statutes` is not a search, and neither is signing in.
    const r = await api.statutes();

    if (r.ok) throw new Error('unreachable');
    expect(r.error.message).not.toMatch(/\bsearch(es|ing)?\b/i);
    // Still says whose deadline it was - that part was always right.
    expect(r.error.message).toMatch(/longer than we wait for/i);
  });

  /**
   * THE ONE THAT MUST NOT MOVE. A real connection failure did not abort, so the
   * signal is clean, and "you may be offline" is the true thing to say.
   */
  it('a genuine connection failure is still reported as network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    const r = await api.statutes();

    if (r.ok) throw new Error('unreachable');
    expect(r.error.code).toBe('network');
    expect(r.error.message).toMatch(/offline/i);
  });
});
