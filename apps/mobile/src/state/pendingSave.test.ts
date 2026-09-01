import { api } from '../api/client';
import { PENDING_WINDOW_MS, usePendingSave, type PendingSaveIntent } from './pendingSave';

/*
  NO LOCAL AsyncStorage MOCK. `jest/async-storage.js` already provides one for
  the whole suite, and a local factory that returns a bare object has no DEFAULT
  export — so `import AsyncStorage from …` resolves to undefined, every write
  throws inside a floating promise nobody awaits, and the REST of the file fails
  on queries that have nothing to do with storage. That is how three unrelated
  assertions here failed while the code under test was correct.
*/
jest.mock('../api/client', () => ({
  api: { addAuthorityToMatter: jest.fn(), createAnnotation: jest.fn() },
}));

const addAuthority = api.addAuthorityToMatter as jest.MockedFunction<typeof api.addAuthorityToMatter>;
const createAnnotation = api.createAnnotation as jest.MockedFunction<typeof api.createAnnotation>;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CREATE, THEN SAVE — NEW3 R16 §8 `A. CREATE_THEN_AUTO_SAVE_PENDING_AUTHORITY`.
 *
 * The five acceptance criteria in that section, each pinned:
 *   1 the intent is retained across matter creation
 *   2 it is performed exactly once against the new matter
 *   3 it is cleared only on success or explicit cancellation
 *   4 duplicate submits, re-entry and retry make no duplicate record
 *   5 failure is visible and never claims the save happened
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AUTHORITY: PendingSaveIntent = {
  kind: 'authority',
  judgmentId: 'jdg_1',
  caseTitle: 'Mock Bench v. Mock State',
  citationCheckId: 'chk_1',
};

const ANNOTATION: PendingSaveIntent = {
  kind: 'annotation',
  judgmentId: 'jdg_1',
  caseTitle: 'Mock Bench v. Mock State',
  paragraphIndex: 11,
  paragraphNumber: null,
  quote: 'The passage the advocate marked.',
};

const OK_AUTHORITY = { ok: true as const, data: { authority: {} as never } };
const OK_ANNOTATION = { ok: true as const, data: { annotation: { annotationId: 'ann_1' } as never } };

beforeEach(() => {
  addAuthority.mockReset();
  createAnnotation.mockReset();
  usePendingSave.setState({ held: null, hydrated: true, running: false });
});

describe('holding the intent', () => {
  it('performs an authority save against the new matter, with its check id', async () => {
    addAuthority.mockResolvedValue(OK_AUTHORITY);
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave.getState().runFor('mat_new');

    expect(addAuthority).toHaveBeenCalledWith({
      matterId: 'mat_new',
      judgmentId: 'jdg_1',
      citationCheckId: 'chk_1',
    });
    expect(result).toEqual({ kind: 'saved', caseTitle: 'Mock Bench v. Mock State' });
  });

  /**
   * BOTH PARAGRAPH FIELDS TRAVEL, and the null one is a real value. An
   * unnumbered judgment has nothing to cite; substituting the index would put a
   * fabricated paragraph number into an advocate's note.
   */
  it('performs an annotation save with the exact passage identity', async () => {
    createAnnotation.mockResolvedValue(OK_ANNOTATION);
    usePendingSave.getState().capture(ANNOTATION);

    await usePendingSave.getState().runFor('mat_new');

    expect(createAnnotation).toHaveBeenCalledWith('jdg_1', {
      paragraphNumber: null,
      paragraphIndex: 11,
      quote: 'The passage the advocate marked.',
      matterId: 'mat_new',
    });
  });

  it('does nothing, and says nothing, when no intent is held', async () => {
    expect(await usePendingSave.getState().runFor('mat_new')).toBeNull();
    expect(addAuthority).not.toHaveBeenCalled();
  });

  /** A newer intent replaces an older one — it is the passage they mean now. */
  it('holds the most recent intent', () => {
    usePendingSave.getState().capture(AUTHORITY);
    usePendingSave.getState().capture(ANNOTATION);

    expect(usePendingSave.getState().held?.kind).toBe('annotation');
  });
});

