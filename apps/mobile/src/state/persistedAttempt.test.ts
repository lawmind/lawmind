import AsyncStorage from '@react-native-async-storage/async-storage';

import { ATTEMPT_KEY_PATTERN } from '../api/attempt';
import { api } from '../api/client';
import { usePendingSave, type PendingSaveIntent } from './pendingSave';
import { useReadingStore, type Highlight } from './reading';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A KEY IS PERSISTED EXACTLY WHERE THE PAYLOAD ALREADY IS, AND NOWHERE ELSE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two flows hold a pending annotation across a process death: a highlight with
 * no `annotationId` in `reading.ts`, and a held save intent in `pendingSave.ts`.
 * Both already live in AsyncStorage, so both can be retried by a LATER LAUNCH —
 * and a key held only in memory would be a new key on that launch, executing a
 * second insert of a row that may already have committed. That is the exact case
 * `pendingSave.ts` used to name as the one it could not cover.
 *
 * THE OTHER FOUR CREATES GET NOTHING PERSISTED, and that is reported rather than
 * papered over. A matter, an event, a data request, a consent and a confirmation
 * have no cold-restart retry path at all — there is nothing for a persisted key
 * to be reused BY — so their keys live in a component ref for the lifetime of one
 * submit. `useAttempt`'s docstring says so, and this file asserts the boundary so
 * that "durable" is never claimed where it is not true.
 *
 * NO NEW SENSITIVE BODY REACHES STORAGE. Both records already persist their
 * quote; this adds an opaque 26-character identifier beside it. The citation-copy
 * outbox is NOT extended to client names, matter parties or court event notes.
 */

jest.mock('../api/client', () => ({
  api: {
    createAnnotation: jest.fn(),
    addAuthorityToMatter: jest.fn(),
    annotations: jest.fn(),
    deleteAnnotation: jest.fn(),
  },
}));

const createAnnotation = api.createAnnotation as jest.MockedFunction<typeof api.createAnnotation>;

const ANNOTATION: PendingSaveIntent = {
  kind: 'annotation',
  caseTitle: 'A v. B',
  judgmentId: 'jdg_1',
  paragraphIndex: 11,
  paragraphNumber: null,
  quote: 'The passage the advocate marked.',
};

const OK = {
  ok: true as const,
  data: {
    annotation: {
      annotationId: 'ann_1',
      judgmentId: 'jdg_1',
      matterId: 'mat_1',
      paragraphNumber: null,
      paragraphIndex: 11,
      quote: 'The passage the advocate marked.',
      note: null,
      createdAt: '2026-09-02T00:00:00.000Z',
    },
  },
};

const FAILED = { ok: false as const, error: { code: 'network', message: 'offline' } };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  usePendingSave.setState({ held: null, hydrated: false, running: false });
  useReadingStore.setState({ highlights: [], progress: {}, hydrated: false });
});

