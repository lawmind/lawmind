import {
  ALREADY_SAVED_UNAVAILABLE_COPY,
  CORPUS_TARGET_UNAVAILABLE,
  CORPUS_UNAVAILABLE_COPY,
  saveAuthorityOutcome,
} from './saveAuthorityOutcome';
import type { AddAuthorityResponse, ApiResponse, MatterAuthorityUnavailable } from '../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SAVING AN AUTHORITY INTO A CORPUS RELEASE THAT DOES NOT CARRY IT — R17 §1.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The failure this exists to prevent is a SENTENCE, not a crash. The server's
 * absent-target message is *"no judgment with that id"*, four screens rendered
 * `r.error.message` verbatim, and an advocate reading a briefing ten minutes
 * before a hearing would have been told the authority they are relying on does
 * not exist — when what happened is that our index moved underneath them.
 *
 * So most of what is asserted here is what may NOT be said. A test that only
 * checked the happy shape would pass against a client that says exactly the
 * wrong thing.
 */

const UNAVAILABLE: MatterAuthorityUnavailable = {
  authorityId: 'auth_1',
  judgmentId: 'jud_1',
  addedBy: 'usr_1',
  addedAt: '2026-08-30T10:00:00.000Z',
  removedAt: null,
  availability: 'corpus_unavailable',
};

const fail = (code: string, message: string): ApiResponse<AddAuthorityResponse> => ({
  ok: false,
  error: { code, message },
});

/**
 * Every sentence the contract forbids on this surface, as one list. R17 §1: the
 * UI may say only that the authority was saved and is unavailable in the
 * selected corpus release. `corpus_unavailable` is also NOT `SOURCE_UNAVAILABLE`
 * — it may not read as an outage, because "we are having trouble" is a different
 * and false claim about a corpus generation that is working correctly.
 */
