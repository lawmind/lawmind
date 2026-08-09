/**
 * `pnpm --filter @lawmind/ingest hc:count` — the survey `docs/CURRENT_PLAN.md`
 * §A3.1 asks for: **count the metadata per court per year before downloading
 * anything.** "15.9M" is a headline; this counts the working set.
 *
 * Everything here is read from parquet **footers** (one ranged HTTP request
 * each, no rows decoded) plus one single-row read per court for its name. The
 * survey moves a few MB, not gigabytes — counting a corpus must not become an
 * ingest of it.
 *
 * Writes `docs/HC_METADATA_SURVEY.json` for §A3.2's ingest ordering, and prints
 * the same numbers.
 */
import { writeFile } from 'node:fs/promises';

import {
  type MetadataVariant,
  courtName,
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  rowCount,
} from './hc-metadata.ts';

const CONCURRENCY = Number(process.env['HC_SURVEY_CONCURRENCY'] ?? '8');
const OUT_PATH = new URL('../../../../docs/HC_METADATA_SURVEY.json', import.meta.url);

console.log('HIGH COURT METADATA SURVEY — s3://indian-high-court-judgments');
console.log('='.repeat(74));

const t0 = Date.now();
const keys = await listMetadataKeys();
console.log(`listed ${keys.length} objects in ${Date.now() - t0} ms`);

type Row = {
  key: string;
  year: number;
  courtCode: string;
  bench: string;
  variant: MetadataVariant;
  rows: number;
};

const parsed: Array<{ key: string; p: NonNullable<ReturnType<typeof parsePartitions>> }> = [];
const unparseable: string[] = [];
for (const { key } of keys) {
  const p = parsePartitions(key);
  if (p) parsed.push({ key, p });
  else unparseable.push(key);
}
if (unparseable.length > 0) {
  // Loudly, not as a warning nobody reads: an unrecognised key is a layout the
  // survey does not understand, and every one of them is uncounted corpus.
  console.log(`UNPARSEABLE KEYS: ${unparseable.length} — these are NOT counted below`);
  for (const key of unparseable.slice(0, 10)) console.log(`  ${key}`);
}

console.log(`reading ${parsed.length} footers at concurrency ${CONCURRENCY} ...`);
const t1 = Date.now();
let done = 0;
const failures: Array<{ key: string; error: string }> = [];
const settled = await mapConcurrent(parsed, CONCURRENCY, async ({ key, p }) => {
  try {
    const rows = await rowCount(key);
    if (++done % 200 === 0) console.log(`  ... ${done}/${parsed.length}`);
    return { key, ...p, rows } satisfies Row;
  } catch (error) {
    // A failed file is recorded and reported, never silently treated as zero —
    // a zero would read as "this court published nothing that year".
    failures.push({ key, error: String((error as Error)?.message ?? error) });
    return null;
  }
});
const rows: Row[] = settled.filter((r): r is Row => r !== null);
console.log(`footers read in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
if (failures.length > 0) {
  console.log(`FAILED TO READ: ${failures.length} files — their rows are NOT in any total below`);
  for (const f of failures.slice(0, 10)) console.log(`  ${f.key}: ${f.error}`);
}

/* one representative row per court code, for the human-readable name */
const courtCodes = [...new Set(rows.map((r) => r.courtCode))].sort();
console.log(`resolving ${courtCodes.length} court names ...`);
const names = new Map<string, string>();
await mapConcurrent(courtCodes, CONCURRENCY, async (code) => {
  const sample = rows.find((r) => r.courtCode === code)!;
  try {
    names.set(code, await courtName(sample.key));
  } catch {
    names.set(code, `(name unread: ${code})`);
  }
});

const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.rows, 0);
const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
const currentYear = new Date().getFullYear();
const last10 = years.filter((y) => y >= currentYear - 10);
const inLast10 = (r: Row) => last10.includes(r.year);

const plain = rows.filter((r) => r.variant === 'plain');
const mobile = rows.filter((r) => r.variant === 'mobile');

console.log('');
console.log(
  `${rows.length} files read · ${courtCodes.length} courts · ${years[0]}–${years.at(-1)}`,
);
console.log('');
console.log('TOTAL DOCUMENTS, all years:');
console.log(`  plain  (metadata.parquet)         ${sum(plain).toLocaleString().padStart(12)}`);
console.log(`  mobile (metadata-mobile.parquet)  ${sum(mobile).toLocaleString().padStart(12)}`);
console.log(`  COMBINED                          ${sum(rows).toLocaleString().padStart(12)}`);
console.log('');
console.log(`TOTAL DOCUMENTS, last 10 years (${last10[0]}–${last10.at(-1)}):`);
console.log(
  `  plain                             ${sum(plain.filter(inLast10)).toLocaleString().padStart(12)}`,
);
console.log(
  `  mobile                            ${sum(mobile.filter(inLast10)).toLocaleString().padStart(12)}`,
);
console.log(
  `  COMBINED                          ${sum(rows.filter(inLast10)).toLocaleString().padStart(12)}`,
);

/* aggregate: court -> year -> count, and court totals */
const byCourt = new Map<string, Map<number, number>>();
for (const r of rows) {
  const perYear = byCourt.get(r.courtCode) ?? new Map<number, number>();
  perYear.set(r.year, (perYear.get(r.year) ?? 0) + r.rows);
  byCourt.set(r.courtCode, perYear);
}

const perCourt = courtCodes
  .map((code) => {
    const mine = rows.filter((r) => r.courtCode === code);
    return {
      code,
      name: names.get(code) ?? code,
      allYears: sum(mine),
      last10Years: sum(mine.filter(inLast10)),
      hasMobileVariant: mine.some((r) => r.variant === 'mobile'),
    };
  })
  .sort((a, b) => b.last10Years - a.last10Years);

console.log('');
console.log('PER COURT — last 10 years, descending. `*` publishes the mobile variant:');
for (const c of perCourt) {
  console.log(
    `  ${c.last10Years.toLocaleString().padStart(10)}  ${c.hasMobileVariant ? '*' : ' '} ${c.name} (${c.code})`,
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  bucket: 's3://indian-high-court-judgments',
  method:
    'parquet footers only (parquetMetadataAsync) — no rows decoded except one per court for its name',
  objectsListed: keys.length,
  filesRead: rows.length,
  unparseableKeys: unparseable,
  failedReads: failures,
  courts: courtCodes.length,
  yearRange: [years[0], years.at(-1)],
  totals: {
    allYears: { plain: sum(plain), mobile: sum(mobile), combined: sum(rows) },
    last10Years: {
      range: [last10[0], last10.at(-1)],
      plain: sum(plain.filter(inLast10)),
      mobile: sum(mobile.filter(inLast10)),
      combined: sum(rows.filter(inLast10)),
    },
  },
  perCourt,
  perCourtPerYear: Object.fromEntries(
    courtCodes.map((code) => [
      names.get(code) ?? code,
      Object.fromEntries([...(byCourt.get(code) ?? new Map())].sort(([a], [b]) => a - b)),
    ]),
  ),
};

await writeFile(OUT_PATH, JSON.stringify(report, null, 2));
console.log('');
console.log(`written: docs/HC_METADATA_SURVEY.json`);
