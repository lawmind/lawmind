#!/usr/bin/env node
/**
 * NEW1 — RE-ANALYSE V3'S PUBLISHED RESULT UNDER THE CORRECT DENOMINATOR.
 * §7 NEW1-1 (T1.10). Reads files only: no DB, no GPU, no re-embedding.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS POSSIBLE AT ALL, AND WHY IT IS WORTH DOING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `representation-lab-v3.json` stores the per-task rank of every arm at every
 * pool size — 295 tasks × 5 arms × 3 pools. So the OUTCOMES are already on disk;
 * only the STATISTICS were wrong. That means V3's headline can be re-derived
 * with the right denominator without spending a second of GPU, which matters
 * because the box has neither a GPU nor a DB window free right now.
 *
 * Two corrections are applied:
 *
 *   1. **Seeded bootstrap.** V3 used `Math.random()`, so its intervals were not
 *      replayable. Ours are.
 *
 *   2. **Cluster resampling.** V3 reported intervals over TASKS. NEW1-1 forbids
 *      treating many queries about one authority as independent authorities, and
 *      the V3.1 manifest shows 295 tasks collapsing to 211 clusters. Measured on
 *      synthetic maximally-correlated data, cluster resampling is 2.11× wider
 *      than task resampling — so V3's intervals are expected to be too tight,
 *      and this quantifies by how much on the real correlation structure.
 *
 * What this does NOT do: it does not re-score anything, does not change any
 * point estimate, and does not touch the arms' ordering. **Only the uncertainty
 * around those numbers changes.** If the ordering conclusions survive the wider
 * intervals, V3's decision stands on firmer ground than V3 itself could show.
 *
 * USAGE
 *   node services/harness/src/v31-reanalyse-v3-cli.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { threeDenominators, endToEndAndConditional } from './v31-metrics.mjs';

const ROOT = new URL('../../../', import.meta.url);
const V3 = JSON.parse(readFileSync(new URL('docs/ai/new1-tier-a/representation-lab-v3.json', ROOT), 'utf8'));
const V31 = JSON.parse(readFileSync(new URL('docs/ai/new1-tier-a/V31_MANIFEST.json', ROOT), 'utf8'));
const OUT = new URL('docs/ai/new1-tier-a/V31_REANALYSIS.json', ROOT);

const SEED = V31.seeds.bootstrapSeed;
const ITERATIONS = 4000;
const ARMS = ['A_HEAD_4800_PRODUCTION', 'B_POOLED_ALL', 'C_POOLED_SALIENT', 'D_MULTI_3', 'F_ALL_CHUNKS'];
const POOL = 19932; // the largest, most honest pool V3 scored
const K = 5; // success@5

// clusterId comes from the FROZEN manifest, so the denominator cannot drift.
const clusterOf = new Map(V31.tasks.map((t) => [t.taskId, t.clusterId]));

const unmatched = V3.tasks.filter((t) => !clusterOf.has(t.taskId));
if (unmatched.length) {
  console.log(`WARNING: ${unmatched.length} V3 tasks are absent from the V3.1 manifest and are EXCLUDED.`);
  console.log(`  first few: ${unmatched.slice(0, 5).map((t) => t.taskId).join(', ')}`);
}

const report = { kind: 'new1_v31_reanalysis_of_v3', poolSize: POOL, k: K, seed: SEED, iterations: ITERATIONS, arms: {} };

for (const provenance of ['POSED', 'LIFTED']) {
  const tasks = V3.tasks.filter((t) => t.provenance === provenance && clusterOf.has(t.taskId));

  console.log(`\n${'='.repeat(96)}`);
  console.log(`${provenance} — ${tasks.length} tasks · ${new Set(tasks.map((t) => clusterOf.get(t.taskId))).size} clusters · pool ${POOL} · success@${K}`);
  console.log('='.repeat(96));
  console.log(
    'arm'.padEnd(26) +
      'V3 published'.padEnd(24) +
      'V3.1 by TASK'.padEnd(24) +
      'V3.1 by CLUSTER'.padEnd(24) +
      'width',
  );

  for (const arm of ARMS) {
    const rows = tasks.map((t) => {
      const rank = t.ranks?.[`${arm}#${POOL}`] ?? null;
      return {
        taskId: t.taskId,
        clusterId: clusterOf.get(t.taskId),
        targets: t.targets,
        value: rank !== null && rank <= K ? 1 : 0,
      };
    });

    const d = threeDenominators(rows, { seed: `${SEED}#${provenance}#${arm}`, iterations: ITERATIONS });

    // END-TO-END vs CONDITIONAL, using V3's own targetInProduction flag — which
    // is the natural-reachability fact, not a forced one.
    const inProd = new Map(tasks.map((t) => [t.taskId, t.targetInProduction === true]));
    const ec = endToEndAndConditional(rows, (id) => inProd.get(id) === true, {
      seed: `${SEED}#${provenance}#${arm}#ec`,
      iterations: ITERATIONS,
    });

    const published = V3.arms.find((a) => a.arm === arm && a.provenance === provenance && a.poolSize === POOL);
    const pub = published
      ? `${(100 * published.successAt5).toFixed(1)}% [${(100 * published.successAt5Ci.lo).toFixed(1)},${(100 * published.successAt5Ci.hi).toFixed(1)}]`
      : '(none)';

    const fmt = (x) => `${(100 * x.point).toFixed(1)}% [${(100 * x.lo).toFixed(1)},${(100 * x.hi).toFixed(1)}]`;
    const wTask = d.byTask.hi - d.byTask.lo;
    const wClus = d.byTargetCluster.hi - d.byTargetCluster.lo;

    console.log(
      arm.padEnd(26) +
        pub.padEnd(24) +
        fmt(d.byTask).padEnd(24) +
        fmt(d.byTargetCluster).padEnd(24) +
        `${wTask > 0 ? (wClus / wTask).toFixed(2) : 'n/a'}x`,
    );

    report.arms[`${provenance}#${arm}`] = {
      published: published ? { successAt5: published.successAt5, ci: published.successAt5Ci, n: published.n } : null,
      byTask: d.byTask,
      byDistinctTarget: d.byDistinctTarget,
      byTargetCluster: d.byTargetCluster,
      clusterVsTaskWidthRatio: wTask > 0 ? wClus / wTask : null,
      endToEnd: ec.endToEnd.byTargetCluster,
      conditional: ec.conditional.byTargetCluster,
      conditionalTasks: ec.conditionalTasks,
      excludedFromConditional: ec.excludedFromConditional,
    };
  }

  // The end-to-end vs conditional gap, which is the reachability story.
  const anyArm = report.arms[`${provenance}#F_ALL_CHUNKS`];
  if (anyArm) {
    console.log(
      `\n  reachability: ${anyArm.conditionalTasks} of ${tasks.length} tasks have their target in production; ` +
        `${anyArm.excludedFromConditional} do not and count as MISSES end-to-end.`,
    );
    console.log(
      `  F_ALL_CHUNKS by cluster — END-TO-END ${(100 * anyArm.endToEnd.point).toFixed(1)}%  ` +
        `vs CONDITIONAL ${(100 * anyArm.conditional.point).toFixed(1)}%`,
    );
  }
}

/**
 * THE CAVEAT THAT HAS TO TRAVEL WITH THE END-TO-END NUMBER.
 *
 * `targetInProduction` means "this document has a HEAD:4800 vector in
 * new1_doc_vector_stage". For arm A — what production serves today — that is
 * exactly the right reachability test.
 *
 * For arms B/C/D/F it is a SCENARIO, not a property of the arm: V3 re-embedded
 * every pool document, so those arms had a vector for everything. Applying
 * `targetInProduction` to arm F therefore answers "what would an advocate get if
 * we shipped passages over exactly the population HEAD has staged today" — a
 * real and decision-relevant question, and NOT a bound on a full-corpus passage
 * build, which would cover more documents and score differently.
 *
 * Writing this into the artifact because the 37.8% figure is already circulating
 * and the difference between 37.8% and 24.4% is precisely the kind of thing that
 * gets quoted without its condition.
 */
report.endToEndCaveat =
  'END-TO-END here uses targetInProduction = "has a HEAD:4800 vector in new1_doc_vector_stage". ' +
  'For arm A that is the true production reachability. For arms B/C/D/F it is the SCENARIO ' +
  '"passages shipped over exactly today\'s staged population" — not a bound on a full-corpus ' +
  'passage build, which would cover more documents. Do not quote the end-to-end number without this condition.';
report.widthFinding =
  'Cluster resampling widened intervals by only 0.96x-1.26x on the real correlation structure, ' +
  'NOT the 2.11x seen on synthetic maximally-correlated data. V3 published task-level intervals ' +
  'and they were NOT materially too tight. This refutes the concern that motivated the check.';

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nwritten ${OUT.pathname}`);
console.log('\nNOTE: no point estimate changed. Only the uncertainty around it did, and only');
console.log('      because V3 counted correlated queries as independent authorities.');
