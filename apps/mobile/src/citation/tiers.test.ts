import type { CitationCheck, CitationTier } from '../api/contract';
import {
  coverageLine,
  isoFromServerTimestamp,
  nothingIndependentRan,
  sourceLabel,
  tierDateLabel,
  tierMark,
} from './tiers';

/**
 * THE RULE UNDER TEST: `miss` and `not_implemented` are different facts and are
 * never collapsed.
 *
 * `miss` — we queried an independent source and it had nothing.
 * `not_implemented` — the tier has not run at all; it ships in S2.
 *
 * Rendering the second as the first tells an advocate their citation failed an
 * independent check that was never attempted. In S1 exactly one of three tiers
 * runs, so this is the ordinary case, not an edge.
 *
 * The tiers below are the real production response, measured 7 August 2026.
 */
const TIERS: CitationTier[] = [
  {
    tier: 1,
    source: 'corpus',
    status: 'confirmed',
    detail: 'resolved against the internal corpus',
    at: '2026-08-06 20:34:06.383686+00',
  },
  {
    tier: 2,
    source: 'public_x2',
    status: 'not_implemented',
    detail: 'IndianKanoon and AWS S3 cross-reference ships in S2',
    at: null,
  },
  {
    tier: 3,
    source: 'ecourts',
    status: 'not_implemented',
    detail: 'eCourts confirmation ships in S2. The advocate solves the captcha',
    at: null,
  },
];

const check = (over: Partial<CitationCheck> = {}): CitationCheck => ({
  citationCheckId: 'chk-1',
  citationClaimed: '1980 INSC 68',
  checkedAt: '2026-08-06T20:34:06.000Z',
  surface: 'search',
  shownToUser: true,
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  overruledStatusShown: true,
  matchConfidence: null,
  judgment: null,
  tiers: TIERS,
  coverage: {
    tiersImplemented: 1,
    tiersDefined: 3,
    note: 'Only Tier 1 (internal corpus) runs in S1.',
  },
  asOf: '2026-08-06T20:34:06.850Z',
  ...over,
});

describe('tierMark', () => {
  it('marks a confirmed tier as the only affirmative on the screen', () => {
    const m = tierMark(TIERS[0]!);

    expect(m.tone).toBe('found');
    expect(m.isCoverageGap).toBe(false);
    expect(m.at).toBe('2026-08-06 20:34:06.383686+00');
  });

  it('never gives an unshipped tier the same tone as a source that found nothing', () => {
    const notImplemented = tierMark(TIERS[1]!);
    const miss = tierMark({ ...TIERS[1]!, status: 'miss', at: '2026-08-06T20:00:00Z' });

    expect(notImplemented.tone).toBe('pending');
    expect(miss.tone).toBe('absent');
    expect(notImplemented.tone).not.toBe(miss.tone);
  });

  it('flags an unshipped tier as a gap in OUR coverage, not a finding about the citation', () => {
    expect(tierMark(TIERS[1]!).isCoverageGap).toBe(true);
    expect(tierMark({ ...TIERS[1]!, status: 'miss' }).isCoverageGap).toBe(false);
    expect(tierMark({ ...TIERS[1]!, status: 'not_attempted' }).isCoverageGap).toBe(false);
  });

  /**
   * A time beside a tier that never ran asserts diligence we did not perform —
   * the same class of error as a badge on unverified law, and harder to notice
   * because it looks like care.
   */
  it('carries no timestamp for a tier that never ran', () => {
    expect(tierMark(TIERS[1]!).at).toBeNull();
    expect(tierMark(TIERS[2]!).at).toBeNull();
  });

  it('uses the server words verbatim rather than a house paraphrase', () => {
    expect(tierMark(TIERS[2]!).detail).toBe(
      'eCourts confirmation ships in S2. The advocate solves the captcha'
    );
  });

  it('renders an unrecognised status as pending, never as a miss', () => {
    const m = tierMark({ ...TIERS[0]!, status: 'some_future_status' as CitationTier['status'] });
    expect(m.tone).toBe('pending');
    expect(m.tone).not.toBe('absent');
  });
});

