/**
 * Citation extraction — the judgment-to-judgment edges the corpus never had.
 *
 * `judgments.overruled_status` is `none` on all 38,341 rows and
 * `overruled_by_judgment_id` is null on all of them, so nothing in the product
 * can currently show that the law has moved. `docs/CITATION_HARNESS.md` names
 * this exact state in its blind-spots section: a corpus that never learned an
 * overruling reads 0.0% stale while advocates see stale badges, because both
 * sides of the comparison agree. This module is what makes those edges exist.
 *
 * Two rules govern everything here, and both come from the harness:
 *
 * 1. **Never invent an edge.** A citation that does not resolve EXACTLY against a
 *    stored `neutral_citation` or `reporter_citations` entry stays unresolved. A
 *    fuzzy match would be a fabricated statement about what one court said of
 *    another, which is the failure this product exists to prevent.
 *
 * 2. **Never infer a relationship without evidence.** Whether a later bench
 *    *followed* or *overruled* an authority is a legal reading, not a string
 *    match. Where a signal phrase is present next to the citation we record the
 *    relationship AND the phrase that justified it, so any row can be audited
 *    back to its own text. Where no phrase is present the relationship is
 *    `cites` — mechanically true and claiming nothing more.
 */

/** A citation found in a judgment's text, before resolution. */
export type ExtractedCitation = {
  /** Exactly as it appeared, for provenance. */
  raw: string;
  /** Comparison form — see `normaliseCitation`. */
  normalised: string;
  /** Character offset into the source text; lets a row point back at its span. */
  offset: number;
};

export type Relationship = 'cites' | 'followed' | 'distinguished' | 'doubted' | 'overruled';

export type TreatmentSignal = {
  relationship: Relationship;
  /** The phrase that justified it. Stored so the row is auditable. */
  evidence: string;
};

/**
 * Indian citation formats, most specific first.
 *
 * Deliberately narrow. Each pattern anchors on a reporter abbreviation that only
 * appears in a citation, so ordinary prose cannot match. Broadening these to
 * catch more citations would trade precision for recall in the one place this
 * product cannot afford it.
 */
const PATTERNS: readonly RegExp[] = [
  // Neutral: 2024 INSC 123 — the Supreme Court's own, and unambiguous.
  /\b(\d{4})\s+INSC\s+(\d{1,5})\b/g,
  // (2019) 4 SCC 221 · (2019) 4 S.C.C. 221
  /\((\d{4})\)\s*(\d{1,3})\s*S\.?\s?C\.?\s?C\.?\s*(\d{1,5})\b/g,
  // AIR 1973 SC 1461
  /\bAIR\s+(\d{4})\s+SC\s+(\d{1,5})\b/g,
  // (1950) SCR 869 · [1950] SCR 869 · (1950) 1 SCR 869
  /[[(](\d{4})[\])]\s*(\d{1,3})?\s*S\.?\s?C\.?\s?R\.?\s*(\d{1,5})\b/g,
  // (2019) 5 SCALE 123
  /\((\d{4})\)\s*(\d{1,3})\s*SCALE\s*(\d{1,5})\b/g,
];

/**
 * Comparison form: uppercase, reporter punctuation removed, whitespace collapsed.
 *
 * `(2019) 4 S.C.C. 221`, `(2019) 4 SCC 221` and `(2019)4 SCC  221` are the same
 * citation typeset three ways. They must compare equal or the same authority
 * resolves inconsistently depending on which judgment quoted it.
 *
 * Digits and their order are never touched — `(2019) 4 SCC 221` and
 * `(2019) 4 SCC 212` are different cases.
 */
export function normaliseCitation(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[[\]]/g, (m) => (m === '[' ? '(' : ')'))
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\)(\S)/g, ') $1')
    .trim();
}

