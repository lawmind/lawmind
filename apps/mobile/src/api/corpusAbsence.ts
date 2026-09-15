/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "THIS RELEASE DOES NOT CARRY IT" IS NOT "IT DOES NOT EXIST" — ONE SENTENCE,
 * APPLIED AT THE ONE PLACE EVERY RESPONSE PASSES THROUGH.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every corpus read is pinned to a corpus GENERATION. A blue/green activation or
 * a rollback can make a perfectly real judgment absent from the generation this
 * request hit, and it returns on the next read against a generation that carries
 * it. So a client that renders "no such judgment" has converted a deployment
 * fact into a claim about the law, on a citation surface, to an advocate who may
 * be on their feet in court.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW THIS ARRIVES ON THE WIRE — TWO SHAPES, AND BOTH ARE LIVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. `CORPUS_TARGET_UNAVAILABLE`, the current wire. LCC R29 (`94950462`) routed
 *    all eight corpus call sites through `services/api/src/corpus/target-unavailable.ts`:
 *    `409` on a write, `404` on a read, both carrying this code and
 *    `details.availability = 'corpus_unavailable'`. Its message is truthful.
 *
 * 2. `NOT_FOUND` whose message names a JUDGMENT — the pre-R29 wire, which said
 *    *"no judgment with that id"* from eight call sites across seven routes
 *    (LCC bus 1758). A shipped binary outlives a deploy: during a rolling
 *    release, and against any environment that has not taken R29, this is what
 *    a phone still receives. The fold is what stops it reaching a screen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE CLIENT SPEAKS FOR ITSELF EVEN WHEN THE SERVER IS TRUTHFUL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The server's R29 sentence is fine and this still replaces it, for the reason
 * `citation/saveAuthorityOutcome.ts` already gives about the R17 §1 write: this
 * client renders ONE sentence for this state on every surface, and a server
 * whose wording drifts must not be able to move what an advocate reads about the
 * law. It also keeps the two halves consistent — an advocate who meets this
 * state on the reader and again on add-to-matter should not have to work out
 * whether they are two different problems.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT LIVES IN THE TRANSPORT AND NOT IN THE SCREENS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC bus 1758 assumed the add-to-matter fold already covered all eight routes —
 * "your fold keys on NOT_FOUND plus the word judgment, so it already covers all
 * eight wherever those routes' errors reach a rendered surface" — and asked RCC
 * to check. IT DID NOT. `saveAuthorityOutcome` narrows exactly one response
 * type, `AddAuthorityResponse`, and nothing else calls it. Four render sites
 * printed the server's message verbatim:
 *
 *     screens/judgment/AuthoritiesPanel.tsx:60       GET  /judgments/:id/authorities
 *     screens/precedent/PrecedentScreen.tsx:69       GET  /judgments/:id/treatment
 *     screens/precedent/PrecedentScreen.tsx:86       GET  /judgments/:id/graph
 *     screens/judgment/UnverifiedCitationScreen.tsx:158  POST /verify/confirm
 *
 * Those are the screens that exist today. The invariant is not "these four are
 * careful"; it is "no surface of this client may assert that a judgment does not
 * exist", and a rule enforced at each render site is one a fifth screen silently
 * opts out of by forgetting. `once()` is the single point every response passes
 * through — the same argument `citationDisplay.ts` is built on, one layer lower
 * because the exposure is not confined to one route.
 *
 * NARROW, AND NARROW IN ONE DIRECTION. `NOT_FOUND` *"no matter with that id"* is
 * true, actionable and untouched. So is every other code, including the
 * `set_aside` 409, whose message names the replacement judgment and is the one
 * refusal Lawmind makes on purpose.
 *
 * THE CODE IS NEVER REWRITTEN, ONLY THE MESSAGE. Callers branch on the code —
 * `state/outbox.ts` classifies `NOT_FOUND` as NON_RETRYABLE,
 * `saveAuthorityOutcome` folds `CORPUS_TARGET_UNAVAILABLE` into its own
 * add-specific copy — and a code this client invented would be a contract this
 * client invented.
 *
 * IT IS THE WEAKER STATEMENT, WHICH IS WHY IT IS SAFE. From the client a
 * genuinely bad id and a target this generation does not carry are
 * indistinguishable, so we say the thing that is true in both cases and assert
 * neither the existence nor the non-existence of a judgment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** R17 §1's code, and since LCC R29 the code on all eight corpus call sites. */
export const CORPUS_TARGET_UNAVAILABLE = 'CORPUS_TARGET_UNAVAILABLE';

/**
 * The one sentence, for READS and for writes that are not add-to-matter.
 *
 * Deliberately close to `saveAuthorityOutcome.CORPUS_UNAVAILABLE_COPY` and
 * deliberately not identical: that one ends "so it cannot be added yet", which
 * is true of a save and false of opening a judgment.
 *
 * It may not say the judgment does not exist, was removed from the law, is
 * unverified, or is still good law — R17 §1's own list — and it must not read as
 * an outage: "we are having trouble" would be a different, and false, claim.
 */
export const CORPUS_ABSENT_COPY =
  'The corpus release this app is reading does not contain this judgment. This says nothing about the judgment itself.';

/**
 * The failure half of `ApiResponse`'s envelope. Declared structurally rather
 * than imported, because `contract.ts` types it inline and this module must not
 * be the reason a shape is extracted and renamed in a frozen contract file.
 */
type ErrorEnvelope = { code: string; message: string };

/**
 * Is this failure the corpus-generation state — on either wire?
 *
 * Named for what it PREVENTS rather than for what it detects, because that is
 * the property a reader needs: true means the server's own words may not be
 * shown, whether because they are the forbidden sentence or because this client
 * has its own.
 */
export function assertsJudgmentDoesNotExist(error: ErrorEnvelope): boolean {
  if (error.code === CORPUS_TARGET_UNAVAILABLE) return true;
  return error.code === 'NOT_FOUND' && /judgment/i.test(error.message ?? '');
}

/**
 * Replace the sentence, leave everything else exactly as the server sent it.
 * Pure, and separate from `client.ts` so the rule can be tested without a
 * transport.
 */
export function corpusSafeError<E extends ErrorEnvelope>(error: E): E {
  if (!assertsJudgmentDoesNotExist(error)) return error;
  return { ...error, message: CORPUS_ABSENT_COPY };
}
