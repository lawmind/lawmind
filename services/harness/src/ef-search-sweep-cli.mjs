/**
 * ef_search SWEEP — the lowest setting that stops throwing away true neighbours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE HALFVEC TASK IS STILL WARN, AND WHY THIS IS WHAT CLEARS IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * halfvec matched or beat the incumbent on every task metric with a 3.0x smaller
 * index, and the task nevertheless sits at WARN on a single clause failing by
 * 0.13 of a point. Chasing that clause is the wrong move, because the same work
 * turned up a much larger number sitting underneath it: **production HNSW at
 * ef_search=40 loses roughly 6-9% of true nearest neighbours**, with the loss
 * concentrated in tail queries, costing about 1.8 points of success@5.
 *
 * A 1.8-point ANN loss is an order of magnitude more than a 0.13-point fidelity
 * clause. So the question worth answering is not "is halfvec faithful enough" but
 * **"what is the cheapest ef_search that stops throwing neighbours away, and does
 * halfvec still hold at that setting?"**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GROUND TRUTH, AND WHY IT IS NOT ANOTHER ANN RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ANN recall cannot be measured against ANN. The truth set here is an EXACT
 * scan — `enable_indexscan` and `enable_indexonlyscan` off inside the
 * transaction, so the planner has to compute every distance — which is slow and
 * is exactly why it is trustworthy. Each query's exact top-K is computed once and
 * reused for every ef_search arm, so the arms differ only by the search parameter.
 *
 * NO INDEX IS REBUILT. ef_search is a query-time GUC; rebuilding to vary it would
 * confound the setting with a different graph, and the graph is the expensive
 * thing to hold constant.
 *
 * Reported per arm: ANN recall against exact at several K, the tail (worst
 * decile) rather than only the mean — because the loss was already measured to be
 * tail-concentrated, and a mean hides exactly that — plus task metrics against
 * gold and p50/p95 latency.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const QV = JSON.parse(
  readFileSync(new URL('../../../docs/ai/new1-halfvec/eval-query-vectors.json', import.meta.url), 'utf8'),
);
const OUT = new URL('../../../docs/ai/new1-halfvec/ef-search-sweep.json', import.meta.url);

const EFS = (process.env.EFS ?? '40,80,120,200').split(',').map(Number);
const KS = [5, 10, 20, 50];
const TOPK = Math.max(...KS);
const NQ = Number(process.env.EF_QUERIES ?? 60);

const lit = (v) => '[' + v.join(',') + ']';
const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 } });
const queries = QV.queries.slice(0, NQ);

console.log('ef_search SWEEP — ' + queries.length + ' queries, top-' + TOPK + ', arms ' + EFS.join(', '));
console.log('ground truth is an EXACT scan, computed once per query\n');

/** Exact top-K. Index access disabled so the planner must compute every distance. */
async function exactTop(qv) {
  return sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL enable_indexscan = off');
    await tx.unsafe('SET LOCAL enable_indexonlyscan = off');
    return tx.unsafe(
      'SELECT id, judgment_id FROM judgment_chunks ORDER BY embedding <=> $1::vector LIMIT ' + TOPK,
      [lit(qv)],
    );
  });
}

async function annTop(qv, ef) {
  return sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL hnsw.ef_search = ' + Number(ef));
    await tx.unsafe('SET LOCAL hnsw.iterative_scan = relaxed_order');
    return tx.unsafe(
      'SELECT id, judgment_id FROM judgment_chunks ORDER BY embedding <=> $1::vector LIMIT ' + TOPK,
      [lit(qv)],
    );
  });
}

const truth = new Map();
const exactLat = [];
const t0 = Date.now();
for (const [i, q] of queries.entries()) {
  const t = Date.now();
  truth.set(q.id, await exactTop(q.vector));
  exactLat.push(Date.now() - t);
  if ((i + 1) % 10 === 0)
    console.log('  exact ' + (i + 1) + '/' + queries.length + '  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
console.log('  exact truth built in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's\n');

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pctl = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const judgmentsOf = (rows) => {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.judgment_id)) continue;
    seen.add(r.judgment_id);
    out.push(r.judgment_id);
  }
  return out;
};
const rankOf = (list, gold) => {
  for (let i = 0; i < list.length; i += 1) if (gold.includes(list[i])) return i + 1;
  return null;
};

