import { fireEvent, render, screen } from '@testing-library/react-native';

import { TrainingConsentScreen } from './TrainingConsentScreen';
import { ATTEMPT_KEY_PATTERN } from '../../api/attempt';
import { api } from '../../api/client';
import type { TrainingConsent } from '../../api/contract';

/**
 * THE RULE UNDER TEST: DPDP Act 2023 s. 6 — a question separate from PD-8,
 * answered freely, and withdrawable exactly as easily as it was granted.
 * `docs/API_CONTRACTS.md` §Training consent.
 */

jest.mock('../../api/client', () => ({
  api: {
    trainingConsent: jest.fn(),
    grantTrainingConsent: jest.fn(),
    withdrawTrainingConsent: jest.fn(),
  },
}));

const trainingConsent = api.trainingConsent as jest.MockedFunction<typeof api.trainingConsent>;
const grantTrainingConsent = api.grantTrainingConsent as jest.MockedFunction<
  typeof api.grantTrainingConsent
>;
const withdrawTrainingConsent = api.withdrawTrainingConsent as jest.MockedFunction<
  typeof api.withdrawTrainingConsent
>;

function consent(over: Partial<TrainingConsent> = {}): TrainingConsent {
  return {
    granted: false,
    grantedAt: null,
    version: null,
    currentVersion: 'training-v1',
    isCurrent: false,
    ...over,
  };
}

describe('TrainingConsentScreen', () => {
  beforeEach(() => {
    trainingConsent.mockReset();
    grantTrainingConsent.mockReset();
    withdrawTrainingConsent.mockReset();
  });

  it('offers to agree when nothing has ever been granted', async () => {
    trainingConsent.mockResolvedValue({ ok: true, data: consent() });
    await render(<TrainingConsentScreen onBack={() => {}} />);

    expect(await screen.findByText('Not agreed yet.')).toBeTruthy();
    expect(screen.getByText('Agree')).toBeTruthy();
    expect(screen.queryByText('Withdraw')).toBeNull();
  });

  it('offers to withdraw, with no confirmation step, once agreed to the current notice', async () => {
    trainingConsent.mockResolvedValue({
      ok: true,
      data: consent({ granted: true, isCurrent: true, grantedAt: '2026-08-06T00:00:00.000Z', version: 'training-v1' }),
    });
    await render(<TrainingConsentScreen onBack={() => {}} />);

    expect(await screen.findByText('You have agreed to this.')).toBeTruthy();
    expect(screen.getByText('Withdraw')).toBeTruthy();
    expect(screen.queryByText('Agree')).toBeNull();
  });

  it('treats consent to a superseded notice the same as not agreed — real consent, not to today', async () => {
    trainingConsent.mockResolvedValue({
      ok: true,
      data: consent({ granted: true, isCurrent: false, version: 'training-v0' }),
    });
    await render(<TrainingConsentScreen onBack={() => {}} />);

    expect(await screen.findByText('The notice has changed since you last agreed.')).toBeTruthy();
    expect(screen.getByText('Agree')).toBeTruthy();
    expect(screen.queryByText('Withdraw')).toBeNull();
  });

  it('grants against currentVersion, never a client-side constant', async () => {
    trainingConsent.mockResolvedValue({ ok: true, data: consent({ currentVersion: 'training-v7' }) });
    grantTrainingConsent.mockResolvedValue({
      ok: true,
      data: consent({ granted: true, isCurrent: true, version: 'training-v7' }),
    });
    await render(<TrainingConsentScreen onBack={() => {}} />);

    await fireEvent.press(await screen.findByText('Agree'));

    expect(grantTrainingConsent).toHaveBeenCalledWith('training-v7', expect.any(String));
    expect(ATTEMPT_KEY_PATTERN.test(grantTrainingConsent.mock.calls[0]![1] as string)).toBe(true);
    expect(await screen.findByText('You have agreed to this.')).toBeTruthy();
  });

  it('names which consent this is, and states withdrawal never touches the onboarding terms — the re-check LCC asked for', async () => {
    trainingConsent.mockResolvedValue({
      ok: true,
      data: consent({ granted: true, isCurrent: true, version: 'training-v1' }),
    });
    await render(<TrainingConsentScreen onBack={() => {}} />);

    expect(
      await screen.findByText(/separate question from the terms you accepted to use the app/)
    ).toBeTruthy();
    expect(
      screen.getByText(/does not touch the terms of use you agreed to when you joined/)
    ).toBeTruthy();
  });

  it('withdraws in one tap and reflects the server response', async () => {
    trainingConsent.mockResolvedValue({
      ok: true,
      data: consent({ granted: true, isCurrent: true, version: 'training-v1' }),
    });
    withdrawTrainingConsent.mockResolvedValue({ ok: true, data: consent() });
    await render(<TrainingConsentScreen onBack={() => {}} />);

    await fireEvent.press(await screen.findByText('Withdraw'));

    expect(withdrawTrainingConsent).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Not agreed yet.')).toBeTruthy();
  });
});
