/**
 * LAWMIND — the legal text formatter.
 *
 * Corpus text arrives straight and must be transformed ONCE, predictably. This
 * is the only place in the client that touches a judgment string.
 *
 * A screen that hand-types a curly quote is a defect. So is a screen that
 * inserts its own non-breaking space, en dash or hair space. Call `legalText()`
 * — or just use `<Text variant="legal">`, which calls it for you.
 *
 * Rules 1, 4, 5 and 6 of `design/DESIGN_SYSTEM.md` §Micro-typography live here.
 * Rules 2 (optical baseline) and 3 (tabular figures) are rendering, not string
 * transformation, and live in `Text.tsx`.
 */

const NBSP = ' ';
/** U+200A. An em dash in prose is hair-spaced, never set tight and never a hyphen. */
const HAIR = ' ';
const EN_DASH = '–';
const EM_DASH = '—';

const OPENING_QUOTES = ['“', '‘'];

export type LegalText = {
  /** The transformed string. Render this, never the input. */
  text: string;
  /**
   * True when the string opens with a quotation mark. `Text.tsx` then hangs
   * that glyph outside the measure so the text edge is true — otherwise the
   * first line is visibly pushed in.
   */
  hanging: boolean;
  /** The hung glyph, already removed from `text`. Empty when `hanging` is false. */
  hangingGlyph: string;
};

/** Rule 6 — typographic quotes and apostrophes. Curly throughout. */
function curlyQuotes(s: string): string {
  return (
    s
      // Apostrophe inside a word: husband's, not husband's.
      .replace(/(\p{L})'(\p{L})/gu, '$1’$2')
      // Possessive on a plural: the parties' case.
      .replace(/(\p{L})'(?=\s|$|[,.;:)\]])/gu, '$1’')
      // Elision: '73, 'tis.
      .replace(/(^|[\s(\[])'(?=\d|\p{L})/gu, '$1‘')
      // Remaining singles pair off.
      .replace(/'/g, '’')
      // Doubles alternate open/close.
      .replace(/"([^"]*)"/g, '“$1”')
      .replace(/"/g, '”')
  );
}

/**
 * Rule 5 — correct dashes.
 * En dash in a citation range; hair-spaced em dash in prose. Never a hyphen for
 * either. A digit-hyphen-digit run in legal prose is a range without exception —
 * years, paragraphs, pages. A hyphen followed by a letter (302-A) is not.
 */
function dashes(s: string): string {
  return s
    .replace(/(\d)\s*-\s*(?=\d)/g, `$1${EN_DASH}`)
    .replace(/\s+(?:--|-|—)\s+/g, `${HAIR}${EM_DASH}${HAIR}`);
}

/**
 * Non-breaking spaces after "section", "Procedure," and inside "Penal Code".
 * A section number must never orphan from its section.
 */
function bindLegalPhrases(s: string): string {
  return s
    .replace(/\b([Ss]ections?)\s+(?=\d)/g, `$1${NBSP}`)
    .replace(/\bProcedure,\s+(?=\d)/g, `Procedure,${NBSP}`)
    .replace(/\bPenal\s+Code\b/g, `Penal${NBSP}Code`);
}

/**
 * Rule 4 — widow control, half of it. A hard non-breaking space binds the last
 * two words; `text-wrap: pretty` does the rest where the platform has it.
 * Neither alone is sufficient.
 */
function bindWidow(s: string): string {
  const trimmed = s.trimEnd();
  const tail = s.slice(trimmed.length);
  const i = trimmed.lastIndexOf(' ');
  if (i <= 0) return s;
  // Already bound, or the last "word" is a lone punctuation mark.
  if (!/\S/.test(trimmed.slice(i + 1))) return s;
  return `${trimmed.slice(0, i)}${NBSP}${trimmed.slice(i + 1)}${tail}`;
}

/**
 * Rule 1 — hanging punctuation. Detected here, applied in `Text.tsx`, because
 * hanging a glyph is a layout act and this module returns strings.
 */
function detectHanging(s: string): { text: string; hanging: boolean; hangingGlyph: string } {
  const first = s.charAt(0);
  if (!OPENING_QUOTES.includes(first)) return { text: s, hanging: false, hangingGlyph: '' };
  return { text: s.slice(1), hanging: true, hangingGlyph: first };
}

/** The whole formatter. Order matters: quotes, then dashes, then bindings, then widow. */
export function legalText(input: string): LegalText {
  if (!input) return { text: '', hanging: false, hangingGlyph: '' };
  const transformed = bindWidow(bindLegalPhrases(dashes(curlyQuotes(input))));
  return detectHanging(transformed);
}
