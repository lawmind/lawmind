import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MatterScreen } from './MatterScreen';
import { api } from '../../api/client';
import { NO_CITATION_MARK } from '../../citation/citationDisplay';
import type { MatterAuthority } from '../../api/contract';

/**
 * THE AUTHORITIES SAVED TO A MATTER.
 *
 * `POST /matters/:id/authorities` landed 11 Aug 2026 and the client wired the
 * save the same day — which made add-to-matter WRITE-ONLY. An advocate could
 * save an authority and no surface anywhere showed it back, so the matter
 * workspace could not answer "what am I relying on in this case", which is the
 * question it exists to answer.
 *
 * REMOVAL IS A TIMESTAMP, NEVER A DELETE — the endpoint returns removed rows
 * too, mirroring `matter_shares`. They are deliberately not drawn: a case file
 * that lists what was taken out beside what is in gives a worse answer to the
 * same question. The row survives for the audit, which is where it belongs.
 */

/**
 * The screen body only renders once the matter bundle has loaded, so the bundle
 * is mocked as a real success — the authorities section lives inside the matter,
 * not beside it.
 */
const BUNDLE = {
  matter: {
    matterId: 'mat_1',
    caseTitle: 'Mock Client v. Mock Opponent',
    cnrNumber: null,
    court: 'Mock High Court',
    caseType: 'civil',
    parties: {},
    nextHearingDate: null,
    clientName: null,
    clientPhone: null,
    notes: null,
  },
  events: [],
  documents: [],
  briefings: [],
};

jest.mock('../../api/client', () => ({
  api: {
    matterAuthorities: jest.fn(),
    removeAuthorityFromMatter: jest.fn(),
    matter: jest.fn(() => Promise.resolve({ ok: true, data: BUNDLE })),
  },
}));

jest.mock('../../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) => selector({ matters: [] }),
}));

const matterAuthorities = api.matterAuthorities as jest.MockedFunction<
  typeof api.matterAuthorities
>;

const removeAuthorityFromMatter = api.removeAuthorityFromMatter as jest.MockedFunction<
  typeof api.removeAuthorityFromMatter
>;

const authority = (over: Partial<MatterAuthority> = {}): MatterAuthority => ({
  authorityId: 'auth_1',
  judgmentId: 'jdg_1',
  caseTitle: 'Mock Appellant v. Union of India',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  addedBy: 'usr_1',
  addedAt: '2026-08-11T00:00:00.000Z',
  removedAt: null,
  ...over,
});

const draw = async (onOpenJudgment = jest.fn()) => {
  await render(
    <MatterScreen
      matterId="mat_1"
      onBack={() => {}}
      onOpenBriefing={() => {}}
      onOpenCounterArguments={() => {}}
      onOpenJudgment={onOpenJudgment}
      onRecordAdjournment={() => {}}
      onSendClientUpdate={() => {}}
      onShare={() => {}}
    />
  );
  return { onOpenJudgment };
};

beforeEach(() => {
  matterAuthorities.mockReset();
  removeAuthorityFromMatter.mockReset();
  removeAuthorityFromMatter.mockResolvedValue({
    ok: true,
    data: { removedAt: '2026-08-11T02:00:00.000Z' },
  });
});

describe('the saved authorities appear in the matter', () => {
  it('lists one that is still saved', async () => {
    matterAuthorities.mockResolvedValue({
      ok: true,
      data: { authorities: [authority()], asOf: '2026-08-11T00:00:00.000Z' },
    });

    await draw();

    expect(await screen.findByText('Mock Appellant v. Union of India')).toBeTruthy();
    expect(screen.getByText('MOCK 2026 EXAMPLE 1')).toBeTruthy();
  });

  it('opens the judgment, so the matter is a route into the law', async () => {
    matterAuthorities.mockResolvedValue({
      ok: true,
      data: { authorities: [authority()], asOf: '2026-08-11T00:00:00.000Z' },
    });

    const { onOpenJudgment } = await draw();
    await fireEvent.press(await screen.findByText('Mock Appellant v. Union of India'));

    expect(onOpenJudgment).toHaveBeenCalledWith('jdg_1');
  });

  it('does not draw one that was removed, though the endpoint still returns it', async () => {
    matterAuthorities.mockResolvedValue({
      ok: true,
      data: {
        authorities: [
          authority({ authorityId: 'auth_gone', caseTitle: 'Mock Removed v. State', removedAt: '2026-08-11T01:00:00.000Z' }),
          authority(),
        ],
        asOf: '2026-08-11T00:00:00.000Z',
      },
    });

    await draw();

    await screen.findByText('Mock Appellant v. Union of India');
    expect(screen.queryByText('Mock Removed v. State')).toBeNull();
  });

  it('draws no section at all when nothing is saved', async () => {
    matterAuthorities.mockResolvedValue({
      ok: true,
      data: { authorities: [], asOf: '2026-08-11T00:00:00.000Z' },
    });

    await draw();

    expect(screen.queryByText('Authorities')).toBeNull();
  });
});

