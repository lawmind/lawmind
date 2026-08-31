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
 * NEW2-R15-F1 — THE FIRST CUT READ CAPITAL LETTERS, NOT MATTER NUMBERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The version shipped at `bd2aa74a` captured the matter TYPE as `[A-Z][A-Z.&'-]*`
 * while matching connectors case-insensitively, and NEW2 retested it on its own
 * population (bus 1637, `docs/ai/new2-r15/`): the gate was reached on all 472
 * would-be-`UNIQUE` rows and refused none, because all 472 declared ZERO matters
 * — not the one an ordinary judgment prints. A common order printed in title
 * case gave `connector = WITH` and `declaredMatters = 0`, so
 * `declaredMatters > heldCandidates` was `0 > 1`, false, and the reference was
 * told it was the only one. **It failed OPEN on the exact shape it exists to
 * refuse**, and every test then in the file was green because every matter their
 * assertions depended on happened to be upper case.
 *
 * The obvious repair is to drop the case-sensitivity. That was measured and it
 * is NOT what shipped, because case-sensitivity had been doing a second job by
 * accident: Indian judgment PROSE is title case, so `[A-Z]`-only matching was
 * suppressing the FIR, the sessions trial and the mid-sentence recital as a side
 * effect of suppressing half the real cause titles. Censused over 1,358
 * key-bearing judgments (`docs/ai/lcc-r15f1/matter-form-census.json`), ignoring
 * case alone adds 552 matches of which the largest single group is
 * `arising out of Case Crime No.60 of 2019` — a police number in a sentence.
 *
 * So the rule is structural instead. A matter DECLARATION opens a line, or opens
 * the text immediately after a conjunction the court printed; a case number
 * recited mid-sentence is a reference, not a sibling. Scored side by side on
 * NEW2's holdout (`docs/ai/lcc-r15f1/grammar-sweep.json`, T0 2026-08-18, 180
 * reachable positives and 2,295 controls):
 *
 *   grammar                                  recall         false refusals
 *   upper-case only, unanchored (bd2aa74a)   97/180  53.9%  34/2,295 1.48%
 *   case-insensitive, unanchored             98/180  54.4%  42/2,295 1.83%
 *   case-insensitive, anchored               98/180  54.4%  35/2,295 1.53%
 *   + the registry type forms  <- shipped   101/180  56.1%  39/2,295 1.70%
 *
 * Anchoring buys back three quarters of what ignoring case costs, and it loses
 * nothing the shipped grammar caught. The last row is {@link TYPE_WORD} and
 * {@link NOT_A_MATTER}: three named Allahabad forms, each with a judgment id
 * beside it, not a threshold moved until a number improved. It trades four more
 * true refusals for five more recall-cost ones, which is taken because a refusal
 * still returns the authority and a wrong pin does not.
 *
 * The number that actually moves is none of those: cause titles the parser can
 * READ AT ALL went from 54.3% to 77.2% of the same 2,295. The gate was blind on
 * nearly half the corpus and answering anyway.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT IS WORTH, MEASURED ON AN INSTRUMENT THAT READS NO RESOLVER OUTPUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC re-derived NEW2's holdout independently and got the same 226 keys, twice —
 * once for `bd2aa74a` and again for this correction, on the same T0 and the same
 * 2,295 controls, so the two rows above are one comparison and not two rounds.
 *
 *   101 of the 180 reachable false uniques  (56.1%)  no longer claim UNIQUE
 *    39 of 2,295 keys that stayed single    (1.70%)  lose the word "only"
 *
 * The 1.70% is a recall cost and NOT a wrong answer: in each of those the court
 * did print a conjunction and a sibling we do not hold. Hand-read, the
 * commonest reason a refusal was not worth making is a lower-court or FIR
 * number joined by a conjunction — `CRIMINAL APPEAL No. 123 of 2013 ...
 * connected with S.T. No. 751 of 2009` is one proceeding, not two. Separating
 * those needs a list of which registry types are High Court matters, and a list
 * that scores well on the documents it was written from is not evidence.
 *
 * **The 79 that remain were re-derived, not carried forward.** The previous
 * round put 83 misses down to a data-contract gap while using a parser that
 * could not read half the cause titles, which is a conclusion drawn from an
 * instrument that was broken in the same direction. Re-run against this parser
 * (`docs/ai/lcc-r15f1/residue.json`), asking of every miss whether the SIBLING's
 * own case number appears anywhere in the bearer's cause title:
 *
 *   78  the court printed no conjunction AND the sibling is not named  UNREACHABLE
 *    0  the sibling is named but no conjunction joins it
 *    1  a conjunction and a named sibling the parser still misses      PARSER GAP
 *
 * So the earlier conclusion SURVIVES on better evidence, and is now stronger
 * than it was: those 78 are not merely un-fired, they carry no trace of the
 * sibling at all. The court issued SEPARATE orders under one neutral citation
 * and each declares only its own matter. No amount of reading judgment A reveals
 * judgment B. That residue is handed back rather than papered over.
 *
 * The single parser gap is a line-wrapped year — Allahabad's
 * `BAIL APPLICATION No. - 47257 of` / `2021` puts the year on the next line, and
 * segments are split on lines. Left alone deliberately: un-wrapping lines before
 * parsing would let a declaration form across a boundary the court did not draw,
 * which is a larger change to what counts as a cause title than one positive in
 * 180 justifies.
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
 *
 * The sweep above is the UPPER-CASE grammar's. The window was not re-swept for
 * the R15-F1 correction and the two are not interchangeable: 800 is carried
 * forward as the shipped value, not re-derived, and that is a caveat rather than
 * a result.
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
 * `C/W` is Karnataka's, `A/W` Bombay's and Himachal's, `With` Jharkhand's and
 * Allahabad's. Matched case-insensitively and on a word boundary so `WITHOUT`
 * and the `with` inside a sentence cannot fire it.
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
 * The same conjunctions as ONE splitter.
 *
 * A sibling is not always on its own line. Karnataka prints
 * `MFA NO.100456/2021 C/W MFA NO.100457/2021` on one, so the second matter opens
 * no line — it opens the text immediately after the conjunction, which is the
 * other structural position a declaration can occupy. Splitting here is what
 * makes {@link declaredCohort} see it without letting the parser wander into the
 * middle of a sentence.
 */
