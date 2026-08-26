/**
 * NEW2 — R8.3 §11 N2-2. Source-freshness DECOMPOSITION: upstream vs local.
 *
 * ## The question this exists to answer, and why R8.1 could not
 *
 * R8.1 proved the LOCAL side: August 2026 holds 480 judgments against a 117,332
 * baseline, so the honest currency frontier is 2026-07-01 and the lag is 56 days
 * rather than the 8 that `max(judgment_date)` prints. What it never measured is
 * the OTHER side. Its `newest item at source` and `upstream lag` fields both read
 * `NOT_MEASURED`, and the explanation it offered — bulk dumps are periodic, so
 * quiet periods are expected — was an inference chain, not a probe.
 *
 * §11 puts it plainly: *is LawMind stale because local ingestion stopped, because
 * the upstream bulk source is stale, or both?* **No remedy before cause**, so
 * this measures the cause.
 *
 * ## What is measured, and what each measurement can and cannot say
 *
 * - **newest upstream object** — S3 `LastModified` over the bucket's own
 *   `metadata/parquet` tree. This is when the publisher last WROTE, which is a
 *   fact about the publisher and is exactly what "is upstream stale" asks.
 * - **newest upstream legal decision** — read out of the parquet rows for the
 *   current year. This is a fact about the LAW available upstream, and it is a
 *   different question from when the file was written.
 * - **local holdings, court x month** — what we actually have.
 * - **the two lags, separately.** A single "lag" number cannot be acted on
 *   because it does not say whose lag it is.
 *
 * Read-only against both S3 and the database. Writes one artifact.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-source-freshness-decomposition.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { asyncBufferFromUrl, parquetReadObjects } from '../services/ingest/node_modules/hyparquet/src/index.js';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r83/source-freshness-decomposition.json';

const BUCKETS = [
  { adapter: 'aws_open_data_hc', host: 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com', urlMatch: 'indian-high-court-judgments' },
  { adapter: 'aws_open_data_sc', host: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com', urlMatch: 'indian-supreme-court-judgments' },
] as const;

/** The year whose freshness is in question. */
const YEAR = 2026;
/**
 * Parquet files actually opened. Reading all 56 would move ~250 MB for a
 * question three files answer, and this runs while LCC owns the heavy box.
 */
const PARQUET_SAMPLE = 3;

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type S3Obj = { key: string; lastModified: string; size: number };

