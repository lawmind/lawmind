/**
 * LCC-4b — THE PRODUCTION RETRIEVAL LATENCY ENVELOPE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT MEASURES AND WHY THROUGH THE APP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Eight query shapes the plan names, driven through `createApp` — the real Hono
 * app — rather than through `hybridSearch` directly.
 *
 * That is not ceremony. NEW1's `production-route-benchmark` imported
 * `search/retrieve` and skipped the 500-character validator, `answerStructured`'s
 * exact-identity gate and `embedQuery`'s budget, and its dense arm never ran; it
 * reported a number about a function rather than about the product. The
 * admission gate in particular lives at the ROUTE, so a measurement that bypasses
 * it cannot see the thing LCC-4 exists to bound.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT CLAIM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `embedQuery` returns null, so the DENSE arm is not exercised. Every number
 * here is the sparse ‖ structured path only, and that is stated in the output
 * rather than left for a reader to assume. A GPU embedder would put this back in
 * contention with NEW1's walk, which is the one thing the quiet window exists to
 * prevent.
 *
 * Peak DB memory is NOT measured, because PostgreSQL does not expose per-backend
 * peak allocation and inventing a number for it would be worse than reporting
 * its absence. What IS measured is temp bytes written, which is the observable
 * proxy: a sort that spills is a sort that exceeded work_mem.
 */
import { performance } from 'node:perf_hooks';

import postgres from 'postgres';

import { createApp } from '../services/api/src/app.ts';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is required');

