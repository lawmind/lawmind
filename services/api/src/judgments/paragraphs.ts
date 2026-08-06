/**
 * Segment a judgment into citable paragraphs.
 *
 * PD-9 puts paragraph anchors first in the reading view because that is how
 * advocates refer to authority, and `judgments.overruled_paras` is expressed in
 * printed paragraph numbers. So the number is not decoration — it is the unit a
 * citation points at.
 *
 * **This has to happen server-side.** The client cannot split `full_text` without
 * inventing numbers, and inventing them is the failure this product exists to
 * prevent: an advocate told "see paragraph 22" must land on the paragraph the
 * court numbered 22.
 *
 * Two fields, because they answer different questions and genuinely diverge:
 *
 *   `paragraphNumber` — what the court PRINTED. Nullable, and null is common:
 *                       pre-1990s judgments arrive as OCR'd scans that lost their
 *                       numbering, and headnotes are never numbered. Citable.
 *   `paragraphIndex`  — position in this array. Always present, never citable,
 *                       a rendering and scroll-targeting handle only.
 *
 * A judgment whose numbering cannot be read yields paragraphs with null numbers
 * rather than a fabricated 1..N sequence. Less useful, and honest.
 */

export type JudgmentParagraph = {
  /** The number the court printed. Null when the source does not carry one. */
  paragraphNumber: number | null;
  /** Position in this array. Stable for a given text, never a citation. */
  paragraphIndex: number;
  text: string;
};

/**
 * Reporter furniture that is not judgment text.
 *
 * Reported judgments are typeset with marginal letters (`A B C D E F G H` down
 * the page edge for pinpoint referencing) and running page numbers. Both survive
 * PDF extraction as their own lines and neither is content.
 */
const FURNITURE = [
  // A lone run of margin letters: "A B C D E F G H", "A B C", "E F".
  /^[A-H](\s+[A-H])*$/,
  // A bare page number.
  /^\d{1,5}$/,
  // Reporter running heads.
  /^SUPREME COURT REPORTS(\s+\[\d{4}\].*)?$/i,
  /^\[\d{4}\]\s+\d+\s+S\.?C\.?R\.?/i,
  /^\d{4}\s+INSC\s+\d+$/i,
];

function isFurniture(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return true;
  return FURNITURE.some((re) => re.test(t));
}

/**
 * A numbered-paragraph opener: `12.`, `12)`, `(12)` at the start of a line.
 *
 * Deliberately narrow. A judgment is full of numbers that begin lines — section
 * numbers, years, list items, quoted provisions — and treating any of them as a
 * paragraph marker fragments the text and misnumbers what follows. Requiring the
 * terminator, and requiring the number to advance, rejects nearly all of them.
 */
const OPENER = /^\(?(\d{1,4})[.)]\s+(?=\S)/;

/**
 * True when `candidate` can follow `previous` in a paragraph sequence.
 *
 * Numbering runs forward. A "paragraph 3" appearing after paragraph 47 is a
 * quoted sub-clause or a list item inside the current paragraph, not the next
 * paragraph — the commonest way naive splitting corrupts a judgment.
 *
 * A gap is allowed because reported text legitimately skips (a paragraph wholly
 * within a quoted extract, a numbering restart after a separate opinion), but a
 * large jump is far more likely to be a year or a section number.
 */
function advances(previous: number | null, candidate: number): boolean {
  if (previous === null) return candidate <= 3;
  return candidate > previous && candidate - previous <= 5;
}

export function segmentParagraphs(fullText: string): JudgmentParagraph[] {
  const lines = fullText.split('\n');
  const blocks: { number: number | null; lines: string[] }[] = [];
  let current: { number: number | null; lines: string[] } | null = null;
  let lastNumber: number | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (isFurniture(line)) continue;

    const opener = OPENER.exec(line);
    const candidate = opener ? Number(opener[1]) : null;

    if (candidate !== null && advances(lastNumber, candidate)) {
      if (current) blocks.push(current);
      current = { number: candidate, lines: [line.slice(opener![0].length)] };
      lastNumber = candidate;
    } else if (current) {
      current.lines.push(line);
    } else {
      // Text before the first numbered paragraph — the headnote, the bench, the
      // case title. Real content, never numbered, so it carries a null number
      // rather than being dropped or given a made-up one.
      current = { number: null, lines: [line] };
    }
  }
  if (current) blocks.push(current);

  return blocks
    .map((b) => ({ number: b.number, text: b.lines.join('\n').trim() }))
    .filter((b) => b.text.length > 0)
    .map((b, i) => ({ paragraphNumber: b.number, paragraphIndex: i, text: b.text }));
}

/**
 * Share of paragraphs carrying a printed number.
 *
 * Reported and worth returning: a judgment at 0.0 is one the reading view can
 * display but cannot anchor, and the client should show it without pretending
 * the anchors exist.
 */
export function numberedShare(paragraphs: readonly JudgmentParagraph[]): number {
  if (paragraphs.length === 0) return 0;
  return paragraphs.filter((p) => p.paragraphNumber !== null).length / paragraphs.length;
}
