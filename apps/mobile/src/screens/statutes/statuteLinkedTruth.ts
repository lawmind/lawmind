import type {
  ApiResponse,
  StatuteLinkedJudgment,
  StatuteLinkedJudgmentsResponse,
} from '../../api/contract';

/**
 * WHAT THE SERVER ACTUALLY SAID ABOUT A STATUTE'S LINKED JUDGMENTS — NEW3 R16
 * `R16-RCC-08`, against LCC's route at `69d2a9bb`.
 *
 * The same failure `searchTruth.ts` exists to prevent, on a surface where it is
 * worse. An empty `links` array can arrive for SEVEN different reasons and only
 * one of them is "we looked, and no judgment in the corpus cites this section".
 * Saying that sentence when any of the other six is true tells an advocate that
 * a provision has no case law on it, which is the kind of statement that ends a
 * consultation with the wrong advice.
 *
 * It is worse here than on search because the honest empty is the DEFAULT, not
 * the edge case. Measured 1 September 2026, the `resolver_confirmed` tier is
 * empty for every input in the corpus: 905,853 of 905,944 references carry a
 * NULL `resolution_state` and the only 91 the resolver has written are
 * refusals. So a client that renders "no cases" on an empty list would say the
 * false thing for EVERY Act and EVERY section, on every screen, from day one.
 *
 * The seven, in the order the screen must distinguish them:
 *
 *   · `loading`        — nothing has come back yet. Says nothing about the law.
 *   · `route_held`     — `409 CAPABILITY_DISABLED`. The surface is not released.
 *                        This is the EXPECTED answer in every environment today,
 *                        and it is a fact about US, never about the provision.
 *   · `not_held`       — 404. We do not hold this Act, or this section of it.
 *                        Never "that section does not exist" — the route's own
 *                        wording, and `heldSectionCount` is why it can say so.
 *   · `unavailable`    — any other failure: offline, timeout, a 500. We did not
 *                        get an answer. A failure to ask is not an answer of no.
 *   · `withheld_only`  — WE HOLD REFERENCES AND VOUCH FOR NONE OF THEM. Zero
 *                        links, and `withheld.byResolutionState` counts what the
 *                        tier declined. This is the state the whole corpus is in
 *                        today, and it is the one most easily mistaken for the
 *                        next.
 *   · `none_held`      — zero links AND nothing withheld. We hold no reference
 *                        from any judgment to this provision at all. Still not
 *                        "no judgment cites it": coverage is partial and
 *                        structural, which is why `coverage.note` rides on every
 *                        response.
 *   · `answered`       — links came back.
 *
 * `withheld_only` and `none_held` are the pair this file exists for. Both are
 * `links.length === 0`; they are DIFFERENT SENTENCES about the corpus, and the
 * route sends `withheld.byResolutionState` precisely so a client can tell them
 * apart. Collapsing them is the silent-drop defect wearing a different hat.
 */
export type StatuteLinkedTruth =
  | 'loading'
  | 'route_held'
  | 'not_held'
  | 'unavailable'
  | 'withheld_only'
  | 'none_held'
  | 'answered';

/** The route's refusal code when the surface is held. Expected, not an error. */
const ROUTE_HELD = 'CAPABILITY_DISABLED';

/**
 * The two 404s and the mismatched-pair 404, which are all the same sentence to
 * a reader: we do not hold what you asked for. They are NOT statements that the
 * Act or the section does not exist — `statutes/linked-judgments.ts` is explicit
 * that 849 Acts are held out of a statute book nobody has enumerated, and four
 * of those parsed no sections at all.
 */
const NOT_HELD_CODES: readonly string[] = [
  'STATUTE_NOT_FOUND',
  'SECTION_NOT_FOUND',
  'SECTION_NOT_IN_ACT',
];

