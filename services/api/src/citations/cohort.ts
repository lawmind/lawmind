/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONNECTED-MATTER COHORT — WHAT THE COURT'S OWN HEADER DECLARES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A neutral citation is not a unique key in this corpus. The registry stamps ONE
 * on every connected matter disposed of by a common order, so a citation
 * identifies a DISPOSAL EVENT and a disposal event can cover many judgments.
 *
 * `resolver.ts` has three freshness gates and all three reason about rows that
 * EXIST — above the key builder's cursor, below it, and corpus-wide lag. None of
 * them can see a bearer that has not been ingested at all, and there is no
 * threshold that reaches one. NEW2 measured the hole with a temporal holdout
 * (bus 1622, `docs/ai/new2-r14/NEW2_R14_CITATION_FALSIFIER.md` §7): of 971,879
 * keys single-claim on 18 August, 226 now name more than one distinct case. A
 * bulk apply on 18 August would have pinned 226 references to the wrong
 * authority. FIFTH's falsifier is one of them:
 *
 *   2026:JHHC:24297  M.A. No. 134 of 2018   landed 27 Aug
 *   2026:JHHC:24297  C.O. No. 09 of 2022    landed 29 Aug
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EVIDENCE IS IN THE DOCUMENT WE ALREADY HOLD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * On 27 August the corpus already contained the proof, printed by the court on
 * line 2 of the one judgment we had:
 *
 *   2026:JHHC:24297
 *   1 M.A. No. 134 of 2018
 *   With
 *   C.O. No. 09 of 2022
 *   IN THE HIGH COURT OF JHARKHAND AT RANCHI
 *
 * The cause title declares TWO matters. `judgments.case_number` for that row
 * names ONE. So the citation was known to cover a cohort of two while we held a
 * single bearer, twelve days before the second one landed.
 *
 * That is the whole mechanism, and it is why this gate can reach what the other
 * three structurally cannot: it does not ask how many bearers EXIST, it asks how
 * many the court SAID there are and compares that to how many we hold.
 *
 *   declaredMatters > heldCandidates  ->  the cohort has not fully landed
 *                                    ->  `UNIQUE` is not available
 *
 * The comparison is self-limiting in both directions. It cannot fire on an
 * ordinary single-matter judgment, whose header declares exactly one. It stops
 * firing on its own once every declared sibling has been ingested, with no
 * threshold to tune and nothing to switch off.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT IS WORTH, MEASURED ON AN INSTRUMENT THAT READS NO RESOLVER OUTPUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC re-derived NEW2's holdout independently and got the same 226 keys.
 * `docs/ai/lcc-r15/cohort-gate.json`, 31 August 2026:
 *
 *    97 of the 180 reachable false uniques  (53.9%)  no longer claim UNIQUE
 *    34 of 2,295 keys that stayed single    (1.48%)  lose the word "only"
 *
 * The 1.48% is a recall cost and NOT a wrong answer: in each of those the court
 * did print a conjunction and a sibling we do not hold. Hand-read, the
 * commonest reason a refusal was not worth making is a lower-court or FIR
 * number joined by a conjunction — `CRIMINAL APPEAL No. 123 of 2013 ...
 * connected with S.T. No. 751 of 2009` is one proceeding, not two. Separating
 * those needs a list of which registry types are High Court matters, and a list
 * that scores well on the documents it was written from is not evidence.
 *
 * 83 of the 180 are not reachable from any document we hold: the court issued
 * SEPARATE orders under one neutral citation, each declaring only its own
 * matter. No amount of reading judgment A reveals judgment B. That residue is a
 * data-contract gap and is handed back rather than papered over.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Not a similarity heuristic.** No party name, no date proximity, no title
 * distance, no embedding. The only inputs are case-number tokens the court
 * printed in its own cause title and a conjunction it printed between them.
 * `CITATION_HARNESS.md` forbids manufacturing an edge from resemblance and this
 * manufactures nothing: it only ever REFUSES a claim.
 *
 * **Not a claim that the siblings exist.** A refusal here says we cannot call
 * the held candidate the only one. The candidate is still returned. The word
 * "only" is withheld — the same shape as the three gates before it.
 *
 * **Not applicable to every false unique.** LCC measured NEW2's 226 and they are
 * two different defects, not one (`docs/ai/lcc-r15/cohort-gate.json`):
 *
 *   180  same court, same date   connected matter / common order   THIS GATE
 *    43  same court, DIFFERENT dates
 *     3  different courts
 *
 * The 46 are judgments carrying ANOTHER judgment's neutral citation in
 * `judgments.neutral_citation` — an ingest attribution defect, not a cohort, and
 * not fixable in the resolver. It is reported to NEW2 rather than absorbed here.
 */

