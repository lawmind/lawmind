/**
 * NEW2 — R10 §1. THE UPSTREAM SIDE OF THE PARITY MATRIX, read from the bucket.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR, AND WHY IT IS NOT THE EXISTING MANIFEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `n2-upstream-manifest.mts` answers *"which OBJECTS moved"* — key, size, ETag.
 * That is the delta trigger and it is deliberately blind to rows: bytes are not
 * records, and `source-count-is-parquet-rows-not-documents` is the standing
 * correction on conflating them.
 *
 * This answers the different question the parity matrix needs: **which RECORDS
 * does the publisher assert exist, and under what identity.** It opens every
 * metadata partition in the High Court bucket and reads three columns —
 * `decision_date`, `pdf_link`, `cnr` — for every row, of every partition, of
 * every year. Nothing is sampled and nothing is inferred from a census.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDENTITY IS `pdfUrlFor`, NOT `pdf_link`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `pdf_link` is a path on the plain variant and a bare filename on the mobile
 * variant of the SAME partition, so it is not comparable across variants and is
 * not what ingest stores. `harvest/hc-metadata.ts:pdfUrlFor` takes the partition
 * (year, court, bench) plus the BASENAME and produces the object URL — and that
 * URL is exactly what lands in `judgments.source_url` and in
 * `hc_ingest_ledger.source_url`. Reproducing that construction here is what makes
 * the two sides of the parity join the same key rather than two similar strings.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO DENOMINATORS, DELIBERATELY, BECAUSE ONE OF THEM HAS LIED BEFORE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A partition publishes its rows twice under two naming forms. Court 23_23 shows
 * 3,587 parquet rows against 109 held, which reads as 3% coverage — and is 100%:
 * the bucket holds exactly 109 PDF objects, and the other 3,477 rows are metadata
 * whose `pdf_link` names an object the publisher never uploaded.
 * (`two-parquet-variants-per-partition`, `source-count-is-parquet-rows-not-documents`.)
 *
 * So this emits BOTH, per court and month, and never collapses them:
 *
 *   objectRecords — distinct `pdfUrlFor` URLs. The accounting denominator. Every
 *                   one of these is either held, or terminal in the ledger, or an
 *                   open gap. This is what `accounted_upstream %` divides by.
 *   caseRecords   — distinct non-blank `cnr`. The upstream-side dedup the founder
 *                   asked for: the publisher's own case identity, which collapses
 *                   the two naming forms back onto one case.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDED WINDOWS, AND FIXTURES EXCLUDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every read is an explicit window over the file's own `num_rows`. An unbounded
 * read here returned the right row COUNT and the wrong ROWS with no error
 * (`unbounded-parquet-read-returns-wrong-rows`), and `raw_html` — 73% of the
 * Allahabad file and never read — is excluded by projection.
 *
 * `bench=testcase` is excluded: it is the fixture partition `isTestFixture`
 * refuses at ingest, and leaving it in has already produced one false 94-day
 * coverage gap on the largest court in the corpus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DURABILITY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One line of `progress.jsonl` per COMPLETED partition, and one gzipped record
 * file per partition, written before the next partition starts. A restart skips
 * what is already recorded. `long-jobs-must-checkpoint-their-artifact`: 160 of
 * 283 queries were lost once to a teardown because the write was at the end.
 *
 * Network only. Writes no database. Writes to a scratch tree, not the repo.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-hc-upstream-walk.mts --out <dir> [--year YYYY]
 */
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import {
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
} from '../services/ingest/node_modules/hyparquet/src/index.js';

const HC = 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com';
const WINDOW = 100_000;

function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const OUT = arg('out') ?? '.tmp-new2/upstream';
const ONLY_YEAR = arg('year');
const ONLY_COURTS = new Set((arg('court', '') ?? '').split(',').filter(Boolean));
const REFRESH = process.argv.includes('--refresh');
mkdirSync(join(OUT, 'partitions'), { recursive: true });
const PROGRESS = join(OUT, 'progress.jsonl');

type S3Obj = { key: string; size: number; etag: string; lastModified: string };

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 4) throw new Error(`${label}: ${(e as Error).message}`, { cause: e });
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
}

