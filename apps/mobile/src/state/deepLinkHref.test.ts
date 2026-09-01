import { deepLinkHref, isCapturableDestination } from './pendingDestination';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * READING THE DESTINATION OFF THE LINK ITSELF.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These are the parses `expo-linking` actually returned on a physical Galaxy
 * S24, 1 September 2026, recorded from the device rather than assumed — the
 * hostname/path split is the part that is easy to get wrong from memory, and
 * getting it wrong is silent: the link resolves to a shorter route that still
 * exists, so nothing errors and the advocate simply lands somewhere else.
 *
 * WHY THIS FUNCTION EXISTS AT ALL. The router could not be used as the source.
 * `AuthBoundary` refuses to MOUNT a protected screen, so during the unresolved
 * window there is no navigator, expo-router never applies its initial linking
 * state, and `usePathname()` reported `/` for the whole of a cold start on
 * `lawmind://matter/<id>`. The link was in hand the entire time.
 */

describe('deepLinkHref', () => {
  /**
   * A CUSTOM SCHEME HAS NO AUTHORITY, so the first path segment lands in the
   * hostname slot. Observed exactly: `lawmind://matter/<id>` →
   * `{hostname: 'matter', path: '<id>'}`.
   */
  it('rejoins a host-form link', () => {
    expect(
      deepLinkHref({ hostname: 'matter', path: 'cedfe466-cdc1-4be3-b69e-03103593d986' })
    ).toBe('/matter/cedfe466-cdc1-4be3-b69e-03103593d986');
  });

  /** And observed: `lawmind:///matter/<id>` → `{hostname: null, path: 'matter/<id>'}`. */
  it('reads an empty-host link, which names the same screen', () => {
    expect(
      deepLinkHref({ hostname: null, path: 'matter/cedfe466-cdc1-4be3-b69e-03103593d986' })
    ).toBe('/matter/cedfe466-cdc1-4be3-b69e-03103593d986');
  });

  /**
   * A SHARED PARAGRAPH IS A DIFFERENT DESTINATION FROM ITS JUDGMENT. Dropping
   * the query lands the advocate at the top of a thirty-page judgment somebody
   * pointed them into the middle of.
   */
  it('keeps a query parameter that changes the destination', () => {
    expect(
      deepLinkHref({ hostname: 'judgment', path: 'abc', queryParams: { paragraph: '23' } })
    ).toBe('/judgment/abc?paragraph=23');
  });

  it('encodes a parameter that would otherwise break the href', () => {
    expect(deepLinkHref({ hostname: 'search', path: '', queryParams: { q: 'a b&c' } })).toBe(
      '/search?q=a%20b%26c'
    );
  });

  /** A bare launch is not a destination — `lawmind://` opens the app, nothing more. */
  it('returns null for a link that names no screen', () => {
    expect(deepLinkHref({ hostname: null, path: null })).toBeNull();
    expect(deepLinkHref({ hostname: '', path: '' })).toBeNull();
    expect(deepLinkHref({ hostname: null, path: '/' })).toBeNull();
  });

  it('does not double a slash when the path carries one', () => {
    expect(deepLinkHref({ hostname: 'matter', path: '/m1' })).toBe('/matter/m1');
  });

  /**
   * THE VERIFY LINK IS PARSED LIKE ANY OTHER AND REFUSED BY THE STORE. This
   * function answers "what did the link say"; whether it may be resumed is
   * `isCapturableDestination`'s question, and it is answered in one place so a
   * second caller cannot get a different answer.
   */
  it('parses the magic link, which the store then refuses', () => {
    const href = deepLinkHref({
      hostname: 'auth',
      path: 'verify',
      queryParams: { token: 'abc' },
    });
    expect(href).toBe('/auth/verify?token=abc');
    expect(isCapturableDestination(href as string)).toBe(false);
  });
});
