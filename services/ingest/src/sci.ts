/**
 * Supreme Court of India — OD-4 Stage 1, the citation backbone.
 *
 * Source: AWS Open Data, `s3://indian-supreme-court-judgments`, CC-BY-4.0, Mumbai
 * (`ap-south-1`). Public: no account, no credentials, no egress bill, so this
 * speaks plain S3 REST over HTTPS rather than pulling in the AWS SDK.
 *
 * Structured metadata is per-year parquet and is read over HTTP range requests —
 * the whole file is never downloaded. PDFs are streamed, converted to text and
 * discarded; only the text is kept.
 *
 * Primary source only. Nothing here is model-generated. `docs/DATASETS.md`.
 */
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

export const SCI_BUCKET = 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com';

/** Columns of `metadata/parquet/year=YYYY/metadata.parquet`, as published. */
export type SciMetadataRow = {
  title: string;
  petitioner: string;
  respondent: string;
  description: string;
  judge: string;
  author_judge: string | null;
  /** Reporter citation, e.g. `[1950] 1 S.C.R. 806`. Blank for some rows. */
  citation: string;
  /** Neutral citation in canonical spaced form, e.g. `1950 INSC 25`. */
  case_id: string;
  cnr: string;
  /** `DD-MM-YYYY`. */
  decision_date: string;
  disposal_nature: string;
  court: string;
  /** e.g. `ENG,HIN,PUN`. */
  available_languages: string;
  path: string;
  nc_display: string;
  year: string;
  /** Scraped e-SCR markup. Carries the official case number. */
  raw_html?: string;
};

/** What the loader writes. Shapes follow `docs/SCHEMA_TRUTH.md` §judgments. */
export type JudgmentRecord = {
  caseTitle: string;
  neutralCitation: string | null;
  reporterCitations: string[];
  court: string;
  /** The judges who sat, verbatim. NULL where the source publishes none. **Never a court code.** */
  bench: string | null;
  /**
   * Migration `0040`. The source's own court-establishment code — the AWS High
   * Court bucket's `bench=` partition key. Provenance, and never a coram.
   *
   * Optional because the Supreme Court source has no such partition;
   * `undefined` and `null` both land as a database NULL. It exists because
   * `hc-load.ts` wrote this value into `bench` for 40,705 rows, and losing it
   * on the way out would have traded one wrong answer for a missing one.
   */
  sourceBenchCode?: string | null;
  /** ISO `YYYY-MM-DD`. */
  judgmentDate: string;
  fullText: string;
  language: 'en';
  sourceUrl: string;
  /**
   * Per-row acquisition provenance (migration 0092). Optional only for source
   * adapters that genuinely do not know the answer; the two AWS adapters set
   * all three fields on every new write.
   */
  sourceId?: string | null;
  sourceEdition?: 'court_raw' | 'reporter_edited' | 'mixed_unseparated' | null;
  authorizationBasis?: string | null;
  /** The official case number as printed, e.g. `CRIMINAL APPEAL No. 19/1955`. */
  caseNumber: string | null;
  /** Derived from `caseNumber` only. Null where it states no side. */
  caseType: 'criminal' | 'civil' | null;
  /**
   * Verbatim from the source's own document-type label, where the source
   * publishes one. Optional because the Supreme Court source never carries
   * one; `undefined` and `null` are treated identically by the loader
   * (`load.ts`) and both land as a database NULL. Never classified, never
   * guessed — `docs/SCHEMA_TRUTH.md` §judgments `source_document_type`.
   */
  sourceDocumentType?: string | null;
  /**
   * The eCourts Case Number Record. Present on `SciMetadataRow` and
   * `HcMetadataRow` alike; verbatim from source, never derived — migration
   * `0034`. `docs/SCHEMA_TRUTH.md` §judgments `cnr`.
   */
  cnr?: string | null;
  /**
   * Whether the source PDF had a usable text layer — `text.ts`'s
   * `isNativeText`, characters-per-page against a 100-char floor, computed
   * at fetch time from the PDF's own page count. `null`/`undefined` means
   * not computed (a row whose text arrived some other way than
   * `fetchPdfText`), never a guess at scan-vs-native. Migration `0035`.
   * `docs/ai/AWS_CORPUS_INVENTORY.md` §6.
   */
  nativeText?: boolean | null;
  /**
   * The court's own filed petitioner/respondent, verbatim from
   * `SciMetadataRow` — present on every Supreme Court row (0 blank of 795
   * sampled, year=2018), never threaded through until `services/ingest/src/
   * parties.ts` existed. Undefined on High Court records, whose plain-variant
   * metadata carries no such field — `load.ts` falls back to parsing
   * `caseTitle` when either is absent. Migration `0037`.
   */
  sourcePetitioner?: string | null;
  sourceRespondent?: string | null;
  /**
   * Verbatim from the source's own `disposal_nature` field — real outcomes
   * ("Appeal(s) allowed", "Dismissed", "Disposed off"), never classified
   * here. Migration `0038`.
   */
  disposalNature?: string | null;
  /**
   * How `fullText` was produced — `text.ts`'s `fetchPdfText` reports
   * `'unpdf'` (the default) or `'pdftotext_fallback'` (the corruption-repair
   * pass, `CURRENT_PLAN.md` Q1.27). `undefined`/`null` means not recorded —
   * a row whose text arrived some other way, or ingested before this field
   * existed. Migration `0048`.
   */
  textExtractionMethod?: string | null;
};

