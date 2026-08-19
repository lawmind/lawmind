/**
 * NEW1 C3 + C4 — halfvec fidelity at the ANN layer and at the TASK layer.
 *
 * CX1 closed C1 (representation distance error, negligible) and C2 (exact-NN
 * overlap, ~1.000 at every k). Those measure the NUMBERS. They cannot answer the
 * two questions production actually turns on:
 *
 *   C3  once an APPROXIMATE graph is built over the smaller representation, does
 *       the graph still find what an exact search finds?
 *   C4  after chunk hits are folded into judgments and ranked, does the ADVOCATE
 *       see a different answer?
 *
 * Three arms, one query set, one embedder:
 *
 *   EXACT_FP32     ground truth. `new1_fp32_probe`, index scans disabled, so the
 *                  planner cannot substitute an approximate answer.
 *   HNSW_FP32      the PRODUCTION index on `judgment_chunks` (m=16, ef_construction=64).
 *   HNSW_HALFVEC   `new1_halfvec_probe`, IDENTICAL HNSW parameters, so the only
 *                  difference between arms 2 and 3 is the representation.
 *
 * Deliberately excluded: the `text_quality` re-weighting production applies after
 * the ANN step. It is a monotone perturbation applied identically to all three
 * arms, and leaving it out keeps this a measurement of the representation rather
 * than of the weighting. C4's absolute numbers are therefore not production's
 * numbers — the DIFFERENCES between arms are the finding.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const QV = JSON.parse(
  readFileSync(new URL('../../../docs/ai/new1-halfvec/eval-query-vectors.json', import.meta.url), 'utf8'),
);
const OUT = new URL('../../../docs/ai/new1-halfvec/task-fidelity.json', import.meta.url);

const LIMIT_QUERIES = Number(process.env.PROBE_QUERIES ?? QV.queries.length);
const ANN_DEPTH = Number(process.env.PROBE_ANN_DEPTH ?? 2000);
const EF_SEARCH = Number(process.env.PROBE_EF_SEARCH ?? 40);
const KS = [5, 10, 20, 50];

const lit = (v) => '[' + v.join(',') + ']';

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 } });

async function exactFp32(q, depth) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL enable_indexscan = off`;
    await tx`SET LOCAL enable_bitmapscan = off`;
    return tx`
      SELECT id, judgment_id
      FROM new1_fp32_probe
      ORDER BY embedding <=> ${lit(q)}::vector
      LIMIT ${depth}
    `;
  });
}

async function hnswFp32(q, depth) {
  return sql.begin(async (tx) => {
    // SET takes no bind parameters, so the value is coerced to a number and interpolated.
    await tx.unsafe('SET LOCAL hnsw.ef_search = ' + Number(EF_SEARCH));
    await tx.unsafe('SET LOCAL hnsw.iterative_scan = relaxed_order');
    return tx`
      SELECT id, judgment_id
      FROM judgment_chunks
      ORDER BY embedding <=> ${lit(q)}::vector
      LIMIT ${depth}
    `;
  });
}

async function hnswHalfvec(q, depth) {
  return sql.begin(async (tx) => {
    // SET takes no bind parameters, so the value is coerced to a number and interpolated.
    await tx.unsafe('SET LOCAL hnsw.ef_search = ' + Number(EF_SEARCH));
    await tx.unsafe('SET LOCAL hnsw.iterative_scan = relaxed_order');
    return tx`
      SELECT id, judgment_id
      FROM new1_halfvec_probe
      ORDER BY embedding <=> ${lit(q)}::halfvec
      LIMIT ${depth}
    `;
  });
}

/** chunk rows to judgment ids, nearest-first, first sighting wins (production's rule). */
function toJudgments(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.judgment_id)) continue;
    seen.add(r.judgment_id);
    out.push(r.judgment_id);
  }
  return out;
}

function goldRank(list, gold) {
  for (let i = 0; i < list.length; i += 1) if (gold.includes(list[i])) return i + 1;
  return null;
}

function overlapAtK(a, b, k) {
  const set = new Set(b.slice(0, k));
  let n = 0;
  for (const x of a.slice(0, k)) if (set.has(x)) n += 1;
  return n / k;
}

function ndcgAtK(ranks, k) {
  let sum = 0;
  for (const r of ranks) if (r !== null && r <= k) sum += 1 / Math.log2(r + 1);
  return sum / ranks.length;
}

function metrics(ranks) {
  const n = ranks.length;
  return {
    n,
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt5: ndcgAtK(ranks, 5),
    ndcgAt20: ndcgAtK(ranks, 20),
  };
}

const arms = {
  EXACT_FP32: exactFp32,
  HNSW_FP32: hnswFp32,
  HNSW_HALFVEC: hnswHalfvec,
};

