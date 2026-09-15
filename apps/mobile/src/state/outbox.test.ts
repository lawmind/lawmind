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

/**
 * FOUNDER CORRECTION, 22 Aug 2026: "It must not retry forever." A permanently
 * failing mutation gains nothing from eight identical attempts spread over
 * days — `CORPUS_TARGET_UNAVAILABLE` (the pinned corpus generation does not
 * carry the target), `INVALID_REQUEST` (a payload shape the server will always
 * reject) and `NOT_FOUND` are classified `NON_RETRYABLE` and die on the FIRST
 * failure, never the eighth.
 *
 * The `NOT_FOUND` case no longer describes "the judgment no longer exists" —
 * LCC R29 removed that sentence from every corpus route, and it was never a
 * claim this client was entitled to make. It is kept as a classification
 * because a shipped binary outlives a deploy.
 */
describe('a permanently-failing mutation does not retry forever', () => {
  it('marks NOT_FOUND dead on the first attempt, not the eighth', async () => {
    recordCitationCopy.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'no judgment with that id' },
    } as never);

    await useOutbox.getState().enqueue(copy());
    await useOutbox.getState().flush();

    expect(recordCitationCopy).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().pending[0]?.attempts).toBe(1);
    expect(useOutbox.getState().pending[0]?.dead).toBe(true);
    expect(useOutbox.getState().deadCount()).toBe(1);
  });

  /**
   * THE REGRESSION LCC R29 WOULD HAVE CAUSED SILENTLY.
   *
   * This state used to arrive as `NOT_FOUND` and die on attempt 1. LCC R29 gave
   * it its own code (`CORPUS_TARGET_UNAVAILABLE`, bus 1765 §3), which
   * `classify()` did not recognise — so it fell through to the RETRYABLE default
   * and would have been sent eight times before dying anyway, with no test able
   * to see the change. The client already had a written policy for this exact
   * state (`citation/saveAuthorityOutcome.ts` returns `retryable: false`), and a
   * client with two policies for one fact follows the one nobody chose.
   */
  it('marks CORPUS_TARGET_UNAVAILABLE dead on the first attempt — one retry policy, not two', async () => {
    recordCitationCopy.mockResolvedValue({
      ok: false,
      error: {
        code: 'CORPUS_TARGET_UNAVAILABLE',
        message: 'That judgment is not available in the selected corpus release.',
      },
    } as never);

    await useOutbox.getState().enqueue(copy());
    await useOutbox.getState().flush();

    expect(recordCitationCopy).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().pending[0]?.attempts).toBe(1);
    expect(useOutbox.getState().pending[0]?.dead).toBe(true);
  });

  it('marks INVALID_REQUEST dead on the first attempt', async () => {
    recordCitationCopy.mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'clientKey: too long' },
    } as never);

    await useOutbox.getState().enqueue(copy());
    await useOutbox.getState().flush();

    expect(useOutbox.getState().pending[0]?.dead).toBe(true);
  });

  it('a dead entry is never sent again — a later flush does not call the server for it', async () => {
    recordCitationCopy.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'no judgment with that id' },
    } as never);

    await useOutbox.getState().enqueue(copy());
    await useOutbox.getState().flush();
    recordCitationCopy.mockClear();

    await useOutbox.getState().flush();
    expect(recordCitationCopy).not.toHaveBeenCalled();
  });

  it('does NOT die on the first network failure — that is retryable, not permanent', async () => {
    recordCitationCopy.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'We could not reach Lawmind. You may be offline.' },
    } as never);

    await useOutbox.getState().enqueue(copy());
    await useOutbox.getState().flush();

    expect(useOutbox.getState().pending[0]?.attempts).toBe(1);
    expect(useOutbox.getState().pending[0]?.dead).toBeFalsy();
  });

  it('still dies once a retryable failure exhausts its attempt budget', async () => {
    recordCitationCopy.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'offline' },
    } as never);

    // Placed directly, bypassing `enqueue`'s own fire-and-forget flush — this
    // test is about `flush`'s attempt-budget bookkeeping across many calls,
    // not about the auto-flush-on-enqueue race one await cannot deterministically settle.
    useOutbox.setState({ pending: [{ ...copy(), attempts: 0 }] });

    for (let i = 0; i < 8; i++) {
      await useOutbox.getState().flush();
    }

    expect(useOutbox.getState().pending[0]?.attempts).toBe(8);
    expect(useOutbox.getState().pending[0]?.dead).toBe(true);
  });

  /**
   * `AUTH_REQUIRED` reaching the outbox means `client.ts`'s own refresh-once
   * already failed — the session is gone, not the network. Still capped
   * rather than immediately dead: signing back in is exactly the event that
   * makes the next attempt succeed, so it deserves the same budget as a
   * network blip, not a permanent tombstone on the first try.
   */
  it('treats AUTH_REQUIRED as retryable-but-capped, not immediately dead', async () => {
    recordCitationCopy.mockResolvedValue({
      ok: false,
      error: { code: 'AUTH_REQUIRED', message: 'a copy record belongs to an advocate' },
    } as never);

    await useOutbox.getState().enqueue(copy());
    await useOutbox.getState().flush();

    expect(useOutbox.getState().pending[0]?.attempts).toBe(1);
    expect(useOutbox.getState().pending[0]?.dead).toBeFalsy();
  });

  it('a dead entry is excluded from oldestPendingAge — its age growing forever is not actionable', async () => {
    recordCitationCopy.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'no judgment with that id' },
    } as never);

    const copiedAt = new Date('2026-08-07T10:00:00.000Z').toISOString();
    await useOutbox.getState().enqueue(copy({ copiedAt }));
    await useOutbox.getState().flush();

    expect(useOutbox.getState().pending[0]?.dead).toBe(true);
    expect(useOutbox.getState().oldestPendingAge(new Date('2026-08-08T10:00:00.000Z').getTime())).toBeNull();
  });
});
