import { render, screen } from '@testing-library/react-native';

import { TodayScreen } from './TodayScreen';
import type { Alert } from '../../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MOST SEVERE ALERT IN THE PRODUCT WAS RENDERED NOWHERE.
 *
 * `severity: 'immediate'` means an authority the advocate has FILED OR COPIED
 * went `set_aside` or `partly_set_aside` (`citations/fanout.ts`). This screen
 * filtered `severity === 'batched'` and dropped the rest, on the stated
 * reasoning that an immediate alert had already arrived as a push.
 *
 * THE PREMISE IS FALSE IN THE CODE THAT PRODUCES THEM: `fanout.ts` pushes only
 * `if (highSeverity === 'immediate' && row.expo_push_token)`. An advocate who
 * declined notifications gets no push, and the alert existed in the API with
 * nothing rendering it. Silent-drop rate carries a zero threshold.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 'alr_1',
  kind: 'filed_citation_moved',
  severity: 'immediate',
  judgmentId: 'jdg_1',
  matterId: null,
  fromStatus: 'none',
  toStatus: 'set_aside',
  judgmentTitle: 'Mock Authority v. Mock State',
  overruledParas: null,
  currentOverruledStatus: 'set_aside',
  createdAt: '2026-08-11T00:00:00.000Z',
  readAt: null,
  ...over,
});

/* `mock` prefix required: jest forbids a module factory referencing any
   out-of-scope variable that is not so named. */
let mockAlerts: Alert[] = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('../../state/session', () => ({
  useSession: (selector: (s: unknown) => unknown) =>
    selector({ status: 'signed_in', profile: { fullName: 'Mock Advocate', enrolmentStatus: 'verified' } }),
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
    selector({ alerts: mockAlerts, fetch: () => {}, markRead: () => {} }),
}));

const draw = async (alerts: Alert[]) => {
  mockAlerts = alerts;
  await render(<TodayScreen />);
};

describe('an authority the advocate has already used', () => {
  it('is shown in the app, not only pushed', async () => {
    await draw([alert()]);

    expect(await screen.findByText('An authority you have used has moved')).toBeTruthy();
    expect(
      screen.getByText('Mock Authority v. Mock State — an authority you filed')
    ).toBeTruthy();
  });

  it('states the movement, not merely the current status', async () => {
    await draw([alert()]);

    expect(
      await screen.findByText('It has been set aside since you used it.')
    ).toBeTruthy();
  });

  /**
   * PD-6 keeps the batched block as the evening digest. Folding a
   * filed-citation emergency into it is what the severity split exists to
   * prevent, so the two carry different headings.
   */
  it('is kept out of the evening digest, under its own heading', async () => {
    await draw([alert()]);

    await screen.findByText('An authority you have used has moved');
    expect(screen.queryByText('Since yesterday')).toBeNull();
  });

  it('still draws the digest alongside it when both exist', async () => {
    await draw([alert(), alert({ id: 'alr_2', severity: 'batched', judgmentId: 'jdg_2' })]);

    expect(await screen.findByText('An authority you have used has moved')).toBeTruthy();
    expect(screen.getByText('Since yesterday')).toBeTruthy();
  });

  it('draws no heading at all when there is nothing to report', async () => {
    await draw([]);

    await screen.findByText(/Good morning/);
    expect(screen.queryByText('An authority you have used has moved')).toBeNull();
    expect(screen.queryByText('Since yesterday')).toBeNull();
  });
});

/**
 * The corpus can move again after an alert fires. Neither reading may be
 * silently preferred — the advocate is the one who decides which to act on.
 */
describe('when the record has changed since the alert fired', () => {
  it('shows both the alert’s subject and the newer reading', async () => {
    await draw([alert({ toStatus: 'doubted', currentOverruledStatus: 'set_aside' })]);

    expect(
      await screen.findByText('It has been doubted since you used it.')
    ).toBeTruthy();
    expect(screen.getByText('The record now shows it as set aside.')).toBeTruthy();
  });

  /** The regression: this used to read "is now good law again". */
  it('never claims a court restored the authority', async () => {
    await draw([alert({ currentOverruledStatus: 'none' })]);

    expect(
      await screen.findByText(
        'The record no longer shows it as moved. Check it before you rely on that.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/good law again/)).toBeNull();
  });
});