const results = { EXACT_FP32: [], HNSW_FP32: [], HNSW_HALFVEC: [] };
const latency = { EXACT_FP32: [], HNSW_FP32: [], HNSW_HALFVEC: [] };
const annRecall = { HNSW_FP32: {}, HNSW_HALFVEC: {} };
for (const k of KS) {
  annRecall.HNSW_FP32[k] = [];
  annRecall.HNSW_HALFVEC[k] = [];
}

const queries = QV.queries.slice(0, LIMIT_QUERIES);
console.log('C3/C4 probe — ' + queries.length + ' queries, annDepth ' + ANN_DEPTH + ', ef_search ' + EF_SEARCH);
const t0 = Date.now();
for (const [qi, q] of queries.entries()) {
  const chunkLists = {};
  for (const [name, fn] of Object.entries(arms)) {
    const t = Date.now();
    const rows = await fn(q.vector, ANN_DEPTH);
    latency[name].push(Date.now() - t);
    chunkLists[name] = rows;
    results[name].push({ id: q.id, judgments: toJudgments(rows) });
  }
  const truth = chunkLists.EXACT_FP32.map((r) => r.id);
  for (const name of ['HNSW_FP32', 'HNSW_HALFVEC']) {
    const got = chunkLists[name].map((r) => r.id);
    for (const k of KS) annRecall[name][k].push(overlapAtK(got, truth, k));
  }
  if ((qi + 1) % 20 === 0 || qi === queries.length - 1)
    console.log('  ' + (qi + 1) + '/' + queries.length + '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pctl = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

const goldById = new Map(queries.map((q) => [q.id, q.gold]));
const ranksByArm = {};
for (const name of Object.keys(arms))
  ranksByArm[name] = results[name].map((r) => goldRank(r.judgments, goldById.get(r.id)));

const judgmentOverlap = { HNSW_FP32: {}, HNSW_HALFVEC: {} };
for (const name of ['HNSW_FP32', 'HNSW_HALFVEC']) {
  for (const k of [5, 20, 50]) {
    judgmentOverlap[name][k] = mean(
      results[name].map((r, i) => overlapAtK(r.judgments, results.EXACT_FP32[i].judgments, k)),
    );
  }
}

const movement = {};
for (const name of ['HNSW_FP32', 'HNSW_HALFVEC']) {
  const deltas = [];
  let lostFromTop5 = 0;
  let gainedIntoTop5 = 0;
  let bothMissing = 0;
  ranksByArm[name].forEach((r, i) => {
    const e = ranksByArm.EXACT_FP32[i];
    if (e === null && r === null) bothMissing += 1;
    if (e !== null && r !== null) deltas.push(r - e);
    const eHit = e !== null && e <= 5;
    const rHit = r !== null && r <= 5;
    if (eHit && !rHit) lostFromTop5 += 1;
    if (!eHit && rHit) gainedIntoTop5 += 1;
  });
  movement[name] = {
    meanRankDelta: deltas.length ? mean(deltas) : null,
    maxRankDelta: deltas.length ? Math.max(...deltas) : null,
    minRankDelta: deltas.length ? Math.min(...deltas) : null,
    identicalRank: deltas.filter((d) => d === 0).length,
    comparableQueries: deltas.length,
    lostFromTop5,
    gainedIntoTop5,
    bothMissing,
  };
}

const sizes = await sql`
  SELECT 'HNSW_FP32' AS arm, pg_relation_size('judgment_chunks_embedding_hnsw') AS index_bytes
  UNION ALL
  SELECT 'HNSW_HALFVEC', pg_relation_size('new1_halfvec_probe_hnsw')
`;
await sql.end({ timeout: 5 });

const artifact = {
  kind: 'new1_halfvec_task_fidelity',
  generatedAt: new Date().toISOString(),
  queries: queries.length,
  annDepth: ANN_DEPTH,
  efSearch: EF_SEARCH,
  note: 'text_quality re-weighting excluded on purpose; identical across arms',
  annRecall: Object.fromEntries(
    Object.entries(annRecall).map(([arm, byK]) => [
      arm,
      Object.fromEntries(
        Object.entries(byK).map(([k, v]) => [
          k,
          { mean: mean(v), p05: pctl(v, 0.05), min: Math.min(...v) },
        ]),
      ),
    ]),
  ),
  taskMetrics: Object.fromEntries(Object.entries(ranksByArm).map(([k, v]) => [k, metrics(v)])),
  judgmentCandidateOverlap: judgmentOverlap,
  goldRankMovement: movement,
  latencyMs: Object.fromEntries(
    Object.entries(latency).map(([k, v]) => [
      k,
      { mean: mean(v), p50: pctl(v, 0.5), p95: pctl(v, 0.95) },
    ]),
  ),
  indexBytes: Object.fromEntries(sizes.map((r) => [r.arm, Number(r.index_bytes)])),
};

writeFileSync(OUT, JSON.stringify(artifact, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      annRecall: artifact.annRecall,
      taskMetrics: artifact.taskMetrics,
      movement,
      latency: artifact.latencyMs,
      indexBytes: artifact.indexBytes,
    },
    null,
    2,
  ),
);
console.log('artifact written');
