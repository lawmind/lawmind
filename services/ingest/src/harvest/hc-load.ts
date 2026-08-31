/**
 * High Court metadata row + extracted PDF text → a `JudgmentRecord`.
 *
 * **The mapping is the risky half of the ingest, so it lives here as pure
 * functions with no network and no database.** Streaming 15.77M PDFs is already
 * solved and proven — `hc-citations-cli.ts` does it at 41 documents/second. What
 * has never been done is deciding what a row MEANS, and every extractor in this
 * repository was written against sampled text and had a bug the samples exposed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY FIELD NAME BELOW WAS READ OUT OF THE BUCKET, NOT RECALLED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sampled 11 Aug 2026 from `year=2024/court=10_8/bench=patnahcucisdb94`:
 *
 *   title              CR. MISC./83783/2023 of LAXMI KUMAR DAS @ LAXMI DAS Vs THE STATE OF BIHAR
 *   judge              MR. JUSTICE PRABHAT KUMAR SINGH
 *   decision_date      Fri May 03 2024 04:00:00 GMT+0400 (Gulf Standard Time)
 *   court              Patna High Court
 *   cnr                BRHC011164592023
 *   disposal_nature    DISMISS FOR NON-PROSECUTION
 *   pdf_exists         false        ← and the PDF may still return 200
 *
 * The **mobile** variant carries all of those plus `case_type`, `case_no`,
 * `petitioner`, `respondent`, `order_type`, `is_final`. **The two variants share
 * ZERO CNRs**, so a document present in one is not present in the other, and this
 * module must read only fields common to both.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WORD THIS MODULE MAY NEVER WRITE IS "JUDGMENT"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The measured judgment share of this corpus is **0.75%–18.64%** — most rows are
 * orders. `disposal_nature` above is *"DISMISS FOR NON-PROSECUTION"*, which is a
 * procedural disposal and not a reasoned judgment. We ingest them as
 * **documents** and the coverage surface says so.
 */
import type { JudgmentRecord } from '../sci.ts';

/**
 * The columns present in BOTH metadata variants, plus one that is not:
 * `order_type` exists only on the mobile variant (4 of 25 courts,
 * `docs/HC_CORPUS_SURVEY.md` §2) and is optional for exactly that reason —
 * the plain-variant loader never sets it, and its absence must not be
 * mistaken for the source stating "no type".
 */
export type HcMetadataRow = {
  title?: string | null;
  judge?: string | null;
  decision_date?: string | Date | null;
  court?: string | null;
  cnr?: string | null;
  pdf_link?: string | null;
  disposal_nature?: string | null;
  /** Mobile variant only. Stored verbatim — never classified, never guessed. */
  order_type?: string | null;
};

export type HcPartitions = { year: number; courtCode: string; bench: string };

/** Why a row was not turned into a record. Counted, never silently dropped. */
export type SkipReason =
  | 'test_fixture_bench'
  | 'no_pdf_link'
  | 'no_decision_date'
  | 'unparseable_date'
  | 'no_text'
  | 'no_title';

export type MapOutcome = { ok: true; record: JudgmentRecord } | { ok: false; reason: SkipReason };

/**
 * `bench=testcase` publishes ~16,000 rows a year at Bombay and is a **test
 * fixture**, found during the corpus survey. Ingesting it would put synthetic
 * cases in front of advocates.
 */
export function isTestFixture(partitions: { bench: string }): boolean {
  return partitions.bench.toLowerCase().includes('testcase');
}

/**
 * `decision_date` arrives as a JS `Date`'s string form —
 * `Fri May 03 2024 04:00:00 GMT+0400 (Gulf Standard Time)`.
 *
 * **The offset is the writer machine's, not the court's**, and the underlying
 * instant is midnight UTC. So the date is taken in **UTC** and never in local
 * time: `toLocaleDateString` on a machine west of Greenwich would silently
 * report the previous day, and a judgment dated one day early is wrong in a
 * limitation calculation.
 */
