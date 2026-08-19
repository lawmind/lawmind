/**
 * Does a replacement extraction still contain the SCRIPT the original had?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: A REPAIR PASS THAT DELETES HINDI SCORES PERFECTLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `reextract-cli.ts` replaces `full_text` with poppler's `pdftotext` output when
 * two conditions hold: `classifyCorruption` condemns the stored text, and the
 * new text is not SHORTER. Both are necessary. Neither notices script loss.
 *
 * CX1's bake-off measured what poppler actually does to Devanagari documents
 * (`docs/ai/CX1_DEVANAGARI_BAKEOFF.md`, machine evidence in
 * `docs/ai/cx1-devanagari-results/bakeoff-results.json`), and the result is not
 * a degradation, it is an erasure:
 *
 *   - **32 of 32** Devanagari-bearing documents came back with ZERO Devanagari
 *     tokens, against unpdf's 28,285 across the same documents.
 *   - **27 of 32** poppler outputs are pure ASCII — `bytes === chars`, not one
 *     multibyte character in the file.
 *   - On one Allahabad 2023 judgment unpdf returned 138,406 characters carrying
 *     17,869 Devanagari tokens; poppler returned 31,476 carrying none.
 *
 * Neither existing guard stops that write:
 *
 *   - `classifyCorruption` is built entirely on `[A-Za-z]` token shapes and ten
 *     English probe words. Its own header notes it "cannot misfire on
 *     Devanagari" — true, and the reason is that it cannot SEE Devanagari at
 *     all. Poppler output with every Hindi character gone and the English
 *     intact scores CLEAN, correctly, by the only question it asks.
 *   - "never shorter" fails because deleting Devanagari does not always shorten
 *     the file. In the same sample, document `04ceaa01` (Allahabad 2026) went
 *     from 2,252 characters with 8 Devanagari tokens to 2,314 characters with
 *     zero. LONGER, clean, and missing its Hindi. It passes both guards today.
 *
 * One document in 32 is a ~3% exposure against a Devanagari-bearing population
 * measured at 95.3% of Rajasthan and 35.1% of Allahabad
 * (`docs/DEVANAGARI_EXTRACTION_DEFECTS.md` §4). And the loss is unrecoverable in
 * place: `UPDATE judgments SET full_text = ...` writes over the only copy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS AND IS NOT DECIDED HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This module answers ONE question — did the replacement keep the script? — and
 * returns a reason code. It does not fetch, does not write, and does not decide
 * whether a document should be re-extracted at all; that stays with the caller,
 * which is what makes it testable without a database or a PDF.
 *
 * The 80% thresholds are CX1's bake-off gates, adopted verbatim rather than
 * re-derived, and they are gates rather than quality guarantees. `unpdf` itself
 * damages this text — 1,986 orphaned matras and 546 control-byte adjacencies in
 * the same sample — so passing this check means "the replacement did not make it
 * worse by losing script", never "the text is now good".
 */

/**
 * A Devanagari-bearing TOKEN, not a character. Counting characters would let a
 * single surviving danda or digit stand in for a lost sentence; a token is the
 * unit that carries a word, and it is the unit CX1 measured, so the two numbers
 * are comparable.
 */
const DEVANAGARI = /[ऀ-ॿ]/u;

export function devanagariTokens(text: string): number {
  let n = 0;
  for (const token of text.split(/\s+/u)) {
    if (token.length > 0 && DEVANAGARI.test(token)) n++;
  }
  return n;
}

/**
 * Below this many tokens in the ORIGINAL, a retention ratio is noise rather than
 * a rate — the same reasoning as `MIN_TOKENS_TO_JUDGE` in `text-corruption.ts`.
 * A judgment with three Devanagari tokens is an English judgment with a stray
 * name in it, and refusing a repair over one of them would block real work.
 *
 * Deliberately low. The failure being prevented is total erasure, and total
 * erasure of five tokens is still erasure; this is not a threshold at which
 * loss becomes acceptable, only one below which the RATIO stops being meaningful
 * — which is why zero-retention is reported separately below and is never
 * excused by this floor.
 */
