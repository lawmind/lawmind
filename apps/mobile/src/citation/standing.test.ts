import type { PointInTimeAuthority } from '../api/contract';
import { standingCopy, standingCounts, standingOf } from './standing';

/**
 * THE REAL PRODUCTION ROW, NOT AN INVENTED ONE.
 *
 * Balwinder Singh (Binda) v. NCB, delivered 2023-09-22, relied on Kanhaiyalal
 * v. UOI, which Tofan Singh set aside on 2020-10-29. Measured against the live
 * API on 7 August 2026, after LCC fixed the date comparison.
 *
 * `statusRecordedAt` is the back-fill write timestamp and is left in the
 * fixture on purpose: it is three years adrift of the legal date, and if any
 * surface ever starts reading it these tests are what notice.
 */
const authority = (over: Partial<PointInTimeAuthority> = {}): PointInTimeAuthority => ({
  judgmentId: '00222d6a-796b-44bb-b9e0-9c2619406a7c',
  caseTitle: 'Kanhaiyalal v. Union of India',
  neutralCitation: '2008 INSC 25',
  judgmentDate: '2008-01-09',
  relationship: 'cites',
  standingWhenRelied: 'already_moved',
  daysAlreadyMoved: 1058,
  overruledStatus: 'set_aside',
  overruledByJudgmentId: 'c85a2af9-e0db-43bc-9f82-3c40c38d30a0',
  overruledOn: '2020-10-29',
  overruledByCaseTitle: 'Tofan Singh v. State of Tamil Nadu',
  statusRecordedAt: '2026-08-06 15:32:38.67999+00',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  asOf: '2026-08-06T19:15:12.741Z',
  ...over,
});

