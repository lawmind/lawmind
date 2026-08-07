import type { JudgmentParagraph } from '../../api/contract';

/**
 * IN-TEXT SEARCH — PD-9, the fourth of the six reading-view features.
 *
 * `SPRINT_1.md` states the requirement twice, and both times with the same
 * emphasis: it "jumps between PARAGRAPHS, not scroll positions". That is not a
 * phrasing preference. An advocate searching a judgment is looking for the
 * paragraph they will cite — a scroll offset is unciteable, it changes with
 * text size, and it does not survive being read again tomorrow at a different
 * setting. So every result this module returns is anchored to a
 * `paragraphIndex`, and the offsets inside it exist to highlight, never to
 * navigate by.
 *
 * ── WHY THIS IS A MODULE WITH NO REACT IN IT ────────────────────────────────
 *
 * The last three defects in this screen were all in offset arithmetic, and two
 * of them survived a green typecheck because the branch never executed. Pure
 * functions over plain arrays can be tested against a real judgment's shape —
 * unnumbered header paragraphs, a 79,000-character final block, Devanagari — in
 * milliseconds and without a renderer.
 */

/** One occurrence, anchored to a paragraph and offset within THAT paragraph's text. */
export type Match = {
  /** Zero-based, always present. The navigation handle. */
  paragraphIndex: number;
  /** The printed number, where the report has one. Null is normal and not an error. */
  paragraphNumber: number | null;
  start: number;
  end: number;
};

export type FindResult = {
  /** The query as searched, after trimming. */
  query: string;
  /** Every occurrence, in document order. */
  matches: Match[];
  /** Distinct paragraphs containing a match, in document order. */
  paragraphIndexes: number[];
  /**
   * True when the query was rejected as too short rather than genuinely absent.
   * The two must render differently: "no matches" on a one-character query is a
   * false statement about the judgment.
   */
  tooShort: boolean;
};

/**
 * TWO CHARACTERS.
 *
 * One character matches several thousand times in a judgment of this length,
 * which is not a search result — it is a count of the alphabet, and stepping
 * through it is useless. Two is also the shortest genuinely useful legal query
 * in Devanagari, where a two-character word is common.
 */
export const MIN_QUERY = 2;

/**
 * Case folding that CANNOT MOVE AN OFFSET.
 *
 * `toLowerCase` is not length-preserving for every input — Turkish dotted I and
 * the German sharp S both change length — and a folded haystack whose indices
 * no longer line up with the original would highlight the wrong characters, or
 * slice a Devanagari grapheme in half. So the fold is applied and then CHECKED,
 * and where it changed the length the comparison falls back to case-sensitive
 * for that string.
 *
 * Devanagari is caseless, so folding is a no-op on Hindi text and this costs
 * nothing there. Deliberately no Unicode normalisation: NFC would also shift
 * offsets relative to the text actually being rendered, and the fix for a
 * normalisation mismatch belongs at ingest, not in a highlighter.
 */
function fold(s: string): string {
  const lowered = s.toLowerCase();
  return lowered.length === s.length ? lowered : s;
}

export function findInJudgment(paragraphs: JudgmentParagraph[], rawQuery: string): FindResult {
  const query = rawQuery.trim();

  if (query.length < MIN_QUERY) {
    return { query, matches: [], paragraphIndexes: [], tooShort: true };
  }

  const needle = fold(query);
  const matches: Match[] = [];
  const paragraphIndexes: number[] = [];

  for (const paragraph of paragraphs) {
    const hay = fold(paragraph.text);
    /**
     * `indexOf` in a loop rather than a RegExp. The query is user input, and a
     * regex built from it would either need escaping — one missed metacharacter
     * away from a crash or a wrong result — or would let a stray `(` from a
     * citation break the search on a screen an advocate is relying on.
     */
    let at = hay.indexOf(needle);
    if (at !== -1) paragraphIndexes.push(paragraph.paragraphIndex);

    while (at !== -1) {
      matches.push({
        paragraphIndex: paragraph.paragraphIndex,
        paragraphNumber: paragraph.paragraphNumber,
        start: at,
        end: at + query.length,
      });
      /**
       * Advance by the whole needle, so overlapping occurrences are not
       * double-counted: "aa" in "aaa" is one match followed by one more, not
       * two overlapping ones. The count is what the advocate steps through, and
       * a count they cannot reach the end of is wrong.
       */
      at = hay.indexOf(needle, at + needle.length);
    }
  }

  return { query, matches, paragraphIndexes, tooShort: false };
}

/**
 * Next or previous, WRAPPING.
 *
 * Wrapping rather than stopping at the ends: an advocate stepping through
 * matches in a judgment is scanning, not paginating, and a dead button at match
 * 12 of 12 reads as a broken control rather than as a boundary. Returns 0 for an
 * empty set so no caller has to hold a null.
 */
export function stepMatch(total: number, current: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  return (current + direction + total) % total;
}

/**
 * "3 of 12" — ONE-BASED, because it is read by a person.
 *
 * The zero-based index is the machine's; showing it produced "¶ 0 of 28" on a
 * Galaxy S24 and the counter is the one place that mistake is unmissable.
 */
export function matchLabel(current: number, total: number): string {
  if (total === 0) return 'No matches';
  return `${current + 1} of ${total}`;
}
