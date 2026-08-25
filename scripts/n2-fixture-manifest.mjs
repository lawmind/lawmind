/**
 * NEW2 — R8.1 §7.1 exact synthetic fixture manifest.
 *
 * Read-only. Produces the exact-ID manifest that LCC's §8.8 removal seam and
 * FIFTH's post-removal zero-check both consume.
 *
 * Why exact IDs and never a predicate: `case_title LIKE 'SYNTHETIC%'` returns
 * eight REAL judgments, one of them a Constitution Bench authority
 * (Synthetics & Chemicals Ltd. v. State of U.P., 1989 INSC 321). A predicate
 * that is right today is not a manifest; it is a deletion waiting for the
 * corpus to grow into it.
 *
 * The candidate set is the INTERSECTION of two independent safe predicates.
 * Divergence between them is reported as a finding, never silently unioned.
 *
 * Usage: node scripts/n2-fixture-manifest.mjs [--out docs/ai/new2-r8/fixture-manifest.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found in environment or .env');
}

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? argv[outIdx + 1] : 'docs/ai/new2-r8/fixture-manifest.json';

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 10, connect_timeout: 20 });

/** Independent synthetic markers. A row must carry ALL of them to enter the manifest. */
const MARKERS = [
  { key: 'court_is_test_court', sql: `court = 'Test Court'` },
  { key: 'source_url_is_test_scheme', sql: `source_url LIKE 'test://%'` },
  { key: 'title_is_synthetic_marked', sql: `case_title LIKE 'SYNTHETIC %'` },
  { key: 'no_content_hash', sql: `content_hash IS NULL` },
];

