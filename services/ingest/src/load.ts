import type { Sql } from 'postgres';

import type { JudgmentRecord } from './sci.ts';

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
export async function upsertJudgments(sql: Sql, records: JudgmentRecord[]): Promise<LoadResult> {
  if (records.length === 0) return { inserted: 0, updated: 0 };

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
  }));

  // Columns are inferred from the object keys — every row is built by the same
  // mapper, so the key set is uniform by construction.
  const returned = await sql<{ inserted: boolean }[]>`
    INSERT INTO judgments ${sql(rows)}
    ON CONFLICT (source_url) DO UPDATE SET
      case_title         = EXCLUDED.case_title,
      neutral_citation   = EXCLUDED.neutral_citation,
      reporter_citations = EXCLUDED.reporter_citations,
      court              = EXCLUDED.court,
      bench              = EXCLUDED.bench,
      judgment_date      = EXCLUDED.judgment_date,
      full_text          = EXCLUDED.full_text,
      language           = EXCLUDED.language
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
