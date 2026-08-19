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

/**
 * Strips the registry's own numeric stage code from the front of a disposal.
 *
 * Gujarat and Bombay print `26-DISMISSED  @ ADM.STAGE`, `28-REJECTED   @
 * ADM.STAGE`, `44-PARTLY ALLOWED @ FH` — the number is a stage code in the
 * court's own list, not part of the outcome. Every anchored pattern in this
 * module (`^DISMISSED$`, `^REJECTED\b`, `^(PARTLY )?ALLOWED`) fails on them for
 * that reason alone, which left ~20,000 rows unclassified over a leading `26-`.
 *
 * Stripped rather than enumerated: the codes run at least 26–59 and are a
 * registry's internal numbering, so a list of them would go stale the first
 * time a court added one. The ORIGINAL string is still what gets recorded in
 * `method`, so nothing about the audit trail is normalised away.
 */
const stripStageCode = (v: string) => v.replace(/^\d{1,3}-\s*/, '');

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
    /^CONVERTED$/.test(disposal) ||
    // ── extended 14 Aug 2026 from the MEASURED vocabulary, see MEASURED_VOCABULARY ──
    WITHDRAWAL.test(disposal) ||
    INFRUCTUOUS.test(disposal) ||
    DEFAULT_OR_NON_COMPLIANCE.test(disposal) ||
    TRANSFERRED.test(disposal) ||
    SETTLED.test(disposal) ||
    // Unanchored on purpose: the source prints `DISPOSED OFF AS ABATED`,
    // `PROCEEDINGS CLOSED/DROPPED` and `CONSIGNED TO RECORD` as well as the
    // bare words, and an anchored form matched only the bare ones.
    /(\bABATED\b|\bDROPPED\b|NON PROSECUTION|CONSIGNED TO RECORD)/.test(disposal) ||
    /^DISMISS OTHER THAN MERIT/.test(disposal)
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MEASURED_VOCABULARY — extracted from production 14 Aug 2026, not reasoned about
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `LANE_PROTOCOL.md` §3b records this repo's most expensive parser lesson: a
 * generic pattern for a court's printed vocabulary was written twice and was
 * wrong both times, **in both directions at once** — matching prose while
 * missing real markers. The fix was to extract the actual vocabulary first.
 * That is what these patterns are built from.
 *
 * The measurement: `SELECT upper(trim(disposal_nature)), count(*) … GROUP BY 1`
 * over the whole corpus — **487 distinct values across 4,398,309 rows.** Before
 * this change 593,786 rows sat at `unclassified_disposal` and 112,058 at
 * `no_disposal_nature`, and reading the top of that list showed most of it was
 * not ambiguous at all, merely unlisted:
 *
 *     DISMISSED AS WITHDRAWN        71,226      DISMISSED AS INFRUCTUOUS  65,392
 *     27-WITHDRAWN  @ ADM.STAGE     40,254      DISMISSED FOR DEFAULT     29,523
 *     TRANSFER TO OTHER COURT       18,775      DISMISSED AS NOT PRESSED  15,301
 *     DISMISED (sic)                 8,621      DISPOSED IN LOK ADALAT     8,735
 *
 * **`DISMISED` is the one worth naming.** 8,621 rows carry that spelling, and
 * `isMerits`'s anchored `/^DISMISSED$/` could never match it — a source
 * typo silently costing a five-figure row count. Misspellings are matched
 * verbatim as the source prints them (`INFRACTUOUS`, `INFRACTOUS`, `DISSMISS`)
 * rather than by a fuzzy rule that would also swallow things it should not.
 *
 * **What is deliberately NOT added here, and this is the point of the change:**
 * `DISPOSED`, `DISPOSED OFF`, `DISPOSED OF`, `DISPOSED OF NO COSTS`, `CLOSED`,
 * `ORDERED` and the `@ ADM.STAGE`/`ANY OTHER MODE` codes stay unclassified —
 * **~1.5M rows OF THE CORPUS WE CURRENTLY HOLD.** The module header's reasoning
 * is unchanged and now has a much larger denominator behind it: those words
 * cover a reasoned decision, a consent order and an infructuous closure alike,
 * and no amount of vocabulary work makes the source say which. **That residue is
 * the population a model may look at, and the only one** — everything above it
 * is now answered from the source's own field, for free, exactly.
 *
 * **THE ~1.5M IS SCOPED TO WHAT WE HOLD, AND WHOEVER BUDGETS THE MODEL PASS
 * NEEDS THE OTHER NUMBER.** NEW2 sampled 200 documents across 20 court-year
 * cells of the *plain* bucket variant through this exact function, unmodified
 * (bus 0628, `docs/HC_PLAIN_VARIANT_COMPOSITION.md`), and measured the
 * unclassified residue at **44.5%**. Against the plain variant's 19,237,684
 * documents that projects to **8–9 million** model-eligible documents at full
 * acquisition — roughly six times the production figure above.
 *
 * The two numbers do not disagree; they have different denominators, and quoting
 * either one without saying which is how a DeepSeek budget comes out 6x wrong in
 * whichever direction the reader assumed. `1.5M` = what is eligible in the
 * corpus today. `8–9M` = what becomes eligible if acquisition completes.
 * Indicative rather than a corpus rate — 20 cells chosen for spread is not a
 * random draw — but the direction is not in doubt.
 *
 * NEW2's sample also confirms this refusal is load-bearing rather than
 * conservative: **all 89 unclassified documents were the `DISPOSED*`/`CLOSED`
 * family and nothing else fell through**, so the vocabulary is otherwise
 * complete. A rule that guessed `DISPOSED OFF` into `decided` would have moved
 * **32.5% of the sample** into the authority class on a word that does not mean
 * it. Whoever proposes that rule next should be shown that number first.
 *
 * Transfers and Lok Adalat settlements are folded into `procedural_disposal`
 * rather than given new classes on purpose: they are disposals in which this
 * court decided no merits, which is precisely what that class means, and
 * inventing enum values would break the `hc_document_class` segmentation LCC
 * and NEW1 already consume.
 */

