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
  // Reporter running heads, with or without the page number typeset onto the
  // same line: "918 SUPREME COURT REPORTS [2023] 5 S.C.R."
  /^\d{0,5}\s*SUPREME COURT REPORTS(\s+\[\d{4}\].*)?$/i,
  /^\[\d{4}\]\s+\d+\s+S\.?C\.?R\.?/i,
  /^\d{4}\s+INSC\s+\d+$/i,
];

function isFurniture(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return true;
  return FURNITURE.some((re) => re.test(t));
}

/**
 * Reporter furniture that survives INSIDE a line, and hard wraps.
 *
 * `isFurniture` only rejects whole lines, which is enough to segment but not
 * enough to show. The client lane found the gap by rendering it: the retrieved
 * text came back as ~2,600 characters carrying marginal reference letters
 * stranded at line ends, bracketed pinpoints, and words split across a hard wrap.
 * Their verdict was right — *"non-empty isn't usable"* — and they declined to set
 * it behind an oxblood rule as the court's own words. This is what makes it
 * showable.
 *
 * **Conservative by construction.** Every rule here removes typesetting, never
 * language. Where a rule could plausibly touch real text it is narrowed until it
 * cannot: a marginal letter is only stripped from a line long enough to be
 * wrapped prose, so a short line that genuinely ends in a capital — an initial, a
 * clause label — is left alone.
 */
