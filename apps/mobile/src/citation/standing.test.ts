import type { PointInTimeAuthority } from '../api/contract';
import { daysBetween, standingCopy, standingCounts, standingOf } from './standing';

/**
 * THE REAL PRODUCTION ROW, NOT AN INVENTED ONE.
 *
 * Balwinder Singh (Binda) v. NCB, delivered 2023-09-22, relied on Kanhaiyalal
 * v. UOI, which Tofan Singh set aside on 2020-10-29. Measured against the live
 * API on 6 August 2026.
 *
 * It carries `standingWhenRelied: 'moved_since'` and
 * `statusChangedAt: '2026-08-06 15:32'` — both wrong for this purpose, both
 * left in the fixture on purpose. If this module ever starts reading either
 * one, these tests fail rather than the product quietly changing its mind about
 * what a bench did.
 */
const KANHAIYALAL: PointInTimeAuthority = {
  judgmentId: '00222d6a-796b-44bb-b9e0-9c2619406a7c',
  caseTitle: 'Kanhaiyalal v. Union of India',
  neutralCitation: '2008 INSC 25',
  judgmentDate: '2008-01-09',
  relationship: 'cites',
  standingWhenRelied: 'moved_since',
  daysAlreadyMoved: null,
  overruledStatus: 'set_aside',
  overruledByJudgmentId: 'c85a2af9-e0db-43bc-9f82-3c40c38d30a0',
  statusChangedAt: '2026-08-06 15:32:38.67999+00',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  asOf: '2026-08-06T19:15:12.741Z',
};

const TOFAN_SINGH = {
  judgmentId: 'c85a2af9-e0db-43bc-9f82-3c40c38d30a0',
  caseTitle: 'Tofan Singh v. State of Tamil Nadu',
  neutralCitation: '2020 INSC 620',
  judgmentDate: '2020-10-29',
};

const BALWINDER_DELIVERED = '2023-09-22';

describe('daysBetween', () => {
  it('counts whole days across years and leap days', () => {
    expect(daysBetween('2020-10-29', '2023-09-22')).toBe(1058);
    expect(daysBetween('2020-02-28', '2020-03-01')).toBe(2);
  });

  it('returns null rather than a number for anything that is not a plain date', () => {
    expect(daysBetween('2026-08-06 15:32:38.67999+00', '2023-09-22')).toBeNull();
    expect(daysBetween('', '2023-09-22')).toBeNull();
    expect(daysBetween('October 2020', '2023-09-22')).toBeNull();
  });
});

describe('standingOf', () => {
  it('reads two judgment dates, not the server verdict or the write timestamp', () => {
    const s = standingOf({
      authority: KANHAIYALAL,
      deliveredOn: BALWINDER_DELIVERED,
      overruling: TOFAN_SINGH,
    });

    // The row said `moved_since`. Two dates say otherwise, and the dates win.
    expect(s.kind).toBe('already_moved');
    if (s.kind !== 'already_moved') throw new Error('unreachable');
    expect(s.gapDays).toBe(1058);
    expect(s.gap).toBe('1,058 days before this judgment');
    expect(s.detail).toBe(
      'Tofan Singh v. State of Tamil Nadu set this aside on 29 October 2020, 1,058 days before this judgment.'
    );
  });

  it('names the judgment that moved the law and never its id', () => {
    const s = standingOf({
      authority: KANHAIYALAL,
      deliveredOn: BALWINDER_DELIVERED,
      overruling: TOFAN_SINGH,
    });
    if (s.kind !== 'already_moved') throw new Error('unreachable');

    expect(s.detail).not.toContain(TOFAN_SINGH.judgmentId);
    expect(s.headline).not.toContain(TOFAN_SINGH.judgmentId);
    // The id is carried for the tap target, but never in a sentence.
    expect(s.overruling.judgmentId).toBe(TOFAN_SINGH.judgmentId);
  });

  it('says moved_since when the law moved after the judgment relied on it', () => {
    const s = standingOf({
      authority: KANHAIYALAL,
      // Najmunisha-shaped: relied on before the overruling.
      deliveredOn: '2013-10-08',
      overruling: TOFAN_SINGH,
    });

    expect(s.kind).toBe('moved_since');
    if (s.kind !== 'moved_since') throw new Error('unreachable');
    expect(s.detail).toBe('Tofan Singh v. State of Tamil Nadu set it aside on 29 October 2020.');
  });

  it('takes the reading that does not accuse the bench when the two share a date', () => {
    const s = standingOf({
      authority: KANHAIYALAL,
      deliveredOn: TOFAN_SINGH.judgmentDate,
      overruling: TOFAN_SINGH,
    });
    expect(s.kind).toBe('moved_since');
  });

  it('renders silent where nothing has ever moved the authority', () => {
    const s = standingOf({
      authority: { ...KANHAIYALAL, overruledStatus: 'none' },
      deliveredOn: BALWINDER_DELIVERED,
      overruling: null,
    });

    expect(s).toEqual({ kind: 'good_law_then' });
  });

  it('says unknown rather than guessing when the overruling judgment is unresolved', () => {
    const s = standingOf({
      authority: KANHAIYALAL,
      deliveredOn: BALWINDER_DELIVERED,
      overruling: null,
    });

    expect(s.kind).toBe('unknown');
    if (s.kind !== 'unknown') throw new Error('unreachable');
    expect(s.detail).toContain('we cannot say whether it was standing at the time');
  });

  it('says unknown rather than a wrong number when a date will not parse', () => {
    const s = standingOf({
      authority: KANHAIYALAL,
      deliveredOn: BALWINDER_DELIVERED,
      overruling: { ...TOFAN_SINGH, judgmentDate: '2020-10' },
    });
    expect(s.kind).toBe('unknown');
  });
});

