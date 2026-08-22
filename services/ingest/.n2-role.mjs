/**
 * NEW2 — where does a neutral citation sit inside the document that carries it?
 *
 * One shared implementation, because two studies ask the same question: the
 * shared-citation study (P1) and the corpus-wide extraction-precision study
 * (P3.A). If they disagreed about what "the document's own" means, neither
 * number would mean anything.
 *
 * The rules encode LAYOUTS OBSERVED IN THE CORPUS, each one read off real
 * documents before being written down:
 *   header stamp   Punjab & Haryana, Rajasthan, Karnataka — line 1, above the
 *                  court's name (verified against the source PDFs)
 *   masthead       Gauhati — `Page No.# 1/159 <CNR> <citation>` before the
 *                  court is named
 *   page stamp     Karnataka `NC: ...` repeated once per page
 *   footer stamp   Bombay, Meghalaya — last thing on the page, next to
 *                  `Signed by:`, `1/1`, `(2)`, `939-acb-161`
 *   authority      the citation of a judgment this one relied on
 *
 * Anything else stays UNDETERMINED. It is not forced into a binary: a layout
 * nobody has read yet must not be counted as either right or wrong.
 */

const AUTHORITY_CUES = /(reliance|relied|reported|referred|judgment of|judgement of|order of|decision of|division bench|coordinate bench|apex court|supreme court|\bvs?\.?\b|versus|\bin re\b|following|covered by|passed in)\s*[^.]{0,60}$/i;
const OWN_LABEL = /(neutral\s*citation|(^|\s)nc\s*:?\s*$|citation\s*n[o0]\.?\s*:?\s*-?\s*$)/i;
const COURT_NAME = /(HIGH COURT|SUPREME COURT|IN THE COURT)/i;
/** Page furniture immediately after the citation: `(2)`, `1/1`, `Signed by:`, a listing serial. */
const FURNITURE_AFTER = /^\s*(\(\d{1,3}\)|\d{1,3}\s*\/\s*\d{1,3}|page\s*[.# ]*\d|signed by|digitally signed|verified by|\d{2,5}-[a-z]{2,8}-\d{1,5})/i;

export const MONTH_CODES = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANURARY|SEPTEMEBER|ARPIL|AGT)$/i;
export const codeOf = (c) => (String(c ?? '').match(/^\d{4}:([A-Za-z-]+):/) ?? [])[1] ?? '';

export const OWN_ROLES = new Set(['OWN_HEADER_STAMP', 'OWN_LABELLED', 'OWN_PAGE_STAMP', 'OWN_FOOTER_STAMP']);
export const UNDETERMINED_ROLES = new Set(['SOLO_LINE_ONCE', 'IN_BODY_UNLABELLED']);

/**
 * @param r  one sampled document: { first_pos, occurrences, solo_line, len, ctx }
 *           where `ctx` is the text around the FIRST occurrence, already
 *           whitespace-collapsed, with ~260 characters of lead-in.
 * @param cite the citation string being located.
 */
export function roleOf(r, cite) {
  const pos = Number(r.first_pos);
  if (!pos) return 'ABSENT_FROM_TEXT';
  if (MONTH_CODES.test(codeOf(cite))) return 'NOT_A_CITATION';

  const ctx = String(r.ctx ?? '').replace(/\s+/g, ' ');
  const idx = ctx.indexOf(cite);
  const before = idx > 0 ? ctx.slice(0, idx) : '';
  const after = idx >= 0 ? ctx.slice(idx + cite.length) : '';
  const tail = before.slice(-90);
  const len = Number(r.len) || 0;
  const occ = Number(r.occurrences) || 0;

  // Line 1 of the document.
  if (pos <= 6) return 'OWN_HEADER_STAMP';
  // Still in the masthead — the court has not been named yet, so nothing has
  // been cited yet either.
  if (pos <= 260 && !COURT_NAME.test(before)) return 'OWN_HEADER_STAMP';
  if (OWN_LABEL.test(tail)) return 'OWN_LABELLED';
  // A per-page stamp: repeated at a rate consistent with the page count.
  const pages = Math.max(1, Math.round(len / 1800));
  if (occ >= 3 && occ >= pages * 0.5) return 'OWN_PAGE_STAMP';
  if (occ >= 2 && r.solo_line) return 'OWN_PAGE_STAMP';
  // A page or document footer: the citation sits against page furniture, or is
  // the last thing on the document.
  if (FURNITURE_AFTER.test(after)) return 'OWN_FOOTER_STAMP';
  if (len > 0 && pos >= len - 240) return 'OWN_FOOTER_STAMP';
  // Positive evidence it belongs to another judgment.
  if (AUTHORITY_CUES.test(tail)) return 'CITED_AUTHORITY';
  // Undetermined — a layout not yet read. Never counted as right or wrong.
  if (r.solo_line) return 'SOLO_LINE_ONCE';
  return 'IN_BODY_UNLABELLED';
}

/** The addendum's source hierarchy, per document. */
export function evidenceClassOf(r, court) {
  if (!Number(r.len)) return 'SOURCE_UNAVAILABLE';
  if (Number(r.first_pos) > 0) return 'PRINTED_ON_DOCUMENT';
  // `sci.ts` takes the Supreme Court citation from source metadata, not text,
  // so its absence from the body is expected and is not a miss.
  if (court === 'Supreme Court of India') return 'OFFICIAL_METADATA_ONLY';
  return 'NOT_FOUND';
}