describe('pendingSave — the key rides on the persisted intent', () => {
  it('mints the key at CAPTURE, and persists it with the intent', async () => {
    usePendingSave.getState().capture(ANNOTATION);

    const key = usePendingSave.getState().held?.attemptKey;
    expect(key).toBeDefined();
    expect(ATTEMPT_KEY_PATTERN.test(key!)).toBe(true);

    const raw = await AsyncStorage.getItem('lawmind.pendingSave.v1');
    expect(JSON.parse(raw!).attemptKey).toBe(key);
  });

  it('sends the persisted key rather than a fresh one', async () => {
    createAnnotation.mockResolvedValue(OK as never);
    usePendingSave.getState().capture(ANNOTATION);
    const key = usePendingSave.getState().held!.attemptKey;

    await usePendingSave.getState().runFor('mat_1');

    expect(createAnnotation.mock.calls[0]![2]).toBe(key);
  });

  /**
   * A FAILED SAVE KEEPS EVERYTHING — the intent, and now the key. The retry on
   * `NewMatterScreen` is the same intentional save; a new key there would insert
   * a second row if the first request had actually committed.
   */
  it('a failed run keeps the key, and the retry presents the same one', async () => {
    createAnnotation.mockResolvedValueOnce(FAILED as never).mockResolvedValue(OK as never);
    usePendingSave.getState().capture(ANNOTATION);
    const key = usePendingSave.getState().held!.attemptKey;

    const first = await usePendingSave.getState().runFor('mat_1');
    expect(first).toEqual({ kind: 'failed', caseTitle: 'A v. B', message: 'offline' });
    expect(usePendingSave.getState().held?.attemptKey).toBe(key);

    await usePendingSave.getState().runFor('mat_1');
    expect(createAnnotation.mock.calls[1]![2]).toBe(key);
  });

  /**
   * THE COLD RESTART. This is the case an in-memory key cannot cover: the store
   * is rebuilt from disk and must present the key the first attempt used.
   */
  it('a cold hydrate reuses the ORIGINAL key', async () => {
    createAnnotation.mockResolvedValue(FAILED as never);
    usePendingSave.getState().capture(ANNOTATION);
    const key = usePendingSave.getState().held!.attemptKey;
    await usePendingSave.getState().runFor('mat_1');

    // The process dies. Nothing survives but AsyncStorage.
    usePendingSave.setState({ held: null, hydrated: false, running: false });
    await usePendingSave.getState().hydrate();

    expect(usePendingSave.getState().held?.attemptKey).toBe(key);

    createAnnotation.mockResolvedValue(OK as never);
    await usePendingSave.getState().runFor('mat_1');
    expect(createAnnotation.mock.calls[1]![2]).toBe(key);
  });

  /**
   * A NEW CAPTURE IS A NEW INTENTION — the advocate chose a different passage —
   * and gets a new key. `capture`'s latest-wins rule already meant exactly this;
   * the key now says so.
   */
  it('a new intent generates a NEW key', () => {
    usePendingSave.getState().capture(ANNOTATION);
    const first = usePendingSave.getState().held!.attemptKey;
    usePendingSave.getState().capture({ ...ANNOTATION, quote: 'A different passage.' });
    expect(usePendingSave.getState().held!.attemptKey).not.toBe(first);
  });

  /**
   * A RECORD WRITTEN BY A PRE-R16 BUILD IS STILL PERFORMED. Refusing to rehydrate
   * it because it has no key would lose an advocate's save to an app update. It
   * gains one on hydrate, and from that launch on its retries are duplicate-safe.
   */
  it('a pre-R16 record rehydrates and is given a key rather than dropped', async () => {
    await AsyncStorage.setItem(
      'lawmind.pendingSave.v1',
      JSON.stringify({ ...ANNOTATION, capturedAt: Date.now() }),
    );

    await usePendingSave.getState().hydrate();

    const held = usePendingSave.getState().held;
    expect(held).not.toBeNull();
    expect(ATTEMPT_KEY_PATTERN.test(held!.attemptKey)).toBe(true);
  });

  /**
   * THE KEY IS NOT THE LATCH, and both still work. `running` stops two requests
   * leaving the device at all; the key stops the second one mattering if it does.
   */
  it('the single-flight latch still collapses a concurrent second run', async () => {
    let release: (v: unknown) => void = () => {};
    createAnnotation.mockImplementation(
      () => new Promise((r) => (release = r)) as never,
    );
    usePendingSave.getState().capture(ANNOTATION);

    const a = usePendingSave.getState().runFor('mat_1');
    const b = usePendingSave.getState().runFor('mat_1');

    expect(await b).toBeNull();
    release(OK);
    await a;
    expect(createAnnotation).toHaveBeenCalledTimes(1);
  });
});

