/**
 * What KIND of document each High Court row is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY IT IS NOT CALLED "JUDGMENT VS ORDER"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/CURRENT_PLAN.md` and `HC_CORPUS_CHARACTERIZATION.md` §11 both record the
 * standing rule: **40,980 rows are 40,980 DOCUMENTS, not 40,980 authorities.**
 * The measured judgment share of this corpus is 0.75%–18.64%, and
 * `source_document_type` is NULL on every one of these rows because the plain
 * metadata variant publishes no `order_type` at all.
 *
 * So the corpus cannot currently tell a reasoned decision from a two-line
 * adjournment, and a retrieval index built on it would present both identically.
 *
 * **But "is this a judgment or an order" is a legal characterisation, and this
 * module deliberately does not make one.** Whether a High Court order carries
 * precedential weight is a question about reasoning and ratio, not about a
 * metadata field. What this classifies is what can be OBSERVED from the source's
 * own fields, which is a different and answerable question.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY RULE READS A RAW SOURCE FIELD, NOT THE JUDGMENT'S PROSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `disposal_nature` is present on **40,791 of 40,980 (99.5%)** and is verbatim
 * from the source. `case_number` is present on 100% and is verbatim. Neither is
 * inferred from the text, so a classification built on them inherits the
 * source's own record rather than a model's reading of it.
 *
 * Measured distribution, production, 11 Aug 2026:
 *
 *   BAIL GRANTED     14,273     DISPOSED        9,800     ALLOWED     4,978
 *   BAIL REJECTED     2,443     WITHDRAWN       2,588     DISMISSED   3,524
 *   ABATED              419     NON-PROSECUTION   366     REJECTED      523
 *
 * And `case_number` prefixes: **CRMISC 30,257 (74%)** — Criminal Miscellaneous,
 * which in this corpus is overwhelmingly bail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLASS THAT MATTERS MOST IS `reference_stub`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Read directly, at 185 and 212 characters:
 *
 *   "The writ petition is allowed. Order passed in writ petition No. 3610 of 2001."
 *   "For order, see our order of date passed on the separate sheet in F.A. No.243."
 *
 * **The reasoning is in another document.** Retrieving one of these hands an
 * advocate a result that points somewhere else — worse than returning nothing,
 * because it occupies a slot and looks like an answer. `CITATION_HARNESS.md`'s
 * rule that absence must state itself applies: a pointer is not evidence.
 *
 * Measured: an explicit pointer phrase appears in **35.1% of documents under 500
 * characters** and in **0.1–1.1% of everything above it**, so the pattern is
 * real and concentrated rather than uniform noise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNCLASSIFIED IS A RESULT, NEVER A DEFAULT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A row no rule claims returns `null` with method `unclassified`. It is not
 * bucketed into the nearest class. `NOT INDEXED MUST NOT BECOME NOT RELEVANT`,
 * and the same discipline applies one level up: *not classified* must not become
 * *classified as ordinary*.
 */

/** What the source's own fields say this document is. Never a legal weight. */
export type HcDocumentClass =
  /** `disposal_nature` names a bail outcome. The largest single class. */
  | 'bail_order'
  /** The case ended without a decision on its merits — withdrawn, abated, not prosecuted. */
  | 'procedural_disposal'
  /** The text points at another document for its reasoning. Not evidence of anything. */
  | 'reference_stub'
  /** A disposal on the merits, with enough text to contain reasoning. */
  | 'decided'
  /** A disposal on the merits whose text is too short to carry reasoning. */
  | 'decided_brief';

export type HcClassification = {
  /** `null` when no rule claims the row. Never guessed into a class. */
  documentClass: HcDocumentClass | null;
  /** Which rule fired, so any row's classification is auditable without re-deriving it. */
  method: string;
};

/**
 * Below this, a document cannot hold a court's reasoning.
 *
 * Not a round number chosen for looks. The standard Patna header — court, case
 * number, parties, advocates — measures **65–155 characters** of overhead
 * against total length in every band, so length is a fair proxy for content
 * rather than for boilerplate. Under 500 characters there is no room for a
 * recital AND a finding, and 35.1% of that band explicitly says the order is
 * elsewhere.
 */
export const STUB_MAX_CHARS = 500;

/**
 * Below this, a merits disposal is recorded but its reasoning is not.
 *
 * Sampled real rows at this length are Miscellaneous Jurisdiction Cases —
 * `MJC/4114/2025 In Civil Writ Jurisdiction Case No.10330 of 2020` — which are
 * applications *inside* another case rather than standalone decisions. They are
 * kept as their own class rather than merged with `decided`, because "allowed"
 * with 854 characters and "allowed" with 20,614 are not the same object and a
 * retrieval index should be able to tell them apart.
 */
export const BRIEF_MAX_CHARS = 1500;

/** The reasoning is somewhere else. Phrases read off real rows, not imagined. */
const POINTER =
  /(see (our|the) order|for order,? see|passed (in|on) (a )?separate sheet|order passed in|as per (our )?order (of|in)|in terms of the order passed in)/i;

const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();

/** Bail, either way. `disposal_nature` states it; nothing is inferred. */
function isBail(disposal: string): boolean {
  return /^BAIL (GRANTED|REJECTED)$/.test(disposal) || /\bBAIL\b/.test(disposal);
}