export function cleanExtractedText(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];

  for (const raw of lines) {
    let line = raw.trim();
    if (isFurniture(line)) continue;

    // Marginal reference letters (A–H down the page edge) land at the end of a
    // wrapped line: "…authority of Custom Officers D". Only on a line long
    // enough to be prose, so "Shri A" or a bare label survives untouched.
    if (line.length >= 30) line = line.replace(/\s+[A-H]$/, '');
    // The same letters occasionally land at the start of a continuation line.
    if (line.length >= 30) line = line.replace(/^[A-H]\s+(?=[a-z])/, '');

    // Reporter pinpoints: "[Paras 63 and 64] [205,F; 205,D-E]". These address the
    // printed page, not the judgment, and mean nothing on a phone.
    line = line.replace(/\[\s*\d+\s*,\s*[A-H](\s*[-–]\s*[A-H])?\s*(;[^\]]*)?\]/g, '');
    line = line.replace(/\[\s*Paras?\s+[\d\s,and-]+\]/gi, '');

    // Stray extraction artefacts: a lone bracket or brace on its own.
    if (/^[({[\]})\-{}|~]{1,3}$/.test(line)) continue;

    line = line.replace(/\s{2,}/g, ' ').trim();
    if (line.length > 0) kept.push(line);
  }

  return (
    kept
      .join('\n')
      // A word broken across a hard wrap: "condi-\ntion" -> "condition". Requires
      // lowercase both sides, so a genuine hyphenated compound at a line end
      // ("Union-\nTerritory") is not silently welded.
      .replace(/([a-z])-\n([a-z])/g, '$1$2')
      // Remaining hard wraps inside a sentence become spaces; a line ending in
      // sentence punctuation keeps its break.
      .replace(/([^.!?:;"'\])])\n(?=[a-z(])/g, '$1 ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Drop a partial sentence from the front of a retrieved chunk.
 *
 * A chunk begins wherever the chunker cut, which is routinely mid-word:
 * *"ion to arrest without warrant…"*, *"riod of 90 days."* That is fine as a
 * search unit and indefensible as a quotation — an advocate reading it cannot
 * tell a truncation from the court's own phrasing.
 *
 * Only applied to the CHUNK fallback. A located paragraph begins where the court
 * began it and must not be trimmed.
 *
 * Conservative: if no sentence boundary is found in the first quarter, the text
 * is returned untouched rather than cut at a guess.
 */
export function trimToSentenceStart(text: string): string {
  const window = text.slice(0, Math.max(200, Math.floor(text.length / 4)));
  // A sentence end followed by a capital or an opening quote.
  const m = /[.!?]["')\]]?\s+(?=["'(]?[A-Z0-9])/.exec(window);
  if (!m) return text;
  return text.slice(m.index + m[0].length).trim();
}

/**
 * The printed paragraph that contains `chunk`, or null when it cannot be located.
 *
 * A retrieved chunk is a fixed-size window over the text. It starts and ends
 * wherever the chunker happened to cut, which is usually mid-sentence and often
 * across a paragraph boundary — so it is the right unit to SEARCH and the wrong
 * unit to SHOW. This maps one back to the other.
 *
 * Returns null rather than guessing. A judgment whose numbering could not be read
 * has no paragraph to point at, and inventing one is the failure this product
 * exists to prevent: an advocate told "see paragraph 22" must land on the
 * paragraph the court numbered 22.
 */
/**
 * Above this, a "paragraph" is a segmentation failure rather than a long paragraph.
 *
 * Measured against the corpus: locating a match in *Sushila Aggarwal* returned a
 * single block of 65,689 characters, and *Enforcement Directorate v. Kapil
 * Wadhawan* one of 19,109. Neither is a paragraph. Both are what
 * `segmentParagraphs` produces when it cannot read the printed numbering and
 * falls back to one undifferentiated block — which it does honestly, and which is
 * useless to show.
 *
 * Reported paragraphs run to a few thousand characters at the outside. So this is
 * not a display truncation, it is a **detector**: over this length, we did not
 * identify a paragraph, and saying so is the honest answer.
 */
const MAX_PARAGRAPH_CHARS = 3_000;

export function locateParagraph(fullText: string, chunk: string): JudgmentParagraph | null {
  // Match on a distinctive interior slice rather than the whole chunk: the ends
  // are where furniture and hard wraps differ between the stored chunk and the
  // segmented text, and the middle is stable.
  const normalise = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const needle = normalise(chunk);
  if (needle.length < 40) return null;
  const probe = needle.slice(Math.floor(needle.length / 4), Math.floor(needle.length / 4) + 60);

  const paragraphs = segmentParagraphs(fullText);
  for (const p of paragraphs) {
    if (!normalise(p.text).includes(probe)) continue;
    // Located, but only usable if it is actually a paragraph. See the note above.
    return p.text.length <= MAX_PARAGRAPH_CHARS ? p : null;
  }
  return null;
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

/**
 * One paragraph block, mid-construction, carrying where in `fullText` it
 * started. Shared by `segmentParagraphs` (which discards the offset — its
 * contract predates offsets and callers rely on the shape) and
 * `locateParagraphByOffset` (which needs the offset to answer "which
 * paragraph contains this exact character position" without re-scanning text).
 */
type ParagraphBlock = { number: number | null; lines: string[]; start: number };

function buildParagraphBlocks(fullText: string): ParagraphBlock[] {
  const lines = fullText.split('\n');
  const blocks: ParagraphBlock[] = [];
  let current: ParagraphBlock | null = null;
  let lastNumber: number | null = null;
  // Running offset into fullText. `+1` per line replaces the '\n' that
  // split('\n') consumed, so this reconstructs exact original offsets
  // regardless of '\r\n' line endings (the '\r' rides along inside `raw`).
  let pos = 0;

  for (const raw of lines) {
    const lineStart = pos;
    pos += raw.length + 1;

    const line = raw.trim();
    if (isFurniture(line)) continue;

    const opener = OPENER.exec(line);
    const candidate = opener ? Number(opener[1]) : null;

    if (candidate !== null && advances(lastNumber, candidate)) {
      if (current) blocks.push(current);
      current = { number: candidate, lines: [line.slice(opener![0].length)], start: lineStart };
      lastNumber = candidate;
    } else if (current) {
      current.lines.push(line);
    } else {
      // Text before the first numbered paragraph — the headnote, the bench, the
      // case title. Real content, never numbered, so it carries a null number
      // rather than being dropped or given a made-up one.
      current = { number: null, lines: [line], start: lineStart };
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

export function segmentParagraphs(fullText: string): JudgmentParagraph[] {
  return buildParagraphBlocks(fullText)
    .map((b) => ({ number: b.number, text: b.lines.join('\n').trim() }))
    .filter((b) => b.text.length > 0)
    .map((b, i) => ({ paragraphNumber: b.number, paragraphIndex: i, text: b.text }));
}

/**
 * The exact substring `fullText.slice(charOffset, charOffset + charLength)`,
 * or null when the span cannot possibly be real.
 *
 * Stage 13: `judgment_chunks.char_offset`/`char_length` are computed once at
 * embed time by `chunkJudgment` and never re-derived here — this only
 * validates bounds and slices. **Never approximated.** A span that fails the
 * bounds check (stale row, truncated `full_text`, corrupt data) returns null
 * rather than a clamped or shifted guess, so the caller can render an honest
 * "unavailable" instead of text that does not actually sit at that position.
 */
export function resolveExactSpan(
  fullText: string,
  charOffset: number,
  charLength: number,
): { text: string; charOffset: number } | null {
  if (!Number.isInteger(charOffset) || !Number.isInteger(charLength)) return null;
  if (charOffset < 0 || charLength <= 0) return null;
  if (charOffset + charLength > fullText.length) return null;
  return { text: fullText.slice(charOffset, charOffset + charLength), charOffset };
}

/**
 * The printed paragraph containing character position `charOffset`, located
 * EXACTLY — no substring probing.
 *
 * This is `locateParagraph`'s sibling for chunks that carry a verified
 * `char_offset`/`char_length` (Stage 13 backfill). Where `locateParagraph`
 * fuzzy-matches a normalised interior slice of the chunk against the
 * segmented text — necessary when only `chunk_text` is known, but capable of
 * matching the wrong occurrence in a judgment that repeats a phrase —
 * this instead walks the same paragraph blocks `segmentParagraphs` builds and
 * picks the one whose span in `fullText` actually contains the offset.
 * Deterministic: the same offset always resolves to the same paragraph.
 *
 * Returns null when the span itself is invalid (see `resolveExactSpan`), when
 * segmentation produced no real paragraphs, or when the containing block
 * exceeds `MAX_PARAGRAPH_CHARS` — the same "this is not a paragraph, it is a
 * segmentation failure" guard `locateParagraph` applies.
 */
export function locateParagraphByOffset(
  fullText: string,
  charOffset: number,
  charLength: number,
): JudgmentParagraph | null {
  if (!resolveExactSpan(fullText, charOffset, charLength)) return null;

  const blocks = buildParagraphBlocks(fullText)
    .map((b) => ({ number: b.number, text: b.lines.join('\n').trim(), start: b.start }))
    .filter((b) => b.text.length > 0);
  if (blocks.length === 0) return null;

  // Blocks are produced in ascending `start` order (lines are walked in
  // order), so the containing block is the last one whose start is at or
  // before the offset.
  let index = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.start <= charOffset) index = i;
    else break;
  }
  // The offset falls before any real paragraph text — e.g. inside reporter
  // furniture at the very top of the document, before the headnote block
  // begins. Genuinely no paragraph to point at; not a bug to paper over.
  if (index === -1) return null;

  const block = blocks[index]!;
  if (block.text.length > MAX_PARAGRAPH_CHARS) return null;
  return { paragraphNumber: block.number, paragraphIndex: index, text: block.text };
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
