#!/usr/bin/env node
/**
 * NEW1 — ABSTENTION CALIBRATION CANDIDATE. R7 §9 NEW1-P0.
 *
 * Input:  docs/ai/new1-tier-a/PASSAGE_100K_METRICS.json  (per-task, per-arm ranks)
 *         docs/ai/new1-tier-a/V31_ABSTENTION_SPLIT.json  (frozen cluster split)
 * Output: docs/ai/new1-tier-a/ABSTENTION_CANDIDATE.json
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TUNED ON DEVELOPMENT ONLY. THE HELD-OUT SPLIT IS READ ONCE, AT THE END, TO
 * REPORT — NEVER TO CHOOSE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R7: "Fifth owns hidden holdout. NEW1 tunes on train/dev only. Do not optimize
 * on final hidden labels."
 *
 * Enforced structurally rather than by intention: `chooseThresholds()` receives
 * ONLY the DEVELOPMENT rows and the held-out rows are not in scope inside it. The
 * held-out block is scored afterwards, from the frozen choice, and if the two
 * disagree that disagreement is the finding — it is not a reason to re-tune.
 *
 * The split itself is unchanged and must stay that way: clusters, not tasks,
 * because two tasks sharing an authority are not independent; and bucketed by
 * (POSED:<queryClass> | LIFTED) because an unstratified split gave DEVELOPMENT
 * only 7 POSED tasks with three classes at zero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR OUTCOMES, AND ONE OF THEM IS NOT ABOUT CONFIDENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   answered          the set may be used
 *   abstained         we looked and found nothing good enough
 *   coverage_unknown  we could not safely search  <- NOT the same as "nothing"
 *   review_required   something is here but it needs a human
 *
 * `coverage_unknown` is the one that matters most and the one a similarity
 * threshold can never produce. LCC measured "anticipatory bail" returning an
 * empty 200 (bus 1173) and NEW3 measured the client rendering that as "no law
 * found" (bus 1147). Both are correct about their own layer and the product
 * result is a lie: the backend refused to search, and the advocate was told the
 * law does not exist.
 *
 * So the signal for `coverage_unknown` is NOT a score. It is structural:
 * the query was refused before ranking, or its target population is knowably
 * outside the index.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE CANNOT DO, STATED UP FRONT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A false-abstention rate needs tasks that SHOULD be answered. A
 * false-confidence rate needs tasks that should NOT be. The V3.1 set is almost
 * entirely the former: every task has a real target. So the negative side is
 * carried by the wrong-domain adversarial set and by the ADVOCATE100
 * `false_premise` / `insufficient_information` classes, and where those are thin
 * the artifact says NOT_MEASURED rather than reporting a rate over four rows.
 *
 * USAGE
 *   node services/harness/src/abstention-calibrate-cli.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const P = (rel) => new URL(rel, ROOT);
const METRICS = P('docs/ai/new1-tier-a/PASSAGE_100K_METRICS.json');
const OUT = P('docs/ai/new1-tier-a/ABSTENTION_CANDIDATE.json');
const ARM = process.env.ABSTAIN_ARM ?? 'ann_ef200';

if (!existsSync(METRICS)) {
  console.error('PASSAGE_100K_METRICS.json does not exist yet. Run passage-eval-cli.mjs first.');
  console.error('Refusing to calibrate abstention against an index whose behaviour has not been measured.');
  process.exit(2);
}

const m = JSON.parse(readFileSync(METRICS, 'utf8'));
const rows = m.perTask;

/**
 * THE SIGNALS.
 *
 * Deliberately few, and every one of them is available to the SERVER at request
 * time. A calibration that needs a label, a target, or anything computed after
 * the fact is a benchmark artefact, not a product control. The benchmark's own
 * `queryClass` is exactly such a field — it is a property of the CITING judgment
 * and production cannot compute it — and it is not used here.
 *
 *   topSim        cosine of the best passage.       "is anything close?"
 *   simGap        top1 - top5 similarity.           "is the best one distinct?"
 *   aboveFloor    how many documents clear a floor. "is there a usable set?"
 */
function signals(r) {
  const a = r.arms[ARM];
  return {
    topSim: a.topSim ?? null,
    simGap: a.simGap ?? null,
    aboveFloor: a.aboveFloor ?? null,
    bestRank: a.bestRank,
    anyIndexed: a.anyIndexed,
    anyNatural: a.anyNatural,
  };
}

/**
 * The decision, given thresholds. Order matters and is not arbitrary:
 * structural refusal is checked FIRST, because a query that was never searched
 * cannot be abstained from on a score it does not have.
 */
function decide(s, th) {
  if (s.topSim === null) return 'coverage_unknown';
  if (s.topSim >= th.answer && (s.simGap ?? 0) >= th.gap) return 'answered';
  if (s.topSim >= th.review) return 'review_required';
  return 'abstained';
}

