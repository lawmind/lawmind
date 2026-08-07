import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '../api/client';
import type { CitationCopy } from '../api/contract';
import { newClientKey, useOutbox } from './outbox';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A COPY THAT NEVER SYNCS IS AN ADVOCATE THE FAN-OUT CANNOT SEE.
 *
 * `SCHEMA_TRUTH.md#citation_copies` is unusually specific about this table:
 * "Copy works offline, so the write queues through the outbox with an
 * idempotency key like every other local-first write. A copy that never syncs
 * is a citation we cannot warn about — COUNT OUTBOX AGE HERE, DO NOT ASSUME
 * DELIVERY."
 *
 * So the properties under test are not "does the request fire". They are:
 *   1. a failed send is RETAINED, never dropped;
 *   2. a double tap does not become two records;
 *   3. the queue can say how old its oldest unsent copy is.
 *
 * The third is the one that turns "we might have lost some" into a number.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('../api/client', () => ({
  api: { recordCitationCopy: jest.fn() },
}));

const recordCitationCopy = api.recordCitationCopy as jest.MockedFunction<
  typeof api.recordCitationCopy
>;

const copy = (over: Partial<CitationCopy> = {}): CitationCopy => ({
  judgmentId: 'j-1',
  surface: 'judgment_detail',
  copiedAt: new Date().toISOString(),
  clientKey: newClientKey(),
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useOutbox.setState({ pending: [], hydrated: false, flushing: false });
  recordCitationCopy.mockReset();
});

it('sends a queued copy and clears it once the server has it', async () => {
  recordCitationCopy.mockResolvedValue({ ok: true, data: { ok: true } } as never);

  await useOutbox.getState().enqueue(copy());
  await useOutbox.getState().flush();

  expect(recordCitationCopy).toHaveBeenCalledTimes(1);
  expect(useOutbox.getState().pending).toHaveLength(0);
});

/**
 * THE LOAD-BEARING ONE. A dropped entry is silent: nothing errors, the advocate
 * sees their citation on the clipboard, and the only record that could warn
 * them later never existed.
 */
it('keeps a copy the server refused, rather than dropping it', async () => {
  recordCitationCopy.mockResolvedValue({
    ok: false,
    error: { message: 'network unreachable' },
  } as never);

  await useOutbox.getState().enqueue(copy());
  await useOutbox.getState().flush();

  const pending = useOutbox.getState().pending;
  expect(pending).toHaveLength(1);
  expect(pending[0]?.attempts).toBe(1);
  expect(pending[0]?.lastError).toBe('network unreachable');
});

it('survives a restart — the queue is on the device, not in memory', async () => {
  recordCitationCopy.mockResolvedValue({
    ok: false,
    error: { message: 'offline' },
  } as never);

  await useOutbox.getState().enqueue(copy({ judgmentId: 'j-restart' }));
  await useOutbox.getState().flush();

  // A fresh process: state gone, storage intact.
  useOutbox.setState({ pending: [], hydrated: false, flushing: false });
  await useOutbox.getState().hydrate();

  expect(useOutbox.getState().pending).toHaveLength(1);
  expect(useOutbox.getState().pending[0]?.judgmentId).toBe('j-restart');
});

/**
 * `clientKey` is the idempotency key. The server's unique constraint is the
 * real guarantee, but a double tap must not queue two entries either — that
 * would retry twice and inflate the count the fan-out is measured against.
 */
it('collapses a double tap into one record', async () => {
  recordCitationCopy.mockResolvedValue({
    ok: false,
    error: { message: 'offline' },
  } as never);

  const one = copy();
  await useOutbox.getState().enqueue(one);
  await useOutbox.getState().enqueue(one);

  expect(useOutbox.getState().pending).toHaveLength(1);
});

it('treats the same citation copied twice as two separate events', async () => {
  recordCitationCopy.mockResolvedValue({
    ok: false,
    error: { message: 'offline' },
  } as never);

  await useOutbox.getState().enqueue(copy({ judgmentId: 'j-same' }));
  await useOutbox.getState().enqueue(copy({ judgmentId: 'j-same' }));

  // Different taps carry different keys, and both matter: an advocate who
  // copied the same authority a week apart did two things.
  expect(useOutbox.getState().pending).toHaveLength(2);
});

it('reports the age of the oldest unsent copy, and null when there is nothing owed', async () => {
  expect(useOutbox.getState().oldestPendingAge()).toBeNull();

  recordCitationCopy.mockResolvedValue({
    ok: false,
    error: { message: 'offline' },
  } as never);

  const copiedAt = new Date('2026-08-07T10:00:00.000Z').toISOString();
  await useOutbox.getState().enqueue(copy({ copiedAt }));

  const age = useOutbox.getState().oldestPendingAge(
    new Date('2026-08-07T10:05:00.000Z').getTime()
  );
  expect(age).toBe(5 * 60 * 1000);
});