const FORBIDDEN = [
  /does not exist/i,
  /no such (case|judgment)/i,
  /not found/i,
  /no judgment with that id/i,
  /removed from the law/i,
  /unverified/i,
  /good law/i,
  /still (valid|law)/i,
  /(we are|we're) having trouble/i,
  /try again later/i,
  /(server|service) (error|unavailable)/i,
  /saved successfully/i,
];

function expectSayableCopy(message: string) {
  for (const forbidden of FORBIDDEN) {
    expect(message).not.toMatch(forbidden);
  }
  // And it must actually say the true thing, not merely avoid the false ones.
  expect(message).toMatch(/corpus release/i);
}

describe('saveAuthorityOutcome', () => {
  it('reports a plain save as saved', () => {
    const r: ApiResponse<AddAuthorityResponse> = {
      ok: true,
      data: { authority: { authorityId: 'auth_1' } as never },
    };
    expect(saveAuthorityOutcome(r)).toEqual({ kind: 'saved' });
  });

  /**
   * R17's idempotent `200 { unavailableAuthority }`. THIS IS NOT A FAILURE: the
   * row is already the advocate's, nothing mutated, and nothing is owed. A
   * client that read it as an error would offer a retry for work that is done.
   */
  it('reads the idempotent shell as an existing save, not a failure', () => {
    const outcome = saveAuthorityOutcome({ ok: true, data: { unavailableAuthority: UNAVAILABLE } });

    expect(outcome.kind).toBe('already_saved_unavailable');
    if (outcome.kind !== 'already_saved_unavailable') throw new Error('narrowing');
    expect(outcome.authority).toBe(UNAVAILABLE);
    expect(outcome.message).toBe(ALREADY_SAVED_UNAVAILABLE_COPY);
    expectSayableCopy(outcome.message);
  });

  it('reads the R17 refusal as corpus_unavailable, and never as retryable', () => {
    const outcome = saveAuthorityOutcome(
      fail(CORPUS_TARGET_UNAVAILABLE, 'that judgment is not in the selected corpus release'),
    );

    expect(outcome.kind).toBe('corpus_unavailable');
    if (outcome.kind !== 'corpus_unavailable') throw new Error('narrowing');
    expect(outcome.retryable).toBe(false);
    expect(outcome.message).toBe(CORPUS_UNAVAILABLE_COPY);
    expectSayableCopy(outcome.message);
  });

  /**
   * THE PRE-R27 WIRE, AND THE REASON THIS MODULE EXISTS TODAY RATHER THAN LATER.
   * `services/api/src/matters/authorities.ts:459` still answers an absent target
   * with `404 NOT_FOUND` "no judgment with that id" at `ab4b4989`, so the
   * forbidden sentence is on the wire now. It is folded into the same weaker,
   * true statement — which asserts neither that the judgment exists nor that it
   * does not, the only honest position from a client that cannot tell a bad id
   * from a moved corpus generation.
   */
  it('folds the legacy absent-target 404 into the same truthful state', () => {
    const outcome = saveAuthorityOutcome(fail('NOT_FOUND', 'no judgment with that id'));

    expect(outcome.kind).toBe('corpus_unavailable');
    if (outcome.kind !== 'corpus_unavailable') throw new Error('narrowing');
    expect(outcome.message).toBe(CORPUS_UNAVAILABLE_COPY);
    expectSayableCopy(outcome.message);
    // The forbidden sentence must not survive anywhere in what is rendered.
    expect(outcome.message).not.toContain('no judgment with that id');
  });

  /**
   * THE FOLD IS NARROW ON PURPOSE. The same route answers `NOT_FOUND` for a
   * matter this advocate does not own, and that message is true, actionable and
   * about something other than the law. Swallowing it would replace a correct
   * error with a corpus explanation that has nothing to do with what happened.
   */
  it('leaves a NOT_FOUND about the matter alone', () => {
    const outcome = saveAuthorityOutcome(fail('NOT_FOUND', 'no matter with that id'));

    expect(outcome).toEqual({ kind: 'refused', message: 'no matter with that id' });
  });

  /**
   * THE ONE REFUSAL LAWMIND MAKES DELIBERATELY. `set_aside` disables
   * add-to-matter and the server's 409 NAMES the judgment that replaced this
   * one — the only part an advocate can act on. Paraphrasing it here would drop
   * exactly that, so the message travels verbatim.
   */
  it('passes a deliberate refusal through in the server’s own words', () => {
    const message =
      'Ram v. State was set aside and cannot be added to a matter. See Shyam v. State (2024).';
    const outcome = saveAuthorityOutcome(fail('AUTHORITY_SET_ASIDE', message));

    expect(outcome).toEqual({ kind: 'refused', message });
    expect(outcome.kind === 'refused' && outcome.message).toContain('Shyam v. State (2024)');
  });

  it.each([
    ['NETWORK', 'the request could not be sent'],
    ['RATE_LIMITED', 'too many requests'],
    ['AUTH_REQUIRED', 'sign in to continue'],
  ])('passes an unrelated %s failure through untouched', (code, message) => {
    expect(saveAuthorityOutcome(fail(code, message))).toEqual({ kind: 'refused', message });
  });

  /**
   * NO FABRICATED AUTHORITY, ANYWHERE. The only outcome that carries an
   * authority object is the one the server actually sent one in, and it is the
   * SAME object — not a copy with fields filled in. A client that synthesised a
   * local row here would be showing a saved authority the server never
   * acknowledged.
   */
  it('never invents an authority object out of a refusal', () => {
    for (const outcome of [
      saveAuthorityOutcome(fail(CORPUS_TARGET_UNAVAILABLE, 'x')),
      saveAuthorityOutcome(fail('NOT_FOUND', 'no judgment with that id')),
      saveAuthorityOutcome(fail('BOOM', 'x')),
    ]) {
      expect(outcome).not.toHaveProperty('authority');
    }
  });
});