// Success = the target actually ranked in the top 5. That is the thing an
// abstention decision is trying to predict.
const succeeded = (r) => (r.arms[ARM].bestRank ?? Infinity) <= 5;

function evaluate(rowsIn, th) {
  let answeredRight = 0;
  let answeredWrong = 0;
  let abstainedWrong = 0;
  let abstainedRight = 0;
  let review = 0;
  let coverageUnknown = 0;
  for (const r of rowsIn) {
    const d = decide(signals(r), th);
    const ok = succeeded(r);
    if (d === 'answered') ok ? (answeredRight += 1) : (answeredWrong += 1);
    else if (d === 'abstained') ok ? (abstainedWrong += 1) : (abstainedRight += 1);
    else if (d === 'review_required') review += 1;
    else coverageUnknown += 1;
  }
  const n = rowsIn.length || 1;
  return {
    tasks: rowsIn.length,
    answeredRight,
    answeredWrong,
    abstainedRight,
    abstainedWrong,
    reviewRequired: review,
    coverageUnknown,
    // The two rates that matter, named for what they COST rather than for a
    // statistics textbook.
    falseConfidentRate: Number((answeredWrong / n).toFixed(4)),
    falseAbstentionRate: Number((abstainedWrong / n).toFixed(4)),
    usefulCoverageRate: Number((answeredRight / n).toFixed(4)),
  };
}

/**
 * The objective. NOT accuracy.
 *
 * A false-confident answer costs an advocate their credibility in open court; a
 * false abstention costs them one search. They are not symmetric and an
 * objective that treats them as symmetric will pick a threshold that ships the
 * expensive error. The 4:1 weight is a judgement call, and it is written here in
 * one line so it can be argued with rather than buried in a scoring function.
 */
const FALSE_CONFIDENT_WEIGHT = Number(process.env.FALSE_CONFIDENT_WEIGHT ?? 4);
const objective = (e) => e.usefulCoverageRate - FALSE_CONFIDENT_WEIGHT * e.falseConfidentRate;

/**
 * THE GRID, AND WHY ITS EDGES ARE REPORTED RATHER THAN TRIMMED.
 *
 * An optimum sitting on a grid boundary is not an optimum — it is the search
 * telling you the answer lies outside where you looked. The first run of this
 * calibration returned `answer = 0.30` (the lowest value offered) and
 * `gap = 0.08` (the highest), which means the sim threshold was doing NO work and
 * the gap wanted to go further.
 *
 * The response is not to widen forever. It is to widen once, over a range the
 * observed similarity distribution justifies, and then to STATE in the artifact
 * whether the chosen point still sits on an edge. A threshold on an edge is
 * reported as `EDGE` and must not be deployed without asking why.
 */
const ANSWER_GRID = [];
for (let v = 0.2; v <= 0.9001; v += 0.025) ANSWER_GRID.push(Number(v.toFixed(3)));
const GAP_GRID = [0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.12, 0.16, 0.24, 0.32];

function chooseThresholds(devRows) {
  let best = null;
  for (const answer of ANSWER_GRID) {
    for (const review of ANSWER_GRID.filter((r) => r <= answer)) {
      for (const gap of GAP_GRID) {
        const th = { answer, review, gap };
        const e = evaluate(devRows, th);
        const score = objective(e);
        if (!best || score > best.score) best = { th, e, score };
      }
    }
  }
  const onEdge = [];
  if (best.th.answer === ANSWER_GRID[0] || best.th.answer === ANSWER_GRID[ANSWER_GRID.length - 1]) onEdge.push('answer');
  if (best.th.gap === GAP_GRID[0] || best.th.gap === GAP_GRID[GAP_GRID.length - 1]) onEdge.push('gap');
  best.onEdge = onEdge;
  return best;
}

const dev = rows.filter((r) => r.split === 'DEVELOPMENT');
const held = rows.filter((r) => r.split === 'HELD_OUT');

if (dev.length === 0) {
  console.error('no DEVELOPMENT rows in the metrics file — nothing to tune on.');
  process.exit(2);
}
if (rows.some((r) => r.arms[ARM].topSim === undefined)) {
  console.error('the metrics file carries no similarity signals (topSim/simGap/aboveFloor).');
  console.error('Re-run passage-eval-cli.mjs with the signal-emitting version before calibrating.');
  process.exit(2);
}

/**
 * The observed similarity distribution, recorded so nobody has to guess whether
 * the grid covered the right range. If p05 of `topSim` is above the lowest
 * `answer` value on the grid, the sim threshold cannot discriminate at all and
 * the rule is really a gap-only rule — which is a finding about the SIGNAL, not
 * a tuning detail.
 */
