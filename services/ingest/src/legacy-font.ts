/**
 * LEGACY_FONT_SUSPECT — the extraction failure that scores a perfect grade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THIRD FAILURE MODE, AND WHY THE FIRST TWO DETECTORS CANNOT SEE IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two extraction failures are already instrumented in this service:
 *
 *   TOO SHORT     the extractor produced almost nothing. Caught by a length floor.
 *   SCRIPT LOST   the source held Devanagari and the output holds none. Caught by
 *                 `script-retention.ts` — Poppler deletes the script entirely.
 *
 * NEW3 found a third (bus 0678, 0682) and it defeats both: a judgment typed in a
 * **legacy 8-bit Devanagari font** — Kruti Dev, DevLys, Chanakya and their
 * relatives — extracts as text that is
 *
 *   long          (thousands of characters: the length floor passes)
 *   clean         (no replacement characters, no defect counters fire)
 *   pure ASCII    (so "output has zero Devanagari" is TRUE and expected, because
 *                 the SOURCE has zero Devanagari too — the Hindi is encoded as
 *                 Latin bytes that a glyph table renders as Devanagari)
 *
 * `script-retention.ts` compares Devanagari in to Devanagari out. Here it is
 * zero in and zero out, which that function correctly scores as perfect
 * retention. **It is not wrong; it is being asked the wrong question.** The
 * document is Hindi, the extraction is garbage, and every quality signal we own
 * says the row is fine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE VERDICT IS BUILT ON THE PDF, NOT ON THE TEXT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A text-only rule has to answer "is this ASCII gibberish or is it English", and
 * the standing direction is explicit that it must not be made by assumption:
 * **do not assume every ASCII judgment from Chhattisgarh is broken Hindi.**
 * Chhattisgarh publishes in both languages and the English judgments are
 * genuinely English.
 *
 * The PDF says which it is, without inference. A legacy-font document carries
 * the font's own name in its font dictionary —
 *
 *     /BaseFont /ABCDEF+Kruti_Dev_010
 *
 * — and characteristically carries **no `/ToUnicode` map**, because there is no
 * Unicode meaning to map to: the byte `g` is a glyph index, not a letter. Those
 * two facts are read off the file. Nothing about them is a judgement call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TEXT MARKERS ARE MINED, NOT REMEMBERED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A text signature is still wanted — the PDF is 100 KB and the text is already
 * in the database, so a text-side screen is what makes this affordable across
 * 15M rows. But the marker list is **derived from PDF-labelled documents by
 * `legacy-font-pilot-cli.ts`**, never typed in from what these encodings are
 * remembered to produce.
 *
 * That is this repo's own most expensive lesson, twice paid: `hc-classify.ts`'s
 * MEASURED_VOCABULARY records a court-vocabulary pattern written from reasoning
 * that was wrong in both directions at once, and `LANE_PROTOCOL.md` §3b records
 * the first time. A recalled `Kruti Dev` mapping table would be exactly the same
 * mistake in a new costume, and it would be invisible: a wrong marker produces a
 * confident label on a correct English judgment.
 *
 * So `mineMarkers()` below takes labelled positives and negatives and returns
 * what actually separates them. The shipped list lives in the pilot's output
 * with the sample size and court/year spread that produced it, which is the
 * provenance NEW1 asked for (bus 0676): *"whatever produced each verdict, as
 * data"* — a quality field whose only explanation is a rerun of its classifier
 * has cost more than it saved.
 */

/**
 * Legacy 8-bit Devanagari font families, matched against a PDF's `/BaseFont`.
 *
 * These are FONT NAMES, which is what makes the list safe to write down: it is
 * not a claim about what any encoding produces, only about what a font is
 * called, and a name that is absent costs a missed detection rather than a false
 * one. The pilot reports every font name it saw that is NOT on this list, so the
 * list grows from measurement.
 *
 * Subset-prefixed names (`ABCDEF+Kruti_Dev_010`) and the several separator
 * spellings courts use (`Kruti Dev`, `KrutiDev`, `Kruti_Dev`) are handled by
 * stripping non-alphanumerics before the test rather than by enumerating them.
 */
