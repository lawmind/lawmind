import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeleteAccountScreen } from './DeleteAccountScreen';
import { ATTEMPT_KEY_PATTERN } from '../../api/attempt';
import { api } from '../../api/client';
import type { DataRequest } from '../../api/contract';

/**
 * THE RULE UNDER TEST: `POST /me/data-requests` creates a REQUEST, never
 * executes one — every string on screen must say "request", never
 * "deleted", and the button must stay disabled until the advocate types
 * their own email to confirm. `services/api/src/auth/data-requests.ts`'s
 * own module note is the spec.
 */

jest.mock('../../api/client', () => ({
  api: {
    listDataRequests: jest.fn(),
    createDataRequest: jest.fn(),
  },
}));

jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) =>
    selector({ profile: { email: 'advocate@example.com' } }),
}));

const listDataRequests = api.listDataRequests as jest.MockedFunction<typeof api.listDataRequests>;
const createDataRequest = api.createDataRequest as jest.MockedFunction<typeof api.createDataRequest>;

function erasureRequest(over: Partial<DataRequest> = {}): DataRequest {
  return {
    id: 'req_1',
    kind: 'erasure',
    status: 'received',
    dueAt: '2026-09-22T00:00:00.000Z',
    completedAt: null,
    refusalReason: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    listDataRequests.mockReset();
    createDataRequest.mockReset();
  });

  it('does nothing on tap until the email is typed exactly, then submits on the correct one', async () => {
    listDataRequests.mockResolvedValue({ ok: true, data: { requests: [] } });
    createDataRequest.mockResolvedValue({
      ok: true,
      data: { request: erasureRequest(), alreadyOpen: false },
    });
    await render(<DeleteAccountScreen onBack={() => {}} />);

    await fireEvent.press(await screen.findByText('Request account deletion'));
    expect(createDataRequest).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByPlaceholderText('advocate@example.com'), 'wrong@example.com');
    await fireEvent.press(screen.getByText('Request account deletion'));
    expect(createDataRequest).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByPlaceholderText('advocate@example.com'), 'Advocate@Example.com');
    await fireEvent.press(screen.getByText('Request account deletion'));
    // R16: kind, no note, and an attempt key inside the server's grammar. The
    // key is asserted rather than wildcarded — a screen that stopped sending one
    // would silently lose its duplicate protection and this would still pass.
    expect(createDataRequest).toHaveBeenCalledWith('erasure', undefined, expect.any(String));
    expect(ATTEMPT_KEY_PATTERN.test(createDataRequest.mock.calls[0]![2] as string)).toBe(true);
  });

  it('never claims the account is deleted — only that a request was received', async () => {
    listDataRequests.mockResolvedValueOnce({ ok: true, data: { requests: [] } }); // mount
    listDataRequests.mockResolvedValueOnce({ ok: true, data: { requests: [erasureRequest()] } }); // post-create reload
    createDataRequest.mockResolvedValue({
      ok: true,
      data: { request: erasureRequest(), alreadyOpen: false },
    });
    await render(<DeleteAccountScreen onBack={() => {}} />);

    await fireEvent.changeText(
      await screen.findByPlaceholderText('advocate@example.com'),
      'advocate@example.com',
    );
    await fireEvent.press(screen.getByText('Request account deletion'));

    // R16: kind, no note, and an attempt key inside the server's grammar. The
    // key is asserted rather than wildcarded — a screen that stopped sending one
    // would silently lose its duplicate protection and this would still pass.
    expect(createDataRequest).toHaveBeenCalledWith('erasure', undefined, expect.any(String));
    expect(ATTEMPT_KEY_PATTERN.test(createDataRequest.mock.calls[0]![2] as string)).toBe(true);
    expect(await screen.findByText('Your request has been received.')).toBeTruthy();
    expect(screen.queryByText(/account has been deleted/i)).toBeNull();
    expect(screen.getByText(/An operator will complete it by/)).toBeTruthy();
  });

  it('shows an in-progress request without offering to request again', async () => {
    listDataRequests.mockResolvedValue({
      ok: true,
      data: { requests: [erasureRequest({ status: 'in_progress' })] },
    });
    await render(<DeleteAccountScreen onBack={() => {}} />);

    expect(await screen.findByText('An operator is completing it now.')).toBeTruthy();
    expect(screen.queryByText('Request account deletion')).toBeNull();
  });

  it('surfaces a refusal reason and still allows requesting again', async () => {
    listDataRequests.mockResolvedValue({
      ok: true,
      data: { requests: [erasureRequest({ status: 'refused', refusalReason: 'Open billing dispute' })] },
    });
    await render(<DeleteAccountScreen onBack={() => {}} />);

    expect(
      await screen.findByText('Your last request was not completed: Open billing dispute.'),
    ).toBeTruthy();
    expect(screen.getByText('Request account deletion')).toBeTruthy();
  });
});
