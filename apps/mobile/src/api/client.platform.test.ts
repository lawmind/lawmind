import { Platform } from 'react-native';

import { api, clientPlatformHeader } from './client';
import type { ReleaseCapabilities } from './contract';

/**
 * THE BUILD HAS TO SAY WHICH PLATFORM IT IS — R14 A4.2/A4.10.
 *
 * `GET /release/capabilities` resolves every capability FOR THE PLATFORM THAT
 * ASKED and returns the answer already resolved. A client that sends no selector
 * gets the release-wide set — a 200, never an error — and therefore cannot see
 * its own narrowing: it would keep offering a surface the server has switched
 * off for it, and only discover the switch from the consequence on `/search`.
 * That is why the header goes on EVERY request rather than on one endpoint.
 *
 * WHAT THIS IS NOT. It is not a security boundary and this client does not treat
 * it as one. An override may take a capability DOWN and never UP (R14 A4.8), so
 * a lie about the platform cannot reach anything the release-wide registry
 * refuses, and nothing here defends against one.
 */
describe('clientPlatformHeader', () => {
  it.each(['ios', 'android', 'web'])('sends the contract name for %s', (os) => {
    expect(clientPlatformHeader(os)).toEqual({ 'x-lawmind-platform': os });
  });

  /**
   * NEVER INVENT A PLATFORM NAME. `Platform.OS` can be a target we do not ship.
   * Sending `windows` would be asserting a platform the contract does not define;
   * omitting the header is the no-selector case the server already answers with
   * the release-wide set, which is the widest honest answer.
   */
  it.each(['windows', 'macos', 'desktop', '', 'IOS'])('omits the header for %p', (os) => {
    expect(clientPlatformHeader(os)).toEqual({});
  });

  /**
   * The server trims and lower-cases, so `"  IOS "` would resolve to `ios` on
   * the far side. This client still does not send it: normalising here would put
   * a second, private mapping between `Platform.OS` and the contract's value set,
   * and two mappings are how they drift.
   */
  it('does not normalise on the client — the value set is the contract\'s', () => {
    expect(clientPlatformHeader('  IOS ')).toEqual({});
  });
});

/**
 * THE MAPPING BEING RIGHT IS NOT THE SAME AS THE HEADER BEING SENT.
 *
 * The unit tests above prove which value a platform maps to; this proves the
 * value reaches the wire, on an ordinary request, through the one shared header
 * block rather than at a single call site. A selector wired to only
 * `/release/capabilities` would leave `/search` unidentified, and the client
 * would then hold two different beliefs about the same switch.
 */
describe('the selector reaches the request', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sends X-Lawmind-Platform on a real call, without touching auth or accept', async () => {
    const seen: RequestInit[] = [];
    globalThis.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      seen.push(init ?? {});
      return {
        json: async () => ({ ok: true, data: { registryVersion: 'v', asOf: 'd', capabilities: {} } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await api.releaseCapabilities();

    expect(seen).toHaveLength(1);
    const headers = seen[0]?.headers as Record<string, string>;
    expect(headers['accept']).toBe('application/json');
    // Whatever this test run's platform is, the header agrees with the mapping.
    expect(headers['x-lawmind-platform']).toBe(
      clientPlatformHeader(Platform.OS)['x-lawmind-platform'],
    );
    // Unauthenticated route: identifying the platform must not attach a token.
    expect(headers['authorization']).toBeUndefined();
  });
});

/**
 * THE RESOLVED-PER-PLATFORM RESPONSE, R14 A4.4-A4.7, read as the client reads it.
 *
 * These are type-level assertions with runtime shape checks, not a live call:
 * the point is that BOTH shapes parse and neither is required to carry the
 * other's keys. `platform` and `platformOverrides` are ABSENT — not null — from
 * a no-selector response, which is the compatibility guarantee that keeps the
 * wire integer at 1.
 */
describe('ReleaseCapabilities carries the platform shape optionally', () => {
  const base = {
    registryVersion: 'RELEASE_CAPABILITIES_R8_3.4',
    asOf: '2026-08-26',
    capabilities: {
      'search.party_name': { state: 'ENABLED', reason: 'measured', asOf: '2026-08-26' },
    },
  } satisfies ReleaseCapabilities;

  it('a no-selector response has three keys and is still valid', () => {
    expect(Object.keys(base).sort()).toEqual(['asOf', 'capabilities', 'registryVersion']);
    expect(base.capabilities['search.party_name']?.state).toBe('ENABLED');
  });

  it('a selected response adds the resolved platform and the audit list', () => {
    const selected = {
      ...base,
      platform: 'ios',
      platformOverrides: [],
    } satisfies ReleaseCapabilities;
    expect(selected.platform).toBe('ios');
    expect(selected.platformOverrides).toEqual([]);
  });

  /**
   * `unknown` is a RESOLVED RESULT and never a value to send. An unrecognised
   * selector yields the release-wide states with a 200, so it is not an error to
   * surface and not a reason to fail closed on capability discovery.
   */
  it('unknown is a value the client can receive but never sends', () => {
    const resolved = { ...base, platform: 'unknown', platformOverrides: [] } satisfies ReleaseCapabilities;
    expect(resolved.platform).toBe('unknown');
    expect(clientPlatformHeader('unknown')).toEqual({});
  });

  /**
   * R14 A4.7 is binding: `platformOverrides` is an AUDIT LIST. It is typed so it
   * can be read by an operator surface, and no screen may derive advocate copy
   * from a name appearing in it — the user-facing consequence is the `state` and
   * `reason` of the row itself, which is what `state/capabilities.ts` reads.
   */
  it('overrides name capabilities, and the state is still read from the row', () => {
    const narrowed = {
      ...base,
      capabilities: {
        'search.party_name': {
          state: 'DISABLED',
          reason: 'switched off for this platform',
          asOf: '2026-08-30',
        },
      },
      platform: 'ios',
      platformOverrides: ['search.party_name'],
    } satisfies ReleaseCapabilities;

    expect(narrowed.platformOverrides).toContain('search.party_name');
    // The row itself already carries the resolved state. Nothing walks anything.
    expect(narrowed.capabilities['search.party_name']?.state).toBe('DISABLED');
  });
});
