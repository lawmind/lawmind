import { timeOfDayGreeting } from './greeting';

/**
 * THE DEFECT A PHYSICAL DEVICE FOUND AND 1,273 UNIT TESTS DID NOT.
 *
 * `TodayScreen` greeted every advocate with "Good morning" whatever the hour.
 * It survived because nothing asserted it: the string was a constant, so there
 * was no wrong branch to catch, and a suite that runs at CI's o'clock would not
 * have noticed even if there had been. It took opening the app on a real phone
 * at 15:58 to see it.
 *
 * Each case names a real time rather than a boundary arithmetic, so the test
 * reads as the claim it is making.
 */
const at = (h: number, m = 0) => new Date(2026, 8, 15, h, m, 0);

describe('the greeting states the hour it actually is', () => {
  it('is morning from midnight to noon', () => {
    expect(timeOfDayGreeting(at(0, 0))).toBe('Good morning');
    expect(timeOfDayGreeting(at(6, 30))).toBe('Good morning');
    expect(timeOfDayGreeting(at(11, 59))).toBe('Good morning');
  });

  it('is afternoon from noon to five', () => {
    expect(timeOfDayGreeting(at(12, 0))).toBe('Good afternoon');
    // 15:58 on a Galaxy S24 — the observation this file exists for.
    expect(timeOfDayGreeting(at(15, 58))).toBe('Good afternoon');
    expect(timeOfDayGreeting(at(16, 59))).toBe('Good afternoon');
  });

  it('is evening after five, and never tells an advocate it is night', () => {
    expect(timeOfDayGreeting(at(17, 0))).toBe('Good evening');
    expect(timeOfDayGreeting(at(21, 15))).toBe('Good evening');
    // 02:00 is an advocate working, not an advocate who should be asleep.
    expect(timeOfDayGreeting(at(2, 0))).toBe('Good morning');
  });

  it('never returns the unconditional string this replaced, at any hour', () => {
    const said = new Set(
      Array.from({ length: 24 }, (_, h) => timeOfDayGreeting(at(h, 0))),
    );
    expect(said.size).toBe(3);
    expect(said.has('Good morning')).toBe(true);
    expect(said.has('Good afternoon')).toBe(true);
    expect(said.has('Good evening')).toBe(true);
  });
});
