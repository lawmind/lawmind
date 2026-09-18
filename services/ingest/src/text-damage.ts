/**
 * NEW2 — THE MINIMAL POSITIVE DAMAGE DETECTOR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND QUALITY MODULE EXISTS ALONGSIDE `quality-state.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `quality-state.ts` answers "what do we know about this document's text",
 * across six states, and it is right to be cautious: most of its states are
 * SUSPICIONS, formed from density screens that could misfire on an unusual but
 * genuine document. LCC and NEW1 cannot act on a suspicion. They asked for the
 * other half — a small set of documents where the stored text is PROVABLY not
 * what the court published, so that a span verifier can refuse them and a GPU
 * does not spend a day embedding them.
 *
 * So this module is deliberately narrow. It answers ONE question:
 *
 *     is there POSITIVE evidence, in the bytes themselves, that this text is
 *     not what the court published?
 *
 * and it answers `TEXT_UNSAFE_VERIFIED`, `TEXT_DAMAGE_SUSPECT` or `UNKNOWN`.
 * **There is no CLEAN.** A document no detector fires on is `UNKNOWN`, because
 * nothing here looks for evidence that an extraction was faithful — only for
 * evidence that it was not. Writing CLEAN from the absence of a signal is the
 * exact failure that made `judgments.text_quality` useless (see below), and
 * repeating it in a new column would be worse, not better, for being newer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT `text_quality` DOES, AND WHY NOTHING HERE READS IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Re-measured 21 Aug 2026 on a fresh uniform sample of 1,500 High Court
 * documents, independent of the runs that first found this:
 *
 *   167 documents fired at least one damage screen
 *   157 of them carry a `text_quality` score
 *   MEDIAN score over the damaged population: **1.000**
 *   142 of 157 score at or above the 0.85 floor the eligibility view uses
 *
 * A document whose text is 63% C0 control characters scores 1.000. Whatever
 * `text_quality` measures, it is not whether the text is text, and no verdict
 * in this file is allowed to consult it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VERIFIED VS SUSPECT — THE LINE, AND WHY IT IS WHERE IT IS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A detector is VERIFIED-class only when what it finds CANNOT be a property of
 * a genuine judgment — when the finding is about the byte stream rather than
 * about the writing. A run of fourteen C0 control characters is not prose an
 * unusual judge wrote; it is a font's glyph indices with no `/ToUnicode` map to
 * turn them back into characters.
 *
 * A detector is SUSPECT-class when it measures a DENSITY that a real document
 * could plausibly land on. Both suspect detectors below were caught misfiring
 * during the measurement that produced this file, which is why they are not
 * trusted alone:
 *
 *   - the token-shape screen fired on twelve Kerala writ petitions that are
 *     perfectly readable English (`IN THE HIGH COURT OF KERALA AT ERNAKULAM
 *     PRESENT THE HONOURABLE MR. JUSTICE …`). Their word-like token ratio is
 *     low because the head of a Kerala petition is a block of names, ages and
 *     addresses, not because anything is broken;
 *   - the English-density screen abstains on Devanagari and misses damage in
 *     documents under 1,000 characters, and it MISSED two documents that are
 *     63% and 28% control characters because a readable digital-signature
 *     footer lifted their function-word rate to 32 and 42 per thousand.
 *
 * Neither is wrong to exist. Both are wrong to act on alone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPAN IS PART OF THE VERDICT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every rate here is computed over a stated span and the span is reported with
 * the verdict. A NEW2 audit published court-level percentages that were quietly
 * measured over 1,400 characters when the write-up said 20,000, and the
 * correction (bus 0914/0915) moved every figure. A rate without its span is not
 * a measurement, so `DamageEvidence.span` is not optional.
 */

import { corruptionSignals, MAX_TRUNCATED_SHARE, MIN_PROBE_HITS } from './text-corruption.ts';

/**
 * Bumped when a DETECTOR or a THRESHOLD changes meaning — never for a comment
 * or a refactor. A consumer holding two exports needs to be able to tell a
 * corpus that moved from a definition that moved.
 */
export const TEXT_DAMAGE_VERSION = 'text-damage-v2.0';

/** The span every rate below is computed over, in characters from the head. */
export const DAMAGE_SPAN = 20_000;

export type DamageVerdict = 'TEXT_UNSAFE_VERIFIED' | 'TEXT_DAMAGE_SUSPECT' | 'UNKNOWN';

