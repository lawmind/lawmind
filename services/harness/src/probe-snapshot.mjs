/**
 * NEW1 P5/P6 — freeze a comparable fp32 / halfvec pair at a declared checkpoint.
 *
 * WHY A SNAPSHOT AND NOT THE LIVE TABLE
 * -------------------------------------
 * `new1_doc_vector_stage` gains about 8,000 rows every seventeen minutes for the
 * next ten days. Two arms measured against it minutes apart are measured against
 * different corpora, and the difference would be attributed to the
 * representation. The halfvec verdict has already been muddled once; it is not
 * going to be muddled by a moving denominator.
 *
 * So each milestone cuts a pair of tables from the stage table AS IT IS, builds
 * one HNSW graph on each with identical parameters, and records the row count and
 * the index sizes. Everything downstream — the halfvec comparison at
 * ef_search=200, the expanded HC benchmark, candidate-depth work — reads the
 * snapshot and can say exactly what population it is about.
 *
 * WHY BOTH TYPES AT ONCE
 * ----------------------
 * The two arms have to see the same rows, the same recipe and the same graph
 * parameters or the comparison is not a comparison. Building them in one run from
 * one SELECT is the cheapest way to make that true rather than merely intended.
 *
 * The previous probe tables were dropped once the fidelity verdict issued, which
 * is why this has to be rebuilt rather than resumed. Drop these the same way when
 * their verdict lands: they are about 1.5 GB together plus indexes.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const LABEL = process.env.MILESTONE ?? '250k';
const M = Number(process.env.HNSW_M ?? 16);
const EFC = Number(process.env.HNSW_EF_CONSTRUCTION ?? 64);
const FP32 = `new1_probe_fp32_${LABEL}`;
const HALF = `new1_probe_half_${LABEL}`;
const OUT = new URL(`../../../docs/ai/new1-halfvec/snapshot-${LABEL}.json`, import.meta.url);

// Statement timeout OFF: an HNSW build over a quarter of a million vectors takes
// minutes, and a timeout here leaves a half-built index that reads as a failure
// of the arm rather than of the clock.
const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 }, onnotice: () => {} });

const t0 = Date.now();
const step = async (name, fn) => {
  const t = Date.now();
  const out = await fn();
  const secs = (Date.now() - t) / 1000;
  console.log(`  ${name.padEnd(34)} ${secs.toFixed(1)}s`);
  return { out, secs };
};

console.log(`snapshot ${LABEL}  m=${M} ef_construction=${EFC}`);

await sql.unsafe(`DROP TABLE IF EXISTS ${FP32}`);
await sql.unsafe(`DROP TABLE IF EXISTS ${HALF}`);

// One SELECT, two tables: the halfvec arm is a cast of exactly the rows the fp32
// arm holds, so "same embeddings" is structural rather than asserted.
const copy = await step('copy fp32 arm', () =>
  sql.unsafe(`
    CREATE TABLE ${FP32} AS
    SELECT judgment_id, court, year, embedded_chars, tokens, embedding
    FROM new1_doc_vector_stage
  `),
);
await step('copy halfvec arm', () =>
  sql.unsafe(`
    CREATE TABLE ${HALF} AS
    SELECT judgment_id, court, year, embedded_chars, tokens, embedding::halfvec(1024) AS embedding
    FROM ${FP32}
  `),
);

const [{ n }] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${FP32}`);
const [{ nh }] = await sql.unsafe(`SELECT count(*)::int AS nh FROM ${HALF}`);
if (n !== nh) throw new Error(`arms disagree on row count: fp32 ${n}, halfvec ${nh}`);

const fp32Build = await step('build fp32 HNSW', () =>
  sql.unsafe(
    `CREATE INDEX ${FP32}_hnsw ON ${FP32} USING hnsw (embedding vector_cosine_ops) WITH (m = ${M}, ef_construction = ${EFC})`,
  ),
);
const halfBuild = await step('build halfvec HNSW', () =>
  sql.unsafe(
    `CREATE INDEX ${HALF}_hnsw ON ${HALF} USING hnsw (embedding halfvec_cosine_ops) WITH (m = ${M}, ef_construction = ${EFC})`,
  ),
);

const sizes = await sql.unsafe(`
  SELECT relname, pg_total_relation_size(oid) AS bytes
  FROM pg_class
  WHERE relname IN ('${FP32}', '${HALF}', '${FP32}_hnsw', '${HALF}_hnsw')
  ORDER BY relname
`);

const report = {
  kind: 'new1_probe_snapshot',
  milestone: LABEL,
  rows: n,
  hnsw: { m: M, efConstruction: EFC },
  fp32Table: FP32,
  halfvecTable: HALF,
  buildSeconds: { fp32: fp32Build.secs, halfvec: halfBuild.secs, copy: copy.secs },
  sizes: Object.fromEntries(sizes.map((s) => [s.relname, Number(s.bytes)])),
  totalSeconds: (Date.now() - t0) / 1000,
  builtAt: new Date().toISOString(),
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

console.log(`\nrows ${n}`);
for (const s of sizes) console.log(`  ${s.relname.padEnd(28)} ${(Number(s.bytes) / 1024 / 1024).toFixed(0)} MB`);
console.log(`\nwrote ${OUT.pathname}`);
await sql.end({ timeout: 10 });
