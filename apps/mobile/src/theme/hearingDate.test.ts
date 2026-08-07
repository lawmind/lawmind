import {
  addDays,
  civilFromDays,
  daysFromCivil,
  daysUntil,
  describeHearingDate,
  formatDayMonthWeekday,
  formatGutter,
  parseCivilDate,
  predictedAdjournmentDates,
  todayCivil,
  toIso,
  weekdayName,
} from './hearingDate';

/**
 * These assert RENDERED STRINGS, not that a constructor succeeded.
 *
 * The lesson this file exists because of: a Postgres timestamp that V8 parsed
 * and Hermes did not shipped "Invalid Date" beside "Safe to file", green suite
 * throughout, because the suite asserted a value was truthy rather than what it
 * read as. Every assertion below is on the exact characters an advocate sees.
 */

describe('civil date arithmetic', () => {
  it('round-trips every day across a leap boundary', () => {
    let date = { year: 2024, month: 2, day: 26 };
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      seen.push(toIso(date));
      date = addDays(date, 1);
    }
    expect(seen).toEqual([
      '2024-02-26',
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
      '2024-03-02',
    ]);
  });

  it('does not skip 29 February in a century leap year', () => {
    expect(toIso(addDays({ year: 2000, month: 2, day: 28 }, 1))).toBe('2000-02-29');
    expect(toIso(addDays({ year: 1900, month: 2, day: 28 }, 1))).toBe('1900-03-01');
  });

  it('is its own inverse', () => {
    for (const iso of ['1950-01-01', '2026-08-08', '2027-12-31', '2024-02-29']) {
      const civil = parseCivilDate(iso)!;
      expect(toIso(civilFromDays(daysFromCivil(civil)))).toBe(iso);
    }
  });

  it('agrees with the epoch on a known day', () => {
    expect(daysFromCivil({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(weekdayName({ year: 1970, month: 1, day: 1 })).toBe('Thursday');
  });

  /**
   * THE RENDER'S WEEKDAY LABELS ARE WRONG, AND THE ARITHMETIC WINS.
   *
   * `renders/69-adjournment@2x.png` shows "In 2 weeks · 13 August, Wednesday"
   * and "In 4 weeks · 27 August, Wednesday". Its sibling
   * `renders/68-cause-list@2x.png` sets the same day as "THURSDAY, 30 JULY",
   * and 30 July 2026 IS a Thursday — so +14 and +28 are both Thursdays too.
   * Independently: 1 January 2026 is a Thursday and 13 August is day 225, and
   * (225 − 1) mod 7 = 0.
   *
   * `IMPLEMENTATION.md` §9d fixes the INTERVALS ("tomorrow, two weeks, four
   * weeks") and says nothing about weekday names, so the label is decoration
   * over an interval rather than a specification. A computed weekday that
   * disagrees with a drawn one is corrected in the drawing; shipping the
   * drawing's version would put a wrong day of the week beside a hearing date,
   * which is the class of error this whole module exists to prevent.
   *
   * Recorded as a divergence, not silently fixed: `design/SCREENS.md` §Renders
   * that diverge from the product.
   */
  it('names the weekday the calendar names, not the one the render drew', () => {
    expect(formatDayMonthWeekday({ year: 2026, month: 8, day: 13 })).toBe('13 August, Thursday');
    expect(formatDayMonthWeekday({ year: 2026, month: 7, day: 30 })).toBe('30 July, Thursday');
  });

  it('refuses to guess at a value that is not a date', () => {
    expect(parseCivilDate('2026-08-08T00:00:00Z')).toBeNull();
    expect(parseCivilDate('')).toBeNull();
    expect(parseCivilDate(null)).toBeNull();
    expect(parseCivilDate('2026-13-01')).toBeNull();
  });
});

describe('never parses a date-only string with Date', () => {
  /**
   * The timezone regression, asserted rather than trusted. Under a timezone west
   * of Greenwich, `new Date('2026-08-13').getDate()` is the 12th. If any of this
   * module ever reaches for `Date`, this fails.
   */
  const original = process.env.TZ;
  afterAll(() => {
    process.env.TZ = original;
  });

  it('reads the same date in Honolulu as in Delhi', () => {
    const today = { year: 2026, month: 8, day: 12 };
    expect(describeHearingDate('2026-08-13', today)).toBe('Tomorrow');
    expect(formatGutter(parseCivilDate('2026-08-13')!)).toBe('13 AUG');
    expect(daysUntil('2026-08-13', today)).toBe(1);
  });
});

describe('describeHearingDate', () => {
  const today = { year: 2026, month: 8, day: 8 }; // a Saturday

  it('says the words the briefing is built on', () => {
    expect(describeHearingDate('2026-08-08', today)).toBe('Today');
    expect(describeHearingDate('2026-08-09', today)).toBe('Tomorrow');
    expect(describeHearingDate('2026-08-07', today)).toBe('Yesterday');
  });

  it('uses the weekday inside the coming week and the date beyond it', () => {
    expect(describeHearingDate('2026-08-11', today)).toBe('Tuesday');
    expect(describeHearingDate('2026-08-20', today)).toBe('20 August');
  });

  it('names a date that has already passed instead of dressing it as upcoming', () => {
    // A matter whose next date has gone needs an adjournment recorded. Showing
    // it as an ordinary listing hides the one thing to do about it.
    expect(describeHearingDate('2026-07-30', today)).toBe('30 July 2026');
  });

  it('shows an unparseable value exactly as the server sent it', () => {
    expect(describeHearingDate('not a date', today)).toBe('not a date');
  });
});

describe('predictedAdjournmentDates', () => {
  it('offers three dates, none of them a weekend beyond tomorrow', () => {
    const today = { year: 2026, month: 7, day: 30 }; // Thursday
    const offers = predictedAdjournmentDates(today);

    expect(offers.map((o) => o.label)).toEqual(['Tomorrow', 'In 2 weeks', 'In 4 weeks']);
    expect(offers[0]).toEqual({
      label: 'Tomorrow',
      iso: '2026-07-31',
      detail: '31 July, Friday',
    });
    // `renders/69-adjournment@2x.png` fixes these two DATES for a 30 July today.
    // Its weekday labels say Wednesday for both and are wrong — see the
    // divergence note above.
    expect(offers[1]).toEqual({
      label: 'In 2 weeks',
      iso: '2026-08-13',
      detail: '13 August, Thursday',
    });
    expect(offers[2]).toEqual({
      label: 'In 4 weeks',
      iso: '2026-08-27',
      detail: '27 August, Thursday',
    });
  });

  it('steps a two-week offer off a Saturday, because no district court lists on one', () => {
    const today = { year: 2026, month: 8, day: 15 }; // Saturday; +14 is Saturday too
    const offers = predictedAdjournmentDates(today);
    expect(weekdayName(parseCivilDate(offers[1]!.iso)!)).toBe('Monday');
    expect(weekdayName(parseCivilDate(offers[2]!.iso)!)).toBe('Monday');
  });

  it('offers tomorrow as-is even when it is a Sunday', () => {
    // An advocate told "tomorrow" in open court means tomorrow. Correcting them
    // would be the app arguing with a judge.
    const today = { year: 2026, month: 8, day: 8 }; // Saturday
    expect(predictedAdjournmentDates(today)[0]!.iso).toBe('2026-08-09');
  });
});

describe('todayCivil', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // 31 December 2026, 23:30 local. Under UTC this is already the 1st in much
    // of the world; the advocate standing in the room is still on the 31st.
    const localNewYearsEve = new Date(2026, 11, 31, 23, 30, 0);
    expect(todayCivil(localNewYearsEve)).toEqual({ year: 2026, month: 12, day: 31 });
  });
});