async function listAll(prefix: string): Promise<S3Obj[]> {
  const out: S3Obj[] = [];
  let token: string | undefined;
  do {
    const url = `${HC}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const xml = await withRetry(async () => {
      const res = await fetch(url, { headers: { 'User-Agent': 'LawMind-parity/1.0' } });
      if (!res.ok) throw new Error(`LIST -> ${res.status}`);
      return res.text();
    }, `list ${prefix}`);
    for (const b of xml.match(/<Contents>.*?<\/Contents>/gs) ?? []) {
      const key = /<Key>([^<]+)<\/Key>/.exec(b)?.[1];
      const size = Number(/<Size>(\d+)<\/Size>/.exec(b)?.[1] ?? 0);
      const etag = (/<ETag>([^<]+)<\/ETag>/.exec(b)?.[1] ?? '').replace(/&quot;|"/g, '');
      const lm = /<LastModified>([^<]+)<\/LastModified>/.exec(b)?.[1] ?? '';
      if (key?.endsWith('.parquet')) out.push({ key, size, etag, lastModified: lm });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
      : undefined;
  } while (token);
  return out;
}

/** `metadata/parquet/year=2026/court=16_20/bench=thcnc/metadata.parquet` */
function partsOf(key: string): { year: number; courtCode: string; bench: string; variant: string } | null {
  const m = /year=(\d+)\/court=([^/]+)\/bench=([^/]+)\/([^/]+)\.parquet$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), courtCode: m[2]!, bench: m[3]!, variant: m[4]! };
}

/** The one construction that must match ingest. See harvest/hc-metadata.ts. */
function pdfUrlFor(p: { year: number; courtCode: string; bench: string }, pdfLink: string): string {
  const base = pdfLink.split('/').pop() ?? pdfLink;
  return `${HC}/data/pdf/year=${p.year}/court=${p.courtCode}/bench=${p.bench}/${base}`;
}

function monthOf(v: unknown): string {
  if (v == null) return 'null';
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  const s = String(v);
  const iso = /^(\d{4})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (dmy) return `${dmy[3]}-${dmy[2]}`;
  return 'unparsed';
}

const done = new Set<string>();
if (existsSync(PROGRESS)) {
  const retained: string[] = [];
  for (const line of readFileSync(PROGRESS, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as { key?: string; error?: string };
      const parts = o.key ? partsOf(o.key) : null;
      const refreshThis = REFRESH && parts !== null &&
        (ONLY_COURTS.size === 0 || ONLY_COURTS.has(parts.courtCode)) &&
        (!ONLY_YEAR || parts.year === Number(ONLY_YEAR));
      if (!refreshThis) {
        retained.push(line);
        if (o.key && !o.error) done.add(o.key);
      }
    } catch {
      /* a torn final line is re-walked, which is idempotent */
    }
  }
  if (REFRESH) writeFileSync(PROGRESS, retained.length ? `${retained.join('\n')}\n` : '');
}

const all = (await listAll('metadata/parquet/')).filter((o) => !/\/bench=testcase\//.test(o.key));
const targets = all.filter((o) => {
  const parts = partsOf(o.key);
  if (!parts) return false;
  if (ONLY_YEAR && parts.year !== Number(ONLY_YEAR)) return false;
  if (ONLY_COURTS.size > 0 && !ONLY_COURTS.has(parts.courtCode)) return false;
  return true;
});
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(all));
console.log(`[walk] ${targets.length} partitions in scope, ${done.size} already done`);

let n = 0;
let rowsTotal = 0;
const startedAt = Date.now();
for (const obj of targets) {
  n++;
  if (done.has(obj.key)) continue;
  const p = partsOf(obj.key);
  if (!p) {
    appendFileSync(PROGRESS, JSON.stringify({ key: obj.key, skipped: 'UNPARSEABLE_KEY' }) + '\n');
    continue;
  }
  const safe = obj.key.replace(/[^A-Za-z0-9=._-]/g, '_');
  const recFile = join(OUT, 'partitions', `${safe}.ndjson.gz`);

  let numRows = 0;
  let written = 0;
  const months = new Map<string, { obj: Set<string>; cnr: Set<string>; rows: number }>();
  const t0 = Date.now();
  try {
    const file = await withRetry(() => asyncBufferFromUrl({ url: `${HC}/${obj.key}` }), `meta ${obj.key}`);
    const md = await withRetry(() => parquetMetadataAsync(file), `md ${obj.key}`);
    numRows = Number(md.num_rows);

    const gz = createGzip();
    const sink = createWriteStream(recFile);
    const pump = pipeline(gz, sink);

    for (let start = 0; start < numRows; start += WINDOW) {
      const end = Math.min(start + WINDOW, numRows);
      const rows = (await withRetry(
        () =>
          parquetReadObjects({
            file,
            columns: ['decision_date', 'pdf_link', 'cnr'],
            rowStart: start,
            rowEnd: end,
          }),
        `read ${obj.key} [${start},${end})`,
      )) as Array<{ decision_date?: unknown; pdf_link?: string; cnr?: string }>;
      let chunk = '';
      for (const r of rows) {
        const link = (r.pdf_link ?? '').trim();
        const month = monthOf(r.decision_date);
        const cnr = (r.cnr ?? '').trim();
        const url = link ? pdfUrlFor(p, link) : '';
        let m = months.get(month);
        if (!m) months.set(month, (m = { obj: new Set(), cnr: new Set(), rows: 0 }));
        m.rows++;
        if (url) m.obj.add(url);
        if (cnr) m.cnr.add(cnr);
        chunk += JSON.stringify({ b: link ? (link.split('/').pop() ?? link) : null, m: month, c: cnr || null }) + '\n';
        written++;
      }
      if (!gz.write(chunk)) await new Promise((r) => gz.once('drain', r));
    }
    gz.end();
    await pump;
  } catch (e) {
    appendFileSync(
      PROGRESS,
      JSON.stringify({ key: obj.key, error: (e as Error).message, at: new Date().toISOString() }) + '\n',
    );
    console.log(`[walk] ${n}/${targets.length} ERROR ${obj.key} :: ${(e as Error).message}`);
    continue;
  }

  rowsTotal += written;
  appendFileSync(
    PROGRESS,
    JSON.stringify({
      key: obj.key,
      size: obj.size,
      etag: obj.etag,
      lastModified: obj.lastModified,
      year: p.year,
      courtCode: p.courtCode,
      bench: p.bench,
      variant: p.variant,
      numRows,
      rowsWritten: written,
      months: Object.fromEntries([...months].map(([k, v]) => [k, { rows: v.rows, objects: v.obj.size, cases: v.cnr.size }])),
      ms: Date.now() - t0,
      at: new Date().toISOString(),
    }) + '\n',
  );
  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(
    `[walk] ${n}/${targets.length} ${p.year} ${p.courtCode}/${p.bench}/${p.variant} rows=${numRows} ${((Date.now() - t0) / 1000).toFixed(1)}s  (total ${rowsTotal} rows in ${elapsed.toFixed(0)}s)`,
  );
}
console.log(`[walk] DONE ${n} partitions, ${rowsTotal} rows written, ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
