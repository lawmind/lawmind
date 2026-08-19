/**
 * Vectors per DOCUMENT, measured. CX1's embedding-eligibility scenarios all use
 * `Vectors/doc = 1`; the production index does not.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim();
const sql = postgres(url, { max: 2, idle_timeout: 30 });

const t = Date.now();
const agg = await sql`
  WITH per AS (
    SELECT judgment_id, count(*)::int AS n
      FROM judgment_chunks
     WHERE embedding IS NOT NULL
     GROUP BY judgment_id
  )
  SELECT count(*)::int                                              AS documents,
         sum(n)::bigint                                             AS chunks,
         (avg(n))::float8                                           AS mean,
         (percentile_cont(0.50) WITHIN GROUP (ORDER BY n))::float8  AS p50,
         (percentile_cont(0.90) WITHIN GROUP (ORDER BY n))::float8  AS p90,
         (percentile_cont(0.99) WITHIN GROUP (ORDER BY n))::float8  AS p99,
         max(n)::int                                                AS max
    FROM per`;
const a = agg[0];
console.log(`measured in ${Date.now() - t}ms`);
console.log(`documents with vectors : ${a.documents.toLocaleString()}`);
console.log(`vectors                : ${Number(a.chunks).toLocaleString()}`);
console.log(`vectors per document   : mean ${a.mean.toFixed(2)} · p50 ${a.p50} · p90 ${a.p90} · p99 ${a.p99} · max ${a.max}`);

/** CX1's tiers, restated with the measured multiplier instead of 1. */
const FP32 = 13778.58;
const HALF = 5571.26;
const GiB = 1024 ** 3;
const scenarios = [
  ['MINIMAL', 1743908],
  ['BALANCED', 2651123],
  ['AGGRESSIVE', 5880811],
];
console.log('\nCX1 scenarios restated at the MEASURED vectors/doc');
console.log('scenario      docs        CX1 vectors    measured vectors   fp32 GiB    halfvec GiB');
for (const [name, docs] of scenarios) {
  const v = docs * a.mean;
  console.log(
    `${name.padEnd(12)} ${docs.toLocaleString().padStart(10)}  ${docs.toLocaleString().padStart(13)}  ` +
      `${Math.round(v).toLocaleString().padStart(16)}  ${((v * FP32) / GiB).toFixed(0).padStart(9)}  ${((v * HALF) / GiB).toFixed(0).padStart(13)}`,
  );
}

writeFileSync(
  'docs/ai/new1-post-0055/vectors-per-document.json',
  JSON.stringify(
    {
      kind: 'new1_vectors_per_document',
      createdAt: new Date().toISOString(),
      measured: a,
      bytesPerVector: { fp32: FP32, halfvec: HALF, source: 'CX1 CX1_VECTOR_CAPACITY_BENCHMARK, ~600k scale' },
      restatedScenarios: scenarios.map(([name, docs]) => ({
        scenario: name,
        documents: docs,
        cx1Vectors: docs,
        measuredVectors: Math.round(docs * a.mean),
        fp32GiB: Number(((docs * a.mean * FP32) / GiB).toFixed(1)),
        halfvecGiB: Number(((docs * a.mean * HALF) / GiB).toFixed(1)),
      })),
      caveat:
        'chunks/doc is measured on a Supreme-Court-only embedded population; High Court documents are shorter on average (CX1 class means run 436-21,053 chars against SC), so this multiplier is an UPPER bound for a mixed pilot and must be re-measured per class before it sizes a purchase.',
    },
    null,
    2,
  ),
);
console.log('\nwrote docs/ai/new1-post-0055/vectors-per-document.json');
await sql.end();
