/** Measure the exact wire envelope of the bounded freshness object. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import postgres, { type Sql } from '../services/api/node_modules/postgres/src/index.js';

import { buildFreshnessObject } from '../services/api/src/corpus/freshness-object.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'ai', 'lcc-r10', 'freshness-benchmark.json');
const ITERATIONS = 31;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = readFileSync(join(ROOT, '.env'), 'utf8').match(/^DATABASE_URL\s*=\s*(.+?)\s*$/m);
  if (!match) throw new Error('DATABASE_URL missing');
  return match[1]!.replace(/^["']|["']$/g, '');
}

const sql = postgres(databaseUrl(), { max: 1, prepare: false, onnotice: () => {} });
const noQuerySql = new Proxy(function () {}, {
  apply() {
    throw new Error('freshness request attempted a database query');
  },
}) as unknown as Sql;

try {
  const [activity] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM pg_stat_activity
     WHERE datname = current_database() AND state = 'active'`;
  const activeQueriesAtStart = activity?.n ?? 0;
  const label = activeQueriesAtStart > 2 ? 'LOCAL_CONTENDED' : 'LOCAL_QUIET';

  const timings: number[] = [];
  let object = await buildFreshnessObject(noQuerySql);
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    object = await buildFreshnessObject(noQuerySql);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const envelope = JSON.stringify({ ok: true, data: object });
  const percentile = (p: number) => timings[Math.floor((timings.length - 1) * p)]!;
  const report = {
    artifact: 'LCC_R10_FRESHNESS_BENCHMARK',
    takenAt: new Date().toISOString(),
    label,
    activeQueriesAtStart,
    iterations: ITERATIONS,
    responseBytes: Buffer.byteLength(envelope, 'utf8'),
    courtMonthRowCount: object.courtMonthDetail.length,
    sourceSummaryRowCount: 1,
    latencyMs: {
      p50: Number(percentile(0.5).toFixed(3)),
      p95: Number(percentile(0.95).toFixed(3)),
      max: Number(timings.at(-1)!.toFixed(3)),
    },
    databaseQueriesPerRequest: 0,
    definitionVersion: object.definitionVersion,
    definitionArtifactSha256: object.definitionArtifactSha256,
    noFreshnessScore: !('freshnessScore' in object),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
