/**
 * NEW2 — R9 §6. THE SOURCE LEDGER. One row per source, six columns, no framework.
 *
 *   source | newest upstream item | newest local item | local lag | last successful
 *   ingest | next checkpoint
 *
 * The founder's instruction is "a simple source ledger, not another large
 * framework", and this is deliberately the smallest thing that answers *is
 * LawMind stale today* every day.
 *
 * ## The two corrections it carries, both earned the hard way
 *
 * **1. Currency is a completeness ratio, never a `max()`.** R8.1 measured the
 * corpus as 8 days behind by reading `max(judgment_date)`. It was 56 — August 2026
 * held 480 documents against a 117,332/month baseline, and a month with one row in
 * it has a newest date. So the ledger reports BOTH: the naive frontier and the
 * honest one, and never the naive one alone.
 *
 * **2. Newest upstream is a probe, not a cadence.** R8.1 left `newest item at
 * source` as `NOT_MEASURED` and reasoned that bulk dumps are periodic. The bucket
 * writes DAILY (`aws-open-data-bucket-is-static`). This reads S3 `LastModified`
 * rather than believing a registry.
 *
 * Read-only. Writes one artifact and prints the table.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-source-ledger.mts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r9/source-ledger.json';

const SOURCES = [
  {
    id: 'aws_open_data_hc',
    label: 'AWS Open Data — Indian High Court judgments',
    host: 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com',
    urlMatch: '%indian-high-court-judgments%',
    adapter: 'services/ingest/src/harvest/hc-load-cli.ts',
    authorization: { state: 'AUTHORIZED', basis: 'AWS Open Data, CC-BY-4.0; no copyright in a judgment (Copyright Act s.52(1)(q)(iv))', expires: null },
  },
  {
    id: 'aws_open_data_sc',
    label: 'AWS Open Data — Indian Supreme Court judgments',
    host: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com',
    urlMatch: '%indian-supreme-court-judgments%',
    adapter: 'services/ingest/src/sci.ts',
    authorization: { state: 'AUTHORIZED', basis: 'AWS Open Data, CC-BY-4.0', expires: null },
  },
] as const;

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** Newest `LastModified` anywhere under the bucket's metadata tree. One listing, no parquet read. */
async function newestUpstreamWrite(host: string): Promise<string | null> {
  let token: string | undefined;
  let newest: string | null = null;
  do {
    const url = `${host}/?list-type=2&prefix=metadata%2Fparquet%2F&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'LawMind-ledger/1.0' } });
    if (!res.ok) return null;
    const xml = await res.text();
    for (const m of xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)) {
      if (newest == null || m[1]! > newest) newest = m[1]!;
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
      : undefined;
  } while (token);
  return newest;
}

function adapterHash(rel: string): string {
  try {
    return createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex').slice(0, 16);
  } catch {
    return 'MISSING';
  }
}

/** Newest write to any ingest checkpoint owned by this source. A file mtime, not a claim. */
function newestCheckpointWrite(): string | null {
  const dir = join(ROOT, 'services/ingest/.checkpoints');
  let newest: number | null = null;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const t = statSync(join(dir, f)).mtimeMs;
    if (newest == null || t > newest) newest = t;
  }
  return newest == null ? null : new Date(newest).toISOString();
}

async function main() {
  const sql = postgres(databaseUrl(), { max: 2, prepare: false, idle_timeout: 20 });
  const takenAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const s of SOURCES) {
    const [held] = await sql<{ n: string; newest: string | null; lastIngest: string | null }[]>`
      SELECT count(*)::text          AS n,
             max(judgment_date)::text AS newest,
             max(created_at)::text    AS "lastIngest"
      FROM judgments
      WHERE source_url LIKE ${s.urlMatch}
    `;

    /**
     * Documents per month for the trailing year. The completeness ratio uses a
     * baseline of SETTLED months — the six before the two most recent — because a
     * baseline that includes the partial month it is judging lowers itself toward
     * exactly what it exists to catch.
     */
    const months = await sql<{ month: string; n: string }[]>`
      SELECT to_char(date_trunc('month', judgment_date), 'YYYY-MM') AS month,
             count(*)::text AS n
      FROM judgments
      WHERE source_url LIKE ${s.urlMatch}
        AND judgment_date >= (current_date - interval '18 months')
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 14
    `;
    const series = months.map((m) => ({ month: m.month, documents: Number(m.n) }));
    const settled = series.slice(2, 8);
    const baseline = settled.length ? Math.round(settled.reduce((a, b) => a + b.documents, 0) / settled.length) : 0;
    const withState = series.map((m) => ({
      ...m,
      shareOfBaseline: baseline ? Number((m.documents / baseline).toFixed(4)) : null,
      state:
        baseline === 0
          ? 'NO_BASELINE'
          : m.documents / baseline >= 0.6
            ? 'COMPLETE_ENOUGH'
            : m.documents / baseline >= 0.1
              ? 'PARTIAL'
              : 'EFFECTIVELY_ABSENT',
    }));
    /** The honest frontier: the newest month that is actually present, not the newest row. */
    const honest = withState.find((m) => m.state === 'COMPLETE_ENOUGH');
    const honestFrontier = honest ? `${honest.month}-01` : null;
    const today = new Date(takenAt.slice(0, 10));
    const naiveLagDays = held!.newest ? Math.round((+today - +new Date(held!.newest)) / 86_400_000) : null;
    const honestLagDays = honestFrontier
      ? Math.round((+today - +new Date(honestFrontier)) / 86_400_000)
      : null;

    const upstream = await newestUpstreamWrite(s.host);

    rows.push({
      source: s.id,
      label: s.label,
      authorization: s.authorization,
      adapter: s.adapter,
      adapterSha256: adapterHash(s.adapter),
      newestUpstreamWrite: upstream ?? 'UNREACHABLE',
      heldDocuments: Number(held!.n),
      newestLocalDecision: held!.newest,
      naiveLagDays,
      honestCurrencyFrontier: honestFrontier,
      honestLagDays,
      lastSuccessfulIngest: held!.lastIngest,
      monthly: withState,
      baselineDocumentsPerMonth: baseline,
      nextCheckpoint: 'services/ingest/.checkpoints (per court-year); newest write below',
      newestCheckpointWrite: newestCheckpointWrite(),
    });
  }

  /** eCourts is the only adapter that can produce law newer than the last bulk drop. */
  const ec = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM information_schema.tables WHERE table_name = 'ecourts_observation'
  `;
  let ecourtsObs: number | null = null;
  if (Number(ec[0]!.n) > 0) {
    const [o] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM ecourts_observation`;
    ecourtsObs = Number(o!.n);
  }
  rows.push({
    source: 'ecourts',
    label: 'eCourts India (registrar authorisation, to Jan 2029)',
    authorization: { state: 'AUTHORIZED', basis: "registrar's written authorisation 7 Aug 2026", expires: '2029-01' },
    adapter: 'services/api/src/court/ecourts.ts',
    adapterSha256: adapterHash('services/api/src/court/ecourts.ts'),
    newestUpstreamWrite: 'NOT_MEASURED — live source, no listing endpoint',
    heldDocuments: ecourtsObs ?? 0,
    newestLocalDecision: null,
    naiveLagDays: null,
    honestCurrencyFrontier: null,
    honestLagDays: null,
    lastSuccessfulIngest: null,
    nextCheckpoint: 'none — adapter has never run',
    note: 'ZERO observations. The only adapter that can close the bulk-drop lag, and it has never run.',
  });

  const report = { takenAt, sources: rows };
  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2));

  console.log('SOURCE LEDGER — ' + takenAt);
  console.log('');
  for (const r of rows as Record<string, string | number | null>[]) {
    console.log(`${r['source']}`);
    console.log(`  newest upstream write   ${r['newestUpstreamWrite']}`);
    console.log(`  held documents          ${Number(r['heldDocuments']).toLocaleString()}`);
    console.log(`  newest local decision   ${r['newestLocalDecision'] ?? '-'}   (naive lag ${r['naiveLagDays'] ?? '-'} d)`);
    console.log(`  HONEST currency frontier${' '} ${r['honestCurrencyFrontier'] ?? '-'}   (honest lag ${r['honestLagDays'] ?? '-'} d)`);
    console.log(`  last successful ingest  ${r['lastSuccessfulIngest'] ?? '-'}`);
    console.log(`  next checkpoint         ${r['nextCheckpoint']}`);
    const m = (r as unknown as { monthly?: { month: string; documents: number; state: string }[] })['monthly'];
    if (m) console.log(`  months  ${m.slice(0, 6).map((x) => `${x.month}:${x.documents.toLocaleString()}(${x.state})`).join('  ')}`);
    console.log('');
  }
  console.log(`written: ${OUT}`);
  await sql.end();
}

await main();
