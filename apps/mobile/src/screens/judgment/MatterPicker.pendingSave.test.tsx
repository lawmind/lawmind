import { fireEvent, render, screen } from '@testing-library/react-native';

import { MatterPicker } from './MatterPicker';
import { usePendingSave, type PendingSaveIntent } from '../../state/pendingSave';
import { usePractice } from '../../state/practice';

const pushed: unknown[] = [];
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (to: unknown) => {
      pushed.push(to);
    },
  }),
}));

/**
 * THE CAPTURE IS THE LAST THING BEFORE LEAVING, NOT THE FIRST THING ON OPENING.
 *
 * NEW3 R16 §8: the intent is retained "when and only when matter creation
 * originates from `MatterPicker`". A sheet that is opened and dismissed must
 * leave nothing behind — otherwise a later, unrelated matter creation would
 * silently attach an authority the advocate walked away from.
 */

const INTENT: PendingSaveIntent = {
  kind: 'authority',
  judgmentId: 'jdg_1',
  caseTitle: 'Mock Bench v. Mock State',
};

beforeEach(() => {
  pushed.length = 0;
  usePendingSave.setState({ held: null, hydrated: true, running: false });
  // A PROVEN empty caseload (RCC R29): `[]` alone is no longer read as "none".
  usePractice.setState({ matters: [], freshness: { kind: 'live' }, loading: false, refreshError: null });
});

describe('the empty picker', () => {
  it('holds nothing while it is merely open', async () => {
    await render(
      <MatterPicker intent={INTENT} onDismiss={() => {}} onPick={() => {}} visible />,
    );

    await screen.findByText('Create a matter');
    expect(usePendingSave.getState().held).toBeNull();
  });

  it('holds the intent when the advocate leaves to create a matter', async () => {
    await render(
      <MatterPicker intent={INTENT} onDismiss={() => {}} onPick={() => {}} visible />,
    );

    fireEvent.press(await screen.findByText('Create a matter'));

    expect(usePendingSave.getState().held).toMatchObject({
      kind: 'authority',
      judgmentId: 'jdg_1',
    });
    expect(pushed).toEqual(['/matter/new']);
  });

  /** A caller that has not adopted the intent behaves exactly as it always did. */
  it('holds nothing when no intent was supplied', async () => {
    await render(<MatterPicker onDismiss={() => {}} onPick={() => {}} visible />);

    fireEvent.press(await screen.findByText('Create a matter'));

    expect(usePendingSave.getState().held).toBeNull();
    expect(pushed).toEqual(['/matter/new']);
  });

  /**
   * STILL NO GLOBAL SAVED AUTHORITY — `R16-RCC-X01`. The sheet offers exactly
   * one way forward, and it is making a matter.
   */
  it('offers no way to save without a matter', async () => {
    await render(
      <MatterPicker intent={INTENT} onDismiss={() => {}} onPick={() => {}} visible />,
    );

    await screen.findByText('Create a matter');
    expect(screen.queryByText(/save without a matter|save for later|save anyway/i)).toBeNull();
  });
});
