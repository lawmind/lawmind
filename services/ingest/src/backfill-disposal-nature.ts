/**
 * Back-fill `judgments.disposal_nature` for the 79,322 rows ingested before
 * migration `0038` — `docs/ai/LEGAL_STRUCTURE.md`, Stage 5.
 *
 *   pnpm --filter @lawmind/ingest run backfill:disposal-nature [--confirm]
 *
 * Re-reads the SAME AWS Open Data metadata files the original ingest read —
 * no live court site, no rate limit — exactly `backfill-cnr.ts`'s approach,
 * for both Supreme Court and High Court. `disposal_nature` is present on
 * BOTH source schemas and was read by neither mapper before this migration.
 *
 * Never classifies. Writes the source's own string verbatim or nothing.
 */
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';
import postgres, { type Sql } from 'postgres';

import {
  HC_BUCKET,
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  withRetry,
} from './harvest/hc-metadata.ts';
import { metadataUrl, sourceUrlFor, type SciMetadataRow } from './sci.ts';
import { sslFor } from './db-ssl';

const blank = (v: string | null | undefined): boolean => !v || v.trim() === '';

type UrlValue = { url: string; value: string };

function buildMap(pairs: UrlValue[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const { url, value } of pairs) {
    if (!map.has(url)) map.set(url, value);
    else if (map.get(url) !== value) map.set(url, null); // conflicting values, skip
  }
  return map;
}

async function scMappings(years: number[]): Promise<Map<string, string>> {
  const pairs: UrlValue[] = [];
  for (const year of years) {
    const url = metadataUrl(year);
    let rows: SciMetadataRow[];
    try {
      const file = await withRetry(() => asyncBufferFromUrl({ url }));
      rows = (await parquetReadObjects({ file })) as SciMetadataRow[];
    } catch (error) {
      console.log(`  SC year=${year}: SKIPPED (${(error as Error).message})`);
      continue;
    }
    for (const row of rows) {
      if (blank(row.disposal_nature)) continue;
      pairs.push({ url: sourceUrlFor(row), value: row.disposal_nature.trim() });
    }
    console.log(`  SC year=${year}: ${rows.length} rows read`);
  }
  const map = buildMap(pairs);
  const clean = new Map<string, string>();
  for (const [url, v] of map) if (v) clean.set(url, v);
  return clean;
}

async function hcMappings(
  partitions: { year: number; courtCode: string; bench: string }[],
): Promise<Map<string, string>> {
  const pairs: UrlValue[] = [];
  let done = 0;

  await mapConcurrent(partitions, 6, async (p) => {
    const keys = await listMetadataKeys(
      `metadata/parquet/year=${p.year}/court=${p.courtCode}/bench=${p.bench}/`,
    );
    for (const k of keys) {
      const parsed = parsePartitions(k.key);
      if (!parsed) continue;
      try {
        const file = await withRetry(() => asyncBufferFromUrl({ url: `${HC_BUCKET}/${k.key}` }));
        const rows = (await parquetReadObjects({
          file,
          columns: ['disposal_nature', 'pdf_link'],
        })) as Array<{
          disposal_nature?: string;
          pdf_link?: string;
        }>;
        for (const row of rows) {
          if (blank(row.disposal_nature) || blank(row.pdf_link)) continue;
          pairs.push({ url: pdfUrlFor(p, row.pdf_link!), value: row.disposal_nature!.trim() });
        }
      } catch (error) {
        console.log(`  HC ${k.key}: SKIPPED (${(error as Error).message})`);
      }
    }
    done++;
    if (done % 20 === 0) console.log(`  HC partitions read: ${done}/${partitions.length}`);
  });

  const map = buildMap(pairs);
  const clean = new Map<string, string>();
  for (const [url, v] of map) if (v) clean.set(url, v);
  return clean;
}

async function distinctScYears(sql: Sql): Promise<number[]> {
  const rows = await sql<{ year: string }[]>`
    SELECT DISTINCT substring(source_url from 'year=([0-9]+)') AS year
      FROM judgments WHERE court = 'Supreme Court of India' AND disposal_nature IS NULL
     ORDER BY 1`;
  return rows.map((r) => Number(r.year)).filter((y) => Number.isFinite(y));
}

async function distinctHcPartitions(
  sql: Sql,
): Promise<{ year: number; courtCode: string; bench: string }[]> {
  const rows = await sql<{ year: string; court_code: string; bench: string }[]>`
    SELECT DISTINCT substring(source_url from 'year=([0-9]+)') AS year,
           substring(source_url from 'court=([^/]+)') AS court_code,
           substring(source_url from 'bench=([^/]+)') AS bench
      FROM judgments WHERE court != 'Supreme Court of India' AND disposal_nature IS NULL`;
  return rows
    .filter((r) => r.year && r.court_code && r.bench)
    .map((r) => ({ year: Number(r.year), courtCode: r.court_code, bench: r.bench }));
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 10, ssl: sslFor(url) });
  const confirmed = process.argv.includes('--confirm');

  try {
    const years = await distinctScYears(sql);
    const partitions = await distinctHcPartitions(sql);
    console.log(`SC years to check: ${years.length}`);
    console.log(`HC partitions to check: ${partitions.length}\n`);

    console.log('Reading Supreme Court metadata...');
    const scMap = await scMappings(years);
    console.log(`SC: ${scMap.size} url->disposal_nature pairs recovered\n`);

    console.log('Reading High Court metadata...');
    const hcMap = await hcMappings(partitions);
    console.log(`HC: ${hcMap.size} url->disposal_nature pairs recovered\n`);

    const allPairs = new Map([...scMap, ...hcMap]);

    if (!confirmed) {
      console.log('sample matches:');
      let shown = 0;
      for (const [sourceUrl, value] of allPairs) {
        if (shown >= 8) break;
        console.log(`  ${value}  <-  ${sourceUrl}`);
        shown++;
      }
      console.log(`\ntotal recoverable disposal_nature values: ${allPairs.size}`);
      console.log('\nDRY RUN — nothing written. Re-run with --confirm to apply.');
      return;
    }

    let updated = 0;
    const entries = [...allPairs.entries()];
    const BATCH = 200;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      await Promise.all(
        batch.map(
          ([sourceUrl, value]) => sql`
          UPDATE judgments SET disposal_nature = ${value}
           WHERE source_url = ${sourceUrl} AND disposal_nature IS NULL`,
        ),
      );
      updated += batch.length;
      console.log(`  applied ${updated}/${entries.length}...`);
    }

    const [after] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgments WHERE disposal_nature IS NOT NULL`;
    console.log(`\njudgments.disposal_nature now populated on ${after?.n} rows`);
  } finally {
    await sql.end();
  }
}

await main();
