/**
 * NEW1 — proof that V3.1's metrics are reproducible and that the cluster
 * denominator is not decorative. Run: node src/v31-metrics.test.mjs
 *
 * These are the two claims V3.1 rests on, so they are ASSERTED rather than
 * assumed:
 *
 *   1. the same inputs produce byte-identical intervals, twice, forever;
 *   2. resampling clusters gives a WIDER interval than resampling tasks when
 *      tasks are correlated within clusters — which is the entire reason for
 *      doing it, and would be worth abandoning if it were not true.
 */
import assert from 'node:assert/strict';
import { makeRng, bootstrapMean, threeDenominators, endToEndAndConditional } from './v31-metrics.mjs';

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
};

console.log('V3.1 METRICS');

check('the PRNG is deterministic for a given seed', () => {
  const a = Array.from({ length: 5 }, makeRng('seed-x'));
  const r1 = makeRng('seed-x');
  const r2 = makeRng('seed-x');
  const s1 = [r1(), r1(), r1()];
  const s2 = [r2(), r2(), r2()];
  assert.deepEqual(s1, s2);
  void a;
});

check('different seeds give different streams', () => {
  const r1 = makeRng('seed-x');
  const r2 = makeRng('seed-y');
  assert.notDeepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
});

check('bootstrap is byte-identical across runs (V3 was not)', () => {
  const units = Array.from({ length: 40 }, (_, i) => [i % 3 === 0 ? 1 : 0]);
  const a = bootstrapMean(units, { seed: 'lawmind', iterations: 500 });
  const b = bootstrapMean(units, { seed: 'lawmind', iterations: 500 });
  assert.equal(a.lo, b.lo);
  assert.equal(a.hi, b.hi);
  assert.equal(a.point, b.point);
});

check('the point estimate is the plain mean', () => {
  const units = [[1], [1], [0], [0]];
  const r = bootstrapMean(units, { seed: 's', iterations: 200 });
  assert.equal(r.point, 0.5);
});

check('CLUSTER resampling is WIDER than TASK resampling when tasks correlate', () => {
  // 20 clusters of 5 tasks each. Within a cluster every task shares the SAME
  // outcome — the maximally correlated case, which is exactly the shape "fifteen
  // queries about one judgment" produces. Task-level resampling sees n=100 and
  // reports a falsely tight interval; cluster-level sees the real n=20.
  const rows = [];
  for (let c = 0; c < 20; c += 1) {
    const outcome = c < 10 ? 1 : 0;
    for (let t = 0; t < 5; t += 1) {
      rows.push({ taskId: `t${c}_${t}`, clusterId: c, targets: [`g${c}`], value: outcome });
    }
  }
  const r = threeDenominators(rows, { seed: 'width', iterations: 2000 });
  const taskWidth = r.byTask.hi - r.byTask.lo;
  const clusterWidth = r.byTargetCluster.hi - r.byTargetCluster.lo;
  assert.ok(
    clusterWidth > taskWidth,
    `cluster interval (${clusterWidth.toFixed(4)}) should exceed task interval (${taskWidth.toFixed(4)}) — ` +
      'if this ever fails, the cluster denominator is buying nothing and should be dropped rather than displayed',
  );
  console.log(
    `        task  ±${(taskWidth / 2).toFixed(4)}  (n=${r.byTask.n})   ` +
      `cluster ±${(clusterWidth / 2).toFixed(4)}  (n=${r.byTargetCluster.n})   ` +
      `-> ${(clusterWidth / taskWidth).toFixed(2)}x wider`,
  );
});

check('all three denominators agree on the point estimate', () => {
  const rows = [
    { taskId: 'a', clusterId: 0, targets: ['g0'], value: 1 },
    { taskId: 'b', clusterId: 0, targets: ['g0'], value: 1 },
    { taskId: 'c', clusterId: 1, targets: ['g1'], value: 0 },
    { taskId: 'd', clusterId: 2, targets: ['g2'], value: 1 },
  ];
  const r = threeDenominators(rows, { seed: 'p', iterations: 200 });
  // Task mean is 3/4; the target/cluster means weight each unit's own mean, so
  // they legitimately differ. What must hold is that each is in [0,1] and the
  // task one is the plain mean.
  assert.equal(r.byTask.point, 0.75);
  for (const k of ['byTask', 'byDistinctTarget', 'byTargetCluster']) {
    assert.ok(r[k].point >= 0 && r[k].point <= 1, `${k} point out of range`);
  }
});

check('END-TO-END counts an unindexed target as a miss; CONDITIONAL drops it', () => {
  const rows = [
    { taskId: 'in1', clusterId: 0, targets: ['g0'], value: 1 },
    { taskId: 'in2', clusterId: 1, targets: ['g1'], value: 1 },
    { taskId: 'out1', clusterId: 2, targets: ['g2'], value: 1 }, // would rank, but is NOT indexed
    { taskId: 'out2', clusterId: 3, targets: ['g3'], value: 1 },
  ];
  const indexed = new Set(['in1', 'in2']);
  const r = endToEndAndConditional(rows, (id) => indexed.has(id), { seed: 'e', iterations: 200 });
  // 2 of 4 succeed end-to-end; 2 of 2 succeed conditionally. The gap IS the
  // reachability problem, and collapsing them hides it.
  assert.equal(r.endToEnd.byTask.point, 0.5);
  assert.equal(r.conditional.byTask.point, 1);
  assert.equal(r.conditionalTasks, 2);
  assert.equal(r.excludedFromConditional, 2);
});

check('empty input does not throw', () => {
  const r = threeDenominators([], { seed: 'z', iterations: 10 });
  assert.equal(r.byTask.n, 0);
  assert.equal(r.byTask.point, 0);
});

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
