/**
 * Deterministic detection of genuinely corrupt extracted text.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: `text_quality` SCORES GARBAGE AT 1.000
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.text_quality` is populated on all 79,322 rows and does not
 * discriminate. Measured 12 Aug 2026 (`docs/ai/DATA_MOAT_PROGRAM.md` §3):
 *
 * - **99.4% of the corpus sits in a single bucket, 0.9–1.0.**
 * - A 78-character document reading `h dh y : P , : 0 h p il 20 P :- k w M H
 *   v u` — isolated letters, no words at all — scores **1.000**.
 * - A readable Travancore judgment scores **0.697**.
 * - Of 5 genuinely corrupt documents found in a 4,000-row sample, **all 5
 *   scored above 0.95**.
 *
 * Whatever it measures (most likely the share of printable or alphanumeric
 * characters), a stream of single letters passes it perfectly, because every
 * character IS printable. **The metric answers a question nobody asked.**
 *
 * `quality-buckets.ts` consumes `textQuality`, so its tiers inherit the same
 * blindness — a corrupt document can currently reach bucket A.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MEASURES INSTEAD: DOES THE TEXT CONTAIN WORDS?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Corrupt PDF extraction fails in a characteristic way — it emits the right
 * CHARACTERS with the wrong SPACING, so words shatter into single letters.
 * That is invisible to a character-class metric and obvious to a token-shape
 * one. Every threshold below was set from the measured sample, not chosen for
 * looking round.
 *
 * **This never deletes or rewrites anything.** It classifies, so that a
 * repair pass (OCR, re-extraction, or a model reading the source PDF) can be
 * pointed at the ~0.1% of the corpus that needs it instead of all of it.
 */

export type CorruptionSignals = {
  readonly tokens: number;
  /**
   * Share of high-frequency legal probe words appearing with their first
   * character missing. Null when too few probes were seen to form a rate.
   */
  readonly truncatedShare: number | null;
  readonly probeHits: number;
  /** Share of tokens whose letters amount to exactly one character. */
  readonly singleCharRatio: number;
  /** Share of tokens that look like an ordinary word (`Judgment`, `appeal`). */
  readonly wordLikeRatio: number;
  readonly meanTokenLength: number;
};

export type CorruptionVerdict = {
  readonly signals: CorruptionSignals;
  readonly corrupt: boolean;
  /** Why, in the words a human would use. Empty when the text is fine. */
  readonly reasons: readonly string[];
};

/**
 * Below this many tokens the ratios are noise — a 6-token order is not
 * evidence of anything. Such documents are reported as short, never corrupt:
 * `UNKNOWN MUST REMAIN UNKNOWN`.
 */
export const MIN_TOKENS_TO_JUDGE = 40;

/**
 * Measured: genuine garbage runs 0.52–0.64 single-character tokens, while real
 * judgments — including heavily abbreviated cause titles — sit at 0.01. The gap
 * is two orders of magnitude, so 0.30 sits in empty space rather than on a
 * boundary anyone has to defend.
 */
export const MAX_SINGLE_CHAR_RATIO = 0.3;

/**
 * Real judgments measured 0.20–0.60 word-like tokens; garbage measured
 * 0.11–0.23. These overlap, so this signal ALONE never condemns a document —
 * it must coincide with a short mean token length, which garbage always has
 * and prose never does. One weak signal is a suspicion; two are a finding.
 */
export const MIN_WORD_LIKE_RATIO = 0.2;
export const MIN_MEAN_TOKEN_LENGTH = 2.5;

const WORD_LIKE = /^[A-Za-z][a-z]{1,}$/;

/**
 * THE SECOND CORRUPTION SHAPE, AND THE FIRST THREE SIGNALS ARE BLIND TO IT.
 *
 * NEW2 found it (bus 0167) with concrete evidence: 51 Gujarat and 1 Telangana
 * documents carry the same font-cmap defect as Bombay, extracted through
 * `fetchPdfText`, and `classifyCorruption` passed every one of them.
 *
 * Bombay's corruption SHATTERS words — `voc te for t e etitio e` — which is
 * exactly what the single-character and word-like ratios are built to catch.
 * This one DROPS LEADING CHARACTERS instead: `Union of India` becomes
 * `nion of ndia`, `APPLICATION` becomes `PLICATION`. The remnant is shorter but
 * still an unbroken run of letters, so it reads as an ordinary word to every
 * shape-based signal. Measured on a real Gujarat document: single-char ratio
 * **0.009**, word-like **0.312**, mean token length **5.2** — indistinguishable
 * from clean prose on all three.
 *
 * So this signal is not about SHAPE, it is about VOCABULARY, and deliberately
 * not a dictionary. Indian judgments repeat a small set of words constantly.
 * If a document contains `ndia` more often than `India`, the first letters are
 * being eaten — and no genuine judgment does that, because `ndia` is not a
 * word. Counting a handful of known high-frequency legal terms against their
 * leading-dropped forms is cheap, needs no word list to maintain, and cannot
 * misfire on Devanagari or on abbreviation-heavy cause titles, which is where
 * the shape signals are fragile.
 */
