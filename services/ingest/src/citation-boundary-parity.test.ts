/**
 * NEW2 R20 §8. THE TWO NEUTRAL-CITATION READERS AGREE ON WHERE THE TOKEN ENDS.
 *
 * There are two of them, on purpose, and they answer DIFFERENT questions:
 *
 *   A. `extractCitations` — "which citations appear in this text?"  It is the
 *      shared extractor. Ingest builds `judgment_citations` from it and every
 *      API citation-input path reaches it through `@lawmind/ingest/citations`.
 *
 *   B. `neutralCitationFrom` — "which of them is THIS document's own?"  It is
 *      `hc-load`'s, it weighs occurrence position and cause-title anchoring, and
 *      it REFUSES rather than guess. NEW2 R17 built that refusal deliberately.
 *
 * They must not be collapsed into one function because their regexes overlap.
 * A takes every citation and never refuses; B takes at most one and refuses
 * often. Forcing byte-identical output would either make search refuse valid
 * queries or make ingest assert an identity it cannot prove — LCC R17 recorded
 * that as a documented layer difference, not a defect.
 *
 * WHAT THEY DO OWE EACH OTHER IS THE TOKEN BOUNDARY. If both name the same
 * underlying neutral citation, they must agree on whether it carries `-DB` or
 * `-FB`, because that suffix is part of the key. They disagreed for one round:
 * R18 moved B's boundary onto the number and left A's on the suffix, so between
 * e2a298e6 and this commit `2023:AHC:111864-DBNeutral Citation …` stored
 * `2023:AHC:111864-DB` as the document's own identity while emitting
 * `2023:AHC:111864` as a citation edge — one authority, two keys.
 *
 * This fixture exists so that gap cannot reopen silently. It is failure-first
 * evidence against a class, not against a line: any future edit to either rule
 * that moves one boundary without the other fails here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractCitations } from './citations.ts';
import { neutralCitationFrom } from './harvest/hc-load.ts';

/**
 * The frozen 27-control set. Controls 1–18 are LCC R17's, verbatim, so the
 * cross-lane harness and this one are answering about the same strings; 19–27
 * are NEW2's own — the glue tails R18 actually measured in the corpus, and the
 * shapes a greedy suffix could plausibly eat.
 */
const CONTROLS: readonly { text: string; year: number; why: string }[] = [
  { text: '2025:DHC:8491', year: 2025, why: '1 plain' },
  { text: '2023:AHC:152051', year: 2023, why: '2 plain, six-digit number' },
  { text: '2023:KHC-D:1', year: 2023, why: '3 hyphenated COURT token — not a suffix' },
  { text: '2025:DHC:8491-DB', year: 2025, why: '4 valid -DB, isolated' },
  { text: '2023:AHC:152051-FB', year: 2023, why: '5 valid -FB, isolated' },
  { text: '2026:PHHC:027747-DB', year: 2026, why: '6 -DB on a zero-padded number' },
  { text: '2025:DHC:8491-DB.', year: 2025, why: '7 -DB then a full stop' },
  { text: '2025:DHC:8491-DB, and', year: 2025, why: '8 -DB then a comma' },
  { text: '(2025:DHC:8491-DB)', year: 2025, why: '9 -DB inside parentheses' },
  { text: '2025:DHC:8491-DB\nThis Court', year: 2025, why: '10 -DB then a line break' },
  { text: '2025:DHC:8491-DB\r\nHeld', year: 2025, why: '11 -DB then CRLF' },
  { text: '2025:DHC:8491-DB\tHeld', year: 2025, why: '12 -DB then a tab' },
  { text: 'Neutral Citation No. - 2023:AHC:152051-DB', year: 2023, why: '13 the printed label' },
  { text: '2025:DHC:8491-SB', year: 2025, why: '14 negative: -SB is not a suffix' },
  { text: '2025:DHC:8491-Crl.A.', year: 2025, why: '15 negative: a case-type tail' },
  { text: '2025:DHC:8491-DBThis Court held', year: 2025, why: '16 glued -DB boundary' },
  { text: '2023:AHC:111864-DBNeutral Citation', year: 2023, why: '17 glued -DB label boundary' },
  { text: '2023:AHC:152051-FBOrder', year: 2023, why: '18 glued -FB boundary' },
  { text: '2025:CGHC:3148-DB2 issued by the', year: 2025, why: '19 glued page number' },
  { text: '2025:DHC:8491-DB2026', year: 2025, why: '20 glued four-digit run' },
  { text: '2025:DHC:8491- DB', year: 2025, why: '21 negative: a spaced suffix' },
  { text: '2025:DHC:8491-D', year: 2025, why: '22 negative: a truncated suffix' },
  { text: 'x2025:DHC:8491', year: 2025, why: '23 negative: no leading boundary' },
  { text: '2025:DHC:84911234', year: 2025, why: '24 negative: number too long' },
  {
    text: 'Neutral Citation No.- 2023:AHC-LKO:65518-DB. The writ petition is disposed of.',
    year: 2023,
    why: '25 hyphenated court, suffix, full stop',
  },
  { text: '2026:UHC:4224-DB ', year: 2026, why: '26 -DB then a trailing space' },
  { text: '2025:DHC:8491-DB and 2025:DHC:8492', year: 2025, why: '27 two distinct citations' },
];

