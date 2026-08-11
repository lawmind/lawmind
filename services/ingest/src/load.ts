import { createHash } from 'node:crypto';

import type { Sql } from 'postgres';

import { textQuality } from '@lawmind/embed';

import type { JudgmentRecord } from './sci.ts';

/**
 * Provenance, computed once here rather than by every loader — `hc-load.ts`
 * and `sci.ts` both produce a `JudgmentRecord` and both write through this
 * one function, so this is the single place both get it for free.
 *
 * `docs/SCHEMA_TRUTH.md` §judgments: `content_hash` is sha256 of `full_text`,
 * `text_quality` is the same measured proxy `judgment_chunks` already
 * carries. Migration `0031`.
 */
export function contentHash(fullText: string): string {
  return createHash('sha256').update(fullText, 'utf8').digest('hex');
}

export type LoadResult = { inserted: number; updated: number };

/**
 * Resumability lives in the database, not in a checkpoint file: `source_url`
 * carries a unique index, so re-running a killed ingest re-writes the rows it
 * already had instead of duplicating them.
 *
 * `DO UPDATE` rather than `DO NOTHING` so a re-run also repairs a row whose
 * metadata changed at source — the dataset is re-scraped upstream.
 *
 * `overruled_status` is deliberately absent from the update list. Ingest knows
 * nothing about whether a judgment is still good law, and overwriting a status
 * that S2 established would be the stale-overruled failure arriving through the
 * back door.
 */
/**
 * Rows per INSERT. A whole year is up to ~1,000 judgments of several hundred KB
 * each, and a single statement carrying all of them is both a large parameter
 * list and an all-or-nothing failure: one unstorable row loses the year.
 *
 * (The silent stop after 2022 was NOT this. It was SQLSTATE 22021 on invalid
 * UTF-8 — see `stripUnstorable` in `text.ts`. Batching is kept because it bounds
 * the blast radius of a bad row, not because it fixed that.)
 */
const INSERT_BATCH = 100;

export async function upsertJudgments(sql: Sql, records: JudgmentRecord[]): Promise<LoadResult> {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < records.length; i += INSERT_BATCH) {
    const result = await upsertBatch(sql, records.slice(i, i + INSERT_BATCH));
    inserted += result.inserted;
    updated += result.updated;
  }
  return { inserted, updated };
}

async function upsertBatch(sql: Sql, records: JudgmentRecord[]): Promise<LoadResult> {
  const rows = records.map((r) => ({
    case_title: r.caseTitle,
    neutral_citation: r.neutralCitation,
    reporter_citations: r.reporterCitations,
    court: r.court,
    bench: r.bench,
    judgment_date: r.judgmentDate,
    full_text: r.fullText,
    language: r.language,
    source_url: r.sourceUrl,
    case_number: r.caseNumber,
    case_type: r.caseType,
    // Migration 0031. Computed here, not by the caller — every loader gets it
    // for free, and a loader that forgets to pass it cannot ship a null by
    // accident the way an optional field on JudgmentRecord could.
    content_hash: contentHash(r.fullText),
    text_quality: textQuality(r.fullText),
    // Never invented — undefined on `JudgmentRecord` (SC has no such field)
    // resolves to `null` here rather than an empty string.
    source_document_type: r.sourceDocumentType ?? null,
  }));

  // Columns are inferred from the object keys — every row is built by the same
  // mapper, so the key set is uniform by construction.
  const returned = await sql<{ inserted: boolean }[]>`
    INSERT INTO judgments ${sql(rows)}
    ON CONFLICT (source_url) DO UPDATE SET
      case_title            = EXCLUDED.case_title,
      neutral_citation      = EXCLUDED.neutral_citation,
      reporter_citations    = EXCLUDED.reporter_citations,
      court                 = EXCLUDED.court,
      bench                 = EXCLUDED.bench,
      judgment_date         = EXCLUDED.judgment_date,
      full_text             = EXCLUDED.full_text,
      language              = EXCLUDED.language,
      case_number           = EXCLUDED.case_number,
      case_type             = EXCLUDED.case_type,
      content_hash          = EXCLUDED.content_hash,
      text_quality          = EXCLUDED.text_quality,
      source_document_type  = EXCLUDED.source_document_type
    RETURNING (xmax = 0) AS inserted
  `;

  const inserted = returned.filter((r) => r.inserted).length;
  return { inserted, updated: returned.length - inserted };
}

/** Which of these source URLs are already loaded — lets a resumed run skip the fetch. */
export async function existingSourceUrls(sql: Sql, urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const rows = await sql<{ source_url: string }[]>`
    SELECT source_url FROM judgments WHERE source_url = ANY(${urls})
  `;
  return new Set(rows.map((r) => r.source_url));
}
