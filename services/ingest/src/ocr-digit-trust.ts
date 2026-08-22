/**
 * NEW2 — CAN THE DIGITS IN THIS OCR BE TRUSTED?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS FOR WAS MEASURED, NOT ANTICIPATED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 40 PDFs through the recovery probe, and **6 of 20 recovered pages render a
 * year with the letter O for zero — `2O17`, `2O19`, `2O18` — every one of the six
 * Karnataka** (`docs/ops/new2/TEXT_RECOVERY_POLICY.md` §2). A court-specific
 * glyph shape the model reads as a letter.
 *
 * Prose survives that. A citation does not. A section number, a year, a date or
 * a case number read wrong is a WRONG AUTHORITY, and `CLAUDE.md` already has the
 * rule from the other direction: *OCR output is never trusted silently.*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WITNESSES CANNOT AGREE BY CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `case_number` and `judgment_date` arrive as SOURCE METADATA — the registry's
 * filename and listing, never the document's text. So finding them inside the
 * OCR is real corroboration rather than a tautology. This is the same argument
 * the probe used to claim 20/20 case numbers and 18/18 dates, and it is the only
 * reason those figures meant anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY "MATCHED ONLY AFTER SUBSTITUTION" IS A CONVICTION, NOT A PASS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The tempting design is to normalise `O`→`0` on both sides and call a match a
 * match. That gets the witness to agree and throws away the finding: a document
 * that needed the substitution has DEMONSTRATED it renders zeros as letters, and
 * every other number in it is now suspect for exactly that reason.
 *
 * So the substitution is run, and its success downgrades rather than upgrades.
 * `CROSSCHECKED` requires a literal match.
 */

export type DigitTrust = 'UNVERIFIED' | 'CROSSCHECKED' | 'SUSPECT';

export const DIGIT_TRUST_VERSION = 'digit-trust-v1';

export type DigitWitness = {
  field: 'case_number' | 'judgment_year';
  expected: string;
  /** `exact` — found as-is. `substituted` — found only after glyph repair, which
   *  is positive evidence of the defect. `absent` — not in the text at all. */
  found: 'exact' | 'substituted' | 'absent';
};

export type DigitVerdict = {
  trust: DigitTrust;
  version: string;
  witnesses: DigitWitness[];
  /** Every distinct glyph-damaged number found, e.g. `2O17`. Evidence, capped so
   *  a pathological document cannot write an unbounded column. */
  damagedNumbers: string[];
};

/**
 * Glyph confusions an OCR engine makes on digits, in the direction LETTER →
 * DIGIT only.
 *
 * One-directional deliberately. `0`→`O` would let a document that printed a
 * genuine letter O match a numeric witness and be called corroborated; the
 * failure mode being detected only ever goes the other way.
 */
const LETTER_FOR_DIGIT: Readonly<Record<string, string>> = {
  O: '0',
  o: '0',
  Q: '0',
  D: '0',
  I: '1',
  l: '1',
  L: '1',
  S: '5',
  s: '5',
  B: '8',
  Z: '2',
  G: '6',
};

/**
 * A run of characters that is mostly digits but contains a letter that is a
 * known digit-shape. `2O17` matches; `Section` does not, because it has no
 * digits; `2017A` does not, because the letter is not adjacent to a digit run it
 * breaks.
 */
const GLYPH_DAMAGED_NUMBER = /\b(?=[0-9]*[OoQDIlLSsBZG])(?=[^\s]*[0-9])[0-9OoQDIlLSsBZG]{3,}\b/g;

const squash = (s: string): string => s.replace(/[^0-9A-Za-z]/g, '').toUpperCase();

const repairGlyphs = (s: string): string =>
  s.replace(/[OoQDIlLSsBZG]/g, (c) => LETTER_FOR_DIGIT[c] ?? c);

function findWitness(
  haystackSquashed: string,
  haystackRepaired: string,
  expected: string,
  field: DigitWitness['field'],
): DigitWitness {
  const needle = squash(expected);
  /* Two characters is not a witness — it would match by accident in any
   * document long enough to be worth recovering. */
  if (needle.length < 3) return { field, expected, found: 'absent' };
  if (haystackSquashed.includes(needle)) return { field, expected, found: 'exact' };
  if (haystackRepaired.includes(repairGlyphs(needle))) {
    return { field, expected, found: 'substituted' };
  }
  return { field, expected, found: 'absent' };
}

/**
 * Adjudicate the digits in one recovered document.
 *
 * `UNVERIFIED` is the answer when no witness could be checked — a null case
 * number, a null date, or neither appearing in the text. It is deliberately the
 * same value the column defaults to: "nothing has looked" and "we looked and
 * found nothing to compare" are both *not corroborated*, and neither may be
 * presented as a verified digit.
 */
export function digitTrust(input: {
  text: string;
  caseNumber?: string | null;
  judgmentDate?: Date | string | null;
}): DigitVerdict {
  const text = input.text ?? '';
  const squashed = squash(text);
  const repaired = repairGlyphs(squashed);

  const witnesses: DigitWitness[] = [];
  if (input.caseNumber) {
    witnesses.push(findWitness(squashed, repaired, input.caseNumber, 'case_number'));
  }
  if (input.judgmentDate) {
    const iso =
      typeof input.judgmentDate === 'string'
        ? input.judgmentDate
        : input.judgmentDate.toISOString();
    const year = iso.slice(0, 4);
    if (/^\d{4}$/.test(year)) {
      witnesses.push(findWitness(squashed, repaired, year, 'judgment_year'));
    }
  }

  const damagedNumbers = [...new Set(text.match(GLYPH_DAMAGED_NUMBER) ?? [])].slice(0, 25);

  /* Order matters and it is the point of the module: a document that shows the
   * defect is SUSPECT even if another witness matched exactly, because the
   * defect is a property of the document's rendering rather than of the field
   * that happened to survive it. */
  const substituted = witnesses.some((w) => w.found === 'substituted');
  if (substituted || damagedNumbers.length > 0) {
    return { trust: 'SUSPECT', version: DIGIT_TRUST_VERSION, witnesses, damagedNumbers };
  }
  if (witnesses.some((w) => w.found === 'exact')) {
    return { trust: 'CROSSCHECKED', version: DIGIT_TRUST_VERSION, witnesses, damagedNumbers };
  }
  return { trust: 'UNVERIFIED', version: DIGIT_TRUST_VERSION, witnesses, damagedNumbers };
}
