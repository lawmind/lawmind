import { V1_SURFACE, surfaceEnabled, type SurfaceName } from './capabilities';
import type { ReleaseCapabilityName, ReleaseCapabilityState } from '../api/contract';

/**
 * THE GATE HAS TO CLOSE IN BOTH DIRECTIONS AND OPEN IN NEITHER BY ACCIDENT.
 *
 * Two authorities, ANDed: the product's frozen v1 decision (compiled in) and
 * the server's own registry (read at launch). Either may CLOSE a surface;
 * neither may open one the other has closed. The third state — "the server has
 * not answered yet" — is the one that gets a design decision rather than a
 * default, and it is drawn per surface by `openWhenUnknown`.
 */

const states = (
  over: Partial<Record<ReleaseCapabilityName, ReleaseCapabilityState>> = {},
): Partial<Record<ReleaseCapabilityName, ReleaseCapabilityState>> => over;

const CORE: SurfaceName[] = [
  'search',
  'partyNameSearch',
  'reader',
  'savedAuthorities',
  'matters',
];
const HELD: SurfaceName[] = [
  'drafting',
  'briefing',
  'monitoring',
  'semanticSearch',
  'counterArguments',
  'goodLawClaim',
  'statuteCorrespondence',
  'matterSharing',
  'hindi',
  'savedSearchFeed',
];

describe('the v1 surface gate', () => {
  it.each(CORE)('%s is the v1 core and is open before the registry is read', (name) => {
    // A metadata request failing in a court corridor must not take the whole
    // app down with it.
    expect(surfaceEnabled(name, states())).toBe(true);
  });

  it.each(HELD)('%s is held, and stays held with an empty registry', (name) => {
    expect(surfaceEnabled(name, states())).toBe(false);
  });

  /**
   * THE DIRECTION THAT MATTERS. The server saying ENABLED does not ship a
   * feature — the shipping decision is the product's, and the frozen registry
   * says so in as many words.
   */
  it.each(HELD)('%s stays held even if the server reports ENABLED', (name) => {
    const runtime = V1_SURFACE[name].runtime;
    const server = runtime === null ? states() : states({ [runtime]: 'ENABLED' });
    expect(surfaceEnabled(name, server)).toBe(false);
  });

  it('a core surface closes when the server withdraws its capability', () => {
    expect(surfaceEnabled('search', states({ 'search.structured_filters': 'DISABLED' }))).toBe(
      false,
    );
    expect(surfaceEnabled('reader', states({ 'judgment.reader': 'DISABLED' }))).toBe(false);
    expect(surfaceEnabled('matters', states({ 'matter.workspace': 'DISABLED' }))).toBe(false);
  });

  /**
   * THE PLATFORM KILL SWITCH, R14 A4.9 — the one capability the server narrows
   * per platform today, and the reason the resolved-per-platform view exists.
   *
   * Since R14 these states arrive ALREADY RESOLVED for the platform that asked
   * (`api/client.ts` sends `X-Lawmind-Platform`), so narrowing needs no new rule
   * here: it is the same server-may-close AND product-may-close gate, fed a
   * value the server resolved. Flipping the switch is a served config change,
   * not an App Store release, which is exactly why it must be tested rather than
   * assumed unreachable.
   */
  it('party-name search closes when the server narrows it for this platform', () => {
    expect(surfaceEnabled('partyNameSearch', states({ 'search.party_name': 'DISABLED' }))).toBe(
      false,
    );
  });

  it('party-name search is open when the server serves it, and before it answers', () => {
    expect(surfaceEnabled('partyNameSearch', states({ 'search.party_name': 'ENABLED' }))).toBe(true);
    // Cold start: hiding part of search because a metadata request has not
    // returned would break search on a bad connection, and the SERVER enforces
    // the switch regardless — it says so on the response.
    expect(surfaceEnabled('partyNameSearch', states())).toBe(true);
  });

  /**
   * NARROWING ONE ARM MAY NEVER NARROW ANOTHER. Exact identity is a separate
   * row, and it is what the disabled-party degrade points the advocate at — a
   * degrade that pointed at a path the same switch had closed would be worse
   * than silence.
   */
  it('the party switch does not touch exact identity, the reader, or matters', () => {
    const partyOff = states({ 'search.party_name': 'DISABLED' });
    expect(surfaceEnabled('search', partyOff)).toBe(true);
    expect(surfaceEnabled('reader', partyOff)).toBe(true);
    expect(surfaceEnabled('savedAuthorities', partyOff)).toBe(true);
    expect(surfaceEnabled('matters', partyOff)).toBe(true);
  });

  /**
   * THE DIRECTION IS FIXED IN BOTH FILES. A platform override may take a
   * capability DOWN and never UP (R14 A4.8), and independently the product
   * decision closes first — so a server that started reporting ENABLED for a
   * held surface still ships nothing.
   */
  it('a server ENABLED cannot open what the product closed, party row included', () => {
    expect(
      surfaceEnabled('semanticSearch', states({ 'search.semantic.broad': 'ENABLED' })),
    ).toBe(false);
    expect(V1_SURFACE.partyNameSearch.runtime).toBe('search.party_name');
    expect(V1_SURFACE.partyNameSearch.v1).toBe('ENABLED_V1');
  });

  it('LIMITED is reachable — it is how most of this corpus honestly ships', () => {
    // `judgment.reader` and `search.exact_identity` are both LIMITED on the
    // live server today. Treating LIMITED as off would hide the whole product.
    expect(surfaceEnabled('reader', states({ 'judgment.reader': 'LIMITED' }))).toBe(true);
  });

  it('EXPERIMENTAL_INTERNAL is never user-reachable', () => {
    expect(surfaceEnabled('semanticSearch', states({ 'search.semantic.broad': 'ENABLED' }))).toBe(
      false,
    );
    expect(
      surfaceEnabled('semanticSearch', states({ 'search.semantic.broad': 'EXPERIMENTAL_INTERNAL' })),
    ).toBe(false);
  });

  /**
   * §6 and §7 are absolutes for this round, so they are asserted as absolutes
   * rather than left to the table above staying the way it is.
   */
  it('monitoring is DISABLED_NOT_READY and semantic is not ENABLED_V1', () => {
    expect(V1_SURFACE.monitoring.v1).toBe('DISABLED_NOT_READY');
    expect(V1_SURFACE.semanticSearch.v1).not.toBe('ENABLED_V1');
    expect(V1_SURFACE.drafting.v1).not.toBe('ENABLED_V1');
    expect(V1_SURFACE.briefing.v1).not.toBe('ENABLED_V1');
    expect(V1_SURFACE.goodLawClaim.v1).not.toBe('ENABLED_V1');
  });

  /** §8 — no firm or team administration UI in a single-user v1. */
  it('matter sharing is not a v1 screen', () => {
    expect(V1_SURFACE.matterSharing.v1).toBe('POST_V1');
    expect(surfaceEnabled('matterSharing', states())).toBe(false);
  });

  /** OD-12 is OPEN and may not be resolved by shipping the feed. */
  it('the saved-search feed is held while OD-12 is open', () => {
    expect(surfaceEnabled('savedSearchFeed', states())).toBe(false);
  });

  it('only the v1 core may be open before the registry answers', () => {
    for (const [name, surface] of Object.entries(V1_SURFACE)) {
      if (surface.openWhenUnknown) expect(CORE).toContain(name as SurfaceName);
    }
  });
});
