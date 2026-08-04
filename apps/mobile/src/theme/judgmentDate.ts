/**
 * A judgment date is `YYYY-MM-DD` — A DATE, NOT A TIMESTAMP.
 *
 * `new Date('2026-02-11')` parses as UTC midnight, so anywhere west of
 * Greenwich it formats as the 10th. A judgment date is a fact on a court
 * record; a product that moves it by a day in some timezones is wrong about
 * the record, and an advocate quoting it in a filing would be wrong too.
 *
 * So the string is split, never parsed. No `Date`, no locale arithmetic, no
 * timezone anywhere in this file.
 *
 * `11 February 2022`, matching `renders/65-judgment-quiet@2x.png`.
 */

const MONTHS = [
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

export function formatJudgmentDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  // Anything else is shown exactly as the server sent it. Inventing a format
  // for an unexpected value would hide a data problem behind a tidy string.
  if (!match) return date;

  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) return date;

  return `${Number(day)} ${name} ${year}`;
}