describe('standingOf', () => {
  it('states already-moved as one sentence with the bench and the gap', () => {
    const s = standingOf(authority());

    expect(s.kind).toBe('already_moved');
    if (s.kind !== 'already_moved') throw new Error('unreachable');
    expect(s.headline).toBe('Relied on after it was set aside');
    expect(s.detail).toBe(
      'Tofan Singh v. State of Tamil Nadu set this aside on 29 October 2020, 1,058 days before this judgment.'
    );
    expect(s.gapDays).toBe(1058);
  });

  it('names the bench and never an id', () => {
    const s = standingOf(authority());
    if (s.kind !== 'already_moved') throw new Error('unreachable');

    expect(s.detail).not.toContain('c85a2af9');
    expect(s.detail).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  /**
   * THE CASE A DATE COMPARISON GETS BACKWARDS. Tofan Singh reciting the
   * authority it overruled must never read as a bench relying on dead law.
   */
  it('says overruled_here for the judgment that did the overruling', () => {
    const s = standingOf(
      authority({ standingWhenRelied: 'overruled_here', daysAlreadyMoved: null })
    );

    expect(s.kind).toBe('overruled_here');
    if (s.kind !== 'overruled_here') throw new Error('unreachable');
    expect(s.headline).toBe('This is the judgment that set it aside');
    expect(s.detail).toBe('It was good law until this judgment.');
  });

  it('never presents overruled_here as reliance on law that had fallen', () => {
    const s = standingOf(authority({ standingWhenRelied: 'overruled_here' }));
    if (s.kind !== 'overruled_here') throw new Error('unreachable');

    expect(s.headline).not.toBe(standingCopy.alreadyMoved);
    expect(`${s.headline} ${s.detail}`).not.toMatch(/relied on after/i);
  });

  it('says moved_since when the law moved afterwards', () => {
    const s = standingOf(
      authority({ standingWhenRelied: 'moved_since', daysAlreadyMoved: null })
    );

    expect(s.kind).toBe('moved_since');
    if (s.kind !== 'moved_since') throw new Error('unreachable');
    expect(s.detail).toBe('Tofan Singh v. State of Tamil Nadu set it aside on 29 October 2020.');
  });

  it('renders silent where nothing has ever moved the authority', () => {
    expect(standingOf(authority({ standingWhenRelied: 'good_law_then' }))).toEqual({
      kind: 'good_law_then',
    });
  });

  /**
   * The strongest sentence in the panel is only sayable with a named bench and
   * a date. Without either it must not be made loosely.
   */
  it('falls back to unknown rather than accusing a bench with nothing behind it', () => {
    expect(standingOf(authority({ overruledByCaseTitle: null })).kind).toBe('unknown');
    expect(standingOf(authority({ overruledOn: null })).kind).toBe('unknown');
  });

  it('never collapses unknown into good law', () => {
    const s = standingOf(authority({ standingWhenRelied: 'unknown' }));

    expect(s.kind).toBe('unknown');
    if (s.kind !== 'unknown') throw new Error('unreachable');
    expect(s.detail).toContain('we cannot say whether it was standing at the time');
  });

  it('renders a state it does not recognise as unknown, never as the last branch', () => {
    const s = standingOf(
      authority({ standingWhenRelied: 'some_future_state' as PointInTimeAuthority['standingWhenRelied'] })
    );
    expect(s.kind).toBe('unknown');
  });

  it('does not read the back-fill write timestamp for anything', () => {
    // `statusRecordedAt` is 2026 while the law moved in 2020. If it ever reaches
    // a sentence, this catches it.
    const s = standingOf(authority());
    if (s.kind !== 'already_moved') throw new Error('unreachable');
    expect(s.detail).not.toContain('2026');
  });
});

describe('standingCounts', () => {
  it('counts what the rows can say, not what the server labelled', () => {
    const rows = [
      standingOf(authority({ standingWhenRelied: 'good_law_then' })),
      standingOf(authority()),
      standingOf(authority({ standingWhenRelied: 'overruled_here' })),
      standingOf(authority({ standingWhenRelied: 'moved_since' })),
      // Labelled already_moved, but with no bench to name — renders unknown, and
      // the tally must agree with the row rather than with the label.
      standingOf(authority({ overruledByCaseTitle: null })),
    ];

    expect(standingCounts(rows)).toEqual({
      good_law_then: 1,
      already_moved: 1,
      overruled_here: 1,
      moved_since: 1,
      unknown: 1,
    });
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER A SOUNDNESS RATING.
 *
 * This module has every input needed to compute one and must never grow the
 * output. A rating cannot be sourced to a primary record, is computed over the
 * fraction of authorities we happen to resolve, and cannot be argued with in
 * court. These tests are deliberately blunt: any new field or any sentence that
 * evaluates rather than reports trips them, and the failure is the conversation.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('never a soundness rating', () => {
  const EVALUATIVE =
    /\b(score|scores|scored|rating|rated|grade|graded|rank|ranked|risk|risky|vulnerable|vulnerability|weak|weakened|weakness|unsound|unreliable|strength|strong|confidence|reliability|percent|%)\b/i;

  const everyRender = () =>
    (
      ['good_law_then', 'already_moved', 'overruled_here', 'moved_since', 'unknown'] as const
    ).map((standingWhenRelied) => standingOf(authority({ standingWhenRelied })));

  it('exposes no field that could carry a verdict on the reasoning', () => {
    for (const render of everyRender()) {
      for (const key of Object.keys(render)) expect(key).not.toMatch(EVALUATIVE);

      // `gapDays` is the only number, and it is a count of days between two
      // court records — not a quantity derived from them.
      const numbers = Object.entries(render).filter(([, v]) => typeof v === 'number');
      expect(numbers.every(([k]) => k === 'gapDays')).toBe(true);
    }
  });

  it('states what happened and never what it means', () => {
    for (const render of everyRender()) {
      for (const [, value] of Object.entries(render)) {
        if (typeof value === 'string') expect(value).not.toMatch(EVALUATIVE);
      }
    }

    for (const [key, value] of Object.entries(standingCopy)) {
      if (typeof value === 'string') expect(`${key}: ${value}`).not.toMatch(EVALUATIVE);
    }
  });

  it('never aggregates the rows into a single figure for the judgment', () => {
    const counts = standingCounts(everyRender());

    // Five independent tallies, one per state. No total, no ratio, no derived
    // headline — a panel can say "1 relied on after it was set aside", which is
    // a fact, and cannot say "75% sound", which is not.
    expect(Object.keys(counts).sort()).toEqual([
      'already_moved',
      'good_law_then',
      'moved_since',
      'overruled_here',
      'unknown',
    ]);
    expect(Object.values(counts).every((n) => Number.isInteger(n))).toBe(true);
  });
});