const CONNECTOR_SPLIT =
  /\bC\s*\/\s*W\b|\bA\s*\/\s*W\b|\bconnected\s+with\b|\balong\s*with\b|\bwith\b/gi;

/**
 * A word inside a matter type.
 *
 * Letters, a slash, a short digit group, or a standalone dash. None of these is
 * decoration — each one is a registry form that silently cost a declaration:
 *
 *   `Case :- WRIT - C No. - 19783 of 2022`              a standalone dash
 *   `Case :- MATTERS UNDER ARTICLE 227 No. - 541 of 2024`   a digit group
 *   `Case :- APPLICATION U/S 482 No. - 391 of 2024`     a slash AND a digit
 *
 * Without them the capture stops at `WRIT`, at `MATTERS UNDER`, at `APPLICATION`
 * — and since the pattern then requires `No.` immediately, the whole declaration
 * is lost rather than shortened. Three of the four remaining reachable misses on
 * NEW2's holdout were this and nothing else (`docs/ai/lcc-r15f1/residue.json`).
 *
 * The digit group is bounded at four and can never START a type, so a bare
 * number in the text cannot become a matter on its own.
 */
const TYPE_WORD = "(?:[A-Za-z][A-Za-z.&'/-]*|\\d{1,4}|[-–—])";

