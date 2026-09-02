import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MatterScreen } from './MatterScreen';
import { api } from '../../api/client';
import type { MatterAuthority, MatterAuthorityUnavailable } from '../../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SAVED AUTHORITY THE SELECTED CORPUS RELEASE DOES NOT CARRY — R17 §1.
 *
 * The advocate's saved reference is user-owned and outlives the corpus
 * generation it pointed into. What the server can no longer say about the
 * judgment, this client may not say either — and the temptation is a cached
 * case title, which is why the "no fabricated metadata" test below asserts on
 * absence rather than on presence.
 * ─────────────────────────────────────────────────────────────────────────────
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
    premiumPreview: jest.fn(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'NOT_ENABLED', message: 'premium preview is disabled' },
      }),
    ),
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

const available = (over: Partial<MatterAuthority> = {}): MatterAuthority => ({
  authorityId: 'auth_1',
  judgmentId: 'jdg_1',
  caseTitle: 'Mock Appellant v. Union of India',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  reporterCitations: [],
  addedBy: 'usr_1',
  addedAt: '2026-08-11T00:00:00.000Z',
  removedAt: null,
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  overruledByJudgmentId: null,
  overruledByTitle: null,
  overruledParas: null,
  overruledNote: null,
  ...over,
});

const unavailable = (
  over: Partial<MatterAuthorityUnavailable> = {},
): MatterAuthorityUnavailable => ({
  authorityId: 'auth_2',
  judgmentId: 'jdg_2',
  addedBy: 'usr_1',
  /**
   * MIDDAY UTC, DELIBERATELY. The row prints the LOCAL calendar day, for the
   * same reason `todayCivil` does, so a midnight-UTC fixture would assert a
   * different date in Delhi than on a machine west of Greenwich and the suite
   * would pass or fail on where it ran.
   */
  addedAt: '2026-08-12T12:00:00.000Z',
  removedAt: null,
  availability: 'corpus_unavailable',
  ...over,
});

const serve = (
  authorities: MatterAuthority[],
  unavailableAuthorities?: MatterAuthorityUnavailable[],
) =>
  matterAuthorities.mockResolvedValue({
    ok: true,
    data: {
      authorities,
      ...(unavailableAuthorities ? { unavailableAuthorities } : {}),
      asOf: '2026-08-13T00:00:00.000Z',
    },
  });

const draw = async (onOpenJudgment = jest.fn()) => {
  const view = await render(
    <MatterScreen
      matterId="mat_1"
      onBack={() => {}}
      onOpenBriefing={() => {}}
      onOpenCounterArguments={() => {}}
      onOpenJudgment={onOpenJudgment}
      onOpenPremiumPlans={() => {}}
      onManage={() => {}}
      onRecordAdjournment={() => {}}
      onSendClientUpdate={() => {}}
      onShare={() => {}}
    />,
  );
  return { onOpenJudgment, view };
};

beforeEach(() => {
  matterAuthorities.mockReset();
  removeAuthorityFromMatter.mockReset();
  removeAuthorityFromMatter.mockResolvedValue({
    ok: true,
    data: { removedAt: '2026-08-14T00:00:00.000Z' },
  });
});

describe('the four shapes the R17 read can take', () => {
  it('available only — the section is unchanged', async () => {
    serve([available()], []);
    await draw();

    expect(await screen.findByText('Mock Appellant v. Union of India')).toBeTruthy();
    expect(screen.queryByTestId('unavailable-authority-auth_2')).toBeNull();
  });

  it('an EMPTY unavailable array is not a signal about the server', async () => {
    serve([available()], []);
    await draw();

    await screen.findByText('Mock Appellant v. Union of India');
    // Nothing anywhere reports a degraded, older or partial server.
    expect(screen.queryByText(/older server|out of date|update the app/i)).toBeNull();
  });

  it('unavailable only — the section still draws, and does not vanish', async () => {
    serve([], [unavailable()]);
    await draw();

    expect(await screen.findByTestId('unavailable-authority-auth_2')).toBeTruthy();
    expect(screen.getByText('Authorities')).toBeTruthy();
  });

  it('mixed — both render, and the shell is not dropped', async () => {
    serve(
      [available({ authorityId: 'auth_1', addedAt: '2026-08-11T00:00:00.000Z' })],
      [unavailable({ authorityId: 'auth_2', addedAt: '2026-08-12T00:00:00.000Z' })],
    );
    await draw();

    expect(await screen.findByTestId('unavailable-authority-auth_2')).toBeTruthy();
    expect(screen.getByText('Mock Appellant v. Union of India')).toBeTruthy();
  });
});