export type DamageReason =
  /* ── VERIFIED class — positive proof in the byte stream ── */
  /** We hold no text at all. Not an inference; there is nothing there. */
  | 'NO_TEXT'
  /** Runs of C0 control characters: a font's glyph indices, unmapped. */
  | 'GLYPH_CODE_DUMP'
  /** Private Use Area codepoints: characters with no meaning by definition. */
  | 'PRIVATE_USE_AREA'
  /** U+FFFD: the decoder itself recording that it could not map a byte. */
  | 'REPLACEMENT_CHAR'
  /** `INTHEHIGHCOURTOFJUDICATUREATBOMBAY` — the word boundaries are gone. */
  | 'WORD_SPACING_DESTROYED'
  /** `nion of ndia` — the extractor is eating leading characters. */
  | 'LEADING_CHAR_DELETION'
  /** A stored verdict reached with PDF font evidence in hand. */
  | 'LEGACY_FONT_ASCII_STORED'
  | 'SCRIPT_DAMAGE_STORED'
  /* ── SUSPECT class — a density a real document could land on ── */
  | 'ENGLISH_DENSITY_LOW'
  | 'TOKEN_SHAPE_ANOMALY'
  | 'LEGACY_FONT_MARKERS';

/**
 * Control-character DENSITY above which the text is a glyph dump.
 *
 * Measured over 1,500 uniform High Court draws, 21 Aug 2026:
 *
 *   population                     n      median density   above 0.02
 *   documents that fire            122        0.6263            122
 *   every other document         1,378        0.0000              0
 *
 * There is no boundary to defend: the two populations are separated by the
 * whole interval. 0.02 sits in empty space, and every one of the 122 was read
 * or spot-read — the eight inspected are raw glyph indices, and the two that
 * every other screen called clean are 28% and 63% control characters.
 */
export const MAX_CONTROL_DENSITY = 0.02;

/**
 * …AND an unbroken run this long, so a single stray character can never
 * convict a short document.
 *
 * The 5th percentile of the longest run among the 122 firings is **14**. Eight
 * is half of that: comfortably below anything observed, comfortably above the
 * runs of 1 that a stray form-feed or a vertical-tab in a table would produce.
 */
export const MIN_CONTROL_RUN = 8;

/** PUA and U+FFFD use the same density floor. See `unexercisedDetectors`. */
export const MAX_PUA_DENSITY = 0.02;
export const MAX_REPLACEMENT_DENSITY = 0.02;

/**
 * Share of characters sitting inside an unbroken run of 25+ letters.
 *
 * Measured on the same 1,500 draws: the 95th percentile among documents no
 * other detector fires on is **0.0000**, and ten documents exceed 0.15 — every
 * one of them a Bombay `.doc`/`.odt` conversion reading
 * `INTHEHIGHCOURTOFJUDICATUREATBOMBAY`, all four of the ones that no other
 * screen caught read individually and confirmed.
 *
 * 25 characters rather than 15: `CIVILAPPLICATIONNO` is damage, but a genuine
 * `Superintendent` or a hyphen-free URL is not, and the threshold has to sit
 * above the longest word an Indian judgment actually uses.
 */
export const MAX_LONG_LETTER_RUN_SHARE = 0.15;
const LONG_LETTER_RUN = /[A-Za-z]{25,}/g;

/* eslint-disable no-control-regex */
/** C0 controls minus the three that are real whitespace (`\t`, `\n`, `\r`), plus DEL. */
const CONTROL_RUN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g;
/* eslint-enable no-control-regex */
const PUA = /[\uE000-\uF8FF]/g;
const REPLACEMENT = /\uFFFD/g;

export type DamageEvidence = {
  /** Characters actually examined. Never omitted — a rate without it is noise. */
  readonly span: number;
  readonly textLength: number;
  readonly controlDensity: number;
  readonly longestControlRun: number;
  readonly puaDensity: number;
  readonly replacementDensity: number;
  readonly longLetterRunShare: number;
  readonly truncatedShare: number | null;
  readonly probeHits: number;
};

export type DamageResult = {
  readonly verdict: DamageVerdict;
  readonly reasons: readonly DamageReason[];
  readonly detector: string;
  readonly evidence: DamageEvidence;
};

export type DamageInput = {
  /** The head of the document, already truncated to `DAMAGE_SPAN` by the caller. */
  readonly text: string | null;
  /** `length(full_text)`, so a truncated span still reports the true size. */
  readonly textLength: number | null;
  /** `judgments.script_quality`, a verdict reached with evidence a scan lacks. */
  readonly storedScriptQuality?: string | null;
  /** Result of the mined-marker screen, if the caller ran one. */
  readonly legacyFontMarkers?: boolean;
  /** Result of the English-density screen, if the caller ran one. */
  readonly englishDensityLow?: boolean;
  /** Result of the token-shape screen, if the caller ran one. */
  readonly tokenShapeAnomaly?: boolean;
};

/**
 * Detectors that are DEFINED but have never fired on a measured sample.
 *
 * Stated in the module rather than in a report, because a consumer reading a
 * `PRIVATE_USE_AREA` verdict is entitled to know that its threshold has no
 * measured precision behind it — only the definitional argument that a Private
 * Use Area codepoint means nothing by construction. If one of these ever fires
 * at volume, it needs the same read-them-yourself treatment the others got
 * before anyone builds on it.
 */
