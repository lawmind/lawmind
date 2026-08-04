/**
 * Chunking for `judgment_chunks`.
 *
 * Judgments are cited by paragraph — PD-9 puts paragraph anchors first in the
 * reading view precisely because that is how advocates refer to authority. So
 * chunk boundaries follow paragraphs and never split one across two chunks
 * unless the paragraph alone exceeds the budget. A chunk that starts mid-sentence
 * retrieves badly and quotes worse.
 *
 * Sizes are in characters, not tokens: the token count is recorded separately
 * from the real tokeniser, and a character budget keeps this module free of the
 * model so it stays testable without a 569MB download.
 */

export type Chunk = {
  index: number;
  text: string;
  /** Character offset into the source text — lets a citation point back at the span. */
  offset: number;
};

export type ChunkOptions = {
  /** Upper bound per chunk. BGE-M3 takes 8194 positions; this stays well inside it. */
  maxChars: number;
  /** Chunks shorter than this are merged forward — a 40-character fragment retrieves noise. */
  minChars: number;
  /** Carried from the end of the previous chunk so a holding split across a boundary is still findable. */
  overlapChars: number;
};

export const defaultChunkOptions: ChunkOptions = {
  maxChars: 2400,
  minChars: 320,
  overlapChars: 240,
};

/**
 * Paragraph boundaries in judgment text. Blank lines are the reliable signal
 * after whitespace normalisation; numbered-paragraph markers are common but not
 * universal, and older OCR'd text loses them entirely.
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Sentence-ish split, used only when a single paragraph exceeds `maxChars`. */
function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    // Prefer a sentence end, then any whitespace, then a hard cut.
    const at = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('? '),
      window.lastIndexOf('! '),
    );
    const cut =
      at > maxChars * 0.5
        ? at + 1
        : window.lastIndexOf(' ') > 0
          ? window.lastIndexOf(' ')
          : maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces;
}

export function chunkJudgment(
  fullText: string,
  options: ChunkOptions = defaultChunkOptions,
): Chunk[] {
  const { maxChars, minChars, overlapChars } = options;
  const text = fullText.trim();
  if (text.length === 0) return [];

  const units: string[] = [];
  for (const paragraph of splitParagraphs(text)) {
    if (paragraph.length > maxChars) units.push(...splitLongParagraph(paragraph, maxChars));
    else units.push(paragraph);
  }
  // A judgment with no blank lines at all (common in OCR'd scans) still chunks.
  if (units.length === 0) units.push(...splitLongParagraph(text, maxChars));

  const merged: string[] = [];
  let buffer = '';
  for (const unit of units) {
    if (buffer.length === 0) buffer = unit;
    else if (buffer.length + 2 + unit.length <= maxChars) buffer = `${buffer}\n\n${unit}`;
    else {
      merged.push(buffer);
      buffer = unit;
    }
  }
  if (buffer.length > 0) {
    // A short tail ALWAYS joins the previous chunk, even when that pushes the
    // chunk over `maxChars`. `maxChars` is a soft budget with deliberate headroom
    // against the model's 8194 positions; a sub-`minChars` fragment standing as
    // its own vector is the retrieval noise `minChars` exists to prevent. The
    // only case that still emits a short chunk is a judgment with nothing to
    // merge into.
    const last = merged[merged.length - 1];
    if (buffer.length < minChars && last !== undefined) {
      merged[merged.length - 1] = `${last}\n\n${buffer}`;
    } else {
      merged.push(buffer);
    }
  }

  const chunks: Chunk[] = [];
  let searchFrom = 0;
  merged.forEach((body, i) => {
    const tail = i > 0 ? (merged[i - 1] ?? '').slice(-overlapChars) : '';
    const withOverlap = tail.length > 0 ? `${tail}\n\n${body}` : body;
    // Offsets index the ORIGINAL text, so they point at the body, not the overlap.
    const offset = text.indexOf(body, searchFrom);
    searchFrom = offset >= 0 ? offset + body.length : searchFrom;
    chunks.push({ index: i, text: withOverlap, offset: offset >= 0 ? offset : 0 });
  });
  return chunks;
}
