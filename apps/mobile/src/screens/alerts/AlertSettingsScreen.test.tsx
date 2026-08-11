import { render, screen } from '@testing-library/react-native';

import { AlertSettingsScreen } from './AlertSettingsScreen';
import { api } from '../../api/client';
import type { AlertSettings } from '../../api/contract';

/**
 * THE RULE UNDER TEST: a setting named in `unavailable` never renders as an
 * ordinary switch. `docs/API_CONTRACTS.md` §Citator alerts — an advocate who
 * could turn a switch "on" and be told nothing, ever, finds out by missing a
 * hearing. The fix is additive and server-derived, so the client must key off
 * `settings.unavailable`, never a hard-coded pair of names.
 */

jest.mock('../../api/client', () => ({
  api: { alertSettings: jest.fn(), updateAlertSettings: jest.fn() },
}));

const alertSettings = api.alertSettings as jest.MockedFunction<typeof api.alertSettings>;

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
