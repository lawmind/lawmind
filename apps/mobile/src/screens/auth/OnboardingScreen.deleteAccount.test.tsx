import { fireEvent, render, screen } from '@testing-library/react-native';

import { OnboardingScreen } from './OnboardingScreen';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DELETION PATH HAS TO BE FINDABLE, NOT MERELY OPEN.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `AuthBoundary` now admits `identity_only` to `/delete-account`
 * (`AuthBoundary.deleteAccount.test.ts`) and `POST /me/data-requests` now serves
 * a caller with no `users` row (LCC R26, `ab4b4989`). Neither is worth anything
 * on its own: the only entry point to that screen was `SettingsScreen`, and
 * `identity_only` cannot reach Settings — the gate renders them onboarding and
 * nothing else. A route that is open and unreachable is a route that does not
 * exist, and Apple 5.1.1(v) asks for a path the person can actually take.
 *
 * So the link lives on the one screen they can see. This asserts it is there,
 * that it fires, and — the part that would rot silently — that adding it did not
 * turn onboarding into a deletion prompt. Finishing the account is still the
 * primary action.
 */

jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) =>
    selector({ completeProfile: jest.fn(), profile: null }),
}));

jest.mock('../../api/client', () => ({ api: { currentTerms: jest.fn(), acceptTerms: jest.fn() } }));

describe('onboarding offers the way out of an account that already exists', () => {
  it('renders the deletion link and calls back when it is tapped', async () => {
    const onDeleteAccount = jest.fn();
    await render(<OnboardingScreen onDeleteAccount={onDeleteAccount} onDone={() => {}} />);

    await fireEvent.press(await screen.findByText('Delete my account instead'));
    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  /**
   * The link is an escape hatch, not a competing call to action. If this ever
   * fails it means the deletion link outgrew its place on a screen whose job is
   * to finish creating the account.
   */
  it('still leads with finishing the account', async () => {
    await render(<OnboardingScreen onDeleteAccount={() => {}} onDone={() => {}} />);

    expect(await screen.findByText('Continue')).toBeTruthy();
    expect(screen.getByText('How should we address you?')).toBeTruthy();
    // Never phrased as a deletion of something that has not happened yet: the
    // account exists, and the copy says "my account", not "cancel signing up".
    expect(screen.queryByText(/cancel sign/i)).toBeNull();
  });

  /**
   * Omitted rather than rendered inert when no handler is supplied — a visible
   * control that does nothing is worse on this screen than no control at all.
   */
  it('renders nothing when the host supplies no deletion route', async () => {
    await render(<OnboardingScreen onDone={() => {}} />);

    await screen.findByText('Continue');
    expect(screen.queryByText('Delete my account instead')).toBeNull();
  });
});
