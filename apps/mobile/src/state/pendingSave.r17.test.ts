import { api } from '../api/client';
import { CORPUS_UNAVAILABLE_COPY } from '../citation/saveAuthorityOutcome';
import { usePendingSave, type PendingSaveIntent } from './pendingSave';

/*
  Same reasoning as `pendingSave.test.ts`: no local AsyncStorage mock, because
  `jest/async-storage.js` already provides one for the whole suite and a local
  factory without a default export makes every persist throw inside a floating
  promise.
*/
jest.mock('../api/client', () => ({
  api: { addAuthorityToMatter: jest.fn(), createAnnotation: jest.fn() },
}));

const addAuthority = api.addAuthorityToMatter as jest.MockedFunction<
  typeof api.addAuthorityToMatter
>;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HELD SAVE MEETS A CORPUS RELEASE THAT DOES NOT CARRY ITS TARGET — R17 §1.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This store is the one place a save happens WITHOUT the advocate watching it:
 * they tapped save, had no matter, filled in a form, and the save is performed
 * for them against the matter that form made. So it is also the one place where
 * a wrong answer is least likely to be noticed — a fabricated success here reads
 * as "it worked" and the authority is simply not in the matter.
 *
 * Three things are pinned:
 *   · the R17 refusal never claims a save, and never offers a retry that cannot
 *     succeed
 *   · the intent stays HELD, so a later corpus generation costs the advocate
 *     nothing to redo
 *   · the idempotent shell is an EXISTING save and is treated as one
 */

const AUTHORITY: PendingSaveIntent = {
  kind: 'authority',
  judgmentId: 'jdg_gone',
  caseTitle: 'Mock Bench v. Mock State',
  citationCheckId: 'chk_1',
};

beforeEach(() => {
  addAuthority.mockReset();
  usePendingSave.setState({ held: null, hydrated: true, running: false });
});

describe('a held authority whose target the corpus release does not carry', () => {
  it('reports corpus_unavailable rather than a save, and holds the intent', async () => {
    addAuthority.mockResolvedValue({
      ok: false,
      error: { code: 'CORPUS_TARGET_UNAVAILABLE', message: 'not in the selected corpus release' },
    });
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave.getState().runFor('mat_new');

    expect(result).toEqual({
      kind: 'corpus_unavailable',
      caseTitle: 'Mock Bench v. Mock State',
      message: CORPUS_UNAVAILABLE_COPY,
    });
    // NOT consumed. A later generation makes it savable with nothing to redo,
    // and dropping it here would be the silent loss this store exists to end.
    expect(usePendingSave.getState().held?.judgmentId).toBe('jdg_gone');
  });

  /**
   * THE FABRICATION THIS FILE IS REALLY FOR. `kind: 'saved'` is what
   * `NewMatterScreen` reads to navigate away as though the authority is in the
   * matter. If a corpus refusal ever produced it, the advocate would be told
   * their authority was saved and it would not be there.
   */
  it('never reports a save the server refused', async () => {
    addAuthority.mockResolvedValue({
      ok: false,
      error: { code: 'CORPUS_TARGET_UNAVAILABLE', message: 'x' },
    });
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave.getState().runFor('mat_new');

    expect(result?.kind).not.toBe('saved');
  });

  /** The same, for the wire the server actually sends at `ab4b4989`. */
  it('does not repeat the server’s absent-target sentence to the advocate', async () => {
    addAuthority.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'no judgment with that id' },
    });
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave.getState().runFor('mat_new');

    expect(result?.kind).toBe('corpus_unavailable');
    if (!result || result.kind === 'saved') throw new Error('narrowing');
    expect(result.message).not.toMatch(/no judgment with that id/i);
    expect(result.message).not.toMatch(/does not exist|not found/i);
    expect(result.message).toMatch(/corpus release/i);
  });

  /**
   * R17's `200 { unavailableAuthority }`: this exact row is ALREADY saved and
   * the pinned generation does not resolve its target. The advocate's save is
   * satisfied, so the intent is consumed and the result is a save — the one
   * thing that must NOT happen is holding an intent forever for work that is
   * already done.
   */
  it('treats the idempotent shell as the existing save it is', async () => {
    addAuthority.mockResolvedValue({
      ok: true,
      data: {
        unavailableAuthority: {
          authorityId: 'auth_1',
          judgmentId: 'jdg_gone',
          addedBy: 'usr_1',
          addedAt: '2026-08-30T10:00:00.000Z',
          removedAt: null,
          availability: 'corpus_unavailable',
        },
      },
    });
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave.getState().runFor('mat_new');

    expect(result).toEqual({ kind: 'saved', caseTitle: 'Mock Bench v. Mock State' });
    expect(usePendingSave.getState().held).toBeNull();
  });

  /**
   * ONE REQUEST. R17 marks this state non-retryable until the corpus changes,
   * so the store must not loop on it — and it must not mint a second attempt
   * key, which would be a second intentional mutation under R16's rules.
   */
  it('makes exactly one request and does not retry itself', async () => {
    addAuthority.mockResolvedValue({
      ok: false,
      error: { code: 'CORPUS_TARGET_UNAVAILABLE', message: 'x' },
    });
    usePendingSave.getState().capture(AUTHORITY);

    await usePendingSave.getState().runFor('mat_new');

    expect(addAuthority).toHaveBeenCalledTimes(1);
  });

  /**
   * A DELIBERATE REFUSAL IS STILL RETRYABLE AND STILL VERBATIM. Widening the
   * corpus branch to swallow every failure would have removed the `set_aside`
   * message, which names the replacement judgment.
   */
  it('leaves an ordinary refusal as a retryable failure in the server’s words', async () => {
    const message = 'Ram v. State was set aside. See Shyam v. State (2024).';
    addAuthority.mockResolvedValue({ ok: false, error: { code: 'AUTHORITY_SET_ASIDE', message } });
    usePendingSave.getState().capture(AUTHORITY);

    const result = await usePendingSave.getState().runFor('mat_new');

    expect(result).toEqual({ kind: 'failed', caseTitle: 'Mock Bench v. Mock State', message });
    expect(usePendingSave.getState().held?.judgmentId).toBe('jdg_gone');
  });
});