export function toIsoDate(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  // The bucket covers 1950 onward; anything outside is corrupt metadata rather
  // than an old case, and a year-0001 row would sort to the top of every list.
  const year = Number(iso.slice(0, 4));
  if (year < 1900 || year > 2100) return null;
  return iso;
}

/**
 * `title` is `<CASE NUMBER> of <PARTIES>` —
 * `CR. MISC./83783/2023 of LAXMI KUMAR DAS @ LAXMI DAS Vs THE STATE OF BIHAR`.
 *
 * **Split on the first LOWERCASE ` of `.** Party names are upper-case in this
 * corpus and routinely contain ` OF ` — *THE STATE OF BIHAR* — so a
 * case-insensitive split would cut the title in half at the wrong place and
 * produce a case number of `CR. MISC./83783/2023 of LAXMI KUMAR DAS @ LAXMI DAS
 * Vs THE STATE`.
 *
 * When the pattern is absent the WHOLE title becomes the case title and the
 * number is null. A wrong case number is worse than a missing one.
 */
export function splitTitle(title: string): { caseTitle: string; caseNumber: string | null } {
  const t = title.replace(/\s+/g, ' ').trim();
  const at = t.indexOf(' of ');
  if (at <= 0) return { caseTitle: t, caseNumber: null };
  const caseNumber = t.slice(0, at).trim();
  const caseTitle = t.slice(at + 4).trim();
  if (caseTitle === '' || caseNumber === '') return { caseTitle: t, caseNumber: null };
  return { caseTitle, caseNumber };
}

/**
 * Criminal or civil, **from the case-number prefix only**, matching the rule
 * `JudgmentRecord.caseType` already states for the Supreme Court ingest.
 *
 * Deliberately small and deliberately incomplete. Indian High Courts use
 * hundreds of case-type abbreviations and **guessing one wrong mislabels a
 * matter**; `null` renders as no side claimed, which is honest.
 */
