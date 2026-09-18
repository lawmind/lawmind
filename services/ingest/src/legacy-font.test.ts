import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyLegacyFont,
  mineMarkers,
  pdfFontEvidence,
  textSignature,
  SUSPECT_MARKER_RATE,
  MINED_MARKERS,
} from './legacy-font.ts';

/** A minimal PDF font dictionary. Byte-level, which is all the detector reads. */
const pdfWith = (fonts: string[], toUnicode = 0): Uint8Array =>
  Buffer.from(
    `%PDF-1.4\n${fonts.map((f, i) => `${i} 0 obj<</Type/Font/BaseFont/${f}>>endobj\n`).join('')}` +
      `${'/ToUnicode 9 0 R\n'.repeat(toUnicode)}`,
    'latin1',
  );

describe('pdfFontEvidence', () => {
  it('finds a legacy family through its subset tag and separator spelling', () => {
    for (const name of [
      'ABCDEF+Kruti_Dev_010',
      'KrutiDev010',
      'XYZQWE+DevLys-010',
      'Walkman-Chanakya',
    ]) {
      assert.equal(pdfFontEvidence(pdfWith([name])).legacyFonts.length, 1, name);
    }
  });

  it('leaves an ordinary embedded font alone', () => {
    const e = pdfFontEvidence(
      pdfWith(['ABCDEF+TimesNewRomanPSMT', 'NotoSansDevanagari-Regular'], 2),
    );
    assert.equal(e.legacyFonts.length, 0);
    assert.equal(e.fontCount, 2);
    assert.equal(e.noToUnicode, false);
  });

  /**
   * The limit that must never be reported as a clean bill: a PDF whose fonts
   * live in a compressed object stream reads as zero fonts, and zero fonts is
   * not "no legacy font".
   */
  it('reports an unreadable file as no evidence rather than as clean', () => {
    const e = pdfFontEvidence(
      Buffer.from('%PDF-1.7\n<</Type/ObjStm/Filter/FlateDecode>>\n', 'latin1'),
    );
    assert.equal(e.fontCount, 0);
    assert.equal(e.noToUnicode, false);
    assert.equal(classifyLegacyFont({ pdf: e }).verdict, 'unknown');
  });
});

describe('classifyLegacyFont', () => {
  const markers = ['gs', 'ds', 'esa'];

  it('lets PDF evidence overrule innocent-looking text', () => {
    const v = classifyLegacyFont({
      pdf: pdfFontEvidence(pdfWith(['ABCDEF+Kruti_Dev_010'])),
      text: textSignature('The appeal is allowed and the impugned order is set aside.', markers),
    });
    assert.equal(v.verdict, 'legacy_font_confirmed');
  });

  it('lets PDF evidence clear suspicious-looking text', () => {
    const v = classifyLegacyFont({
      pdf: pdfFontEvidence(pdfWith(['ABCDEF+TimesNewRomanPSMT'], 1)),
      text: textSignature('gs ds esa '.repeat(200), markers),
    });
    assert.equal(v.verdict, 'clean');
  });

  it('will only say SUSPECT, never CONFIRMED, from text alone', () => {
    const v = classifyLegacyFont({ text: textSignature('gs ds esa '.repeat(200), markers) });
    assert.equal(v.verdict, 'legacy_font_suspect');
    assert.equal(v.evidence.pdf, undefined);
  });

  /**
   * The false positive the standing direction names by hand: an English
   * judgment from a bilingual court must not be convicted for containing a
   * marker once.
   */
  it('does not convict English prose that happens to contain a marker', () => {
    const english =
      'The petitioner seeks a direction that the funds be released. ' +
      'This Court has considered the submissions of learned counsel for the parties. '.repeat(20);
    const sig = textSignature(english, markers);
    assert.ok(sig.markerRate < SUSPECT_MARKER_RATE, `markerRate ${sig.markerRate}`);
    assert.equal(classifyLegacyFont({ text: sig }).verdict, 'clean');
  });

  it('counts a marker as a word, not as a substring', () => {
    /* `ds` inside `funds`/`bonds` must not score. */
    assert.equal(textSignature('funds bonds grounds refunds '.repeat(50), ['ds']).markerRate, 0);
  });
});

describe('mineMarkers', () => {
  it('picks tokens by how many DOCUMENTS carry them, not how often they repeat', () => {
    /* One positive shouts `zzz` 500 times; every positive says `gs` once.
     * Document frequency must prefer `gs` — the sparse-arm lesson, one layer up. */
    const positives = [`${'zzz '.repeat(500)} gs`, 'gs alpha', 'gs beta', 'gs gamma'];
    const negatives = ['the appeal is allowed', 'the petition is dismissed'];
    const names = mineMarkers(positives, negatives, { minPositiveShare: 0.5, top: 5 }).map(
      (m) => m.marker,
    );
    assert.ok(names.includes('gs'), names.join(','));
    assert.ok(!names.includes('zzz'), names.join(','));
  });

  it('rejects a token that is common in the negatives', () => {
    const positives = ['the gs', 'the gs', 'the gs'];
    const negatives = ['the appeal', 'the order', 'the court'];
    const mined = mineMarkers(positives, negatives, { minPositiveShare: 0.5 });
    assert.ok(!mined.map((m) => m.marker).includes('the'));
  });
});

describe('MINED_MARKERS, against the documents they were mined from', () => {
  it('clears an English judgment', () => {
    const english =
      'HIGH COURT OF JUDICATURE FOR RAJASTHAN BENCH AT JAIPUR. ' +
      'S.B. Criminal Revision Petition No. 1208/2022. The revision petition is dismissed. '.repeat(
        30,
      );
    const v = classifyLegacyFont({ text: textSignature(english, MINED_MARKERS) });
    assert.equal(v.verdict, 'clean', JSON.stringify(v.evidence.text?.markerHits));
  });

  it('flags real Kruti Dev bytes taken from a PDF-confirmed document', () => {
    /* Verbatim head of a Rajasthan judgment whose PDF declares KrutiDev010:
     * jktLFkku mPp U;k;ky;] t;iqj ihB = राजस्थान उच्च न्यायालय, जयपुर पीठ */
    const kruti =
      'jktLFkku mPp U;k;ky;] t;iqj ihB] t;iqj vihy fnukad ds vkns"k esa fopkj ' +
      'ftlds rgr izdj.k izlrqr fd;k x;k gS vksj ij vf/kd tk kkjk lohdkj '.repeat(40);
    const v = classifyLegacyFont({ text: textSignature(kruti, MINED_MARKERS) });
    assert.equal(v.verdict, 'legacy_font_suspect', JSON.stringify(v.evidence.text?.markerRate));
  });
});
