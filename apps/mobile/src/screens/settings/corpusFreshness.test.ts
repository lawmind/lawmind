import type { CorpusFreshness, CorpusFreshnessObject } from '../../api/contract';
import {
  describeCompleteness,
  describeDays,
  describeMonth,
  freshnessStatement,
  upstreamStatement,
} from './corpusFreshness';

/**
 * THE RULE UNDER TEST IS "QUOTE BOTH OR NEITHER" — NEW3 R16 `R16-RCC-03`,
 * founder design D-5, `V1_CAPABILITY_REGISTRY_R15.json`.
 *
 * The numbers below are the registry's own observed values: naive 1 day against
 * legal-currency 29. They are not arbitrary fixtures — the whole hazard is that
 * both are true and only one is useful.
 */
const FRESH: CorpusFreshness = {
  computedAt: '2026-09-01T00:00:00.000Z',
  naive: {
    newestJudgmentDate: '2026-08-28',
    lagDays: 1,
    reading: 'max(judgment_date). A month holding a single document has a newest date.',
  },
  legalCurrency: {
    dataAsOf: '2026-07-31',
    lagDays: 29,
    honestFrontierMonth: '2026-07-01',
    baselineDocumentsPerMonth: 134810,
  },
  caveats: ['The 0.6 / 0.1 thresholds were chosen by this project.'],
};

describe('freshnessStatement', () => {
  it('quotes both lags when both were measured', () => {
    const s = freshnessStatement(FRESH);

    expect(s.kind).toBe('both');
    if (s.kind !== 'both') return;
    expect(s.naiveLagDays).toBe(1);
    expect(s.currencyLagDays).toBe(29);
    expect(s.currencyAsOf).toBe('2026-07-31');
  });

  /**
   * NO MONTH CLEARS THE BASELINE FLOOR. This is a real and reportable
   * condition — and it is the opposite of current, so the one thing it may
   * never become is the naive number standing alone.
   */
  it('quotes NEITHER lag when legal currency could not be measured', () => {
    const s = freshnessStatement({
      ...FRESH,
      legalCurrency: { ...FRESH.legalCurrency, dataAsOf: null, lagDays: null, honestFrontierMonth: null },
    });

    expect(s.kind).toBe('unmeasured');
    expect(JSON.stringify(s)).not.toContain('"naiveLagDays"');
    if (s.kind !== 'unmeasured') return;
    expect(s.why).toMatch(/no recent month is complete enough/i);
  });

  /** The mirror case. An unmeasurable naive half cannot leave the honest one alone either. */
  it('quotes NEITHER lag when the corpus holds no dated judgment', () => {
    const s = freshnessStatement({
      ...FRESH,
      naive: { ...FRESH.naive, newestJudgmentDate: null, lagDays: null },
    });

    expect(s.kind).toBe('unmeasured');
    if (s.kind !== 'unmeasured') return;
    expect(s.why).toMatch(/no dated judgment/i);
  });

  /**
   * THE LOAD-BEARING NEGATIVE. Nothing this module returns may read as a clean
   * bill: a failure to observe is not "up to date", and there is no state here
   * that means "fine" by omission.
   */
  it('never produces copy that reads as up to date', () => {
    const states = [
      freshnessStatement(FRESH),
      freshnessStatement({
        ...FRESH,
        legalCurrency: { ...FRESH.legalCurrency, lagDays: null, dataAsOf: null, honestFrontierMonth: null },
      }),
    ];

    /**
     * BANNED CLAIMS, NOT BANNED WORDS. "No recent month is complete enough for
     * us to say how current this is" contains "complete" and is the exact
     * opposite of a clean bill — an earlier version of this assertion banned the
     * substring and failed the honest copy, which is the test being wrong rather
     * than the module. What may never appear is a claim of currency or of
     * completeness, and each pattern below is one.
     */
    for (const s of states) {
      const json = JSON.stringify(s);
      expect(json).not.toMatch(/up to date|fully current|nothing missing/i);
      /*
        A COMPLETENESS CLAIM, NOT THE WORD. "is complete enough" is the honest
        copy and must survive; "is complete" as a standing assertion must not.
        The lookahead is the whole difference, and an earlier version of this
        line had its escapes eaten and matched nothing at all — a vacuous
        assertion that passed on every input, which is worse than no test.
      */
      expect(json).not.toMatch(/\bis complete(?! enough)\b/i);
      expect(json).not.toMatch(/\bcurrent\./i);
      expect(json).not.toMatch(/we (?:are|will) .*(?:daily|hourly|within)/i);
    }
  });
});

describe('upstreamStatement', () => {
  const OBSERVATION: CorpusFreshnessObject = {
    publicationGeneration: 'r10',
    publishedAt: '2026-08-31T00:00:00.000Z',
    upstreamMeasuredAt: '2026-08-30T00:00:00.000Z',
    latestUpstreamDecisionDate: '2026-08-29',
    latestLocalDecisionDate: '2026-08-28',
    sourceLagDays: 1,
    upstreamLocalCompleteness: 0.9697,
    sourceUnavailableCount: 46754,
  };

  it('carries the measurement time, not the request time', () => {
    const s = upstreamStatement(OBSERVATION);

    expect(s.kind).toBe('measured');
    if (s.kind !== 'measured') return;
    expect(s.measuredAt).toBe('2026-08-30T00:00:00.000Z');
  });

  /**
   * A NULL LAG IS NOT A ZERO LAG. Zero would say we are level with the source;
   * null says the observation could not state it, and the screen renders that
   * difference rather than collapsing it.
   */
  it('passes a null source lag through rather than defaulting it', () => {
    const s = upstreamStatement({ ...OBSERVATION, sourceLagDays: null });

    expect(s.kind).toBe('measured');
    if (s.kind !== 'measured') return;
    expect(s.sourceLagDays).toBeNull();
  });

  /** The source's own refusals are their own number, never folded into completeness. */
  it('keeps source-unavailable documents separate from completeness', () => {
    const s = upstreamStatement(OBSERVATION);

    if (s.kind !== 'measured') return;
    expect(s.sourceUnavailableCount).toBe(46754);
    expect(s.completeness).toBe(0.9697);
  });
});

describe('formatting', () => {
  it('does not write "1 days"', () => {
    expect(describeDays(1)).toBe('1 day');
    expect(describeDays(29)).toBe('29 days');
  });

  it('names a frontier month in words', () => {
    expect(describeMonth('2026-07-01')).toMatch(/July 2026/);
  });

  /** Never rounded up to a flat 97% — the gap is the point of the number. */
  it('keeps two decimals on completeness', () => {
    expect(describeCompleteness(0.9697)).toBe('96.97%');
  });

  it('returns an unrecognised month unchanged rather than guessing', () => {
    expect(describeMonth('not-a-month')).toBe('not-a-month');
  });
});
