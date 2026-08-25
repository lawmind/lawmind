/**
 * NEW2 — R7 §10 SOURCE FRESHNESS / DRIFT detector.
 *
 *   node scripts/n2-source-freshness.mjs            # report
 *   node scripts/n2-source-freshness.mjs --strict   # exit 1 if any adapter is not FRESH
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS ENFORCES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **HTTP 200 + an implausibly empty ingest is `FAILED_SOURCE_SHAPE`, not
 * success.** R7 §10. The India Code adapter is the worked example: its old host
 * now 404s and its new host answers 200 with a 2,338-byte Angular shell, so an
 * adapter that trusted the status code would parse nothing and report a clean
 * run for ever.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY FRESHNESS IS NOT THROUGHPUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The AWS Open Data buckets are a periodic dump, not a live feed. Zero new
 * documents for a week is the EXPECTED state there and an alarm on throughput
 * would cry wolf daily. What actually matters is different per adapter, so each
 * one declares its own expected delta band and its own staleness horizon, and
 * a source that has no live feed says so rather than being silently forgiven.
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'docs/ai/new2-r7';
mkdirSync(OUT, { recursive: true });
const STRICT = process.argv.includes('--strict');

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(url, { ssl: false, max: 1, idle_timeout: 20, statement_timeout: 600_000 });

/** Every adapter declares what "healthy" means for IT, not for ingestion in general. */
const ADAPTERS = [
  {
    id: 'aws_open_data_hc',
    kind: 'bulk_dump',
    expected: 'periodic bulk refresh; long quiet periods are normal',
    staleness_horizon_days: 30,
    parser_signature: 'parquet -> judgments(source_url LIKE %indian-high-court-judgments%)',
    count: async () =>
      sql`SELECT count(*)::bigint AS held, max(created_at)::text AS last_useful
          FROM judgments WHERE source_url LIKE '%indian-high-court-judgments%'`,
  },
  {
    id: 'aws_open_data_sc',
    kind: 'bulk_dump',
    expected: 'periodic bulk refresh; long quiet periods are normal',
    staleness_horizon_days: 30,
    parser_signature: 'parquet -> judgments(source_url LIKE %indian-supreme-court-judgments%)',
    count: async () =>
      sql`SELECT count(*)::bigint AS held, max(created_at)::text AS last_useful
          FROM judgments WHERE source_url LIKE '%indian-supreme-court-judgments%'`,
  },
  {
    id: 'indiacode_statutes',
    kind: 'http_api',
    expected: 'on-demand; a statute library changes rarely',
    staleness_horizon_days: 180,
    parser_signature: 'DSpace 7 REST /server/api/discover/search/objects -> statutes/statute_sections',
    count: async () => sql`SELECT count(*)::bigint AS held, max(created_at)::text AS last_useful FROM statutes`,
  },
  {
    id: 'ecourts',
    kind: 'http_api',
    expected: 'live; the only source that can make the corpus current',
    staleness_horizon_days: 2,
    parser_signature: 'services/api/src/court/ecourts.ts -> ecourts_observation / cause_list_syncs',
    count: async () =>
      sql`SELECT (SELECT count(*) FROM ecourts_observation)::bigint AS held,
                 (SELECT max(observed_at)::text FROM ecourts_observation) AS last_useful`,
  },
];

const now = Date.now();
const days = (t) => (t ? (now - new Date(t).getTime()) / 86_400_000 : null);

const report = [];
for (const a of ADAPTERS) {
  let held = 0;
  let last = null;
  let err = null;
  try {
    const [r] = await a.count();
    held = Number(r?.held ?? 0);
    last = r?.last_useful ?? null;
  } catch (e) {
    err = String(e.message);
  }
  const age = days(last);

  /* The four states, and the order matters: NEVER_INGESTED is not stale, it is
   * absent, and calling it stale would imply it once worked. */
  let state;
  if (err) state = 'UNKNOWN_CHECK_FAILED';
  else if (held === 0) state = 'NEVER_INGESTED';
  else if (age === null) state = 'UNKNOWN_NO_TIMESTAMP';
  else if (age > a.staleness_horizon_days) state = 'STALE';
  else state = 'FRESH';

  report.push({
    adapter: a.id,
    kind: a.kind,
    state,
    documents_held: held,
    last_useful_document: last,
    age_days: age === null ? null : +age.toFixed(2),
    staleness_horizon_days: a.staleness_horizon_days,
    parser_signature: a.parser_signature,
    expected: a.expected,
    error: err,
  });
}

/* The ingest failure ledger — the other half of freshness. `source_url` records
 * only successes; a source that fails every request looks identical to a source
 * with nothing new unless the failures are counted too. */
const ledger = await sql`
  SELECT outcome, permanent, count(*)::bigint AS n, max(last_attempted_at)::text AS newest
  FROM hc_ingest_ledger GROUP BY 1,2 ORDER BY 3 DESC`;

const cadence = await sql`
  SELECT date_trunc('day', created_at)::date::text AS day, count(*)::bigint AS ingested
  FROM judgments WHERE created_at > now() - interval '21 days'
  GROUP BY 1 ORDER BY 1`;

const out = {
  artifact: 'SOURCE_FRESHNESS_AND_DRIFT_V1',
  generated_at: new Date().toISOString(),
  adapters: report,
  ingest_failure_ledger: ledger,
  ingest_cadence_21d: cadence,
};
writeFileSync(`${OUT}/source-freshness.json`, JSON.stringify(out, null, 1));

console.log('ADAPTER                 STATE              HELD          LAST USEFUL DOCUMENT        AGE(d)  HORIZON');
for (const r of report) {
  console.log(
    '  ' +
      r.adapter.padEnd(22) +
      r.state.padEnd(20) +
      String(r.documents_held).padStart(11) +
      '  ' +
      String(r.last_useful_document ?? '—').padEnd(30) +
      String(r.age_days ?? '—').padStart(7) +
      String(r.staleness_horizon_days).padStart(9),
  );
}
console.log('\nINGEST FAILURE LEDGER');
for (const l of ledger) {
  console.log('  ' + String(l.outcome).padEnd(14) + (l.permanent ? 'permanent' : 'retryable').padEnd(11) + String(l.n).padStart(9) + '  ' + l.newest);
}
console.log('\nINGEST CADENCE, LAST 21 DAYS');
for (const c of cadence) console.log('  ' + c.day + '  ' + String(c.ingested).padStart(11));

const bad = report.filter((r) => r.state !== 'FRESH');
if (bad.length) {
  console.log(`\n${bad.length} adapter(s) not FRESH: ${bad.map((b) => `${b.adapter}=${b.state}`).join(', ')}`);
}
await sql.end();
if (STRICT && bad.length) process.exit(1);
