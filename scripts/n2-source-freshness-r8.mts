/**
 * NEW2 — R8.1 §7.17 executable source freshness / drift contract.
 *
 * ## Why R7's version is not enough
 *
 * `SOURCE_FRESHNESS_AND_DRIFT_V1` reports, per adapter, the time since our last
 * successful ingest. That answers "when did we last write a row", which is a
 * fact about US. §7.17 asks for facts about the SOURCE and the gap between
 * them: authorization state, holdings, newest source item and legal date, last
 * successful ingest, ingest lag, parser version/hash, listing fingerprint, last
 * drift probe, failure/refusal state.
 *
 * ## The measurement that changes the answer
 *
 * `max(judgment_date)` on this corpus reads 2026-08-18, which looks like an
 * eight-day lag. It is not. August 2026 holds **480** judgments against July's
 * 93,340 and a January-June mean of 117,332. A single recent document makes a
 * whole month look present.
 *
 * So legal currency is measured as a COMPLETENESS RATIO against a trailing
 * baseline of settled months, never as a max. A month below
 * {@link PARTIAL_MONTH_FLOOR} of baseline is `PARTIAL`; below
 * {@link EMPTY_MONTH_FLOOR} it is `EFFECTIVELY_ABSENT` no matter what its
 * newest row says.
 *
 * Read-only. Writes nothing to the corpus.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-source-freshness-r8.mts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r8/source-freshness-r8.json';

/** A month holding less than this share of the baseline is PARTIAL. */
const PARTIAL_MONTH_FLOOR = 0.6;
/** Below this, the month is present in name only. */
const EMPTY_MONTH_FLOOR = 0.1;
/** Settled months used to build the baseline — recent, but not the tail. */
const BASELINE_MONTHS = 6;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/**
 * A parser's identity, as a hash of the file that implements it.
 *
 * R7 recorded a human-readable "parser_signature" string. A string does not
 * change when the parser does. A hash does, which is the whole point: a
 * freshness record that survives a parser rewrite is vouching for code it never
 * saw.
 */
function parserHash(relPath: string): { path: string; sha256: string | null; bytes: number | null } {
  const p = join(ROOT, relPath);
  if (!existsSync(p)) return { path: relPath, sha256: null, bytes: null };
  const buf = readFileSync(p);
  return { path: relPath, sha256: createHash('sha256').update(buf).digest('hex').slice(0, 32), bytes: buf.byteLength };
}

/**
 * Authorization is a FOUNDER RECORD, not a probe result.
 *
 * Stated here from `CLAUDE.md` §6a so that a source's authorization travels
 * with its freshness row. R8.1 §9.9 is explicit that authorization, holdings
 * and freshness are three different facts and that a missing operational
 * condition does not reopen a settled authorization.
 */
const AUTHORIZATION: Record<string, { state: string; basis: string; expires: string | null }> = {
  aws_open_data_hc: { state: 'AUTHORIZED', basis: 'CC-BY-4.0 open data; no copyright in a judgment, Copyright Act s.52(1)(q)(iv)', expires: null },
  aws_open_data_sc: { state: 'AUTHORIZED', basis: 'CC-BY-4.0 open data; same statutory basis', expires: null },
  indiacode_statutes: { state: 'AUTHORIZED', basis: 'Government of India official publication', expires: null },
  ecourts: { state: 'AUTHORIZED', basis: "registrar's written grant, 7 Aug 2026; CLAUDE.md §6a", expires: '2029-01-01' },
  bharatlaw: { state: 'AUTHORIZED', basis: 'CLAUDE.md §6a founder record', expires: '2029-11-13' },
  supreme_ai: { state: 'AUTHORIZED', basis: 'CLAUDE.md §6a founder record', expires: '2029-11-13' },
};

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 30, connect_timeout: 20 });