/** Anonymous ListObjectsV2. These are AWS Open Data buckets and list publicly. */
async function listAll(host: string, prefix: string): Promise<S3Obj[]> {
  const out: S3Obj[] = [];
  let token: string | undefined;
  do {
    const url = `${host}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'LawMind-freshness/1.0' } });
    if (!res.ok) throw new Error(`LIST ${prefix} -> ${res.status}`);
    const xml = await res.text();
    const re = /<Key>([^<]*)<\/Key><LastModified>([^<]*)<\/LastModified>[\s\S]*?<Size>(\d+)<\/Size>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) out.push({ key: m[1]!, lastModified: m[2]!, size: Number(m[3]) });
    token = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1];
  } while (token);
  return out;
}

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 60, connect_timeout: 30 });
const days = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / 86400000);

/**
 * The two buckets of the same programme store `decision_date` differently:
 * the High Court files hold `YYYY-MM-DD`, the Supreme Court file holds
 * `DD-MM-YYYY`. An ISO-only reader returned NULL for every Supreme Court row and
 * printed "newest decision null" for a file that has 208 of them — an absence
 * produced entirely by the reader.
 *
 * Worse, string-comparing `DD-MM-YYYY` sorts by DAY: it made 25-05-2026 look
 * newer than 04-08-2026. Both formats are normalised here before anything is
 * compared.
 */
function isoDate(raw: unknown): string | null {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function main(): Promise<void> {
  const now = new Date();
  console.log(`R8.3 §11 N2-2 — freshness decomposition, as of ${now.toISOString()}\n`);

  const perAdapter: Record<string, unknown> = {};

  for (const b of BUCKETS) {
    console.log(`=== ${b.adapter}`);

    // ---- UPSTREAM: when did the publisher last write? --------------------
    const objs = await listAll(b.host, `metadata/parquet/year=${YEAR}/`);
    const newest = objs.reduce((a, o) => (o.lastModified > a.lastModified ? o : a), objs[0]!);
    const newestDate = new Date(newest.lastModified);
    console.log(`  ${YEAR} parquet objects       ${objs.length}`);
    console.log(`  newest upstream WRITE      ${newest.lastModified}  (${days(now, newestDate)}d ago)`);
    console.log(`    ${newest.key}`);

    const within7 = objs.filter((o) => days(now, new Date(o.lastModified)) <= 7).length;
    console.log(`  objects written in last 7d ${within7} of ${objs.length}`);

    // ---- UPSTREAM: what is the newest LAW available? ---------------------
    //
    // Written-recently and containing-recent-law are different claims. A
    // publisher can rewrite a file without adding a single new judgment, which
    // is exactly the shape of `completion is not a success signal`.
    const ranked = [...objs].sort((a, b2) => (a.lastModified < b2.lastModified ? 1 : -1)).filter((o) => o.key.endsWith('/metadata.parquet'));
    const probes: { key: string; rows: number; newest_decision: string | null; by_month: Record<string, number> }[] = [];
    for (const o of ranked.slice(0, PARQUET_SAMPLE)) {
      try {
        const file = await asyncBufferFromUrl({ url: `${b.host}/${o.key}` });
        const rows = (await parquetReadObjects({ file, columns: ['decision_date'] })) as { decision_date?: unknown }[];
        const byMonth: Record<string, number> = {};
        let newestDec: string | null = null;
        for (const r of rows) {
          const s = isoDate(r.decision_date);
          if (!s) continue;
          byMonth[s.slice(0, 7)] = (byMonth[s.slice(0, 7)] ?? 0) + 1;
          if (!newestDec || s > newestDec) newestDec = s;
        }
        probes.push({ key: o.key, rows: rows.length, newest_decision: newestDec, by_month: byMonth });
        console.log(`  probe ${o.key.split('/').slice(-2)[0]}  rows ${rows.length}  newest decision ${newestDec}`);
        const months = Object.entries(byMonth).sort();
        console.log(`        by month: ${months.map(([m, n]) => `${m}:${n}`).join('  ')}`);
      } catch (e) {
        probes.push({ key: o.key, rows: -1, newest_decision: null, by_month: {} });
        console.log(`  probe ${o.key} FAILED ${String(e).slice(0, 90)}`);
      }
    }

    // ---- LOCAL: what do we hold, and when did we last write it? ----------
    const [local] = await sql<{ newest_ingest: string | null; newest_decision: string | null; held: string }[]>`
      select max(created_at)::text as newest_ingest,
             max(judgment_date)::text as newest_decision,
             count(*)::text as held
        from judgments
       where source_url like ${'%' + b.urlMatch + '%'}`;
    const localIngest = local!.newest_ingest ? new Date(local!.newest_ingest) : null;
    console.log(`  local held                 ${Number(local!.held).toLocaleString()}`);
    console.log(`  newest LOCAL ingest        ${local!.newest_ingest}  (${localIngest ? days(now, localIngest) : '?'}d ago)`);
    console.log(`  newest LOCAL decision      ${local!.newest_decision}`);

    const upstreamLag = days(now, newestDate);
    const ingestLag = localIngest ? days(now, localIngest) : null;

    // The verdict is decided on CONTENT, not on write timestamps.
    //
    // A first version compared only lags and returned INDETERMINATE for the
    // High Court adapter while upstream carried decisions from yesterday and we
    // held 0.4% of the month. Our last ingest ran 7 days ago, which is recent —
    // and it read almost nothing. "When did we last write" and "how far behind
    // is the law we hold" are different questions, and only the second one is
    // about the corpus.
    const upstreamNewestDecision = probes.map((p) => p.newest_decision).filter((d): d is string => !!d).sort().pop() ?? null;
    const decisionGapDays =
      upstreamNewestDecision && local!.newest_decision
        ? days(new Date(upstreamNewestDecision), new Date(local!.newest_decision.slice(0, 10)))
        : null;

    // COMPLETENESS, not the frontier, decides "are we behind".
    //
    // The frontier test returned CURRENT for the High Court adapter on a 7-day
    // gap — while August held 480 documents corpus-wide against a 117,332
    // baseline. 480 recent documents put `max(judgment_date)` within a week of
    // upstream and left 99.6% of the month missing. This is the same failure
    // R8.1 named and then walked into from the other side: a max cannot see an
    // empty month, and neither can a gap computed from two maxes.
    const monthKey = (d: Date): string => d.toISOString().slice(0, 7);
    const latestMonth = upstreamNewestDecision ? upstreamNewestDecision.slice(0, 7) : monthKey(now);
    const upstreamRatios = probes
      .filter((p) => Object.keys(p.by_month).length >= 3)
      .map((p) => {
        const settledMonths = Object.entries(p.by_month).filter(([m]) => m < latestMonth).sort();
        const base = settledMonths.slice(-6).map(([, n]) => n);
        const mean = base.length ? base.reduce((a, x) => a + x, 0) / base.length : 0;
        return mean > 0 ? (p.by_month[latestMonth] ?? 0) / mean : null;
      })
      .filter((r): r is number => r !== null);
    const upstreamLatestRatio = upstreamRatios.length
      ? Number((upstreamRatios.reduce((a, x) => a + x, 0) / upstreamRatios.length).toFixed(4))
      : null;

    const localMonths = await sql<{ m: string; n: number }[]>`
      select to_char(date_trunc('month', judgment_date), 'YYYY-MM') as m, count(*)::int as n
        from judgments
       where source_url like ${'%' + b.urlMatch + '%'}
         and judgment_date >= ${`${YEAR}-01-01`}::date
       group by 1`;
    const localByMonth = Object.fromEntries(localMonths.map((r) => [r.m, r.n]));
    const localSettled = Object.entries(localByMonth).filter(([m]) => m < latestMonth).sort().slice(-6).map(([, n]) => n);
    const localMean = localSettled.length ? localSettled.reduce((a, x) => a + x, 0) / localSettled.length : 0;
    const localLatestRatio = localMean > 0 ? Number(((localByMonth[latestMonth] ?? 0) / localMean).toFixed(4)) : null;

    console.log(`  latest month ${latestMonth}: upstream ${upstreamLatestRatio === null ? 'n/a' : (upstreamLatestRatio * 100).toFixed(1) + '%'} of its own baseline, local ${localLatestRatio === null ? 'n/a' : (localLatestRatio * 100).toFixed(1) + '%'} of its own`);

    const upstreamPublishing = upstreamLag <= 7 && (upstreamLatestRatio ?? 0) >= 0.6;
    const localBehind = (decisionGapDays ?? 0) > 7 || (localLatestRatio !== null && localLatestRatio < 0.6);
    const verdict = upstreamPublishing
      ? localBehind
        ? 'LOCAL_INGEST_BEHIND — upstream is publishing current law, we are not reading it'
        : 'CURRENT'
      : localBehind
        ? 'BOTH — upstream has not written recently AND we are behind what it does hold'
        : 'UPSTREAM_STALE — we are as current as a source that is not';
    console.log(`  VERDICT                    ${verdict}\n`);

    perAdapter[b.adapter] = {
      upstream: {
        parquet_objects_for_year: objs.length,
        newest_object_written: newest.lastModified,
        newest_object_key: newest.key,
        upstream_write_lag_days: upstreamLag,
        newest_upstream_decision: upstreamNewestDecision,
        decision_gap_days_upstream_minus_local: decisionGapDays,
        latest_month: latestMonth,
        upstream_latest_month_ratio_to_own_baseline: upstreamLatestRatio,
        local_latest_month_ratio_to_own_baseline: localLatestRatio,
        local_months: localByMonth,
        objects_written_last_7d: within7,
        decision_date_probes: probes,
      },
      local: {
        held: Number(local!.held),
        newest_ingest: local!.newest_ingest,
        local_ingest_lag_days: ingestLag,
        newest_decision: local!.newest_decision,
      },
      verdict,
    };
  }

  // ---- court x month completeness, the field §11 names ------------------
  const cells = await sql<{ court: string; m: string; n: number }[]>`
    select court, to_char(date_trunc('month', judgment_date), 'YYYY-MM') as m, count(*)::int as n
      from judgments
     where judgment_date >= ${`${YEAR}-01-01`}::date
     group by 1, 2`;

  const byCourt = new Map<string, Record<string, number>>();
  for (const c of cells) {
    if (!byCourt.has(c.court)) byCourt.set(c.court, {});
    byCourt.get(c.court)![c.m] = c.n;
  }

  // A court's own settled months are its baseline. Comparing a court against
  // the corpus mean would call every small High Court "incomplete" for being
  // small, which is a statement about its size and not about our coverage.
  const monthsSeen = [...new Set(cells.map((c) => c.m))].sort();
  const settled = monthsSeen.slice(0, Math.max(monthsSeen.length - 2, 1));
  const courtRows = [...byCourt.entries()]
    .map(([court, ms]) => {
      const base = settled.map((m) => ms[m] ?? 0);
      const baseline = base.length ? base.reduce((a, x) => a + x, 0) / base.length : 0;
      const perMonth: Record<string, { n: number; ratio: number | null; state: string }> = {};
      for (const m of monthsSeen) {
        const n = ms[m] ?? 0;
        const ratio = baseline > 0 ? Number((n / baseline).toFixed(4)) : null;
        perMonth[m] = {
          n,
          ratio,
          state: ratio === null ? 'NO_BASELINE' : ratio >= 0.6 ? 'COMPLETE_ENOUGH' : ratio >= 0.1 ? 'PARTIAL' : 'EFFECTIVELY_ABSENT',
        };
      }
      return { court, baseline_per_month: Math.round(baseline), months: perMonth };
    })
    .sort((a, b) => b.baseline_per_month - a.baseline_per_month);

  const latest = monthsSeen[monthsSeen.length - 1]!;
  const absentInLatest = courtRows.filter((c) => c.months[latest]?.state === 'EFFECTIVELY_ABSENT').length;
  console.log(`court x month: ${courtRows.length} courts x ${monthsSeen.length} months`);
  console.log(`  ${latest}: ${absentInLatest} of ${courtRows.length} courts EFFECTIVELY_ABSENT`);
  for (const c of courtRows.slice(0, 8)) {
    console.log(`  ${c.court.slice(0, 38).padEnd(38)} base ${String(c.baseline_per_month).padStart(6)}  ${monthsSeen.map((m) => String(c.months[m]!.n).padStart(6)).join(' ')}`);
  }
  console.log(`  ${'(months)'.padEnd(38)}      ${' '.repeat(6)}  ${monthsSeen.map((m) => m.slice(2).padStart(6)).join(' ')}`);

  mkdirSync(join(ROOT, dirname(OUT)), { recursive: true });
  writeFileSync(
    join(ROOT, OUT),
    JSON.stringify(
      {
        artifact: 'NEW2_SOURCE_FRESHNESS_DECOMPOSITION',
        lane: 'NEW2',
        protocol: 'LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md §11 N2-2',
        generated_at: now.toISOString(),
        supersedes: 'docs/ai/new2-r8/SOURCE_FRESHNESS_R8.md — which measured only the local side',
        year_under_test: YEAR,
        adapters: perAdapter,
        court_month_completeness: {
          months: monthsSeen,
          latest_month: latest,
          courts: courtRows.length,
          courts_effectively_absent_in_latest: absentInLatest,
          method: "each court's baseline is the mean of ITS OWN settled months; a corpus-wide baseline would call every small High Court incomplete for being small",
          rows: courtRows,
        },
        not_measured: [
          'court publication calendars — a PARTIAL month may be a real vacation',
          'upstream row counts for every bench; only the most recently written parquet files were opened',
          'eCourts, which has never run and therefore has no lag to measure',
        ],
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`\nwrote ${OUT}`);
}

try {
  await main();
} finally {
  await sql.end();
}