describe('standingCounts', () => {
  it('is derived from the rows, so the tally cannot contradict what is under it', () => {
    const rows = [
      standingOf({
        authority: { ...KANHAIYALAL, overruledStatus: 'none' },
        deliveredOn: BALWINDER_DELIVERED,
      }),
      standingOf({
        authority: KANHAIYALAL,
        deliveredOn: BALWINDER_DELIVERED,
        overruling: TOFAN_SINGH,
      }),
      standingOf({ authority: KANHAIYALAL, deliveredOn: BALWINDER_DELIVERED }),
    ];

    expect(standingCounts(rows)).toEqual({
      good_law_then: 1,
      already_moved: 1,
      moved_since: 0,
      unknown: 1,
    });
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER A SOUNDNESS RATING.
 *
 * The competitor ships a red "Vulnerable" verdict on a court's reasoning. This
 * module has every input needed to compute one and must never grow the output.
 * A rating cannot be sourced to a primary record, is computed over the fraction
 * of authorities we happen to resolve, and cannot be argued with in court.
 *
 * These two tests are the enforcement. They are deliberately blunt: any new
 * field or any new sentence that evaluates rather than reports will trip them,
 * and the failure is the conversation.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('never a soundness rating', () => {
  /** Verdict vocabulary. Reporting words — "set aside", "relied on" — are not here. */
  const EVALUATIVE =
    /\b(score|scores|scored|rating|rated|grade|graded|rank|ranked|risk|risky|vulnerable|vulnerability|weak|weakened|weakness|unsound|unreliable|strength|strong|confidence|reliability|percent|%)\b/i;

  const everyRender = () => [
    standingOf({
      authority: { ...KANHAIYALAL, overruledStatus: 'none' },
      deliveredOn: BALWINDER_DELIVERED,
    }),
    standingOf({ authority: KANHAIYALAL, deliveredOn: BALWINDER_DELIVERED, overruling: TOFAN_SINGH }),
    standingOf({ authority: KANHAIYALAL, deliveredOn: '2013-10-08', overruling: TOFAN_SINGH }),
    standingOf({ authority: KANHAIYALAL, deliveredOn: BALWINDER_DELIVERED }),
  ];

  it('exposes no field that could carry a verdict on the reasoning', () => {
    for (const render of everyRender()) {
      for (const key of Object.keys(render)) {
        expect(key).not.toMatch(EVALUATIVE);
      }
      // `gapDays` is the only number here, and it is a count of days between two
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
      if (typeof value === 'string') {
        expect(`${key}: ${value}`).not.toMatch(EVALUATIVE);
      }
    }
  });

  it('never aggregates the rows into a single figure for the judgment', () => {
    const counts = standingCounts(everyRender());

    // Four independent tallies, one per state. There is no total, no ratio and
    // no derived headline — a panel can say "1 relied on after it was set
    // aside", which is a fact, and cannot say "75% sound", which is not.
    expect(Object.keys(counts).sort()).toEqual([
      'already_moved',
      'good_law_then',
      'moved_since',
      'unknown',
    ]);
    expect(Object.values(counts).every((n) => Number.isInteger(n))).toBe(true);
  });
});