const sql = postgres(url, { max: 8, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

type Shape = { name: string; query: string; note: string };

/**
 * The eight shapes, each chosen for the failure it can expose rather than for
 * being representative traffic.
 */
const SHAPES: Shape[] = [
  {
    name: 'citation/exact',
    query: '(1950) 1 SCR 1008',
    note: 'exact identity — must not fall through to the ranker',
  },
  {
    name: 'case number',
    query: 'caseno:CRL.P/1448/2017',
    note: 'ambiguity is expected and correct here',
  },
  {
    name: 'title',
    query: 'Kesavananda Bharati',
    note: 'a name, not a concept',
  },
  {
    name: 'normal concept',
    query: 'anticipatory bail in economic offences',
    note: 'the ordinary advocate query',
  },
  {
    name: 'long rare',
    query:
      'departmental proceedings following acquittal on the criminal charge where the delinquent employee was dismissed by the disciplinary authority without a fresh enquiry into the same allegations',
    note: 'rare lexemes, long input — the shape that stayed enabled at 10.7s in R4',
  },
  {
    name: 'all-common',
    query: 'the court of the state in a case of the order',
    note: 'THE CATASTROPHIC ONE — must be refused before ranking, sparse_unbounded',
  },
  {
    name: 'saved-search',
    query: 'bail anticipatory',
    note: 'the feed shape; gated only since today',
  },
  {
    name: 'counterargument',
    query: 'breach of contract damages for delayed delivery of goods',
    note: 'the shape R4 measured at 8.4s / 20.0s / 13.8s',
  },
];

const REPEATS = Number(process.env['ENVELOPE_REPEATS'] ?? 5);

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

async function dbSnapshot() {
  const [row] = await sql<
    { active: string; total: string; longest: string; temp_bytes: string; max_conn: string }[]
  >`
    SELECT (SELECT count(*)::text FROM pg_stat_activity
             WHERE backend_type='client backend' AND state='active') AS active,
           (SELECT count(*)::text FROM pg_stat_activity
             WHERE backend_type='client backend') AS total,
           (SELECT COALESCE(max(EXTRACT(EPOCH FROM (now()-query_start))),0)::text
              FROM pg_stat_activity WHERE state='active') AS longest,
           (SELECT COALESCE(temp_bytes,0)::text FROM pg_stat_database
             WHERE datname = current_database()) AS temp_bytes,
           current_setting('max_connections') AS max_conn`;
  return row!;
}

async function main() {
  const before = await dbSnapshot();
  const startedAt = new Date().toISOString();
  const results: Record<string, unknown>[] = [];

  console.log(`LCC-4b RETRIEVAL LATENCY ENVELOPE   ${startedAt}`);
  console.log(`repeats per shape: ${REPEATS}   ·   dense arm: NOT exercised (embedQuery -> null)`);
  console.log('');
  console.log(
    ['SHAPE'.padEnd(17), 'n'.padStart(3), 'p50'.padStart(7), 'p95'.padStart(7), 'max'.padStart(7), 'RESULTS'.padStart(8), 'HTTP'.padStart(5), 'DEGRADED'].join(' '),
  );
  console.log('-'.repeat(96));

  for (const shape of SHAPES) {
    const times: number[] = [];
    let status = 0;
    let count = 0;
    let degraded: string[] = [];
    let errorText: string | null = null;

    for (let i = 0; i < REPEATS; i += 1) {
      const t0 = performance.now();
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        /* `language` is REQUIRED by `searchRequest` — not optional. Omitting it
         * 400s every shape in 0ms, which looks exactly like a very fast search
         * and is how a benchmark ends up measuring its own validator. */
        body: JSON.stringify({ query: shape.query, language: 'en' }),
      });
      const ms = performance.now() - t0;
      times.push(ms);
      status = res.status;
      const body = (await res.json().catch(() => null)) as
        | { data?: { results?: unknown[]; degraded?: string[] }; error?: { message?: string } }
        | null;
      if (body?.data) {
        count = body.data.results?.length ?? 0;
        degraded = body.data.degraded ?? [];
      } else if (body?.error) {
        errorText = body.error.message ?? 'error';
      }
    }

    const sorted = [...times].sort((a, b) => a - b);
    const row = {
      shape: shape.name,
      note: shape.note,
      query: shape.query,
      n: times.length,
      p50Ms: Math.round(pct(sorted, 50)),
      p95Ms: Math.round(pct(sorted, 95)),
      maxMs: Math.round(sorted[sorted.length - 1] ?? 0),
      httpStatus: status,
      results: count,
      degraded,
      error: errorText,
    };
    results.push(row);
    console.log(
      [
        shape.name.padEnd(17),
        String(row.n).padStart(3),
        `${row.p50Ms}ms`.padStart(7),
        `${row.p95Ms}ms`.padStart(7),
        `${row.maxMs}ms`.padStart(7),
        String(row.results).padStart(8),
        String(row.httpStatus).padStart(5),
        degraded.length ? degraded.join(',') : '-',
      ].join(' '),
    );
  }

  const after = await dbSnapshot();
  const tempDelta = Number(after.temp_bytes) - Number(before.temp_bytes);

  console.log('');
  console.log('RESOURCE:');
  console.log(`  connections     ${before.total} -> ${after.total} of ${after.max_conn}`);
  console.log(`  longest stmt    ${Math.round(Number(after.longest))}s`);
  console.log(
    `  temp bytes      ${tempDelta >= 0 ? '+' : ''}${(tempDelta / 1024 / 1024).toFixed(2)} MiB written during the run`,
  );
  console.log(
    tempDelta === 0
      ? '                  (zero spill — no sort exceeded work_mem)'
      : '                  (a spill is a sort that exceeded work_mem)',
  );

  const artefact = {
    startedAt,
    finishedAt: new Date().toISOString(),
    repeats: REPEATS,
    denseArmExercised: false,
    shapes: results,
    resource: {
      connectionsBefore: Number(before.total),
      connectionsAfter: Number(after.total),
      maxConnections: Number(after.max_conn),
      longestStatementSeconds: Math.round(Number(after.longest)),
      tempBytesDelta: tempDelta,
    },
  };
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('docs/ai/lcc', { recursive: true });
  writeFileSync('docs/ai/lcc/LATENCY_ENVELOPE_2026-08-25.json', JSON.stringify(artefact, null, 2));
  console.log('');
  console.log('artefact: docs/ai/lcc/LATENCY_ENVELOPE_2026-08-25.json');
  await sql.end({ timeout: 5 });
}

await main();
