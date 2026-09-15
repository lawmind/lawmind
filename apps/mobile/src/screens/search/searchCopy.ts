/**
 * THE SEARCH LEDE, EXTRACTED SO A GUARD CAN HOLD IT.
 *
 * It lives here rather than inline in `SearchScreen.tsx` for one reason: the
 * rule about what a citation surface may claim is a RULE, and a string inside
 * JSX is something a future edit can quietly widen. `searchCopy.test.ts` asserts
 * the shape of the claim, and it can only do that if the string has a name.
 *
 * What it may not say is in that test. In short: no universal verification
 * promise. `CITATION_HARNESS.md` requires unverified and failed citations to be
 * SHOWN — marked, never dropped and never dressed up — so any sentence of the
 * form "every citation has been checked" is false about the set this screen is
 * about to return.
 */
export const CLAIM_FREE_SEARCH_LEDE =
  'Ask the way you would ask a junior. Every citation comes back with what we could confirm about it — and anything we could not confirm says so, rather than being left out.';
