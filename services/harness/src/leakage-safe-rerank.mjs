/**
 * NEW1 P11 — a reranking baseline that cannot repeat the +21.5-point mistake.
 *
 * WHAT WAS WRONG LAST TIME
 * ------------------------
 * The previous reranker gained 21.5 points and the gain was the BENCHMARK: all
 * 278 gold authorities were inbound-cited and the model had an inbound-citation
 * feature. Interaction-only features bought 0.69 points. The experiment was not
 * salvageable by tuning, because the thing being measured was how the gold had
 * been built.
 *
 * WHAT IS DIFFERENT
 * -----------------
 * Every feature is checked against `gold-contract.ts` before it is computed, per
 * row, and a prohibited one THROWS. On this gold that rules out
 * `inbound_citation_graph` for the `proposition` set, which is exactly the
 * feature that produced the illusion. Nothing here can quietly reintroduce it.
 *
 * Only the `proposition` rows are used. `exact_citation` and `case_title` hand
 * the authority's own identifier back as the query, and production already
 * answers those with a pinned exact lookup — reranking them would be measuring a
 * route that does not run.
 *
 * WEIGHTS ARE FIT ON TRAIN AND REPORTED ON HELD
 * ---------------------------------------------
 * Split by CASE FAMILY, deterministically, so an authority cannot be tuned on in
 * one half and scored in the other. A sweep over one weight on 228 queries can
 * overfit comfortably, so the held figure is the only one that means anything and
 * the train figure is printed beside it to show how much of the gain was fitting.
 *
 * INTERPRETABLE, NOT LEARNED
 * --------------------------
 * A linear blend of normalised scores, with the weight swept on a grid. Not
 * because a gradient-boosted model would not fit better — it would, and that is
 * the problem. At n=228 with a 30% holdout, a model with capacity finds the
 * split, and this lane has already published one number that was really about its
 * own construction.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadNew3Gold } from './new3-gold-adapter.ts';
import { assertFeatureAllowed, splitByFamily } from './gold-contract.ts';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const GPU = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const TABLE = process.env.PROBE_TABLE ?? 'new1_probe_fp32_250k';
const EF_SEARCH = Number(process.env.EF_SEARCH ?? 200);
/**
 * 50 / 100 / 200 and NOT 2,000. Depth from 200 to 2,000 was measured at +15.7
 * points of gold PRESENCE and 0.00 points of success@5 — the gold arrives in the
 * pool and the ranker cannot lift it, so paying for depth funds a reranker that
 * does not exist yet. These three bracket the useful range.
 */
const DEPTHS = (process.env.DEPTHS ?? '50,100,200').split(',').map(Number);
const OUT = new URL('../../../docs/ai/new1-rerank/leakage-safe-baseline.json', import.meta.url);

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 600_000 }, onnotice: () => {} });

const loaded = loadNew3Gold('docs/ai/new3-semantic-expansion-gold.json');
const rows = loaded.rows.filter((r) => r.queryType === 'proposition');
console.log(`proposition rows: ${rows.length}`);

/** Families a scorer here reads. Asserted per row, so the contract is enforced. */
const FEATURES = ['dense_similarity', 'sparse_lexical', 'court_and_date'];
for (const r of rows) for (const f of FEATURES) assertFeatureAllowed(r, f);
console.log(`features asserted allowed: ${FEATURES.join(', ')}`);

// ── embed the queries once ───────────────────────────────────────────────────
async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const res = await fetch(GPU, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: texts.slice(i, i + 32) }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error('sidecar ' + res.status);
    out.push(...(await res.json()).vectors);
  }
  return out;
}
const vectors = await embedAll(rows.map((r) => r.query));
console.log(`embedded ${vectors.length} queries`);

await sql.unsafe(`SET hnsw.ef_search = ${EF_SEARCH}`);

/**
 * Min-max normalisation WITHIN a query's own candidate list.
 *
 * Cosine distance and `ts_rank` are not on the same scale and never will be —
 * `ts_rank` is unbounded and depends on document length. Normalising per query
 * rather than globally also means a query whose whole pool is weak does not get
 * its scores flattened by a query whose pool is strong.
 */
function normalise(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  return values.map((v) => (span === 0 ? 0 : (v - lo) / span));
}