export function metadataUrl(year: number): string {
  return `${SCI_BUCKET}/metadata/parquet/year=${year}/metadata.parquet`;
}

/** Verified against the bucket: keys carry an `_EN` suffix. */
export function pdfUrl(year: number, path: string): string {
  return `${SCI_BUCKET}/data/pdf/year=${year}/english/${path}_EN.pdf`;
}

/**
 * The single definition of a judgment's IDENTITY and provenance.
 *
 * It keys off `row.year`, NOT the year partition the row was read from. The two
 * differ often — 694 of 1,804 rows across 1950–1960 — because the same judgment
 * is listed in two adjacent partitions, and `(row.year, path)` is what actually
 * identifies it. Fetching under one year and recording the other would make
 * provenance a coin flip and would break `--resume`, which matches on the stored
 * value.
 *
 * **CORRECTION, 28 Aug 2026 (R10).** This comment used to continue "The bucket
 * serves the PDF under both years, so both URLs resolve." **That is false**, and
 * one real judgment was unreachable because of it. Verified by two HEAD requests:
 *
 *   year=2009/english/2009_9_810_820_EN.pdf   404
 *   year=2006/english/2009_9_810_820_EN.pdf   200, 403,918 bytes
 *
 * The object is published ONLY under the partition it was listed in, and that
 * partition is not always `row.year`.
 *
 * Identity is still this function and is deliberately unchanged — rewriting it
 * would rewrite `source_url` for 38,351 stored rows to fix one document, which
 * is not a trade worth making. What was wrong was never the identity: it was
 * using identity as the RETRIEVAL address. Those are now two functions, and
 * `fetchUrlCandidatesFor` is the retrieval one.
 */
export function sourceUrlFor(row: SciMetadataRow): string {
  return pdfUrl(Number(row.year), row.path);
}

/**
 * Where to actually GO to get the bytes, in order of preference.
 *
 * The identity URL is always first, so the overwhelmingly common case makes one
 * request and behaves exactly as before. The partition URL is appended only when
 * the row's own `year` disagrees with the partition it was read from — the
 * 694-in-1,804 case — and only as a FALLBACK, so a 200 on the identity URL never
 * consults it.
 *
 * What this deliberately does NOT do is change what gets stored. A row fetched
 * from the partition address is still recorded under `sourceUrlFor`, because the
 * stored value is the row's identity and `--resume` matches on it. The retrieval
 * address is not provenance and must never be persisted as if it were; if the
 * two ever need to both be recorded, that is a schema change and a migration,
 * not a quiet swap here.
 */
export function fetchUrlCandidatesFor(row: SciMetadataRow, partitionYear?: number): string[] {
  const identity = sourceUrlFor(row);
  if (partitionYear === undefined || Number(row.year) === partitionYear) return [identity];
  return [identity, pdfUrl(partitionYear, row.path)];
}

