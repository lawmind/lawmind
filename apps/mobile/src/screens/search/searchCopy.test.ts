import { CLAIM_FREE_SEARCH_LEDE } from './searchCopy';

/**
 * THE SENTENCE THE SEARCH SCREEN MAY NOT SAY, PINNED.
 *
 * Until 15 September 2026 the search empty state promised: *"Every citation you
 * get back has been checked against the reported record before you see it."*
 * `CITATION_HARNESS.md` makes that false of the whole set — `unverified` means
 * nothing confirmed it and `failed` means the check did not happen, and both are
 * SHOWN on purpose, because a silent drop is worse than an honest mark.
 *
 * This asserts the shape of the rule rather than the exact wording, so the copy
 * can be rewritten without the guard having to be rewritten with it — what it
 * must never do is regrow a universal verification claim.
 */
describe('the search lede claims nothing the harness cannot support', () => {
  it('makes no universal "everything was verified" claim', () => {
    expect(CLAIM_FREE_SEARCH_LEDE).not.toMatch(
      /every citation (you get back |)(has been|is|was) (checked|verified|confirmed)/i,
    );
    expect(CLAIM_FREE_SEARCH_LEDE).not.toMatch(/all citations (are|have been|were)/i);
  });

  it('does not borrow the VerificationSheet sentence, which is gated on one confirmed citation', () => {
    expect(CLAIM_FREE_SEARCH_LEDE).not.toMatch(/checked against the reported record/i);
  });

  it('says instead what is true of every result — the state travels with it, and nothing is dropped', () => {
    expect(CLAIM_FREE_SEARCH_LEDE).toMatch(/could not confirm/i);
    expect(CLAIM_FREE_SEARCH_LEDE).toMatch(/rather than being left out|not.*left out/i);
  });
});