export const UNEXERCISED_DETECTORS: readonly DamageReason[] = [
  'PRIVATE_USE_AREA',
  'REPLACEMENT_CHAR',
  'LEADING_CHAR_DELETION',
];

const VERIFIED_REASONS: ReadonlySet<DamageReason> = new Set<DamageReason>([
  'NO_TEXT',
  'GLYPH_CODE_DUMP',
  'PRIVATE_USE_AREA',
  'REPLACEMENT_CHAR',
  'WORD_SPACING_DESTROYED',
  'LEADING_CHAR_DELETION',
  'LEGACY_FONT_ASCII_STORED',
  'SCRIPT_DAMAGE_STORED',
]);

export function isVerifiedReason(reason: DamageReason): boolean {
  return VERIFIED_REASONS.has(reason);
}

/**
 * Screen one document.
 *
 * Pure — no I/O, no database, no network — so the audit, the export and the
 * test all reach the same verdict by construction rather than by two
 * implementations agreeing.
 */
export function damageVerdict(input: DamageInput): DamageResult {
  const text = input.text ?? '';
  const span = text.length;
  const n = span || 1;

  const controlRuns = text.match(CONTROL_RUN) ?? [];
  const controlChars = controlRuns.reduce((a, s) => a + s.length, 0);
  const longestControlRun = controlRuns.reduce((m, s) => Math.max(m, s.length), 0);
  const longRuns = text.match(LONG_LETTER_RUN) ?? [];
  const longRunChars = longRuns.reduce((a, s) => a + s.length, 0);
  const sig = corruptionSignals(text);

  const evidence: DamageEvidence = {
    span,
    textLength: input.textLength ?? span,
    controlDensity: controlChars / n,
    longestControlRun,
    puaDensity: (text.match(PUA) ?? []).length / n,
    replacementDensity: (text.match(REPLACEMENT) ?? []).length / n,
    longLetterRunShare: longRunChars / n,
    truncatedShare: sig?.truncatedShare ?? null,
    probeHits: sig?.probeHits ?? 0,
  };

  const reasons: DamageReason[] = [];

  /* An empty text is not a suspicion about an extraction; it is the absence of
   * one. Reported first and alone, because every rate below is 0/0 on it and
   * would otherwise read as evidence. */
  if ((input.textLength ?? 0) === 0 || text.trim().length === 0) {
    return {
      verdict: 'TEXT_UNSAFE_VERIFIED',
      reasons: ['NO_TEXT'],
      detector: TEXT_DAMAGE_VERSION,
      evidence,
    };
  }

  if (evidence.controlDensity > MAX_CONTROL_DENSITY && longestControlRun >= MIN_CONTROL_RUN) {
    reasons.push('GLYPH_CODE_DUMP');
  }
  if (evidence.puaDensity > MAX_PUA_DENSITY) reasons.push('PRIVATE_USE_AREA');
  if (evidence.replacementDensity > MAX_REPLACEMENT_DENSITY) reasons.push('REPLACEMENT_CHAR');
  if (evidence.longLetterRunShare > MAX_LONG_LETTER_RUN_SHARE)
    reasons.push('WORD_SPACING_DESTROYED');
  if (
    evidence.truncatedShare !== null &&
    evidence.probeHits >= MIN_PROBE_HITS &&
    evidence.truncatedShare > MAX_TRUNCATED_SHARE
  ) {
    reasons.push('LEADING_CHAR_DELETION');
  }

  /* A stored verdict outranks a scan: it was made with the PDF's own font
   * dictionary or a second extraction in hand, which no scan of the text has. */
  if (input.storedScriptQuality === 'legacy_font_ascii') reasons.push('LEGACY_FONT_ASCII_STORED');
  if (
    input.storedScriptQuality === 'devanagari_deleted' ||
    input.storedScriptQuality === 'damaged_other'
  ) {
    reasons.push('SCRIPT_DAMAGE_STORED');
  }

  if (input.legacyFontMarkers) reasons.push('LEGACY_FONT_MARKERS');
  if (input.englishDensityLow) reasons.push('ENGLISH_DENSITY_LOW');
  if (input.tokenShapeAnomaly) reasons.push('TOKEN_SHAPE_ANOMALY');

  const verified = reasons.some(isVerifiedReason);
  return {
    verdict: verified
      ? 'TEXT_UNSAFE_VERIFIED'
      : reasons.length > 0
        ? 'TEXT_DAMAGE_SUSPECT'
        : 'UNKNOWN',
    reasons,
    detector: TEXT_DAMAGE_VERSION,
    evidence,
  };
}
