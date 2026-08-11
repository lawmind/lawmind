import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CommandPalette } from './CommandPalette';
import { useCommandPalette } from '../state/commandPalette';
import { useRecentItems } from '../state/recentItems';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISTIC NAVIGATION ONLY — goldfinal.zip V2.2, `9_GLOBAL_COMMAND_CENTER.md`.
 *
 * Nothing here should ever need a network mock: every row is either a static
 * route, a matter already held in `usePractice()`, or a device-local "recent"
 * record. That is the property under test as much as any individual row.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) =>
    selector({
      matters: [
        { matterId: 'mat_1', caseTitle: 'Mock Petitioner v. Mock State' },
        { matterId: 'mat_2', caseTitle: 'Another Matter v. Someone Else' },
      ],
    }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  useCommandPalette.setState({ open: false });
  useRecentItems.setState({ items: [] });
});

it('renders nothing when closed', async () => {
  await render(<CommandPalette />);
  expect(screen.queryByPlaceholderText(/Search law/)).toBeNull();
});

it('opens on the store flag and shows the static actions', async () => {
  await render(<CommandPalette />);
  await act(async () => useCommandPalette.getState().setOpen(true));

  expect(await screen.findByText('Search law')).toBeTruthy();
  expect(screen.getByText('New matter')).toBeTruthy();
  expect(screen.getByText('Open drafts')).toBeTruthy();
  expect(screen.getByText('Open matters')).toBeTruthy();
});

it('a static action navigates and closes the palette', async () => {
  await render(<CommandPalette />);
  await act(async () => useCommandPalette.getState().setOpen(true));

  await fireEvent.press(await screen.findByText('Search law'));

  expect(mockPush).toHaveBeenCalledWith('/search');
  expect(useCommandPalette.getState().open).toBe(false);
});

it('filters already-loaded matters by title as the advocate types, and opens the right one', async () => {
  await render(<CommandPalette />);
  await act(async () => useCommandPalette.getState().setOpen(true));

  const input = await screen.findByPlaceholderText(/Search law/);
  await fireEvent.changeText(input, 'another');

  expect(screen.queryByText('Mock Petitioner v. Mock State')).toBeNull();
  await fireEvent.press(screen.getByText('Another Matter v. Someone Else'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/matter/[id]', params: { id: 'mat_2' } });
});

it('says so when nothing matches, rather than showing an empty list silently', async () => {
  await render(<CommandPalette />);
  await act(async () => useCommandPalette.getState().setOpen(true));

  const input = await screen.findByPlaceholderText(/Search law/);
  await fireEvent.changeText(input, 'zzzzz no such thing');

  expect(await screen.findByText(/Nothing matches/)).toBeTruthy();
});

it('offers a device-local recent item and opens it by kind', async () => {
  useRecentItems.setState({
    items: [
      { kind: 'judgment', id: 'jdg_1', title: 'Mock Authority v. Mock State', openedAt: '2026-08-11T00:00:00.000Z' },
    ],
  });
  await render(<CommandPalette />);
  await act(async () => useCommandPalette.getState().setOpen(true));

  await fireEvent.press(await screen.findByText('Mock Authority v. Mock State'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/judgment/[id]', params: { id: 'jdg_1' } });
});
