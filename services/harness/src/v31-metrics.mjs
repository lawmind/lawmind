/**
 * NEW1 — V3.1 METRICS. Seeded bootstrap, three denominators. §7 NEW1-1 (T1.10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO THINGS V3 GOT WRONG, BOTH FIXED HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. `representation-lab-v3-cli.ts:359` bootstraps with `Math.random()`. Every
 *    re-run of the same data publishes a DIFFERENT confidence interval. An
 *    interval that changes when nothing changed is not a measurement of the
 *    data, it is a measurement of the clock.
 *
 * 2. V3 reports intervals over TASKS only. NEW1-1 forbids inflating n by
 *    counting many queries against one authority as independent authorities —
 *    and the V3.1 manifest shows 295 tasks collapsing to 213 distinct targets
 *    and 211 clusters. Task-level intervals are the widest claim available and
 *    the least defensible one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A CLUSTER BOOTSTRAP AND NOT JUST A SMALLER n
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The naive fix is to divide n by the average cluster size. That is wrong: it
 * assumes every cluster is the same size and that within-cluster outcomes are
 * perfectly correlated. Neither holds.
 *
 * The correct unit of resampling is the CLUSTER — draw clusters with
 * replacement, take every task inside each drawn cluster, then compute the
 * statistic. That propagates both the real cluster-size distribution and the
 * real within-cluster correlation, without assuming either.
 *
 * All three denominators get reported side by side because they answer different
 * questions: TASK ("how often does a query succeed?"), TARGET ("how many
 * distinct authorities are reachable?"), CLUSTER ("how many independent legal
 * propositions can we answer?"). The last is the one a founder should read.
 */
import { createHash } from 'node:crypto';

/**
 * Deterministic PRNG — mulberry32, seeded from a string.
 *
 * Not `Math.random()`. The whole point of V3.1 is that a replay produces the
 * same numbers, and a bootstrap is the one place where "the same data" and "the
 * same answer" quietly come apart.
 */
export function makeRng(seedString) {
  // 32 bits of a sha256 is plenty of seed entropy and keeps the seed HUMAN
  // READABLE in the manifest, which matters more than entropy here.
  let a = parseInt(createHash('sha256').update(String(seedString), 'utf8').digest('hex').slice(0, 8), 16) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile of a sorted array, linear interpolation. */
function quantile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Bootstrap a mean over independent units, seeded.
 *
 * `units` is an array of arrays: each inner array holds the per-task values
 * belonging to ONE independent unit. For a task-level bootstrap every unit has
 * exactly one value; for a cluster-level bootstrap a unit holds every task in
 * that cluster. The resampling is over UNITS, which is what makes the interval
 * honest about correlation.
 */
export function bootstrapMean(units, { seed, iterations = 2000 } = {}) {
  const rng = makeRng(seed);
  const n = units.length;
  if (n === 0) return { point: 0, lo: 0, hi: 0, n: 0, iterations };

  const flat = units.flat();
  const point = flat.length ? flat.reduce((s, v) => s + v, 0) / flat.length : 0;

  const means = new Array(iterations);
  for (let b = 0; b < iterations; b += 1) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i += 1) {
      const unit = units[Math.floor(rng() * n)];
      for (const v of unit) {
        sum += v;
        count += 1;
      }
    }
    means[b] = count ? sum / count : 0;
  }
  means.sort((x, y) => x - y);
  return {
    point,
    lo: quantile(means, 0.025),
    hi: quantile(means, 0.975),
    n,
    iterations,
  };
}

/**
 * Group per-task outcomes into the three denominators and bootstrap each.
 *
 * `rows` = [{ taskId, clusterId, targets: string[], value: 0|1 }, ...]
 *
 * TASK    — one unit per task.
 * TARGET  — one unit per distinct target id. A task with several targets
 *           contributes to each; a target named by several tasks collects them
 *           all. This is "how many distinct authorities are reachable".
 * CLUSTER — one unit per target cluster, the transitive closure of shared
 *           targets. The independent-proposition count.
 */
export function threeDenominators(rows, { seed, iterations = 2000 } = {}) {
  const byTask = rows.map((r) => [r.value]);

  const targetMap = new Map();
  for (const r of rows) {
    for (const t of r.targets) targetMap.set(t, [...(targetMap.get(t) ?? []), r.value]);
  }

  const clusterMap = new Map();
  for (const r of rows) {
    clusterMap.set(r.clusterId, [...(clusterMap.get(r.clusterId) ?? []), r.value]);
  }

  return {
    byTask: bootstrapMean(byTask, { seed: `${seed}#task`, iterations }),
    byDistinctTarget: bootstrapMean([...targetMap.values()], { seed: `${seed}#target`, iterations }),
    byTargetCluster: bootstrapMean([...clusterMap.values()], { seed: `${seed}#cluster`, iterations }),
  };
}

/**
 * END-TO-END vs CONDITIONAL, the split §7 NEW1-2 insists on.
 *
 * `inIndex(taskId)` must answer whether the task's target is NATURALLY in the
 * index — never whether it was forced in. Getting that backwards is exactly the
 * artificial-reachability failure the tranche design exists to prevent, and it
 * is invisible in the output, so it is a parameter rather than a lookup this
 * module performs for itself.
 */
export function endToEndAndConditional(rows, inIndex, opts) {
  // END-TO-END: a target that is not naturally in the index is a MISS, full stop.
  const e2e = rows.map((r) => ({ ...r, value: inIndex(r.taskId) ? r.value : 0 }));
  // CONDITIONAL: only tasks whose target is present are asked about at all.
  const cond = rows.filter((r) => inIndex(r.taskId));
  return {
    endToEnd: threeDenominators(e2e, opts),
    conditional: threeDenominators(cond, opts),
    conditionalTasks: cond.length,
    excludedFromConditional: rows.length - cond.length,
    note:
      'END-TO-END counts a target absent from the index as a MISS. CONDITIONAL excludes those tasks entirely. ' +
      'Reporting CONDITIONAL alone overstates the product; reporting it without saying how many tasks it dropped is worse.',
  };
}
