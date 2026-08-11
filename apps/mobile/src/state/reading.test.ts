import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '../api/client';
import { useReadingStore, type Highlight } from './reading';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HIGHLIGHT ITSELF SURVIVES EVERYTHING. ONLY THE MATTER LINK CAN BE REFUSED.
 *
 * `services/api/src/judgments/annotations.ts`'s own module note: saving a
 * passage without a matter is always allowed, even against a `set_aside`
 * judgment — only ATTACHING it as an authority can be refused. The properties
 * under test are what that refusal actually does to local state:
 *   1. a plain save (no matterId) always lands, online or not;
 *   2. AUTHORITY_SET_ASIDE strips the matterId but keeps the highlight;
 *   3. any other failure (offline, timeout) changes nothing locally — a
 *      highlight that has not synced yet is not a highlight that was wrong.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('../api/client', () => ({
  api: { createAnnotation: jest.fn(), annotations: jest.fn() },
}));

const createAnnotation = api.createAnnotation as jest.MockedFunction<typeof api.createAnnotation>;
const listAnnotations = api.annotations as jest.MockedFunction<typeof api.annotations>;

const highlight = (over: Partial<Highlight> = {}): Highlight => ({
  judgmentId: 'j-1',
  paragraphIndex: 10,
  paragraphNumber: 11,
  text: 'Omnibus allegations against a husband’s relatives...',
  savedAt: new Date().toISOString(),
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useReadingStore.setState({ progress: {}, highlights: [], hydrated: false });
  createAnnotation.mockReset();
  listAnnotations.mockReset();
});

it('writes locally before the server call resolves', async () => {
  createAnnotation.mockImplementation(
    () => new Promise(() => {}) // never resolves — offline
  );

  void useReadingStore.getState().addHighlight(highlight());

  // Synchronous: the write does not wait on the network.
  expect(useReadingStore.getState().highlights).toHaveLength(1);
});

it('stamps the annotationId once the server confirms', async () => {
  createAnnotation.mockResolvedValue({
    ok: true,
    data: { annotation: { annotationId: 'ann-1' } },
  } as never);

  await useReadingStore.getState().addHighlight(highlight());

  expect(useReadingStore.getState().highlights[0]?.annotationId).toBe('ann-1');
});

it('AUTHORITY_SET_ASIDE strips the matter link but keeps the highlight', async () => {
  createAnnotation.mockResolvedValue({
    ok: false,
    error: { code: 'AUTHORITY_SET_ASIDE', message: 'This judgment has been set aside.' },
  } as never);

  const result = await useReadingStore.getState().addHighlight(highlight({ matterId: 'matter-1' }));

  expect(result).toEqual({ ok: false, message: 'This judgment has been set aside.' });
  const saved = useReadingStore.getState().highlights[0];
  expect(saved?.matterId).toBeUndefined();
  expect(saved?.text).toBe(highlight().text);
});

it('a plain save with no matterId is unaffected by AUTHORITY_SET_ASIDE', async () => {
  createAnnotation.mockResolvedValue({
    ok: false,
    error: { code: 'AUTHORITY_SET_ASIDE', message: 'This judgment has been set aside.' },
  } as never);

  await useReadingStore.getState().addHighlight(highlight());

  // No matterId was ever set, so there is nothing to strip — the server
  // should not even be able to reach this branch, but the store must not
  // misfire on it either.
  expect(useReadingStore.getState().highlights[0]?.matterId).toBeUndefined();
});

it('a network failure leaves the local highlight, matterId included, exactly as saved', async () => {
  createAnnotation.mockResolvedValue({
    ok: false,
    error: { code: 'NETWORK', message: 'Could not reach the API.' },
  } as never);

  await useReadingStore.getState().addHighlight(highlight({ matterId: 'matter-1' }));

  // Not synced yet is not the same as wrong — the matter link was a real
  // choice and a network blip must not silently undo it.
  expect(useReadingStore.getState().highlights[0]?.matterId).toBe('matter-1');
});

