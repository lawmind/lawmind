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

describe('holding is empty on most real rows', () => {
  it('has a fixture with no holding, so the empty case is exercised', () => {
    expect(MOCK_RESULTS.some((r) => r.holding === '')).toBe(true);
  });

  it('still carries every other field on that row — a missing summary is not a missing judgment', () => {
    const empty = MOCK_RESULTS.find((r) => r.holding === '');
    expect(empty).toBeDefined();
    expect(empty?.caseTitle.length).toBeGreaterThan(0);
    expect(empty?.neutralCitation.length).toBeGreaterThan(0);
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