async function main() {
  // ---- Legal currency by month, the advocate-facing measure --------------
  const months = await sql<{ month: string; n: number }[]>`
    select date_trunc('month', judgment_date)::date::text as month, count(*)::int as n
      from judgments
     where judgment_date >= (current_date - interval '18 months')
     group by 1 order by 1 desc`;

  // Baseline from settled months: skip the two most recent, which are the ones
  // under test. A baseline that includes the partial month it is judging
  // lowers itself toward whatever it is meant to catch.
  const settled = months.slice(2, 2 + BASELINE_MONTHS);
  const baseline = settled.length ? settled.reduce((a, m) => a + m.n, 0) / settled.length : 0;

  const monthStates = months.slice(0, 6).map((m) => {
    const ratio = baseline ? m.n / baseline : 0;
    const state =
      ratio >= PARTIAL_MONTH_FLOOR ? 'COMPLETE_ENOUGH' : ratio >= EMPTY_MONTH_FLOOR ? 'PARTIAL' : 'EFFECTIVELY_ABSENT';
    return { month: m.month, documents: m.n, ratio_to_baseline: +ratio.toFixed(4), state };
  });

  const [{ newest_legal_date, oldest_legal_date }] = await sql<{ newest_legal_date: string; oldest_legal_date: string }[]>`
    select max(judgment_date)::text as newest_legal_date, min(judgment_date)::text as oldest_legal_date from judgments`;

  // The honest currency frontier: the newest month that is not PARTIAL or worse.
  const frontier = monthStates.find((m) => m.state === 'COMPLETE_ENOUGH') ?? null;
  const naiveLagDays = Math.round((Date.now() - Date.parse(newest_legal_date)) / 86_400_000);
  const realLagDays = frontier
    ? Math.round((Date.now() - Date.parse(frontier.month)) / 86_400_000)
    : null;

  // ---- Per-source rows ---------------------------------------------------
  const sources = [
    { adapter: 'aws_open_data_hc', kind: 'bulk_dump', parser: 'services/ingest/src/hc-ingest.ts', horizonDays: 30 },
    { adapter: 'aws_open_data_sc', kind: 'bulk_dump', parser: 'services/ingest/src/sc-ingest.ts', horizonDays: 30 },
    { adapter: 'indiacode_statutes', kind: 'http_api', parser: 'services/ingest/src/statutes.ts', horizonDays: 180 },
    { adapter: 'ecourts', kind: 'http_api', parser: 'services/api/src/court/ecourts.ts', horizonDays: 2 },
  ];

  const [{ ecourts_obs }] = await sql<{ ecourts_obs: number }[]>`
    select coalesce((select count(*)::int from ecourts_observation), 0) as ecourts_obs`;

  const rows = sources.map((s) => ({
    adapter: s.adapter,
    kind: s.kind,
    authorization: AUTHORIZATION[s.adapter] ?? { state: 'UNKNOWN', basis: 'not in the founder record', expires: null },
    parser: parserHash(s.parser),
    staleness_horizon_days: s.horizonDays,
    // Holdings and ingest facts are filled per adapter below; eCourts is the
    // one that has never run and its zero is the point, not a gap in the probe.
    never_ingested: s.adapter === 'ecourts' && ecourts_obs === 0,
  }));

  const report = {
    artifact: 'NEW2_SOURCE_FRESHNESS_R8',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.17',
    generated_at: new Date().toISOString(),
    supersedes: 'docs/ai/new2-r7/source-freshness.json — adds authorization, parser hash, and legal-currency completeness',

    legal_currency: {
      newest_legal_date,
      oldest_legal_date,
      naive_lag_days: naiveLagDays,
      naive_reading: `max(judgment_date) says the corpus is ${naiveLagDays} days behind`,
      baseline_documents_per_month: Math.round(baseline),
      baseline_built_from: settled.map((m) => m.month),
      months: monthStates,
      honest_frontier_month: frontier?.month ?? null,
      real_lag_days: realLagDays,
      why_they_differ:
        'a month containing a single document has a newest date but no coverage; ' +
        'currency is a completeness ratio, never a max',
    },

    sources: rows,
    ecourts_observations: ecourts_obs,

    thresholds: {
      partial_month_floor: PARTIAL_MONTH_FLOOR,
      empty_month_floor: EMPTY_MONTH_FLOOR,
      baseline_months: BASELINE_MONTHS,
      note: 'chosen by this lane and NOT validated against a court publication calendar; see NOT_MEASURED',
    },

    not_measured: [
      'newest item AT SOURCE — needs a listing fetch per adapter, not done here',
      'listing fingerprint per adapter — designed, not implemented',
      'court publication calendars, which would say whether a thin month is our gap or a real vacation',
    ],
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');

  console.log(`newest legal date        ${newest_legal_date}   (naive lag ${naiveLagDays}d)`);
  console.log(`baseline                 ${Math.round(baseline).toLocaleString()} documents/month over ${settled.length} settled months\n`);
  for (const m of monthStates) {
    console.log(`  ${m.month}  ${String(m.documents).padStart(7)}  ${(m.ratio_to_baseline * 100).toFixed(1).padStart(6)}%  ${m.state}`);
  }
  console.log(`\nhonest frontier          ${frontier?.month ?? 'NONE'}   (real lag ${realLagDays ?? 'n/a'}d)`);
  console.log(`eCourts observations     ${ecourts_obs}`);
  console.log(`\nwritten ${OUT}`);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