/**
 * How much of the document is a cause title.
 *
 * Every declaration observed sits in the first few lines, above the court's own
 * name. The bound matters because the BODY of a judgment routinely names other
 * case numbers — the impugned trial-court case, an FIR, a connected authority —
 * and counting those would refuse half the corpus for no reason.
 *
 * Swept against NEW2's holdout, 31 August 2026
 * (`docs/ai/lcc-r15/cohort-gate.json`): recall on the 180 reachable positives,
 * against refusals on 2,295 sampled keys that stayed single-claim.
 *
 *    400 chars   93/180    28 refusals (1.22%)
 *    800 chars   97/180    34 refusals (1.48%)   <- shipped
 *   1200 chars   97/180    44 refusals (1.92%)
 *   2400 chars   99/180   104 refusals (4.53%)
 *
 * 800 because 1,200 buys no further recall at all, and 2,400 buys two more
 * positives for seventy more refusals: past the cause title, the window has
 * stopped reading the heading and started reading the judgment.
 *
 * The first run of that sweep was worthless and is recorded as such — every
 * variant was silently clamped to this constant, so four rows measured one
 * window. {@link declaredCohort} now takes the bound as an argument.
 */
export const CAUSE_TITLE_CHARS = 800;

/**
 * The conjunctions Indian High Courts print between connected matters.
 *
 * Required, not optional. Without a connector the rule degenerates into "the
 * header contains two case numbers", which is also true of a judgment that
 * merely recites the order it is appealed from. Both variants were scored on
 * the same holdout at an 800-character window: requiring the conjunction costs
 * 11 of 180 reachable positives (108 -> 97) and removes 93% of the refusals
 * (502 -> 34 of 2,295). That trade is taken because a refusal still returns the
 * authority and a wrong pin does not.
 *
 * `C/W` is Karnataka's, `A/W` Bombay's, `With` Jharkhand's and Allahabad's.
 * Matched case-insensitively and on a word boundary so `WITHOUT` and the `with`
 * inside a sentence cannot fire it.
 *
 * **Every entry is here for a number.** Censused over 14,452 cause titles and
 * attributed over NEW2's holdout — `scripts/lcc-connector-census.mts`:
 *
 *   connector        printed   declares >1   catches   refuses in vain
 *   C/W                  205           205        83                10
 *   WITH                 513           174         9                16
 *   A/W                   54            33         1                 5
 *   ALONG WITH           252            20         2                 3
 *   CONNECTED WITH       202             1         2                 0
 *
 * `C/W` alone carries 83 of the 97. **`ANALOGOUS` and `TAGGED WITH` were in the
 * first draft of this list and are gone: they fired ZERO times in 14,452 cause
 * titles.** They were remembered rather than observed, which is the failure
 * `CLAUDE.md` §7 names outright, and a pattern that has never matched anything
 * is not evidence that it would.
 */
const CONNECTORS: readonly { readonly re: RegExp; readonly name: string }[] = [
  { re: /\bC\s*\/\s*W\b/i, name: 'C/W' },
  { re: /\bA\s*\/\s*W\b/i, name: 'A/W' },
  { re: /\bconnected\s+with\b/i, name: 'CONNECTED WITH' },
  { re: /\balong\s*with\b/i, name: 'ALONG WITH' },
  { re: /(^|\n)\s*with\b/i, name: 'WITH' },
];

/**
 * `M.A. No. 134 of 2018`, `MFA No.100456 OF 2021`, `WRIT TAX No. - 859 of 2023`.
 *
 * The registry prints a matter type, a serial and a year, and it prints them in
 * exactly two layouts. This is the long one. The type is bounded at 40
 * characters so a runaway match cannot swallow a paragraph, and the year is
 * anchored to four digits beginning 19 or 20 so `of 12` in prose cannot form a
 * matter.
 */
