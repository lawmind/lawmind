/**
 * RERANKER BASELINE — P6. Rescore an existing dense candidate pool with features
 * we already trust, before any model is trained or downloaded.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `candidate-depth-probe.mjs` measured the thing that makes a reranker the
 * lane's highest-value quality work: going from 200 to 2,000 candidates bought
 * +15.7 points of gold PRESENCE and 0.00 points of success@5. The right
 * authority is already in the pool. Nothing reorders it.
 *
 * So the question this file answers is narrow and cheap: **how much of that
 * buried gold can be recovered with signals that already exist in the database,
 * with no new model at all?** That number is the bar any cross-encoder has to
 * beat to justify its latency — and if a linear rescore over eight features
 * closes most of the gap, the cross-encoder is not the next piece of work.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LEAKAGE RULE, AND WHY THE SPLIT IS BY AUTHORITY AND NOT BY QUERY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Weights fitted and reported on the same queries measure memorisation, not
 * ranking. Splitting by QUERY is not enough either: two queries can share a gold
 * authority, so a weight that happens to favour that one judgment would be
 * scored on a case family it was fitted on. The split here is therefore keyed on
 * the GOLD JUDGMENT ID — a case family lands wholly in dev or wholly in test,
 * never both. Fitting reads dev only. Every headline number is test only.
 *
 * This is also why the DENSE control is recomputed inside each split rather than
 * taken from the depth probe: a control measured on a different population is
 * not a control.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const QV = JSON.parse(
  readFileSync(new URL('../../../docs/ai/new1-halfvec/eval-query-vectors.json', import.meta.url), 'utf8'),
);
const FIX = JSON.parse(readFileSync(new URL('./fixtures/queries.eval.json', import.meta.url), 'utf8'));
const OUT = new URL('../../../docs/ai/new1-rerank/reranker-baseline.json', import.meta.url);
const POOL_CACHE = new URL('../../../docs/ai/new1-rerank/pools.json', import.meta.url);

const DEPTHS = (process.env.DEPTHS ?? '50,100,200').split(',').map(Number);
const EF_SEARCH = Number(process.env.PROBE_EF_SEARCH ?? 40);
const LIMIT_QUERIES = Number(process.env.PROBE_QUERIES ?? QV.queries.length);

const lit = (v) => '[' + v.join(',') + ']';
const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 } });

const textById = new Map(FIX.queries.map((q) => [q.id, q.query]));

/** dev when the FIRST gold authority hashes even. A case family never splits. */
function splitOf(q) {
  const key = q.gold[0] ?? q.id;
  return createHash('sha1').update(String(key)).digest()[0] % 2 === 0 ? 'dev' : 'test';
}

async function ann(qv, depth) {
  return sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL hnsw.ef_search = ' + Number(EF_SEARCH));
    await tx.unsafe('SET LOCAL hnsw.iterative_scan = relaxed_order');
    return tx.unsafe(
      'SELECT judgment_id, chunk_index, (embedding <=> $1::vector) AS dist ' +
        'FROM judgment_chunks ORDER BY embedding <=> $1::vector LIMIT ' + Number(depth),
      [lit(qv)],
    );
  });
}

/** Pool rows -> one row per judgment, dense order preserved as the control. */
function foldToJudgments(rows) {
  const by = new Map();
  rows.forEach((r, i) => {
    const sim = 1 - Number(r.dist);
    let e = by.get(r.judgment_id);
    if (!e) {
      e = { judgmentId: r.judgment_id, bestSim: sim, sims: [], chunkCount: 0, bestRank: i + 1 };
      by.set(r.judgment_id, e);
    }
    e.sims.push(sim);
    e.chunkCount += 1;
    if (sim > e.bestSim) e.bestSim = sim;
  });
  return [...by.values()];
}

