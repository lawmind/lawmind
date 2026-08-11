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
  bench: string | null;
  /** ISO `YYYY-MM-DD`. */
  judgmentDate: string;
  fullText: string;
  language: 'en';
  sourceUrl: string;
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
};

export function metadataUrl(year: number): string {
  return `${SCI_BUCKET}/metadata/parquet/year=${year}/metadata.parquet`;
}

/** Verified against the bucket: keys carry an `_EN` suffix. */
export function pdfUrl(year: number, path: string): string {
  return `${SCI_BUCKET}/data/pdf/year=${year}/english/${path}_EN.pdf`;
}

/**
 * The single definition of a judgment's identity and provenance.
 *
 * It keys off `row.year`, NOT the year partition the row was read from. The two
 * differ often — 694 of 1,804 rows across 1950–1960 — because the same judgment
 * is listed in two adjacent partitions, and `(row.year, path)` is what actually
 * identifies it. The bucket serves the PDF under both years, so both URLs
 * resolve, but fetching under one and recording the other would make provenance
 * a coin flip and would break `--resume`, which matches on the stored value.
 *
 * Fetch and storage must use this same function. That is the whole point of it.
 */
export function sourceUrlFor(row: SciMetadataRow): string {
  return pdfUrl(Number(row.year), row.path);
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
    caseNumber,
    caseType: toCaseType(caseNumber),
    cnr: blank(row.cnr) ? null : row.cnr.trim(),
    nativeText: nativeText ?? null,
    sourcePetitioner: blank(row.petitioner) ? null : row.petitioner.trim(),
    sourceRespondent: blank(row.respondent) ? null : row.respondent.trim(),
    disposalNature: blank(row.disposal_nature) ? null : row.disposal_nature.trim(),
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