/**
 * Withdrawn, not pressed, or dismissed *as* withdrawn. The court decided nothing.
 *
 * `NOT.?PRESSED` rather than `NOT PRESSED`, added 18 Aug 2026: the source also
 * prints `NOT-PRESSED` (119 rows), and a space is not a rule. Found by replaying
 * the current rules over the recorded unclassified vocabulary rather than by
 * reading the source list again — `disposal-coverage-cli.ts`.
 */
const WITHDRAWAL = /(WITHDRAW|NOT.?PRESSED)/;

/** Infructuous — the matter became moot. Three spellings appear in the source. */
const INFRUCTUOUS = /(INFRUCTUOUS|INFRACTUOUS|INFRACTOUS)/;

/** Dismissed for default, non-appearance, or failure to comply with the registry. */
const DEFAULT_OR_NON_COMPLIANCE =
  /(FOR DEFAULT|IN DEFAULT|WANT OF PROSECUTION|NON COMPLIANCE|NON-COMPLYING|DISSMISS)/;

/** The case went to another forum. This court reached no merits. */
const TRANSFERRED = /^(RE-)?TRANSFER(RED)?\b/;

/** Lok Adalat / compromise / consent terms — settled, never adjudicated. */
const SETTLED = /(LOK.?ADALAT|\bCOMPROMISE|CONSENT TERMS|^SETTLED\b)/;

/**
 * A disposal that decided something.
 *
 * Extended 14 Aug 2026 from `MEASURED_VOCABULARY`. **Every branch here is
 * reached only AFTER `isProcedural`**, which is what makes the broad
 * `DISMISS(ED)` forms safe: `DISMISSED AS WITHDRAWN`, `DISMISSED AS
 * INFRUCTUOUS`, `DISMISSED FOR DEFAULT` and their misspellings have already
 * been claimed as procedural by the time control reaches this function, so what
 * survives to be matched here is a dismissal on the merits. Reordering these
 * two calls would silently reclassify ~250,000 rows from "the court decided
 * nothing" to "the court decided against you", which is the more damaging of
 * the two errors and the reason this note exists at the call site's expense.
 */
function isMerits(disposal: string): boolean {
  return (
    /^(PARTLY )?ALLOWED/.test(disposal) ||
    /^DISMISSED$/.test(disposal) ||
    /^REJECTED$/.test(disposal) ||
    // `ON MERITS` is the source stating it outright — the strongest signal here.
    /ON MERITS/.test(disposal) ||
    ALLOWED_FORMS.test(disposal) ||
    DISMISSED_FORMS.test(disposal) ||
    RULE_OUTCOME.test(disposal)
  );
}

