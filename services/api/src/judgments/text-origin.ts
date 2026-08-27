/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHOSE EDITION OF THE TEXT IS THIS — DERIVED FROM PROVENANCE, NEVER FROM CONTENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R8.3 §8.3, FIFTH bus 1367, and CLAUDE.md §6: *"use raw court text and never a
 * law report's edition of it"* — the rule that follows from
 * *Eastern Book Company v. D.B. Modak*, where the judgment is uncopyrightable
 * and the reporter's COPY-EDITED version is not.
 *
 * FIFTH found one judgment whose body opens with an S.C.R. case heading and an
 * editorial digest, served by the reader as undifferentiated judgment text, and
 * asked for an enforced source/content boundary. Explicitly NOT via the role
 * detector: its reporter recall is 42.1%, so making it the gate would let more
 * than half through while sounding like a guarantee.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE ANSWERS IT WITHOUT A CLASSIFIER, AND THE ANSWER IS LARGER THAN ONE ROW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Supreme Court corpus comes from one bucket whose object names are
 * `year_volume_startpage_endpage_EN.pdf` — `1971_3_282_297_EN.pdf`,
 * `1996 SUPP 2 424 442` as `S_1996_2_424_442_EN.pdf`. Volume and page. That is
 * REPORTER pagination; a court registry does not number its judgments by the
 * pages of a book.
 *
 * Measured on the live corpus rather than inferred from the shape:
 *
 *     Supreme Court judgments from that bucket        38,342
 *       carrying an S.C.R. reporter citation          38,342   (100%)
 *       filename is year_volume_page_page             30,702
 *       filename is S_year_volume_page_page            7,640   (SUPP volumes)
 *
 * And the bodies carry the reporter's own page furniture. Sampled openings:
 *
 *     "S.C.R. SUPREME COURT REPORTS 393"          <- the running head
 *     "A | B | , | c | D | E | F | G | H"         <- S.C.R. marginal letters
 *     "282 | ALLEN BERRY & CO. (P) LTD. | V. ..." <- page number, then the
 *                                                    reporter's case heading
 *
 * So this is not one document with a headnote. **Every Supreme Court judgment we
 * hold from that source is the Supreme Court Reports edition**, page-imaged and
 * OCR'd, not raw court text.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES AND DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It states the ORIGIN of the retained artifact. It does not segment editorial
 * matter from judicial matter inside the body — nothing in this repository can
 * do that reliably yet, and pretending otherwise is the failure mode §8.3 names.
 *
 * It also decides no rights question. §8.2 keeps retain / index / display /
 * generation-evidence / training as separate permissions and forbids inferring
 * one from another. What the wire carries is the fact; the content-use decision
 * is open and is not LCC's to make.
 */

/** Where the text we hold actually came from. */
export type TextOrigin =
  /**
   * The retained artifact is a law reporter's edition — copy-edited, paginated
   * and headnoted by the reporter. Its body may contain editorial matter that
   * is NOT the court's words, and it may not be presented as the court's own
   * reasoning or used as generation evidence.
   */
  | 'REPORTER_EDITION'
  /** The artifact came from a court or registry publication. */
  | 'COURT_SOURCE'
  /** Provenance does not say. Never read as either of the above. */
  | 'UNKNOWN';

/**
 * The one bucket the Supreme Court corpus was harvested from, whose objects are
 * S.C.R. volume/page scans. Matched on the host so a path change does not
 * silently reclassify 38,342 documents as court-sourced.
 */
const SCR_BUCKET = 'indian-supreme-court-judgments';

/**
 * Reporter series that appear in `reporter_citations`. A citation to a series is
 * evidence about the CITATION, not about the artifact — a judgment can carry an
 * S.C.C. citation while the text we hold came from the court. So this is only
 * consulted together with a bucket match, never alone.
 */
const REPORTER_SERIES = /\bS\.?C\.?R\.?\b|\bSCC\b|\bAIR\b|\bS\.?C\.?C\.?\b/i;

export function textOriginOf(row: {
  source_url: string | null;
  reporter_citations: string[] | null;
}): TextOrigin {
  const url = row.source_url ?? '';
  if (url.includes(SCR_BUCKET)) {
    /**
     * The object name is `year_volume_startpage_endpage_EN.pdf`, optionally
     * `S_` prefixed for a supplementary volume. Volume and page is a reporter's
     * addressing scheme, and every one of these rows also carries an S.C.R.
     * citation. Both conditions, so a future object in the same bucket with a
     * different naming scheme is UNKNOWN rather than silently swept in.
     */
    const file = url.slice(url.lastIndexOf('/') + 1);
    const paginated = /^(S_)?\d{4}_\d+_\d+_\d+_[A-Z]{2}\.pdf$/i.test(file);
    const cited = (row.reporter_citations ?? []).some((c) => REPORTER_SERIES.test(c));
    if (paginated && cited) return 'REPORTER_EDITION';
    return 'UNKNOWN';
  }
  return 'UNKNOWN';
}

/**
 * May this body support a generated legal proposition?
 *
 * False for a reporter edition, and that is the §8.3 fail-closed rule made
 * mechanical: high-confidence reporter/editorial text cannot be represented as
 * the court's own words and cannot be generation evidence while the content-use
 * question is open.
 *
 * `UNKNOWN` returns TRUE. Deliberately, and it is the uncomfortable half: 90% of
 * the corpus is UNKNOWN, and refusing it would refuse the product. What the
 * caller gets is a fact — origin is not established — rather than a permission
 * dressed up as one. Tightening this needs the content-use decision, not a
 * bolder default here.
 */
export function generationEvidenceEligible(origin: TextOrigin): boolean {
  return origin !== 'REPORTER_EDITION';
}
