/**
 * The fixtures are REAL TEXT, shortened.
 *
 * Every damaged string below was read out of `judgments.full_text` during the
 * 21 Aug 2026 measurement, and every clean one is a real judgment head from the
 * same sample. A synthetic fixture would prove the thresholds are self
 * consistent and nothing else; these prove they separate the two populations
 * that actually exist in this corpus.
 */
import { describe, expect, it } from 'vitest';
import {
  DAMAGE_SPAN,
  MIN_CONTROL_RUN,
  TEXT_DAMAGE_VERSION,
  damageVerdict,
  isVerifiedReason,
} from './text-damage.ts';

/** Karnataka / Punjab & Haryana: a font's glyph indices with no `/ToUnicode`. */
const GLYPH_DUMP =
  '\u0001\u0002\u0003\u0004\u0005\u0006\u0003\u0005\u0001\u0007\u0005\u0003\u0008 \u0004\u0003 \u0003 \u000E \u0002\u000E\u0004\u000E ' +
  '\u000E\u0003 \u000F\u0005\u000E \u0010\u000E\u000F\u0003\u0011\u0006\u0002\u0008\u0005\u0003 \u000F\u000E\u0004\u0006\u000F\u0003\u0004\u0005\u0001\u0012\u0003\u0004\u0005\u0006\u0003\u0013\u0013\u0002\u000F\u0003\u000F\u000E\u0014 ' +
  '\u0003\u0006\u0011\u000E\u0014\u0003\u0013\u0015\u0013\u0016\u0003 \u0011\u0006\u0006\u0003\u0004\u0005\u0006\u0003\u0005\u0002\u0017\u0011\u0018\u0006\u0003\u0019';

/** Bombay, a `.doc` conversion that lost every word boundary. */
const SPACING_DESTROYED =
  '922-CA-10829-21.odt INTHEHIGHCOURTOFJUDICATUREATBOMBAY BENCHATAURANGABAD ' +
  'CIVILAPPLICATIONNO.10829OF2021 INFIRSTAPPEALSTNO.22534OF2021 ' +
  'MaharashtraKrishnaValleyDevelopmentCorporationLtdThroughExecutiveEngineer';

/** Kerala. Perfectly readable — and the token-shape screen fires on it. */
const KERALA_READABLE =
  'IN THE HIGH COURT OF KERALA AT ERNAKULAM PRESENT THE HONOURABLE MR. JUSTICE SHAJI P.CHALY ' +
  'MONDAY ,THE 11TH DAY OF FEBRUARY 2019 / 22ND MAGHA, 1940 WP(C).No. 3257 of 2019 PETITIONER/S: ' +
  'K.M.HARIS AGED 47 YEARS S/O MEERAN, KAVATTU HOUSE, CHERUVATTOOR, CHERUVATTOOR P.O., ' +
  'ERNAKULAM DISTRICT, PIN-686 691. BY ADVS. SRI.BABU JOSEPH';

const PATNA_READABLE =
  'IN THE HIGH COURT OF JUDICATURE AT PATNA CRIMINAL MISCELLANEOUS No.16932 of 2026 ' +
  'Arising Out of PS. Case No.-55 Year-2026 Thana- GORAUL District- Vaishali ' +
  'Dipak Kumar Sahni @ Dipak Kumar S/o Raghunath Sahani Resident of Village- Rusulpur Daud';

const base = { textLength: 4000 as number | null, storedScriptQuality: null };

