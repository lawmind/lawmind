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
 * REWRITTEN 18 Sep 2026 (SHIP S4-T0.3). Two assertions inverted, and the
 * inversion is the point:
 *
 *   * Trigger 2 ("an authority I filed is set aside") used to render a DISABLED,
 *     ON switch beside "Cannot be turned off" — and this file asserted that
 *     switch existed. It read as "always working" for a trigger whose audience
 *     is an EXPORTED draft (not current v1) or a copied citation, and which has
 *     never been observed delivering anything. It now renders like every other
 *     not-yet row, and the counts below are one lower for it.
 *   * Turning ON `savedAuthorityMoved` used to ask for push permission, and this
 *     file asserted that too. `alerts.push_delivery` is DISABLED_NOT_READY in
 *     R18 — `EAS_PROJECT_ID` is absent, so the call can only fail — so the ask
 *     is gone and the test now proves it does NOT happen. A permission prompt
 *     spent on a channel that cannot deliver is a prompt we do not get back.
 *
 * `../../push/register` stays mocked so the assertion "never called" is real
 * rather than incidental, and so `expo-notifications` does not run under Jest.
 */

jest.mock('../../api/client', () => ({
  api: { alertSettings: jest.fn(), updateAlertSettings: jest.fn() },
}));

jest.mock('../../push/register', () => ({
  registerForPushNotifications: jest.fn(),
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
  });

  it('renders an ordinary switch for every toggleable row the server says works', async () => {
    alertSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    // Three toggleable rows. Trigger 2 is NOT one of them: it has no key on
    // `AlertSettings` and no producer, so it is a statement, not a control.
    expect(await screen.findAllByRole('switch')).toHaveLength(3);
    expect(screen.getAllByText(/not built yet/i)).toHaveLength(1);
    expect(screen.getAllByText('Soon')).toHaveLength(1);
  });

  it('never renders an ordinary switch for a key named in unavailable', async () => {
    alertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ unavailable: ['ownMatterJudgment', 'unknownListing'] }) },
    });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    // Only savedAuthorityMoved is left as a switch; trigger 2 plus the two
    // named keys render as not-yet rows.
    expect(await screen.findAllByRole('switch')).toHaveLength(1);
    expect(screen.getAllByText(/not built yet/i)).toHaveLength(3);
    expect(screen.getAllByText('Soon')).toHaveLength(3);
  });

  it('does not hard-code which keys are unavailable — a new key from the server renders the same way', async () => {
    alertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ unavailable: ['unknownListing'] }) },
    });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    expect(await screen.findAllByRole('switch')).toHaveLength(2);
    expect(screen.getAllByText(/not built yet/i)).toHaveLength(2);
  });
});

describe('AlertSettingsScreen — current-v1 truth', () => {
  beforeEach(() => {
    alertSettings.mockReset();
    updateAlertSettings.mockReset();
    mockRegisterForPush.mockReset();
  });

  it('says alerts are not switched on in this version', async () => {
    alertSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    expect(await screen.findByText(/not switched on in this version/i)).toBeTruthy();
  });

  it('never names the evening briefing while briefing.daily_loop is disabled', async () => {
    alertSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    await screen.findAllByRole('switch');
    // The delivery channel this screen used to promise. Naming a disabled
    // channel in a settings screen is the defect T0.3 removed.
    expect(screen.queryByText(/evening briefing/i)).toBeNull();
    expect(screen.queryByText(/four things/i)).toBeNull();
  });

  it('never promises trigger 2 as a mandatory working alert', async () => {
    alertSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    await screen.findAllByRole('switch');
    expect(screen.getByText('An authority I filed is set aside')).toBeTruthy();
    expect(screen.queryByText(/cannot be turned off/i)).toBeNull();
  });

  it('does NOT ask for push permission while push delivery is disabled', async () => {
    alertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ savedAuthorityMoved: false }) },
    });
    updateAlertSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ savedAuthorityMoved: true }) },
    });
    await render(<AlertSettingsScreen onBack={() => {}} />);

    const switches = await screen.findAllByRole('switch');
    await fireEvent.press(switches[0]!);

    // The setting still saves — the preference gates the producer's audience
    // query the moment the producer runs. Only the prompt is gone.
    expect(updateAlertSettings).toHaveBeenCalledWith({ savedAuthorityMoved: true });
    expect(mockRegisterForPush).not.toHaveBeenCalled();
    expect(screen.queryByText(/push/i)).toBeNull();
  });
});
