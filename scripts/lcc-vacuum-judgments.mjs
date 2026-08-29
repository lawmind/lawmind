/**
 * LCC R10 — set the visibility map on `judgments`, and measure what it buys.
 *
 * NOT a tuning expedition. One table, one operation, and the two numbers that
 * decide whether it was worth doing, recorded before and after:
 *
 *   pg_class.relallvisible / relpages   the thing being fixed
 *   the /corpus/coverage correlated subquery   the production path that pays for it
 *
 * `INDEX_CLEANUP OFF` because the goal is the visibility map, not dead-tuple
 * reclamation: it makes this a 22 GB heap pass rather than a 151 GB heap+index
 * pass, and there are ~10k dead tuples to leave behind.
 *
 * VACUUM takes SHARE UPDATE EXCLUSIVE, so readers and writers run straight
 * through it. This is IO contention and nothing else.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const url = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='))
  .slice('DATABASE_URL='.length)
  .trim();

const sql = postgres(url, {
  max: 1,
  idle_timeout: 0,
  connection: { application_name: 'lcc-vacuum-judgments' },
});

const COVERAGE = `
  SELECT cov.court_name,
         min(cov.court_code) AS court_code,
         sum(cov.source_documents)::text AS source_documents,
         min(cov.year)::int AS first_year,
         max(cov.year)::int AS last_year,
         (SELECT count(*)::int FROM judgments j WHERE j.court = cov.court_name) AS held
  FROM judgment_coverage cov
  WHERE cov.source = 'aws_high_court'
  GROUP BY cov.court_name
  ORDER BY sum(cov.source_documents) DESC`;

/** What else was on the box. A timing with no witness is not a measurement. */
async function neighbours() {
  const rows = await sql`
    SELECT application_name, state, wait_event_type,
           round(extract(epoch from (now() - query_start))::numeric, 1) AS sec
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'`;
  return rows.map((r) => `${r.application_name}/${r.state}/${r.wait_event_type}@${r.sec}s`);
}

async function visibility() {
  const [r] = await sql`
    SELECT relpages, relallvisible,
           round(100.0 * relallvisible / nullif(relpages, 0), 2) AS pct
    FROM pg_class WHERE oid = 'judgments'::regclass`;
  return r;
}

async function coveragePlan() {
  const busy = await neighbours();
  const t0 = Date.now();
  const plan = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, TIMING) ${COVERAGE}`);
  const wall = Date.now() - t0;
  const text = plan.map((r) => Object.values(r)[0]).join('\n');
  return {
    wallMs: wall,
    executionMs: Number(/Execution Time: ([\d.]+) ms/.exec(text)?.[1] ?? NaN),
    heapFetches: Number(/Heap Fetches: (\d+)/.exec(text)?.[1] ?? NaN),
    sharedRead: Number(/Buffers: shared hit=\d+ read=(\d+)/.exec(text)?.[1] ?? NaN),
    concurrentBackends: busy,
  };
}

/**
 * Wait for a gap, then measure. Up to `tries` attempts, 30 s apart.
 *
 * NOT optional ceremony. The first attempt at this round measured the coverage
 * query at 198.7 s against 25.0 s the same morning, and the entire difference
 * was five of NEW1's HNSW index workers. A before/after pair where one side was
 * taken under someone else's round is not a measurement of anything.
 *
 * `lcc-citations-extract` runs a 5-backend parallel scan of `judgments` every
 * 15 minutes. It is NOT paused for this -- pausing the factory to measure it is
 * how three live-corpus tests went red on 27 Aug -- so this waits for one of its
 * gaps instead, and records what was on the box either way.
 */
async function measureWhenQuiet(tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    if ((await neighbours()).length === 0) {
      const m = await coveragePlan();
      if (m.concurrentBackends.length === 0) return { ...m, quiet: true, waitedPolls: i };
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  return { ...(await coveragePlan()), quiet: false, waitedPolls: tries };
}

/**
 * The BEFORE was taken at 05:56Z on a box verified empty by the same
 * `pg_stat_activity` sample, and is carried rather than re-run: re-measuring it
 * after the vacuum is impossible, and re-measuring it before under today's load
 * would replace a clean number with a dirty one.
 */
const RECORDED_BEFORE = {
  at: '2026-08-28T05:56:35Z',
  visibility: { relpages: 2822704, relallvisible: 2120913, pct: 75.14 },
  coverage: {
    executionMs: 25025.193,
    heapFetches: 5379222,
    sharedRead: 1932349,
    concurrentBackends: [],
  },
};

const out = { table: 'judgments', startedAt: new Date().toISOString() };
try {
  out.before = RECORDED_BEFORE;
  out.visibilityAtStart = await visibility();
  console.log('BEFORE (recorded 05:56Z, quiet box)', JSON.stringify(out.before, null, 2));
  console.log('visibility now', JSON.stringify(out.visibilityAtStart));

  console.log('\nVACUUM (ANALYZE, INDEX_CLEANUP OFF, VERBOSE) judgments — running...');
  const t0 = Date.now();
  await sql.unsafe('VACUUM (ANALYZE, INDEX_CLEANUP OFF, VERBOSE) judgments');
  out.vacuumMs = Date.now() - t0;
  console.log(`vacuum finished in ${(out.vacuumMs / 1000).toFixed(1)}s`);

  out.after = { visibility: await visibility(), coverage: await measureWhenQuiet() };
  console.log('AFTER', JSON.stringify(out.after, null, 2));

  out.finishedAt = new Date().toISOString();
  writeFileSync(
    new URL('../docs/ai/lcc-r10/vacuum-judgments.json', import.meta.url),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  console.log('\nwrote docs/ai/lcc-r10/vacuum-judgments.json');
} finally {
  await sql.end({ timeout: 10 });
}
