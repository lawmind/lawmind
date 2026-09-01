import { corpusScope, describeScope } from './corpusScope';
import type { CorpusCoverage } from '../../api/contract';

/**
 * THE CLAIM THE SCREEN IS ALLOWED TO MAKE ABOUT ITS OWN CORPUS.
 *
 * Coverage renders `held` for every High Court straight from the response, and
 * carried a hard-coded lede saying every judgment we hold is from the Supreme
 * Court. The two disagree the moment a single High Court row lands, and it is
 * the sentence — the part an advocate reads first and the part nothing
 * re-derives — that would have been wrong.
 *
 * The forbidden string is pinned by its distinguishing clause rather than by
 * the whole paragraph, so a rewording that keeps the false claim still fails.
 */
const SC_ONLY = /Every judgment in Lawmind today is from the Supreme Court of India/;

function coverage(highCourts: { held: number }[]): CorpusCoverage {
  return {
    supremeCourt: { courtName: 'Supreme Court of India', held: 38_341, sourceDocuments: null },
    highCourts: highCourts.map((c, i) => ({
      courtName: `Court ${i}`,
      courtCode: `c${i}`,
      sourceDocuments: 1_000_000,
      held: c.held,
      firstYear: 2016,
      lastYear: 2026,
    })),
    judgmentShareUnknown: true,
    judgmentShareRange: [0.0075, 0.1864],
    enumeratedAt: '2026-08-10T00:00:00.000Z',
  };
}

describe('corpusScope', () => {
  it('is Supreme Court only while every High Court holds zero', () => {
    expect(corpusScope(coverage([{ held: 0 }, { held: 0 }]))).toEqual({
      kind: 'supreme_court_only',
    });
  });

  /** ONE ROW IS ENOUGH. The claim is about "every judgment", so one refutes it. */
  it('is mixed as soon as a single High Court holds anything', () => {
    expect(corpusScope(coverage([{ held: 1 }, { held: 0 }, { held: 0 }]))).toEqual({
      kind: 'mixed',
      highCourtsWithHoldings: 1,
      highCourtsTotal: 3,
    });
  });

  /**
   * NOT ANSWERED IS ITS OWN ANSWER. An outage rendered as "we hold only the
   * Supreme Court" is a claim about the corpus that nothing checked.
   */
  it('is unknown when the route has not answered', () => {
    expect(corpusScope(null)).toEqual({ kind: 'unknown' });
  });
});

describe('describeScope', () => {
  it('makes the Supreme Court-only claim only when the response supports it', () => {
    expect(describeScope({ kind: 'supreme_court_only' })).toMatch(SC_ONLY);
  });

  it('never makes it once a High Court holds rows', () => {
    const copy = describeScope({
      kind: 'mixed',
      highCourtsWithHoldings: 3,
      highCourtsTotal: 26,
    });
    expect(copy).not.toMatch(SC_ONLY);
    expect(copy).toMatch(/3 High Courts of 26/);
  });

  it('reads naturally for a single High Court', () => {
    const copy = describeScope({ kind: 'mixed', highCourtsWithHoldings: 1, highCourtsTotal: 26 });
    expect(copy).toMatch(/1 High Court of 26/);
    expect(copy).not.toMatch(/1 High Courts/);
  });

  it('never converts an unanswered route into a completeness claim', () => {
    const copy = describeScope({ kind: 'unknown' });
    expect(copy).not.toMatch(SC_ONLY);
    expect(copy).not.toMatch(/complete|Complete/);
    expect(copy).toMatch(/could not read what we hold/);
  });

  /**
   * THE WARNING SURVIVES EVERY BRANCH. An empty search result looks identical
   * to "there is no such judgment" whether we hold one court or twenty-six, and
   * that is the harm this screen exists to prevent.
   */
  it.each([
    { kind: 'supreme_court_only' as const },
    { kind: 'mixed' as const, highCourtsWithHoldings: 2, highCourtsTotal: 26 },
    { kind: 'unknown' as const },
  ])('keeps the empty-result warning in $kind', (scope) => {
    expect(describeScope(scope)).toMatch(/nothing to find|absence of law/);
  });
});
