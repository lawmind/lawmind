/**
 * NEW2 — R9 §2. SUPREME COURT BULK RECONCILIATION against the AWS Open Data bucket.
 *
 * ## Why an object listing and not a count comparison
 *
 * `source-count-is-parquet-rows-not-documents` records that source minus held can
 * never reach zero on the High Court side, because parquet rows and documents are
 * different populations. The Supreme Court bucket does not have that problem: it
 * publishes ONE PDF PER JUDGMENT under `data/pdf/year=YYYY/english/<path>_EN.pdf`,
 * and `sci.ts:sourceUrlFor` builds `judgments.source_url` from exactly that key.
 *
 * So here — and only here — the upstream object key space and our stored identity
 * are the same space, and the reconciliation is an exact set difference rather
 * than an estimate. That is worth having: it is the only source where "do we hold
 * everything" has a yes/no answer.
 *
 * ## The one asymmetry, stated because it will otherwise look like a bug
 *
 * `sourceUrlFor` keys off the parquet row's OWN `year` column, not the partition
 * it was read from, because 694 of 1,804 rows across 1950-1960 appear in two
 * adjacent partitions. The bucket serves the PDF under both years. So an object
 * listed under `year=1951` may legitimately be held under a `year=1950` URL, and
 * counting a listing key as missing on that basis alone would overstate the gap.
 * Objects are therefore matched on their BASENAME as well as their full URL, and
 * the two figures are reported separately.
 *
 * Read-only against S3 and the database. Writes one artifact.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-sc-reconcile.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r9/sc-reconciliation.json';
const BUCKET = 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com';

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Obj = { key: string; size: number; lastModified: string };

async function listAll(prefix: string): Promise<Obj[]> {
  const out: Obj[] = [];
  let token: string | undefined;
  do {
    const url = `${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    let xml = '';
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'LawMind-sc-reconcile/1.0' } });
        if (!res.ok) throw new Error(`LIST ${prefix} -> ${res.status}`);
        xml = await res.text();
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    for (const block of xml.match(/<Contents>.*?<\/Contents>/gs) ?? []) {
      const key = /<Key>([^<]+)<\/Key>/.exec(block)?.[1];
      const size = /<Size>(\d+)<\/Size>/.exec(block)?.[1];
      const lm = /<LastModified>([^<]+)<\/LastModified>/.exec(block)?.[1] ?? '';
      if (key && size) out.push({ key, size: Number(size), lastModified: lm });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
      : undefined;
  } while (token);
  return out;
}

async function main() {
  const takenAt = new Date().toISOString();
  process.stderr.write('listing data/pdf/ ...\n');
  const objs = (await listAll('data/pdf/')).filter((o) => o.key.endsWith('.pdf'));
  const english = objs.filter((o) => /\/english\//.test(o.key));
  process.stderr.write(`upstream pdf objects: ${objs.length} (english ${english.length})\n`);

  let newestUpstreamWrite = '';
  for (const o of objs) if (o.lastModified > newestUpstreamWrite) newestUpstreamWrite = o.lastModified;

  const sql = postgres(databaseUrl(), { max: 2, prepare: false, idle_timeout: 20 });
  const held = await sql<{ source_url: string }[]>`
    SELECT source_url FROM judgments WHERE source_url LIKE ${'%indian-supreme-court-judgments%'}
  `;
  const heldUrls = new Set(held.map((r) => r.source_url));
  const heldBasenames = new Set(held.map((r) => r.source_url.split('/').pop()!));
  process.stderr.write(`held SC rows: ${held.length}\n`);

  const missingByUrl: Obj[] = [];
  const missingByBasename: Obj[] = [];
  const byYear: Record<string, { upstream: number; missing: number }> = {};
  for (const o of english) {
    const url = `${BUCKET}/${o.key}`;
    const base = o.key.split('/').pop()!;
    const y = /year=(\d{4})/.exec(o.key)?.[1] ?? 'unknown';
    byYear[y] ??= { upstream: 0, missing: 0 };
    byYear[y]!.upstream++;
    if (!heldUrls.has(url)) {
      missingByUrl.push(o);
      if (!heldBasenames.has(base)) {
        missingByBasename.push(o);
        byYear[y]!.missing++;
      }
    }
  }

  /** The reverse direction: rows we hold whose object is no longer upstream. */
  const upstreamUrls = new Set(english.map((o) => `${BUCKET}/${o.key}`));
  const heldNotUpstream = [...heldUrls].filter((u) => !upstreamUrls.has(u));

  const [dates] = await sql<{ newest: string | null; oldest: string | null }[]>`
    SELECT max(judgment_date)::text AS newest, min(judgment_date)::text AS oldest
    FROM judgments WHERE source_url LIKE ${'%indian-supreme-court-judgments%'}
  `;

  const report = {
    takenAt,
    bucket: BUCKET,
    upstream: {
      pdfObjects: objs.length,
      englishPdfObjects: english.length,
      newestUpstreamWrite,
      years: Object.keys(byYear).length,
    },
    local: { heldRows: held.length, newestLocalDecision: dates!.newest, oldestLocalDecision: dates!.oldest },
    gap: {
      missingByExactUrl: missingByUrl.length,
      missingAlsoByBasename: missingByBasename.length,
      note: 'A judgment listed under two adjacent year partitions is held under one URL only; the basename figure is the real gap.',
      heldButNotUpstream: heldNotUpstream.length,
    },
    byYear,
    missingSample: missingByBasename.slice(0, 40).map((o) => ({ key: o.key, size: o.size, lastModified: o.lastModified })),
    missingYearsToIngest: [
      ...new Set(missingByBasename.map((o) => /year=(\d{4})/.exec(o.key)?.[1]).filter(Boolean)),
    ].sort(),
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2));

  console.log(`upstream english PDFs   ${english.length.toLocaleString()}  (newest write ${newestUpstreamWrite})`);
  console.log(`held SC rows            ${held.length.toLocaleString()}  (${dates!.oldest} .. ${dates!.newest})`);
  console.log(`MISSING by exact url    ${missingByUrl.length.toLocaleString()}`);
  console.log(`MISSING by basename too ${missingByBasename.length.toLocaleString()}   <- the real gap`);
  console.log(`held but not upstream   ${heldNotUpstream.length.toLocaleString()}`);
  console.log(`years with a gap        ${report.missingYearsToIngest.join(', ') || '(none)'}`);
  const worst = Object.entries(byYear)
    .filter(([, v]) => v.missing > 0)
    .sort((a, b) => b[1].missing - a[1].missing)
    .slice(0, 15);
  for (const [y, v] of worst) console.log(`   ${y}  upstream ${String(v.upstream).padStart(5)}  missing ${String(v.missing).padStart(5)}`);
  console.log(`written: ${OUT}`);
  await sql.end();
}

await main();
