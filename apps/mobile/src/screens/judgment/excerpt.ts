/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AN ANNOTATION QUOTE IS THE EXACT PASSAGE THE ADVOCATE SELECTED. NOTHING ELSE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 R24 `CCR-NEW3-R24-02`: `ANNOTATION_QUOTE_SEMANTICS =
 * EXACT_USER_SELECTED_EXCERPT`. The server caps `quote` at 4,000
 * (`annotationBody`, `z.string().min(1).max(4000)`) and that cap was NOT raised.
 * A paragraph longer than that — ¶ 2 of 2022 INSC 690 is ~5,458 characters —
 * used to be sent whole and refused with a `400`.
 *
 * THE SOURCE PARAGRAPH IS THE EVIDENCE AUTHORITY. The quote is only ever
 * `source.slice(start, end)`: no trim, no normalisation, no ellipsis, no
 * "first 4,000", and no text the advocate typed. A quote that is not a
 * contiguous run of the judgment is a fabricated quotation in a matter file.
 *
 * LENGTH IS UTF-16 CODE UNITS on both sides — JavaScript's `.length`, which is
 * what zod's `.max()` counts and what Android's selection offsets index — so the
 * client's 4,000 and the server's 4,000 are the same number.
 */

export const QUOTE_MAX = 4000;

export type ExcerptResult =
  | { ok: true; excerpt: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'out_of_range' };

/** Product copy for the one refusal an advocate can act on. */
export const EXCERPT_TOO_LONG_COPY = 'Select up to 4,000 characters.';

/** A paragraph the server will take whole needs no selection step at all. */
export function needsExcerpt(source: string): boolean {
  return source.length > QUOTE_MAX;
}

/** The server's own rule, mirrored. The boundary guard before every POST. */
export function isSendableQuote(quote: string): boolean {
  return quote.length >= 1 && quote.length <= QUOTE_MAX;
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * An offset between the two halves of a surrogate pair would put a lone
 * surrogate in the quote, which does not survive JSON as itself — so the
 * stored text would no longer be the selected text.
 */
function splitsPair(source: string, offset: number): boolean {
  if (offset <= 0 || offset >= source.length) return false;
  return isHigh(source.charCodeAt(offset - 1)) && isLow(source.charCodeAt(offset));
}

/**
 * THE INVARIANT. `0 <= start < end <= source.length`, and the excerpt is
 * `source.slice(start, end)` with `1 <= length <= QUOTE_MAX`.
 */
export function excerptOf(source: string, start: number, end: number): ExcerptResult {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return { ok: false, reason: 'out_of_range' };
  }
  if (start < 0 || end > source.length || start > end) {
    return { ok: false, reason: 'out_of_range' };
  }
  if (start === end) return { ok: false, reason: 'empty' };
  if (splitsPair(source, start) || splitsPair(source, end)) {
    return { ok: false, reason: 'out_of_range' };
  }
  if (end - start > QUOTE_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, excerpt: source.slice(start, end) };
}
