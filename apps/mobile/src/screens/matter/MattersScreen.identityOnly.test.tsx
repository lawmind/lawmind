import { fireEvent, render, screen } from '@testing-library/react-native';

import { MattersScreen } from './MattersScreen';

/**
 * `identity_only` IS NOT `signed_out` — same fix, same reason, as
 * `TodayScreen.identityOnly.test.tsx`. Both screens had the identical gate.
 */

let mockPush: jest.Mock;
let mockStatus: 'signed_out' | 'identity_only' | 'signed_in' = 'signed_out';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) => selector({ status: mockStatus }),
}));

jest.mock('../../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) =>
    selector({ matters: [], freshness: { kind: 'live' }, loading: false, hydrate: () => {} }),
  overdue: () => [],
  upcoming: () => [],
}));

beforeEach(() => {
  mockPush = jest.fn();
});

it('sends a genuinely signed-out advocate to sign in, not onboarding', async () => {
  mockStatus = 'signed_out';
  await render(<MattersScreen />);

  expect(await screen.findByText('Sign in to see your matters')).toBeTruthy();
  await fireEvent.press(screen.getByText('Sign in'));
  expect(mockPush).toHaveBeenCalledWith('/sign-in');
});

it('sends a signed-in, not-yet-onboarded advocate to onboarding, not sign in', async () => {
  mockStatus = 'identity_only';
  await render(<MattersScreen />);

  expect(await screen.findByText('Finish setting up your account')).toBeTruthy();
  expect(screen.queryByText('Sign in to see your matters')).toBeNull();
  await fireEvent.press(screen.getByText('Finish setup'));
  expect(mockPush).toHaveBeenCalledWith('/onboarding');
});
