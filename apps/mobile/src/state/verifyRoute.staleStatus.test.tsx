import { act, render } from '@testing-library/react-native';

import { usePendingDestination } from './pendingDestination';
import { useSession, type SessionStatus } from './session';
import Route from '../../app/auth/verify';

/**
 * A MAGIC LINK INTO A RUNNING APP THAT IS ALREADY SIGNED IN AS SOMEONE.
 *
 * Found on the S24, 16 Sep 2026 (RCC R27B). The verify screen routed on the
 * status the session held BEFORE this link's exchange had resolved:
 *
 * - signed in as a full advocate, an identity-only link arrived → the screen
 *   sent them to Today at once, `GET /me` then flipped the status to
 *   `identity_only` on a protected route, and the app died with "Maximum update
 *   depth exceeded" (3 of 3 attempts in that state);
 * - identity-only on onboarding, a full advocate's link arrived → the screen
 *   sent them to onboarding at once, and the advocate was left, signed in with
 *   a complete profile, on the "How should we address you?" form.
 *
 * The old status belongs to the previous session. Only this link's own answer
 * may decide where it goes.
 */

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ token: 'tok-1' }),
}));

jest.mock('../components/Screen', () => ({
  Screen: ({ children }: { children: unknown }) => children,
}));

function deferredVerify() {
  let finish: (status: SessionStatus) => void = () => undefined;
  const verify = jest.fn(
    () =>
      new Promise<{ ok: true }>((resolve) => {
        finish = (status) => {
          useSession.setState({ status });
          resolve({ ok: true });
        };
      }),
  );
  return { verify, finish: (status: SessionStatus) => finish(status) };
}

beforeEach(() => {
  mockReplace.mockClear();
  usePendingDestination.setState({ held: null, hydrated: true });
});

it('does not route a full advocate to Today before an identity-only link has answered', async () => {
  const { verify, finish } = deferredVerify();
  useSession.setState({ status: 'signed_in', verify });

  await render(<Route />);
  expect(verify).toHaveBeenCalledWith('tok-1');
  expect(mockReplace).not.toHaveBeenCalled();

  await act(async () => finish('identity_only'));

  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/onboarding');
});

it('does not strand a full advocate on onboarding when the app was identity-only', async () => {
  const { verify, finish } = deferredVerify();
  useSession.setState({ status: 'identity_only', verify });

  await render(<Route />);
  expect(mockReplace).not.toHaveBeenCalled();

  await act(async () => finish('signed_in'));

  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/today');
});

it('still routes a cold sign-in once the exchange answers', async () => {
  const { verify, finish } = deferredVerify();
  useSession.setState({ status: 'signed_out', verify });

  await render(<Route />);
  expect(mockReplace).not.toHaveBeenCalled();

  await act(async () => finish('identity_only'));

  expect(mockReplace).toHaveBeenCalledWith('/onboarding');
});
