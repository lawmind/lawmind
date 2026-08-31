import { fireEvent, render, screen } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { MatterWorkspace } from './MatterWorkspace';
import { api } from '../../api/client';
import type { MatterAuthority } from '../../api/contract';

/**
 * THE DESKTOP MATTER WORKSPACE — same two guarantees as
 * `ResearchWorkspace.test.tsx`, applied to the matter list:
 *
 *   1. BELOW THE BREAKPOINT NOTHING CHANGED — the tab renders exactly the
 *      phone's `MattersScreen`, alone.
 *   2. Above it, opening a matter shows its detail in a second pane WITHOUT
 *      the list disappearing.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('../../api/client', () => ({
  api: {
    matter: jest.fn(() => new Promise(() => {})),
    matterAuthorities: jest.fn(() => new Promise(() => {})),
  },
}));

jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) => selector({ status: 'signed_in' }),
}));

const mockMatter = {
  matterId: 'mat_1',
  caseTitle: 'Mock Petitioner v. Mock State',
  cnrNumber: null,
  court: 'Mock High Court',
  caseType: 'civil',
  parties: { description: 'Mock Petitioner and Mock State' },
  ourSide: 'petitioner',
  nextHearingDate: null,
  clientName: 'Mock Client',
  clientPhone: '9800000000',
  notes: null,
};

const savedAuthority: MatterAuthority = {
  authorityId: 'auth_1',
  judgmentId: 'jdg_1',
  caseTitle: 'Mock Authority v. Union of India',
  neutralCitation: '2026 MOCK 1',
  reporterCitations: [],
  addedBy: 'usr_1',
  addedAt: '2026-08-30T00:00:00.000Z',
  removedAt: null,
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'set_aside',
  overruledByJudgmentId: 'jdg_2',
  overruledByTitle: 'Mock Later Judgment v. Union of India',
  overruledParas: null,
  overruledNote: null,
  precedentialEffect: 'overruled',
  canAddToMatter: true,
  citableForUntouchedPropositions: true,
};

jest.mock('../../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) =>
    selector({
      matters: [mockMatter],
      freshness: { kind: 'live' },
      loading: false,
      hydrate: () => {},
    }),
  overdue: () => [],
  // `nextHearingDate` is null on the fixture, so the real MattersScreen puts
  // it in "Awaiting a date" (computed inline, not via this mock) — leave
  // both empty rather than fabricate a CivilDate `formatGutter` can parse.
  upcoming: () => [],
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');
const dimensions = useWindowDimensions as unknown as jest.Mock;
const atWidth = (width: number) =>
  dimensions.mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });

beforeEach(() => {
  jest.clearAllMocks();
  atWidth(1400);
});

it('renders only the phone list below the breakpoint — no pane, no split', async () => {
  atWidth(390);
  await render(<MatterWorkspace />);

  expect(await screen.findByText('Mock Petitioner v. Mock State')).toBeTruthy();
  // A tap pushes the phone route rather than opening a pane.
  await fireEvent.press(screen.getByText('Mock Petitioner v. Mock State'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/matter/[id]', params: { id: 'mat_1' } });
});

it('opens a matter in a second pane at desktop width, and the list survives it', async () => {
  atWidth(1400);
  await render(<MatterWorkspace />);

  expect(await screen.findByText('Mock Petitioner v. Mock State')).toBeTruthy();
  expect(await screen.findByText(/Open a matter to see its timeline here/)).toBeTruthy();

  await fireEvent.press(screen.getByText('Mock Petitioner v. Mock State'));

  // The list is still on screen — this is the entire point of the layout.
  expect(screen.getByText('Mock Petitioner v. Mock State')).toBeTruthy();
  // Never falls back to a route push once a pane exists to open into.
  expect(mockPush).not.toHaveBeenCalled();
  expect(api.matter).toHaveBeenCalledWith('mat_1');
});

it('loads saved authorities in the desktop matter pane with the released R14 relationship', async () => {
  (api.matter as jest.MockedFunction<typeof api.matter>).mockResolvedValueOnce({
    ok: true,
    data: { matter: mockMatter, access: 'owner', events: [], documents: [], briefings: [] },
  });
  (
    api.matterAuthorities as jest.MockedFunction<typeof api.matterAuthorities>
  ).mockResolvedValueOnce({
    ok: true,
    data: { authorities: [savedAuthority], asOf: '2026-08-30T00:00:00.000Z' },
  });

  await render(<MatterWorkspace />);
  await fireEvent.press(await screen.findByText('Mock Petitioner v. Mock State'));

  expect(await screen.findByText('Mock Authority v. Union of India')).toBeTruthy();
  expect(screen.getByText('2026 MOCK 1')).toBeTruthy();
  expect(screen.getByText('Overruled by Mock Later Judgment v. Union of India')).toBeTruthy();
  expect(
    screen.getByText('Still citable for propositions the later judgment did not reach.'),
  ).toBeTruthy();
  expect(screen.queryByText(/Set aside in Mock Later Judgment/)).toBeNull();

  await fireEvent.press(screen.getByText('Mock Authority v. Union of India'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/judgment/[id]', params: { id: 'jdg_1' } });
});