describe('what the shell may and may not say', () => {
  it('states the saved date and the corpus fact, and nothing about the law', async () => {
    serve([], [unavailable()]);
    await draw();

    await screen.findByTestId('unavailable-authority-auth_2');
    expect(screen.getByText('Saved, and not in this corpus release')).toBeTruthy();
    expect(screen.getByText(/Saved to this matter on 12 August 2026\./)).toBeTruthy();

    /**
     * THE FORBIDDEN SENTENCES — R17 §1 and NEW3 bus 1728, verbatim: the UI may
     * not say the judgment does not exist, was removed from the law, is
     * unverified, or is still good law; and `corpus_unavailable` may not render
     * as an outage.
     */
    expect(screen.queryByText(/does not exist|no longer exists|deleted/i)).toBeNull();
    expect(screen.queryByText(/good law/i)).toBeNull();
    expect(screen.queryByText(/unverified|could not confirm|verification/i)).toBeNull();
    expect(screen.queryByText(/removed from the law|overruled|set aside/i)).toBeNull();
    expect(screen.queryByText(/outage|source unavailable|server is busy|try again/i)).toBeNull();
  });

  it('fabricates no corpus metadata, even after seeing the same row hydrated', async () => {
    const same = {
      authorityId: 'auth_1',
      judgmentId: 'jdg_1',
      addedAt: '2026-08-11T00:00:00.000Z',
    };

    serve([available(same)], []);
    const first = await draw();
    expect(await screen.findByText('Mock Appellant v. Union of India')).toBeTruthy();
    await first.view.unmount();

    serve([], [unavailable(same)]);
    await draw();

    await screen.findByTestId('unavailable-authority-auth_1');
    // The title and the citation this client HAD are gone, not remembered.
    expect(screen.queryByText('Mock Appellant v. Union of India')).toBeNull();
    expect(screen.queryByText('MOCK 2026 EXAMPLE 1')).toBeNull();
  });
});

describe('what an advocate can do with one', () => {
  it('does not navigate into a judgment the corpus cannot serve', async () => {
    serve([], [unavailable()]);
    const { onOpenJudgment } = await draw();

    const row = await screen.findByTestId('unavailable-authority-auth_2');
    fireEvent.press(row);

    expect(onOpenJudgment).not.toHaveBeenCalled();
  });

  it('removes by authorityId without waiting for the corpus to recover', async () => {
    serve([], [unavailable()]);
    await draw();

    await screen.findByTestId('unavailable-authority-auth_2');
    fireEvent.press(screen.getByLabelText('Remove this saved authority from this matter'));

    await waitFor(() => expect(removeAuthorityFromMatter).toHaveBeenCalledWith('mat_1', 'auth_2'));
    // Removal is a timestamp on the user's own row, so the shell leaves the list.
    await waitFor(() => expect(screen.queryByTestId('unavailable-authority-auth_2')).toBeNull());
  });
});

describe('recovery, with no user action', () => {
  it('a target that disappears and returns comes back hydrated, once', async () => {
    const same = {
      authorityId: 'auth_1',
      judgmentId: 'jdg_1',
      addedAt: '2026-08-11T00:00:00.000Z',
    };

    serve([], [unavailable(same)]);
    const gone = await draw();
    expect(await screen.findByTestId('unavailable-authority-auth_1')).toBeTruthy();
    await gone.view.unmount();

    serve([available(same)], []);
    await draw();

    expect(await screen.findByText('Mock Appellant v. Union of India')).toBeTruthy();
    // No stale warning, no duplicate, and the advocate re-saved nothing.
    expect(screen.queryByTestId('unavailable-authority-auth_1')).toBeNull();
    expect(screen.queryByText('Saved, and not in this corpus release')).toBeNull();
    expect(screen.getAllByText('Mock Appellant v. Union of India')).toHaveLength(1);
  });
});
