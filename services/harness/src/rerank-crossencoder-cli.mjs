/**
 * CROSS-ENCODER RERANK — the only route the ablation left standing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS, AND WHY ONLY AFTER THE ABLATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The feature baseline appeared to move success@5 by +21.5 points and then its
 * own ablation took the number away: 278 of 278 gold authorities in this
 * benchmark are inbound-cited, so `inbound` was recognising which documents were
 * ELIGIBLE to be gold rather than which were relevant. Strip every document
 * prior and keep only features computed from this query against this document,
 * and the gain collapses to **+0.69 points**.
 *
 * That is the precise result that makes a cross-encoder worth measuring, and it
 * is a different reason from the one usually given. The claim is not "rerankers
 * are good". It is that interaction signals we can currently compute are almost
 * worthless, and a cross-encoder is the only interaction signal we have that is
 * qualitatively different: the bi-encoder compresses the query to 1,024 numbers
 * before it ever meets the passage, while the cross-encoder reads both together
 * in one forward pass. If that also buys nothing, the ordering problem is not
 * solvable at the reranking stage and the lane should stop spending on it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS SCORED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The passages are the CHUNKS the ANN actually returned, not a summary or the
 * document head — reranking has to see what retrieval saw. Chunk scores are
 * MAX-pooled to the judgment, matching how `retrieve.ts` folds chunks into
 * documents, so the arm differs from the dense control by the ordering and by
 * nothing else.
 *
 * Pools come frozen from `pools.json`, the same candidates the feature baseline
 * and the ablation used. Headline numbers are the held-out test split, for
 * comparability with those runs, even though nothing here is fitted.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

import { getReranker } from '@lawmind/embed';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const POOLS = JSON.parse(readFileSync(new URL('../../../docs/ai/new1-rerank/pools.json', import.meta.url), 'utf8'));
const OUT = new URL('../../../docs/ai/new1-rerank/rerank-crossencoder.json', import.meta.url);

const DEPTH = Number(process.env.RERANK_DEPTH ?? 50);
const LIMIT = Number(process.env.RERANK_QUERIES ?? Infinity);
const SPLIT = process.env.RERANK_SPLIT ?? 'test';

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 } });

const queries = POOLS.queries.filter((q) => q.text && (SPLIT === 'all' || q.split === SPLIT)).slice(0, LIMIT);
console.log('CROSS-ENCODER RERANK — ' + queries.length + ' ' + SPLIT + ' queries, depth ' + DEPTH);

// ── chunk text for every candidate the arm will score ────────────────────────
const wanted = new Map();
for (const q of queries) {
  for (const r of (POOLS.pools[q.id] ?? []).slice(0, DEPTH)) wanted.set(r.judgment_id + ':' + r.chunk_index, r);
}
const keys = [...wanted.keys()];
const chunkText = new Map();
for (let i = 0; i < keys.length; i += 1000) {
  const slice = keys.slice(i, i + 1000);
  const jids = slice.map((k) => k.slice(0, 36));
  const idxs = slice.map((k) => Number(k.slice(37)));
  const rows = await sql`
    SELECT judgment_id, chunk_index, chunk_text
    FROM judgment_chunks
    WHERE (judgment_id, chunk_index) IN (
      SELECT * FROM unnest(${jids}::uuid[], ${idxs}::int[])
    )
  `;
  for (const r of rows) chunkText.set(r.judgment_id + ':' + r.chunk_index, r.chunk_text);
}
console.log('chunk text for ' + chunkText.size + ' of ' + keys.length + ' candidate chunks');

const reranker = await getReranker();
console.log('reranker loaded\n');

const dcg = (r) => (r && r <= 10 ? 1 / Math.log2(r + 1) : 0);
function metrics(ranks) {
  const n = ranks.length;
  return {
    n,
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt10: ranks.reduce((a, r) => a + dcg(r), 0) / n,
    goldPresent: ranks.filter((r) => r !== null).length / n,
  };
}
const rankOf = (ordered, gold) => {
  for (let i = 0; i < ordered.length; i += 1) if (gold.includes(ordered[i])) return i + 1;
  return null;
};

const denseRanks = [];
const ceRanks = [];
const lat = [];
const pairsPerQuery = [];
const t0 = Date.now();

for (const [qi, q] of queries.entries()) {
  const rows = (POOLS.pools[q.id] ?? []).slice(0, DEPTH);

  // dense control: first appearance of a judgment in ANN order
  const denseOrder = [];
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.judgment_id)) continue;
    seen.add(r.judgment_id);
    denseOrder.push(r.judgment_id);
  }
  denseRanks.push(rankOf(denseOrder, q.gold));

  const scorable = rows.filter((r) => chunkText.has(r.judgment_id + ':' + r.chunk_index));
  const passages = scorable.map((r) => chunkText.get(r.judgment_id + ':' + r.chunk_index));
  if (passages.length === 0) {
    ceRanks.push(denseRanks[denseRanks.length - 1]);
    continue;
  }
  const t = Date.now();
  const scores = await reranker.score(q.text, passages);
  lat.push(Date.now() - t);
  pairsPerQuery.push(passages.length);

  // MAX-pool chunk scores to the judgment, as retrieve.ts does
  const best = new Map();
  scorable.forEach((r, i) => {
    const cur = best.get(r.judgment_id);
    if (cur === undefined || scores[i] > cur) best.set(r.judgment_id, scores[i]);
  });
  const ceOrder = [...best.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  ceRanks.push(rankOf(ceOrder, q.gold));

  if ((qi + 1) % 10 === 0)
    console.log(
      '  ' + (qi + 1) + '/' + queries.length +
        '  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's' +
        '  ' + (pairsPerQuery.reduce((a, b) => a + b, 0) / ((Date.now() - t0) / 1000)).toFixed(1) + ' pairs/s',
    );
}

const dense = metrics(denseRanks);
const ce = metrics(ceRanks);
const pctl = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const d = (a, b) => ((b - a) * 100).toFixed(2);

console.log('\nDENSE  s@5 ' + (dense.successAt5 * 100).toFixed(1) + '%  r@20 ' + (dense.recallAt20 * 100).toFixed(1) +
  '%  mrr ' + dense.mrr.toFixed(3) + '  ndcg@10 ' + dense.ndcgAt10.toFixed(3) + '  present ' + (dense.goldPresent * 100).toFixed(1) + '%');
console.log('CROSS  s@5 ' + (ce.successAt5 * 100).toFixed(1) + '%  r@20 ' + (ce.recallAt20 * 100).toFixed(1) +
  '%  mrr ' + ce.mrr.toFixed(3) + '  ndcg@10 ' + ce.ndcgAt10.toFixed(3));
console.log('Δ      s@5 ' + d(dense.successAt5, ce.successAt5) + 'pt  r@20 ' + d(dense.recallAt20, ce.recallAt20) +
  'pt  mrr ' + (ce.mrr - dense.mrr).toFixed(4));
console.log('latency/query  mean ' + Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) + 'ms  p50 ' +
  pctl(lat, 0.5) + 'ms  p95 ' + pctl(lat, 0.95) + 'ms');

writeFileSync(
  OUT,
  JSON.stringify(
    {
      kind: 'new1_rerank_crossencoder',
      generatedAt: new Date().toISOString(),
      model: 'bge-reranker-v2-m3',
      dtype: process.env['RERANK_DTYPE'] ?? 'q8',
      split: SPLIT,
      depth: DEPTH,
      queries: queries.length,
      meanPairsPerQuery: pairsPerQuery.reduce((a, b) => a + b, 0) / Math.max(1, pairsPerQuery.length),
      dense,
      crossEncoder: ce,
      latencyMs: { mean: lat.reduce((a, b) => a + b, 0) / lat.length, p50: pctl(lat, 0.5), p95: pctl(lat, 0.95) },
    },
    null,
    2,
  ),
);
console.log('\nwrote ' + OUT.pathname);
await sql.end({ timeout: 10 });
