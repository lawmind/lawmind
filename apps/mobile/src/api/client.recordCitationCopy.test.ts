/**
 * `auth: true` ON `recordCitationCopy` IS LOAD-BEARING — found 22 Aug 2026
 * auditing the outbox's permanent-failure handling.
 *
 * `services/api/src/citations/copies.ts` requires `userId` and returns 401
 * `AUTH_REQUIRED` without one. `once()` in `client.ts` attaches the bearer
 * token ONLY when the call passes `auth: true`. Every other test in this repo
 * mocks `../api/client` wholesale (`outbox.test.ts`, `SearchScreen.test.tsx`),
 * so nothing exercised the real fetch layer and nothing would have caught this
 * — this file mocks `global.fetch` instead, one level lower, specifically so
 * it can see the request that actually left the client.
 *
 * Set before importing the module: `client.ts` refuses to resolve a base URL
 * at all outside `__DEV__` unless `EXPO_PUBLIC_API_URL` is set (22 Aug 2026,
 * FQ-HOSTING fail-closed fix) — this pins a real value rather than depending
 * on `__DEV__` being true in this test environment.
 */
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:9999';

import { api, registerAuthBridge } from './client';

describe('recordCitationCopy sends the bearer token', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, data: { copyId: 'c1', copiedAt: '2026-08-22T00:00:00.000Z', recorded: true, overruledStatus: 'none' } }),
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

  it('attaches the Authorization header, without which the server 401s forever', async () => {
    await api.recordCitationCopy({
      judgmentId: 'j1',
      surface: 'search',
      copiedAt: '2026-08-22T00:00:00.000Z',
      clientKey: 'k1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer mock-access-token');
  });

  it('does not send the request with no Authorization header when a session exists — the regression this file exists to catch', async () => {
    await api.recordCitationCopy({
      judgmentId: 'j1',
      surface: 'search',
      copiedAt: '2026-08-22T00:00:00.000Z',
      clientKey: 'k1',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBeDefined();
  });
});
