/**
 * NEW1 P3 — what does each additional ANN candidate buy?
 *
 * `retrieve.ts` asks the index for `CANDIDATE_DEPTH * 4` chunks on an unfiltered
 * search and `CANDIDATE_DEPTH * 40` on a filtered one — 200 and 2,000. Nobody has
 * measured the curve between those two numbers, and the earlier held-not-retrieved
 * work found that missed-gold PRESENCE rose sharply as the pool grew, which is a
 * different statement from "quality rose".
 *
 * The two must be separated or the answer is meaningless:
 *
 *   PRESENCE   is the gold judgment anywhere in the candidate pool? This is what
 *              depth can fix. A judgment absent from the pool cannot be recovered
 *              by any downstream reranker, ever.
 *   RESULT     is the gold judgment in the top 5 / top 20 AFTER the chunk pool is
 *              collapsed to judgments? This is what the advocate sees, and deeper
 *              pools can make it WORSE by admitting better-scoring distractors.
 *
 * A depth that raises presence and not result has bought a reranking opportunity,
 * not a retrieval improvement — and it costs latency on a route already measured
 * at p50 43s under fleet load. Both columns are printed; neither is the answer on
 * its own.
 *
 * One arm only (the production fp32 HNSW), because this is a question about depth
 * and not about representation. Query vectors are the frozen set shared with the
 * halfvec probe.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const QV = JSON.parse(
  readFileSync(new URL('../../../docs/ai/new1-halfvec/eval-query-vectors.json', import.meta.url), 'utf8'),
);
const OUT = new URL('../../../docs/ai/new1-halfvec/candidate-depth.json', import.meta.url);

const DEPTHS = (process.env.DEPTHS ?? '200,500,1000,2000').split(',').map(Number);
const EF_SEARCH = Number(process.env.PROBE_EF_SEARCH ?? 40);
const LIMIT_QUERIES = Number(process.env.PROBE_QUERIES ?? QV.queries.length);

const lit = (v) => '[' + v.join(',') + ']';
const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 } });

async function ann(q, depth) {
  return sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL hnsw.ef_search = ' + Number(EF_SEARCH));
    await tx.unsafe('SET LOCAL hnsw.iterative_scan = relaxed_order');
    return tx`
      SELECT judgment_id
      FROM judgment_chunks
      ORDER BY embedding <=> ${lit(q)}::vector
      LIMIT ${depth}
    `;
  });
}

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

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pctl = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (n) => (n * 100).toFixed(1) + '%';

const queries = QV.queries.slice(0, LIMIT_QUERIES);
console.log('CANDIDATE DEPTH — ' + queries.length + ' queries, ef_search ' + EF_SEARCH);
console.log('depths ' + DEPTHS.join(', '));
console.log('');

const rows = [];
for (const depth of DEPTHS) {
  const ranks = [];
  const present = [];
  const lat = [];
  const distinctJudgments = [];
  const t0 = Date.now();
  for (const q of queries) {
    const t = Date.now();
    const chunks = await ann(q.vector, depth);
    lat.push(Date.now() - t);
    const judgments = toJudgments(chunks);
    distinctJudgments.push(judgments.length);
    let rank = null;
    for (let i = 0; i < judgments.length; i += 1)
      if (q.gold.includes(judgments[i])) {
        rank = i + 1;
        break;
      }
    ranks.push(rank);
    present.push(rank !== null ? 1 : 0);
  }
  const n = ranks.length;
  const row = {
    depth,
    n,
    goldPresentInPool: mean(present),
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a, r) => a + (r ? 1 / r : 0), 0) / n,
    meanDistinctJudgments: mean(distinctJudgments),
    latencyMs: { mean: mean(lat), p50: pctl(lat, 0.5), p95: pctl(lat, 0.95) },
    elapsedSeconds: (Date.now() - t0) / 1000,
  };
  rows.push(row);
  console.log(
    'depth ' + String(depth).padStart(5) +
      '  present ' + pct(row.goldPresentInPool).padStart(7) +
      '  succ@5 ' + pct(row.successAt5).padStart(7) +
      '  rec@20 ' + pct(row.recallAt20).padStart(7) +
      '  MRR ' + row.mrr.toFixed(3) +
      '  judgments/pool ' + row.meanDistinctJudgments.toFixed(0).padStart(4) +
      '  p50 ' + row.latencyMs.p50 + 'ms',
  );
}

console.log('');
console.log('MARGINAL VALUE OF DEPTH');
for (let i = 1; i < rows.length; i += 1) {
  const a = rows[i - 1];
  const b = rows[i];
  const extra = b.depth - a.depth;
  console.log(
    '  +' + extra + ' candidates (' + a.depth + '→' + b.depth + '):' +
      '  presence ' + ((b.goldPresentInPool - a.goldPresentInPool) * 100).toFixed(2) + ' pts' +
      '  succ@5 ' + ((b.successAt5 - a.successAt5) * 100).toFixed(2) + ' pts' +
      '  rec@20 ' + ((b.recallAt20 - a.recallAt20) * 100).toFixed(2) + ' pts' +
      '  latency +' + (b.latencyMs.p50 - a.latencyMs.p50) + 'ms p50',
  );
}

await sql.end({ timeout: 5 });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      kind: 'new1_candidate_depth',
      generatedAt: new Date().toISOString(),
      efSearch: EF_SEARCH,
      queries: queries.length,
      arm: 'production HNSW fp32 over judgment_chunks, iterative_scan relaxed_order',
      note: 'presence and result are reported separately; a depth that raises presence without raising result has bought a reranking opportunity, not a retrieval improvement',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log('\nartifact written');