/** Every citation in a judgment's text, de-duplicated on first appearance. */
export function extractCitations(text: string): ExtractedCitation[] {
  const seen = new Map<string, ExtractedCitation>();
  for (const pattern of PATTERNS) {
    // Fresh lastIndex per call — these are module-level /g regexes and a shared
    // cursor would silently skip matches on the second judgment onward.
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[0].trim();
      const normalised = normaliseCitation(raw);
      if (!seen.has(normalised)) {
        seen.set(normalised, { raw, normalised, offset: match.index });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.offset - b.offset);
}

/**
 * The court's OWN annotation of how it treated an authority.
 *
 * Reported Supreme Court judgments carry an explicit marker after a citation:
 *
 *   … 2005 INSC 498 : [2005] Supp. 4 SCR 223 : (2005) 8 SCC 383 – relied on.
 *   … [2023] 15 SCR 1081 : (2024) 6 SCC 1 – followed.
 *   … 1952 INSC 2 : [1952] 1 SCR 218 : (1952) 1 SCC 9 – referred to.
 *
 * That marker is primary source. It is what the reporter recorded the bench as
 * doing, and it is the only thing this module will treat as evidence.
 *
 * **This replaces a proximity heuristic that was measurably wrong.** Scanning 400
 * characters either side of a citation for phrases like "is set aside" produced
 * 33 overrulings in 300 judgments — against 143 explicit `overruled` markers in
 * the entire 38,341-judgment corpus, an over-fire of roughly 30x. The cause is
 * that *"the impugned order is hereby set aside"* is near-universal in Indian
 * judgments and routinely sits beside the citation block, so the phrase was read
 * as describing the cited authority when it described the order under appeal.
 * Spot-checking put a fabricated overruling on N.P. Ponnuswami (1952), which the
 * same passage marked "– referred to".
 *
 * A wrong edge here is a fabricated statement about what one court said of
 * another. `docs/CITATION_HARNESS.md` exists to prevent exactly that, so the bar
 * is an explicit annotation or nothing.
 */
const MARKERS: readonly { pattern: RegExp; relationship: Relationship }[] = [
  { pattern: /overruled/i, relationship: 'overruled' },
  { pattern: /dissented\s+from/i, relationship: 'doubted' },
  { pattern: /doubted/i, relationship: 'doubted' },
  { pattern: /distinguished/i, relationship: 'distinguished' },
  { pattern: /relied\s+on/i, relationship: 'followed' },
  { pattern: /approved/i, relationship: 'followed' },
  { pattern: /followed/i, relationship: 'followed' },
  // "referred to" means the case was mentioned, NOT that it was treated. It is
  // the most common marker in the corpus by a wide margin and maps to `cites`.
  { pattern: /referred\s+to/i, relationship: 'cites' },
];

/** How far past a citation the marker may sit. */
const MARKER_WINDOW = 220;

/** Matches the dash-and-marker that closes a Case Law Cited entry. */
const MARKER_RE =
  /[-–—]\s*(overruled|dissented\s+from|doubted|distinguished|relied\s+on|approved|followed|referred\s+to)\b/i;

/**
 * Reads the court's annotation following a citation.
 *
 * `end` is the offset just past the citation text. The marker is searched for
 * FORWARD only, because the annotation always trails its entry.
 *
 * Returns `cites` with no evidence when there is no annotation — the common and
 * correct case. Most citations in a judgment are references rather than
 * treatments, and labelling them otherwise overstates the record.
 */
export function detectTreatment(text: string, end: number): TreatmentSignal {
  const ahead = text.slice(end, Math.min(text.length, end + MARKER_WINDOW));

  // A case name between this citation and the marker means the marker belongs to
  // a LATER entry in the list, not to this one. Parallel citations of the same
  // case carry no "v." between them, so this cleanly separates the two.
  const boundary = ahead.search(/\sv\.?s?\.?\s|\n\s*\n/i);
  const reachable = boundary === -1 ? ahead : ahead.slice(0, boundary);

  const found = MARKER_RE.exec(reachable);
  if (!found) return { relationship: 'cites', evidence: '' };

  const marker = found[1] ?? '';
  for (const m of MARKERS) {
    if (m.pattern.test(marker)) {
      // "referred to" is an annotation but not a treatment: record no evidence,
      // so `evidence` stays a field that only ever justifies a real relationship.
      if (m.relationship === 'cites') return { relationship: 'cites', evidence: '' };
      return { relationship: m.relationship, evidence: found[0].trim() };
    }
  }
  return { relationship: 'cites', evidence: '' };
}

/**
 * Every comparison form under which a judgment can be cited.
 *
 * A judgment carries one neutral citation and any number of reporter citations,
 * and a later court may use any of them. Indexing all of them is what lets
 * `AIR 1973 SC 1461` and `(1973) 4 SCC 225` resolve to the same row.
 */
export function citationKeys(judgment: {
  neutralCitation: string | null;
  reporterCitations: readonly string[];
}): string[] {
  const keys = new Set<string>();
  if (judgment.neutralCitation) keys.add(normaliseCitation(judgment.neutralCitation));
  for (const r of judgment.reporterCitations) {
    if (r.trim()) keys.add(normaliseCitation(r));
  }
  return [...keys];
}