async function main() {
  const report = {
    artifact: 'NEW2_SYNTHETIC_FIXTURE_MANIFEST_V1',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.1',
    generated_at: new Date().toISOString(),
    database: null,
    head: null,
    marker_populations: {},
    predicate_safety: {},
    manifest: [],
    dependents: {},
    dependent_totals: {},
    blocking_constraints: [],
    user_data_touched: null,
    verdict: null,
  };

  const [{ v }] = await sql`select current_setting('server_version') as v`;
  const [{ db }] = await sql`select current_database() as db`;
  report.database = { name: db, server_version: v };

  // --- 1. Population of each marker, independently -------------------------
  for (const m of MARKERS) {
    const rows = await sql.unsafe(`select count(*)::int as n from judgments where ${m.sql}`);
    report.marker_populations[m.key] = rows[0].n;
  }

  // --- 2. Predicate safety: what a LOOSE predicate would have caught -------
  // This is the evidence for "exact IDs, never a predicate".
  const loose = await sql`
    select id, court, case_title, neutral_citation, source_url
    from judgments
    where case_title like 'SYNTHETIC%'
      and court <> 'Test Court'
    order by court, case_title
  `;
  report.predicate_safety = {
    loose_predicate: `case_title LIKE 'SYNTHETIC%' AND court <> 'Test Court'`,
    matched: loose.length,
    all_real_judgments: loose.every((r) => /^https?:\/\//.test(r.source_url ?? '')),
    rows: loose.map((r) => ({
      id: r.id,
      court: r.court,
      case_title: r.case_title,
      neutral_citation: r.neutral_citation,
      source_url: r.source_url,
    })),
  };

  // --- 3. Candidate set = rows carrying ALL markers -----------------------
  const allMarkers = MARKERS.map((m) => m.sql).join(' and ');
  const candidates = await sql.unsafe(`
    select id, court, case_number, case_title, judgment_date, neutral_citation,
           reporter_citations, source_url, content_hash, text_quality,
           overruled_status, created_at
    from judgments
    where ${allMarkers}
    order by created_at, case_title
  `);

  // Rows that carry SOME but not all markers are a finding, not a manifest entry.
  const anyMarker = MARKERS.map((m) => `(${m.sql})`).join(' or ');
  const partial = await sql.unsafe(`
    select id, court, case_title, source_url,
           ${MARKERS.map((m) => `(${m.sql}) as ${m.key}`).join(', ')}
    from judgments
    where (${anyMarker}) and not (${allMarkers})
      and (court = 'Test Court' or source_url like 'test://%')
    order by created_at
  `);
  report.partial_marker_rows = partial;

  report.manifest = candidates.map((r) => ({
    id: r.id,
    court: r.court,
    case_number: r.case_number,
    case_title: r.case_title,
    judgment_date: r.judgment_date instanceof Date ? r.judgment_date.toISOString().slice(0, 10) : r.judgment_date,
    neutral_citation: r.neutral_citation,
    reporter_citations: r.reporter_citations,
    source_url: r.source_url,
    content_hash: r.content_hash,
    text_quality: r.text_quality,
    overruled_status: r.overruled_status,
    created_at: r.created_at,
    synthetic_origin_proof: {
      court_is_test_court: r.court === 'Test Court',
      source_url_is_test_scheme: String(r.source_url ?? '').startsWith('test://'),
      title_is_synthetic_marked: /^SYNTHETIC /.test(r.case_title ?? ''),
      no_content_hash: r.content_hash === null,
      // A real judgment is never dated 1 January of a round year by accident at this rate.
      date_is_synthetic_placeholder:
        (r.judgment_date instanceof Date ? r.judgment_date.toISOString().slice(5, 10) : '') === '01-01',
    },
  }));

  const ids = report.manifest.map((r) => r.id);

  // --- 4. Dependents across EVERY FK that references judgments ------------
  const fks = await sql`
    select tc.table_name, kcu.column_name, rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name
    join information_schema.referential_constraints rc
      on tc.constraint_name = rc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_name = 'judgments'
      and ccu.column_name = 'id'
    order by tc.table_name, kcu.column_name
  `;

  for (const fk of fks) {
    const label = `${fk.table_name}.${fk.column_name}`;
    const rows = await sql.unsafe(
      `select count(*)::int as n from ${fk.table_name} where ${fk.column_name} = any($1::uuid[])`,
      [ids],
    );
    const n = rows[0].n;
    report.dependents[label] = { rows: n, delete_rule: fk.delete_rule };
    report.dependent_totals[fk.delete_rule] = (report.dependent_totals[fk.delete_rule] ?? 0) + n;
    if (n > 0 && fk.delete_rule === 'NO ACTION') {
      report.blocking_constraints.push({ constraint: label, rows: n });
    }
  }

  // --- 5. Does any of this touch real user data? --------------------------
  // matter_authorities and judgment_annotations are advocate-owned. A fixture
  // reachable from a real matter is a different problem from a stray row.
  const userTables = ['matter_authorities', 'judgment_annotations', 'alerts'];
  const touched = {};
  for (const t of userTables) {
    const label = Object.keys(report.dependents).find((k) => k.startsWith(`${t}.`));
    touched[t] = label ? report.dependents[label].rows : 'NO_FK';
  }
  report.user_data_touched = touched;

  // --- 6. Verdict ---------------------------------------------------------
  const courtOnly = report.marker_populations.court_is_test_court;
  const urlOnly = report.marker_populations.source_url_is_test_scheme;
  const agree = courtOnly === urlOnly && courtOnly === report.manifest.length;

  report.verdict = {
    manifest_size: report.manifest.length,
    two_safe_predicates_agree: agree,
    predicates: { court_is_test_court: courtOnly, source_url_is_test_scheme: urlOnly },
    partial_marker_rows: partial.length,
    total_dependent_rows: Object.values(report.dependents).reduce((a, d) => a + d.rows, 0),
    blocking_constraint_count: report.blocking_constraints.length,
    state: agree && partial.length === 0 ? 'PROVEN' : 'CONFLICT_REQUIRES_REMEASUREMENT',
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');

  // --- 7. Console summary -------------------------------------------------
  console.log(`manifest size            ${report.manifest.length}`);
  console.log(`predicates agree         ${agree}  (court=${courtOnly}, test://=${urlOnly})`);
  console.log(`partial-marker rows      ${partial.length}`);
  console.log(`loose predicate would hit ${loose.length} REAL judgments`);
  console.log('');
  console.log('dependent rows by constraint (non-zero only):');
  for (const [k, d] of Object.entries(report.dependents)) {
    if (d.rows > 0) console.log(`  ${k.padEnd(46)} ${String(d.rows).padStart(7)}  ${d.delete_rule}`);
  }
  console.log('');
  console.log(`total dependent rows     ${report.verdict.total_dependent_rows}`);
  console.log(`blocking (NO ACTION)     ${report.blocking_constraints.length}`);
  console.log(`user data touched        ${JSON.stringify(touched)}`);
  console.log(`state                    ${report.verdict.state}`);
  console.log(`written                  ${OUT}`);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
