/**
 * PAGE FURNITURE — removing a PDF's page headers, rules and e-signature panels
 * from `full_text` without ever removing a word the court wrote.
 *
 * NEW2, 15 Aug 2026. Raised by LCC on the bus (0512, 0535): 64-75% of every
 * enrichment task's rejected claims are corpus text defects rather than model
 * error, and the largest single family is page furniture appearing in the middle
 * of a sentence.
 *
 * ---------------------------------------------------------------------------
 * THE CORRECTION THAT MADE THIS TRACTABLE
 * ---------------------------------------------------------------------------
 * The furniture is NOT spliced mid-sentence. It is on its OWN LINES.
 *
 * LCC's examples looked mid-sentence because their triage flattens whitespace
 * before comparing a model's quote against the source — which is right for that
 * job and misleading for this one. In the stored text it reads:
 *
 *     ...Investigating Officer conducted a detailed investigation and
 *     - 3 -
 *     HC-KAR
 *     NC: 2025:KHC-D:8979
 *     CRL.RP No. 100113 of 2021
 *     filed a charge sheet against the accused...
 *
 * Measured on a 4,000-document TABLESAMPLE draw across 25 courts: 25,134
 * furniture occurrences sit on their own line and 5 do not — 99.98%. That single
 * fact is what separates a safe fix from a dangerous one, because it means the
 * cleaner never has to edit INSIDE a line of prose, and the flowed-text regexes
 * that would (`/-\s*\d+\s*-/g` eats "paragraphs 12 - 15 -", the case-number one
 * eats real citations) are not needed at all.
 *
 * ---------------------------------------------------------------------------
 * PREVALENCE — much wider than the first measurement suggested
 * ---------------------------------------------------------------------------
 * Same draw, share of documents carrying at least one furniture line:
 *
 *     Meghalaya 100% · Orissa 100% · Karnataka 98.5% · Jharkhand 98.4%
 *     Chhattisgarh 97.5% · KERALA 97.2% · Madras 96.9% · Gujarat 96.8%
 *     Madhya Pradesh 94.5% · Manipur 94.1% · J&K 78.2% · Himachal 74.5%
 *     ... Rajasthan 1.5% · Supreme Court 5.4%
 *
 * Corpus-wide this is 2.76% of all non-empty lines. Two of these disagree with
 * bus 0512 and the disagreement is the useful part: KERALA WAS REPORTED AT 2.4%
 * AND IS 97.2%, because the earlier probe tested only the `: N :` page-rule form
 * against flowed text, and Kerala's furniture is `NC:`-stamp and case-number
 * headers. This is not "a few courts' PDF layouts" — it is most of the corpus.
 *
 * ---------------------------------------------------------------------------
 * THE TWO FALSE-POSITIVE FAMILIES, FOUND BY READING WHAT WOULD BE DELETED
 * ---------------------------------------------------------------------------
 * Before writing a rule, every distinct line a draft rule matched was printed
 * and read. Two families of real legal text were being caught:
 *
 * 1. A signature rule permitting `verification`/`location`/bare `signed by`
 *    plus up to 60 further characters swallowed prose that merely STARTS that
 *    way — "signed by the successful candidate as well as C.W. 2, Jathedar
 *    Ram E", "verification of account statement, it was revealed that
 *    Rs.11,07,000...". So the panel forms now require their punctuation (`:`)
 *    and are short; the two generic words are gone.
 *
 * 2. A case-number line is ONLY furniture when it repeats. `C.S. No.13 of 1958`
 *    on its own line is a running header when it appears on every page and a
 *    reference to another matter when it appears once — the shape cannot tell
 *    them apart, and a citation is the one thing in this corpus that must never
 *    be silently deleted. So that rule alone requires >= MIN_HEADER_REPEATS
 *    occurrences in the same document, which is what "running header" MEANS.
 *
 * The remaining rules (page rules, `HC-XXX`, neutral-citation stamps,
 * `Page N of M`) are unambiguous by shape: they cannot be a sentence.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DOES NOT DO
 * ---------------------------------------------------------------------------
 * It does not write to the database. Stripping furniture from 6.9M stored
 * `full_text` values in place would destroy the source artifact irreversibly,
 * and provenance is not mine to spend — see `stripPageFurniture`'s report type,
 * which exists so the change can be measured and reviewed before any of it is
 * applied. `services/ingest/src/harvest/furniture-report-cli.ts` is the
 * measurement; applying it is a separate decision with LCC, who owns migrations.
 */

/** A running header must actually run. One occurrence is a reference, not furniture. */
const MIN_HEADER_REPEATS = 2;

/**
 * Whole-line forms that cannot be prose whatever the context.
 *
 * Every one is anchored at both ends against the TRIMMED line. None may contain
 * `.{0,n}` over free text: that is precisely how the signature rule started
 * eating sentences.
 */