describe('clearing the intent', () => {
  it('clears it on success', async () => {
    addAuthority.mockResolvedValue(OK_AUTHORITY);
    usePendingSave.getState().capture(AUTHORITY);

    await usePendingSave.getState().runFor('mat_new');

    expect(usePendingSave.getState().held).toBeNull();
  });

  /**
   * AND KEEPS IT ON FAILURE. The matter exists and the save does not; dropping
   * the intent here would turn a visible partial into a silent loss, which is
   * the defect this store was written to end.
   */
  it('keeps it on failure so a retry has something to save', async () => {
    addAuthority.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'offline' },
    });
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave.getState().runFor('mat_new');

    expect(result).toEqual({
      kind: 'failed',
      caseTitle: 'Mock Bench v. Mock State',
      message: 'offline',
    });
    expect(usePendingSave.getState().held).not.toBeNull();
  });

  /**
   * THE SET-ASIDE REFUSAL. The server's message names the judgment that replaced
   * this one, which is the actionable half — it travels verbatim rather than
   * being reworded into a generic failure.
   */
  it('passes a set-aside refusal through in the server’s own words', async () => {
    addAuthority.mockResolvedValue({
      ok: false,
      error: {
        code: 'AUTHORITY_SET_ASIDE',
        message: 'Set aside in Mock Later Bench (2020). Cite that instead.',
      },
    });
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave.getState().runFor('mat_new');

    expect(result).toMatchObject({ kind: 'failed', message: expect.stringContaining('Mock Later Bench') });
  });

  it('clears it when the advocate abandons it explicitly', () => {
    usePendingSave.getState().capture(AUTHORITY);
    usePendingSave.getState().clear();

    expect(usePendingSave.getState().held).toBeNull();
  });

  /**
   * AN INTENT CAPTURED YESTERDAY IS NOT AN INTENT. Silently attaching last
   * week's authority to a matter created today is worse than losing it, so an
   * expired intent is abandoned rather than performed.
   */
  it('abandons an expired intent instead of performing it', async () => {
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave
      .getState()
      .runFor('mat_new', Date.now() + PENDING_WINDOW_MS + 1);

    expect(result).toBeNull();
    expect(addAuthority).not.toHaveBeenCalled();
    expect(usePendingSave.getState().held).toBeNull();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DUPLICATES — criterion 4, and the two halves have DIFFERENT guarantees.
 *
 * An authority save is idempotent at the SERVER (200 when already saved, 201
 * when new). An annotation save is not: `annotations.ts` runs a bare INSERT
 * with no ON CONFLICT, so a second request makes a second row and the only
 * protection is this store's single-flight latch.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('duplicate prevention', () => {
  /** A double tap: two runs launched before either resolves. */
  it('makes exactly one annotation request from two concurrent runs', async () => {
    let release: (v: unknown) => void = () => {};
    createAnnotation.mockImplementation(
      () => new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    usePendingSave.getState().capture(ANNOTATION);

    const first = usePendingSave.getState().runFor('mat_new');
    const second = usePendingSave.getState().runFor('mat_new');

    // The second is refused by the latch and resolves immediately with null.
    expect(await second).toBeNull();
    release(OK_ANNOTATION);
    await first;

    expect(createAnnotation).toHaveBeenCalledTimes(1);
  });

  /**
   * RE-ENTRY AFTER SUCCESS. Coming back to the screen and running again must do
   * nothing at all — the intent was consumed, so there is nothing to repeat.
   */
  it('does nothing on a second run after a successful one', async () => {
    addAuthority.mockResolvedValue(OK_AUTHORITY);
    usePendingSave.getState().capture(AUTHORITY);

    await usePendingSave.getState().runFor('mat_new');
    const again = await usePendingSave.getState().runFor('mat_new');

    expect(again).toBeNull();
    expect(addAuthority).toHaveBeenCalledTimes(1);
  });

  /**
   * RETRY AFTER FAILURE DOES re-request, and must — the first one did not land.
   * For an authority that is free, because the server is idempotent; the client
   * does not second-guess it by suppressing the retry.
   */
  it('retries once after a failure and succeeds', async () => {
    addAuthority
      .mockResolvedValueOnce({ ok: false, error: { code: 'network', message: 'offline' } })
      .mockResolvedValueOnce(OK_AUTHORITY);
    usePendingSave.getState().capture(AUTHORITY);

    expect(await usePendingSave.getState().runFor('mat_new')).toMatchObject({ kind: 'failed' });
    expect(await usePendingSave.getState().runFor('mat_new')).toMatchObject({ kind: 'saved' });

    expect(addAuthority).toHaveBeenCalledTimes(2);
    expect(usePendingSave.getState().held).toBeNull();
  });

  /** The latch releases even when the request throws, or one failure jams it forever. */
  it('releases the latch after a failed run', async () => {
    addAuthority.mockResolvedValue({ ok: false, error: { code: 'network', message: 'offline' } });
    usePendingSave.getState().capture(AUTHORITY);

    await usePendingSave.getState().runFor('mat_new');

    expect(usePendingSave.getState().running).toBe(false);
  });
});
