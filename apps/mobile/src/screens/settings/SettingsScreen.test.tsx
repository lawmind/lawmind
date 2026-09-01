import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SettingsScreen } from './SettingsScreen';

jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) => selector({ signOut: async () => {} }),
}));

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ACCOUNT / SETTINGS HUB — fpass 30, NEW3 R16 §7 `PARTIAL_CURRENT`.
 *
 * NO NEW ROWS WERE ADDED IN R16, AND THAT IS THE FINDING. NEW3 lists exactly one
 * outstanding item for this surface — D-4, permanent Terms and Privacy access —
 * and puts it in `RCC_SPRINT4` (`R16-RCC-10`), blocked on counsel-approved
 * documents. Building it now would be pulling Sprint 4 forward on the strength
 * of a design existing, which the round is told not to do.
 *
 * So what this file does is PIN the current IA, and pin the absences that the
 * design pack would otherwise reintroduce. `FPASS_DESIGN_TRUTH_R16.md` refused
 * five claims on this screen; three of them are things a settings hub naturally
 * grows, which is exactly why they need a test rather than a note.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const props = {
  onOpenAlerts: jest.fn(),
  onOpenBareActs: jest.fn(),
  onOpenCoverage: jest.fn(),
  onOpenTrainingConsent: jest.fn(),
  onOpenDeleteAccount: jest.fn(),
  onSignedOut: jest.fn(),
};

beforeEach(() => {
  for (const fn of Object.values(props)) fn.mockReset();
});

/**
 * PRESS INSIDE AN act SCOPE AND LET IT SETTLE.
 *
 * `Pressable` fires haptics and the sign-out row awaits a promise, so a bare
 * `fireEvent.press` closes its act scope with work still running. React then
 * reports overlapping act() calls, DISABLES the act environment for the whole
 * file, and every later render is detached from `screen` — which is how two
 * assertions below failed on rows that were plainly on the screen.
 */
async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

describe('the rows that are there', () => {
  /**
   * Each of the six has a backing endpoint or a real destination. The render
   * this screen came from drew SEVEN controls that had neither, which is why
   * the screen is small and real rather than large and illustrative.
   */
  it('offers exactly the six current rows', async () => {
    await render(<SettingsScreen {...props} />);

    for (const label of [
      'Alerts',
      'Bare Acts',
      'Coverage — what we hold',
      'Training data',
      'Sign out',
      'Delete account',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('routes each row to its own destination', async () => {
    await render(<SettingsScreen {...props} />);

    await press('Alerts');
    await press('Bare Acts');
    await press('Coverage — what we hold');
    await press('Training data');
    await press('Delete account');

    expect(props.onOpenAlerts).toHaveBeenCalled();
    expect(props.onOpenBareActs).toHaveBeenCalled();
    expect(props.onOpenCoverage).toHaveBeenCalled();
    expect(props.onOpenTrainingConsent).toHaveBeenCalled();
    expect(props.onOpenDeleteAccount).toHaveBeenCalled();
  });

  /** DPDP s. 6 — training consent is its own row, separate from onboarding terms. */
  it('keeps training consent separate from the onboarding terms', async () => {
    await render(<SettingsScreen {...props} />);

    expect(screen.getByText('Training data')).toBeTruthy();
    expect(screen.queryByText(/accept the terms|terms of use|agree to/i)).toBeNull();
  });

  it('signs out', async () => {
    await render(<SettingsScreen {...props} />);

    await press('Sign out');

    expect(props.onSignedOut).toHaveBeenCalled();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ABSENCES — each one a claim `FPASS_DESIGN_TRUTH_R16.md` refused, or a
 * `DO_NOT_BUILD` row from NEW3 R16 §13.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('what this screen must not grow', () => {
  /**
   * Trap M. The design writes "PLAN · Chamber · Renews 12 Aug 2026 · ₹19,990
   * yearly". `SubscriptionScreen` sells three MONTHLY tiers under PD-13 and no
   * renewal date is served by anything. The banned figure is pinned by name;
   * the three real prices are a settled decision and are not this round's to
   * reopen — they simply do not belong on this hub.
   */
  it('shows no plan, price, renewal date or purchase flow', async () => {
    const view = await render(<SettingsScreen {...props} />);
    const text = JSON.stringify(view.toJSON());

    expect(text).not.toMatch(/₹|19,990|renews|billing|subscribe|upgrade|free trial/i);
  });

  /**
   * D-1 and D-4 are `RCC_SPRINT4` (`R16-RCC-09`, `R16-RCC-10`), the second of
   * them blocked on counsel-approved copy. A design existing is not a licence
   * to ship it early — and D-1's own refusals include an invented "usually
   * within 30 days" response time that no endpoint supports.
   */
  it('pulls no Sprint 4 privacy or legal work forward', async () => {
    const view = await render(<SettingsScreen {...props} />);
    const text = JSON.stringify(view.toJSON());

    expect(text).not.toMatch(/export my data|download my data|correct my data|data request/i);
    expect(text).not.toMatch(/privacy policy|terms and conditions|terms of service/i);
    expect(text).not.toMatch(/within \d+ days|usually takes/i);
  });

  /**
   * The render this screen replaced drew four notification toggles and a
   * data-and-offline section. None of the seven has a backing field; the three
   * real alert settings live behind the Alerts row under different names.
   */
  it('offers no offline, storage or backup control', async () => {
    const view = await render(<SettingsScreen {...props} />);
    const text = JSON.stringify(view.toJSON());

    expect(text).not.toMatch(/keep .* offline|download matters|storage|backup|sync now/i);
  });

  /** X05 — no monitoring product exists, and a citator alert is not one. */
  it('claims no court monitoring', async () => {
    const view = await render(<SettingsScreen {...props} />);
    const text = JSON.stringify(view.toJSON());

    expect(text).not.toMatch(/monitor|track .* court|cause list alerts|polling/i);
  });
});