const meta = new Map();
async function loadMeta(ids) {
  const missing = ids.filter((i) => !meta.has(i));
  if (missing.length === 0) return;
  for (let i = 0; i < missing.length; i += 2000) {
    const slice = missing.slice(i, i + 2000);
    const rows = await sql`
      SELECT j.id, j.court, j.case_type,
             EXTRACT(YEAR FROM j.judgment_date)::int AS year,
             length(j.full_text) AS len,
             COALESCE(c.inbound, 0)::int AS inbound
      FROM judgments j
      LEFT JOIN new1_inbound_counts c ON c.judgment_id = j.id
      WHERE j.id = ANY(${slice}::uuid[])
    `;
    for (const r of rows) meta.set(r.id, r);
    for (const id of slice) if (!meta.has(id)) meta.set(id, null);
  }
}

const FEATURES = ['bestSim', 'chunkMass', 'meanTop3', 'reciprocalRank', 'inbound', 'isSC', 'recency', 'lenNorm'];

function featurise(cands) {
  const maxChunks = Math.max(...cands.map((c) => c.chunkCount), 1);
  return cands.map((c) => {
    const m = meta.get(c.judgmentId) ?? null;
    const top3 = [...c.sims].sort((a, b) => b - a).slice(0, 3);
    const year = m?.year ?? null;
    return {
      judgmentId: c.judgmentId,
      denseRank: c.bestRank,
      f: {
        bestSim: c.bestSim,
        chunkMass: c.chunkCount / maxChunks,
        meanTop3: top3.reduce((a, b) => a + b, 0) / top3.length,
        reciprocalRank: 1 / c.bestRank,
        // log-scaled so the 35,694 judgments that carry ANY inbound citation do
        // not swamp the score; ~1.0 at 100 inbound.
        inbound: Math.log1p(m?.inbound ?? 0) / Math.log(101),
        isSC: m && /supreme/i.test(m.court ?? '') ? 1 : 0,
        recency: year ? Math.min(1, Math.max(0, (year - 1950) / 76)) : 0.5,
        lenNorm: m?.len ? Math.min(1, Math.log1p(m.len) / Math.log(200000)) : 0.5,
      },
    };
  });
}

const score = (f, w) => FEATURES.reduce((a, k) => a + w[k] * f[k], 0);

function rankOfGold(ordered, gold) {
  for (let i = 0; i < ordered.length; i += 1) if (gold.includes(ordered[i].judgmentId)) return i + 1;
  return null;
}

function metrics(ranks) {
  const n = ranks.length;
  const dcg = (r) => (r && r <= 10 ? 1 / Math.log2(r + 1) : 0);
  return {
    n,
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt10: ranks.reduce((a, r) => a + dcg(r), 0) / n,
    goldPresent: ranks.filter((r) => r !== null).length / n,
  };
}

// ── build pools once, reuse for every arm ────────────────────────────────────
const queries = QV.queries
  .slice(0, LIMIT_QUERIES)
  .map((q) => ({ ...q, text: textById.get(q.id) ?? null, split: splitOf(q) }));
const maxDepth = Math.max(...DEPTHS);
console.log('RERANKER BASELINE — ' + queries.length + ' queries, ef_search ' + EF_SEARCH);
console.log('depths ' + DEPTHS.join(', ') + ' · pool built once at ' + maxDepth);
console.log(
  'split by gold authority: dev ' + queries.filter((q) => q.split === 'dev').length +
    ' / test ' + queries.filter((q) => q.split === 'test').length,
);
console.log('');

