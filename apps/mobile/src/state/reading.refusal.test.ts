import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '../api/client';
import { useReadingStore, type Highlight } from './reading';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A REFUSAL NO RETRY CAN CHANGE MUST NOT LEAVE A TINT BEHIND. RCC R28, B1.
 *
 * Offline-first keeps a pending highlight because nothing has disproved it. A
 * `400 INVALID_REQUEST` disproves it: the same payload is refused every time.
 * Before R28 the store kept it anyway — a tinted passage with no server row, and
 * a persisted attempt key that could only repeat the refusal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('../api/client', () => ({
  api: { createAnnotation: jest.fn(), annotations: jest.fn(), deleteAnnotation: jest.fn() },
}));

const createAnnotation = api.createAnnotation as jest.MockedFunction<typeof api.createAnnotation>;

const highlight = (over: Partial<Highlight> = {}): Highlight => ({
  judgmentId: 'j-1',
  paragraphIndex: 2,
  paragraphNumber: 2,
  text: 'an exact excerpt',
  savedAt: new Date().toISOString(),
  ...over,
});

const stored = async () => {
  const raw = await AsyncStorage.getItem('lawmind.reading.v1');
  return raw ? (JSON.parse(raw) as { highlights: Highlight[] }).highlights : [];
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await AsyncStorage.clear();
  useReadingStore.setState({ progress: {}, highlights: [], hydrated: false });
  createAnnotation.mockReset();
});

it('a successful save leaves one local highlight carrying the server id and the sent quote', async () => {
  createAnnotation.mockResolvedValue({
    ok: true,
    data: { annotation: { annotationId: 'ann-1' } },
  } as never);

  await useReadingStore.getState().addHighlight(highlight());

  const [only, ...rest] = useReadingStore.getState().highlights;
  expect(rest).toHaveLength(0);
  expect(only?.annotationId).toBe('ann-1');
  expect(only?.attemptKey).toBeUndefined();
  expect(createAnnotation.mock.calls[0]?.[1].quote).toBe(only?.text);
});

it('INVALID_REQUEST rolls the highlight back — no tint, no id, no attempt key, not persisted', async () => {
  createAnnotation.mockResolvedValue({
    ok: false,
    error: { code: 'INVALID_REQUEST', message: 'quote: String must contain at most 4000 character(s)' },
  } as never);

  const result = await useReadingStore.getState().addHighlight(highlight());

  expect(useReadingStore.getState().highlights).toEqual([]);
  await flush();
  expect(await stored()).toEqual([]);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.message).toBe('This passage was not saved. Select up to 4,000 characters.');
    expect(result.message).not.toMatch(/String must contain|character\(s\)|quote:/);
  }
});

it('a non-quote validation refusal gets its own truthful sentence, not the length one', async () => {
  createAnnotation.mockResolvedValue({
    ok: false,
    error: { code: 'INVALID_REQUEST', message: 'paragraphIndex: Expected number' },
  } as never);

  const result = await useReadingStore.getState().addHighlight(highlight());

  expect(useReadingStore.getState().highlights).toEqual([]);
  expect(!result.ok && result.message).toBe(
    'This passage was not saved — Lawmind could not accept it. Nothing was highlighted.',
  );
});

it('INVALID_IDEMPOTENCY_KEY is also terminal and rolls back', async () => {
  createAnnotation.mockResolvedValue({
    ok: false,
    error: { code: 'INVALID_IDEMPOTENCY_KEY', message: 'bad key' },
  } as never);

  await useReadingStore.getState().addHighlight(highlight());

  expect(useReadingStore.getState().highlights).toEqual([]);
});

it.each(['network', 'timeout'])('a %s failure keeps the pending highlight and its key', async (code) => {
  createAnnotation.mockResolvedValue({ ok: false, error: { code, message: 'x' } } as never);

  await useReadingStore.getState().addHighlight(highlight());

  const [pending] = useReadingStore.getState().highlights;
  expect(pending?.annotationId).toBeUndefined();
  expect(pending?.attemptKey).toBeTruthy();
  await flush();
  expect(await stored()).toHaveLength(1);
});

