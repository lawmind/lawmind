import type { AddAuthorityResponse, ApiResponse, MatterAuthorityUnavailable } from '../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT SAVING AN AUTHORITY ACTUALLY DID — R17 §1 write, one place, four states.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every one of the four call sites that saves an authority — `JudgmentScreen`,
 * `SearchScreen`, `BriefingScreen`, `state/pendingSave.ts` — did the same thing
 * with a failure: rendered `r.error.message` verbatim. That is right for the one
 * refusal Lawmind makes deliberately (a `set_aside` 409 NAMES the replacement
 * judgment, and rephrasing it would drop the actionable half) and it is wrong
 * for the corpus states, because the server's absent-target sentence is
 * *"no judgment with that id"*.
 *
 * THAT SENTENCE IS A LEGAL CLAIM AND IT IS NOT OURS TO MAKE. The truth is that
 * the corpus release this request was pinned to does not carry the target. The
 * judgment may exist, may be good law, and may come back on the next generation
 * — R17 §1 requires exactly that the same saved row returns hydrated with no
 * user-data write. Telling an advocate mid-hearing that the authority they are
 * relying on does not exist, when what happened is that our index moved, is the
 * kind of thing that ends the licence to be in their hand at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOUR OUTCOMES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   `saved`                     the row exists and its target resolves.
 *   `already_saved_unavailable` R17's idempotent `200 { unavailableAuthority }`.
 *                               THIS IS NOT A FAILURE. The advocate's save is
 *                               already satisfied; a corpus generation moved
 *                               under it. Nothing mutated and nothing is owed.
 *   `corpus_unavailable`        R17's `409 CORPUS_TARGET_UNAVAILABLE`. Nothing
 *                               was written. Not retryable by us — see below.
 *   `refused`                   everything else, and the server's own words.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE LEGACY 404 IS FOLDED INTO `corpus_unavailable`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * At `ab4b4989` the write half of R17 is not implemented — NEW3 adjudicated it
 * to LCC (bus 1728 §3) and it is honest incompleteness, not a claim anyone made.
 * `services/api/src/matters/authorities.ts:459` still answers an absent target
 * with `404 NOT_FOUND` *"no judgment with that id"*. So the forbidden sentence
 * is on the wire TODAY, and a client that passes it through prints it TODAY.
 *
 * The fold is narrow on purpose: `NOT_FOUND` whose message mentions a JUDGMENT.
 * The same route answers `NOT_FOUND` *"no matter with that id"* for a matter
 * this advocate does not own, and that one is true, actionable, and passes
 * through untouched.
 *
 * IT IS THE WEAKER STATEMENT, WHICH IS WHY IT IS SAFE. From the client, a
 * genuinely bad `judgmentId` and a target this release does not carry are
 * indistinguishable — so we say the thing that is true in both cases and
 * assert neither the existence nor the non-existence of a judgment. When LCC
 * R27 lands the 409, this branch stops firing and nothing on screen changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SaveAuthorityOutcome =
  | { kind: 'saved' }
  | { kind: 'already_saved_unavailable'; authority: MatterAuthorityUnavailable; message: string }
  /**
   * `retryable` IS DERIVED HERE, NOT READ OFF THE WIRE. NEW3 bus 1746: no
   * retryability field and no availability field is defined on the 409, and
   * inventing one would be inventing a contract. This is a constant `false`
   * that this client concludes from what the state MEANS — the pinned corpus
   * generation does not carry the target — and it is written down so that a
   * screen cannot decide otherwise on its own.
   */
  | { kind: 'corpus_unavailable'; message: string; retryable: false }
  | { kind: 'refused'; message: string };

/** R17 §1 write. The code the server sends once the write half is implemented. */
export const CORPUS_TARGET_UNAVAILABLE = 'CORPUS_TARGET_UNAVAILABLE';

/**
 * THE ONE SENTENCE THE ADVOCATE SEES FOR BOTH CORPUS STATES.
 *
 * Bound by R17 §1 and by NEW3 bus 1728: it may say the authority was saved and
 * is unavailable in the selected corpus release, and it may not say the judgment
 * does not exist, was removed from the law, is unverified, or is still good law.
 * `corpus_unavailable` is not `SOURCE_UNAVAILABLE` and must not read as an
 * outage — "we are having trouble" would be a different, and false, claim.
 *
 * It is the same vocabulary `screens/matter/UnavailableAuthorityRow.tsx` uses on
 * the read side, deliberately: an advocate who meets this state twice should not
 * have to work out whether they are two different problems.
 */
export const CORPUS_UNAVAILABLE_COPY =
  'The corpus release this app is reading does not contain this judgment, so it cannot be added yet. This says nothing about the judgment itself.';

/**
 * The already-saved shell. Says what is true and offers nothing to press: the
 * save the advocate asked for happened, at some point in the past, and is in
 * their matter now.
 */
export const ALREADY_SAVED_UNAVAILABLE_COPY =
  'Already saved to this matter. The corpus release this app is reading does not contain it, so nothing about the judgment is shown.';

/**
 * Narrow an `addAuthorityToMatter` response into what the screen should say.
 *
 * PURE, and separate from every screen, for the reason `citationDisplay.ts` is:
 * the rule about what may be claimed on a citation surface is one rule, and four
 * screens each deciding it locally is four chances to get it wrong once.
 */
export function saveAuthorityOutcome(res: ApiResponse<AddAuthorityResponse>): SaveAuthorityOutcome {
  if (res.ok) {
    const { unavailableAuthority } = res.data;
    if (unavailableAuthority) {
      return {
        kind: 'already_saved_unavailable',
        authority: unavailableAuthority,
        message: ALREADY_SAVED_UNAVAILABLE_COPY,
      };
    }
    return { kind: 'saved' };
  }

  const { code, message } = res.error;

  if (code === CORPUS_TARGET_UNAVAILABLE) {
    /**
     * NOT RETRYABLE, AND THE FLAG IS NOT DECORATION. R17 makes this state a
     * property of the pinned corpus generation, so a retry with a new attempt
     * key is a second intentional mutation that cannot succeed for a reason that
     * has not changed. `state/pendingSave.ts` reads this to stop holding an
     * intent it can never perform, and no screen loops on it.
     *
     * The server's own message is discarded here rather than shown. R17 requires
     * it to be truthful, but this client renders one sentence for this state on
     * every surface, and a server whose wording drifts must not be able to move
     * what the advocate reads about the law.
     */
    return { kind: 'corpus_unavailable', message: CORPUS_UNAVAILABLE_COPY, retryable: false };
  }

  // The pre-R27 wire. See the module note: narrow, and it disappears on its own.
  if (code === 'NOT_FOUND' && /judgment/i.test(message)) {
    return { kind: 'corpus_unavailable', message: CORPUS_UNAVAILABLE_COPY, retryable: false };
  }

  /**
   * Everything else in the server's own words — including the `set_aside`
   * refusal, whose message names the replacement judgment. That is the one
   * refusal Lawmind makes on purpose and paraphrasing it would remove the only
   * part an advocate can act on.
   */
  return { kind: 'refused', message };
}