const pools = new Map();
const buildLat = [];
const t0 = Date.now();
for (const [i, q] of queries.entries()) {
  const t = Date.now();
  const rows = await ann(q.vector, maxDepth);
  buildLat.push(Date.now() - t);
  pools.set(
    q.id,
    rows.map((r) => ({ judgment_id: r.judgment_id, chunk_index: r.chunk_index, dist: Number(r.dist) })),
  );
  if ((i + 1) % 25 === 0)
    console.log('  pooled ' + (i + 1) + '/' + queries.length + '  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
await loadMeta([...new Set([...pools.values()].flat().map((r) => r.judgment_id))]);
console.log('  pools built, ' + meta.size + ' distinct judgments, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's\n');

writeFileSync(
  POOL_CACHE,
  JSON.stringify({
    builtAt: new Date().toISOString(),
    efSearch: EF_SEARCH,
    depth: maxDepth,
    queries: queries.map((q) => ({ id: q.id, group: q.group, gold: q.gold, split: q.split, text: q.text })),
    pools: Object.fromEntries([...pools.entries()]),
  }),
);

// ── arms ─────────────────────────────────────────────────────────────────────
const W_DENSE = Object.fromEntries(FEATURES.map((k) => [k, k === 'bestSim' ? 1 : 0]));

function evaluate(qs, depth, w) {
  const ranks = [];
  for (const q of qs) {
    const rows = pools.get(q.id).slice(0, depth);
    const cands = featurise(foldToJudgments(rows));
    const ordered = w
      ? [...cands].sort((a, b) => score(b.f, w) - score(a.f, w))
      : [...cands].sort((a, b) => a.denseRank - b.denseRank);
    ranks.push(rankOfGold(ordered, q.gold));
  }
  return metrics(ranks);
}

/** Coordinate ascent on DEV only. Deliberately small: this is a baseline. */
function fit(devQs, depth) {
  const w = { ...W_DENSE };
  let best = evaluate(devQs, depth, w).successAt5;
  for (let pass = 0; pass < 3; pass += 1) {
    for (const k of FEATURES) {
      if (k === 'bestSim') continue;
      for (const v of [-0.4, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.4, 0.8]) {
        const trial = { ...w, [k]: v };
        const s = evaluate(devQs, depth, trial).successAt5;
        if (s > best) {
          best = s;
          w[k] = v;
        }
      }
    }
  }
  return { w, devSuccessAt5: best };
}

const dev = queries.filter((q) => q.split === 'dev');
const test = queries.filter((q) => q.split === 'test');
const results = [];
for (const depth of DEPTHS) {
  const denseTest = evaluate(test, depth, null);
  const { w, devSuccessAt5 } = fit(dev, depth);
  const featTest = evaluate(test, depth, w);
  results.push({ depth, weights: w, devSuccessAt5, dense: denseTest, features: featTest });
  const d = (a, b) => ((b - a) * 100).toFixed(2).padStart(6);
  console.log(
    'depth ' + String(depth).padStart(4) +
      '  DENSE  s@5 ' + (denseTest.successAt5 * 100).toFixed(1) +
      '%  r@20 ' + (denseTest.recallAt20 * 100).toFixed(1) +
      '%  mrr ' + denseTest.mrr.toFixed(3) +
      '  ndcg@10 ' + denseTest.ndcgAt10.toFixed(3) +
      '  present ' + (denseTest.goldPresent * 100).toFixed(1) + '%',
  );
  console.log(
    '             FEAT   s@5 ' + (featTest.successAt5 * 100).toFixed(1) +
      '%  r@20 ' + (featTest.recallAt20 * 100).toFixed(1) +
      '%  mrr ' + featTest.mrr.toFixed(3) +
      '  ndcg@10 ' + featTest.ndcgAt10.toFixed(3) +
      '   Δs@5 ' + d(denseTest.successAt5, featTest.successAt5) + 'pt',
  );
  console.log('             weights ' + FEATURES.filter((k) => w[k]).map((k) => k + '=' + w[k]).join(' '));
  console.log('');
}

const pctl = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const out = {
  kind: 'new1_reranker_baseline',
  generatedAt: new Date().toISOString(),
  efSearch: EF_SEARCH,
  queries: queries.length,
  split: { by: 'gold_authority_sha1', dev: dev.length, test: test.length },
  features: FEATURES,
  poolLatencyMs: {
    mean: buildLat.reduce((a, b) => a + b, 0) / buildLat.length,
    p50: pctl(buildLat, 0.5),
    p95: pctl(buildLat, 0.95),
  },
  results,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('wrote ' + OUT.pathname);
await sql.end({ timeout: 10 });
