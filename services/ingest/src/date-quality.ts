/**
 * NEW2 — P7. IS `judgments.judgment_date` THE DATE THE COURT DECIDED?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: 22 OF NEW3'S 250 GOLD EDGES ARE CHRONOLOGICALLY IMPOSSIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A citation edge where the cited judgment is dated AFTER the citing one cannot
 * be real. NEW3 found 22 of 250 hand-verified edges in that state and attributed
 * it to `judgment_date` defects rather than to bad extraction. This module is
 * the measurement of that attribution, and it lands almost exactly on their
 * number by an independent route — see `DATE_DISAGREE_RATE` below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PARTITION YEAR IS NOT A WITNESS, AND THAT IS THE FIRST FINDING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious check is `judgment_date`'s year against the S3 partition
 * (`.../year=2024/court=3_22/...`). Measured on 3,000 uniform draws it agrees
 * **3,000 out of 3,000**, and a check that never fails is not a passing check —
 * it is a check on one fact twice. The two share an origin, so the partition
 * year can corroborate nothing.
 *
 * Two witnesses survive that objection:
 *
 *   1. the date embedded in the PDF FILENAME (`…_2024-02-13.pdf`), which the
 *      publisher writes from a different field than the partition;
 *   2. the date the DOCUMENT ITSELF PRINTS — the primary source, and the only
 *      one that is evidence about the court's act rather than about a
 *      publisher's bookkeeping.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHEN THEY DISAGREE, THE DOCUMENT SAYS `judgment_date` IS WRONG — 33 TO 1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Of 40 documents where `judgment_date` is exactly one day before the filename
 * date, the text prints:
 *
 *   the filename date only     33
 *   `judgment_date` only        1
 *   neither                     6
 *
 * and of the 13 where the two differ by more than a year, 8 print the filename
 * date and 1 prints `judgment_date`. **The stored column is the unreliable
 * side.** That is why `DATE_VERIFIED` below requires the DOCUMENT and not the
 * filename: agreeing with the publisher is not the same as being right.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO MECHANISMS, NOT ONE, AND THEY WANT DIFFERENT FIXES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured on 2,846 documents carrying a filename date:
 *
 *   exact                     2,713   95.33%
 *   off by exactly one day       86    3.02%   ALL of them judgment_date - 1
 *   2 to 90 days                 14    0.49%
 *   91 days to a year            20    0.70%
 *   more than a year             13    0.46%
 *
 * The off-by-one is a **parse defect, not noise**: every one of the 86 is in the
 * same direction, and they concentrate in six courts — Chhattisgarh 27,
 * Allahabad 24, Andhra Pradesh 24, Gauhati 9, Madras 1, Uttarakhand 1. A date
 * read as UTC midnight and then rendered in a negative-offset zone produces
 * exactly this. It is NOT an artefact of the measurement: `judgment_date` is a
 * `date` column with no time part, and the shift survives being read as text by
 * Postgres with no JS `Date` anywhere in the path.
 *
 * The over-a-year population is a different animal — `judgment_date` tracking a
 * case's FILING year rather than its decision. `CW/4399/2023` dated 2023-03-17
 * with a filename date of 2025-09-12 and 2025 printed in the text is a 2025
 * decision on a 2023 petition.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE REWRITES A DATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The directive is explicit and it is also just correct: a heuristic that
 * silently replaces `judgment_date` with a filename date would be trading a
 * measured 4.67% error for an unmeasured one, and a wrong date in a citation
 * harness is not a cosmetic defect. This assigns a STATE and publishes the
 * evidence. Whether to re-derive is LCC's decision with these numbers in hand.
 */

/** Bumped when a witness or a rule changes meaning. */
export const DATE_QUALITY_VERSION = 'date-quality-v1.1';