describe('coverage', () => {
  it('states how much of the harness ran, so verified never reads as verified-by-everything', () => {
    expect(coverageLine(check().coverage)).toBe('Checked against 1 of 3 sources.');
  });

  it('knows when nothing independent has been asked yet', () => {
    expect(nothingIndependentRan(check())).toBe(true);
  });

  it('knows when an independent source WAS asked and had nothing', () => {
    const asked = check({
      tiers: [TIERS[0]!, { ...TIERS[1]!, status: 'miss', at: '2026-08-06T20:00:00Z' }, TIERS[2]!],
    });
    expect(nothingIndependentRan(asked)).toBe(false);
  });

  it('does not count Tier 1 towards independence — the corpus is us', () => {
    // Tier 1 confirmed, tiers 2 and 3 unshipped: still nothing independent.
    expect(nothingIndependentRan(check())).toBe(true);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TIMESTAMP THAT SHIPPED "Invalid Date" ONTO THE VERIFICATION SHEET.
 *
 * `citation_checks.at` is a Postgres timestamp — `2026-08-06 20:34:06.383686+00`
 * — with a space instead of `T`, microseconds, and a two-digit offset. V8 parses
 * it, so `new Date(at)` works in Node and in this suite. HERMES DOES NOT, and
 * the sheet rendered the literal string "Invalid Date" next to "Safe to file"
 * on a Galaxy S24.
 *
 * These tests therefore assert the NORMALISED STRING, never that `new Date()`
 * succeeded. A test written the obvious way — `expect(new Date(x).getTime()).not
 * .toBeNaN()` — passes on Node against the raw value and ships the bug anyway.
 * That is the whole lesson: the suite runs on a more forgiving engine than the
 * phone.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('isoFromServerTimestamp', () => {
  /** Strict ISO-8601. Hermes accepts this and nothing looser. */
  const STRICT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

  it('normalises the exact production value to strict ISO-8601', () => {
    const out = isoFromServerTimestamp('2026-08-06 20:34:06.383686+00');

    expect(out).toBe('2026-08-06T20:34:06.383+00:00');
    expect(out).toMatch(STRICT_ISO);
  });

  it('leaves an already-strict value usable', () => {
    expect(isoFromServerTimestamp('2026-08-06T20:34:06.383Z')).toMatch(STRICT_ISO);
    expect(isoFromServerTimestamp('2026-08-06T20:34:06Z')).toMatch(STRICT_ISO);
  });

  it('handles the offset forms Postgres emits', () => {
    expect(isoFromServerTimestamp('2026-08-06 20:34:06+05:30')).toBe('2026-08-06T20:34:06+05:30');
    expect(isoFromServerTimestamp('2026-08-06 20:34:06+0530')).toBe('2026-08-06T20:34:06+05:30');
    expect(isoFromServerTimestamp('2026-08-06 20:34:06-04')).toBe('2026-08-06T20:34:06-04:00');
  });

  it('returns null rather than a guess for anything it does not recognise', () => {
    expect(isoFromServerTimestamp(null)).toBeNull();
    expect(isoFromServerTimestamp('')).toBeNull();
    expect(isoFromServerTimestamp('6 August 2026')).toBeNull();
    expect(isoFromServerTimestamp('not a date at all')).toBeNull();
  });
});

describe('tierDateLabel', () => {
  it('renders a date for a tier that ran', () => {
    expect(tierDateLabel('2026-08-06 20:34:06.383686+00')).not.toBeNull();
  });

  /**
   * The two ways a verification surface can assert a check it cannot evidence:
   * a tier that never ran, and a time it could not read. Both render nothing.
   */
  it('renders nothing for a tier that never ran', () => {
    expect(tierDateLabel(null)).toBeNull();
  });

  it('never returns the string "Invalid Date"', () => {
    for (const bad of ['not a date', '', 'yesterday', '2026-13-45 99:99:99']) {
      const out = tierDateLabel(bad);
      expect(out).not.toBe('Invalid Date');
      expect(out ?? '').not.toMatch(/invalid|nan/i);
    }
  });
});

describe('sourceLabel', () => {
  it('names each tier in words an advocate reads, and passes through anything new', () => {
    expect(sourceLabel('corpus')).toBe('Our reported corpus');
    expect(sourceLabel('public_x2')).toBe('Two public sources');
    expect(sourceLabel('ecourts')).toBe('eCourts services');
    expect(sourceLabel('some_new_tier')).toBe('some_new_tier');
  });
});