export function caseTypeFrom(caseNumber: string | null): 'criminal' | 'civil' | null {
  if (!caseNumber) return null;
  // The prefix is the token before the first `/`, reduced to letters. The corpus
  // writes it with dots and spaces — `CR. MISC./83783/2023`, `L.P.A/1614/2018` —
  // which the first version of this function did not survive. Found by reading
  // five mapped records in the dry run, not by a test: the tests passed because
  // they were written from the same assumption as the code.
  const prefix = (caseNumber.split('/')[0] ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (prefix === '') return null;

  // Whole-prefix equality, deliberately. `CRP` is a **Civil** Revision Petition
  // and `CRMISC` is Criminal Miscellaneous, so a `startsWith('CR')` rule labels
  // civil revisions as criminal. Mislabelling a matter is worse than claiming
  // no side, and null renders as no side claimed.
  const CRIMINAL = new Set([
    'CRMISC', // CR. MISC.  — observed, Patna 2024
    'CRWJC', // CR. WJC    — observed, Patna 2024
    'CRLA',
    'CRLMC',
    'CRLREV',
    'CRLP',
    'CRIMINAL',
    'CRLREF',
  ]);
  const CIVIL = new Set([
    'CWJC', // Civil Writ Jurisdiction Case — observed, Patna 2024
    'LPA', // L.P.A — Letters Patent Appeal — observed, Patna 2024
    'CIVIL',
    'CRP', // Civil Revision Petition — note it begins CR and is NOT criminal
    'CMA',
    'RSA',
    'FA',
    'SA',
    'CS',
  ]);

  if (CRIMINAL.has(prefix)) return 'criminal';
  if (CIVIL.has(prefix)) return 'civil';

  /**
   * Classification rate fell from 86% to 46% the moment six more courts
   * joined the ingest (12 Aug 2026) — a real signal, not noise, sampled
   * rather than guessed at: Rajasthan/Karnataka print dozens of case-number
   * shapes the exact-match set above never saw (`CRLMB`, `CRLMP`, `CRLW`,
   * `CRLRP`, …). Read eleven real records across both courts before adding
   * this: every one prints "Criminal Miscellaneous Bail Application",
   * "Criminal Writ Petition" or equivalent in its own header.
   *
   * A SUBSTRING rule, not another exact entry, because whack-a-moling every
   * new court's own `CRL`-compound is the same fix repeated forever. Safe
   * specifically because it is `CRL` (three letters) and not `CR`
   * (two) — the exact trap the comment above this function already names:
   * `CRP` (Civil Revision Petition) begins `CR` but does not contain `CRL`,
   * so it still falls through to the exact-match `CIVIL` set above,
   * unaffected. No entry in either set above contains `CRL`.
   */
  if (prefix.includes('CRL')) return 'criminal';

  // Indian High Courts use hundreds of abbreviations and they are not
  // consistent between courts. `WP` alone is a writ petition that may be either.
  // Everything unrecognised stays null on purpose.
  return null;
}

/**
 * High Court neutral citation, printed IN the judgment from 2023 —
 * `2023:DHC:2720`, `2023:KHC-D:1`, `2023:DHC:2073-DB`.
 *
 * **This is the whole reason 2023+ documents are citable at all.** Neither
 * metadata variant has a citation column, so before 2023 a High Court document
 * is searchable and not citable, and that is stated rather than papered over.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS USED TO BE "THE FIRST MATCH IN 3,000 CHARACTERS", AND THAT WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The old comment here stated the assumption plainly: *"The document's own
 * appears in the header, so the first occurrence within the opening window is
 * the safe one."* Measured against 550 frozen documents
 * (`docs/ai/new2-r17/eval-population.json`), that rule produced **133 false own
 * citations** — a document filed under a number that belongs to a different
 * judgment. Two mechanisms, both measured, neither guessed:
 *
 *  1. **A short order prints no citation of its own and mentions the judgment it
 *     follows.** All 109 defect rows behind NEW2 R16's 30 keys are this: in
 *     every one the document prints NO citation of its own anywhere in its text,
 *     and 106 of the 109 carry a citing phrase immediately before the citation
 *     that was taken (`…covered under the judgement dated 09.10.2023 passed by
 *     this Court in Writ A No. 7699 of 2023: Neutral Citation No.- <citation>`).
 *     The window was never the cause: only 1 of the 109 sat inside 250
 *     characters, so the exposure was the window and the DEFECT was the missing
 *     test of whose citation it is.
 *  2. **One PDF, several connected matters, one masthead each.**
 *     `WPS/5687/2025` (Chhattisgarh) is four writ petitions in one document,
 *     each with its own cause title and its own citation; taking the first filed
 *     this row under WPS 5593's number.
 *
 * Shrinking the window was measured too, as its own arm, because it is the fix
 * that looks free: it removes 121 of the 133 false owns and **loses 51 of 203
 * true ones**, because Bombay, Rajasthan and Karnataka do not print the citation
 * in the masthead at all — they stamp it in the page furniture beside the
 * judge's signature, 500 to 800 characters in.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every occurrence in the document is classified by the NEAREST structural
 * signal to it, and the answer is taken in three tiers. Two survivors at any
 * tier answer NULL: a missing citation is a recoverable gap, a wrong one is a
 * document filed under another matter's number, and those are not the same size
 * of mistake.
 *
 * Scored on the frozen population: 199 true own citations against **0 false
 * own** and 2 missed, where the shipping rule scored 195 true against 133 false.
 * Full method and per-stratum results: `docs/ai/new2-r17/arms-scored.json`.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * NEW2 R18. THE WORD BOUNDARY MOVED OFF THE SUFFIX AND ONTO THE NUMBER
 * ────────────────────────────────────────────────────────────────────────────────
 *
 * It used to read `(?:-(?:DB|FB))?\b`. On `2023:AHC:111864-DBNeutral Citation`
 * the `B|N` pair is not a word boundary, so the `-DB` alternative FAILS, the
 * optional group matches EMPTY, and the `\b` then succeeds against the hyphen
 * after `111864`. The regex never errors — it silently returns a DIFFERENT
 * citation key, and where the page also prints the citation cleanly the same
 * document yields TWO distinct strings and this function then refuses both.
 *
 * Measured exhaustively over every neutral-citation occurrence in every High
 * Court document carrying a stored citation (`docs/ai/new2-r18/db-suffix-defect.json`):
 * the glued shape is rare and the fix is bounded to it. Not one negative control
 * moves — `-SB`, `-Crl.A.`, the hyphenated COURT token `KHC-D`, an over-long
 * number — and no observed glue tail could be a longer real suffix.
 *
 * FUTURE EXTRACTION ONLY. No existing row is rewritten by this change; the rows
 * it would have read differently are candidates in `NEW2-R18-EXISTING`.
 */
const NEUTRAL_G = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g;
const CNR_G = /\b([A-Z]{2}HC[0-9]{12,14})\b/g;
/**
 * `No. - 859 of 2023`, `859 of 2023`, `18552/2025`, `CWP-15861-2015` — a matter,
 * printed.
 *
 * The two lookbehinds are a DATE guard and they are not cosmetic. Without them
 * `Judgment Reserved on : 09/12/2024` reads as matter 12 of 2024, and that one
 * false match made `FA/69/2022` (Chhattisgarh) disown its own masthead citation:
 * the date sat 69 characters after it and the row's real number 50 characters
 * further on, so the date won on proximity.
 */
const CASE_PAIR_G = /(?<!\d[/.\-])(?<!\d)(\d{1,6})\s*(?:of|\/|-)\s*((?:19|20)\d{2})\b/g;
/** Language that introduces somebody else's judgment. */
const CITING_LEAD_G =
  /(in the case of|reported in|as held in|rel(?:ied|ying) (?:up)?on|reliance (?:up)?on|covered (?:by|under)|by this Court in|passed by this Court|decided by this Court|Cases?\s+Referred|following [a-z ]{0,12}judge?ments?|judge?ments? of this Court|judge?ment dated|order dated|\bv\.\s|\bvs\.?\s|\bversus\b|\bSCC\b|\bSupreme Court\b)/gi;

/** Where the masthead ends. Observed: mastheads sit at 0-160, the first cited
 *  occurrence at 387. The threshold sits in the gap, not on either edge. */
const MASTHEAD_MAX = 250;
/** How far either side of a citation counts as "beside" it. */
const CONTEXT = 200;
/**
 * How close a bare case number must be to DISOWN a citation.
 *
 * A citing phrase disowns from anywhere in the context window; a bare number
 * does not, because a page stamp lands wherever the page broke and lands after
 * whatever the sentence was saying. Measured on a blind draw of 59,434 documents:
 * letting a bare number disown from the full 200 characters withdrew 144 of
 * Bombay's 603 citations — `2. The applicant seeks bail in Crime No.94 of 2024,
 * registered with Waluj Police Station, District Aurangabad, for
 * 2024:BHC-AUG:21337` — where the number is an FIR and the citation is the page
 * stamp. Adjacency keeps the case it was there for: `CWP-15861-2015 (O&M)
 * 2023:PHHC:094498 Page 2 of 3`, another order's footer bled into this document.
 */
const ADJACENT = 40;
/** A citation printed this many times is page furniture, not an authority.
 *  Measured: across the 109 defect rows the wrongly-taken citation appears once
 *  in 103 and twice in 6. Never three times. */
const FURNITURE_REPEATS = 3;

/** The row's own case number reduced to [serial, year]. `WRIT-A/7699/2023` -> ['7699','2023']. */
export function ownCaseNumberPair(caseNumber: string | null | undefined): [string, string] | null {
  if (!caseNumber) return null;
  const nums = String(caseNumber)
    .split('/')
    .filter((p) => /^[0-9]+$/.test(p));
  if (nums.length < 2) return null;
  return [nums[nums.length - 2]!, nums[nums.length - 1]!];
}
const samePair = (a: [string, string], b: [string, string]): boolean =>
  String(Number(a[0])) === String(Number(b[0])) && a[1] === b[1];

function lastIndexMatching(s: string, re: RegExp, keep: (m: RegExpExecArray) => boolean): number {
  const g = new RegExp(re.source, re.flags);
  let last = -1;
  for (let m = g.exec(s); m; m = g.exec(s)) if (keep(m)) last = m.index;
  return last;
}
function firstIndexMatching(s: string, re: RegExp, keep: (m: RegExpExecArray) => boolean): number {
  const g = new RegExp(re.source, re.flags);
  for (let m = g.exec(s); m; m = g.exec(s)) if (keep(m)) return m.index;
  return -1;
}

/** What the row itself claims to be, from the AWS metadata record — never from
 *  the document text, which is the thing being judged. */
export type DocumentIdentity = {
  caseNumber?: string | null | undefined;
  cnr?: string | null | undefined;
};

export type OccurrenceVerdict = 'OWN_ID' | 'OWN_POS' | 'FOREIGN_LEAD' | 'FOREIGN_PAIR' | 'FOREIGN_AFTER' | 'UNMARKED';

/**
 * A citation is introduced by whatever stands CLOSEST to it, not by whatever
 * stands somewhere near it. Karnataka stamps `NC: 2026:KHC:19999 RSA No. 1703 of
 * 2023` on all 28 pages, so the row's own case number is within 350 characters
 * of an authority quoted 13,728 characters in; only the nearest signal separates
 * them.
 *
 * FOREIGN is split by SIDE and by KIND because the three disown a citation with
 * very different force:
 *  - `FOREIGN_LEAD`  a citing phrase, or another matter's CNR, introduces it.
 *  - `FOREIGN_PAIR`  a bare case number sits before it. Weaker: a page stamp
 *                    lands wherever the page broke, so unrelated prose numbers
 *                    end up in front of it.
 *  - `FOREIGN_AFTER` a different matter's cause title FOLLOWS it. Weaker still:
 *                    that is the signature of a common order whose masthead
 *                    names the LEAD matter of a connected group, and this row is
 *                    one of the members.
 */
export function classifyOccurrence(
  text: string,
  at: number,
  citation: string,
  own: [string, string] | null,
  ownCnr: string | null,
): OccurrenceVerdict {
  const before = text.slice(Math.max(0, at - CONTEXT), at);
  const after = text.slice(at + citation.length, at + citation.length + CONTEXT);

  /**
   * A signal we cannot EVALUATE is not evidence. Where the metadata record gives
   * no case number, a printed case number says nothing about whose citation this
   * is — it is neither the row's nor provably another's — so the comparison is
   * skipped rather than resolved against the document. Same for the CNR. Only
   * the citing phrase works without identity, and it alone accounts for 106 of
   * the 109 measured defects.
   */
  const ownPairBefore = own === null ? -1 : lastIndexMatching(before, CASE_PAIR_G, (m) => samePair([m[1]!, m[2]!], own));
  const ownCnrBefore = ownCnr === null ? -1 : before.lastIndexOf(ownCnr);
  const foreignPairBefore =
    own === null
      ? -1
      : lastIndexMatching(
          before,
          CASE_PAIR_G,
          (m) => !samePair([m[1]!, m[2]!], own) && before.length - (m.index + m[0]!.length) <= ADJACENT,
        );
  const foreignCnrBefore = ownCnr === null ? -1 : lastIndexMatching(before, CNR_G, (m) => m[1] !== ownCnr);
  const leadBefore = lastIndexMatching(before, CITING_LEAD_G, () => true);

  const ownBefore = Math.max(ownPairBefore, ownCnrBefore);
  const notOwnBefore = Math.max(foreignPairBefore, foreignCnrBefore, leadBefore);
  if (ownBefore >= 0 || notOwnBefore >= 0) {
    if (ownBefore > notOwnBefore) return 'OWN_ID';
    return Math.max(leadBefore, foreignCnrBefore) > foreignPairBefore ? 'FOREIGN_LEAD' : 'FOREIGN_PAIR';
  }

  // Nothing introduced it, so the cause title it heads decides — and on this
  // side the FIRST signal is the nearest one.
  const ownPairAfter = own === null ? -1 : firstIndexMatching(after, CASE_PAIR_G, (m) => samePair([m[1]!, m[2]!], own));
  const ownCnrAfter = ownCnr === null ? -1 : after.indexOf(ownCnr);
  const foreignPairAfter =
    own === null ? -1 : firstIndexMatching(after, CASE_PAIR_G, (m) => !samePair([m[1]!, m[2]!], own));
  const foreignCnrAfter = ownCnr === null ? -1 : firstIndexMatching(after, CNR_G, (m) => m[1] !== ownCnr);
  const nearer = (a: number, b: number): number => (a < 0 ? b : b < 0 ? a : Math.min(a, b));
  const ownAfter = nearer(ownPairAfter, ownCnrAfter);
  const notOwnAfter = nearer(foreignPairAfter, foreignCnrAfter);
  if (ownAfter >= 0 || notOwnAfter >= 0)
    return ownAfter >= 0 && (notOwnAfter < 0 || ownAfter < notOwnAfter) ? 'OWN_ID' : 'FOREIGN_AFTER';

  return at <= MASTHEAD_MAX ? 'OWN_POS' : 'UNMARKED';
}

export function neutralCitationFrom(text: string, year: number, identity?: DocumentIdentity): string | null {
  const own = ownCaseNumberPair(identity?.caseNumber);
  const ownCnr = identity?.cnr?.trim() || null;

  type Tally = { id: number; pos: number; lead: number; pair: number; foreignAfter: number; count: number };
  const by = new Map<string, Tally>();
  const scan = new RegExp(NEUTRAL_G.source, NEUTRAL_G.flags);
  for (let m = scan.exec(text); m; m = scan.exec(text)) {
    // The year in the citation must be the document's own year, or the year
    // before it — a judgment delivered in January can carry the prior year's
    // series. Anything else is an authority it cited, not its own citation.
    const cited = Number(m[1]);
    if (cited !== year && cited !== year - 1) continue;

    const v = classifyOccurrence(text, m.index, m[0], own, ownCnr);
    const e = by.get(m[0]) ?? { id: 0, pos: 0, lead: 0, pair: 0, foreignAfter: 0, count: 0 };
    e.count++;
    if (v === 'OWN_ID') e.id++;
    else if (v === 'OWN_POS') e.pos++;
    else if (v === 'FOREIGN_LEAD') e.lead++;
    else if (v === 'FOREIGN_PAIR') e.pair++;
    else if (v === 'FOREIGN_AFTER') e.foreignAfter++;
    by.set(m[0], e);
  }

  const only = (cs: string[]): string | null => (cs.length === 1 ? cs[0]! : null);

  // 1. The row's own cause title anchors it. Beats everything.
  const anchored = [...by].filter(([, e]) => e.id > 0).map(([c]) => c);
  if (anchored.length > 0) return only(anchored);

  // 2. It opens the document with nothing either side of it.
  const heading = [...by].filter(([, e]) => e.pos > 0).map(([c]) => c);
  if (heading.length > 0) return only(heading);

  // 3. The page stamp. Never introduced as somebody else's — and a bare foreign
  //    case number before it is forgiven only when the citation RECURS, because
  //    a stamp is printed on every page while a footer inherited from a
  //    different order (`CWP/1220/2024`, Punjab & Haryana) is printed once.
  const furniture = [...by].filter(([, e]) => e.count >= FURNITURE_REPEATS || (e.lead === 0 && e.pair === 0));
  if (furniture.length === 1) return furniture[0]![0];
  return only(furniture.filter(([, e]) => e.foreignAfter === 0).map(([c]) => c));
}

/**
 * The mapping. Returns a skip reason rather than a partial record — a row that
 * cannot be mapped completely is counted and reported, never written with holes.
 */
export function toJudgmentRecord(
  row: HcMetadataRow,
  partitions: HcPartitions,
  text: string,
  sourceUrl: string,
  nativeText?: boolean | null,
  textExtractionMethod?: string | null,
): MapOutcome {
  if (isTestFixture(partitions)) return { ok: false, reason: 'test_fixture_bench' };
  if (!row.pdf_link) return { ok: false, reason: 'no_pdf_link' };

  const title = row.title?.trim();
  if (!title) return { ok: false, reason: 'no_title' };

  if (row.decision_date === null || row.decision_date === undefined) {
    return { ok: false, reason: 'no_decision_date' };
  }
  const judgmentDate = toIsoDate(row.decision_date);
  // A document with no usable date cannot be ordered, cannot be shown "as at",
  // and cannot answer "was this good law when I filed". Skipped, not nulled.
  if (!judgmentDate) return { ok: false, reason: 'unparseable_date' };

  if (text.trim().length === 0) return { ok: false, reason: 'no_text' };

  const { caseTitle, caseNumber } = splitTitle(title);

  return {
    ok: true,
    record: {
      caseTitle,
      // NEVER synthesised. Present from 2023 where the court printed one.
      // The identity is passed IN. Whose citation this is cannot be decided from
      // the text alone — the row's own case number and CNR come from the AWS
      // metadata record, and they are what separates this document's masthead
      // from the masthead of the connected matter printed beside it.
      neutralCitation: neutralCitationFrom(text, partitions.year, {
        caseNumber,
        cnr: row.cnr,
      }),
      // The bucket has no citation column. An invented reporter citation is the
      // exact failure this product exists to prevent.
      reporterCitations: [],
      court: row.court?.trim() || partitions.courtCode,
      /**
       * **NULL, and this line used to say `partitions.bench`.**
       *
       * `partitions.bench` is the S3 partition key — `bench=patnahcucisdb94` —
       * which identifies the court ESTABLISHMENT that published the file.
       * `judgments.bench` means the JUDGES WHO SAT; the API sends it and the
       * judgment screen renders it as the coram. The word is the same in both
       * places and means two different things, which is why this looked correct
       * at every step and shipped 40,705 rows reading `patnahcucisdb94` where
       * the judges belong (measured 11 Aug 2026, 51.3% of the whole corpus;
       * zero of them had a matching `judgment_judges` row, so it was never a
       * badly-formatted judge list — it was not a judge list).
       *
       * This variant publishes no judge field at all, so NULL is the honest
       * value. The partition is kept below as what it actually is.
       */
      bench: null,
      sourceBenchCode: partitions.bench,
      judgmentDate,
      fullText: text,
      language: 'en',
      sourceUrl,
      sourceId: 'aws_hc',
      sourceEdition: 'court_raw',
      authorizationBasis: 'aws_open_data',
      caseNumber,
      caseType: caseTypeFrom(caseNumber),
      sourceDocumentType: row.order_type?.trim() || null,
      cnr: row.cnr?.trim() || null,
      nativeText: nativeText ?? null,
      // No petitioner/respondent field on the plain variant (the only one
      // actually held) — undefined, so load.ts falls back to title parsing.
      disposalNature: row.disposal_nature?.trim() || null,
      textExtractionMethod: textExtractionMethod ?? null,
    },
  };
}
