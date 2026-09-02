/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `Idempotency-Key` ON SIX ROUTES AND NOWHERE ELSE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R16 §2 names the six exactly, and names what must NOT acquire the header:
 * `POST /matters/:id/authorities` already has a durable identity (a live partial
 * unique index on `(matter_id, judgment_id)`), and `POST /citations/copies`
 * already has one (`clientKey`, unique on `(user_id, client_key)`). Giving
 * either a second identity mechanism would create two vocabularies for the same
 * question, which is the failure the contract calls out by name.
 *
 * POST-shaped QUERIES — `/search`, `/verify/ecourts`, `/court/lookup` — create
 * nothing and are outside the convention entirely.
 *
 * This mocks `global.fetch` rather than the client module: the property under
 * test is the request that actually left, and every screen test in this repo
 * mocks one level above it.
 */
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:9999';

import { newAttemptKey } from './attempt';
import { api, registerAuthBridge } from './client';

const KEY = 'attempt-key-one';

function headersOf(call: unknown[]): Record<string, string> {
  const [, init] = call as [string, { headers: Record<string, string> }];
  return init.headers;
}

/** Case-insensitively, because HTTP is — and so a rename cannot silently pass. */
function idempotencyKeyIn(headers: Record<string, string>): string | undefined {
  const found = Object.keys(headers).find((h) => h.toLowerCase() === 'idempotency-key');
  return found ? headers[found] : undefined;
}

describe('the six current-v1 creates carry the key when the caller owns one', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      headers: { get: () => null },
      json: async () => ({ ok: true, data: {} }),
    });
    // @ts-expect-error test double, not a full Fetch implementation
    global.fetch = fetchMock;
    registerAuthBridge({
      accessToken: () => 'mock-access-token',
      refresh: async () => true,
      onSessionLost: () => {},
    });
  });

  afterEach(() => registerAuthBridge(null));

  const SIX: [string, (key?: string) => Promise<unknown>][] = [
    ['createAnnotation', (k) => api.createAnnotation('j1', { paragraphNumber: 1, paragraphIndex: 0, quote: 'q' }, k)],
    ['createMatter', (k) => api.createMatter({} as never, k)],
    ['addMatterEvent', (k) => api.addMatterEvent('m1', { eventDate: '2026-09-02', eventType: 'hearing' }, k)],
    ['createDataRequest', (k) => api.createDataRequest('erasure', undefined, k)],
    ['verifyConfirm', (k) => api.verifyConfirm('AIR 1973 SC 1461', 'j1', k)],
    ['grantTrainingConsent', (k) => api.grantTrainingConsent('training-v7', k)],
  ];

  it.each(SIX)('%s sends the header when given a key', async (_name, call) => {
    await call(KEY);
    expect(idempotencyKeyIn(headersOf(fetchMock.mock.calls[0]!))).toBe(KEY);
  });

  /**
   * THE LEGACY PATH STAYS REPRESENTABLE. R16 is `WIRE_BREAKING_CHANGE = NO` and
   * an absent header is the R15 behaviour byte for byte on the server — no
   * transaction, no row, no shape change. A client that could no longer make
   * that request would have turned an additive amendment into a breaking one.
   */
  it.each(SIX)('%s sends NO header when the caller has no key', async (_name, call) => {
    await call(undefined);
    expect(idempotencyKeyIn(headersOf(fetchMock.mock.calls[0]!))).toBeUndefined();
  });

  it.each(SIX)('%s still sends the bearer token alongside the key', async (_name, call) => {
    await call(KEY);
    expect(headersOf(fetchMock.mock.calls[0]!).authorization).toBe('Bearer mock-access-token');
  });

  /**
   * THE SAME KEY SURVIVES AN AUTH REFRESH. R16 §3: the scope is the
   * authenticated PRINCIPAL, not the token, so a 15-minute access token expiring
   * mid-flight must not turn a legitimate replay into a `409`. `request()`
   * refreshes once and replays `options` verbatim — this pins that the headers
   * it replays still carry the key.
   */
  it.each(SIX)('%s reuses the same key across the refresh-and-replay', async (_name, call) => {
    fetchMock
      .mockResolvedValueOnce({
        headers: { get: () => null },
        json: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'spent' } }),
      })
      .mockResolvedValue({
        headers: { get: () => null },
        json: async () => ({ ok: true, data: {} }),
      });

    await call(KEY);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyIn(headersOf(fetchMock.mock.calls[0]!))).toBe(KEY);
    expect(idempotencyKeyIn(headersOf(fetchMock.mock.calls[1]!))).toBe(KEY);
  });

  it('a generated key is what actually goes on the wire', async () => {
    const key = newAttemptKey();
    await api.createMatter({} as never, key);
    expect(idempotencyKeyIn(headersOf(fetchMock.mock.calls[0]!))).toBe(key);
  });
});

