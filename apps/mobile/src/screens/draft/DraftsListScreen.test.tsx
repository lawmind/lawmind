import { fireEvent, render, screen } from '@testing-library/react-native';

import { DraftsListScreen } from './DraftsListScreen';
import { api } from '../../api/client';
import type { DraftListItem } from '../../api/contract';

/**
 * THE RULE UNDER TEST — R4, `.agents/bus/0004`: `unverifiedCount` counts
 * `failed` together with `unverified`, and renders as "could not confirm",
 * never "verification failed". No `content` is requested or rendered here —
 * this is the list, not the document.
 */

jest.mock('../../api/client', () => ({
  api: { documents: jest.fn() },
}));

const documents = api.documents as jest.MockedFunction<typeof api.documents>;

function item(over: Partial<DraftListItem> = {}): DraftListItem {
  return {
    documentId: 'doc_1',
    documentType: 'bail_application',
    matterId: null,
    matterTitle: null,
    language: 'en',
    createdAt: '2026-08-06T00:00:00.000Z',
    citationCount: 3,
    unverifiedCount: 0,
    ...over,
  };
}

describe('DraftsListScreen', () => {
  beforeEach(() => {
    documents.mockReset();
  });

  it('shows an honest empty state with no dead-end "start a draft" action', async () => {
    documents.mockResolvedValue({ ok: true, data: { documents: [] } });
    await render(<DraftsListScreen onOpenDocument={() => {}} />);

    expect(await screen.findByText('No drafts yet')).toBeTruthy();
  });

  it('humanizes the document type when there is no matter title', async () => {
    documents.mockResolvedValue({ ok: true, data: { documents: [item()] } });
    await render(<DraftsListScreen onOpenDocument={() => {}} />);

    expect(await screen.findByText('Bail application')).toBeTruthy();
  });

  it('never says "verification failed" — a flagged draft says "could not confirm"', async () => {
    documents.mockResolvedValue({
      ok: true,
      data: { documents: [item({ citationCount: 4, unverifiedCount: 1 })] },
    });
    await render(<DraftsListScreen onOpenDocument={() => {}} />);

    expect(await screen.findByText('4 citations, could not confirm 1')).toBeTruthy();
    expect(screen.queryByText(/verification failed/i)).toBeNull();
  });

  it('says only the count when nothing is flagged', async () => {
    documents.mockResolvedValue({ ok: true, data: { documents: [item({ citationCount: 3, unverifiedCount: 0 })] } });
    await render(<DraftsListScreen onOpenDocument={() => {}} />);

    expect(await screen.findByText('3 citations')).toBeTruthy();
  });

  it('opens the tapped draft by id', async () => {
    const onOpenDocument = jest.fn();
    documents.mockResolvedValue({ ok: true, data: { documents: [item({ documentId: 'doc_42' })] } });
    await render(<DraftsListScreen onOpenDocument={onOpenDocument} />);

    await fireEvent.press(await screen.findByText('Bail application'));

    expect(onOpenDocument).toHaveBeenCalledWith('doc_42');
  });
});
