/**
 * Back-fill `judgments.petitioner`/`respondent`/`parties_extraction_method`
 * for the 79,322 rows ingested before migration `0037` —
 * `docs/ai/LEGAL_STRUCTURE.md`, Stage 5.
 *
 *   pnpm --filter @lawmind/ingest run backfill:parties [--confirm]
 *
 * TWO PASSES, in priority order:
 *
 * 1. Supreme Court, SOURCE METADATA — re-reads the same public AWS Open Data
 *    year files the original ingest read (no live court site), matching by
 *    the exact `sourceUrlFor` computation `sci.ts`'s real loader uses —
 *    identical pattern to `backfill-cnr.ts`, which already proved this
 *    approach works at 100% match rate on real partitions (task 007).
 * 2. Everything else (every held High Court row, plus any Supreme Court row
 *    the first pass could not match) — `extractPartiesFromTitle` against
 *    `case_title` ALREADY IN POSTGRES. No re-fetch, no network: the same
 *    shape as `backfill-provenance.ts`'s content_hash/text_quality backfill.
 *
 * Never guesses beyond what `parties.ts`'s two deterministic methods already
 * refuse to. A row this leaves with `method = 'unknown'` genuinely has no
 * recoverable party information from either source.
 */
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';
import postgres, { type Sql } from 'postgres';

import { extractPartiesFromTitle } from './parties.ts';
import { metadataUrl, sourceUrlFor, type SciMetadataRow } from './sci.ts';
import { sslFor } from './db-ssl';

const blank = (v: string | null | undefined): boolean => !v || v.trim() === '';

type UrlParties = { url: string; petitioner: string; respondent: string };

async function distinctScYears(sql: Sql): Promise<number[]> {
  const rows = await sql<{ year: string }[]>`
    SELECT DISTINCT substring(source_url from 'year=([0-9]+)') AS year
      FROM judgments
     WHERE court = 'Supreme Court of India' AND parties_extraction_method IS NULL
     ORDER BY 1`;
  return rows.map((r) => Number(r.year)).filter((y) => Number.isFinite(y));
}

async function scSourceMetadata(
  years: number[],
): Promise<Map<string, { petitioner: string; respondent: string }>> {
  const pairs: UrlParties[] = [];
  for (const year of years) {
    const url = metadataUrl(year);
    let rows: SciMetadataRow[];
    try {
      const file = await asyncBufferFromUrl({ url });
      rows = (await parquetReadObjects({ file })) as SciMetadataRow[];
    } catch (error) {
      console.log(`  SC year=${year}: SKIPPED (${(error as Error).message})`);
      continue;
    }
    for (const row of rows) {
      if (blank(row.petitioner) && blank(row.respondent)) continue;
      pairs.push({
        url: sourceUrlFor(row),
        petitioner: row.petitioner ?? '',
        respondent: row.respondent ?? '',
      });
    }
    console.log(`  SC year=${year}: ${rows.length} rows read`);
  }
  // One url -> one pair; a genuine conflict (same url, disagreeing values)
  // drops the url rather than picking one, same rule as backfill-cnr.ts.
  const map = new Map<string, { petitioner: string; respondent: string } | null>();
  for (const { url, petitioner, respondent } of pairs) {
    const existing = map.get(url);
    if (existing === undefined) {
      map.set(url, { petitioner, respondent });
    } else if (
      existing !== null &&
      (existing.petitioner !== petitioner || existing.respondent !== respondent)
    ) {
      map.set(url, null);
    }
  }
  const clean = new Map<string, { petitioner: string; respondent: string }>();
  for (const [url, v] of map) if (v) clean.set(url, v);
  return clean;
}

async function applySourceMetadataPass(
  sql: Sql,
  map: Map<string, { petitioner: string; respondent: string }>,
): Promise<number> {
  let updated = 0;
  const entries = [...map.entries()];
  const BATCH = 200;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(
        ([sourceUrl, { petitioner, respondent }]) => sql`
        UPDATE judgments
           SET petitioner = ${blank(petitioner) ? null : petitioner.trim()},
               respondent = ${blank(respondent) ? null : respondent.trim()},
               parties_extraction_method = 'source_metadata'
         WHERE source_url = ${sourceUrl} AND parties_extraction_method IS NULL`,
      ),
    );
    updated += batch.length;
    console.log(`  applied ${updated}/${entries.length}...`);
  }
  return updated;
}

async function applyTitleParsedPass(sql: Sql): Promise<number> {
  const PAGE_SIZE = 2000;
  let lastId = '00000000-0000-0000-0000-000000000000';
  let updated = 0;
  for (;;) {
    const page = await sql<{ id: string; case_title: string }[]>`
      SELECT id, case_title FROM judgments
       WHERE parties_extraction_method IS NULL AND id > ${lastId}
       ORDER BY id LIMIT ${PAGE_SIZE}`;
    if (page.length === 0) break;

    await Promise.all(
      page.map((r) => {
        const parties = extractPartiesFromTitle(r.case_title);
        return sql`
          UPDATE judgments
             SET petitioner = ${parties.petitioner},
                 respondent = ${parties.respondent},
                 parties_extraction_method = ${parties.method}
           WHERE id = ${r.id}`;
      }),
    );
    updated += page.length;
    lastId = page[page.length - 1]!.id;
    console.log(`  title-parsed ${updated}...`);
  }
  return updated;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 10, ssl: sslFor(url) });
  const confirmed = process.argv.includes('--confirm');

  try {
    const [totalRow] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgments WHERE parties_extraction_method IS NULL`;
    const total = Number(totalRow?.n ?? 0);
    console.log(`judgments missing parties_extraction_method: ${total}`);
    if (total === 0) {
      console.log('nothing to backfill.');
      return;
    }

    const years = await distinctScYears(sql);
    console.log(`SC years to check for source metadata: ${years.length}`);
    console.log('Reading Supreme Court source metadata...');
    const scMap = await scSourceMetadata(years);
    console.log(`SC: ${scMap.size} url -> petitioner/respondent pairs recovered\n`);

    if (!confirmed) {
      console.log('sample source-metadata matches:');
      let shown = 0;
      for (const [sourceUrl, v] of scMap) {
        if (shown >= 5) break;
        console.log(`  ${v.petitioner} | ${v.respondent}  <-  ${sourceUrl}`);
        shown++;
      }
      console.log(
        `\nremaining rows (High Court + unmatched SC) will use title_parsed against case_title already in Postgres.`,
      );
      console.log('\nDRY RUN — nothing written. Re-run with --confirm to apply.');
      return;
    }

    const sourceApplied = await applySourceMetadataPass(sql, scMap);
    console.log(`\nsource_metadata pass: ${sourceApplied} rows\n`);

    const titleApplied = await applyTitleParsedPass(sql);
    console.log(`\ntitle_parsed/unknown pass: ${titleApplied} rows\n`);

    const summary = await sql<{ method: string | null; n: string }[]>`
      SELECT parties_extraction_method::text AS method, count(*)::text AS n
        FROM judgments GROUP BY parties_extraction_method`;
    console.log('final distribution:', summary);
  } finally {
    await sql.end();
  }
}

await main();
