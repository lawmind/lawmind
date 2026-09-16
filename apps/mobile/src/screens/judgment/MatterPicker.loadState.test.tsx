import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MatterPicker, pickerView } from './MatterPicker';
import { api } from '../../api/client';
import { usePendingSave, type PendingSaveIntent } from '../../state/pendingSave';
import { usePractice } from '../../state/practice';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AN UNLOADED STORE IS NOT AN EMPTY CASELOAD. RCC R29, defect 1.
 *
 * Found on the S24: a cold deep link to a judgment, "Save to matter", and the
 * picker said "No matters yet" to an account holding two. Nothing on that route
 * had hydrated Practice. "No matters" — and the Create action that follows from
 * it — may only be said after a LIVE read returned none.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const matters = jest.spyOn(api, 'matters');

const MATTER = { matterId: 'mat-1', caseTitle: 'Client v. Other', court: 'Delhi HC' } as never;
const INTENT: PendingSaveIntent = { kind: 'authority', judgmentId: 'jdg_1', caseTitle: 'Mock v. State' };

const ok = (list: unknown[]) => ({ ok: true, data: { matters: list } }) as never;
const fail = () => ({ ok: false, error: { code: 'NETWORK', message: 'Network request failed' } }) as never;

/** A promise the test settles by hand, so the in-flight state can be observed. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const pick = () => render(<MatterPicker intent={INTENT} onDismiss={() => {}} onPick={() => {}} visible />);

beforeEach(() => {
  matters.mockReset();
  usePendingSave.setState({ held: null, hydrated: true, running: false });
  usePractice.setState({ matters: [], freshness: { kind: 'unknown' }, loading: false, refreshError: null });
});

describe('pickerView', () => {
  const at = (over: Partial<Parameters<typeof pickerView>[0]>) =>
    pickerView({ matters: [], freshness: { kind: 'unknown' }, loading: false, refreshError: null, ...over });

  it('unknown + [] is resolving, never empty', () => {
    expect(at({})).toBe('resolving');
    expect(at({ loading: true })).toBe('resolving');
  });
  it('a cached [] is not proof either', () => {
    expect(at({ freshness: { kind: 'cached', cachedAt: '2026-09-16T00:00:00Z' } })).toBe('resolving');
  });
  it('only a live [] is empty', () => {
    expect(at({ freshness: { kind: 'live' } })).toBe('empty');
  });
  it('a failed read with nothing cached is unavailable', () => {
    expect(at({ refreshError: 'Network request failed' })).toBe('unavailable');
  });
  it('a failed read with nothing cached, retrying, is resolving', () => {
    expect(at({ refreshError: 'x', loading: true })).toBe('resolving');
  });
  it('any matters list, whatever the freshness or error', () => {
    expect(at({ matters: [MATTER] })).toBe('list');
    expect(at({ matters: [MATTER], refreshError: 'x' })).toBe('list');
  });
});

describe('the picker on a cold deep link', () => {
  it('unknown -> hydrate -> nonempty: loading first, then the list, and no Create', async () => {
    const d = deferred<never>();
    matters.mockReturnValue(d.promise);
    await pick();

    expect(screen.getByTestId('matter-picker-resolving')).toBeTruthy();
    expect(screen.queryByText(/No matters yet/)).toBeNull();
    expect(screen.queryByText('Create a matter')).toBeNull();
    await waitFor(() => expect(matters).toHaveBeenCalledTimes(1));

    d.resolve(ok([MATTER, { ...(MATTER as object), matterId: 'mat-2', caseTitle: 'Second v. Other' }]));

    expect(await screen.findByText('Client v. Other')).toBeTruthy();
    expect(screen.getByText('Second v. Other')).toBeTruthy();
    expect(screen.queryByText('Create a matter')).toBeNull();
    expect(usePendingSave.getState().held).toBeNull();
  });

  it('unknown -> hydrate -> live empty: now "No matters yet" and Create are truthful', async () => {
    matters.mockResolvedValue(ok([]));
    await pick();

    expect(await screen.findByText('Create a matter')).toBeTruthy();
    expect(screen.getByText(/No matters yet/)).toBeTruthy();

    // The genuine-empty path still carries the save across.
    fireEvent.press(screen.getByText('Create a matter'));
    expect(usePendingSave.getState().held).toMatchObject({ kind: 'authority', judgmentId: 'jdg_1' });
  });

  it('unknown -> hydrate -> failure: unavailable with retry, never empty, never Create', async () => {
    matters.mockResolvedValue(fail());
    await pick();

    expect(await screen.findByTestId('matter-picker-unavailable')).toBeTruthy();
    expect(screen.queryByText(/No matters yet/)).toBeNull();
    expect(screen.queryByText('Create a matter')).toBeNull();

    matters.mockResolvedValue(ok([MATTER]));
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Client v. Other')).toBeTruthy();
  });

  it('cached nonempty is listed immediately, and a failed refresh keeps it', async () => {
    usePractice.setState({
      matters: [MATTER],
      freshness: { kind: 'cached', cachedAt: '2026-09-15T00:00:00Z' },
    });
    matters.mockResolvedValue(fail());
    await pick();

    expect(screen.getByText('Client v. Other')).toBeTruthy();
    await waitFor(() => expect(matters).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(usePractice.getState().refreshError).not.toBeNull());
    expect(screen.getByText('Client v. Other')).toBeTruthy();
    expect(screen.queryByText('Create a matter')).toBeNull();
  });

  it('a live list does not refetch on open', async () => {
    usePractice.setState({ matters: [MATTER], freshness: { kind: 'live' } });
    await pick();

    expect(screen.getByText('Client v. Other')).toBeTruthy();
    expect(matters).not.toHaveBeenCalled();
  });

  it('a closed picker fetches nothing', async () => {
    await render(<MatterPicker onDismiss={() => {}} onPick={() => {}} visible={false} />);
    expect(matters).not.toHaveBeenCalled();
  });
});
