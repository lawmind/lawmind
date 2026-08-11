import { fireEvent, render, screen } from '@testing-library/react-native';

import { TodayScreen } from './TodayScreen';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `identity_only` IS NOT `signed_out` — RCC PRIORITY-RESET AUDIT, 11 AUG 2026.
 *
 * Found auditing the client against LCC's bus 0058 `PROFILE_INCOMPLETE` fix:
 * this screen's own gate predates that fix and has the identical shape one
 * layer up. `state/session.ts` already models `identity_only` as "tokens
 * held, but `GET /me` says there is no profile" — a real state, not an
 * error — but this screen collapsed it into the same `status !== 'signed_in'`
 * branch as `signed_out`, so an advocate who verified a magic link and closed
 * the app mid-onboarding relaunched into "Sign in to see your day" and a
 * button that sends them for ANOTHER magic link, despite already holding a
 * valid session. `verify.tsx` already routes `identity_only` to `/onboarding`
 * the moment it is set; this is the other path into the same state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let mockPush: jest.Mock;
let mockStatus: 'signed_out' | 'identity_only' | 'signed_in' = 'signed_out';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) =>
    selector({ status: mockStatus, profile: null }),
}));

jest.mock('../../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) =>
    selector({
      matters: [],
      briefings: {},
      freshness: { kind: 'live' },
      loading: false,
      hydrate: () => {},
      loadBriefings: () => {},
    }),
  alsoThisWeek: () => [],
  listedToday: () => [],
  overdue: () => [],
  tomorrowsBriefing: () => null,
}));

jest.mock('../../state/alerts', () => ({
  useAlerts: (selector: (s: unknown) => unknown) =>
    selector({ alerts: [], fetch: () => {}, markRead: () => {} }),
}));

beforeEach(() => {
  mockPush = jest.fn();
});

it('sends a genuinely signed-out advocate to sign in, not onboarding', async () => {
  mockStatus = 'signed_out';
  await render(<TodayScreen />);

  expect(await screen.findByText('Sign in to see your day')).toBeTruthy();
  await fireEvent.press(screen.getByText('Sign in'));
  expect(mockPush).toHaveBeenCalledWith('/sign-in');
});

it('sends a signed-in, not-yet-onboarded advocate to onboarding, not sign in', async () => {
  mockStatus = 'identity_only';
  await render(<TodayScreen />);

  expect(await screen.findByText('Finish setting up your account')).toBeTruthy();
  expect(screen.queryByText('Sign in to see your day')).toBeNull();
  await fireEvent.press(screen.getByText('Finish setup'));
  expect(mockPush).toHaveBeenCalledWith('/onboarding');
});
