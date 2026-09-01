import { adjournmentOrderText, usePractice } from './practice';
import { api } from '../api/client';
import type { Matter } from '../api/contract';

/**
 * THE ADJOURNMENT PURPOSE — NEW3 R15 P3/I3, a P0.
 *
 * The defect being pinned: `PURPOSES` rendered as a selectable row set, the
 * selection was held in component state, and `save()` sent ONLY the date. An
 * advocate selected "Evidence", saw the ink stamp and "the next hearing date is
 * saved on this matter", and had recorded nothing — the same class of harm as an
 * unconfirmed OCR date.
 *
 * These tests assert the two halves separately on purpose, because they have
 * different guarantees: the date is a column and is written locally first, the
 * purpose is a timeline event and is not.
 */

jest.mock('../api/client', () => ({
  api: {
    matters: jest.fn(),
    updateMatter: jest.fn(),
    addMatterEvent: jest.fn(),
    matterBriefings: jest.fn(),
  },
}));

jest.mock('./offlineCache', () => ({
  readCache: jest.fn(() => Promise.resolve(null)),
  writeCache: jest.fn((_k: string, v: unknown) => Promise.resolve({ value: v, cachedAt: 'now' })),
}));

const updateMatter = api.updateMatter as jest.MockedFunction<typeof api.updateMatter>;
const addMatterEvent = api.addMatterEvent as jest.MockedFunction<typeof api.addMatterEvent>;

const matter = {
  matterId: 'm1',
  caseTitle: 'State v. Rakesh Yadav',
  court: 'Sessions Court, Patiala House',
  nextHearingDate: null,
} as unknown as Matter;

beforeEach(() => {
  jest.clearAllMocks();
  usePractice.setState({ matters: [matter], freshness: { kind: 'live' }, loading: false });
  updateMatter.mockResolvedValue({
    ok: true,
    data: { matter: { ...matter, nextHearingDate: '2026-09-15' } },
  } as never);
  addMatterEvent.mockResolvedValue({ ok: true, data: { event: {} } } as never);
});

/**
 * `orderText`, NOT `notes` — NEW3's mapping, and the reason is not stylistic.
 * `services/api/src/matters/route.ts` calls `orderText` "the court record.
 * Always visible to a share", while `notes` obeys `noteVisibility` and defaults
 * private. A purpose given in open court is what the court said, so putting it
 * in `notes` would hide the hearing's one fact from a co-counsel.
 */
describe('adjournmentOrderText', () => {
  it('names the date in full and the purpose the court gave', () => {
    expect(adjournmentOrderText('2026-09-15', 'Evidence')).toBe(
      'Adjourned to 15 September 2026 for evidence.',
    );
  });

  it('reads as a sentence for the default answer rather than as a fragment', () => {
    expect(adjournmentOrderText('2026-09-15', 'Same purpose')).toBe(
      'Adjourned to 15 September 2026 for the same purpose.',
    );
  });

  it('says only what it knows when no purpose was given', () => {
    expect(adjournmentOrderText('2026-09-15', '')).toBe('Adjourned to 15 September 2026.');
  });

  /** A date that will not parse is still shown, never swallowed or guessed at. */
  it('falls back to the raw value rather than inventing a date', () => {
    expect(adjournmentOrderText('not-a-date', 'Orders')).toBe('Adjourned to not-a-date for orders.');
  });
});

describe('recordAdjournment', () => {
  it('writes the date to the matter and the purpose to the timeline', async () => {
    const r = await usePractice.getState().recordAdjournment('m1', '2026-09-15', 'Evidence');

    expect(updateMatter).toHaveBeenCalledWith('m1', { nextHearingDate: '2026-09-15' });
    expect(addMatterEvent).toHaveBeenCalledWith('m1', {
      eventDate: '2026-09-15',
      eventType: 'hearing',
      orderText: 'Adjourned to 15 September 2026 for evidence.',
    });
    expect(r.purposeRecorded).toBe(true);
  });

  /**
   * PD-4 — THE COLUMN DECIDES THE DEFAULT, NOT THIS CLIENT. Sending
   * `noteVisibility` here would move a privacy default into application code,
   * which is exactly what the column default exists to prevent.
   */
  it('sends no notes and no visibility, so the column keeps the default', async () => {
    await usePractice.getState().recordAdjournment('m1', '2026-09-15', 'Arguments');
    const [, body] = addMatterEvent.mock.calls[0]!;
    expect(body).not.toHaveProperty('notes');
    expect(body).not.toHaveProperty('noteVisibility');
  });

  it('round-trips the reconciled matter from the server', async () => {
    await usePractice.getState().recordAdjournment('m1', '2026-09-15', 'Orders');
    expect(usePractice.getState().matters[0]!.nextHearingDate).toBe('2026-09-15');
  });

  /**
   * THE HONEST HALF. A failed event write means the purpose is recorded NOWHERE
   * — there is no local timeline to hold it, and inventing one so the screen
   * could claim success would be the fake local persistence this round forbids.
   * The store says so, and the screen renders that answer instead of implying
   * the write landed.
   */
  it('reports the purpose as not recorded when the timeline write fails', async () => {
    addMatterEvent.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'offline' },
    } as never);

    const r = await usePractice.getState().recordAdjournment('m1', '2026-09-15', 'Evidence');
    expect(r.purposeRecorded).toBe(false);
  });

  /**
   * AND THE DATE SURVIVES IT. `IMPLEMENTATION.md` §9d: the date lands locally
   * before anything else happens. An advocate heard it in open court, and our
   * inability to reach a server does not unmake that.
   */
  it('keeps the date locally even when both writes fail', async () => {
    updateMatter.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'offline' },
    } as never);
    addMatterEvent.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'offline' },
    } as never);

    const r = await usePractice.getState().recordAdjournment('m1', '2026-09-15', 'Evidence');
    expect(usePractice.getState().matters[0]!.nextHearingDate).toBe('2026-09-15');
    expect(r.purposeRecorded).toBe(false);
  });
});
