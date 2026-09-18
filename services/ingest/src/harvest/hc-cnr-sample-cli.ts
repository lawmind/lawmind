/**
 * SAMPLED estimate of source-side CNR duplication/multiplicity across the HC
 * bucket — `docs/ai/HC_CORPUS_CHARACTERIZATION.md` §8/§9. Not a full scan:
 * the bucket is 1,493 files / ~20.5M rows, and reading a full column across
 * all of them is the "expensive full-row deduplication" the founder's
 * directive explicitly says to characterize BEFORE running, not as the
 * first move. This reads the `cnr` column (not the footer) from a bounded,
 * named sample of files and reports the ratio honestly as SAMPLED.
 *
 *   pnpm --filter @lawmind/ingest tsx src/harvest/hc-cnr-sample-cli.ts
 *
 * Sample: the 6 highest-volume plain-variant courts (3 years each: earliest,
 * middle, most recent, from `docs/HC_METADATA_SURVEY.json`) plus the 4
 * mobile-variant-publishing courts (2 years each: most recent two). One
 * bench file per (court, year) — the first listed — to bound the request
 * count. This is a SAMPLE, not a census; it estimates a ratio, not a total.
 */
import { readFileSync } from 'node:fs';

import { HC_BUCKET, listMetadataKeys, mapConcurrent, withRetry } from './hc-metadata.ts';
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

const SURVEY_PATH = new URL('../../../../docs/HC_METADATA_SURVEY.json', import.meta.url);
const survey = JSON.parse(readFileSync(SURVEY_PATH, 'utf8')) as {
  perCourt: { code: string; name: string; last10Years: number; hasMobileVariant: boolean }[];
  perCourtPerYear: Record<string, Record<string, number>>;
};

const PLAIN_SAMPLE_COURTS = ['9_13', '27_1', '33_10', '3_22', '10_8', '8_9'];
const MOBILE_SAMPLE_COURTS = ['27_1', '9_13', '23_23', '2_5'];

function yearsFor(code: string): number[] {
  const entry = survey.perCourt.find((c) => c.code === code);
  if (!entry) throw new Error(`court ${code} not found in survey`);
  const years = Object.keys(survey.perCourtPerYear[entry.name] ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  return years;
}

type Target = { court: string; year: number; variant: 'plain' | 'mobile' };

const targets: Target[] = [];
for (const code of PLAIN_SAMPLE_COURTS) {
  const years = yearsFor(code);
  const picks = new Set([years[0]!, years[Math.floor(years.length / 2)]!, years.at(-1)!]);
  for (const year of picks) targets.push({ court: code, year, variant: 'plain' });
}
for (const code of MOBILE_SAMPLE_COURTS) {
  const years = yearsFor(code);
  const picks = new Set([years.at(-1)!, years.at(-2)!].filter((y): y is number => y !== undefined));
  for (const year of picks) targets.push({ court: code, year, variant: 'mobile' });
}

console.log('HC CNR SAMPLE — source-side duplication/multiplicity estimate');
console.log('='.repeat(74));
console.log(`${targets.length} (court, year, variant) targets, one bench file each\n`);

type Result = {
  court: string;
  year: number;
  variant: 'plain' | 'mobile';
  key: string | null;
  rows: number;
  distinctCnr: number;
  nullCnr: number;
  error?: string;
};

const results = await mapConcurrent(targets, 4, async (t): Promise<Result> => {
  const prefix = `metadata/parquet/year=${t.year}/court=${t.court}/`;
  try {
    const keys = await listMetadataKeys(prefix);
    const suffix = t.variant === 'mobile' ? 'metadata-mobile.parquet' : 'metadata.parquet';
    const match = keys.find((k) => k.key.endsWith(suffix));
    if (!match) {
      return {
        court: t.court,
        year: t.year,
        variant: t.variant,
        key: null,
        rows: 0,
        distinctCnr: 0,
        nullCnr: 0,
        error: 'no file for this variant',
      };
    }
    const rows = await withRetry(async () => {
      const file = await asyncBufferFromUrl({ url: `${HC_BUCKET}/${match.key}` });
      return (await parquetReadObjects({ file, columns: ['cnr'] })) as Array<{
        cnr?: string | null;
      }>;
    });
    const cnrs = rows.map((r) => r.cnr).filter((c): c is string => !!c);
    return {
      court: t.court,
      year: t.year,
      variant: t.variant,
      key: match.key,
      rows: rows.length,
      distinctCnr: new Set(cnrs).size,
      nullCnr: rows.length - cnrs.length,
    };
  } catch (error) {
    return {
      court: t.court,
      year: t.year,
      variant: t.variant,
      key: null,
      rows: 0,
      distinctCnr: 0,
      nullCnr: 0,
      error: String((error as Error)?.message ?? error),
    };
  }
});

console.log('PER FILE:');
for (const r of results) {
  if (r.error) {
    console.log(`  ${r.court} ${r.year} ${r.variant.padEnd(6)} ERROR: ${r.error}`);
    continue;
  }
  const ratio = r.rows > 0 ? r.distinctCnr / r.rows : 0;
  console.log(
    `  ${r.court} ${r.year} ${r.variant.padEnd(6)} rows=${r.rows.toString().padStart(7)}  distinct_cnr=${r.distinctCnr.toString().padStart(7)}  null_cnr=${r.nullCnr.toString().padStart(6)}  distinct/rows=${(ratio * 100).toFixed(1)}%`,
  );
}

function summarize(variant: 'plain' | 'mobile') {
  const rs = results.filter((r) => r.variant === variant && !r.error);
  const rows = rs.reduce((s, r) => s + r.rows, 0);
  const distinct = rs.reduce((s, r) => s + r.distinctCnr, 0);
  const nullCnr = rs.reduce((s, r) => s + r.nullCnr, 0);
  console.log('');
  console.log(
    `${variant.toUpperCase()} SAMPLE SUMMARY (within-file distinct/rows, summed across ${rs.length} files):`,
  );
  console.log(`  total sampled rows:      ${rows.toLocaleString()}`);
  console.log(`  sum of per-file distinct_cnr: ${distinct.toLocaleString()}`);
  console.log(
    `  null cnr:                ${nullCnr.toLocaleString()} (${rows > 0 ? ((nullCnr / rows) * 100).toFixed(1) : '0.0'}%)`,
  );
  console.log(
    `  average within-file distinct/rows ratio: ${rows > 0 ? ((distinct / rows) * 100).toFixed(1) : '0.0'}%`,
  );
}
summarize('plain');
summarize('mobile');

console.log('');
console.log('SAMPLED, NOT MEASURED CORPUS-WIDE. This checks within-file CNR');
console.log('multiplicity only (one row per order under a case is not a duplicate —');
console.log('it is the documented mobile-variant shape). It does NOT check cross-file');
console.log('(cross-year or cross-court) CNR collision — that would need cnr values');
console.log('held in memory across the full 1,493-file sweep, which this script');
console.log('deliberately does not attempt.');
