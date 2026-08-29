/**
 * NEW2 — R9. NEWEST UPSTREAM DECISION vs NEWEST LOCAL DECISION, per court.
 *
 * ## The question this exists to answer, and why the ledger could not
 *
 * `n2-source-ledger.mts` reports the newest upstream WRITE — the publisher's own
 * `LastModified` on the object. That answers *"is the publisher still active"*.
 * It does NOT answer *"is there law upstream that we do not hold"*, which is a
 * fact about DECISION DATES inside the file, not about when the file was saved.
 *
 * The two come apart in both directions and either way round is a wrong claim:
 * a file written today can carry nothing newer than last month, and a file
 * written last week can carry a judgment from the day before it was written.
 *
 * So this opens the parquet and reads `decision_date`.
 *
 * ## Bounded reads, because an unbounded one has lied here before
 *
 * `unbounded-parquet-read-returns-wrong-rows`: a read with no `rowStart`/`rowEnd`
 * returned the right ROW COUNT and the wrong ROWS, with no error. Every read
 * here is an explicit window over the file's own `num_rows`, and only the
 * `decision_date` column is projected — the Allahabad files carry 441 MB of
 * `raw_html` that nothing here reads.
 *
 * ## What it reports, and the two numbers that are NOT the same
 *
 * Per court, for the year under test:
 *   - newest upstream decision  — the max `decision_date` in the partition
 *   - newest local decision     — the max `judgment_date` we hold for that court
 *   - the gap in days between them
 *
 * And, separately, the LOCAL COMPLETENESS of the newest month, because
 * `the corpus is 56 days behind, not 8` is the standing correction on reading a
 * frontier off a `max()`: a month holding one row has a newest date.
 *
 * Read-only. Network + database. Writes one artifact.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-coverage-frontier.mts [--year 2026]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from '../services/ingest/node_modules/hyparquet/src/index.js';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * The artifact path is a flag rather than a constant so a later round can
 * re-measure without overwriting the round that published the number. An
 * artifact whose filename encodes no round is an artifact you cannot diff
 * against itself, and this one is quoted in a founder report.
 */
const OUT = ((): string => {
  const i = process.argv.indexOf('--out');
  return i === -1 ? 'docs/ai/new2-r9/coverage-frontier.json' : (process.argv[i + 1] ?? 'docs/ai/new2-r9/coverage-frontier.json');
})();
const HC = 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const YEAR = Number(arg('year', '2026'));
/** A decision cannot be dated after today. Anything above this is a bad date upstream. */
const TODAY = new Date().toISOString().slice(0, 10);

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

