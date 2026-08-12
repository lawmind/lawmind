/**
 * Splitting an Indian judgment into its own numbered paragraphs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COURT ALREADY DID THE HARD PART
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Supreme Court's July 2023 direction requires that **"all paragraphs
 * should be numbered sequentially commencing with the initial paragraph in the
 * published judgment"**. So a judgment carries its own citable units and we do
 * not have to invent them with a fixed-size window. That matters twice over:
 *
 * - **"Para 14" is what goes in a filing.** A pinpoint an advocate can actually
 *   use has to be the number the court printed, not an index we assigned.
 * - **Structure-preserving segmentation beats sequential chunking on legal
 *   text**, because a provision's meaning is bound to its numbering and its
 *   heading rather than to a token count.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It never invents a paragraph number.** A cause title, a coram line and an
 * unnumbered preamble genuinely have none, and a false pinpoint reference in
 * front of an advocate is worse than no pinpoint at all. Those come back with
 * `number: null` and a real position.
 *
 * **It never loses text.** Every character of the input belongs to exactly one
 * paragraph: the spans are contiguous and their concatenation reconstructs the
 * source. A splitter that quietly drops a page is indistinguishable from a
 * corpus that never had it, and this corpus has already been bitten by that
 * once, in the Bombay extraction.
 */

export type Paragraph = {
  /** Position in the document, 0-based. Always present. */
  readonly index: number;
  /** The number the COURT printed, or null when it printed none. */
  readonly number: number | null;
  readonly charOffset: number;
  readonly charLength: number;
  readonly text: string;
};

/**
 * A numbered paragraph opener at the start of a line: `14.`, `14)`, `(14)`.
 *
 * Anchored to a line start and bounded to four digits. Indian judgments run to
 * a few hundred paragraphs, so a five-digit "number" is a year, a section or an
 * amount — `2019. The appellant` is a sentence about a year, not paragraph two
 * thousand and nineteen.
 */
const NUMBERED_OPENER = /^[ \t]*(?:\(\s*(\d{1,4})\s*\)|(\d{1,4})\s*[.)])\s+/;

/**
 * Below this, a "paragraph" is a stray line — a page number, a running header,
 * a stranded signature. Merged into its predecessor rather than stored as
 * evidence, because a 4-character span proves nothing and clutters everything.
 */
export const MIN_PARAGRAPH_CHARS = 40;

/**
 * A paragraph number must not go backwards or leap. Courts number sequentially,
 * so `14.` following `13.` is a paragraph and `1998.` following `13.` is a
 * year at the start of a sentence. Allowing a small forward gap tolerates the
 * extraction dropping a line without letting a citation year masquerade as a
 * paragraph.
 */
export const MAX_NUMBER_GAP = 3;

/**
 * The FIRST number accepted in a document is a special case, and getting it
 * wrong breaks the whole file.
 *
 * The sequence rule needs something to continue FROM. Seeding it at 0 means the
 * first opener must itself be ≤ `MAX_NUMBER_GAP`, so a judgment whose numbering
 * starts anywhere above 3 — an extract beginning at paragraph 12, or a file
 * whose first paragraphs were lost — opens NO paragraphs at all and silently
 * returns one giant block. Found by a test asserting the opposite of what the
 * code did.
 *
 * So the first opener is admitted on a plausibility bound instead: real
 * judgments begin at 1, and an extract beginning past 20 is rarer than a
 * four-digit year or a rupee amount sitting at the head of a sentence. After
 * that first anchor the sequence rule takes over and is strict.
 */
export const MAX_FIRST_NUMBER = 20;

export function splitParagraphs(fullText: string): Paragraph[] {
  if (fullText.trim() === '') return [];

  /**
   * Split on line starts, keeping offsets exact. Working line-by-line rather
   * than with a global regex is what makes the offsets trustworthy — a
   * `matchAll` over the whole document would need every match re-located.
   */
  const lines: { text: string; offset: number }[] = [];
  let cursor = 0;
  for (const line of fullText.split('\n')) {
    lines.push({ text: line, offset: cursor });
    cursor += line.length + 1; // +1 for the '\n' consumed by split
  }

  type Draft = { number: number | null; start: number; end: number };
  const drafts: Draft[] = [];
  let lastNumber = 0;

  for (const line of lines) {
    const m = NUMBERED_OPENER.exec(line.text);
    const parsed = m ? Number(m[1] ?? m[2]) : null;

    /**
     * A number only opens a paragraph if it CONTINUES the sequence. This is the
     * check that stops `2019. The appellant filed...` from being read as a
     * paragraph opener, and it is why the parser does not need to understand
     * dates at all.
     */
    const opensParagraph =
      parsed !== null &&
      (lastNumber === 0
        ? parsed <= MAX_FIRST_NUMBER
        : parsed > lastNumber && parsed <= lastNumber + MAX_NUMBER_GAP);

    if (opensParagraph) {
      drafts.push({ number: parsed, start: line.offset, end: line.offset + line.text.length + 1 });
      lastNumber = parsed!;
      continue;
    }
    if (drafts.length === 0) {
      // Everything before the first numbered paragraph: cause title, coram,
      // counsel. Real text, no number, and it must not be discarded.
      drafts.push({ number: null, start: 0, end: line.offset + line.text.length + 1 });
      continue;
    }
    drafts[drafts.length - 1]!.end = line.offset + line.text.length + 1;
  }

  // The last draft runs to the end of the document, not to the end of its last line.
  if (drafts.length > 0) drafts[drafts.length - 1]!.end = fullText.length;

  /**
   * Merge anything too short to be evidence into its predecessor. Done after
   * splitting rather than during, so the merge cannot change where a real
   * paragraph begins.
   */
  const merged: Draft[] = [];
  for (const d of drafts) {
    const prev = merged[merged.length - 1];
    if (prev && d.end - d.start < MIN_PARAGRAPH_CHARS) {
      prev.end = d.end;
      continue;
    }
    merged.push({ ...d });
  }

  return merged.map((d, i) => ({
    index: i,
    number: d.number,
    charOffset: d.start,
    charLength: d.end - d.start,
    text: fullText.slice(d.start, d.end),
  }));
}

/**
 * Every character accounted for, exactly once. Used by the tests and by the
 * CLI's own sampling — a splitter that drops text is the failure mode that
 * matters here, and it is cheap to make impossible rather than unlikely.
 */
export function spansAreContiguous(paragraphs: readonly Paragraph[], fullText: string): boolean {
  if (paragraphs.length === 0) return fullText.trim() === '';
  let expected = 0;
  for (const p of paragraphs) {
    if (p.charOffset !== expected) return false;
    expected = p.charOffset + p.charLength;
  }
  return expected === fullText.length;
}
