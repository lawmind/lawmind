import type { JudgmentParagraph } from '../../api/contract';
import { findInJudgment, matchLabel, MIN_QUERY, stepMatch } from './findInJudgment';

/**
 * The fixture mirrors the real shape of `GET /judgments/:id`, measured on
 * production: the header block carries NO printed number, numbering starts at 2
 * rather than 1, and it is not contiguous. A fixture numbered 1..N would let a
 * bug that returns the array position pass every test.
 */
const paragraphs: JudgmentParagraph[] = [
  { index: 0, number: null, text: 'GURBAKSH SINGH SIBBIA v. STATE OF PUNJAB\nApril 9, 1980' },
  { index: 1, number: 2, text: 'The question of anticipatory bail arises under Section 438.' },
  { index: 2, number: 7, text: 'Anticipatory bail is not to be granted as a matter of course. Bail is the rule.' },
  { index: 3, number: 15, text: 'अग्रिम जमानत के लिए शर्तें धारा 438 में दी गई हैं।' },
];

describe('findInJudgment', () => {
  it('anchors every match to a paragraph index, never to a scroll position', () => {
    const r = findInJudgment(paragraphs, 'anticipatory bail');

    expect(r.matches.map((m) => m.paragraphIndex)).toEqual([1, 2]);
    for (const m of r.matches) {
      expect(typeof m.paragraphIndex).toBe('number');
      expect(m).not.toHaveProperty('offsetY');
      expect(m).not.toHaveProperty('scrollTo');
    }
  });

  /**
   * The printed number and the array position are different addresses and the
   * fixture makes them disagree on every row. A match in paragraph index 2
   * carries printed number 7, and substituting one for the other would
   * manufacture a citation that looks exactly like a real one in a note.
   */
  it('carries the printed number alongside the index, and never confuses them', () => {
    const r = findInJudgment(paragraphs, 'Bail is the rule');

    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.paragraphIndex).toBe(2);
    expect(r.matches[0]!.paragraphNumber).toBe(7);
  });

  it('reports a null printed number rather than inventing one', () => {
    const r = findInJudgment(paragraphs, 'SIBBIA');

    expect(r.matches[0]!.paragraphIndex).toBe(0);
    expect(r.matches[0]!.paragraphNumber).toBeNull();
  });

  it('is case insensitive without moving the offsets', () => {
    const r = findInJudgment(paragraphs, 'ANTICIPATORY');
    const first = r.matches[0]!;
    const text = paragraphs[first.paragraphIndex]!.text;

    // The offsets must still index the ORIGINAL text, not a folded copy.
    expect(text.slice(first.start, first.end)).toBe('anticipatory');
  });

  it('finds Devanagari, where case folding is a no-op', () => {
    const r = findInJudgment(paragraphs, 'जमानत');

    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.paragraphIndex).toBe(3);
    const p = paragraphs[3]!;
    expect(p.text.slice(r.matches[0]!.start, r.matches[0]!.end)).toBe('जमानत');
  });

  it('counts every occurrence in a paragraph, not just the first', () => {
    const r = findInJudgment(paragraphs, 'bail');

    // "anticipatory bail" ×2 plus "Bail is the rule" — three in total.
    expect(r.matches).toHaveLength(3);
    expect(r.paragraphIndexes).toEqual([1, 2]);
  });

  it('lists each paragraph once however many times it matches', () => {
    const r = findInJudgment(paragraphs, 'bail');
    expect(new Set(r.paragraphIndexes).size).toBe(r.paragraphIndexes.length);
  });

  /**
   * Overlapping occurrences would inflate the count past what stepping can
   * reach, so "12 of 12" would never arrive.
   */
  it('does not double-count overlapping occurrences', () => {
    const overlapping: JudgmentParagraph[] = [{ index: 0, number: 1, text: 'aaaa' }];
    expect(findInJudgment(overlapping, 'aa').matches).toHaveLength(2);
  });

  it('says a query is too short rather than reporting no matches', () => {
    const r = findInJudgment(paragraphs, 'a');

    expect(r.tooShort).toBe(true);
    expect(r.matches).toHaveLength(0);
    // "No matches" on a one-character query is a false statement about the
    // judgment, and the caller needs to be able to tell the difference.
    expect(MIN_QUERY).toBe(2);
  });

  it('treats whitespace-only input as too short, not as a match on every space', () => {
    expect(findInJudgment(paragraphs, '   ').tooShort).toBe(true);
    expect(findInJudgment(paragraphs, '').tooShort).toBe(true);
  });

  it('returns an honest empty result for a term that is genuinely absent', () => {
    const r = findInJudgment(paragraphs, 'arbitration');

    expect(r.tooShort).toBe(false);
    expect(r.matches).toHaveLength(0);
    expect(r.paragraphIndexes).toEqual([]);
  });

  /**
   * A regex built from user input is one unescaped metacharacter away from a
   * crash on a screen an advocate is relying on. Citations are full of them.
   */
  it('treats regex metacharacters as literal text', () => {
    const withMeta: JudgmentParagraph[] = [
      { index: 0, number: 1, text: 'See s. 438(1) of the Code (as amended).' },
    ];

    expect(findInJudgment(withMeta, '438(1)').matches).toHaveLength(1);
    expect(findInJudgment(withMeta, '.*').matches).toHaveLength(0);
    expect(findInJudgment(withMeta, '(as amended)').matches).toHaveLength(1);
  });

  it('handles the 79,000-character final block the corpus actually returns', () => {
    const huge: JudgmentParagraph[] = [
      { index: 0, number: 1, text: `${'lorem ipsum '.repeat(6_500)}anticipatory bail` },
    ];

    const r = findInJudgment(huge, 'anticipatory bail');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.paragraphIndex).toBe(0);
  });
});

describe('stepMatch', () => {
  it('wraps forward at the end rather than dying on a dead button', () => {
    expect(stepMatch(3, 2, 1)).toBe(0);
    expect(stepMatch(3, 0, 1)).toBe(1);
  });

  it('wraps backward from the first match to the last', () => {
    expect(stepMatch(3, 0, -1)).toBe(2);
    expect(stepMatch(3, 2, -1)).toBe(1);
  });

  it('holds at zero for an empty set so no caller has to carry a null', () => {
    expect(stepMatch(0, 0, 1)).toBe(0);
    expect(stepMatch(0, 0, -1)).toBe(0);
  });
});

describe('matchLabel', () => {
  /**
   * "¶ 0 of 28" shipped once and was caught on a Galaxy S24, not in a test. The
   * counter is the one place a zero-based index is unmissable, so it is the one
   * place worth asserting.
   */
  it('is one-based, because a person reads it', () => {
    expect(matchLabel(0, 12)).toBe('1 of 12');
    expect(matchLabel(11, 12)).toBe('12 of 12');
  });

  it('says no matches rather than "0 of 0"', () => {
    expect(matchLabel(0, 0)).toBe('No matches');
  });
});
