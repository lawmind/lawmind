import { fireEvent, render, screen } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { DraftWorkspace } from './DraftWorkspace';
import { api } from '../../api/client';
import type { DraftDocument, DraftListItem } from '../../api/contract';

/**
 * THE DESKTOP DRAFTING WORKSPACE — same two guarantees as
 * `MatterWorkspace.test.tsx` and `ResearchWorkspace.test.tsx`:
 *
 *   1. Below the breakpoint, exactly the phone's `DraftsListScreen`, wired
 *      to the same `/document/[id]` push it always used.
 *   2. Above it, opening a draft shows it in a second pane without the list
 *      disappearing.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('../../api/client', () => ({
  api: { documents: jest.fn(), document: jest.fn(() => new Promise(() => {})) },
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');
const dimensions = useWindowDimensions as unknown as jest.Mock;
const atWidth = (width: number) =>
  dimensions.mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });

const documents = api.documents as jest.MockedFunction<typeof api.documents>;

function item(over: Partial<DraftListItem> = {}): DraftListItem {
  return {
    documentId: 'doc_1',
    documentType: 'bail_application',
    matterId: null,
    matterTitle: null,
    language: 'en',
    createdAt: '2026-08-06T00:00:00.000Z',
    citationCount: 0,
    unverifiedCount: 0,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  documents.mockResolvedValue({ ok: true, data: { documents: [item()] } });
  atWidth(1400);
});

it('renders only the phone list below the breakpoint, pushing the phone route', async () => {
  atWidth(390);
  await render(<DraftWorkspace />);

  const row = await screen.findByText('Bail application');
  await fireEvent.press(row);

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/document/[id]',
    params: { id: 'doc_1' },
  });
});

it('opens a draft in a second pane at desktop width, and the list survives it', async () => {
  atWidth(1400);
  await render(<DraftWorkspace />);

  expect(await screen.findByText('Bail application')).toBeTruthy();
  expect(await screen.findByText(/Open a draft to read it here/)).toBeTruthy();

  await fireEvent.press(screen.getByText('Bail application'));

  // The list is still on screen.
  expect(screen.getByText('Bail application')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
  expect(api.document).toHaveBeenCalledWith('doc_1');
});