const results = [];
for (const ef of EFS) {
  const recall = Object.fromEntries(KS.map((k) => [k, []]));
  const lat = [];
  const ranks = [];
  for (const q of queries) {
    const t = Date.now();
    const got = await annTop(q.vector, ef);
    lat.push(Date.now() - t);
    const want = truth.get(q.id);
    for (const k of KS) {
      const wantIds = new Set(want.slice(0, k).map((r) => r.id));
      const gotIds = new Set(got.slice(0, k).map((r) => r.id));
      let hit = 0;
      for (const id of wantIds) if (gotIds.has(id)) hit += 1;
      recall[k].push(wantIds.size ? hit / wantIds.size : 1);
    }
    ranks.push(rankOf(judgmentsOf(got), q.gold));
  }
  const n = ranks.length;
  const dcg = (r) => (r && r <= 10 ? 1 / Math.log2(r + 1) : 0);
  const row = {
    efSearch: ef,
    annRecall: Object.fromEntries(KS.map((k) => [k, mean(recall[k])])),
    // The loss is tail-concentrated, so the worst decile is the number that
    // matters; a mean recall of 0.94 can hide a query that lost half its pool.
    tailRecallAt10: pctl(recall[10], 0.1),
    worstRecallAt10: Math.min(...recall[10]),
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt10: ranks.reduce((a, r) => a + dcg(r), 0) / n,
    latencyMs: { mean: mean(lat), p50: pctl(lat, 0.5), p95: pctl(lat, 0.95) },
  };
  results.push(row);
  console.log(
    'ef ' + String(ef).padStart(4) +
      '  recall@10 ' + (row.annRecall[10] * 100).toFixed(1).padStart(5) + '%' +
      '  @50 ' + (row.annRecall[50] * 100).toFixed(1).padStart(5) + '%' +
      '  tail@10 ' + (row.tailRecallAt10 * 100).toFixed(1).padStart(5) + '%' +
      '  worst ' + (row.worstRecallAt10 * 100).toFixed(0).padStart(3) + '%' +
      '  s@5 ' + (row.successAt5 * 100).toFixed(1) + '%' +
      '  p50 ' + Math.round(row.latencyMs.p50) + 'ms' +
      '  p95 ' + Math.round(row.latencyMs.p95) + 'ms',
  );
}

const base = results[0];
console.log('\nagainst ef_search=' + base.efSearch + ':');
for (const r of results.slice(1))
  console.log(
    '  ef ' + String(r.efSearch).padStart(4) +
      '  +' + ((r.annRecall[10] - base.annRecall[10]) * 100).toFixed(2) + 'pt recall@10' +
      '  +' + ((r.tailRecallAt10 - base.tailRecallAt10) * 100).toFixed(2) + 'pt tail' +
      '  ' + ((r.successAt5 - base.successAt5) * 100).toFixed(2) + 'pt s@5' +
      '  latency x' + (r.latencyMs.p95 / Math.max(1, base.latencyMs.p95)).toFixed(2) + ' at p95',
  );

writeFileSync(
  OUT,
  JSON.stringify(
    {
      kind: 'new1_ef_search_sweep',
      generatedAt: new Date().toISOString(),
      queries: queries.length,
      topK: TOPK,
      groundTruth: 'exact scan, enable_indexscan/enable_indexonlyscan off',
      exactLatencyMs: { mean: mean(exactLat), p50: pctl(exactLat, 0.5), p95: pctl(exactLat, 0.95) },
      results,
    },
    null,
    2,
  ),
);
console.log('\nwrote ' + OUT.pathname);
await sql.end({ timeout: 10 });