export const MIN_ORIGINAL_TOKENS_TO_JUDGE = 5;

/** CX1 bake-off gates. Both must hold for a replacement to be accepted. */
export const MIN_SCRIPT_RETENTION = 0.8;
export const MIN_CHAR_RETENTION = 0.8;

export type ScriptRetentionReason =
  /** The replacement kept the script (or there was none to keep). */
  | 'OK'
  /** The original carried Devanagari and the replacement carries NONE. */
  | 'DEVANAGARI_SCRIPT_LOSS'
  /** Some survived, but below the retention gate. */
  | 'DEVANAGARI_SCRIPT_DEGRADED'
  /** Script held up, but the replacement lost more than a fifth of the text. */
  | 'CHARACTER_LOSS';

export type ScriptRetentionVerdict = {
  readonly accept: boolean;
  readonly reason: ScriptRetentionReason;
  readonly originalDevanagariTokens: number;
  readonly replacementDevanagariTokens: number;
  /** Null when the original had too few tokens for a ratio to mean anything. */
  readonly scriptRetention: number | null;
  readonly charRetention: number;
  /** One line, in the words a human would use. Empty when accepted. */
  readonly detail: string;
};

export function checkScriptRetention(
  original: string,
  replacement: string,
): ScriptRetentionVerdict {
  const originalTokens = devanagariTokens(original);
  const replacementTokens = devanagariTokens(replacement);
  const originalChars = [...original].length;
  const replacementChars = [...replacement].length;
  /**
   * An empty original cannot lose anything, and dividing by it would report
   * `Infinity` or `NaN` as a retention rate — a number that compares favourably
   * against any threshold and would wave the write through.
   */
  const charRetention = originalChars === 0 ? 1 : replacementChars / originalChars;
  const scriptRetention =
    originalTokens >= MIN_ORIGINAL_TOKENS_TO_JUDGE ? replacementTokens / originalTokens : null;

  const base = {
    originalDevanagariTokens: originalTokens,
    replacementDevanagariTokens: replacementTokens,
    scriptRetention,
    charRetention,
  };

  /**
   * TOTAL LOSS IS CHECKED FIRST AND IS NOT SUBJECT TO THE TOKEN FLOOR.
   *
   * This is the measured poppler failure — 32 of 32 documents at exactly zero —
   * and it is a different event from "degraded". A document that had Devanagari
   * and now has none did not extract badly; a whole script is absent, and no
   * ratio floor should be able to excuse it.
   */
  if (originalTokens > 0 && replacementTokens === 0) {
    return {
      ...base,
      accept: false,
      reason: 'DEVANAGARI_SCRIPT_LOSS',
      detail: `original carried ${originalTokens} Devanagari token(s), replacement carries none`,
    };
  }
  if (scriptRetention !== null && scriptRetention < MIN_SCRIPT_RETENTION) {
    return {
      ...base,
      accept: false,
      reason: 'DEVANAGARI_SCRIPT_DEGRADED',
      detail:
        `replacement kept ${replacementTokens}/${originalTokens} Devanagari tokens ` +
        `(${(scriptRetention * 100).toFixed(1)}%, gate ${MIN_SCRIPT_RETENTION * 100}%)`,
    };
  }
  if (charRetention < MIN_CHAR_RETENTION) {
    return {
      ...base,
      accept: false,
      reason: 'CHARACTER_LOSS',
      detail:
        `replacement kept ${replacementChars}/${originalChars} characters ` +
        `(${(charRetention * 100).toFixed(1)}%, gate ${MIN_CHAR_RETENTION * 100}%)`,
    };
  }
  return { ...base, accept: true, reason: 'OK', detail: '' };
}
