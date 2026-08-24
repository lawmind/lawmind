/**
 * CASE NUMBERS AND CNRs — WHAT AN ADVOCATE TYPES, AND WHAT THE CORPUS STORES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO IDENTIFIERS, WHICH ARE NOT THE SAME KIND OF THING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **CNR** — the eCourts Case Number Record, `BRHC010328902006`. A national key,
 * globally unique, stored uniformly, and carried by a btree index. Measured on
 * the real `POST /search` path over 60 judgments: **100% found, 96.7% at rank 1,
 * p50 2 ms.** This is a real identifier and behaves like one.
 *
 * **Case number** — `CWJC/2231/2006`. A REGISTRY SERIAL. It is unique within a
 * court, within a case type, within a year, and nowhere else. Measured on the
 * same corpus:
 *
 *     serial 2231 of 2006  →  22 judgments, 13 courts, 17 case types
 *     serial  999 of 2021  → 123 judgments, 20 courts, 88 case types
 *     serial    1 of 2019  → 200+ judgments, 24 courts, 172 case types
 *
 * So a case number ALONE can never pin a judgment, and any code that pins on one
 * is producing a confident wrong answer. `docs/CITATION_HARNESS.md`'s rule for
 * citations applies unchanged: one target or none, never a guess.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A PARSER IS NEEDED AT ALL — THE STORED FORM IS NOT THE TYPED FORM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.case_number` holds the eCourts normalised spelling, `TYPE/SERIAL/
 * YEAR`. An advocate types what is printed on the order: *"CWJC 2231 of 2006"*,
 * *"W.P.(C) 4097 of 2009"*, *"CRM-M-22875-2013"*, *"Crl.M.C. 999/2021"*.
 *
 * Measured, same 60 judgments, same real route:
 *
 *     caseno:"CWJC/2231/2006"   (stored form, with operator)   96.7% found
 *     CWJC/2231/2006            (stored form, typed bare)       1.7% found
 *     CWJC 2231 of 2006         (how it is actually written)   10.3% found
 *
 * **95% of bare case numbers returned an empty result set.** Not slow, not
 * degraded — zero, in 3 ms, on a judgment that is definitely in the corpus. The
 * cause is mechanical: `full_text_tsv` is `to_tsvector('english', full_text)`,
 * so the case number is not in the searchable text at all, and nothing routed
 * the query to the column that holds it. The earlier "case number search works"
 * finding was measured with the operator and the stored string — a shape no
 * advocate produces.
 *
 * The typed form is worse than the bare one: 37.9% returned zero and **34.5%
 * returned results spanning more than one court**, because `plainto_tsquery`
 * splits it into `'cwjc' & '2231' & '2006'` and ANDs those against body text.
 * An advocate typing their own case number got a plausible ranked list of
 * unrelated judgments.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE TYPE TOKEN IS COMPARED LOOSELY AND THE SERIAL/YEAR EXACTLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The stored type token is NOT punctuation-normalised — Patna stores
 * `CR. MISC./606/2011`, dots and space intact, while Orissa stores
 * `CRLMC/999/2021`. So the same act is spelled at least five ways across courts
 * and the input cannot be mapped onto one canonical token without inventing a
 * registry dictionary this repo does not have.
 *
 * The serial and the year, by contrast, are digits and are stored identically
 * everywhere. So THEY carry the match — anchored, and therefore servable by the
 * existing `judgments_case_number_trgm` index — and the type token is compared
 * with punctuation stripped from BOTH sides as a filter over the small candidate
 * set that comes back. Nothing is invented; a type token that does not match is
 * simply not this case.
 */

/** `CWJC/2231/2006`, `CR. MISC./606/2011`, `WP(C)/4097/2009`. */
export type CaseNumberShape = {
  /**
   * The registry token as typed, upper-cased, punctuation preserved. Null when
   * the input carried none — some stored values genuinely have none
   * (`/12521/2023`), which is a corpus defect rather than a query to reject.
   */
  readonly typeToken: string | null;
  /** Digits only. */
  readonly serial: string;
  /** Four digits. */
  readonly year: string;
};

/**
 * A CNR: 16 characters, a court prefix in letters then digits.
 *
 * Read off the corpus rather than off documentation — `BRHC010328902006`,
 * `UPHC020901162023`, `HCMD011280772011`, `WBCHCA0592612024`. The prefix is 2-6
 * letters and the whole is exactly 16, which is the only invariant all four
 * share.
 */
const CNR_RE = /^(?=.{16}$)[A-Z]{2,6}[0-9]{10,14}$/;

export function isCnr(raw: string): boolean {
  return CNR_RE.test(raw.trim().toUpperCase());
}

/**
 * Two spellings, one shape.
 *
 *   `TYPE/SERIAL/YEAR`         the stored form
 *   `TYPE SERIAL of YEAR`      the printed form
 *   `TYPE SERIAL/YEAR`         the common shorthand
 *   `TYPE-SERIAL-YEAR`         Punjab & Haryana's printed form
 *
 * Returns null for anything else, INCLUDING a bare `1234/2019` with no type
 * token. That is deliberate: two numbers separated by a slash is also a date, a
 * fraction and a page range, and treating every one of them as a case-number
 * lookup would hijack ordinary searches. A type token is the evidence that this
 * was meant as a case number.
 */
export function parseCaseNumber(raw: string): CaseNumberShape | null {
  const text = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (text.length === 0 || text.length > 80) return null;

  /**
   * The year is anchored at the end and the serial immediately before it. The
   * separator may be `/`, `-`, or ` OF `; the type is whatever came first.
   *
   * `[^/\-\s]` is NOT used for the type, because real type tokens contain
   * spaces (`CR. MISC.`), dots and hyphens (`CRM-M`). The type is simply
   * everything before the serial, and the serial is found by anchoring on the
   * tail.
   */
  const m = /^(.*?)[/\-\s]+(?:OF[\s]+)?(\d{1,7})[/\-\s]+(?:OF\s+)?((?:19|20)\d{2})$/.exec(text);
  if (!m) return null;

  const [, rawType, serial, year] = m;
  if (!serial || !year) return null;

  const typeToken = (rawType ?? '').trim();
  /**
   * A type token that is all digits is not a type — `12/3456/2019` is three
   * numbers, and reading the first as a registry code would invent one.
   */
  if (typeToken.length > 0 && /^\d+$/.test(typeToken)) return null;

  return { typeToken: typeToken.length > 0 ? typeToken : null, serial, year };
}

/**
 * `%/2231/2006` — the anchored suffix the trigram index can serve.
 *
 * Measured 256-389 ms against the live corpus, versus 917 ms p50 for the
 * unanchored `%CWJC/2231/2006%` the operator used to compile to.
 */
export function caseNumberSuffixPattern(shape: CaseNumberShape): string {
  return `%/${shape.serial}/${shape.year}`;
}

/**
 * Punctuation and spacing stripped, for comparing a typed type token against a
 * stored one. `Cr. Misc.` and `CR. MISC.` and `CRMISC` all collapse to `CRMISC`.
 *
 * Applied to BOTH sides. This is a comparison rule, not a canonicalisation: no
 * value is ever rewritten in the database on the strength of it.
 */
export function normaliseTypeToken(token: string): string {
  return token.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
