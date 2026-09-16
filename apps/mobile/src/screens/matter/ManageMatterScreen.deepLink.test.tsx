import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ManageMatterScreen } from './ManageMatterScreen';
import { api } from '../../api/client';
import type { Matter } from '../../api/contract';
import { usePractice } from '../../state/practice';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A DEEP LINK LANDS WITH NOTHING LOADED. RCC R30.
 *
 * Seen on the S24 in R29: `/matter/manage?id=…` opened cold said "This matter is
 * not on this device" for a matter the server holds, because no tab had
 * hydrated Practice. Absence may only be stated after a live read.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('../../api/client', () => ({ api: { matters: jest.fn(), updateMatter: jest.fn() } }));
const matters = api.matters as jest.MockedFunction<typeof api.matters>;

const TARGET: Matter = {
  matterId: 'mat_1',
  caseTitle: 'Mock Petitioner v. Mock State',
  cnrNumber: null,
  court: 'Patna High Court',
  caseType: 'criminal',
  parties: { description: 'Mock parties' },
  clientName: 'Mock Client',
  ourSide: 'petitioner',
  nextHearingDate: '2026-09-20',
  status: 'active',
  access: 'owner',
};
const OTHER: Matter = { ...TARGET, matterId: 'mat_2', caseTitle: 'Other v. Other' };

const ok = (list: Matter[]) => ({ ok: true, data: { matters: list } }) as never;
const fail = () => ({ ok: false, error: { code: 'NETWORK', message: 'Network request failed' } }) as never;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const open = () => render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);
const ABSENT = /not in your matters/;

beforeEach(() => {
  matters.mockReset();
  usePractice.setState({ matters: [], freshness: { kind: 'unknown' }, loading: false, refreshError: null });
});

it('unknown -> loading -> the target, with its management actions', async () => {
  const d = deferred<never>();
  matters.mockReturnValue(d.promise);
  await open();

  expect(screen.getByTestId('manage-matter-resolving')).toBeTruthy();
  expect(screen.queryByText(ABSENT)).toBeNull();
  await waitFor(() => expect(matters).toHaveBeenCalledTimes(1));

  d.resolve(ok([OTHER, TARGET]));
  expect(await screen.findByDisplayValue(TARGET.caseTitle)).toBeTruthy();
  expect(screen.getByText('Mark archived')).toBeTruthy();
  expect(screen.queryByText(ABSENT)).toBeNull();
});

it('a cached target renders immediately and fetches nothing', async () => {
  usePractice.setState({ matters: [TARGET], freshness: { kind: 'cached', cachedAt: '2026-09-15T00:00:00Z' } });
  await open();

  expect(screen.getByDisplayValue(TARGET.caseTitle)).toBeTruthy();
  expect(matters).not.toHaveBeenCalled();
});

it('a live list without the target is a truthful absence', async () => {
  matters.mockResolvedValue(ok([OTHER]));
  await open();

  expect(await screen.findByText(ABSENT)).toBeTruthy();
  expect(screen.queryByTestId('manage-matter-resolving')).toBeNull();
});

it('a failed read before the truth is known is unavailable, never absent', async () => {
  matters.mockResolvedValue(fail());
  await open();

  expect(await screen.findByTestId('manage-matter-unavailable')).toBeTruthy();
  expect(screen.queryByText(ABSENT)).toBeNull();

  matters.mockResolvedValue(ok([TARGET]));
  fireEvent.press(screen.getByText('Try again'));
  expect(await screen.findByDisplayValue(TARGET.caseTitle)).toBeTruthy();
});

it('unrelated cached matters do not prove absence: it refreshes first', async () => {
  usePractice.setState({ matters: [OTHER], freshness: { kind: 'cached', cachedAt: '2026-09-15T00:00:00Z' } });
  const d = deferred<never>();
  matters.mockReturnValue(d.promise);
  await open();

  expect(screen.getByTestId('manage-matter-resolving')).toBeTruthy();
  expect(screen.queryByText(ABSENT)).toBeNull();
  await waitFor(() => expect(matters).toHaveBeenCalledTimes(1));

  d.resolve(ok([OTHER, TARGET]));
  expect(await screen.findByDisplayValue(TARGET.caseTitle)).toBeTruthy();
});

it('a cached list without the target whose refresh fails is unavailable, not absent', async () => {
  usePractice.setState({ matters: [OTHER], freshness: { kind: 'cached', cachedAt: '2026-09-15T00:00:00Z' } });
  matters.mockResolvedValue(fail());
  await open();

  expect(await screen.findByTestId('manage-matter-unavailable')).toBeTruthy();
  expect(screen.queryByText(ABSENT)).toBeNull();
});
