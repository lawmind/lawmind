import { DEFAULT_FILTERS, mockApi } from './mock';
import { MOCK_FACETS, MOCK_RESULTS } from './fixtures';
import { formatJudgmentDate } from '../theme/judgmentDate';

/**
 * THE MOCKS MUST MATCH THE SHAPES ON MAIN, so integration is a no-op.
 *
 * There is no deployed API with the corpus yet — the Railway service still runs
 * S0 code. These assertions are the only thing keeping the client honest about
 * four shapes that changed under it. When the real API arrives, a failure here
 * is the difference between "the mock was wrong" and a day spent debugging the
 * server.
 */

describe('judgmentDate is a date, not a timestamp', () => {
  it('is YYYY-MM-DD on every fixture', () => {
    for (const r of MOCK_RESULTS) {
      expect(r.judgmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  /**
   * The bug this exists to prevent: `new Date('2026-02-11')` is UTC midnight,
   * so west of Greenwich it formats as the 10th — a product wrong about a court
   * record by one day, in some timezones only.
   */
  it('formats without going through Date, so no timezone can shift it', () => {
    expect(formatJudgmentDate('2026-02-11')).toBe('11 February 2026');
    expect(formatJudgmentDate('2020-01-01')).toBe('1 January 2020');
    expect(formatJudgmentDate('1950-12-31')).toBe('31 December 1950');
  });

  it('shows an unexpected value verbatim rather than inventing a format for it', () => {
    expect(formatJudgmentDate('2023-11-20T00:00:00.000Z')).toBe('2023-11-20T00:00:00.000Z');
    expect(formatJudgmentDate('')).toBe('');
  });
});

describe('searchId may be null until auth lands in S5', () => {
  it('returns the key, with null as a value, and that is not an error', async () => {
    const response = await mockApi.search({ query: 'mock', language: 'en' });
    if (!response.ok) throw new Error('search should succeed without a user');
    expect('searchId' in response.data).toBe(true);
    expect(response.data.searchId).toBeNull();
  });
});

describe('SearchResult carries operativeParagraphNumber and asOf — R1, 11 Aug 2026', () => {
  /**
   * `services/api/src/search/route.ts` sends both on every live `/search`
   * result and this type omitted them until now — a client type narrower than
   * the wire is a silent drop with no error to catch it. `asOf` is required
   * (the server stamps it on every row); `operativeParagraphNumber` is
   * `number | null` because a real result can legitimately carry either.
   */
  it('every fixture carries asOf', () => {
    for (const r of MOCK_RESULTS) {
      expect(typeof r.asOf).toBe('string');
      expect(r.asOf.length).toBeGreaterThan(0);
    }
  });

  it('at least one fixture exercises a real operativeParagraphNumber, never invented for the rest', () => {
    expect(MOCK_RESULTS.some((r) => typeof r.operativeParagraphNumber === 'number')).toBe(true);
    // A result naming no paragraph is not an error — pre-1990s scans and
    // headnotes both legitimately carry none.
    expect(MOCK_RESULTS.some((r) => r.operativeParagraphNumber === undefined)).toBe(true);
  });
});

describe('holding is empty on most real rows', () => {
  it('has a fixture with no holding, so the empty case is exercised', () => {
    expect(MOCK_RESULTS.some((r) => r.holding === '')).toBe(true);
  });

  it('still carries every other field on that row — a missing summary is not a missing judgment', () => {
    const empty = MOCK_RESULTS.find((r) => r.holding === '');
    expect(empty).toBeDefined();
    expect(empty?.caseTitle.length).toBeGreaterThan(0);
    // Nullable since 11 Aug 2026 — this fixture is a cited row, so it must
    // still carry one, and asserting that keeps the fixture honest.
    expect(empty?.neutralCitation?.length).toBeGreaterThan(0);
    expect(empty?.court.length).toBeGreaterThan(0);
    expect(empty?.judgmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('caseType filters, and never guesses a side', () => {
  it('does not reject the filter — FILTER_UNSUPPORTED is gone', async () => {
    const response = await mockApi.search({
      query: 'mock',
      language: 'en',
      filters: { ...DEFAULT_FILTERS, caseType: 'criminal' },
    });
    expect(response.ok).toBe(true);
  });

  /**
   * 139 of 6,309 judgments state no side in their case number. They are
   * excluded when the filter is set — never guessed into a category to make the
   * count look complete.
   */
  it('excludes a judgment whose case number states no side', async () => {
    const noSide = Object.entries(MOCK_FACETS).find(([, f]) => f.caseType === null)?.[0];
    expect(noSide).toBeDefined();

    const response = await mockApi.search({
      query: 'mock',
      language: 'en',
      filters: { ...DEFAULT_FILTERS, caseType: 'criminal' },
    });
    if (!response.ok) throw new Error('expected results');

    expect(response.data.results.some((r) => r.judgmentId === noSide)).toBe(false);
  });

  /** Excluded, but NAMED. A filter never hides something silently. */
  it('names the excluded judgment back, with the reason', async () => {
    const noSide = Object.entries(MOCK_FACETS).find(([, f]) => f.caseType === null)?.[0];
    const response = await mockApi.search({
      query: 'mock',
      language: 'en',
      filters: { ...DEFAULT_FILTERS, caseType: 'criminal' },
    });
    if (!response.ok) throw new Error('expected results');

    const hidden = response.data.hidden?.find((h) => h.result.judgmentId === noSide);
    expect(hidden).toBeDefined();
    expect(hidden?.hiddenBy).toContain('no side stated');
  });

  it('returns everything when the filter is unset', async () => {
    const response = await mockApi.search({ query: 'mock', language: 'en' });
    if (!response.ok) throw new Error('expected results');
    expect(response.data.results.length).toBe(MOCK_RESULTS.length);
  });
});

/**
 * NODE BUILT-INS, TYPED LOCALLY — the same shape `routeGates.test.ts` uses, and
 * for the same reason: `@types/node` is not in this workspace's `tsconfig.json`.
 */
declare const __dirname: string;
declare function require(id: string): unknown;
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
};
const { join } = require('path') as { join: (...parts: string[]) => string };
const read = (rel: string) => readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `matters.parties` — THE CLIENT IS ALREADY CORRECT AND STAYS THAT WAY.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `POST /matters` currently returns `parties` as a JSON-ENCODED STRING rather
 * than an object (LCC bus 1697, observed directly against the route):
 *
 *     "parties": "{\"petitioner\":\"a\",\"respondent\":\"b\"}"
 *
 * `matters/route.ts` writes `${JSON.stringify(body.parties)}::jsonb` and
 * postgres.js JSON-encodes a JS string parameter, so the stored jsonb is a
 * string SCALAR — `jsonb_typeof` reads `string`. A census of the dev database
 * found four rows `object` and one `string`, so both shapes now coexist.
 *
 * NEW3 R18 classified it as a BACKEND/STORAGE defect and gave repair to LCC.
 * The temptation on this side is a defensive `JSON.parse` or a
 * `typeof parties === 'string'` fallback, and it is a trap: it would make the UI
 * look fixed today and BREAK on the day the server is corrected — a client that
 * parses a string will be handed an object, and `MatterScreen` renders
 * `{matter.parties.description}` from it.
 *
 * So this asserts the ABSENCE of the workaround, which is the thing that would
 * otherwise be added quietly by whoever next sees an undefined on that screen.
 * At this HEAD the fix is not an ancestor — `git show HEAD:services/api/src/
 * matters/route.ts` still carries the `JSON.stringify` form — so what the client
 * owes here is to stay correct and say so, not to compensate.
 */
describe('matters.parties carries no client-side compensation', () => {
  const SOURCES = ['screens/matter/NewMatterScreen.tsx', 'screens/matter/MatterScreen.tsx'];

  it.each(SOURCES)('%s neither parses nor type-switches parties', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/JSON\.parse\([^)]*parties/);
    expect(src).not.toMatch(/typeof\s+[A-Za-z.]*parties\s*===\s*'string'/);
  });

  /** And the contract still declares the shape the server is SUPPOSED to send. */
  it('the contract type is unchanged', () => {
    expect(read('api/contract.ts')).toContain('parties: { description: string }');
  });

  /** The screen still reads it as an object, because that is the contract. */
  it('the matter screen reads it as an object', () => {
    expect(read('screens/matter/MatterScreen.tsx')).toContain('{matter.parties.description}');
  });
});
