/**
 * A measured proxy for how damaged extracted text looks.
 *
 * This exists because `ocr_confidence` could not be populated honestly. The
 * corpus arrives as PDFs whose pre-2010 text was OCR'd by somebody else with no
 * confidence attached, and inventing a number for a column that means *engine
 * confidence* — then ranking retrieval on it — would be fabricating data.
 *
 * What this DOES measure: visible corruption. OCR damage has a signature —
 * interior punctuation inside a word (`l't`), a case flip mid-word
 * (`KANDOKOlU`), stray single letters where a column rule was read as text.
 *
 * What it does NOT measure: correctness. An engine reading `1985` as `1935`
 * produces a perfectly well-formed token and scores 1.000. This is why the field
 * is called quality and not accuracy, and why retrieval down-ranks on it rather
 * than excluding on it. `docs/SCHEMA_TRUTH.md` §judgment_chunks.
 */

/** A token is "damaged-looking" if it carries either OCR signature. */
function looksDamaged(token: string): boolean {
  // Interior punctuation between letters: l't, Oot., co-­accused artefacts.
  if (/[A-Za-z][^A-Za-z\s'’-][A-Za-z]/.test(token)) return true;
  // Lower-to-upper flip mid-word: KANDOKOlU, tHe.
  if (/[a-z][A-Z]/.test(token)) return true;
  return false;
}

/**
 * 1.000 is clean, 0.000 is entirely damaged-looking.
 *
 * Text with no alphabetic tokens at all returns null rather than 1.000: a score
 * of "perfect" for something we could not assess would be the same dishonesty
 * this column exists to avoid.
 */
export function textQuality(text: string): number | null {
  const tokens = text.split(/\s+/).filter((t) => /[A-Za-z]/.test(t));
  if (tokens.length === 0) return null;
  const damaged = tokens.filter(looksDamaged).length;
  const score = 1 - damaged / tokens.length;
  // numeric(4,3) — three decimals, clamped into range.
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
}