export function classifyStatuteLinked(
  result: ApiResponse<StatuteLinkedJudgmentsResponse> | undefined,
): StatuteLinkedTruth {
  if (result === undefined) return 'loading';

  if (!result.ok) {
    if (result.error.code === ROUTE_HELD) return 'route_held';
    if (NOT_HELD_CODES.includes(result.error.code)) return 'not_held';
    /**
     * EVERYTHING ELSE IS "WE DID NOT GET AN ANSWER", and it degrades in the safe
     * direction. An unrecognised code — a validation error this client did not
     * anticipate, a 500, a future refusal — must never fall through to a state
     * that reads as a finding about the law. There is no default branch that
     * lands on `none_held`, deliberately.
     */
    return 'unavailable';
  }

  if (result.data.links.length > 0) return 'answered';

  return anythingWithheld(result.data) ? 'withheld_only' : 'none_held';
}

/**
 * Did the tier decline to show us anything?
 *
 * Read from `byResolutionState` having any key at all, not from a named ground.
 * `unclassified` is the only ground that is populated today, and hardcoding it
 * would make a future resolver state — a refusal the route starts counting next
 * month — silently read as "nothing was withheld", which is the exact false
 * sentence this state exists to prevent.
 *
 * `chronologyRefusedOnThisPage` counts too. A row removed because the Act
 * post-dates the judgment was still a reference we hold and declined to show.
 */
export function anythingWithheld(data: StatuteLinkedJudgmentsResponse): boolean {
  return (
    Object.keys(data.withheld.byResolutionState).length > 0 ||
    data.withheld.chronologyRefusedOnThisPage > 0
  );
}

/** References the tier declined, summed across grounds. Zero when none. */
export function withheldReferenceCount(data: StatuteLinkedJudgmentsResponse): number {
  return Object.values(data.withheld.byResolutionState).reduce((n, w) => n + w.references, 0);
}

/** Distinct judgments the tier declined, summed across grounds. */
export function withheldJudgmentCount(data: StatuteLinkedJudgmentsResponse): number {
  return Object.values(data.withheld.byResolutionState).reduce((n, w) => n + w.judgments, 0);
}

/**
 * MAY THIS ROW BE PRESENTED TO AN ADVOCATE AS A LINKED JUDGMENT?
 *
 * The binding rule this round works under: default and current legal product
 * data uses the evidence-qualified resolver-confirmed semantics, and
 * `structural_unreviewed` is for tests, development diagnostics and
 * non-user-reachable tooling only, unless NEW3 authorises otherwise.
 *
 * So this asks the ROW's own label, never the request's tier. The route's
 * aggregation rule makes a mixed row inherit the WEAKER label, so a row that
 * says `resolver_confirmed` had a confirming state written for every Act
 * spelling in it. A row that says `structural_unreviewed` is an extractor pin
 * nobody has reviewed, and there are 905,853 of those.
 *
 * This is a predicate about DESCRIBING a row as linked. It is deliberately not
 * a filter that drops rows: dropping is the silent half of the same defect, and
 * what the internal surface does instead is show them under their own label
 * with the count of what is unvouched beside them.
 */
export function mayPresentAsLinked(row: Pick<StatuteLinkedJudgment, 'link'>): boolean {
  return row.link.evidence === 'resolver_confirmed';
}

/**
 * How many rows on this page are unvouched. The number that has to appear
 * beside any `structural_unreviewed` page, because "here are 20 judgments" and
 * "here are 20 references nobody has reviewed" are different offers.
 */
export function unreviewedCount(links: readonly StatuteLinkedJudgment[]): number {
  return links.filter((l) => !mayPresentAsLinked(l)).length;
}

/**
 * THE SENTENCE THE SURFACE MAY USE FOR THE RELATION — the server's, never ours.
 *
 * `semantics` arrives on every response for this reason, and the route's header
 * lists the four phrasings that are forbidden because nothing in the data
 * supports them: cases that APPLY the section, cases INTERPRETING it, cases
 * DECIDED UNDER it, and the successor provision's case law. Each is a legal
 * conclusion; the route reports a citation fact.
 *
 * A fallback is supplied for the one case where the server sent nothing, and it
 * is deliberately the weakest available statement rather than a friendlier one.
 */
export function relationSentence(data: Pick<StatuteLinkedJudgmentsResponse, 'semantics'>): string {
  const sentence = data.semantics.trim();
  if (sentence.length > 0) return sentence;
  return (
    'Judgments whose text carries a structurally extracted reference to this provision. It is ' +
    'not a finding that the provision applied, was interpreted, or was decided under.'
  );
}
