#!/usr/bin/env node
/**
 * NEW1 — DEVELOPMENT / HELD-OUT SPLIT FOR ABSTENTION. §7 NEW1-3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPLIT IS BY CLUSTER, NOT BY TASK, AND THAT IS THE WHOLE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1-3 says: develop the abstention threshold on a development split, evaluate
 * on held-out, and do not tune against the final evaluation labels.
 *
 * Splitting 295 TASKS at random would satisfy the letter of that and break it in
 * substance. Tasks are not independent: several ask about the SAME authority, and
 * the V3.1 manifest records exactly which — 295 tasks collapse to 211 target
 * clusters. If two tasks about one judgment land on opposite sides, then tuning a
 * similarity threshold on the development half has already seen the held-out
 * half's target, its text, and its neighbourhood. The threshold would be fitted
 * to the answer and the held-out score would be optimistic by construction.
 *
 * So the unit of splitting is the CLUSTER. Every task in a cluster goes to the
 * same side. That is the only split under which "held-out" means anything here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISTIC, AND FIXED BEFORE ANY SCORE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Assignment is `sha256(seed + clusterId)` compared against a ratio — a pure
 * function of the frozen manifest, so it is reproducible without storing it, and
 * it is stored anyway so that a later run cannot quietly re-roll it.
 *
 * It is generated NOW, before a single abstention score has been computed, which
 * is what makes the pre-registration in ABSTENTION_PREREGISTRATION.md a
 * pre-registration rather than a description.
 *
 * USAGE
 *   node services/harness/src/v31-split-cli.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const MANIFEST = new URL('docs/ai/new1-tier-a/V31_MANIFEST.json', ROOT);
const OUT = new URL('docs/ai/new1-tier-a/V31_ABSTENTION_SPLIT.json', ROOT);

/** Fraction of CLUSTERS assigned to development. Held-out gets the rest. */
const DEV_RATIO = Number(process.env.DEV_RATIO ?? 0.5);

const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const seed = m.seeds.seed;
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Uniform in [0,1) from the first 52 bits of the digest. */
const unit = (s) => Number.parseInt(sha(s).slice(0, 13), 16) / 2 ** 52;

/**
 * STRATIFIED BY (provenance, queryClass), AND THE FIRST VERSION WAS NOT.
 *
 * An unstratified cluster split — one hash per cluster against DEV_RATIO — was
 * written first and measured. It produced:
 *
 *     DEVELOPMENT   7 POSED tasks
 *     HELD_OUT     38 POSED tasks
 *     long_narrative / pasted_passage / statute:  ZERO in development
 *
 * because 250 of the 295 tasks are LIFTED singleton clusters and they drown the
 * 45 POSED ones. A threshold calibrated on 7 tasks across 5 classes is not
 * calibrated, and three classes could not have been calibrated for at all.
 *
 * The unit of splitting is still the CLUSTER — that part was right and is what
 * keeps the two sides from sharing an authority. What changes is that clusters
 * are bucketed by stratum FIRST, then each bucket is split by taking a seeded
 * prefix. Taking a prefix rather than thresholding each cluster independently
 * matters at these sizes: with 3 clusters in a stratum, independent coin flips
 * give an empty side about a quarter of the time, and a prefix never does.
 */
const stratumOf = (clusterId) => {
  const inCluster = m.tasks.filter((t) => t.clusterId === clusterId);
  const posed = inCluster.filter((t) => t.provenance === 'POSED');
  // A cluster containing any POSED task is stratified by that task's class —
  // POSED is the scarce, decision-relevant population and must not be diluted.
  return posed.length > 0 ? `POSED:${posed[0].queryClass}` : 'LIFTED';
};

const buckets = new Map();
for (const c of m.clusters) {
  const s = stratumOf(c.clusterId);
  buckets.set(s, [...(buckets.get(s) ?? []), c.clusterId]);
}

const assignment = new Map();
for (const [_stratum, ids] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  // Deterministic order within the stratum, then an exact prefix to development.
  const ordered = [...ids].sort(
    (a, b) => unit(`${seed}#split#${a}`) - unit(`${seed}#split#${b}`) || a - b,
  );
  const nDev = Math.round(ordered.length * DEV_RATIO);
  ordered.forEach((id, i) => assignment.set(id, i < nDev ? 'DEVELOPMENT' : 'HELD_OUT'));
}