const UNAMBIGUOUS: readonly { readonly name: string; readonly re: RegExp }[] = [
  /** `- 3 -`, `-3-`. Digits between two rules and nothing else. */
  { name: 'pageRuleDash', re: /^-\s*\d{1,4}\s*-$/ },
  /** `: 3 :`, the same device in Kerala/MP layouts. */
  { name: 'pageRuleColon', re: /^:\s*\d{1,4}\s*:$/ },
  /** `Page 2 of 4`, `Page 7`. */
  { name: 'pageOfN', re: /^page\s*\d{1,4}(?:\s*of\s*\d{1,4})?$/i },
  /** `HC-KAR` — the court's own watermark line. */
  { name: 'hcStamp', re: /^HC-[A-Z]{2,4}(?:[- ][A-Z]{1,3})?$/ },
  /**
   * `NC: 2025:KHC-D:8979`, `2026:JHHC:11644-DB` — the judgment's OWN neutral
   * citation printed as a page stamp.
   *
   * ORDERING CONSTRAINT, AND IT IS LOAD-BEARING. An earlier draft of this
   * comment claimed `neutral_citation` comes from the harvest metadata and that
   * removing these lines therefore costs nothing. THAT IS WRONG, and checking it
   * rather than asserting it is the only reason it was caught:
   * `neutralCitationFrom` in `hc-load.ts` derives the column by scanning the
   * FIRST 3,000 CHARACTERS OF `full_text` — because, as its own comment says,
   * neither metadata variant has a citation column and this is "the whole reason
   * 2023+ documents are citable at all".
   *
   * So this cleaner MUST NOT run before that derivation. On already-ingested
   * rows the column is persisted and nothing is lost; run it ahead of
   * `toJudgmentRecord` and a 2023+ High Court judgment silently becomes
   * uncitable. `page-furniture.test.ts` pins that ordering.
   *
   * No citation EDGE is lost either way. Measured over 1,200 documents: 40 lost
   * citations, 40 of them the document's own — zero references to another
   * judgment. A document does not cite itself, so no edge existed to lose.
   */
  { name: 'ncStamp', re: /^(?:NC\s*:?\s*)?\d{4}\s*:\s*[A-Z]{2,6}(?:-[A-Z]{1,3})?\s*:\s*\d+(?:-DB)?$/i },
  /** e-signature panel. Punctuation required; short; no free-text tail. */
  { name: 'sigVerified', re: /^signature\s+not\s+verified$/i },
  { name: 'sigSignedBy', re: /^signed\s+by\s*:\s*[A-Za-z][A-Za-z. ]{0,38}$/i },
  { name: 'sigDigitally', re: /^digitally\s+signed\s+by\s*:?\s*[A-Za-z. ]{0,38}$/i },
  { name: 'sigTime', re: /^signing\s+time\s*:\s*[\d/:\-. ]{1,24}(?:am|pm)?$/i },
  { name: 'sigLocation', re: /^location\s*:\s*[A-Za-z][A-Za-z, ]{0,38}$/i },
];

/**
 * A case-number line: `WP No. 58125 of 2017`, `CRL.P No. 12949 of 2025`,
 * `C/W MFA No. 101492 of 2019`. Furniture ONLY when repeated — see the header
 * comment. Kept separate from UNAMBIGUOUS for exactly that reason.
 */
const CASE_NUMBER_LINE =
  /^(?:C\/W\s+)?[A-Z][A-Za-z.()/ ]{0,18}No\.?\s*\d{1,6}\s*(?:of|\/)\s*\d{2,4}$/i;

export type FurnitureReport = {
  /** The text with furniture lines removed. */
  readonly text: string;
  /** Lines removed, by rule name — the thing to read before trusting a run. */
  readonly removedByRule: Readonly<Record<string, number>>;
  /** The removed lines themselves, deduplicated, for review. */
  readonly removedLines: readonly string[];
  readonly charsBefore: number;
  readonly charsAfter: number;
  readonly linesBefore: number;
  readonly linesRemoved: number;
};

/**
 * Remove page furniture from one document's `full_text`.
 *
 * Pure: takes text, returns text plus a report of exactly what went. Nothing is
 * removed that is not accounted for in `removedLines`, so a reviewer can always
 * answer "what did this delete" without re-running it.
 */
export function stripPageFurniture(fullText: string): FurnitureReport {
  const lines = fullText.split('\n');

  /**
   * Count case-number lines FIRST, across the whole document, because the rule
   * for them is about the document and not about the line. A single pass that
   * decided line-by-line could not implement "only when it repeats" at all.
   */
  const caseCounts = new Map<string, number>();
  for (const raw of lines) {
    const l = raw.trim();
    if (l && CASE_NUMBER_LINE.test(l)) caseCounts.set(l, (caseCounts.get(l) ?? 0) + 1);
  }

  const removedByRule: Record<string, number> = {};
  const removedLines = new Set<string>();
  const kept: string[] = [];

  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      kept.push(raw);
      continue;
    }

    const hit = UNAMBIGUOUS.find((r) => r.re.test(l));
    if (hit) {
      removedByRule[hit.name] = (removedByRule[hit.name] ?? 0) + 1;
      removedLines.add(l);
      continue;
    }

    if (CASE_NUMBER_LINE.test(l) && (caseCounts.get(l) ?? 0) >= MIN_HEADER_REPEATS) {
      removedByRule['caseNumberHeader'] = (removedByRule['caseNumberHeader'] ?? 0) + 1;
      removedLines.add(l);
      continue;
    }

    kept.push(raw);
  }

  return {
    text: kept.join('\n'),
    removedByRule,
    removedLines: [...removedLines],
    charsBefore: fullText.length,
    charsAfter: kept.join('\n').length,
    linesBefore: lines.length,
    linesRemoved: lines.length - kept.length,
  };
}