/** Allowed / granted / partly allowed, in the forms the courts actually print. */
const ALLOWED_FORMS =
  /(\bALLOWED\b|^GRANTED$|^LEAVE GRANTED$|^APPLICATION ALLOWED$|^CASE ALLOWED$|^MODIFIED$|^REMANDED\b|^AMOUNT AWARDED$|^DECREED$)/;

/**
 * Dismissed / rejected, including the source's own misspelling.
 *
 * `DISMISED` — one S — appears on **8,621 rows**. The previous anchored
 * `/^DISMISSED$/` could not match it, so those rows sat unclassified purely
 * because a registry clerk's typo is not a code path. Matched literally, not
 * by an edit-distance rule that would also catch things it should not.
 */
const DISMISSED_FORMS =
  /(^DISMISED$|^DISMISS$|^DISMISSED\b|^APPEAL (IS )?DISMISSED\b|^REJECTED\b|^DISMISSAL\b)/;

/**
 * Writ practice: a rule made absolute is the petition succeeding, a rule
 * discharged is it failing. Both are decisions on the merits, and both are
 * printed with the Bombay/Gujarat numeric prefixes (`38-`, `58-`, `39-`).
 */
const RULE_OUTCOME = /(RULE ABSOLUTE|RULE MADE ABSOLUTE|RULE DISCHARGED|NOTICE DISCHARGED|\bABSOLUTE\b)/;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE 18 AUG 2026 ADDITIONS, AND — MORE IMPORTANTLY — WHAT WAS LEFT ALONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Method: `disposal-coverage-cli.ts` replayed THIS function over all 332 raw
 * disposal strings recorded in `hc_class_method`, covering 883,796 rows, and
 * split them three ways. The result reframed the task:
 *
 *   STALE      123,840  14.0%  today's rules already claim these; they are
 *                             unclassified only because nothing re-read them
 *   RESIDUE    755,620  85.5%  the DISPOSED / CLOSED family refused above
 *   CANDIDATE    4,336   0.5%  refused, and not by a documented decision
 *
 * **New rules can win at most 4,336 rows. The `--restale` re-run wins 123,840.**
 * That is the whole finding, and it is why this section is four small patterns
 * rather than thirty: the coverage problem was never a vocabulary problem.
 *
 * Added, each because the source states an outcome and only one reading exists:
 *
 *   NOT-PRESSED         119  a space was the only thing failing the match
 *   APPEAL DISMISSED    121  the anchored form only allowed `APPEAL IS DISMISSED`
 *   ABSOLUTE            229  writ practice: a rule made absolute is the petition
 *                            succeeding. Also catches `INJUNCTION MADE ABSOLUTE`
 *                            and `PETITION MADE ABSOLUTE`; no procedural string
 *                            in the measured vocabulary contains the word.
 *
 * **DELIBERATELY NOT ADDED, and this list is the more useful half:**
 *
 *   DELAY CONDONED (791), CONDONED (64), TIME EXTENDED (107) — the court decided
 *   an APPLICATION INSIDE the case, not the case. `procedural_disposal` means
 *   "the case ended without a decision on its merits", and these do not end the
 *   case at all. Filing them there would be a wrong substantive classification,
 *   which is the one error this module may not make; UNKNOWN is correct.
 *
 *   DELAY CONDONATED/REJECTED. (1,216) — the largest single candidate and the
 *   least determinate. The slash carries both outcomes and the source does not
 *   say which happened. No amount of pattern work makes it say.
 *
 *   PEREMPTORY (128) — same family as `PREMPTORY` (4,166), which is already
 *   residue. It names a hearing posture, not a disposal.
 *
 *   GRANT ISSUED (461) — probably a testamentary grant, and "probably" is the
 *   problem. Left for the model pass with the rest of the residue.
 */

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
   * What the RULES read. `disposal` itself stays untouched so `method` still
   * records exactly what the source printed — a classification has to be
   * auditable against the raw field, not against our normalisation of it.
   */
  const outcome = stripStageCode(disposal);

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

  if (isBail(outcome)) return { documentClass: 'bail_order', method: 'disposal_nature_bail' };
  /**
   * PROCEDURAL BEFORE MERITS, and the order is load-bearing — see `isMerits`.
   * `DISMISSED AS WITHDRAWN` (71,226 rows) is a withdrawal, not a dismissal on
   * the merits, and only this ordering keeps it one.
   */
  if (isProcedural(outcome)) {
    return { documentClass: 'procedural_disposal', method: 'disposal_nature_procedural' };
  }
  if (isMerits(outcome)) {
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