export const LEGACY_FONT_FAMILIES = [
  'krutidev',
  'devlys',
  'chanakya',
  'walkmanchanakya',
  'shreedev',
  'shreelipi',
  'agra',
  'kundli',
  'apsdv',
  'millennium',
  'sanskrit99',
] as const;

/** `ABCDEF+Kruti_Dev_010` -> `krutidev010`. Subset tag and separators removed. */
function normaliseFontName(raw: string): string {
  return raw
    .replace(/^[A-Z]{6}\+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export type PdfFontEvidence = {
  /** Every `/BaseFont` name found, as printed in the file. */
  fonts: string[];
  /** The subset of `fonts` matching a known legacy family. */
  legacyFonts: string[];
  /** How many font dictionaries carry a `/ToUnicode` entry. */
  toUnicodeCount: number;
  /** How many `/BaseFont` entries were seen at all. */
  fontCount: number;
  /** True when the file declares fonts and NONE of them maps to Unicode. */
  noToUnicode: boolean;
};

/**
 * Reads font evidence straight out of the PDF bytes.
 *
 * **Deliberately not pdf.js.** `unpdf` is already a dependency and could be
 * asked for the same information, but reaching it means rendering an operator
 * list per page — the exact code path that hangs this fleet forever on a
 * malformed embedded font (`hc-metadata.ts`, `Math.sumPrecise`). A detector for
 * broken fonts must not be built on the component that breaks on broken fonts.
 *
 * A byte scan cannot hang, cannot allocate a page, and needs nothing decoded.
 * It also cannot see fonts inside an object stream compressed with
 * `/ObjStm` — a real limit, reported honestly as `fontCount: 0` rather than as
 * `noToUnicode: true`, so a file this cannot read never produces a verdict.
 */
export function pdfFontEvidence(bytes: Uint8Array): PdfFontEvidence {
  /* latin1 so every byte maps to one character and offsets stay meaningful;
   * utf8 would replace invalid sequences and shift everything after them. */
  const raw = Buffer.from(bytes).toString('latin1');
  const fonts = [...raw.matchAll(/\/BaseFont\s*\/([#A-Za-z0-9+._-]+)/g)].map((m) => m[1] ?? '');
  const legacyFonts = fonts.filter((f) => {
    const n = normaliseFontName(f);
    return LEGACY_FONT_FAMILIES.some((fam) => n.includes(fam));
  });
  const toUnicodeCount = (raw.match(/\/ToUnicode/g) ?? []).length;
  return {
    fonts: [...new Set(fonts)],
    legacyFonts: [...new Set(legacyFonts)],
    toUnicodeCount,
    fontCount: fonts.length,
    noToUnicode: fonts.length > 0 && toUnicodeCount === 0,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MINED_MARKERS — produced by `legacy-font-pilot-cli.ts`, 18 Aug 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Not written by hand and not recalled from what these encodings are supposed
 * to produce.** `mineMarkers()` was given 197 documents whose class was read off
 * their PDF font dictionaries — 5 declaring a legacy family, 192 declaring only
 * ordinary Unicode-mapped fonts — and returned the ASCII tokens that separate
 * them. Full run, with the sample spread and every font name seen, in
 * `docs/ops/migration/new2-legacy-font-pilot.json`.
 *
 * Measured performance of the text-only screen using exactly this list, scored
 * against those PDF labels:
 *
 *   recall           3 / 5     (60.0%)
 *   FALSE POSITIVES  0 / 192   (0.0%)
 *
 * That shape is the one the direction asks for and the one this corpus can
 * afford: **a missed legacy document stays UNKNOWN, which is acceptable; a clean
 * English judgment labelled as garbled Hindi is not.** Recall is deliberately
 * the axis being spent.
 *
 * **Two facts from the run that contradict the working assumption and are worth
 * keeping in front of whoever extends this:**
 *
 *  1. **All five confirmed documents are RAJASTHAN.** Chhattisgarh — the court
 *     the failure mode was first suspected in — contributed zero in this sample.
 *     The standing warning not to assume every ASCII Chhattisgarh judgment is
 *     broken Hindi is not merely a caution; it is what the measurement says.
 *
 *  2. **The documents are MIXED, not garbled end to end.** Their English
 *     captions extract perfectly — `HIGH COURT OF JUDICATURE FOR RAJASTHAN /
 *     S.B. Criminal Revision Petition No. 1208/2022` — and the Hindi body is
 *     Kruti Dev underneath. One sampled document opens
 *     `jktLFkku mPp U;k;ky;] t;iqj ihB` (राजस्थान उच्च न्यायालय, जयपुर पीठ). That is
 *     why recall is 3 of 5: in two of them the readable English dilutes the
 *     marker density below threshold. It is also why this matters for
 *     retrieval — such a document is FINDABLE by its caption and its reasoning
 *     is unreadable, which is worse than being absent.
 *
 * Re-run the pilot to extend this; do not append to it by hand.
 */
export const MINED_MARKERS = [
  'fopkj', 'ky', 'fof', 'izdj', 'iqj', 'kjk', 'fu', 'la', 'esa', 'ikfjr',
  'kz', 'ftlds', 'rgr', 'dh', 'vksj', 'izlrqr', 'ij', 'vfhk', 'qdr', 'kkjk',
  'vf', 'kfu', 'gq', 'kkj', 'oa', 'fd', 'gs', 'vihy', 'fnukad', 'kd',
  'lohdkj', 'gsa', 'kksa', 'vijk', 'rfkk', 'vkns', 'tk', 'ifj', 'kker', 'dksbz',
] as const;

export type TextSignature = {
  chars: number;
  /** Fraction of characters that are plain ASCII. */
  asciiRatio: number;
  /** True when the text carries no Devanagari at all. */
  zeroDevanagari: boolean;
  /** Which mined markers appear, and how often. */
  markerHits: { marker: string; count: number }[];
  /** Marker occurrences per 1,000 characters. Density, not presence. */
  markerRate: number;
};

const DEVANAGARI = /[ऀ-ॿ]/u;

/**
 * Scores text against a marker list.
 *
 * `markerRate` rather than "any marker present" on purpose. Every marker is a
 * short Latin string, and short Latin strings occur in English by accident —
 * once. What separates a Kruti Dev document from an English one is that the
 * markers appear on every line, hundreds of times, because they encode the
 * commonest words in the language. Presence is noise; density is the signal.
 */
export function textSignature(text: string, markers: readonly string[]): TextSignature {
  const chars = text.length;
  let ascii = 0;
  for (let i = 0; i < chars; i++) if (text.charCodeAt(i) < 128) ascii++;

  const markerHits: { marker: string; count: number }[] = [];
  let total = 0;
  for (const m of markers) {
    /* Word-ish boundaries: these markers are whole words in the source language,
     * and an unbounded substring test would count `ds` inside `funds`. */
    const re = new RegExp(`(^|[^A-Za-z])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`, 'g');
    const count = (text.match(re) ?? []).length;
    if (count > 0) {
      markerHits.push({ marker: m, count });
      total += count;
    }
  }

  return {
    chars,
    asciiRatio: chars === 0 ? 1 : ascii / chars,
    zeroDevanagari: !DEVANAGARI.test(text),
    markerHits: markerHits.sort((a, b) => b.count - a.count),
    markerRate: chars === 0 ? 0 : (1000 * total) / chars,
  };
}

export type LegacyFontVerdict = {
  /** `suspect` never means confirmed. Only PDF evidence confirms. */
  verdict: 'legacy_font_confirmed' | 'legacy_font_suspect' | 'clean' | 'unknown';
  reason: string;
  evidence: { pdf?: PdfFontEvidence; text?: TextSignature };
};

/**
 * Minimum marker density before text alone will call a document suspect.
 *
 * Set by the pilot from the measured separation between labelled positives and
 * negatives, not chosen. Exported so the pilot can report which threshold its
 * numbers were computed at — a constant whose provenance is "it looked right"
 * is the thing this module exists to avoid.
 */
export const SUSPECT_MARKER_RATE = 4;

/**
 * Combines the two sources, and the ORDER is the safety property.
 *
 * PDF evidence outranks text evidence absolutely. A file that declares a legacy
 * font IS a legacy-font document whatever its text looks like, and a file that
 * declares only Unicode-mapped fonts is clean however suspicious its text reads.
 * Text is consulted ONLY when there is no PDF to consult — that is the 15M-row
 * screening case, and it returns `suspect`, never `confirmed`.
 *
 * `unknown` is a real answer and is returned rather than defaulted to `clean`.
 * A PDF this cannot parse and a PDF with no legacy font are different facts, and
 * `NOT INDEXED MUST NOT BECOME NOT RELEVANT` applies one level down: *not
 * checked* must not become *checked and fine*.
 */
export function classifyLegacyFont(input: {
  pdf?: PdfFontEvidence;
  text?: TextSignature;
}): LegacyFontVerdict {
  const { pdf, text } = input;

  if (pdf && pdf.legacyFonts.length > 0) {
    return {
      verdict: 'legacy_font_confirmed',
      reason: `PDF declares legacy font(s): ${pdf.legacyFonts.join(', ')}`,
      evidence: { ...(pdf ? { pdf } : {}), ...(text ? { text } : {}) },
    };
  }

  if (pdf && pdf.fontCount > 0) {
    /* Fonts declared, none legacy. `noToUnicode` alone is NOT enough to convict:
     * a plain Latin Type1 font legitimately omits ToUnicode and extracts fine.
     * It is recorded as evidence and left for the pilot to correlate. */
    return {
      verdict: 'clean',
      reason: `PDF declares ${pdf.fontCount} font(s), none from a legacy family`,
      evidence: { pdf, ...(text ? { text } : {}) },
    };
  }

  if (text && text.zeroDevanagari && text.markerRate >= SUSPECT_MARKER_RATE) {
    return {
      verdict: 'legacy_font_suspect',
      reason:
        `no PDF evidence; text is ${(100 * text.asciiRatio).toFixed(1)}% ASCII with ` +
        `${text.markerRate.toFixed(1)} legacy markers per 1,000 chars`,
      evidence: { text },
    };
  }

  if (text) {
    return {
      verdict: 'clean',
      reason: `no PDF evidence; marker rate ${text.markerRate.toFixed(1)} is below ${SUSPECT_MARKER_RATE}`,
      evidence: { text },
    };
  }

  return { verdict: 'unknown', reason: 'no PDF evidence and no text supplied', evidence: {} };
}

/**
 * Finds the ASCII tokens that separate labelled positives from labelled
 * negatives. This is what produces the marker list; nothing is written by hand.
 *
 * Returns tokens ranked by how lopsided they are — present in a large share of
 * positive documents and a small share of negative ones. **Document frequency,
 * not raw count**, and the reason is LCC's `lexeme_document_frequency` finding
 * on the sparse arm: selecting terms by how OFTEN they occur picks the terms
 * that occur everywhere. One judgment repeating a word 900 times must not be
 * able to nominate a marker on its own.
 */
export function mineMarkers(
  positives: readonly string[],
  negatives: readonly string[],
  opts: { minLength?: number; maxLength?: number; minPositiveShare?: number; maxNegativeShare?: number; top?: number } = {},
): { marker: string; positiveShare: number; negativeShare: number; lift: number }[] {
  const minLength = opts.minLength ?? 2;
  const maxLength = opts.maxLength ?? 6;
  const minPositiveShare = opts.minPositiveShare ?? 0.5;
  const maxNegativeShare = opts.maxNegativeShare ?? 0.02;
  const top = opts.top ?? 40;

  const docFreq = (docs: readonly string[]) => {
    const seen = new Map<string, number>();
    for (const d of docs) {
      const tokens = new Set(
        (d.toLowerCase().match(/[a-z]+/g) ?? []).filter((t) => t.length >= minLength && t.length <= maxLength),
      );
      for (const t of tokens) seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    return seen;
  };

  const pos = docFreq(positives);
  const neg = docFreq(negatives);

  const out: { marker: string; positiveShare: number; negativeShare: number; lift: number }[] = [];
  for (const [token, count] of pos) {
    const positiveShare = count / Math.max(1, positives.length);
    const negativeShare = (neg.get(token) ?? 0) / Math.max(1, negatives.length);
    if (positiveShare < minPositiveShare || negativeShare > maxNegativeShare) continue;
    /* +epsilon so a token absent from every negative does not divide by zero and
     * so ranking stays finite and comparable. */
    out.push({ marker: token, positiveShare, negativeShare, lift: positiveShare / (negativeShare + 0.001) });
  }
  return out.sort((a, b) => b.lift - a.lift).slice(0, top);
}
