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

export type MapOutcome =
  | { ok: true; record: JudgmentRecord }
  | { ok: false; reason: SkipReason };

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
 * Only the FIRST match is taken and only when it is the citing document's own —
 * a judgment also prints the neutral citations of authorities it relies on, and
 * taking one of those would file the document under another court's citation.
 * The document's own appears in the header, so the first occurrence within the
 * opening window is the safe one.
 */
const NEUTRAL = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/;
const HEADER_WINDOW = 3000;

export function neutralCitationFrom(text: string, year: number): string | null {
  const m = NEUTRAL.exec(text.slice(0, HEADER_WINDOW));
  if (!m) return null;
  // The year in the citation must be the document's own year, or the year
  // before it — a judgment delivered in January can carry the prior year's
  // series. Anything else is an authority it cited, not its own citation.
  const cited = Number(m[1]);
  if (cited !== year && cited !== year - 1) return null;
  return m[0];
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
      neutralCitation: neutralCitationFrom(text, partitions.year),
      // The bucket has no citation column. An invented reporter citation is the
      // exact failure this product exists to prevent.
      reporterCitations: [],
      court: row.court?.trim() || partitions.courtCode,
      bench: partitions.bench,
      judgmentDate,
      fullText: text,
      language: 'en',
      sourceUrl,
      caseNumber,
      caseType: caseTypeFrom(caseNumber),
      sourceDocumentType: row.order_type?.trim() || null,
    },
  };
}