describe('damageVerdict — the VERIFIED class needs proof, not a density', () => {
  it('convicts a glyph dump on the control-character run', () => {
    const r = damageVerdict({ ...base, text: GLYPH_DUMP });
    expect(r.verdict).toBe('TEXT_UNSAFE_VERIFIED');
    expect(r.reasons).toContain('GLYPH_CODE_DUMP');
    expect(r.evidence.longestControlRun).toBeGreaterThanOrEqual(MIN_CONTROL_RUN);
  });

  it('convicts destroyed word spacing', () => {
    const r = damageVerdict({ ...base, text: SPACING_DESTROYED });
    expect(r.verdict).toBe('TEXT_UNSAFE_VERIFIED');
    expect(r.reasons).toContain('WORD_SPACING_DESTROYED');
  });

  it('convicts an empty text as NO_TEXT and reports nothing else', () => {
    const r = damageVerdict({ ...base, text: '', textLength: 0 });
    expect(r.verdict).toBe('TEXT_UNSAFE_VERIFIED');
    expect(r.reasons).toEqual(['NO_TEXT']);
  });

  it('promotes a stored legacy-font verdict, which was made with PDF evidence', () => {
    const r = damageVerdict({
      ...base,
      text: PATNA_READABLE,
      storedScriptQuality: 'legacy_font_ascii',
    });
    expect(r.verdict).toBe('TEXT_UNSAFE_VERIFIED');
    expect(r.reasons).toContain('LEGACY_FONT_ASCII_STORED');
  });
});

describe('damageVerdict — a screen alone can only ever say SUSPECT', () => {
  /**
   * This is the regression that matters most. Twelve readable Kerala writ
   * petitions fired the token-shape screen during the measurement. If a future
   * edit promotes that screen to the VERIFIED class, this test is what stops
   * 800,000 readable documents being declared unreadable.
   */
  it('will not convict readable Kerala text on the token-shape screen', () => {
    const r = damageVerdict({ ...base, text: KERALA_READABLE, tokenShapeAnomaly: true });
    expect(r.verdict).toBe('TEXT_DAMAGE_SUSPECT');
    expect(r.reasons).toEqual(['TOKEN_SHAPE_ANOMALY']);
    expect(r.reasons.some(isVerifiedReason)).toBe(false);
  });

  it('will not convict on low English density alone', () => {
    const r = damageVerdict({ ...base, text: PATNA_READABLE, englishDensityLow: true });
    expect(r.verdict).toBe('TEXT_DAMAGE_SUSPECT');
  });

  it('carries both screens when both fire, and still refuses to convict', () => {
    const r = damageVerdict({
      ...base,
      text: PATNA_READABLE,
      englishDensityLow: true,
      tokenShapeAnomaly: true,
      legacyFontMarkers: true,
    });
    expect(r.verdict).toBe('TEXT_DAMAGE_SUSPECT');
    expect(r.reasons).toHaveLength(3);
  });
});

describe('damageVerdict — UNKNOWN is a value, never a claim of cleanliness', () => {
  it('returns UNKNOWN with no reasons on ordinary readable text', () => {
    for (const text of [PATNA_READABLE, KERALA_READABLE]) {
      const r = damageVerdict({ ...base, text });
      expect(r.verdict).toBe('UNKNOWN');
      expect(r.reasons).toEqual([]);
    }
  });

  it('never returns a state that asserts the extraction was faithful', () => {
    const states = new Set(
      [PATNA_READABLE, KERALA_READABLE, GLYPH_DUMP, SPACING_DESTROYED].map(
        (text) => damageVerdict({ ...base, text }).verdict,
      ),
    );
    expect([...states].every((s) => s !== ('CLEAN' as string))).toBe(true);
  });
});

describe('damageVerdict — every verdict carries its span and its version', () => {
  it('reports the span it actually examined, not the span it was asked for', () => {
    const r = damageVerdict({ ...base, text: PATNA_READABLE, textLength: 91_000 });
    expect(r.evidence.span).toBe(PATNA_READABLE.length);
    expect(r.evidence.textLength).toBe(91_000);
    expect(r.evidence.span).toBeLessThan(DAMAGE_SPAN);
  });

  it('stamps the detector version on every result', () => {
    expect(damageVerdict({ ...base, text: PATNA_READABLE }).detector).toBe(TEXT_DAMAGE_VERSION);
    expect(damageVerdict({ ...base, text: GLYPH_DUMP }).detector).toBe(TEXT_DAMAGE_VERSION);
  });
});
