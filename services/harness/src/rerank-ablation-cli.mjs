/**
 * RERANK ABLATION — is the +21.5 points real, or is it the benchmark leaking?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SUSPICION THIS FILE EXISTS TO TEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `reranker-baseline-cli.mjs` moved success@5 from 19.4% to 41.0% on a held-out
 * test split, and coordinate ascent picked `inbound` — inbound citation count —
 * as a positive weight at every depth. That is the result to distrust hardest,
 * for a reason that has nothing to do with the fitting:
 *
 * **The gold labels in this benchmark are citation-derived, and only 35,694 of
 * 17.9M judgments carry ANY inbound citation at all.** If gold authorities are
 * inbound-positive BY CONSTRUCTION while the distractors around them are not,
 * then `inbound` is not ranking authority by importance. It is detecting which
 * documents were eligible to be gold, and a feature that recognises the shape of
 * the test set will collapse the moment it meets a real query whose answer is
 * one of the 99.8% of judgments nobody has cited yet.
 *
 * This is the same failure family the lane has already been bitten by twice —
 * a benchmark group label that production cannot observe, and a per-class
 * accuracy that was not precision. The pattern is a number that is true about
 * the evaluation and false about the world.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS MEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. THE PREVALENCE DIAGNOSTIC. What share of gold authorities are
 *    inbound-positive, against what share of the hard distractors they sit
 *    among? If those two numbers are far apart, the feature is separating gold
 *    from non-gold on a property of the labelling process.
 *
 * 2. LEAVE-ONE-FEATURE-OUT. Refit on dev without each feature in turn and score
 *    on test. The honest headline is the arm with every suspect feature removed,
 *    not the best arm.
 *
 * Both are reported whichever way they come out. An ablation run only to confirm
 * a result is not an ablation.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const QV = JSON.parse(
  readFileSync(new URL('../../../docs/ai/new1-halfvec/eval-query-vectors.json', import.meta.url), 'utf8'),
);
const POOLS = JSON.parse(readFileSync(new URL('../../../docs/ai/new1-rerank/pools.json', import.meta.url), 'utf8'));
const OUT = new URL('../../../docs/ai/new1-rerank/rerank-ablation.json', import.meta.url);

const DEPTHS = (process.env.DEPTHS ?? '100,200').split(',').map(Number);
const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 } });

const FEATURES = ['bestSim', 'chunkMass', 'meanTop3', 'reciprocalRank', 'inbound', 'isSC', 'recency', 'lenNorm'];
const qById = new Map(QV.queries.map((q) => [q.id, q]));
const queries = POOLS.queries.map((q) => ({ ...q, vector: qById.get(q.id)?.vector ?? null })).filter((q) => q.vector);

// ── metadata for every judgment any pool touched ─────────────────────────────
const allIds = [...new Set(Object.values(POOLS.pools).flat().map((r) => r.judgment_id))];
const meta = new Map();
for (let i = 0; i < allIds.length; i += 2000) {
  const slice = allIds.slice(i, i + 2000);
  const rows = await sql`
    SELECT j.id, j.court, EXTRACT(YEAR FROM j.judgment_date)::int AS year,
           length(j.full_text) AS len, COALESCE(c.inbound, 0)::int AS inbound
    FROM judgments j
    LEFT JOIN new1_inbound_counts c ON c.judgment_id = j.id
    WHERE j.id = ANY(${slice}::uuid[])
  `;
  for (const r of rows) meta.set(r.id, r);
}
// Gold can sit outside any pool when retrieval missed it entirely; it still
// belongs in the prevalence diagnostic, so fetch it separately.
const goldIds = [...new Set(queries.flatMap((q) => q.gold))].filter((g) => !meta.has(g));
if (goldIds.length) {
  const rows = await sql`
    SELECT j.id, j.court, EXTRACT(YEAR FROM j.judgment_date)::int AS year,
           length(j.full_text) AS len, COALESCE(c.inbound, 0)::int AS inbound
    FROM judgments j
    LEFT JOIN new1_inbound_counts c ON c.judgment_id = j.id
    WHERE j.id = ANY(${goldIds}::uuid[])
  `;
  for (const r of rows) meta.set(r.id, r);
}

// ── 1. prevalence ────────────────────────────────────────────────────────────
const goldSet = new Set(queries.flatMap((q) => q.gold));
const inb = (id) => meta.get(id)?.inbound ?? 0;
const goldWith = [...goldSet].filter((g) => inb(g) > 0).length;
const distractors = allIds.filter((i) => !goldSet.has(i));
const distWith = distractors.filter((d) => inb(d) > 0).length;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const prevalence = {
  gold: goldSet.size,
  goldInboundPositive: goldWith,
  goldInboundPositivePct: goldWith / goldSet.size,
  goldMedianInbound: median([...goldSet].map(inb)),
  distractors: distractors.length,
  distractorInboundPositive: distWith,
  distractorInboundPositivePct: distWith / Math.max(1, distractors.length),
  distractorMedianInbound: median(distractors.map(inb)),
};
console.log('PREVALENCE — is `inbound` describing authority, or describing the label?');
console.log('  gold        ' + goldWith + '/' + goldSet.size + ' inbound-positive (' + (prevalence.goldInboundPositivePct * 100).toFixed(1) + '%)  median ' + prevalence.goldMedianInbound);
console.log('  distractors ' + distWith + '/' + distractors.length + ' inbound-positive (' + (prevalence.distractorInboundPositivePct * 100).toFixed(1) + '%)  median ' + prevalence.distractorMedianInbound);
console.log('  ratio       ' + (prevalence.goldInboundPositivePct / Math.max(1e-9, prevalence.distractorInboundPositivePct)).toFixed(1) + 'x\n');

// ── scoring machinery, identical to the baseline ─────────────────────────────
function foldToJudgments(rows) {
  const by = new Map();
  rows.forEach((r, i) => {
    const sim = 1 - Number(r.dist);
    let e = by.get(r.judgment_id);
    if (!e) { e = { judgmentId: r.judgment_id, bestSim: sim, sims: [], chunkCount: 0, bestRank: i + 1 }; by.set(r.judgment_id, e); }
    e.sims.push(sim); e.chunkCount += 1; if (sim > e.bestSim) e.bestSim = sim;
  });
  return [...by.values()];
}
function featurise(cands) {
  const maxChunks = Math.max(...cands.map((c) => c.chunkCount), 1);
  return cands.map((c) => {
    const m = meta.get(c.judgmentId) ?? null;
    const top3 = [...c.sims].sort((a, b) => b - a).slice(0, 3);
    return {
      judgmentId: c.judgmentId,
      denseRank: c.bestRank,
      f: {
        bestSim: c.bestSim,
        chunkMass: c.chunkCount / maxChunks,
        meanTop3: top3.reduce((a, b) => a + b, 0) / top3.length,
        reciprocalRank: 1 / c.bestRank,
        inbound: Math.log1p(m?.inbound ?? 0) / Math.log(101),
        isSC: m && /supreme/i.test(m.court ?? '') ? 1 : 0,
        recency: m?.year ? Math.min(1, Math.max(0, (m.year - 1950) / 76)) : 0.5,
        lenNorm: m?.len ? Math.min(1, Math.log1p(m.len) / Math.log(200000)) : 0.5,
      },
    };
  });
}
const cache = new Map();
function candsFor(q, depth) {
  const k = q.id + ':' + depth;
  if (!cache.has(k)) cache.set(k, featurise(foldToJudgments((POOLS.pools[q.id] ?? []).slice(0, depth))));
  return cache.get(k);
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
  };
}
function evaluate(qs, depth, w, active) {
  const ranks = [];
  for (const q of qs) {
    const cands = candsFor(q, depth);
    const ordered = w
      ? [...cands].sort((a, b) => active.reduce((s, k) => s + w[k] * b.f[k], 0) - active.reduce((s, k) => s + w[k] * a.f[k], 0))
      : [...cands].sort((a, b) => a.denseRank - b.denseRank);
    let rank = null;
    for (let i = 0; i < ordered.length; i += 1) if (q.gold.includes(ordered[i].judgmentId)) { rank = i + 1; break; }
    ranks.push(rank);
  }
  return metrics(ranks);
}
function fit(devQs, depth, active) {
  const w = Object.fromEntries(FEATURES.map((k) => [k, k === 'bestSim' ? 1 : 0]));
  let best = evaluate(devQs, depth, w, active).successAt5;
  for (let pass = 0; pass < 3; pass += 1)
    for (const k of active) {
      if (k === 'bestSim') continue;
      for (const v of [-0.4, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.4, 0.8]) {
        const trial = { ...w, [k]: v };
        const s = evaluate(devQs, depth, trial, active).successAt5;
        if (s > best) { best = s; w[k] = v; }
      }
    }
  return w;
}

const dev = queries.filter((q) => q.split === 'dev');
const test = queries.filter((q) => q.split === 'test');
const results = [];
for (const depth of DEPTHS) {
  const dense = evaluate(test, depth, null, FEATURES);
  const arms = [{ name: 'ALL', active: FEATURES }];
  for (const drop of FEATURES) if (drop !== 'bestSim') arms.push({ name: 'without ' + drop, active: FEATURES.filter((k) => k !== drop) });
  // The arm that matters if the diagnostic indicts the citation graph: every
  // feature computable for a document nobody has cited yet.
  arms.push({ name: 'NO-GRAPH (inbound dropped)', active: FEATURES.filter((k) => k !== 'inbound') });
  // Dropping `inbound` alone is not enough. `recency` was fitted NEGATIVE — the
  // model preferring older documents — and age is the same latent variable as
  // citation count: a judgment has had longer to be cited, so it was likelier to
  // become gold. `isSC` carries it too. This arm keeps only features computed
  // from THIS query against THIS document, so nothing in it can know which
  // documents the labelling process was able to choose from.
  arms.push({
    name: 'INTERACTION-ONLY (no doc priors)',
    active: ['bestSim', 'chunkMass', 'meanTop3', 'reciprocalRank', 'lenNorm'],
  });

  console.log('depth ' + depth + '  DENSE control  s@5 ' + (dense.successAt5 * 100).toFixed(1) + '%  mrr ' + dense.mrr.toFixed(3));
  const rows = [];
  for (const arm of arms) {
    const w = fit(dev, depth, arm.active);
    const m = evaluate(test, depth, w, arm.active);
    rows.push({ arm: arm.name, weights: Object.fromEntries(arm.active.filter((k) => w[k]).map((k) => [k, w[k]])), test: m });
    console.log(
      '  ' + arm.name.padEnd(28) +
        ' s@5 ' + (m.successAt5 * 100).toFixed(1).padStart(5) + '%' +
        '  r@20 ' + (m.recallAt20 * 100).toFixed(1).padStart(5) + '%' +
        '  mrr ' + m.mrr.toFixed(3) +
        '  Δs@5 vs dense ' + ((m.successAt5 - dense.successAt5) * 100).toFixed(2).padStart(6) + 'pt',
    );
  }
  console.log('');
  results.push({ depth, dense, arms: rows });
}

writeFileSync(OUT, JSON.stringify({ kind: 'new1_rerank_ablation', generatedAt: new Date().toISOString(), prevalence, results }, null, 2));
console.log('wrote ' + OUT.pathname);
await sql.end({ timeout: 10 });