const TRUNCATION_PROBES = [
  'India',
  'Union',
  'State',
  'Court',
  'Appeal',
  'Section',
  'Petitioner',
  'Respondent',
  'Judgment',
  'Application',
] as const;

/**
 * Above this share of a probe word appearing in truncated form, the extraction
 * is dropping leading characters. Set at a half rather than a token fraction:
 * a document where the broken spelling is more common than the correct one is
 * not a document with a typo.
 */
export const MAX_TRUNCATED_SHARE = 0.5;
/** Below this many probe sightings the ratio is noise, not a rate. */
export const MIN_PROBE_HITS = 6;

export function corruptionSignals(text: string): CorruptionSignals | null {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  let single = 0;
  let wordLike = 0;
  let totalLength = 0;
  for (const t of tokens) {
    if (t.replace(/[^A-Za-z]/g, '').length === 1) single++;
    if (WORD_LIKE.test(t)) wordLike++;
    totalLength += t.length;
  }
  // Vocabulary signal: how often a known word appears missing its first letter.
  let full = 0;
  let truncated = 0;
  for (const probe of TRUNCATION_PROBES) {
    /**
     * `String.raw`, and this is the third time this bug class has appeared in
     * this repo. In a template literal `\b` is the BACKSPACE escape, not a
     * regex word boundary — so the obvious spelling compiles, runs, matches
     * nothing, and reports every document clean. NEW1 hit the identical trap
     * with `\s+` (bus 0127) and the citation year guard hit it with `\d`.
     * A guard built on a silently-empty pattern looks exactly like a guard
     * that never needed to fire.
     */
    const whole = new RegExp(String.raw`\b${probe}\b`, 'g');
    // `ndia` for `India`. Bounded so it cannot match the tail of the correct
    // spelling.
    const cut = new RegExp(String.raw`\b${probe.slice(1)}\b`, 'g');
    full += (text.match(whole) ?? []).length;
    truncated += (text.match(cut) ?? []).length;
  }
  const probeHits = full + truncated;

  return {
    tokens: tokens.length,
    singleCharRatio: single / tokens.length,
    wordLikeRatio: wordLike / tokens.length,
    meanTokenLength: totalLength / tokens.length,
    truncatedShare: probeHits >= MIN_PROBE_HITS ? truncated / probeHits : null,
    probeHits,
  };
}

export function classifyCorruption(text: string): CorruptionVerdict | null {
  const signals = corruptionSignals(text);
  if (signals === null) return null;

  const reasons: string[] = [];
  if (signals.tokens < MIN_TOKENS_TO_JUDGE) {
    // Too short to judge. Not corrupt — unknown, and it stays unknown.
    return { signals, corrupt: false, reasons: [] };
  }
  if (signals.singleCharRatio > MAX_SINGLE_CHAR_RATIO) {
    reasons.push(
      `${(signals.singleCharRatio * 100).toFixed(0)}% of tokens are a single letter — words have shattered`,
    );
  }
  if (signals.truncatedShare !== null && signals.truncatedShare > MAX_TRUNCATED_SHARE) {
    reasons.push(
      `${(signals.truncatedShare * 100).toFixed(0)}% of ${signals.probeHits} known legal words ` +
        'appear with their first character missing — the extractor is eating leading glyphs',
    );
  }
  if (
    signals.wordLikeRatio < MIN_WORD_LIKE_RATIO &&
    signals.meanTokenLength < MIN_MEAN_TOKEN_LENGTH
  ) {
    reasons.push(
      `only ${(signals.wordLikeRatio * 100).toFixed(0)}% word-like tokens at mean length ` +
        `${signals.meanTokenLength.toFixed(1)} — two weak signals agreeing`,
    );
  }
  return { signals, corrupt: reasons.length > 0, reasons };
}
