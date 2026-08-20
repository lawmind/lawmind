/**
 * NEW1 — compare two benchmark arms PAIRED, on the queries they share.
 *
 * WHY PAIRED AND NOT TWO PERCENTAGES
 * ----------------------------------
 * fp32 and halfvec differ by about 1.3 points of success@5 on the proposition
 * set. With n = 228 at p ≈ 0.22 the standard error of ONE of those percentages is
 * about 2.7 points, so quoting them side by side invites a verdict on a difference
 * half the size of the noise on either figure.
 *
 * But the two arms answer the SAME 684 queries. The paired question — on how many
 * individual queries did the rank move, and in which direction — has far more
 * power than the difference of two independent-looking rates, and it is the only
 * form in which a 1-point difference means anything at all.
 *
 * A two-sided sign test over the queries that MOVED gives the exposure honestly.
 * Ties carry no information about direction and are excluded from the test while
 * being reported, because "most queries did not change at all" is itself the most
 * important line in the table.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const A = process.argv[2];
const B = process.argv[3];
if (!A || !B) {
  console.error('usage: node arm-compare.mjs <armA.json> <armB.json>');
  process.exit(1);
}
const OUT = process.argv[4] ?? 'docs/ai/new1-halfvec/arm-compare.json';

const a = JSON.parse(readFileSync(A, 'utf8'));
const b = JSON.parse(readFileSync(B, 'utf8'));

const byId = (r) => new Map(r.results.map((x) => [x.queryId, x]));
const ma = byId(a);
const mb = byId(b);
const shared = [...ma.keys()].filter((k) => mb.has(k));

/** Not found at all is worse than any rank; treat it as one past the cut. */
const rankOf = (r, topK) => r.rank ?? topK + 1;

const perType = {};
for (const id of shared) {
  const ra = ma.get(id);
  const rb = mb.get(id);
  const t = (perType[ra.queryType] ??= {
    queries: 0,
    bImproved: 0,
    bWorsened: 0,
    tied: 0,
    enteredTop5: 0,
    leftTop5: 0,
    sumRankDelta: 0,
  });
  const x = rankOf(ra, a.topK);
  const y = rankOf(rb, b.topK);
  t.queries += 1;
  t.sumRankDelta += y - x;
  if (y < x) t.bImproved += 1;
  else if (y > x) t.bWorsened += 1;
  else t.tied += 1;
  const inA = ra.rank !== null && ra.rank <= 5;
  const inB = rb.rank !== null && rb.rank <= 5;
  if (!inA && inB) t.enteredTop5 += 1;
  if (inA && !inB) t.leftTop5 += 1;
}

/**
 * Two-sided sign test. Exact binomial tail, no normal approximation — n here is
 * in the tens, which is exactly where the approximation misleads.
 */
function signTest(up, down) {
  const n = up + down;
  if (n === 0) return { n: 0, p: null };
  const k = Math.min(up, down);
  const logC = (nn, kk) => {
    let s = 0;
    for (let i = 1; i <= kk; i += 1) s += Math.log(nn - kk + i) - Math.log(i);
    return s;
  };
  let tail = 0;
  for (let i = 0; i <= k; i += 1) tail += Math.exp(logC(n, i) - n * Math.LN2);
  return { n, p: Number(Math.min(1, 2 * tail).toFixed(4)) };
}

const rows = [];
for (const [type, t] of Object.entries(perType)) {
  const test = signTest(t.bImproved, t.bWorsened);
  rows.push({
    queryType: type,
    ...t,
    meanRankDelta: Number((t.sumRankDelta / t.queries).toFixed(3)),
    movedQueries: test.n,
    signTestP: test.p,
    verdict:
      test.p === null || test.p > 0.05
        ? 'NO DIFFERENCE DETECTED'
        : t.bImproved > t.bWorsened
          ? `${b.probeTable} BETTER`
          : `${a.probeTable} BETTER`,
  });
}

const report = {
  kind: 'new1_arm_compare',
  armA: { file: A, table: a.probeTable, efSearch: a.efSearch, latencyMs: a.latencyMs },
  armB: { file: B, table: b.probeTable, efSearch: b.efSearch, latencyMs: b.latencyMs },
  sharedQueries: shared.length,
  perQueryType: rows,
  comparedAt: new Date().toISOString(),
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

console.log(`A ${a.probeTable}  ef_search ${a.efSearch}  p50 ${a.latencyMs.p50}ms  p95 ${a.latencyMs.p95}ms`);
console.log(`B ${b.probeTable}  ef_search ${b.efSearch}  p50 ${b.latencyMs.p50}ms  p95 ${b.latencyMs.p95}ms`);
console.log(`shared queries ${shared.length}\n`);
for (const r of rows) {
  console.log(`${r.queryType}  (${r.queries} queries)`);
  console.log(`  B better on ${r.bImproved}, worse on ${r.bWorsened}, identical on ${r.tied}`);
  console.log(`  entered top5 ${r.enteredTop5}, left top5 ${r.leftTop5}, mean rank delta ${r.meanRankDelta}`);
  console.log(`  sign test over ${r.movedQueries} moved: p = ${r.signTestP}  ->  ${r.verdict}\n`);
}
console.log(`wrote ${OUT}`);
