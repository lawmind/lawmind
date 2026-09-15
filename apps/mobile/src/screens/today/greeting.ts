/**
 * WHAT PART OF THE DAY IT IS, READ RATHER THAN ASSERTED.
 *
 * `TodayScreen` said "Good morning" unconditionally. Observed on a Galaxy S24
 * at 15:58 local, 15 September 2026: the daily-loop surface, the one an
 * advocate opens before a hearing, opened with a claim about the hour that it
 * had not checked.
 *
 * It is a small thing and it is the same rule as every other surface in this
 * client — say what was observed. An advocate who catches the app wrong about
 * the time of day has been handed a reason to wonder what else it states
 * without looking, on a product whose only real asset is that its statements
 * hold.
 *
 * PURE, AND TAKING ITS CLOCK AS AN ARGUMENT, so a test can stand at any hour
 * without mocking global time — the defect this replaces was invisible to a
 * suite that could only ever run at whatever o'clock CI happened to be.
 *
 * The boundaries are the ordinary English ones and are deliberately not clever:
 * before noon is morning, noon until 17:00 is afternoon, and the rest of the
 * day is evening. There is no "Good night": an advocate reading at 02:00 is
 * working, and telling them to sleep would be the app having an opinion.
 *
 * The clock is the DEVICE's, which is the right clock rather than merely the
 * available one — the advocate is standing where the phone is, and a cause list
 * is local to its court.
 */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
