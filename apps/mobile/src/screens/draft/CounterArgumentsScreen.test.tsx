import { fireEvent, render, screen } from '@testing-library/react-native';

import { CounterArgumentsScreen } from './CounterArgumentsScreen';
import { api } from '../../api/client';
import type { CounterArgumentsResponse } from '../../api/contract';

/**
 * THE SCREEN THAT MAKES A FINISHED FEATURE REACHABLE.
 *
 * `POST /arguments/counter` was live, `client.ts` called it, `CounterArguments`
 * rendered it, and a reachability audit on 11 Aug 2026 found the component
 * imported by its own test and by nothing else. `tsc` was green, the tests
 * passed, the endpoint answered, and no advocate could open any of it — which
 * is the defect class that hides best.
 *
 * These tests are about the two things this screen decides: what it sends, and
 * what it shows while it has not been told anything yet. Everything about how a
 * citation renders belongs to `CounterArguments` and is tested there.
 */

jest.mock('../../api/client', () => ({
  api: { counterArguments: jest.fn() },
}));

const counterArguments = api.counterArguments as jest.MockedFunction<
  typeof api.counterArguments
>;

const response = (over: Partial<CounterArgumentsResponse> = {}): CounterArgumentsResponse => ({
  position: 'Bail ought to be granted',
  asOf: '2026-08-11T00:00:00.000Z',
  authorities: [
    {
      judgmentId: 'j1',
      caseTitle: 'Mock Authority v. State',
      neutralCitation: 'MOCK 2026 EXAMPLE 1',
      verificationState: 'verified',
      verifiedBySource: 'corpus',
      overruledStatus: 'none',
      asOf: '2026-08-11T00:00:00.000Z',
    },
  ],
  excluded: [],
  unverifiedReferences: [],
  ...over,
});

const draw = (matterId?: string) =>
  render(<CounterArgumentsScreen matterId={matterId} onBack={() => {}} />);

const state = async (position: string) => {
  await fireEvent.changeText(screen.getByPlaceholderText(/Bail ought to be granted/), position);
  await fireEvent.press(screen.getByText('Find the authorities'));
};

beforeEach(() => {
  counterArguments.mockReset();
  counterArguments.mockResolvedValue({ ok: true, data: response() });
});

describe('stating a position', () => {
  it('sends what was typed, and the matter it was opened from', async () => {
    await draw('mat_7');
    await state('Section 67 NDPS statements are inadmissible');

    expect(counterArguments).toHaveBeenCalledWith(
      'Section 67 NDPS statements are inadmissible',
      'en',
      'mat_7'
    );
  });

  it('sends no matter id when the screen was opened on its own', async () => {
    await draw();
    await state('Section 67 NDPS statements are inadmissible');

    expect(counterArguments).toHaveBeenCalledWith(
      'Section 67 NDPS statements are inadmissible',
      'en',
      undefined
    );
  });

  it('trims the position rather than sending the advocate’s trailing spaces', async () => {
    await draw();
    await state('   Bail is the rule   ');

    expect(counterArguments).toHaveBeenCalledWith('Bail is the rule', 'en', undefined);
  });

  it('asks nothing at all on an empty position', async () => {
    await draw();
    await fireEvent.press(screen.getByText('Find the authorities'));

    expect(counterArguments).not.toHaveBeenCalled();
  });

  it('renders what came back', async () => {
    await draw();
    await state('Bail ought to be granted');

    expect(await screen.findByText('Mock Authority v. State, MOCK 2026 EXAMPLE 1')).toBeTruthy();
  });
});

/**
 * THE POSITION THE ANSWER BELONGS TO COMES FROM THE SERVER, NOT FROM THIS BOX.
 *
 * `contract.ts`: `position` is "echoed back so the panel can render what was
 * asked, not what was typed". Editing the field after a search must therefore
 * leave the heading alone — otherwise authorities retrieved for one
 * proposition sit under another, with nothing to show the two ever differed.
 * This screen keeps no copy of the sentence for exactly that reason.
 */
describe('the position the answer belongs to', () => {
  it('shows the server’s echo, and does not follow the field as it is edited', async () => {
    counterArguments.mockResolvedValue({
      ok: true,
      data: response({ position: 'Bail ought to be granted' }),
    });

    await draw();
    await state('Bail ought to be granted');
    await screen.findByText('Mock Authority v. State, MOCK 2026 EXAMPLE 1');

    await fireEvent.changeText(
      screen.getByPlaceholderText(/Bail ought to be granted/),
      'A completely different proposition'
    );

    expect(screen.getByText('Bail ought to be granted')).toBeTruthy();
    expect(screen.queryByText('A completely different proposition')).toBeNull();
  });
});

/**
 * THE CAVEAT IS READ BEFORE THE LIST, NEVER AFTER IT.
 *
 * Production returns authorities and no prose. Someone who came for the
 * opposing case and meets the explanation for the first time UNDERNEATH a list
 * of authorities has already read the list as the argument.
 */
describe('what the screen promises', () => {
  it('says up front that it does not draft the opposing case', async () => {
    await draw();

    expect(screen.getByText(/It does not draft the opposing case\./)).toBeTruthy();
  });

  it('shows no result panel before anything has been asked', async () => {
    await draw();

    expect(screen.queryByText('AUTHORITIES ON THIS POINT')).toBeNull();
  });
});

describe('when the request fails', () => {
  it('says what the server said, and draws no empty panel', async () => {
    counterArguments.mockResolvedValue({
      ok: false,
      error: { code: 'internal', message: 'Mock upstream is unavailable' },
    });

    await draw();
    await state('Bail ought to be granted');

    expect(await screen.findByText('Mock upstream is unavailable')).toBeTruthy();
    expect(screen.queryByText('AUTHORITIES ON THIS POINT')).toBeNull();
  });
});