/** Whatever the shared extractor returns, reduced to neutral-citation tokens. */
const sharedNeutral = (text: string): string[] =>
  extractCitations(text)
    .map((c) => c.raw)
    .filter((raw) => /^\d{4}:/.test(raw));

const base = (token: string): string => token.replace(/-(DB|FB)$/, '');

describe('the shared extractor and hc-load agree on the neutral-citation boundary', () => {
  for (const control of CONTROLS) {
    it(`boundary parity: ${JSON.stringify(control.text)} — ${control.why}`, () => {
      const own = neutralCitationFrom(control.text, control.year);
      if (own === null) return; // B refused. That is its job, and it is not a boundary claim.
      const shared = sharedNeutral(control.text);
      const sameCitation = shared.filter((token) => base(token) === base(own));
      assert.notEqual(
        sameCitation.length,
        0,
        `hc-load named ${own} and the shared extractor did not see that citation at all`,
      );
      for (const token of sameCitation) {
        assert.equal(
          token,
          own,
          `same citation, different token boundary: shared ${token} vs own ${own}`,
        );
      }
    });
  }

  /**
   * The layer difference, asserted so nobody "fixes" it into byte identity.
   * The page prints two citations; the shared extractor returns both because
   * both appear, and hc-load returns null because it cannot prove which is the
   * document's own. Neither answer is wrong for the question it was asked.
   */
  it('a refusal by hc-load is not a disagreement about the boundary', () => {
    const text = '2025:DHC:8491-DB and 2025:DHC:8492';
    assert.equal(neutralCitationFrom(text, 2025), null);
    assert.deepEqual(sharedNeutral(text), ['2025:DHC:8491-DB', '2025:DHC:8492']);
  });

  /**
   * The regression this fixture is really for. Both rules must end the token on
   * the NUMBER, so a suffix printed by the court survives prose glued onto it.
   */
  it('both rules keep a glued suffix, and neither invents one', () => {
    const glued = '2023:AHC:111864-DBNeutral Citation No. - 2023:AHC:111864-DB Reserved on 16.';
    assert.equal(neutralCitationFrom(glued, 2023), '2023:AHC:111864-DB');
    assert.deepEqual(sharedNeutral(glued), ['2023:AHC:111864-DB']);

    const noSuffix = 'IN THE HIGH COURT\n2023:DHC:2720\nJUDGMENT';
    assert.equal(neutralCitationFrom(noSuffix, 2023), '2023:DHC:2720');
    assert.deepEqual(sharedNeutral(noSuffix), ['2023:DHC:2720']);
  });
});
