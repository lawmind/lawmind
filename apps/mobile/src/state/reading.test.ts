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
  api: { createAnnotation: jest.fn() },
}));

const createAnnotation = api.createAnnotation as jest.MockedFunction<typeof api.createAnnotation>;

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