/**
 * `M.A. No. 134 of 2018`, `MFA No.100456 OF 2021`, `WRIT TAX No. - 859 of 2023`,
 * `S.B. Criminal Miscellaneous Bail Application No. 848/2025`.
 *
 * The registry prints a matter type, a serial and a year, and it prints them in
 * exactly two layouts. This is the long one. The type is bounded at five words
 * so a runaway match cannot swallow a paragraph, and the year is anchored to
 * four digits beginning 19 or 20 so `of 12` in prose cannot form a matter.
 *
 * **Anchored at `^`** — see {@link segmentsOf}. The bound and the anchor are
 * doing different jobs: the anchor says WHERE a declaration may begin, the bound
 * says how much of it may be type.
 */
const MATTER_LONG = new RegExp(
  `^([A-Za-z][A-Za-z.&'-]*(?:[ \\t]+${TYPE_WORD}){0,4})` +
    `[ \\t]*(?:Nos?\\.?)[ \\t]*[-.:]?[ \\t]*(\\d{1,7})[ \\t]*(?:of|\\/)[ \\t]*((?:19|20)\\d{2})\\b`,
  'i',
);

/** `MA/134/2018`, `APPLN/3717/2023`. The slash layout, same anchor. */
const MATTER_SLASH = /^([A-Za-z][A-Za-z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/i;

/**
 * Bounded noise a registry prints before the type, stripped so the anchor still
 * lands: a serial or bullet (`1 M.A. No. 134 of 2018`,
 * `62 CONT. PETITION NO. 268 OF 2018`, `1.Review Petition No. 48 of 2024`), an
 * opening bracket (the Supreme Court's `(Civil Appeal No. 2047 of 2007)`).
 *
 * It strips a PREFIX. It never searches for a matter, which is the difference
 * between this and the unbounded "find any number" the round forbade.
 */
const LEAD = /^[\s(\[*\-–—.:;,#•]*(?:\d{1,4}\s*[.)\]]?[ \t]*)?[\s(\[*\-–—.:;,#•]*/;

/** Allahabad's cause-title label: `Case :- FIRST APPEAL FROM ORDER No. - 1202 of
 *  1999`. The colon is required, so `Case No.2570 of 2020` — where `Case` IS the
 *  matter type — is left alone. */
const LABEL = /^(?:case|matter|item)[ \t]*:[-–—\s]*/i;

/**
 * `CONT. PETITION NO. 268 OF 2018 / IN WP/5150/2013`.
 *
 * A matter introduced by `IN` is the proceeding this one arises FROM — the writ
 * below the contempt, the trial below the appeal. It is not a sibling disposed
 * of by the same order, and counting it as one refuses every appeal that names
 * the order it appeals. Same reasoning for `arising out of`.
 *
 * Tolerant of a line break, because Rajasthan prints the marker on a line of its
 * own: `D.B. Criminal Misc. ... Application No. 1840/2025` / `in` /
 * `D.B. Criminal Appeal No. 154/2025`.
 */
const PARENT_MATTER = /\b(?:IN|ARISING\s+(?:OUT\s+)?(?:OF|FROM)|FROM)[ \t\r\n]*$/i;

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
 *
 * The token is no longer the identity of a matter — {@link matterKey} is — but
 * it still decides whether a capture is a matter at all, via
 * {@link NOT_A_MATTER}, and it is reported so a disagreement is auditable.
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
 *
 * Tested against the WHOLE captured type, never against {@link typeToken}'s
 * last-two-word abbreviation. Allahabad's `MATTERS UNDER ARTICLE 227 No. - 541
 * of 2024` is a real matter type whose last two words are `ARTICLE 227`, and
 * testing the token threw the declaration away as legislation. Whether a phrase
 * is a statute reference is a property of the phrase; the two-word token exists
 * to collapse repeats of one matter, which is a different question.
 */
const NOT_A_MATTER =
  /^(SECTION|SECTIONS|ACT|ACTS|ARTICLE|ARTICLES|RULE|RULES|ORDER|ORDERS|CHAPTER|PART|SCHEDULE|CLAUSE|REGULATION|NOTIFICATION|AMENDMENT|ANNEXURE|PARA|PARAGRAPH|VOLUME|PAGE|EDITION|ITEM)$/;

export type DeclaredMatter = {
  /** The court's own text, byte for byte, so a disagreement is auditable. */
  readonly raw: string;
  /**
   * `134|2018` — serial and year, layout-independent AND spelling-independent.
   *
   * The registry prints ONE matter under two names in the same cause title:
   * `MFA No. 101864 of 2016` on one line and
   * `MISCELLANEOUS FIRST APPEAL NO. 101864 OF 2016` on another. Keying on the
   * type counted that as two matters and invented a cohort out of a duplicate —
   * which is visible in this gate's own first measurement, where two of the
   * recorded misses are exactly that pair.
   *
   * Every collapse this key makes was enumerated before it shipped
   * (`docs/ai/lcc-r15f1/key-collapse.json`): 623 events over 2,521 documents,
   * 25 distinct type pairs, and all 25 are an abbreviation beside its own
   * expansion — `WP + WRIT PETITION`, `CRL.P + CRIMINAL PETITION`,
   * `RSA + REGULAR SECOND APPEAL`. Not one pair is two different matters.
   *
   * The residual risk is stated rather than hidden: two genuinely different
   * matters sharing a serial AND a year in one cause title would collapse to
   * one, and the gate would under-refuse. None was found in 623 collapses.
   */
  readonly key: string;
  /** The matter type as the court spelled it, normalised. Reported for audit;
   *  never the identity of a matter. */
  readonly type: string;
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

function matterKey(type: string, serial: string, year: string): DeclaredMatter | null {
  const whole = type.toUpperCase().replace(/[^A-Z]/g, '');
  const t = typeToken(type);
  if (t.length === 0 || NOT_A_MATTER.test(whole)) return null;
  // Leading zeros are cosmetic: `C.O. No. 09 of 2022` and `C.O./9/2022` are one
  // matter, and counting them as two would invent a cohort out of a duplicate.
  const n = serial.replace(/^0+/, '') || '0';
  return { raw: '', key: `${n}|${year}`, type: t };
}

/**
 * The positions in a cause title where a matter may be DECLARED.
 *
 * One per line, plus one after every conjunction the court printed. Everything
 * else in the window — the body of a sentence — can only RECITE a case number,
 * and a recital is not a sibling. This is the whole of what replaced the
 * accidental prose filter that `[A-Z]`-only matching had been providing: it is a
 * statement about where courts print declarations, not about which letters they
 * capitalise, so a title-case registry and an upper-case one are read alike.
 *
 * Each segment carries the text that preceded it, because `IN` on a line of its
 * own is what makes the NEXT line a parent rather than a sibling.
 */
function segmentsOf(window: string): { readonly text: string; readonly before: string }[] {
  const out: { text: string; before: string }[] = [];
  let previous = '';
  for (const line of window.split(/\r?\n/)) {
    let last = 0;
    CONNECTOR_SPLIT.lastIndex = 0;
    for (let m = CONNECTOR_SPLIT.exec(line); m !== null; m = CONNECTOR_SPLIT.exec(line)) {
      const text = line.slice(last, m.index);
      out.push({ text, before: previous });
      previous = text;
      last = m.index + m[0].length;
    }
    const tail = line.slice(last);
    out.push({ text: tail, before: previous });
    previous = tail;
  }
  return out;
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
  for (const segment of segmentsOf(window)) {
    if (PARENT_MATTER.test(segment.before)) continue;
    const text = segment.text.replace(LEAD, '').replace(LABEL, '').replace(LEAD, '');
    for (const re of [MATTER_LONG, MATTER_SLASH]) {
      const m = re.exec(text);
      if (m === null) continue;
      if (PARENT_LEADING.test(m[1]!.trim())) continue;
      const matter = matterKey(m[1]!, m[2]!, m[3]!);
      if (matter === null || found.has(matter.key)) continue;
      found.set(matter.key, { ...matter, raw: m[0]!.trim() });
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
