import type { DegradedArm, SearchResponse } from '../../api/contract';

/**
 * WHAT THE SERVER ACTUALLY SAID ABOUT THIS SEARCH — R12 §4, R14 A4.9.
 *
 * A search response can come back in six shapes and only one of them is "we
 * looked and there is nothing". Collapsing the other five into that sentence is
 * the single most damaging false statement this product can make: it tells an
 * advocate the corpus holds no authority on their point, and they stop looking.
 *
 * The six, in the order the screen must distinguish them:
 *
 *   · `answered`       — results, nothing withheld.
 *   · `partial`        — an ARM TIMED OUT. Results (if any) are incomplete, not
 *                        proven empty. Retrying may work; it costs a full query.
 *   · `refused`        — THE LEXICAL ARM NEVER RANKED. The match set was
 *                        unbounded at the corpus-wide document-frequency gate,
 *                        so nothing was looked at. The remedy is more terms, or
 *                        ONE NAMED COURT and a shorter date range — R14 A7, and
 *                        the filter half is a correction to what R12 said.
 *   · `party_disabled` — THE BARE-PARTY-NAME ARM WAS SWITCHED OFF for this
 *                        platform. Nothing timed out and nothing failed; a
 *                        capability was narrowed by the served registry, and the
 *                        exact-identity paths still work.
 *   · `unknown`        — `retrievalOutcome.state === 'coverage_unknown'`. We did
 *                        not look, or could not look properly. This result set
 *                        is not a statement about the corpus.
 *   · `empty`          — the honest empty. We looked. Nothing matched.
 *
 * Derived from the response, never from `results.length`. A zero-length list is
 * the one thing all six have in common and it distinguishes none of them.
 */
export type SearchTruth =
  | 'answered'
  | 'partial'
  | 'refused'
  | 'party_disabled'
  | 'unknown'
  | 'empty';

/** The arms that mean "we refused to rank", as opposed to "we ran out of time". */
const REFUSAL_ARMS: readonly DegradedArm[] = ['sparse_unbounded'];

/**
 * WAS THE PARTY ARM SWITCHED OFF FOR THIS PLATFORM? — R14 A4.9.
 *
 * Separate from {@link classifySearch} because the two questions have different
 * scopes: the classification decides which EMPTY STATE renders, and this decides
 * which BANNER renders, which must be the truthful one whether or not the
 * response also carried results.
 */
export function partyArmDisabled(degraded: readonly DegradedArm[] | undefined): boolean {
  return (degraded ?? []).includes('party_name_disabled');
}

export function classifySearch(data: Pick<
  SearchResponse,
  'results' | 'degraded' | 'emptyBecause' | 'retrievalOutcome'
>): SearchTruth {
  const degraded = data.degraded ?? [];
  const refused =
    data.emptyBecause !== undefined || degraded.some((arm) => REFUSAL_ARMS.includes(arm));

  /**
   * THE DISABLED ARM OUTRANKS BOTH THE REFUSAL AND THE TIMEOUTS, and the reason
   * is what the advocate would do next.
   *
   * A bare party name whose own arm is switched off falls through to the generic
   * lexical path, which then refuses it as too broad — so the SAME response can
   * carry `party_name_disabled` and `sparse_unbounded` together. Reading the
   * refusal first would tell an advocate who typed a person's name to add more
   * terms to it, which cannot work: the arm that would have answered was turned
   * off, not overwhelmed. And reading the timeout branch first would promise
   * that a retry might succeed, when retrying an administratively disabled arm
   * can never succeed.
   *
   * Checked BEFORE `results.length`, so a response that carried some results
   * from other arms is still classified honestly; the screen decides separately
   * whether it has a list to show.
   */
  if (partyArmDisabled(degraded)) return 'party_disabled';

  // A refusal outranks everything else: nothing was ranked, so nothing that
  // follows from a ranking can be said.
  if (refused && data.results.length === 0) return 'refused';

  if (degraded.length > 0) return 'partial';

  /**
   * `coverage_unknown` is checked AFTER the degraded arms because those name
   * the specific cause and this names only the consequence. Checked BEFORE
   * `empty` because it is the state that may never render as one.
   */
  if (data.retrievalOutcome?.state === 'coverage_unknown') return 'unknown';

  if (data.results.length === 0) return 'empty';
  return 'answered';
}

/**
 * DOES THIS QUERY LOOK LIKE A PARTY NAME AND NOTHING ELSE? — the case-first
 * hint. The server now has a dedicated `search.party_name` capability, ENABLED
 * release-wide (R14 A4.9), so this no longer describes a missing path; it
 * describes the queries for which the CAUSE TITLE is the better thing to type.
 *
 * MEASURED ZERO, twice. "SANJAY KUMAR MISHRA @ SANJAY MISHRA" returns 0 results;
 * so does "SATENDER KUMAR ANTIL", an authority we hold and the most-cited node
 * in the sampled citation graph with 7,418 inbound edges. The party-name path
 * exists in `retrieve.ts` but the request never reaches it.
 *
 * CASE-FIRST, ALWAYS. When this fires, the screen asks for the CAUSE TITLE —
 * "Satender Kumar Antil v. CBI" — which resolves at rank 1. It never offers to
 * look a PERSON up. There are no person profiles, no background-check flow, no
 * "court history of this person" and no dossier in this product; a name is a
 * way of naming a CASE, and the only thing on the other side of this hint is a
 * judgment.
 *
 * Deliberately conservative, and conservative in a specific direction: it looks
 * for the SHAPE of a name rather than for the absence of legal words. A party
 * name in a cause title is written as a name — capitalised, or in a script with
 * no case at all — while the legal phrase this must not trip on
 * ("anticipatory bail cheque dishonour") is written in ordinary lowercase. Two
 * to six such words, no digits, no citation punctuation, and no "v." — because
 * a query that already carries a "v." is the shape we are asking for.
 */
export function looksLikeBarePartyName(query: string): boolean {
  const q = query.trim();
  if (q.length === 0) return false;

  // A cause title already names two sides. Nothing to suggest.
  if (/\b(v|vs|versus)\.?\b/i.test(q)) return false;

  // Digits mean a citation, a case number, a CNR, a year or a section — all of
  // which have working exact paths and none of which is a party name.
  if (/\d/.test(q)) return false;

  // Citation and field punctuation. `judge:"Kania"` is a structured query.
  if (/[():"[\]/]/.test(q)) return false;

  // `@` is an alias marker inside Indian cause titles ("SANJAY KUMAR MISHRA @
  // SANJAY MISHRA") and is a strong positive signal, not a disqualifier.
  const words = q.replace(/@/g, ' ').trim().split(/\s+/).filter(Boolean);
  // One word is a term far more often than it is a party, and the hint would
  // fire on half the vocabulary of criminal law.
  if (words.length < 2 || words.length > 6) return false;

  return words.every((w) => {
    // Letters and combining marks: Devanagari vowel signs are marks, not
    // letters, so a `\p{L}`-only class rejects every Hindi name.
    if (!/^[\p{L}\p{M}.'-]+$/u.test(w)) return false;
    const first = [...w][0] ?? '';
    // Capitalised, or from a script with no case to capitalise.
    return /\p{Lu}/u.test(first) || first.toLowerCase() === first.toUpperCase();
  });
}