/**
 * Share of documents whose `judgment_date` disagrees with the filename date.
 *
 * Two independent uniform samples of 3,000 draws each: **4.67%** and **4.45%**
 * of the documents that carry a filename date. The constant is the second, and
 * both are recorded because a single sample is not a rate.
 *
 * Recorded at all because of what it explains. A citation edge involves TWO
 * documents, so if the defect is independent across them the share of edges
 * with at least one suspect date is `1 - (1 - p)^2`:
 *
 *   p = 3.6%   (filename disagrees AND the document does not back the stored
 *               date — the strongest subset)            ->  7.1% of edges
 *   p = 4.45%  (filename disagrees at all)              ->  8.7% of edges
 *   p = 6.17%  (every DATE_SUSPECT state)               -> 12.0% of edges
 *
 * **NEW3 measured 22 of 250 = 8.8% chronologically impossible edges by hand**,
 * and 8.8% sits inside that range.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE MECHANISM WAS THEN TESTED DIRECTLY, AND IT IS NOT THE EXPLANATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 imported this module and ran it against both endpoints of all 22 edges
 * (bus 0979). The result refuses the reading the matching magnitudes invited:
 *
 * ```
 *  1 of 22   RECOVERED — one endpoint DATE_SUSPECT, and using its witness makes
 *            the edge chronologically real
 * 10 of 21   BOTH endpoints DATE_VERIFIED — the document itself confirms the
 *            stored date on both sides, and the edge is still impossible
 *  6 of 21   a witness exists and the corrected chronology is STILL impossible
 *  5 of 21   DATE_UNKNOWN on at least one side; correctly unresolved
 * ```
 *
 * **The date column explains ONE of the 22.** The largest bucket is positive
 * evidence AGAINST the attribution: `DATE_VERIFIED` in this module requires the
 * DOCUMENT to print the stored date, so those ten are not silence and not a
 * filename artefact — the primary source agrees with us on both ends.
 *
 * **Two numbers of the same magnitude are not a mechanism.** `1 - (1 - p)^2`
 * landing on 8.7% against a measured 8.8% was a coincidence of scale, and the
 * original wording here — "enough to say the date column is a mechanism behind
 * their finding" — claimed more than the arithmetic could carry. It is corrected
 * rather than deleted, because the shape of the error is worth keeping: the
 * hedge was already written ("not the same number arrived at twice") and the
 * conclusion was drawn anyway.
 *
 * What survives untouched is the corpus measurement below, which never depended
 * on NEW3's edges. Whatever explains the other 21 is still open — citation
 * extraction, decision identity, or something neither lane has looked at.
 */
export const DATE_DISAGREE_RATE = 0.0445;

export type DateQualityState =
  /** The document itself prints this date. The primary source agrees. */
  | 'DATE_VERIFIED'
  /** An independent witness disagrees with the stored date. */
  | 'DATE_SUSPECT'
  /** No witness was available. Not a clean bill — nothing looked. */
  | 'DATE_UNKNOWN';

export type DateWitnessKind = 'document_text' | 'source_filename';

export type DateQualityResult = {
  readonly state: DateQualityState;
  readonly method: string;
  /** Which witnesses were found, and what each said. */
  readonly witnesses: readonly { kind: DateWitnessKind; date: string; agrees: boolean }[];
  /** Days from `judgment_date` to the filename date; null when there is none. */
  readonly filenameDeltaDays: number | null;
  /** Named so a consumer can route the mechanical fix separately. */
  readonly offByOneDay: boolean;
};

/** `…_2024-02-13.pdf`. The publisher's own date field, not the partition. */
const FILENAME_DATE = /_(\d{4}-\d{2}-\d{2})\.pdf/i;
/** `13.02.2024`, `13/02/2024`, `13-2-2024` — how an Indian order prints a date. */
const DMY = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
/** `2024-02-13`, which the digital-signature footer tends to use. */
const YMD = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/**
 * `MARCH 8, 2007` · `8th March, 2007` · `8th day of March, 2007` · `Sept. 2, 1999`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDED 22 AUG 2026 BECAUSE ITS ABSENCE CONVICTED 8,404 SUPREME COURT JUDGMENTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first version of this module read numeric dates only, on the stated
 * assumption that *"an Indian order prints its date in the cause title"* — true,
 * and true in the wrong FORMAT for one court. **The Supreme Court prints
 * `MARCH 8, 2007` in the cause title and never prints the date numerically.**
 *
 * The consequence was not a missed verdict, it was a WRONG one. A judgment that
 * prints its own date in a shape we could not read still printed OTHER dates —
 * cited authorities, the impugned order, hearing dates — so `printed.size > 0`
 * and `printed.has(jd)` was false, which is precisely the branch that returns
 * `DATE_SUSPECT`. **43.0% of cited Supreme Court authorities read
 * `DATE_SUSPECT`, and on a 60-row sample 51 of them print the stored date as a
 * month-name date**: 85% false.
 *
 * That inverted this module's own governing rule, which is in the file above and
 * was right: *"a document that prints no date at all is silent, not
 * contradicting."* A date printed in a format the reader cannot parse is silence
 * to that reader. The reader was convicting on its own blind spot.
 *
 * Abbreviations are included because Supreme Court Reports uses them (`Sept.`),
 * and the trailing `\.?` is what makes `Sept.` and `Feb.` match without a
 * separate alternation.
 */
