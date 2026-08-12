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
  /**
   * Length, in characters, of THIS CHUNK'S OWN BODY in the source text —
   * `text.length` is longer than this whenever a chunk carries a previous
   * chunk's overlap tail, so `text.length` cannot be used to recover an exact
   * span. `sourceText.slice(offset, offset + bodyLength)` is exactly the body,
   * verbatim by construction — this is what an "exact span" is built from
   * downstream (`docs/ai/STAGES_9_20_PLAN.md` Stage 13).
   */
  bodyLength: number;
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

/** A span of real text plus exactly where it started in the text it was cut from. */
type Positioned = { text: string; start: number };

/**
 * `raw.trim()`, but keeping the ORIGINAL position of what survives the trim —
 * `base` is where `raw` itself began, and only `raw`'s own leading whitespace
 * needs adding to land on the trimmed text's true start. Pushes nothing for an
 * all-whitespace `raw`.
 *
 * The one primitive both `splitParagraphs` and `splitLongParagraph` build on:
 * every position they report comes from walking the source once, never from
 * re-finding trimmed text inside it afterward. That second step is exactly
 * what silently broke — see the note at `offset` in `Chunk`.
 */
function pushTrimmed(raw: string, base: number, out: Positioned[]): void {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return;
  out.push({ text: trimmed, start: base + (raw.length - raw.trimStart().length) });
}

/**
 * Paragraph boundaries in judgment text. Blank lines are the reliable signal
 * after whitespace normalisation; numbered-paragraph markers are common but not
 * universal, and older OCR'd text loses them entirely.
 *
 * Positions come from the regex match itself, not from searching for the
 * paragraph text afterward — `\n{2,}` matches a variable-length run of
 * newlines, so a paragraph reconstructed from split pieces and rejoined with a
 * canonical `\n\n` is not always found by `indexOf` in text whose real
 * separators ran longer or carried trailing spaces on the blank line. That
 * used to be exactly how `offset` went wrong.
 */
function splitParagraphs(text: string): Positioned[] {
  const parts: Positioned[] = [];
  const re = /\n{2,}/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    pushTrimmed(text.slice(cursor, m.index), cursor, parts);
    cursor = re.lastIndex;
  }
  pushTrimmed(text.slice(cursor), cursor, parts);
  return parts;
}

/**
 * Sentence-ish split, used only when a single paragraph exceeds `maxChars`.
 * `start` in each returned piece is an offset into `paragraph`, not the source
 * text — the caller (`chunkJudgment`) adds the paragraph's own start to it.
 */
function splitLongParagraph(paragraph: string, maxChars: number): Positioned[] {
  const pieces: Positioned[] = [];
  let cursor = 0;
  while (paragraph.length - cursor > maxChars) {
    const window = paragraph.slice(cursor, cursor + maxChars);
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
    pushTrimmed(paragraph.slice(cursor, cursor + cut), cursor, pieces);
    cursor += cut;
    // Mirrors the old `rest = rest.slice(cut).trim()`: leading whitespace on
    // the remainder is skipped before the next window is cut, not left for
    // the next `pushTrimmed` to report as part of a later piece's start.
    while (cursor < paragraph.length && /\s/.test(paragraph[cursor]!)) cursor++;
  }
  pushTrimmed(paragraph.slice(cursor), cursor, pieces);
  return pieces;
}

export function chunkJudgment(
  fullText: string,
  options: ChunkOptions = defaultChunkOptions,
): Chunk[] {
  const { maxChars, minChars, overlapChars } = options;
  // Where the trimmed text actually begins in `fullText` -- every position
  // computed below is relative to `text`, so this is added back in once, at
  // the end, rather than carried through every intermediate step.
  const textStart = fullText.length - fullText.trimStart().length;
  const text = fullText.trim();
  if (text.length === 0) return [];

  const units: Positioned[] = [];
  for (const paragraph of splitParagraphs(text)) {
    if (paragraph.text.length > maxChars) {
      // Pieces come back positioned within `paragraph.text`; shift to `text`.
      for (const piece of splitLongParagraph(paragraph.text, maxChars)) {
        units.push({ text: piece.text, start: paragraph.start + piece.start });
      }
    } else {
      units.push(paragraph);
    }
  }
  // A judgment with no blank lines at all (common in OCR'd scans) still chunks.
  if (units.length === 0) units.push(...splitLongParagraph(text, maxChars));

  const merged: Positioned[] = [];
  let buffer: Positioned | null = null;
  for (const unit of units) {
    if (buffer === null) buffer = unit;
    else if (buffer.text.length + 2 + unit.text.length <= maxChars) {
      // The merged buffer's position is where it STARTS -- appending a later
      // unit never moves that, so `start` is carried forward untouched.
      buffer = { text: `${buffer.text}\n\n${unit.text}`, start: buffer.start };
    } else {
      merged.push(buffer);
      buffer = unit;
    }
  }
  if (buffer !== null && buffer.text.length > 0) {
    // A short tail ALWAYS joins the previous chunk, even when that pushes the
    // chunk over `maxChars`. `maxChars` is a soft budget with deliberate headroom
    // against the model's 8194 positions; a sub-`minChars` fragment standing as
    // its own vector is the retrieval noise `minChars` exists to prevent. The
    // only case that still emits a short chunk is a judgment with nothing to
    // merge into.
    const last = merged[merged.length - 1];
    if (buffer.text.length < minChars && last !== undefined) {
      merged[merged.length - 1] = { text: `${last.text}\n\n${buffer.text}`, start: last.start };
    } else {
      merged.push(buffer);
    }
  }

  const chunks: Chunk[] = [];
  merged.forEach((body, i) => {
    const tail = i > 0 ? (merged[i - 1]?.text ?? '').slice(-overlapChars) : '';
    const withOverlap = tail.length > 0 ? `${tail}\n\n${body.text}` : body.text;
    // `body.start` was computed relative to `text`; `textStart` is the ONLY
    // place fullText's own leading whitespace is accounted for. No `indexOf`
    // anywhere in this path — the position was known from the moment the
    // paragraph split happened, never re-derived by searching for it.
    chunks.push({
      index: i,
      text: withOverlap,
      offset: textStart + body.start,
      bodyLength: body.text.length,
    });
  });
  return chunks;
}
