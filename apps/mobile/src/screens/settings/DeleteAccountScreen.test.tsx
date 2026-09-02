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

/**
 * MUTABLE, because this screen now serves TWO populations out of one component:
 * a signed-in advocate whose email is on the profile, and an `identity_only`
 * advocate whose profile is `null` and whose email is on the auth identity. The
 * default is the signed-in shape, so every pre-existing test below is unchanged
 * and still guards the same path it always did.
 */
let mockSessionState: { profile: { email: string } | null; identityEmail: string | null } = {
  profile: { email: 'advocate@example.com' },
  identityEmail: 'advocate@example.com',
};

jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) => selector(mockSessionState),
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
    mockSessionState = {
      profile: { email: 'advocate@example.com' },
      identityEmail: 'advocate@example.com',
    };
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

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * `identity_only` — THE SAME SCREEN, AND NOTHING EXTRA ASKED OF THEM.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * An advocate with tokens and no `users` row. Before LCC R26 the route
   * answered them `403 PROFILE_INCOMPLETE` and `AuthBoundary` did not let them
   * here at all. Both are closed, and what these assert is that the closure is
   * real rather than cosmetic: the request actually leaves, carrying its R16
   * key, with no profile manufactured on the way.
   */
  describe('an advocate with no profile', () => {
    beforeEach(() => {
      mockSessionState = { profile: null, identityEmail: 'halfway@example.com' };
    });

    it('confirms against the identity email and sends the request with an R16 key', async () => {
      listDataRequests.mockResolvedValue({ ok: true, data: { requests: [] } });
      createDataRequest.mockResolvedValue({
        ok: true,
        data: { request: erasureRequest(), alreadyOpen: false },
      });
      await render(<DeleteAccountScreen onBack={() => {}} />);

      // The wrong address does nothing, exactly as for a signed-in advocate.
      await fireEvent.changeText(
        await screen.findByPlaceholderText('halfway@example.com'),
        'advocate@example.com',
      );
      await fireEvent.press(screen.getByText('Request account deletion'));
      expect(createDataRequest).not.toHaveBeenCalled();

      await fireEvent.changeText(
        screen.getByPlaceholderText('halfway@example.com'),
        'Halfway@Example.com',
      );
      await fireEvent.press(screen.getByText('Request account deletion'));

      expect(createDataRequest).toHaveBeenCalledWith('erasure', undefined, expect.any(String));
      expect(ATTEMPT_KEY_PATTERN.test(createDataRequest.mock.calls[0]![2] as string)).toBe(true);
    });

    /**
     * THE COPY DOES NOT CHANGE FOR THEM. The backend queues; it does not erase
     * synchronously, for this population any more than for any other.
     */
    it('still says a request was received, never that the account is deleted', async () => {
      listDataRequests.mockResolvedValueOnce({ ok: true, data: { requests: [] } });
      listDataRequests.mockResolvedValueOnce({
        ok: true,
        data: { requests: [erasureRequest()] },
      });
      createDataRequest.mockResolvedValue({
        ok: true,
        data: { request: erasureRequest(), alreadyOpen: false },
      });
      await render(<DeleteAccountScreen onBack={() => {}} />);

      await fireEvent.changeText(
        await screen.findByPlaceholderText('halfway@example.com'),
        'halfway@example.com',
      );
      await fireEvent.press(screen.getByText('Request account deletion'));

      expect(await screen.findByText('Your request has been received.')).toBeTruthy();
      expect(screen.queryByText(/account has been deleted/i)).toBeNull();
    });

    /**
     * NO NAME, NO PHONE, NO ENROLMENT NUMBER, NO ONBOARDING DETOUR. Requiring
     * more personal data as the price of erasing personal data is the DPDP
     * defect this closed; a field asked for here would reopen it. Asserted as
     * an absence, because that is the only way this failure would ever show up.
     */
    it('asks for no personal data beyond the email already on the account', async () => {
      listDataRequests.mockResolvedValue({ ok: true, data: { requests: [] } });
      await render(<DeleteAccountScreen onBack={() => {}} />);
      await screen.findByPlaceholderText('halfway@example.com');

      // Onboarding's own fields, by the exact labels and placeholders
      // `OnboardingScreen` gives them. Not a loose text match: the consequence
      // copy on this screen legitimately NAMES a phone number and an enrolment
      // number as things the erasure removes, and asserting they are unspoken
      // would forbid the screen from being honest about what it deletes.
      expect(screen.queryByText('Full name')).toBeNull();
      expect(screen.queryByText('Phone')).toBeNull();
      expect(screen.queryByText('Bar enrolment number — optional')).toBeNull();
      expect(screen.queryByPlaceholderText('Adv. Ananya Sharma')).toBeNull();
      expect(screen.queryByPlaceholderText('98xxxxxxxx')).toBeNull();
      expect(screen.queryByPlaceholderText('D/1234/2011')).toBeNull();
      expect(screen.queryByText(/finish (setting up|onboarding)/i)).toBeNull();
      // Exactly one input on the screen: the confirmation box.
      expect(screen.getAllByPlaceholderText('halfway@example.com')).toHaveLength(1);
    });

    it('refuses honestly when no email can be read at all, rather than accepting anything', async () => {
      mockSessionState = { profile: null, identityEmail: null };
      listDataRequests.mockResolvedValue({ ok: true, data: { requests: [] } });
      await render(<DeleteAccountScreen onBack={() => {}} />);

      await fireEvent.changeText(
        await screen.findByPlaceholderText('you@example.com'),
        'anything@example.com',
      );
      await fireEvent.press(screen.getByText('Request account deletion'));

      expect(createDataRequest).not.toHaveBeenCalled();
      expect(screen.getByText(/could not read the email on your account/i)).toBeTruthy();
    });

    /** The back link names where they actually came from. */
    it('names the caller-supplied back destination', async () => {
      listDataRequests.mockResolvedValue({ ok: true, data: { requests: [] } });
      await render(<DeleteAccountScreen backLabel="Back" onBack={() => {}} />);

      expect(await screen.findByText('‹ Back')).toBeTruthy();
      expect(screen.queryByText('‹ Settings')).toBeNull();
    });
  });
});