const maxDepth = Math.max(...DEPTHS);
const perQuery = [];
const t0 = Date.now();
for (const [i, row] of rows.entries()) {
  const lit = '[' + vectors[i].join(',') + ']';
  const cands = await sql.unsafe(
    `SELECT judgment_id, court, year, (embedding <=> $1::vector) AS dist
     FROM ${TABLE} ORDER BY embedding <=> $1::vector LIMIT ${maxDepth}`,
    [lit],
  );
  if (cands.length === 0) continue;
  const ids = cands.map((c) => c.judgment_id);

  // Sparse over the CANDIDATES only. A corpus-wide sparse arm is a different
  // experiment (fusion, not reranking) and would change what the depth sweep
  // means: here the pool is fixed by dense and the question is purely whether
  // reordering it helps.
  const sparse = await sql`
    SELECT id, ts_rank(full_text_tsv, plainto_tsquery('english', ${row.query.slice(0, 900)})) AS r
    FROM judgments WHERE id = ANY(${ids}::uuid[])
  `;
  const sparseById = new Map(sparse.map((s) => [s.id, Number(s.r)]));

  const citingCourt = String(row.goldEvidence?.citingCourt ?? '');
  const citingYear = Number(String(row.goldEvidence?.citingDate ?? '').slice(0, 4)) || null;

  const feats = cands.map((c) => ({
    id: c.judgment_id,
    dense: 1 - Number(c.dist),
    sparse: sparseById.get(c.judgment_id) ?? 0,
    // Same-court and not-after-the-citing-judgment. Both are properties of the
    // CANDIDATE against the QUERY's context, never of the gold: a court match is
    // available at query time in production because the advocate's own matter has
    // a court, and it does not encode which document was cited.
    sameCourt: c.court && citingCourt && c.court === citingCourt ? 1 : 0,
    notFuture: citingYear && c.year && c.year <= citingYear ? 1 : 0,
  }));
  const dn = normalise(feats.map((f) => f.dense));
  const sn = normalise(feats.map((f) => f.sparse));
  feats.forEach((f, k) => {
    f.denseN = dn[k];
    f.sparseN = sn[k];
  });

  perQuery.push({ queryId: row.queryId, caseFamily: row.caseFamily, gold: row.goldAuthorityId, feats });
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${rows.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log(`candidates built for ${perQuery.length} queries in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const byId = new Map(rows.map((r) => [r.queryId, r]));
const { train, test: held } = splitByFamily(
  perQuery.map((q) => byId.get(q.queryId)).filter(Boolean),
  0.3,
);
const trainIds = new Set(train.map((r) => r.queryId));
const heldIds = new Set(held.map((r) => r.queryId));
console.log(`split: train ${trainIds.size}, held ${heldIds.size}`);

function score(q, depth, weights) {
  const pool = q.feats.slice(0, depth);
  const ranked = [...pool]
    .map((f) => ({
      id: f.id,
      s: weights.dense * f.denseN + weights.sparse * f.sparseN + weights.court * f.sameCourt + weights.time * f.notFuture,
    }))
    .sort((a, b) => b.s - a.s);
  const rank = ranked.findIndex((r) => r.id === q.gold) + 1;
  return rank || null;
}

function evaluate(subset, depth, weights) {
  const ranks = subset.map((q) => score(q, depth, weights));
  const n = ranks.length;
  const at = (k) => Number(((100 * ranks.filter((r) => r && r <= k).length) / n).toFixed(2));
  return {
    queries: n,
    successAt5: at(5),
    recallAt20: at(20),
    presentInPool: at(depth),
    mrr: Number((ranks.reduce((a, r) => a + (r ? 1 / r : 0), 0) / n).toFixed(4)),
  };
}

const trainSet = perQuery.filter((q) => trainIds.has(q.queryId));
const heldSet = perQuery.filter((q) => heldIds.has(q.queryId));

const DENSE_ONLY = { dense: 1, sparse: 0, court: 0, time: 0 };
// The sparse weight runs well past the point where it dominates dense, on
// purpose. The first sweep stopped at 1.2 and CHOSE 1.2 — an optimum on the edge
// of a grid is not an optimum, it is a grid that was too small, and reporting it
// would have been reporting the boundary.
const grid = [];
for (const sparseW of [0, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2, 3, 5, 8]) {
  for (const courtW of [0, 0.05, 0.15, 0.4]) {
    for (const timeW of [0, 0.05, 0.15, 0.4]) {
      grid.push({ dense: 1, sparse: sparseW, court: courtW, time: timeW });
    }
  }
}

/**
 * NAMED ARMS, reported whether or not they win.
 *
 * The grid sweep kept choosing its own boundary — first `sparse = 1.2` out of a
 * grid ending at 1.2, then `sparse = 8` out of one ending at 8, with the court
 * and time weights also pinned at their maxima. An optimum on the edge of a grid
 * is not an optimum; it is a grid that was too small, and the honest reading of
 * "the fit wants sparse to dominate" is that DENSE MAY BE CONTRIBUTING NOTHING.
 *
 * Extending the grid a third time would keep answering the wrong question. These
 * four arms answer it directly, and `sparseOnly` is the one that settles it.
 */
const ARMS = {
  denseOnly: { dense: 1, sparse: 0, court: 0, time: 0 },
  sparseOnly: { dense: 0, sparse: 1, court: 0, time: 0 },
  equalBlend: { dense: 1, sparse: 1, court: 0, time: 0 },
  blendPlusContext: { dense: 1, sparse: 1, court: 0.15, time: 0.15 },
};

const results = {};
for (const depth of DEPTHS) {
  const baselineTrain = evaluate(trainSet, depth, DENSE_ONLY);
  const baselineHeld = evaluate(heldSet, depth, DENSE_ONLY);

  const arms = {};
  for (const [name, w] of Object.entries(ARMS)) {
    arms[name] = { weights: w, train: evaluate(trainSet, depth, w), held: evaluate(heldSet, depth, w) };
  }

  let best = null;
  for (const w of grid) {
    const m = evaluate(trainSet, depth, w);
    // MRR, not success@5, as the fitting objective: success@5 over ~160 train
    // queries moves in steps of 0.6 points and a grid sweep on it picks ties
    // arbitrarily. MRR uses the whole ranking and breaks them meaningfully.
    if (!best || m.mrr > best.metrics.mrr) best = { weights: w, metrics: m };
  }
  const heldBest = evaluate(heldSet, depth, best.weights);
  // Say so in the artefact rather than leaving a reader to notice.
  const onEdge =
    best.weights.sparse === Math.max(...grid.map((g) => g.sparse)) ||
    best.weights.court === Math.max(...grid.map((g) => g.court)) ||
    best.weights.time === Math.max(...grid.map((g) => g.time));

  results[depth] = {
    arms,
    denseOnly: { train: baselineTrain, held: baselineHeld },
    bestWeights: best.weights,
    bestWeightsOnGridEdge: onEdge,
    reranked: { train: best.metrics, held: heldBest },
    heldDelta: {
      successAt5: Number((heldBest.successAt5 - baselineHeld.successAt5).toFixed(2)),
      recallAt20: Number((heldBest.recallAt20 - baselineHeld.recallAt20).toFixed(2)),
      mrr: Number((heldBest.mrr - baselineHeld.mrr).toFixed(4)),
    },
    trainDelta: {
      successAt5: Number((best.metrics.successAt5 - baselineTrain.successAt5).toFixed(2)),
      mrr: Number((best.metrics.mrr - baselineTrain.mrr).toFixed(4)),
    },
  };
}

const report = {
  kind: 'new1_leakage_safe_rerank_baseline',
  measuredAt: new Date().toISOString(),
  probeTable: TABLE,
  efSearch: EF_SEARCH,
  queryType: 'proposition',
  featuresUsed: FEATURES,
  featuresProhibitedByContract: ['inbound_citation_graph'],
  gridSize: grid.length,
  split: { train: trainIds.size, held: heldIds.size },
  byDepth: results,
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

console.log('\nLEAKAGE-SAFE RERANK BASELINE  (proposition only)');
for (const depth of DEPTHS) {
  const r = results[depth];
  console.log(`\n  pool ${depth}   gold present in pool ${r.denseOnly.held.presentInPool}%`);
  for (const [name, a] of Object.entries(r.arms)) {
    console.log(
      `    ${name.padEnd(18)} held  s@5 ${String(a.held.successAt5).padStart(6)}%  r@20 ${String(a.held.recallAt20).padStart(6)}%  MRR ${a.held.mrr}   (train s@5 ${a.train.successAt5}%)`,
    );
  }
  console.log(`    grid best        held  s@5 ${r.reranked.held.successAt5}%  r@20 ${r.reranked.held.recallAt20}%  MRR ${r.reranked.held.mrr}  weights ${JSON.stringify(r.bestWeights)}${r.bestWeightsOnGridEdge ? '  [ON GRID EDGE]' : ''}`);
  console.log(`    HELD delta over dense-only   s@5 ${r.heldDelta.successAt5}pt   MRR ${r.heldDelta.mrr}    (train delta s@5 ${r.trainDelta.successAt5}pt)`);
}
console.log(`\nwrote ${OUT.pathname}`);
await sql.end({ timeout: 10 });