/**
 * `DD-MM-YYYY` → `YYYY-MM-DD`. Throws rather than guessing: a judgment filed
 * under the wrong date is worse than one that failed to load loudly.
 */
export function toIsoDate(ddmmyyyy: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) throw new Error(`unrecognised decision_date: ${JSON.stringify(ddmmyyyy)}`);
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  if (Number.isNaN(Date.parse(iso))) throw new Error(`impossible decision_date: ${ddmmyyyy}`);
  return iso;
}

const blank = (v: string | null | undefined): boolean => !v || v.trim() === '';

/** Pulls the official case number out of the scraped e-SCR markup. */
export function parseCaseNumber(rawHtml: string | undefined): string | null {
  if (!rawHtml) return null;
  const m = /Case No\s*:<\/span>\s*<font[^>]*>([^<]+)/i.exec(rawHtml);
  const value = m?.[1]?.replace(/\s+/g, ' ').trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Reads the side off the official case number. Supreme Court case numbers state
 * it themselves — CIVIL APPEAL, CRIMINAL APPEAL, WRIT PETITION (CIVIL), SPECIAL
 * LEAVE PETITION (CRIMINAL) — so this is a published field, not a classification
 * of the case.
 *
 * CRIMINAL is checked first because `SPECIAL LEAVE PETITION (CRIMINAL)` contains
 * neither token in isolation and `WRIT PETITION (CRIMINAL)` must not fall through
 * to civil. Anything that states no side stays null: ARBITRATION PETITION,
 * MISCELLANEOUS APPLICATION, a bare diary number.
 */
export function toCaseType(caseNumber: string | null): 'criminal' | 'civil' | null {
  if (!caseNumber) return null;
  const upper = caseNumber.toUpperCase();
  if (upper.includes('CRIMINAL')) return 'criminal';
  if (upper.includes('CIVIL')) return 'civil';
  return null;
}

export function toJudgment(
  row: SciMetadataRow,
  fullText: string,
  nativeText?: boolean | null,
  textExtractionMethod?: string | null,
): JudgmentRecord {
  const caseNumber = parseCaseNumber(row.raw_html);
  return {
    caseTitle: row.title.trim().replace(/\s+/g, ' '),
    neutralCitation: blank(row.case_id) ? null : row.case_id.trim(),
    reporterCitations: blank(row.citation) ? [] : [row.citation.trim()],
    court: row.court.trim(),
    bench: blank(row.judge) ? null : row.judge.trim(),
    judgmentDate: toIsoDate(row.decision_date),
    fullText,
    // The English PDF is what we fetch. `available_languages` often lists more
    // (ENG,HIN,PUN), and judgments.language is a two-value enum, so a Hindi
    // version cannot be a variant of this row — it would be a second row.
    // Flagged in the S1 report; not decided here.
    language: 'en',
    sourceUrl: sourceUrlFor(row),
    sourceId: 'aws_sc',
    sourceEdition: 'court_raw',
    authorizationBasis: 'aws_open_data',
    caseNumber,
    caseType: toCaseType(caseNumber),
    cnr: blank(row.cnr) ? null : row.cnr.trim(),
    nativeText: nativeText ?? null,
    sourcePetitioner: blank(row.petitioner) ? null : row.petitioner.trim(),
    sourceRespondent: blank(row.respondent) ? null : row.respondent.trim(),
    disposalNature: blank(row.disposal_nature) ? null : row.disposal_nature.trim(),
    textExtractionMethod: textExtractionMethod ?? null,
  };
}

/** Reads one year of metadata over range requests. The file is never fully downloaded. */
export async function readYearMetadata(year: number): Promise<SciMetadataRow[]> {
  const file = await asyncBufferFromUrl({ url: metadataUrl(year) });
  // hyparquet returns untyped records; the column set is asserted above from the
  // published schema, which is why this is the one cast in the module.
  const rows = (await parquetReadObjects({ file })) as unknown as SciMetadataRow[];
  return rows;
}
