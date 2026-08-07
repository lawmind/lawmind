/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CIVIL DATE ARITHMETIC — for hearing dates, which are `YYYY-MM-DD` and are not
 * timestamps.
 *
 * `theme/judgmentDate.ts` already makes the case for never handing a date-only
 * string to `new Date()`: it parses as UTC midnight, so west of Greenwich the
 * 11th renders as the 10th. That file only had to FORMAT one. The daily loop
 * has to do arithmetic — "tomorrow", "in two weeks", "how many days away" — and
 * getting that wrong is worse than a display bug: an advocate who is told a
 * matter is listed tomorrow when it is listed today misses a hearing.
 *
 * So every function here works on the (year, month, day) triple and converts to
 * a day NUMBER via a civil-days algorithm, never through `Date`. Nothing in this
 * file constructs a `Date` from a string, and the only clock read is the
 * device's LOCAL calendar day, which is what "today" means to somebody standing
 * in a courtroom.
 *
 * WHY NOT `Date` WITH A TIME COMPONENT. `new Date('2026-08-13T00:00:00')` is
 * local in V8 and was famously not in older engines; the app runs on Hermes on
 * the phone and on Node in the suite, and a rule that holds on one engine and
 * not the other is exactly how "Invalid Date" shipped next to "Safe to file".
 * Integer arithmetic behaves identically everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type CivilDate = { year: number; month: number; day: number };

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const WEEKDAYS_LONG = [
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
] as const;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Null for anything that is not `YYYY-MM-DD`. A bad value is never guessed into a date. */
export function parseCivilDate(value: string | null | undefined): CivilDate | null {
  if (!value) return null;
  const match = ISO.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function toIso(date: CivilDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

/**
 * Howard Hinnant's `days_from_civil`. Days since 1970-01-01, using integer
 * arithmetic only — no epoch milliseconds, no timezone, no `Date`.
 */
export function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The inverse — `civil_from_days`. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: month <= 2 ? y + 1 : y, month, day };
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return civilFromDays(daysFromCivil(date) + days);
}

/** Positive when `date` is in the future. Null when either side is unparseable. */
export function daysUntil(date: string, today: CivilDate): number | null {
  const target = parseCivilDate(date);
  if (!target) return null;
  return daysFromCivil(target) - daysFromCivil(today);
}

/**
 * The device's LOCAL calendar day. `getFullYear`/`getMonth`/`getDate` are local
 * accessors, which is the whole point: an advocate in Delhi at 00:30 is on
 * today's date in Delhi, not yesterday's in UTC.
 */
export function todayCivil(now: Date = new Date()): CivilDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** `Thursday`. 1970-01-01 was a Thursday, which is why the table starts there. */
export function weekdayName(date: CivilDate): string {
  const index = ((daysFromCivil(date) % 7) + 7) % 7;
  // `index` is 0-6 by construction; the fallback exists only to satisfy
  // `noUncheckedIndexedAccess`, and is unreachable.
  return WEEKDAYS_LONG[index] ?? WEEKDAYS_LONG[0];
}

/** `13 August 2026`. */
export function formatLong(date: CivilDate): string {
  return `${date.day} ${MONTHS_LONG[date.month - 1] ?? ''} ${date.year}`;
}

/** `13 August`. The year is dropped where it is obvious; hearings are weeks away, not years. */
export function formatDayMonth(date: CivilDate): string {
  return `${date.day} ${MONTHS_LONG[date.month - 1] ?? ''}`;
}

/** `30 JUL` — the cause list and the week list gutter. Mono, so it stays a column. */
export function formatGutter(date: CivilDate): string {
  return `${String(date.day).padStart(2, '0')} ${(MONTHS_SHORT[date.month - 1] ?? '').toUpperCase()}`;
}

/** `13 August, Wednesday` — the adjournment sheet's second line. */
export function formatDayMonthWeekday(date: CivilDate): string {
  return `${formatDayMonth(date)}, ${weekdayName(date)}`;
}

/**
 * How a hearing date is spoken.
 *
 * "Tomorrow" is the single most load-bearing word in this product — it is what
 * the briefing is FOR — so it is computed from the day difference and never
 * from a formatted string comparison.
 *
 * A date in the PAST is named as such rather than rendered as an ordinary
 * listing: a matter whose next date has passed needs an adjournment recorded,
 * and showing it as though it were upcoming hides the one thing to do about it.
 */
export function describeHearingDate(date: string, today: CivilDate = todayCivil()): string {
  const parsed = parseCivilDate(date);
  if (!parsed) return date;

  const delta = daysFromCivil(parsed) - daysFromCivil(today);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta < 0) return formatLong(parsed);
  if (delta < 7) return weekdayName(parsed);
  return formatDayMonth(parsed);
}

/**
 * PREDICTED ADJOURNMENT DATES — `IMPLEMENTATION.md` §9d.
 *
 * "Dates are predicted, not typed. Computed from this court's real adjournment
 * intervals. A typed date is four taps and a keyboard; a predicted one is a
 * single tap."
 *
 * The intervals are the offered ones: tomorrow, two weeks, four weeks. They are
 * OFFERS, not assertions about what the court did — the advocate heard the date
 * in open court and is recording it, so "Pick a date" sits alongside as an equal
 * and the sheet never insists.
 *
 * Weekends are stepped over for the two- and four-week offers because no
 * district court lists on one, and offering a Sunday wastes the tap the whole
 * screen exists to save. Tomorrow is offered as-is: an advocate told "tomorrow"
 * in court means tomorrow, and correcting them would be the app arguing with a
 * judge.
 */
export type PredictedDate = { label: string; iso: string; detail: string };

export function predictedAdjournmentDates(today: CivilDate = todayCivil()): PredictedDate[] {
  const offer = (days: number, label: string, skipWeekend: boolean): PredictedDate => {
    let candidate = addDays(today, days);
    if (skipWeekend) {
      // 1970-01-01 was a Thursday: index 2 is Saturday, index 3 is Sunday.
      for (let guard = 0; guard < 3; guard += 1) {
        const index = ((daysFromCivil(candidate) % 7) + 7) % 7;
        if (index !== 2 && index !== 3) break;
        candidate = addDays(candidate, 1);
      }
    }
    return { label, iso: toIso(candidate), detail: formatDayMonthWeekday(candidate) };
  };

  return [
    offer(1, 'Tomorrow', false),
    offer(14, 'In 2 weeks', true),
    offer(28, 'In 4 weeks', true),
  ];
}