it('survives a restart — highlights are on the device, not in memory', async () => {
  createAnnotation.mockResolvedValue({
    ok: false,
    error: { code: 'NETWORK', message: 'offline' },
  } as never);

  await useReadingStore.getState().addHighlight(highlight({ judgmentId: 'j-restart' }));

  useReadingStore.setState({ progress: {}, highlights: [], hydrated: false });
  await useReadingStore.getState().hydrate();

  expect(useReadingStore.getState().highlights).toHaveLength(1);
  expect(useReadingStore.getState().highlights[0]?.judgmentId).toBe('j-restart');
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AN UNNUMBERED JUDGMENT'S PASSAGES ARE SAVEABLE — corrected 11 August 2026.
 *
 * `Highlight.paragraphNumber` was typed `number`, and `ReadingView.saveHighlight`
 * opened with `if (paragraph.paragraphNumber === null) return;` — a SILENT
 * no-op. An advocate reading a pre-1990s scan, or a headnote, tapped save and
 * nothing happened: no toast, no reason, indistinguishable from a broken
 * button.
 *
 * `annotationBody` in `services/api/src/judgments/annotations.ts` types the
 * field `.nullable()` and says why — "Null on an unnumbered judgment." The
 * server has always accepted the write. Only the client refused to make it,
 * and it refused it for exactly the judgments that also carry no citation.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('a passage with no paragraph number', () => {
  it('sends the null through rather than refusing to save', async () => {
    createAnnotation.mockResolvedValue({
      ok: true,
      data: {
        annotation: {
          annotationId: 'ann-1',
          judgmentId: 'j-1',
          matterId: null,
          paragraphNumber: null,
          paragraphIndex: 3,
          quote: 'A passage from an unnumbered scan.',
          note: null,
          createdAt: '2026-08-11T00:00:00.000Z',
        },
      },
    });

    const result = await useReadingStore.getState().addHighlight(
      highlight({ paragraphNumber: null, paragraphIndex: 3, text: 'A passage from an unnumbered scan.' })
    );

    expect(result.ok).toBe(true);
    expect(createAnnotation).toHaveBeenCalledWith('j-1', {
      paragraphNumber: null,
      paragraphIndex: 3,
      quote: 'A passage from an unnumbered scan.',
      matterId: undefined,
    });
  });

  it('keeps it locally, with its server id, exactly as a numbered one', async () => {
    createAnnotation.mockResolvedValue({
      ok: true,
      data: {
        annotation: {
          annotationId: 'ann-2',
          judgmentId: 'j-1',
          matterId: null,
          paragraphNumber: null,
          paragraphIndex: 3,
          quote: 'A passage from an unnumbered scan.',
          note: null,
          createdAt: '2026-08-11T00:00:00.000Z',
        },
      },
    });

    await useReadingStore.getState().addHighlight(highlight({ paragraphNumber: null, paragraphIndex: 3 }));

    const saved = useReadingStore.getState().highlights;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.paragraphNumber).toBeNull();
    expect(saved[0]?.annotationId).toBe('ann-2');
  });

  /**
   * THE INDEX IS THE IDENTITY WHEN THERE IS NO NUMBER. Two passages from the
   * same unnumbered judgment are two highlights, not one — which is why
   * `ReadingView` keys its highlighted Set on `paragraphIndex` and why the
   * server stores both fields.
   */
  it('keeps two unnumbered passages apart, since both numbers are null', async () => {
    createAnnotation.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'offline' },
    });

    await useReadingStore.getState().addHighlight(highlight({ paragraphNumber: null, paragraphIndex: 3 }));
    await useReadingStore.getState().addHighlight(highlight({ paragraphNumber: null, paragraphIndex: 9 }));

    const indices = useReadingStore.getState().highlights.map((h) => h.paragraphIndex);
    expect(indices).toEqual([3, 9]);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * READING HIGHLIGHTS BACK FROM THE SERVER — `GET /judgments/:id/annotations`.
 *
 * The route has existed as long as the write, and nothing called it until
 * 11 August 2026. Highlights were device-local in practice: an advocate who
 * reinstalled, changed phone or cleared the app opened a judgment they had
 * marked and saw none of it, while the server held every passage. The write
 * synced; the read did not exist.
 *
 * MERGE, NEVER REPLACE, is the whole difficulty. Three populations meet, and
 * getting any one of them wrong loses an advocate's work:
 *   1. a local highlight with no server id is a PENDING WRITE and must survive;
 *   2. a local highlight matching a server row must ADOPT its id, not double;
 *   3. a server row with no local match must JOIN the list.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const annotation = (over: Partial<{
  annotationId: string;
  judgmentId: string;
  matterId: string | null;
  paragraphNumber: number | null;
  paragraphIndex: number;
  quote: string;
  note: string | null;
  createdAt: string;
}> = {}) => ({
  annotationId: 'ann-server',
  judgmentId: 'j-1',
  matterId: null,
  paragraphNumber: 11,
  paragraphIndex: 10,
  quote: 'Omnibus allegations against a husband’s relatives...',
  note: null,
  createdAt: '2026-08-11T00:00:00.000Z',
  ...over,
});

describe('pulling highlights back from the server', () => {
  it('brings in a highlight made on another device', async () => {
    listAnnotations.mockResolvedValue({
      ok: true,
      data: { annotations: [annotation({ paragraphIndex: 4, quote: 'From another phone.' })] },
    });

    await useReadingStore.getState().syncAnnotations('j-1');

    const saved = useReadingStore.getState().highlights;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.text).toBe('From another phone.');
    expect(saved[0]?.annotationId).toBe('ann-server');
  });

  /** The one outcome this store exists to prevent. */
  it('never deletes a highlight that has not reached the server yet', async () => {
    createAnnotation.mockImplementation(() => new Promise(() => {}));
    void useReadingStore.getState().addHighlight(
      highlight({ paragraphIndex: 99, text: 'Saved in a corridor with no signal.' })
    );

    listAnnotations.mockResolvedValue({ ok: true, data: { annotations: [] } });
    await useReadingStore.getState().syncAnnotations('j-1');

    const saved = useReadingStore.getState().highlights;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.text).toBe('Saved in a corridor with no signal.');
    expect(saved[0]?.annotationId).toBeUndefined();
  });

  /**
   * A pending write that actually landed, whose response we never saw, is
   * otherwise indistinguishable from a second highlight of the same words.
   */
  it('adopts the server id instead of showing the passage twice', async () => {
    createAnnotation.mockImplementation(() => new Promise(() => {}));
    void useReadingStore.getState().addHighlight(highlight());

    listAnnotations.mockResolvedValue({ ok: true, data: { annotations: [annotation()] } });
    await useReadingStore.getState().syncAnnotations('j-1');

    const saved = useReadingStore.getState().highlights;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.annotationId).toBe('ann-server');
  });

  /**
   * Matched on index + quote, never on the printed number — it is null on
   * every paragraph of an unnumbered judgment, so matching on it would fold
   * all of them into one.
   */
  it('keeps two unnumbered passages apart when merging', async () => {
    listAnnotations.mockResolvedValue({
      ok: true,
      data: {
        annotations: [
          annotation({ annotationId: 'a', paragraphNumber: null, paragraphIndex: 2, quote: 'One.' }),
          annotation({ annotationId: 'b', paragraphNumber: null, paragraphIndex: 5, quote: 'Two.' }),
        ],
      },
    });

    await useReadingStore.getState().syncAnnotations('j-1');

    expect(useReadingStore.getState().highlights.map((h) => h.annotationId)).toEqual(['a', 'b']);
  });

  it('leaves another judgment’s highlights alone', async () => {
    createAnnotation.mockImplementation(() => new Promise(() => {}));
    void useReadingStore.getState().addHighlight(highlight({ judgmentId: 'j-2' }));

    listAnnotations.mockResolvedValue({ ok: true, data: { annotations: [] } });
    await useReadingStore.getState().syncAnnotations('j-1');

    expect(useReadingStore.getState().highlights).toHaveLength(1);
  });

  /** Offline is the design case. A stale screen beats an empty one. */
  it('changes nothing when the fetch fails', async () => {
    createAnnotation.mockImplementation(() => new Promise(() => {}));
    void useReadingStore.getState().addHighlight(highlight());

    listAnnotations.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'offline' },
    });
    await useReadingStore.getState().syncAnnotations('j-1');

    expect(useReadingStore.getState().highlights).toHaveLength(1);
  });
});