describe('nothing else acquires an idempotency identity', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      headers: { get: () => null },
      json: async () => ({ ok: true, data: {} }),
    });
    // @ts-expect-error test double, not a full Fetch implementation
    global.fetch = fetchMock;
    registerAuthBridge({
      accessToken: () => 'mock-access-token',
      refresh: async () => true,
      onSessionLost: () => {},
    });
  });

  afterEach(() => registerAuthBridge(null));

  const FORBIDDEN: [string, () => Promise<unknown>][] = [
    ['search', () => api.search('bail', 'en')],
    ['verifyEcourts', () => api.verifyEcourts('AIR 1973 SC 1461')],
    ['courtLookup', () => api.courtLookup('CNR')],
    ['counterArguments', () => api.counterArguments('position')],
    ['acceptTerms', () => api.acceptTerms('v1')],
    ['markAlertRead', () => api.markAlertRead('a1')],
    ['addAuthorityToMatter', () => api.addAuthorityToMatter({ matterId: 'm1', judgmentId: 'j1' })],
    [
      'recordCitationCopy',
      () =>
        api.recordCitationCopy({
          judgmentId: 'j1',
          surface: 'search',
          copiedAt: '2026-09-02T00:00:00.000Z',
          clientKey: 'ck1',
        }),
    ],
  ];

  it.each(FORBIDDEN)('%s sends no Idempotency-Key', async (_name, call) => {
    await call();
    for (const c of fetchMock.mock.calls) {
      expect(idempotencyKeyIn(headersOf(c))).toBeUndefined();
    }
  });

  /**
   * CITATION COPY KEEPS ITS IDENTITY IN THE BODY. `clientKey` is unique on
   * `(user_id, client_key)` server-side and is the mechanism `SCHEMA_TRUTH.md`
   * names; adding a header would give one operation two identities that could
   * disagree.
   */
  it('citation copy still carries clientKey in the body and only there', async () => {
    await api.recordCitationCopy({
      judgmentId: 'j1',
      surface: 'search',
      copiedAt: '2026-09-02T00:00:00.000Z',
      clientKey: 'ck1',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(JSON.parse(init.body).clientKey).toBe('ck1');
    expect(idempotencyKeyIn(init.headers)).toBeUndefined();
  });
});

describe('Retry-After reaches the caller as a field on the error', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-expect-error test double, not a full Fetch implementation
    global.fetch = fetchMock;
    registerAuthBridge({
      accessToken: () => 'mock-access-token',
      refresh: async () => true,
      onSessionLost: () => {},
    });
  });

  afterEach(() => registerAuthBridge(null));

  it('parses the header the server actually sends', async () => {
    fetchMock.mockResolvedValue({
      headers: { get: (h: string) => (h === 'retry-after' ? '1' : null) },
      json: async () => ({
        ok: false,
        error: { code: 'IDEMPOTENCY_IN_PROGRESS', message: 'busy' },
      }),
    });

    const res = await api.createMatter({} as never, KEY);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.retryAfterSeconds).toBe(1);
  });

  /** Not hardcoded to the value today's server happens to emit. */
  it('parses a value other than 1', async () => {
    fetchMock.mockResolvedValue({
      headers: { get: () => '7' },
      json: async () => ({
        ok: false,
        error: { code: 'IDEMPOTENCY_IN_PROGRESS', message: 'busy' },
      }),
    });

    const res = await api.createMatter({} as never, KEY);
    if (!res.ok) expect(res.error.retryAfterSeconds).toBe(7);
  });

  it('leaves it undefined rather than inventing one', async () => {
    fetchMock.mockResolvedValue({
      headers: { get: () => 'in a while' },
      json: async () => ({
        ok: false,
        error: { code: 'IDEMPOTENCY_IN_PROGRESS', message: 'busy' },
      }),
    });

    const res = await api.createMatter({} as never, KEY);
    if (!res.ok) expect(res.error.retryAfterSeconds).toBeUndefined();
  });

  /**
   * A SUCCESS IS NEVER DECORATED WITH IT. `Retry-After` on a 2xx would be
   * meaningless, and the envelope must not gain a field that no caller reads.
   */
  it('is not attached to a success', async () => {
    fetchMock.mockResolvedValue({
      headers: { get: () => '1' },
      json: async () => ({ ok: true, data: { matter: {} } }),
    });

    const res = await api.createMatter({} as never, KEY);
    expect(res).toEqual({ ok: true, data: { matter: {} } });
  });
});