async function listYear(year: number): Promise<Obj[]> {
  const out: Obj[] = [];
  let token: string | undefined;
  const prefix = `metadata/parquet/year=${year}/`;
  do {
    const url = `${HC}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'LawMind-frontier/1.0' } });
    if (!res.ok) throw new Error(`LIST -> ${res.status}`);
    const xml = await res.text();
    for (const b of xml.match(/<Contents>.*?<\/Contents>/gs) ?? []) {
      const key = /<Key>([^<]+)<\/Key>/.exec(b)?.[1];
      const size = /<Size>(\d+)<\/Size>/.exec(b)?.[1];
      const lm = /<LastModified>([^<]+)<\/LastModified>/.exec(b)?.[1] ?? '';
      /**
       * `bench=testcase` IS EXCLUDED, AND LEAVING IT IN PRODUCED A FALSE ANSWER.
       *
       * The first run of this script reported Bombay (27_1) as **94 days behind**
       * upstream, on a newest upstream decision of **2026-11-27** — three months
       * in the future, on the day it was measured. Every one of those rows lives
       * in `court=27_1/bench=testcase/metadata-mobile.parquet`, which is the
       * fixture partition `isTestFixture` refuses at ingest and the delta
       * manifest already excludes. Bombay's twelve REAL bench partitions all top
       * out at 2026-08-25, which is exactly what we hold.
       *
       * So a fixture partition was about to be reported to the founder as a
       * three-month coverage gap on the largest court in the corpus.
       * `fixture-partition-inflates-the-denominator` recurring — this time in a
       * FRONTIER rather than a denominator, which is why the existing note about
       * denominators did not catch it.
       */
      if (/\/bench=testcase\//.test(key ?? '')) continue;
      if (key?.endsWith('.parquet') && size) out.push({ key, size: Number(size), lastModified: lm });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
      : undefined;
  } while (token);
  return out;
}

/**
 * `decision_date` comes back as a string, a Date or a day-number depending on how
 * the partition was written. Normalised here rather than at every comparison,
 * and anything unrecognised returns null rather than a guess — a judgment filed
 * under a wrong date is worse than one that failed to parse loudly.
 */
function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Parquet DATE is days since epoch. Anything else at this magnitude is not a date.
    if (v < 0 || v > 40_000) return null;
    return new Date(v * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** Max `decision_date` in one partition, read in bounded windows over its own num_rows. */
async function newestDecision(
  key: string,
): Promise<{ rows: number; newest: string | null; read: number; futureDated: number; futureSamples: string[] }> {
  const file = await asyncBufferFromUrl({ url: `${HC}/${key}` });
  const meta = await parquetMetadataAsync(file);
  const rows = Number(meta.num_rows);
  if (rows === 0) return { rows: 0, newest: null, read: 0, futureDated: 0, futureSamples: [] };

  /**
   * The whole column, in windows. Not a tail sample: these partitions are NOT
   * sorted by decision_date — the Bombay 2026 file's last row is from July while
   * its newest is in August — so reading only the end would understate the
   * frontier, which is precisely the error this script exists to remove.
   */
  const WINDOW = 20_000;
  let newest: string | null = null;
  let read = 0;
  let futureDated = 0;
  const futureSamples: string[] = [];
  for (let start = 0; start < rows; start += WINDOW) {
    const end = Math.min(start + WINDOW, rows);
    const batch = (await parquetReadObjects({
      file,
      rowStart: start,
      rowEnd: end,
      columns: ['decision_date'],
    })) as { decision_date?: unknown }[];
    read += batch.length;
    for (const r of batch) {
      const d = toIso(r.decision_date);
      if (!d) continue;
      /**
       * A DECISION DATED AFTER TODAY IS A BAD DATE, NOT LAW WE LACK.
       *
       * The first version bounded this at 2027-12-31, which let three
       * future-dated fixture rows claim the frontier. A court cannot have
       * decided something tomorrow, so the only honest ceiling is today — and
       * the rows above it are COUNTED and reported rather than silently dropped,
       * because "upstream has bad dates" is itself a finding.
       */
      if (d > TODAY) {
        futureDated++;
        if (futureSamples.length < 3) futureSamples.push(d);
        continue;
      }
      if (newest == null || d > newest) newest = d;
    }
  }
  return { rows, newest, read, futureDated, futureSamples };
}

async function main() {
  const takenAt = new Date().toISOString();
  const objs = await listYear(YEAR);
  process.stderr.write(`year=${YEAR}: ${objs.length} partitions\n`);

  const byCourt = new Map<
    string,
    { partitions: number; rows: number; newestUpstream: string | null; newestWrite: string; futureDated: number }
  >();
  let done = 0;
  for (const o of objs) {
    const court = /court=([^/]+)/.exec(o.key)?.[1] ?? '?';
    let r: { rows: number; newest: string | null; read: number };
    try {
      r = await newestDecision(o.key);
    } catch (e) {
      process.stderr.write(`  UNREADABLE ${o.key} — ${String(e).slice(0, 90)}\n`);
      continue;
    }
    const e = byCourt.get(court) ?? { partitions: 0, rows: 0, newestUpstream: null, newestWrite: '', futureDated: 0 };
    e.partitions++;
    e.rows += r.rows;
    e.futureDated += r.futureDated;
    if (r.newest && (e.newestUpstream == null || r.newest > e.newestUpstream)) e.newestUpstream = r.newest;
    if (o.lastModified > e.newestWrite) e.newestWrite = o.lastModified;
    byCourt.set(court, e);
    done++;
    if (done % 10 === 0) process.stderr.write(`  ${done}/${objs.length}\n`);
  }

  const sql = postgres(databaseUrl(), { max: 2, prepare: false, idle_timeout: 20 });
  const local = await sql<{ source_bench_code: string | null; court: string | null; newest: string | null; held: string }[]>`
    SELECT source_court_code AS source_bench_code,
           max(court) AS court,
           max(judgment_date)::text AS newest,
           count(*)::text AS held
    FROM judgments
    WHERE source_url LIKE ${'%indian-high-court-judgments%'}
      AND judgment_date >= ${`${YEAR}-01-01`}::date
      AND judgment_date < ${`${YEAR + 1}-01-01`}::date
    GROUP BY source_court_code
  `.catch(async () => {
    /** Older rows may not carry a court code; fall back to deriving it from the URL. */
    return sql<{ source_bench_code: string | null; court: string | null; newest: string | null; held: string }[]>`
      SELECT substring(source_url from 'court=([^/]+)') AS source_bench_code,
             max(court) AS court,
             max(judgment_date)::text AS newest,
             count(*)::text AS held
      FROM judgments
      WHERE source_url LIKE ${'%indian-high-court-judgments%'}
        AND judgment_date >= ${`${YEAR}-01-01`}::date
        AND judgment_date < ${`${YEAR + 1}-01-01`}::date
      GROUP BY 1
    `;
  });
  const localBy = new Map(local.map((r) => [r.source_bench_code ?? '?', r]));

  const rows = [...byCourt.entries()]
    .map(([court, u]) => {
      const l = localBy.get(court);
      const lag =
        u.newestUpstream && l?.newest
          ? Math.round((Date.parse(u.newestUpstream) - Date.parse(l.newest)) / 86_400_000)
          : null;
      return {
        court,
        courtName: l?.court ?? null,
        upstreamPartitions: u.partitions,
        upstreamParquetRows: u.rows,
        newestUpstreamDecision: u.newestUpstream,
        upstreamFutureDatedRows: u.futureDated,
        newestUpstreamWrite: u.newestWrite,
        newestLocalDecision: l?.newest ?? null,
        heldThisYear: l ? Number(l.held) : 0,
        frontierGapDays: lag,
      };
    })
    .sort((a, b) => (b.frontierGapDays ?? -1) - (a.frontierGapDays ?? -1));

  const upstreamNewest = rows.reduce<string | null>(
    (a, r) => (r.newestUpstreamDecision && (a == null || r.newestUpstreamDecision > a) ? r.newestUpstreamDecision : a),
    null,
  );
  const localNewest = rows.reduce<string | null>(
    (a, r) => (r.newestLocalDecision && (a == null || r.newestLocalDecision > a) ? r.newestLocalDecision : a),
    null,
  );

  const report = {
    takenAt,
    year: YEAR,
    method:
      'decision_date read from the parquet in bounded windows over num_rows, whole column, not a tail sample — these partitions are not sorted by decision date',
    upstreamParquetRowsCaveat:
      'upstreamParquetRows counts PARQUET ROWS across BOTH variants of every partition. It is NOT a document count and MUST NOT be used as a coverage denominator. ' +
      'Worked example from this run: court 23_23 shows 3,587 parquet rows against 109 held, which reads as 3% coverage. Listing the bucket shows the court-year holds exactly ' +
      '109 PDF OBJECTS, all 109 of which we hold — coverage is 100%. The other 3,477 rows are metadata whose pdf_link points at objects the publisher never uploaded, and ' +
      'hc_ingest_ledger records every one as pdf_absent/permanent. The two naming forms are the tell: the objects that exist use the plain variant form ' +
      '(MPHC0300..._<n>_<date>.pdf) and the absent ones use the mobile variant form (orders_2025_...pdf). See `source-count-is-parquet-rows-not-documents`.',
    corpusWide: {
      newestUpstreamDecision: upstreamNewest,
      newestLocalDecision: localNewest,
      frontierGapDays:
        upstreamNewest && localNewest
          ? Math.round((Date.parse(upstreamNewest) - Date.parse(localNewest)) / 86_400_000)
          : null,
      caveat:
        'A max() frontier says nothing about completeness. Use the month-completeness ratio in source-ledger.json for any currency claim.',
    },
    courtsAtParity: rows.filter((r) => r.frontierGapDays === 0).length,
    courtsBehind: rows.filter((r) => (r.frontierGapDays ?? 0) > 0).length,
    courtsAhead: rows.filter((r) => (r.frontierGapDays ?? 0) < 0).length,
    courts: rows,
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2));

  console.log(`year ${YEAR}`);
  console.log(`corpus-wide newest UPSTREAM decision  ${upstreamNewest}`);
  console.log(`corpus-wide newest LOCAL    decision  ${localNewest}`);
  console.log(`frontier gap                          ${report.corpusWide.frontierGapDays} day(s)`);
  console.log(`courts at parity ${report.courtsAtParity} · behind ${report.courtsBehind} · ahead ${report.courtsAhead}`);
  console.log('');
  console.log('NOTE: upstreamParquetRows are PARQUET ROWS across both variants — not documents, never a coverage denominator.');
  console.log('court     upstream   local      gap   heldThisYear  upstreamParquetRows');
  for (const r of rows) {
    console.log(
      `${r.court.padEnd(9)} ${(r.newestUpstreamDecision ?? '-').padEnd(10)} ${(r.newestLocalDecision ?? '-').padEnd(10)} ${String(r.frontierGapDays ?? '-').padStart(4)}   ${String(r.heldThisYear).padStart(11)}   ${String(r.upstreamParquetRows).padStart(11)}`,
    );
  }
  console.log(`written: ${OUT}`);
  await sql.end();
}

await main();