/**
 * A bail matter whose `disposal_nature` says only `ALLOWED` / `DISMISSED`.
 *
 * **Found by reading the validation sample, not by a test.** The first version
 * of this module classified every merits disposal as `decided`, and the sample
 * came back full of `CR. MISC.` rows — Criminal Miscellaneous, which in this
 * corpus is overwhelmingly bail. Measured against production:
 *
 *   CR. MISC. with a merits disposal          6,598
 *   ⤷ containing an explicit bail phrase      5,092   (77%)
 *   CWJC (writ) with a merits disposal          738
 *   ⤷ containing an explicit bail phrase           1   (0.1%)
 *
 * So **58% of what would have been labelled `decided` were bail applications**,
 * and the index would have been told they were decided authorities on a legal
 * question. The CWJC control is what makes this a signal rather than a
 * coincidence: the phrase does not appear in writ matters.
 *
 * **This rule reads the PROSE, unlike every other rule here**, so it is recorded
 * with its own method name and is the one classification in this module that is
 * an inference rather than a restatement of a source field. `enlarged on bail`
 * and `released on bail` are included because they are how a Patna order states
 * the operative direction.
 */
const BAIL_PHRASE =
  /(anticipatory bail|regular bail|bail application|enlarged on bail|released on bail|prayer for bail)/i;

/**
 * The case ended without the court deciding it.
 *
 * `D.F.D.` is "dismissed for default" and appears in several printed forms
 * (`D.F.D. FOR NON APPEARANCE`, `D.F.D. (PRE-EMPTORY)`); `CONSIGNED` means sent
 * to the record room. None of these is a decision on the merits, and none of
 * them can support a proposition.
 */
function isProcedural(disposal: string): boolean {
  return (
    /^WITHDRAWN$/.test(disposal) ||
    /^ABATED$/.test(disposal) ||
    /NON.?PROSECUTION/.test(disposal) ||
    /^D\.?F\.?D\.?/.test(disposal) ||
    /DISMISS(ED)? FOR DEFAULT/.test(disposal) ||
    /^CONSIGNED$/.test(disposal) ||
    /^CONVERTED$/.test(disposal)
  );
}

/** A disposal that decided something. */
function isMerits(disposal: string): boolean {
  return /^(PARTLY )?ALLOWED/.test(disposal) || /^DISMISSED$/.test(disposal) || /^REJECTED$/.test(disposal);
}

/**
 * Classify one row.
 *
 * **Order matters.** `reference_stub` is tested first: a 185-character document
 * saying "the writ petition is allowed, order passed in [other case]" carries
 * `disposal_nature = ALLOWED`, and classifying it as a merits decision would
 * put a pointer into the index wearing an authority's clothes.
 */
export function classifyHcDocument(row: {
  disposalNature: string | null | undefined;
  caseNumber: string | null | undefined;
  fullText: string;
}): HcClassification {
  const len = row.fullText.length;
  const disposal = norm(row.disposalNature);

  /**
   * 1 · The reasoning is elsewhere. Checked before anything reads the disposal.
   *
   * The length bound was `STUB_MAX_CHARS * 4` and is now `* 2`. The validation
   * sample caught it over-firing on a 1,617-character Miscellaneous
   * Jurisdiction Case — `MJC/2684/2017 In Civil Writ Jurisdiction Case
   * No.6979 of 2016` — where the reference to another case is the application's
   * SUBJECT, not a statement that its own reasoning lives elsewhere. The real
   * stubs measured 171–212 characters.
   */
  if (POINTER.test(row.fullText) && len < STUB_MAX_CHARS * 2) {
    return { documentClass: 'reference_stub', method: 'pointer_phrase' };
  }
  if (len < STUB_MAX_CHARS) {
    return { documentClass: 'reference_stub', method: 'below_stub_length' };
  }

  if (disposal === '') return { documentClass: null, method: 'no_disposal_nature' };

  if (isBail(disposal)) return { documentClass: 'bail_order', method: 'disposal_nature_bail' };
  if (isProcedural(disposal)) {
    return { documentClass: 'procedural_disposal', method: 'disposal_nature_procedural' };
  }
  if (isMerits(disposal)) {
    // A bail application whose disposal says only "allowed". See BAIL_PHRASE:
    // 58% of what this branch would otherwise have called `decided`.
    if (BAIL_PHRASE.test(row.fullText)) {
      return { documentClass: 'bail_order', method: 'text_bail_phrase' };
    }
    return len < BRIEF_MAX_CHARS
      ? { documentClass: 'decided_brief', method: 'disposal_nature_merits_short' }
      : { documentClass: 'decided', method: 'disposal_nature_merits' };
  }

  /**
   * `DISPOSED` is deliberately NOT classified.
   *
   * 9,800 rows carry it and it is the single most ambiguous value in the
   * column: it covers a reasoned decision, a consent order, and an
   * infructuous-application closure alike. Guessing it into `decided` would
   * inflate the authority count by 24% of the corpus on a word that does not
   * mean what the guess needs it to mean.
   */
  return { documentClass: null, method: `unclassified_disposal:${disposal.slice(0, 40)}` };
}