const tasks = m.tasks.map((t) => ({
  taskId: t.taskId,
  provenance: t.provenance,
  queryClass: t.queryClass,
  clusterId: t.clusterId,
  split: assignment.get(t.clusterId) ?? 'HELD_OUT',
  targets: t.targets,
  targetsInIndexAtFreeze: t.targetsInIndexAtFreeze,
}));

const tally = (pred) => {
  const rows = tasks.filter(pred);
  const byClass = {};
  for (const t of rows) byClass[t.queryClass] = (byClass[t.queryClass] ?? 0) + 1;
  return {
    tasks: rows.length,
    clusters: new Set(rows.map((t) => t.clusterId)).size,
    distinctTargets: new Set(rows.flatMap((t) => t.targets)).size,
    posed: rows.filter((t) => t.provenance === 'POSED').length,
    lifted: rows.filter((t) => t.provenance === 'LIFTED').length,
    byQueryClass: byClass,
  };
};

const dev = tally((t) => t.split === 'DEVELOPMENT');
const held = tally((t) => t.split === 'HELD_OUT');

// A target that appears on BOTH sides would be exactly the leak the cluster split
// exists to prevent. Assert it, do not assume it.
const devTargets = new Set(tasks.filter((t) => t.split === 'DEVELOPMENT').flatMap((t) => t.targets));
const heldTargets = new Set(tasks.filter((t) => t.split === 'HELD_OUT').flatMap((t) => t.targets));
const leaked = [...devTargets].filter((g) => heldTargets.has(g));

const body = {
  kind: 'new1_v31_abstention_split',
  builtAt: new Date().toISOString(),
  manifestContentSha256: m.contentSha256 ?? null,
  seed,
  devRatio: DEV_RATIO,
  unitOfSplit: 'TARGET CLUSTER — never the task, because tasks sharing an authority are not independent.',
  stratification:
    'Clusters bucketed by (POSED:<queryClass> | LIFTED), then an exact seeded prefix per bucket. An unstratified split was measured first and gave DEVELOPMENT only 7 POSED tasks with three classes at zero; 250 LIFTED singleton clusters drown the 45 POSED ones.',
  development: dev,
  heldOut: held,
  leakCheck: {
    targetsOnBothSides: leaked.length,
    ids: leaked,
    verdict: leaked.length === 0 ? 'CLEAN — no target appears on both sides' : 'LEAK — split is invalid',
  },
  tasks,
};

writeFileSync(OUT, JSON.stringify(body, null, 2));

console.log('V3.1 ABSTENTION SPLIT');
console.log(`  unit          target cluster (${m.clusters.length} clusters over ${m.tasks.length} tasks)`);
console.log(`  DEVELOPMENT   ${dev.tasks} tasks · ${dev.clusters} clusters · ${dev.distinctTargets} targets  (POSED ${dev.posed} / LIFTED ${dev.lifted})`);
console.log(`  HELD_OUT      ${held.tasks} tasks · ${held.clusters} clusters · ${held.distinctTargets} targets  (POSED ${held.posed} / LIFTED ${held.lifted})`);
console.log(`  leak check    ${body.leakCheck.verdict}`);
console.log('');
console.log('  POSED tasks by class, per side (the classes that decide whether abstention is even measurable):');
const classes = [...new Set(m.tasks.filter((t) => t.provenance === 'POSED').map((t) => t.queryClass))].sort();
for (const c of classes) {
  const d = tasks.filter((t) => t.split === 'DEVELOPMENT' && t.provenance === 'POSED' && t.queryClass === c).length;
  const h = tasks.filter((t) => t.split === 'HELD_OUT' && t.provenance === 'POSED' && t.queryClass === c).length;
  console.log(`    ${c.padEnd(24)} dev ${String(d).padStart(3)}   held ${String(h).padStart(3)}`);
}
console.log('');
console.log(`  written ${OUT.pathname}`);
if (leaked.length > 0) process.exitCode = 1;
