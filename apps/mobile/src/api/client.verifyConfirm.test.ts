/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE VOUCH THAT NEVER REACHED THE SERVER, AND THE SCREEN THAT SAID IT DID.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `POST /verify/confirm` is Tier 3 — a human solved the eCourts CAPTCHA and is
 * vouching for the citation. `services/api/src/app.ts` resolves the principal
 * (`const userId = await userFor(c)`) before the handler runs, and
 * `handleConfirm` writes a `citation_checks` row scoped to that advocate.
 *
 * `verifyConfirm` in `client.ts` did not pass `auth: true`, so `once()` attached
 * no bearer token and the server answered `AUTH_REQUIRED`. Nothing was written.
 * The screen had already painted "You confirmed this".
 *
 * IT IS ALSO WHY R16 COULD NOT HELP. `withIdempotency` passes straight through
 * when `scope.userId` is undefined — its own comment: "No principal, no scope."
 * An unauthenticated confirm cannot be made duplicate-safe by any key, because
 * there is no principal to scope the record to. The auth fix is a precondition
 * of the idempotency work, not a separate tidy-up.
 *
 * This file mocks `global.fetch` rather than the client module, one level below
 * every screen test, because the defect is in the request that actually left.
 */
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:9999';

import { api, registerAuthBridge } from './client';

const CONFIRMED = {
  cached: true,
  citationCheckId: 'cc_1',
  verificationState: 'verified',
  verifiedBySource: 'ecourts',
  overruledStatus: 'none',
  confirmedAt: '2026-09-02T00:00:00.000Z',
  asOf: '2026-09-02T00:00:00.000Z',
};

describe('verifyConfirm is an authenticated write', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      headers: { get: () => null },
      json: async () => ({ ok: true, data: CONFIRMED }),
    });
    // @ts-expect-error test double, not a full Fetch implementation
    global.fetch = fetchMock;
    registerAuthBridge({
      accessToken: () => 'mock-access-token',
      refresh: async () => true,
      onSessionLost: () => {},
    });
  });

  afterEach(() => {
    registerAuthBridge(null);
  });

  /**
   * THE FALSIFIER. Before the fix this asserted `undefined`: no bearer token
   * left the client, the server answered `AUTH_REQUIRED`, and no
   * `citation_checks` row was ever written by this app.
   */
  it('attaches the Authorization header the server requires', async () => {
    await api.verifyConfirm('AIR 1973 SC 1461', 'jdg_1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer mock-access-token');
  });

  /**
   * `request()` refreshes once on `AUTH_REQUIRED` and replays — but only when
   * the call declared `auth: true`. Without the flag an expired token was a
   * permanent failure that looked like a success on screen.
   */
  it('refreshes once and replays when the access token is spent', async () => {
    fetchMock
      .mockResolvedValueOnce({
        headers: { get: () => null },
        json: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'no' } }),
      })
      .mockResolvedValueOnce({
        headers: { get: () => null },
        json: async () => ({ ok: true, data: CONFIRMED }),
      });

    const res = await api.verifyConfirm('AIR 1973 SC 1461', 'jdg_1');

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
