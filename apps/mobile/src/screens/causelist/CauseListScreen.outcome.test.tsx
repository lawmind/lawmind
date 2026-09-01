import { fireEvent, render, screen } from '@testing-library/react-native';

import { CauseListScreen } from './CauseListScreen';
import type { Matter } from '../../api/contract';
import { usePractice } from '../../state/practice';
import { todayCivil } from '../../theme/hearingDate';

const pushed: unknown[] = [];
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (to: unknown) => {
      pushed.push(to);
    },
  }),
}));

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NO DEAD OUTCOME AFFORDANCE — NEW3 R16 `R16-RCC-05`, founder design D-3.
 *
 * "Heard — order reserved" was rendered as one of two large outcome buttons and
 * recorded NOTHING: it pushed `/matter/[id]`, byte-for-byte the destination of
 * the "Open the matter" link directly beneath it. An advocate in a corridor
 * tapped what read as "record what happened" and had recorded nothing at all.
 *
 * THE TEST IS THE ABSENCE, and it is deliberately phrased as an absence rather
 * than as "the sheet has one button". The defect class is a control that LOOKS
 * like persistence and is not — so what must stay true is that no such wording
 * appears, whatever the layout becomes. D-3 names removal as an acceptable
 * answer to its own brief and forbids inventing an outcome state; there is no
 * `outcome` concept in the schema and `POST /matters/:id/events` accepts only
 * `{hearing, order, filing, note}`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const today = todayCivil();
const iso = `${String(today.year).padStart(4, '0')}-${String(today.month).padStart(2, '0')}-${String(
  today.day,
).padStart(2, '0')}`;

const LISTED: Matter = {
  matterId: 'mat_listed',
  caseTitle: 'Mock Petitioner v. Mock State',
  cnrNumber: null,
  court: 'Patna High Court',
  caseType: 'criminal',
  parties: { description: 'Mock parties' },
  clientName: 'Mock Client',
  ourSide: 'petitioner',
  nextHearingDate: iso,
};

beforeEach(() => {
  pushed.length = 0;
  usePractice.setState({
    matters: [LISTED],
    freshness: { kind: 'live' },
    loading: false,
    refreshError: null,
    briefings: {},
    hydrate: async () => {},
  });
});

/**
 * The sheet mounts through an effect, so every assertion below waits for a
 * control that MUST be there before asserting on one that must not. Querying a
 * sheet that has not opened yet returns null for everything, and an absence
 * test would pass on it without ever rendering the thing under test.
 */
async function openTheOutcomeSheet() {
  await render(<CauseListScreen />);
  fireEvent.press(screen.getByText('Mock Petitioner v. Mock State'));
  await screen.findByText('Open the matter');
}

describe('the cause-list outcome sheet', () => {
  it('offers no "Heard / order reserved" outcome', async () => {
    await openTheOutcomeSheet();

    expect(screen.queryByText(/^Heard$/)).toBeNull();
    expect(screen.queryByText(/order reserved/i)).toBeNull();
  });

  /**
   * The outcome that DOES persist stays, and stays the primary action. Removing
   * a false affordance must not cost the real one — recording an adjournment is
   * the highest-frequency write in the product.
   */
  it('still offers the adjournment, which records a date and a purpose', async () => {
    await openTheOutcomeSheet();

    expect(screen.getByText('Adjourned')).toBeTruthy();
    fireEvent.press(screen.getByText('Adjourned'));
    expect(pushed).toEqual([{ pathname: '/adjournment/[id]', params: { id: 'mat_listed' } }]);
  });

  /**
   * "Open the matter" was never an outcome and is not being retired as one — it
   * is honestly labelled navigation, and it is what the removed button silently
   * did.
   */
  it('keeps the honestly-labelled route into the matter', async () => {
    await openTheOutcomeSheet();

    fireEvent.press(screen.getByText('Open the matter'));
    expect(pushed).toEqual([{ pathname: '/matter/[id]', params: { id: 'mat_listed' } }]);
  });
});
