import { fireEvent, render, screen } from '@testing-library/react-native';

import { AlertSettingsScreen } from './AlertSettingsScreen';
import { api } from '../../api/client';
import type { AlertSettings } from '../../api/contract';
import { registerForPushNotifications } from '../../push/register';

/**
 * THE RULE UNDER TEST: a setting named in `unavailable` never renders as an
 * ordinary switch. `docs/API_CONTRACTS.md` §Citator alerts — an advocate who
 * could turn a switch "on" and be told nothing, ever, finds out by missing a
 * hearing. The fix is additive and server-derived, so the client must key off
 * `settings.unavailable`, never a hard-coded pair of names.
 *
 * Also under test since 23 Aug 2026: turning ON `savedAuthorityMoved` — the
 * one alert trigger that is real today — is the moment push permission is
 * asked for. `../../push/register` and `../../state/session` are mocked
 * here rather than let the real `expo-notifications` / auth-bridge module
 * code run under Jest, which is unrelated to what this screen tests.
 */

jest.mock('../../api/client', () => ({
  api: { alertSettings: jest.fn(), updateAlertSettings: jest.fn() },
}));

jest.mock('../../push/register', () => ({
  registerForPushNotifications: jest.fn(),
}));

const mockRegisterPushToken = jest.fn();
jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) =>
    selector({ registerPushToken: mockRegisterPushToken }),
}));

const alertSettings = api.alertSettings as jest.MockedFunction<typeof api.alertSettings>;
const updateAlertSettings = api.updateAlertSettings as jest.MockedFunction<
  typeof api.updateAlertSettings
>;
const mockRegisterForPush = registerForPushNotifications as jest.MockedFunction<
  typeof registerForPushNotifications
>;

function settings(over: Partial<AlertSettings> = {}): AlertSettings {
  return {
    savedAuthorityMoved: true,
    ownMatterJudgment: true,
    unknownListing: true,
    unavailable: [],
    ...over,
  };
}

describe('AlertSettingsScreen — settings.unavailable', () => {
  beforeEach(() => {
    alertSettings.mockReset();
    updateAlertSettings.mockReset();
    mockRegisterForPush.mockReset();
    mockRegisterPushToken.mockReset();
  });

  it('renders an ordinary switch when the server reports everything works', async () => {
    alertSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    // Trigger 2's fixed "cannot be disabled" row is always a switch, plus
    // one for each of the three toggleable rows.
    expect(await screen.findAllByRole('switch')).toHaveLength(4);
    expect(screen.queryByText(/not built yet/i)).toBeNull();
    expect(screen.queryByText('Soon')).toBeNull();
  });

  it('never renders an ordinary switch for a key named in unavailable', async () => {
    alertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ unavailable: ['ownMatterJudgment', 'unknownListing'] }) },
    });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    // savedAuthorityMoved and trigger 2's fixed row are not in `unavailable`,
    // so exactly two ordinary switches remain.
    expect(await screen.findAllByRole('switch')).toHaveLength(2);
    expect(screen.getAllByText(/not built yet/i)).toHaveLength(2);
    expect(screen.getAllByText('Soon')).toHaveLength(2);
  });

  it('does not hard-code which keys are unavailable — a new key from the server renders the same way', async () => {
    alertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ unavailable: ['unknownListing'] }) },
    });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    expect(await screen.findAllByRole('switch')).toHaveLength(3);
    expect(screen.getAllByText(/not built yet/i)).toHaveLength(1);
  });
});

describe('AlertSettingsScreen — push registration on the real trigger', () => {
  beforeEach(() => {
    alertSettings.mockReset();
    updateAlertSettings.mockReset();
    mockRegisterForPush.mockReset();
    mockRegisterPushToken.mockReset();
  });

  it('asks for push only when savedAuthorityMoved turns ON, and registers the token on success', async () => {
    alertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ savedAuthorityMoved: false }) },
    });
    updateAlertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ savedAuthorityMoved: true }) },
    });
    mockRegisterForPush.mockResolvedValue({ ok: true, token: 'ExponentPushToken[abc]' });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    const switches = await screen.findAllByRole('switch');
    await fireEvent.press(switches[0]!);

    expect(mockRegisterForPush).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[abc]');
  });

  it('does not ask for push when a different trigger is toggled', async () => {
    alertSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
    updateAlertSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    const switches = await screen.findAllByRole('switch');
    // switches[0] is savedAuthorityMoved (already true — see `settings()`),
    // so toggling any OTHER row must never touch push at all.
    await fireEvent.press(switches[2]!);

    expect(mockRegisterForPush).not.toHaveBeenCalled();
  });

  it('surfaces the real reason when push cannot be set up, without reverting the saved toggle', async () => {
    alertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ savedAuthorityMoved: false }) },
    });
    updateAlertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ savedAuthorityMoved: true }) },
    });
    mockRegisterForPush.mockResolvedValue({ ok: false, reason: 'NO_PROJECT_CONFIGURED' });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    const switches = await screen.findAllByRole('switch');
    await fireEvent.press(switches[0]!);

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Push delivery is not set up on this build yet — this will still save.'),
    ).toBeTruthy();
    expect(switches[0]!.props.accessibilityState?.checked).toBe(true);
  });

  it('never surfaces a note for a simulator — nothing the advocate can act on', async () => {
    alertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ savedAuthorityMoved: false }) },
    });
    updateAlertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ savedAuthorityMoved: true }) },
    });
    mockRegisterForPush.mockResolvedValue({ ok: false, reason: 'NOT_A_DEVICE' });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    const switches = await screen.findAllByRole('switch');
    await fireEvent.press(switches[0]!);

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    expect(screen.queryByText(/push/i)).toBeNull();
  });
});
