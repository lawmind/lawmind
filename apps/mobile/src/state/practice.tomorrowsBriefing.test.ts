import { tomorrowsBriefing } from './practice';
import type { BriefingListItem, Matter } from '../api/contract';
import type { Cached } from './offlineCache';
import type { CivilDate } from '../theme/hearingDate';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SELECTOR THAT PUTS THE WEDGE ON THE HOME SCREEN — and returned null for
 * every advocate until 11 August 2026.
 *
 * It matched a briefing on two conditions: the hearing is tomorrow, AND
 * `b.matterId === matter.matterId`. `GET /matters/:id/briefings` does not send
 * `matterId` — it is an index already scoped to one matter and has no reason to
 * repeat it — so the second condition compared `undefined` to a real id and was
 * false on every row.
 *
 * The card simply never appeared. Not an error, not an empty state: the daily
 * loop's most important surface looked like it had nothing to show, which is
 * indistinguishable from an advocate with no hearing tomorrow.
 *
 * IT ALSO HID A SECOND DEFECT. `TodayScreen` read
 * `ready.briefing.authorities.length` off an index row that carries no
 * authorities — `undefined.length`, which throws. That line could not fire
 * because this selector never returned a briefing. Fixing one without the other
 * would have turned a silent absence into a crash on the home screen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `CivilDate` is `{ year, month, day }` — a civil date, never a `Date`. */
const TODAY: CivilDate = { year: 2026, month: 8, day: 11 };
const TOMORROW = '2026-08-12';

const matter = (over: Partial<Matter> = {}): Matter =>
  ({
    matterId: 'mat_1',
    caseTitle: 'Mock Client v. Mock Opponent',
    court: 'Mock High Court',
    caseType: 'civil',
    cnrNumber: null,
    parties: {},
    clientName: null,
    clientPhone: null,
    notes: null,
    nextHearingDate: TOMORROW,
    ...over,
  }) as Matter;

/** Exactly what `GET /matters/:id/briefings` returns. No `matterId`, by design. */
const listItem = (over: Partial<BriefingListItem> = {}): BriefingListItem => ({
  briefingId: 'brf_1',
  hearingDate: TOMORROW,
  generatedAt: '2026-08-11T02:00:00.000Z',
  openedAt: null,
  dateConfidence: {
    source: null,
    confirmedAt: null,
    notConfirmedAt: null,
    notConfirmedReason: null,
    state: 'never_checked',
  },
  ...over,
});

const cache = (rows: BriefingListItem[]): Record<string, Cached<BriefingListItem[]>> => ({
  mat_1: { value: rows, cachedAt: '2026-08-11T03:00:00.000Z' },
});

describe('finding tomorrow’s briefing', () => {
  it('finds it from a row carrying no matterId, which is every real row', () => {
    const found = tomorrowsBriefing([matter()], cache([listItem()]), TODAY);

    expect(found?.briefing.briefingId).toBe('brf_1');
    expect(found?.matter.matterId).toBe('mat_1');
  });

  it('carries the cache age through, so the card can say how old it is', () => {
    const found = tomorrowsBriefing([matter()], cache([listItem()]), TODAY);

    expect(found?.cachedAt).toBe('2026-08-11T03:00:00.000Z');
  });
});

/**
 * THE WEDGE IS A 24-HOUR BRIEFING. The selector deliberately does not fall back
 * to "the next one whenever it is" — a briefing for a hearing three weeks out
 * is not what an advocate opens tonight, and putting it in the same slot would
 * teach them the slot means nothing.
 */
describe('what it deliberately does not find', () => {
  it('ignores a hearing later this week', () => {
    const later = '2026-08-15';
    const found = tomorrowsBriefing(
      [matter({ nextHearingDate: later })],
      cache([listItem({ hearingDate: later })]),
      TODAY
    );

    expect(found).toBeNull();
  });

  it('ignores a hearing today — today is the cause list, not the briefing', () => {
    const found = tomorrowsBriefing(
      [matter({ nextHearingDate: '2026-08-11' })],
      cache([listItem({ hearingDate: '2026-08-11' })]),
      TODAY
    );

    expect(found).toBeNull();
  });

  it('returns null when the matter has no briefings cached at all', () => {
    expect(tomorrowsBriefing([matter()], {}, TODAY)).toBeNull();
  });

  it('returns null when a matter listed tomorrow has no briefing for that date', () => {
    const found = tomorrowsBriefing(
      [matter()],
      cache([listItem({ hearingDate: '2026-09-01' })]),
      TODAY
    );

    expect(found).toBeNull();
  });
});