it('AUTHORITY_SET_ASIDE is unchanged: the passage stays, the matter link goes', async () => {
  createAnnotation.mockResolvedValue({
    ok: false,
    error: { code: 'AUTHORITY_SET_ASIDE', message: 'X has been set aside. You can still save the passage on its own.' },
  } as never);

  const result = await useReadingStore.getState().addHighlight(highlight({ matterId: 'm-1' }));

  const [kept, ...rest] = useReadingStore.getState().highlights;
  expect(rest).toHaveLength(0);
  expect(kept?.text).toBe('an exact excerpt');
  expect(kept?.matterId).toBeUndefined();
  expect(!result.ok && result.message).toBe(
    'X has been set aside. You can still save the passage on its own.',
  );
});

it('a retry after a deterministic refusal leaves exactly one highlight, not a twin', async () => {
  createAnnotation
    .mockResolvedValueOnce({ ok: false, error: { code: 'INVALID_REQUEST', message: 'quote: too long' } } as never)
    .mockResolvedValueOnce({ ok: true, data: { annotation: { annotationId: 'ann-2' } } } as never);

  await useReadingStore.getState().addHighlight(highlight());
  await useReadingStore.getState().addHighlight(highlight());

  const all = useReadingStore.getState().highlights;
  expect(all).toHaveLength(1);
  expect(all[0]?.annotationId).toBe('ann-2');
  // The refused attempt's key is not reused by the new intentional save.
  const [first, second] = createAnnotation.mock.calls.map((c) => c[2]);
  expect(first).not.toBe(second);
});

describe('the boundary guard', () => {
  it('refuses a 4,001-character quote before any tint or request — never shortened', async () => {
    const result = await useReadingStore
      .getState()
      .addHighlight(highlight({ text: 'a'.repeat(4001) }));

    expect(result).toEqual({ ok: false, message: 'Select up to 4,000 characters.' });
    expect(createAnnotation).not.toHaveBeenCalled();
    expect(useReadingStore.getState().highlights).toEqual([]);
  });

  it('refuses an empty quote the same way', async () => {
    await useReadingStore.getState().addHighlight(highlight({ text: '' }));

    expect(createAnnotation).not.toHaveBeenCalled();
    expect(useReadingStore.getState().highlights).toEqual([]);
  });

  it('sends a 4,000-character quote untouched', async () => {
    createAnnotation.mockResolvedValue({
      ok: true,
      data: { annotation: { annotationId: 'ann-3' } },
    } as never);
    const text = `${'b'.repeat(3998)}\n `;

    await useReadingStore.getState().addHighlight(highlight({ text }));

    expect(createAnnotation.mock.calls[0]?.[1].quote).toBe(text);
  });
});

/**
 * RCC R28B, found on the S24: six 5,458-character pending highlights persisted by
 * the PRE-R28 store (R27B's refused ¶2 saves) still tinted ¶2 after upgrade. The
 * rollback stops new ones; hydrate has to clear the ones already on the device.
 */
describe('hydrate drops persisted writes the server can never accept', () => {
  const persisted = (highlights: Highlight[]) =>
    AsyncStorage.setItem('lawmind.reading.v1', JSON.stringify({ progress: {}, highlights, textSize: 17 }));

  it('removes an unsendable pending highlight, keeps sendable pending and synced ones, and persists the clean list', async () => {
    const zombie = highlight({ text: 'z'.repeat(5458), attemptKey: 'mu3xjp0d-vkkjso69-npjfa7j5' });
    const pending = highlight({ paragraphIndex: 4, text: 'offline, not disproved', attemptKey: 'mu3xaaaa-bbbbbbbb-cccccccc' });
    const synced = highlight({ paragraphIndex: 3, text: 'synced', annotationId: 'ann-9' });
    await persisted([synced, zombie, pending, { ...zombie, attemptKey: 'mu3xl7kc-p344plph-izgof7bg' }]);

    await useReadingStore.getState().hydrate();

    const texts = useReadingStore.getState().highlights.map((h) => h.text);
    expect(texts).toEqual(['synced', 'offline, not disproved']);
    await flush();
    expect((await stored()).map((h) => h.text)).toEqual(['synced', 'offline, not disproved']);
    expect(createAnnotation).not.toHaveBeenCalled();
  });

  it('leaves storage untouched when nothing is unsendable', async () => {
    await persisted([highlight({ attemptKey: 'mu3xaaaa-bbbbbbbb-cccccccc' })]);
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear();

    await useReadingStore.getState().hydrate();

    expect(useReadingStore.getState().highlights).toHaveLength(1);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