/**
 * TAKING ONE BACK OUT — `DELETE /matters/:id/authorities/:authorityId`.
 *
 * The route went live on 10 Aug and the list on 11 Aug, and for a day the list
 * could only GROW: an advocate who saved the wrong judgment, or one they later
 * decided against, had no way to take it out of their own case file. That is
 * the same write-only shape the list itself was built to fix, one level down —
 * a live endpoint with no client surface.
 */
describe('taking an authority back out of the matter', () => {
  const oneSaved = () =>
    matterAuthorities.mockResolvedValue({
      ok: true,
      data: { authorities: [authority()], asOf: '2026-08-11T00:00:00.000Z' },
    });

  it('calls the endpoint with the matter and the authority, in that order', async () => {
    oneSaved();
    await draw();

    await fireEvent.press(await screen.findByText('Remove from this matter'));

    expect(removeAuthorityFromMatter).toHaveBeenCalledWith('mat_1', 'auth_1');
  });

  it('stops drawing the row once the server has agreed', async () => {
    oneSaved();
    await draw();

    await fireEvent.press(await screen.findByText('Remove from this matter'));

    await waitFor(() =>
      expect(screen.queryByText('Mock Appellant v. Union of India')).toBeNull()
    );
  });

  /**
   * The server only removes a row whose `removed_at` is still null, so a second
   * tap answers 404 — and the advocate would read "no live authority with that
   * id" about a judgment they had just successfully taken out.
   */
  it('does not fire twice on a double tap', async () => {
    oneSaved();
    await draw();

    const button = await screen.findByText('Remove from this matter');
    await fireEvent.press(button);
    await fireEvent.press(button);

    expect(removeAuthorityFromMatter).toHaveBeenCalledTimes(1);
  });

  it('keeps the row and says what went wrong when the server refuses', async () => {
    oneSaved();
    removeAuthorityFromMatter.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'no live authority with that id' },
    });

    await draw();
    await fireEvent.press(await screen.findByText('Remove from this matter'));

    expect(await screen.findByText('no live authority with that id')).toBeTruthy();
    expect(screen.getByText('Mock Appellant v. Union of India')).toBeTruthy();
  });

  /**
   * NOT OPTIMISTIC. An authority vanishing from a case file before the server
   * agreed, and reappearing on the next fetch, is worse than a moment's wait —
   * this list is the advocate's record of what they are relying on.
   */
  it('leaves the row in place while the request is still in flight', async () => {
    oneSaved();
    let settle: (v: { ok: true; data: { removedAt: string } }) => void = () => {};
    removeAuthorityFromMatter.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as ReturnType<typeof api.removeAuthorityFromMatter>
    );

    await draw();
    await fireEvent.press(await screen.findByText('Remove from this matter'));

    expect(screen.getByText('Mock Appellant v. Union of India')).toBeTruthy();
    expect(screen.getByText('Removing…')).toBeTruthy();

    settle({ ok: true, data: { removedAt: '2026-08-11T02:00:00.000Z' } });
    await waitFor(() =>
      expect(screen.queryByText('Mock Appellant v. Union of India')).toBeNull()
    );
  });
});

describe('a saved authority we hold no citation for', () => {
  it('says so rather than leaving a blank line in the advocate’s own case file', async () => {
    matterAuthorities.mockResolvedValue({
      ok: true,
      data: {
        authorities: [
          authority({ caseTitle: 'Mock Petitioner v. State of Bihar', neutralCitation: null }),
        ],
        asOf: '2026-08-11T00:00:00.000Z',
      },
    });

    await draw();

    expect(await screen.findByText(NO_CITATION_MARK)).toBeTruthy();
    expect(screen.queryByText('null')).toBeNull();
  });
});