const MATTER_LONG =
  /([A-Z][A-Z.&'-]*(?:[ \t]+[A-Z][A-Z.&'-]*){0,4})[ \t]*(?:No[.s]?|NO[.S]?|Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|OF|\/)[ \t]*((?:19|20)\d{2})\b/g;

/** `MA/134/2018`, `APPLN/3717/2023`. The slash layout. */
const MATTER_SLASH =
  /([A-Z][A-Z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/g;

/**
 * `CONT. PETITION NO. 268 OF 2018 / IN WP/5150/2013`.
 *
 * A matter introduced by `IN` is the proceeding this one arises FROM — the writ
 * below the contempt, the trial below the appeal. It is not a sibling disposed
 * of by the same order, and counting it as one refuses every appeal that names
 * the order it appeals. Same reasoning for `arising out of`.
 */
const PARENT_MATTER = /\b(?:IN|ARISING\s+(?:OUT\s+)?(?:OF|FROM)|FROM)[ \t]*$/i;

/** The same marker where the greedy type capture swallowed it — `IN WRIT
 *  PETITION No. 5150 of 2013` matches from `IN`, so it never appears before
 *  the match and has to be caught inside it. */
const PARENT_LEADING = /^(?:IN|ARISING|FROM)\b/i;

/**
 * The court prints the same matter more than once in one cause title, with
 * different words in front of it each time — `CIVIL APPLICATION NO. 11052 OF
 * 2024` on one line and `WITH CIVIL APPLICATION NO. 11052 OF 2024` on the next.
 * Keying on everything before the number would count that matter twice and
 * manufacture a two-matter cohort out of one matter. Keeping only the last two
 * words of the type collapses them, and is stable within a document, which is
 * the only place the comparison is ever made.
 */
function typeToken(captured: string): string {
  return captured
    .trim()
    .split(/[ \t]+/)
    .slice(-2)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/**
 * Type tokens that are not matter types.
 *
 * `Section 302 of 1860` and `Act No. 2 of 1974` have the shape of a case number
 * and are legislation. A statute counted as a connected matter would refuse
 * every judgment that cites one, which is every judgment.
 */
const NOT_A_MATTER =
  /^(SECTION|SECTIONS|ACT|ACTS|ARTICLE|ARTICLES|RULE|RULES|ORDER|ORDERS|CHAPTER|PART|SCHEDULE|CLAUSE|REGULATION|NOTIFICATION|AMENDMENT|ANNEXURE|PARA|PARAGRAPH|VOLUME|PAGE|EDITION|ITEM)$/;

export type DeclaredMatter = {
  /** The court's own text, byte for byte, so a disagreement is auditable. */
  readonly raw: string;
  /** `MA|134|2018`. Layout-independent, so `M.A. No. 134 of 2018` and
   *  `MA/134/2018` are recognised as ONE matter and never counted twice. */
  readonly key: string;
};

export type CohortDeclaration = {
  /** Distinct matters the cause title names. 1 for an ordinary judgment. */
  readonly declaredMatters: number;
  /** The conjunction the court printed, or null where it printed none. */
  readonly connector: string | null;
  readonly matters: readonly DeclaredMatter[];
  /**
   * Was there a cause title to read at all?
   *
   * False means the judgment's text was empty or absent — a tiered-out row
   * whose text now lives in R2, a row the fetch did not return. It is NOT the
   * same as a cause title that declares one matter, and conflating them would
   * make the gate fail OPEN on exactly the rows it cannot see. Measured 31
   * August 2026: 0 of 1,358 sampled key-bearing judgments are tiered, so this
   * costs nothing today and stays correct if `docs/CORPUS_TIERING.md` Tier 3
   * ever reaches them.
   */
  readonly causeTitleAvailable: boolean;
};

/** No cause title to read. Not a cohort, and not a clean bill either. */
const NO_DECLARATION: CohortDeclaration = {
  declaredMatters: 0,
  connector: null,
  matters: [],
  causeTitleAvailable: false,
};

function matterKey(type: string, serial: string, year: string): string | null {
  const t = typeToken(type);
  if (t.length === 0 || NOT_A_MATTER.test(t)) return null;
  // Leading zeros are cosmetic: `C.O. No. 09 of 2022` and `C.O./9/2022` are one
  // matter, and counting them as two would invent a cohort out of a duplicate.
  const n = serial.replace(/^0+/, '') || '0';
  return `${t}|${n}|${year}`;
}

/**
 * Read the cohort a judgment's own cause title declares. **Pure** — no database,
 * no clock, no network — so a million documents can be screened before any query
 * is issued, and so the gate is testable without a corpus.
 */
export function declaredCohort(
  fullTextHead: string | null | undefined,
  /** Overridable so `scripts/lcc-cohort-measure.mts` can sweep the bound. A
   *  sweep whose variants are all silently clamped to the shipped value is a
   *  sweep that measures one thing four times, which is what the first run of
   *  it did. */
  causeTitleChars: number = CAUSE_TITLE_CHARS,
): CohortDeclaration {
  if (!fullTextHead) return NO_DECLARATION;
  const window = fullTextHead.slice(0, causeTitleChars);
  if (window.trim().length === 0) return NO_DECLARATION;

  const found = new Map<string, DeclaredMatter>();
  for (const re of [MATTER_LONG, MATTER_SLASH]) {
    re.lastIndex = 0;
    for (let m = re.exec(window); m !== null; m = re.exec(window)) {
      if (PARENT_MATTER.test(window.slice(Math.max(0, m.index - 24), m.index))) continue;
      if (PARENT_LEADING.test(m[1]!.trim())) continue;
      const key = matterKey(m[1]!, m[2]!, m[3]!);
      if (key !== null && !found.has(key)) found.set(key, { raw: m[0]!.trim(), key });
    }
  }

  const connector = CONNECTORS.find((c) => c.re.test(window))?.name ?? null;
  return {
    declaredMatters: found.size,
    connector,
    matters: [...found.values()],
    causeTitleAvailable: true,
  };
}

/**
 * The three answers this gate can give, in the vocabulary of the round that
 * commissioned it.
 *
 * `UNIQUE_NOT_REFUTED` is deliberately not called `UNIQUE_PROVEN`. Nothing here
 * proves world-uniqueness and `resolver.ts` has said so since v0: a key with one
 * row in `judgment_citation_keys` is one judgment WE HOLD claiming that
 * citation. This gate can only ever REFUTE that claim, so the best it returns is
 * "not refuted, by this instrument".
 */
export type CohortVerdict =
  /** The cause title declares no more matters than we hold. */
  | 'UNIQUE_NOT_REFUTED'
  /** The court joined this matter to siblings we do not hold. */
  | 'COHORT_INCOMPLETE'
  /** There was no cause title to read, so nothing was checked. */
  | 'INSUFFICIENT_TO_PROVE_UNIQUE';

export function cohortVerdict(
  declaration: CohortDeclaration,
  heldCandidates: number,
): CohortVerdict {
  if (!declaration.causeTitleAvailable) return 'INSUFFICIENT_TO_PROVE_UNIQUE';
  if (declaration.connector === null) return 'UNIQUE_NOT_REFUTED';
  return declaration.declaredMatters > heldCandidates ? 'COHORT_INCOMPLETE' : 'UNIQUE_NOT_REFUTED';
}

/**
 * THE GATE. Does the court's own cause title declare more matters than we hold?
 *
 * `heldCandidates` is the resolver's count of judgments in OUR corpus claiming
 * the key — never a claim about the world. A cohort of three with two landed is
 * still incomplete, so the comparison is `>` and not `!== 1`.
 *
 * Returns false, always, when no connector was printed. A cause title that names
 * two matters without joining them is far more often a judgment reciting the
 * order below it than a common order, and refusing on that shape was measured to
 * cost 5.6x the false refusals for 3 more positives.
 */
export function cohortBlocksUnique(
  declaration: CohortDeclaration,
  heldCandidates: number,
): boolean {
  return cohortVerdict(declaration, heldCandidates) !== 'UNIQUE_NOT_REFUTED';
}
