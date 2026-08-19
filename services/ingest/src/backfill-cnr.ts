/**
 * Back-fill `judgments.cnr` for the 79,321 rows ingested before migration
 * `0034` — `docs/ai/tasks/007-cnr-backfill-investigation.md`,
 * `docs/ai/DATA_MOAT_PROGRAM.md` §7 item 2.
 *
 *   pnpm --filter @lawmind/ingest run backfill:cnr [--confirm]
 *
 * Re-reads the SAME AWS Open Data metadata files the original ingest read —
 * no live court website, no rate limit, the same public CC-BY-4.0 bucket.
 * Task 007 proved this works: Supreme Court year=1950 (100% cnr coverage,
 * 43/43 rows) and a real Patna High Court partition (100%, 123,106/123,106
 * rows) both matched a held row by exact computed `source_url`.
 *
 * **Matches by the SAME url-construction functions the real loaders use —
 * `sourceUrlFor` (`sci.ts`) and `pdfUrlFor` (`harvest/hc-metadata.ts`) —
 * never a second implementation that could drift from what actually
 * produced the stored `source_url` in the first place.**
 *
 * Never guesses: a blank `cnr` in the source is skipped; a computed url with
 * no matching row is skipped; if a url is reachable from more than one
 * metadata row with disagreeing `cnr` values (the plain/mobile variants
 * share zero CNRs per `HC_CORPUS_SURVEY.md`, so this should not happen, but
 * is checked rather than assumed), the whole url is skipped rather than
 * picking one.
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

type UrlCnr = { url: string; cnr: string };

/** One url -> cnr, or null on a genuine conflict (skip rather than guess). */
function buildMap(pairs: UrlCnr[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const { url, cnr } of pairs) {
    if (!map.has(url)) {
      map.set(url, cnr);
    } else if (map.get(url) !== cnr) {
      map.set(url, null); // conflicting cnr values for the same computed url
    }
  }
  return map;
}

async function scMappings(years: number[]): Promise<Map<string, string>> {
  const pairs: UrlCnr[] = [];
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
      if (blank(row.cnr)) continue;
      pairs.push({ url: sourceUrlFor(row), cnr: row.cnr.trim() });
    }
    console.log(`  SC year=${year}: ${rows.length} rows read`);
  }
  const map = buildMap(pairs);
  const clean = new Map<string, string>();
  for (const [url, cnr] of map) if (cnr) clean.set(url, cnr);
  return clean;
}

async function hcMappings(
  partitions: { year: number; courtCode: string; bench: string }[],
): Promise<Map<string, string>> {
  const pairs: UrlCnr[] = [];
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
        const rows = (await parquetReadObjects({ file, columns: ['cnr', 'pdf_link'] })) as Array<{
          cnr?: string;
          pdf_link?: string;
        }>;
        for (const row of rows) {
          if (blank(row.cnr) || blank(row.pdf_link)) continue;
          pairs.push({ url: pdfUrlFor(p, row.pdf_link!), cnr: row.cnr!.trim() });
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
  for (const [url, cnr] of map) if (cnr) clean.set(url, cnr);
  return clean;
}

async function distinctScYears(sql: Sql): Promise<number[]> {
  const rows = await sql<{ year: string }[]>`
    SELECT DISTINCT substring(source_url from 'year=([0-9]+)') AS year
      FROM judgments WHERE court = 'Supreme Court of India' AND cnr IS NULL
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
      FROM judgments WHERE court != 'Supreme Court of India' AND cnr IS NULL`;
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
    console.log(`HC partitions to check: ${partitions.length}`);
    console.log('');

    console.log('Reading Supreme Court metadata...');
    const scMap = await scMappings(years);
    console.log(`SC: ${scMap.size} url->cnr pairs recovered\n`);

    console.log('Reading High Court metadata...');
    const hcMap = await hcMappings(partitions);
    console.log(`HC: ${hcMap.size} url->cnr pairs recovered\n`);

    const allPairs = new Map([...scMap, ...hcMap]);

    if (!confirmed) {
      console.log('sample matches — verify before trusting the run:');
      let shown = 0;
      for (const [sourceUrl, cnr] of allPairs) {
        if (shown >= 8) break;
        console.log(`  ${cnr}  <-  ${sourceUrl}`);
        shown++;
      }
      console.log(`\ntotal recoverable cnr values: ${allPairs.size}`);
      console.log('\nDRY RUN — nothing written. Re-run with --confirm to apply.');
      return;
    }

    let updated = 0;
    const entries = [...allPairs.entries()];
    const BATCH = 200;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      await Promise.all(
        batch.map(([sourceUrl, cnr]) => sql`
          UPDATE judgments SET cnr = ${cnr}
           WHERE source_url = ${sourceUrl} AND cnr IS NULL`),
      );
      updated += batch.length;
      console.log(`  applied ${updated}/${entries.length}...`);
    }

    const [after] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgments WHERE cnr IS NOT NULL`;
    console.log(`\njudgments.cnr now populated on ${after?.n} rows`);
  } finally {
    await sql.end();
  }
}

await main();