const pct = (arr, q) => (arr.length === 0 ? null : Number(arr[Math.min(arr.length - 1, Math.floor(arr.length * q))].toFixed(4)));
const devSims = dev.map((r) => r.arms[ARM].topSim).filter((x) => typeof x === 'number').sort((a, b) => a - b);
const devGaps = dev.map((r) => r.arms[ARM].simGap).filter((x) => typeof x === 'number').sort((a, b) => a - b);
const distribution = {
  topSim: { p05: pct(devSims, 0.05), p50: pct(devSims, 0.5), p95: pct(devSims, 0.95), n: devSims.length },
  simGap: { p05: pct(devGaps, 0.05), p50: pct(devGaps, 0.5), p95: pct(devGaps, 0.95), n: devGaps.length },
};

const chosen = chooseThresholds(dev);
// ONE read of the held-out split, from the already-frozen choice.
const heldResult = held.length > 0 ? evaluate(held, chosen.th) : null;

const byFamilyHeld = {};
for (const r of held) (byFamilyHeld[r.queryClass] ??= []).push(r);

const body = {
  kind: 'new1_abstention_candidate',
  version: 1,
  builtAt: new Date().toISOString(),
  arm: ARM,
  trancheContentSha256: m.trancheContentSha256,
  indexState: m.indexState,
  discipline: {
    tunedOn: 'DEVELOPMENT only',
    heldOutUse: 'scored ONCE from the frozen thresholds, to report. Never to choose.',
    splitUnit: 'TARGET CLUSTER, never the task — two tasks sharing an authority are not independent.',
    fifthOwnsHiddenHoldout: true,
    note: 'If DEVELOPMENT and HELD_OUT disagree, the disagreement is the finding. It is not a reason to re-tune.',
  },
  objective: {
    formula: 'usefulCoverageRate - W * falseConfidentRate',
    falseConfidentWeight: FALSE_CONFIDENT_WEIGHT,
    why: 'A false-confident answer costs an advocate their credibility in open court. A false abstention costs them one search. A symmetric objective ships the expensive error.',
  },
  thresholds: chosen.th,
  thresholdOnGridEdge: chosen.onEdge,
  thresholdEdgeNote:
    chosen.onEdge.length === 0
      ? 'Interior optimum. The grid contained the answer.'
      : `THE CHOSEN THRESHOLD SITS ON A GRID EDGE (${chosen.onEdge.join(', ')}). An optimum on a boundary is the search saying the answer lies outside where it looked. This candidate must NOT be deployed on this evidence: ask what shape question the edge is really posing.`,
  signalDistribution: distribution,
  development: chosen.e,
  heldOut: heldResult,
  heldOutByFamily: Object.fromEntries(
    Object.entries(byFamilyHeld).map(([f, rs]) => [f, rs.length >= 5 ? evaluate(rs, chosen.th) : { tasks: rs.length, state: 'NOT_MEASURED — fewer than 5 tasks, a rate over this would be noise' }],
    ),
  ),
  outcomeMapping: {
    answered: 'topSim >= answer AND simGap >= gap',
    review_required: 'topSim >= review, but not answered',
    abstained: 'topSim < review',
    coverage_unknown:
      'STRUCTURAL, never a score: the query was refused before ranking, or its target population is knowably outside the index. A similarity threshold CANNOT produce this state, and conflating it with abstained is what turns a backend refusal into "no law found" on the advocate\'s screen.',
  },
  limits: [
    'The V3.1 task set is almost entirely tasks that SHOULD be answered, so falseAbstentionRate is well estimated and falseConfidentRate is estimated over a thin negative set.',
    'Wrong-domain and false-premise negatives live in COMMON_QUERY_BENCHMARK.json and ADVOCATE100 and are scored separately — an aggregate here would hide how thin they are.',
    'These thresholds are calibrated against the TRANCHE index, not production. They are a candidate, not a deployable setting: the score distribution of a 249k-passage index is not that of the production document index.',
  ],
};

const { builtAt: _b, ...invariant } = body;
const contentSha256 = createHash('sha256').update(JSON.stringify(invariant)).digest('hex');
writeFileSync(OUT, JSON.stringify({ ...body, contentSha256 }, null, 2) + '\n');

console.log('ABSTENTION CANDIDATE WRITTEN');
console.log(`  file        ${OUT.pathname}`);
console.log(`  arm         ${ARM}`);
console.log(`  thresholds  answer>=${chosen.th.answer}  review>=${chosen.th.review}  gap>=${chosen.th.gap}`);
console.log('');
console.log('              tasks  usefulCoverage  falseConfident  falseAbstention  review  coverageUnknown');
const line = (name, e) =>
  e === null
    ? console.log(`  ${name.padEnd(12)}  (none)`)
    : console.log(
        `  ${name.padEnd(12)} ${String(e.tasks).padStart(5)} ${String(e.usefulCoverageRate).padStart(15)} ${String(e.falseConfidentRate).padStart(15)} ${String(e.falseAbstentionRate).padStart(16)} ${String(e.reviewRequired).padStart(7)} ${String(e.coverageUnknown).padStart(16)}`,
      );
line('DEVELOPMENT', chosen.e);
line('HELD_OUT', heldResult);
