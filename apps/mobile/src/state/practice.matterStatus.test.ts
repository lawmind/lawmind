import type { Matter } from '../api/contract';
import { isInCaseload, listedToday, matterStatus, overdue, upcoming } from './practice';
import type { CivilDate } from '../theme/hearingDate';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHIVING CHANGES WHAT THE MORNING SHOWS — founder design D-2's third truth
 * state, and the half that makes the feature worth anything.
 *
 * D-2's user job, verbatim: *"This matter is disposed and I do not want it on my
 * list every morning."* A status that changed a label and nothing else would
 * answer the words of that sentence and not the request in it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TODAY: CivilDate = { year: 2026, month: 9, day: 1 };

function matter(over: Partial<Matter>): Matter {
  return {
    matterId: 'mat',
    caseTitle: 'Mock v. Mock',
    cnrNumber: null,
    court: 'Patna High Court',
    caseType: 'criminal',
    parties: { description: '' },
    clientName: 'Mock Client',
    ourSide: 'petitioner',
    nextHearingDate: null,
    status: 'active',
    ...over,
  };
}

describe('matterStatus', () => {
  /**
   * A matter rehydrated from a cache written before `status` was declared
   * carries none. ACTIVE is the conservative reading — the alternative is a
   * matter silently vanishing from an advocate's morning after an app update.
   */
  it('reads a missing status as active', () => {
    const { status: _dropped, ...withoutStatus } = matter({});
    expect(matterStatus(withoutStatus as Matter)).toBe('active');
    expect(isInCaseload(withoutStatus as Matter)).toBe(true);
  });

  it('keeps only active matters in the caseload', () => {
    expect(isInCaseload(matter({ status: 'active' }))).toBe(true);
    expect(isInCaseload(matter({ status: 'disposed' }))).toBe(false);
    expect(isInCaseload(matter({ status: 'archived' }))).toBe(false);
  });
});

describe('the morning surfaces', () => {
  const listed = matter({ matterId: 'listed', nextHearingDate: '2026-09-01' });
  const soon = matter({ matterId: 'soon', nextHearingDate: '2026-09-04' });
  const past = matter({ matterId: 'past', nextHearingDate: '2026-08-20' });

  it('drops a disposed matter from what is coming', () => {
    expect(upcoming([soon], TODAY).map((m) => m.matter.matterId)).toEqual(['soon']);
    expect(upcoming([{ ...soon, status: 'disposed' }], TODAY)).toEqual([]);
  });

  it("drops an archived matter from today's cause list", () => {
    expect(listedToday([listed], TODAY).map((m) => m.matter.matterId)).toEqual(['listed']);
    expect(listedToday([{ ...listed, status: 'archived' }], TODAY)).toEqual([]);
  });

  /**
   * THE ONE THAT WOULD HAVE BITTEN. "The recorded date has passed — record the
   * next one" is a prompt to act, and a disposed matter's last hearing date has
   * passed BY DEFINITION. Without the filter here, disposing a matter would move
   * it from the listed section into a nagging one rather than off the list —
   * the opposite of what the advocate asked for.
   */
  it('does not nag for a next date on a matter that is finished', () => {
    expect(overdue([past], TODAY).map((m) => m.matter.matterId)).toEqual(['past']);
    expect(overdue([{ ...past, status: 'disposed' }], TODAY)).toEqual([]);
    expect(overdue([{ ...past, status: 'archived' }], TODAY)).toEqual([]);
  });

  /** Archiving one matter does not touch the rest of the morning. */
  it('leaves the other matters exactly where they were', () => {
    const all = [listed, soon, { ...past, status: 'archived' as const }];
    expect(upcoming(all, TODAY).map((m) => m.matter.matterId)).toEqual(['listed', 'soon']);
  });
});