const MONTHS = [
  'jan(?:uary)?',
  'feb(?:ruary)?',
  'mar(?:ch)?',
  'apr(?:il)?',
  'may',
  'jun(?:e)?',
  'jul(?:y)?',
  'aug(?:ust)?',
  'sep(?:t(?:ember)?)?',
  'oct(?:ober)?',
  'nov(?:ember)?',
  'dec(?:ember)?',
];
const MONTH_GROUP = `(${MONTHS.join('|')})\\.?`;
/** `MARCH 8, 2007` — month first, the Supreme Court Reports shape. */
const MDY = new RegExp(
  `\\b${MONTH_GROUP}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b`,
  'gi',
);
/** `8th March, 2007` and `8th day of March, 2007` — the High Court shape. */
const DMY_NAMED = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${MONTH_GROUP}\\s*,?\\s*(\\d{4})\\b`,
  'gi',
);

/** Index of a month name, from any of its accepted spellings. */
function monthIndex(raw: string): number {
  const key = raw.toLowerCase().replace(/\./g, '').slice(0, 3);
  const order = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  return order.indexOf(key) + 1;
}

export function filenameDate(sourceUrl: string | null): string | null {
  return sourceUrl === null ? null : (FILENAME_DATE.exec(sourceUrl)?.[1] ?? null);
}

/**
 * Every date the document prints, as `YYYY-MM-DD`.
 *
 * Day-first, because that is what Indian courts print. `03.04.2024` is 3 April,
 * and reading it as 4 March would manufacture disagreements in exactly the
 * documents this is supposed to adjudicate. Ambiguous pairs (both parts <= 12)
 * are emitted BOTH ways deliberately: the question here is only ever "does the
 * document contain this date", and admitting both readings makes the check
 * conservative — it can fail to find a disagreement, never invent one.
 */
export function printedDates(text: string | null): Set<string> {
  const out = new Set<string>();
  if (text === null) return out;
  for (const m of text.matchAll(DMY)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3]!;
    out.add(`${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`);
    if (a <= 12) out.add(`${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`);
  }
  for (const m of text.matchAll(YMD)) out.add(m[0]);

  /* Month-name dates. Unambiguous by construction — the month is spelled — so
   * unlike the numeric branch above there is no both-ways emission. */
  for (const m of text.matchAll(MDY)) {
    const mm = monthIndex(m[1]!);
    if (mm > 0)
      out.add(`${m[3]}-${String(mm).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`);
  }
  for (const m of text.matchAll(DMY_NAMED)) {
    const mm = monthIndex(m[2]!);
    if (mm > 0)
      out.add(`${m[3]}-${String(mm).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`);
  }
  return out;
}

const dayDelta = (a: string, b: string): number =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

export function dateQuality(input: {
  /** `to_char(judgment_date,'YYYY-MM-DD')` — read as TEXT, never as a JS Date. */
  readonly judgmentDate: string | null;
  readonly sourceUrl: string | null;
  readonly text: string | null;
}): DateQualityResult {
  const jd = input.judgmentDate;
  if (jd === null) {
    return {
      state: 'DATE_UNKNOWN',
      method: `no_stored_date_${DATE_QUALITY_VERSION}`,
      witnesses: [],
      filenameDeltaDays: null,
      offByOneDay: false,
    };
  }

  const witnesses: { kind: DateWitnessKind; date: string; agrees: boolean }[] = [];
  const fd = filenameDate(input.sourceUrl);
  let delta: number | null = null;
  if (fd !== null) {
    delta = dayDelta(jd, fd);
    witnesses.push({ kind: 'source_filename', date: fd, agrees: delta === 0 });
  }

  const printed = printedDates(input.text);
  if (printed.size > 0) {
    witnesses.push({ kind: 'document_text', date: jd, agrees: printed.has(jd) });
  }

  const doc = witnesses.find((w) => w.kind === 'document_text');
  const file = witnesses.find((w) => w.kind === 'source_filename');

  /* VERIFIED requires the PRIMARY DOCUMENT. The filename agreeing is the
   * publisher agreeing with itself, and the publisher is the side that was
   * wrong 33 times out of 34 when the two disagreed. */
  if (doc?.agrees === true) {
    return {
      state: 'DATE_VERIFIED',
      method: `printed_in_document_${DATE_QUALITY_VERSION}`,
      witnesses,
      filenameDeltaDays: delta,
      offByOneDay: delta === -1,
    };
  }

  /* SUSPECT needs a witness that actively disagrees. A document that prints no
   * date at all is silent, not contradicting — and treating silence as a
   * contradiction would convict every damaged text in the corpus of a date
   * defect it has no evidence for. */
  const contradicted =
    file?.agrees === false ||
    (doc !== undefined && doc.agrees === false && file?.agrees !== true && printed.size > 0);
  if (contradicted) {
    return {
      state: 'DATE_SUSPECT',
      method:
        file?.agrees === false
          ? `filename_disagrees_${DATE_QUALITY_VERSION}`
          : `document_prints_other_dates_${DATE_QUALITY_VERSION}`,
      witnesses,
      filenameDeltaDays: delta,
      offByOneDay: delta === -1,
    };
  }

  return {
    state: 'DATE_UNKNOWN',
    method: `no_independent_witness_${DATE_QUALITY_VERSION}`,
    witnesses,
    filenameDeltaDays: delta,
    offByOneDay: false,
  };
}