describe('reading — the key rides on the persisted highlight', () => {
  const highlight = (over: Partial<Highlight> = {}): Highlight => ({
    judgmentId: 'jdg_1',
    paragraphIndex: 3,
    paragraphNumber: null,
    text: 'A passage from an unnumbered scan.',
    savedAt: '2026-09-02T00:00:00.000Z',
    ...over,
  });

  it('mints and persists a key with the highlight, and sends that one', async () => {
    createAnnotation.mockResolvedValue(FAILED as never);

    await useReadingStore.getState().addHighlight(highlight());

    const held = useReadingStore.getState().highlights[0]!;
    expect(ATTEMPT_KEY_PATTERN.test(held.attemptKey!)).toBe(true);
    expect(createAnnotation.mock.calls[0]![2]).toBe(held.attemptKey);

    const raw = await AsyncStorage.getItem('lawmind.reading.v1');
    expect(JSON.parse(raw!).highlights[0].attemptKey).toBe(held.attemptKey);
  });

  /**
   * A HIGHLIGHT ARRIVING HERE A SECOND TIME — a retry, or one rehydrated from
   * disk — is the SAME intentional annotation and presents the SAME key. A fresh
   * key on a retry is how one passage becomes two permanent rows.
   */
  it('a retry of the same highlight reuses its key rather than minting one', async () => {
    createAnnotation.mockResolvedValue(FAILED as never);
    await useReadingStore.getState().addHighlight(highlight());
    const key = useReadingStore.getState().highlights[0]!.attemptKey;

    // A later launch: the store is rebuilt from disk and the pending write retried.
    useReadingStore.setState({ highlights: [], hydrated: false });
    await useReadingStore.getState().hydrate();
    const rehydrated = useReadingStore.getState().highlights[0]!;
    expect(rehydrated.attemptKey).toBe(key);

    await useReadingStore.getState().addHighlight(rehydrated);
    expect(createAnnotation.mock.calls[1]![2]).toBe(key);
  });

  /**
   * THE KEY IS DROPPED THE MOMENT THE WRITE IS DURABLE. A key kept past its own
   * mutation can only earn a `409 IDEMPOTENCY_KEY_REUSE_MISMATCH` later.
   */
  it('drops the key once the server returns an annotationId', async () => {
    createAnnotation.mockResolvedValue(OK as never);

    await useReadingStore.getState().addHighlight(highlight());

    const saved = useReadingStore.getState().highlights[0]!;
    expect(saved.annotationId).toBe('ann_1');
    expect(saved.attemptKey).toBeUndefined();
  });

  /**
   * AND ON ADOPTION TOO. `syncAnnotations` population 2 is a pending write that
   * actually landed and whose response we never saw — the row exists, so nothing
   * should ever replay that key.
   */
  it('drops the key when a pending write is adopted from the server', async () => {
    createAnnotation.mockResolvedValue(FAILED as never);
    await useReadingStore.getState().addHighlight(highlight());
    expect(useReadingStore.getState().highlights[0]!.attemptKey).toBeDefined();

    (api.annotations as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        annotations: [
          {
            annotationId: 'ann_1',
            judgmentId: 'jdg_1',
            matterId: null,
            paragraphNumber: null,
            paragraphIndex: 3,
            quote: 'A passage from an unnumbered scan.',
            note: null,
            createdAt: '2026-09-02T00:00:00.000Z',
          },
        ],
      },
    });

    await useReadingStore.getState().syncAnnotations('jdg_1');

    const adopted = useReadingStore.getState().highlights[0]!;
    expect(adopted.annotationId).toBe('ann_1');
    expect(adopted.attemptKey).toBeUndefined();
  });

  /**
   * A SECOND, DELIBERATE HIGHLIGHT OF THE SAME PASSAGE IS A SECOND ROW. The
   * server never deduplicates by content and nothing here does either.
   */
  it('a genuinely new highlight gets a new key', async () => {
    createAnnotation.mockResolvedValue(FAILED as never);
    await useReadingStore.getState().addHighlight(highlight());
    await useReadingStore.getState().addHighlight(highlight({ savedAt: 'later' }));

    const [a, b] = useReadingStore.getState().highlights;
    expect(a!.attemptKey).not.toBe(b!.attemptKey);
  });
});
