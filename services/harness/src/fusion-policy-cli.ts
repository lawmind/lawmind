/**
 * `pnpm fusion:policy` — does the criminal routing signal SURVIVE out of sample?
 *
 * `fusion-sweep-cli.ts` found the defect: production's equal-weight RRF destroys
 * 7 criminal dense successes and creates 0 (`p = 0.0156`, n = 83), while civil is
 * neutral (`+13/−15`, `p = 0.85`). It then recommended `QUERY_ROUTED_HYBRID` with
 * `wSparse = 0.15` for criminal.
 *
 * That recommendation was SELECTED on the same 83 queries it was measured on.
 * A weight chosen to maximise a metric on 83 observations and then reported at
 * that maximum is a training score wearing a test score's clothes, and the
 * honest correction is not a caveat — it is a held-out measurement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS TOOL ADDS THAT THE SWEEP DID NOT HAVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. **Repeated stratified split-half validation.** Each repetition splits the
 *    283 queries in half, stratified by group so both halves keep the criminal
 *    fraction. The tuned policies pick their weight on the TRAIN half only and
 *    are scored on the TEST half. A policy whose advantage is a fit to 83
 *    queries collapses here; a real effect does not. The untuned policies
 *    (`DENSE_ONLY`, `CURRENT_EQUAL_RRF`, `CRIMINAL_DENSE_ONLY`) are scored on
 *    the same TEST halves, so every arm is compared on identical data.
 *
 * 2. **A global-weight competitor that is tuned exactly as hard.** If a single
 *    corpus-wide weight, given the same freedom to fit the training half, wins
 *    on held-out data, then ROUTING buys nothing and the extra machinery is not
 *    justified. Beating an untuned baseline is not evidence for routing; beating
 *    an equally-tuned non-routed policy is.
 *
 * 3. **Paired bootstrap confidence intervals** on the full 283, query-level and
 *    stratified by group, for every metric and every policy pair of interest.
 *    Percentile CIs, 10,000 resamples, deterministic seed.
 *
 * 4. **The two counts the founder-level question actually turns on**, separated
 *    because they point in opposite directions:
 *      · dense successes DESTROYED  — what fusion costs
 *      · sparse-only wins ADDED     — what fusion buys, restricted to queries
 *        where gold is genuinely absent from the dense list, i.e. a document
 *        the dense arm could not have ranked at all. A "win" where gold was
 *        already in the dense list at rank 6-20 is a REORDERING win and is
 *        counted separately: it does not evidence coverage value.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT STILL CANNOT SEE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The pass is `CONTROLLED (courts=[sc])` and every gold judgment in it is
 * embedded, so BOTH arms can reach every candidate. The coverage cliff that
 * makes global sparse down-weighting dangerous in production is invisible here
 * BY CONSTRUCTION — not absent, invisible. No number produced by this tool is
 * evidence about unembedded documents, and the recommendation block says so.
 *
 * Offline. Ranks only. No database, no embedder, no network.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mcnemarExactP } from './stats.ts';
import { meanNdcgAtK } from './metrics.ts';

const require = createRequire(import.meta.url);

type Arm = 'sparse' | 'dense' | 'hybrid';

type Line = {
  readonly pass: string;
  readonly mode: Arm;
  readonly row: {
    readonly id: string;
    readonly group: string;
    readonly language: string;
    readonly rankedIds?: readonly string[];
  };
};

type Query = {
  readonly id: string;
  readonly group: string;
  readonly language: string;
  readonly gold: readonly string[];
  readonly ranked: Partial<Record<Arm, readonly string[]>>;
};

const CHECKPOINT =
  process.env['ARMS_CHECKPOINT'] ??
  fileURLToPath(new URL('../../../arms-checkpoint.jsonl', import.meta.url));
const PASS = (process.env['ARMS_PASS'] ?? 'CONTROLLED').toUpperCase();
const OUT = process.env['FUSION_POLICY_JSON'] ?? null;
const RRF_K = Number(process.env['RRF_K'] ?? 60);
const DEPTH = 20;
const REPEATS = Number(process.env['POLICY_REPEATS'] ?? 1000);
const BOOTSTRAP = Number(process.env['POLICY_BOOTSTRAP'] ?? 10000);
const SEED = Number(process.env['POLICY_SEED'] ?? 20260819);

/**
 * The weight grid the tuned policies may choose from. Includes 0 (drop the arm)
 * and 1 (production) so a tuned policy is free to reproduce either baseline
 * rather than being forced into an interior weight it does not want.
 */
const GRID = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1];

type EvalFixture = {
  readonly queries: readonly {
    readonly id: string;
    readonly group: string;
    readonly language: string;
    readonly goldJudgmentIds: readonly string[];
  }[];
};

async function load(): Promise<Query[]> {
  const fixture = require('./fixtures/queries.eval.json') as EvalFixture;
  const gold = new Map(fixture.queries.map((q) => [q.id, q]));

  const byQuery = new Map<
    string,
    { group: string; language: string; ranked: Partial<Record<Arm, readonly string[]>> }
  >();
  const rl = createInterface({ input: createReadStream(CHECKPOINT), crlfDelay: Infinity });
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    let line: Line;
    try {
      line = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    if (line.pass.toUpperCase() !== PASS) continue;
    if (!line.row.rankedIds) continue;
    const entry = byQuery.get(line.row.id) ?? {
      group: line.row.group,
      language: line.row.language,
      ranked: {},
    };
    entry.ranked[line.mode] = line.row.rankedIds;
    byQuery.set(line.row.id, entry);
  }

  const out: Query[] = [];
  for (const [id, entry] of byQuery) {
    const g = gold.get(id);
    if (!g) continue;
    out.push({
      id,
      group: entry.group,
      language: entry.language,
      gold: g.goldJudgmentIds,
      ranked: entry.ranked,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** Production's weighted RRF, ties broken sparse-first exactly as `rrf()` does. */
function fuse(q: Query, wSparse: number, wDense: number, k: number): string[] {
  const scores = new Map<string, number>();
  const add = (ids: readonly string[] | undefined, w: number): void => {
    if (!ids || w === 0) return;
    ids.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + w / (k + (i + 1))));
  };
  add(q.ranked.sparse, wSparse);
  add(q.ranked.dense, wDense);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, DEPTH)
    .map(([id]) => id);
}

function goldRank(ranked: readonly string[], gold: readonly string[]): number | null {
  for (let i = 0; i < ranked.length; i += 1) {
    const id = ranked[i];
    if (id !== undefined && gold.includes(id)) return i + 1;
  }
  return null;
}

type Metrics = {
  n: number;
  successAt5: number;
  recallAt20: number;
  mrr: number;
  ndcgAt5: number;
  ndcgAt20: number;
};

function score(ranks: readonly (number | null)[]): Metrics {
  const n = ranks.length;
  if (n === 0) return { n: 0, successAt5: 0, recallAt20: 0, mrr: 0, ndcgAt5: 0, ndcgAt20: 0 };
  return {
    n,
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a: number, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt5: meanNdcgAtK([...ranks], 5),
    ndcgAt20: meanNdcgAtK([...ranks], 20),
  };
}

/**
 * A policy is a per-query weight for the sparse arm. `theta` is the tunable the
 * split-half loop is allowed to choose; untuned policies ignore it.
 */
type Policy = {
  readonly name: string;
  readonly tuned: boolean;
  readonly wSparse: (q: Query, theta: number) => number;
  readonly note: string;
};

const POLICIES: Policy[] = [
  {
    name: 'DENSE_ONLY',
    tuned: false,
    wSparse: () => 0,
    note: 'sparse arm dropped entirely — unshippable at current embedding coverage',
  },
  {
    name: 'CURRENT_EQUAL_RRF',
    tuned: false,
    wSparse: () => 1,
    note: 'production today',
  },
  {
    name: 'CRIMINAL_DENSE_ONLY + CIVIL_EXISTING_HYBRID',
    tuned: false,
    wSparse: (q) => (q.group === 'criminal' ? 0 : 1),
    note: 'routed, no free parameter — criminal drops sparse, civil unchanged',
  },
  {
    name: 'CRIMINAL_SPARSE_DOWNWEIGHT(theta) + CIVIL_EXISTING_HYBRID',
    tuned: true,
    wSparse: (q, theta) => (q.group === 'criminal' ? theta : 1),
    note: 'routed, one free parameter fitted on the train half only',
  },
  {
    name: 'GLOBAL_DOWNWEIGHT(theta)',
    tuned: true,
    wSparse: (_q, theta) => theta,
    note: 'NOT routed, one free parameter fitted on the train half — the control for "is routing what helps?"',
  },
];

/** Deterministic RNG so a re-run reproduces every interval exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ranks under a policy, precomputed per (policy, theta) so the bootstrap and the
 * split-half loop resample INDICES rather than recomputing fusion millions of
 * times. Fusion is a pure function of the stored lists, so this is exact, not an
 * approximation.
 */
function ranksFor(queries: readonly Query[], p: Policy, theta: number): (number | null)[] {
  return queries.map((q) => goldRank(fuse(q, p.wSparse(q, theta), 1, RRF_K), q.gold));
}

function successAt5(ranks: readonly (number | null)[], idx: readonly number[]): number {
  if (idx.length === 0) return 0;
  let hit = 0;
  for (const i of idx) {
    const r = ranks[i];
    if (r !== null && r !== undefined && r <= 5) hit += 1;
  }
  return hit / idx.length;
}

function metricsOn(ranks: readonly (number | null)[], idx: readonly number[]): Metrics {
  return score(idx.map((i) => ranks[i] ?? null));
}

/**
 * Pick θ on a set of query indices: highest success@5, ties broken toward the
 * LARGER weight. The tie-break is not cosmetic — the sweep found the 0.05–0.70
 * band flat, so a training half will frequently produce ties, and breaking them
 * toward the smaller weight would drift the policy toward dropping the sparse
 * arm on noise alone. Larger weight = more coverage preserved = the safe side.
 */
function pickTheta(
  cache: Map<string, (number | null)[]>,
  name: string,
  grid: readonly number[],
  idx: readonly number[],
): number {
  let best = -1;
  let theta = grid[0] ?? 0;
  for (const t of grid) {
    const s = successAt5(cache.get(`${name}@${t}`) as (number | null)[], idx);
    if (s > best + 1e-12) {
      best = s;
      theta = t;
    } else if (s > best - 1e-12 && t > theta) {
      theta = t;
    }
  }
  return theta;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (pos - lo);
}

async function main(): Promise<void> {
  const queries = await load();
  const nAll = queries.length;
  const groups = [...new Set(queries.map((q) => q.group))].sort();
  const byGroup = new Map<string, number[]>();
  queries.forEach((q, i) => {
    const arr = byGroup.get(q.group) ?? [];
    arr.push(i);
    byGroup.set(q.group, arr);
  });

  console.log('FUSION POLICY — OUT-OF-SAMPLE VALIDATION');
  console.log('='.repeat(78));
  console.log(`checkpoint  ${CHECKPOINT}`);
  console.log(`pass        ${PASS}   queries ${nAll}   k ${RRF_K}   depth ${DEPTH}`);
  console.log(
    `groups      ${groups.map((g) => `${g}=${(byGroup.get(g) ?? []).length}`).join('  ')}`,
  );
  console.log(`repeats     ${REPEATS} split-half   bootstrap ${BOOTSTRAP}   seed ${SEED}`);
  console.log('');

  const allIdx = queries.map((_, i) => i);

  /** Precompute ranks for every policy at every grid point once. */
  const ranksCache = new Map<string, (number | null)[]>();
  const key = (p: string, t: number): string => `${p}@${t}`;
  for (const p of POLICIES) {
    const thetas = p.tuned ? GRID : [0];
    for (const t of thetas) ranksCache.set(key(p.name, t), ranksFor(queries, p, t));
  }

  // ── 1 · FULL-SET METRICS (in-sample, reported for continuity with the sweep) ──
  console.log('FULL-SET (IN-SAMPLE — the number the sweep reported, not the decision number)');
  console.log('-'.repeat(78));
  console.log(
    'policy'.padEnd(46) +
      'succ@5'.padStart(8) +
      'rec@20'.padStart(8) +
      'MRR'.padStart(7) +
      'nDCG@5'.padStart(8) +
      'nDCG@20'.padStart(9),
  );

  const denseRanks = ranksCache.get(key('DENSE_ONLY', 0)) as (number | null)[];
  const fullSet: Record<string, unknown>[] = [];
  const inSampleTheta = new Map<string, number>();

  for (const p of POLICIES) {
    let theta = 0;
    let ranks = ranksCache.get(key(p.name, 0)) as (number | null)[];
    if (p.tuned) {
      // in-sample best, reported ONLY so the held-out number below can be compared to it
      theta = pickTheta(ranksCache, p.name, GRID, allIdx);
      ranks = ranksCache.get(key(p.name, theta)) as (number | null)[];
      inSampleTheta.set(p.name, theta);
    }
    const m = metricsOn(ranks, allIdx);

    // transitions against DENSE_ONLY
    let destroyed = 0;
    let addedReorder = 0;
    let addedSparseOnly = 0;
    for (let i = 0; i < nAll; i += 1) {
      const q = queries[i] as Query;
      const d = denseRanks[i];
      const r = ranks[i];
      const dHit = d !== null && d !== undefined && d <= 5;
      const rHit = r !== null && r !== undefined && r <= 5;
      if (dHit && !rHit) destroyed += 1;
      if (!dHit && rHit) {
        const inDense = (q.ranked.dense ?? []).some((id) => q.gold.includes(id));
        if (inDense) addedReorder += 1;
        else addedSparseOnly += 1;
      }
    }

    const label = p.tuned ? `${p.name.replace('(theta)', `(θ=${theta})`)}` : p.name;
    console.log(
      label.slice(0, 45).padEnd(46) +
        pct(m.successAt5).padStart(8) +
        pct(m.recallAt20).padStart(8) +
        m.mrr.toFixed(3).padStart(7) +
        m.ndcgAt5.toFixed(3).padStart(8) +
        m.ndcgAt20.toFixed(3).padStart(9),
    );
    fullSet.push({
      policy: p.name,
      thetaInSample: p.tuned ? theta : null,
      ...m,
      denseSuccessesDestroyed: destroyed,
      winsAddedByReordering: addedReorder,
      winsAddedSparseOnlyReach: addedSparseOnly,
      mcnemarVsDenseP: mcnemarExactP(addedReorder + addedSparseOnly, destroyed),
      note: p.note,
    });
  }
  console.log('');
  console.log('transitions vs DENSE_ONLY on success@5 (full set):');
  console.log(
    'policy'.padEnd(46) +
      'destroyed'.padStart(10) +
      'add:reorder'.padStart(12) +
      'add:sparse-only'.padStart(16) +
      'McNemar p'.padStart(11),
  );
  for (const f of fullSet) {
    const p = f['mcnemarVsDenseP'] as number | null;
    console.log(
      String(f['policy']).slice(0, 45).padEnd(46) +
        String(f['denseSuccessesDestroyed']).padStart(10) +
        String(f['winsAddedByReordering']).padStart(12) +
        String(f['winsAddedSparseOnlyReach']).padStart(16) +
        (p === null ? '—' : p.toFixed(4)).padStart(11),
    );
  }
  console.log('');
  console.log(
    '  add:sparse-only counts queries whose gold is ABSENT from the dense list — the only',
  );
  console.log(
    '  column that is evidence the sparse arm reaches something dense cannot. Inside this',
  );
  console.log('  SC-only pass every gold is embedded, so a 0 here is expected and proves nothing');
  console.log('  about the 99%+ of the corpus that has no vector.');
  console.log('');

  // ── 2 · REPEATED STRATIFIED SPLIT-HALF (the decision number) ──
  console.log('HELD-OUT: REPEATED STRATIFIED SPLIT-HALF');
  console.log('-'.repeat(78));
  const rng = mulberry32(SEED);
  const testScores = new Map<string, number[]>();
  const testRecall = new Map<string, number[]>();
  const thetaPicks = new Map<string, number[]>();
  for (const p of POLICIES) {
    testScores.set(p.name, []);
    testRecall.set(p.name, []);
    if (p.tuned) thetaPicks.set(p.name, []);
  }
  /** Paired per-repetition differences, so the CI is on the difference not on two means. */
  const pairedDiff = new Map<string, number[]>();

  for (let rep = 0; rep < REPEATS; rep += 1) {
    const train: number[] = [];
    const test: number[] = [];
    for (const g of groups) {
      const idx = [...(byGroup.get(g) ?? [])];
      // Fisher-Yates with the seeded RNG
      for (let i = idx.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const a = idx[i] as number;
        idx[i] = idx[j] as number;
        idx[j] = a;
      }
      const half = Math.floor(idx.length / 2);
      train.push(...idx.slice(0, half));
      test.push(...idx.slice(half));
    }

    const repScore = new Map<string, number>();
    for (const p of POLICIES) {
      let theta = 0;
      if (p.tuned) {
        theta = pickTheta(ranksCache, p.name, GRID, train);
        (thetaPicks.get(p.name) as number[]).push(theta);
      }
      const ranks = ranksCache.get(key(p.name, theta)) as (number | null)[];
      const s5 = successAt5(ranks, test);
      const m = metricsOn(ranks, test);
      (testScores.get(p.name) as number[]).push(s5);
      (testRecall.get(p.name) as number[]).push(m.recallAt20);
      repScore.set(p.name, s5);
    }
    for (const p of POLICIES) {
      if (p.name === 'CURRENT_EQUAL_RRF') continue;
      const d = (repScore.get(p.name) ?? 0) - (repScore.get('CURRENT_EQUAL_RRF') ?? 0);
      const arr = pairedDiff.get(p.name) ?? [];
      arr.push(d);
      pairedDiff.set(p.name, arr);
    }
  }

  console.log(
    'policy'.padEnd(46) +
      'test succ@5'.padStart(12) +
      'test rec@20'.padStart(12) +
      'Δ vs EQUAL (95% CI)'.padStart(24),
  );
  const heldOut: Record<string, unknown>[] = [];
  for (const p of POLICIES) {
    const s = testScores.get(p.name) as number[];
    const r = testRecall.get(p.name) as number[];
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const meanR = r.reduce((a, b) => a + b, 0) / r.length;
    let ciText = '—  (reference)';
    let lo = NaN;
    let hi = NaN;
    let meanD = NaN;
    let winRate = NaN;
    if (p.name !== 'CURRENT_EQUAL_RRF') {
      const d = [...(pairedDiff.get(p.name) as number[])].sort((a, b) => a - b);
      lo = quantile(d, 0.025);
      hi = quantile(d, 0.975);
      meanD = d.reduce((a, b) => a + b, 0) / d.length;
      winRate = d.filter((x) => x > 0).length / d.length;
      ciText = `${(meanD * 100 >= 0 ? '+' : '') + (meanD * 100).toFixed(2)}  [${(lo * 100).toFixed(2)}, ${(hi * 100).toFixed(2)}]`;
    }
    const picks = thetaPicks.get(p.name);
    const label = p.tuned && picks ? `${p.name.replace('(theta)', '(θ fitted)')}` : p.name;
    console.log(
      label.slice(0, 45).padEnd(46) +
        pct(mean).padStart(12) +
        pct(meanR).padStart(12) +
        ciText.padStart(24),
    );
    heldOut.push({
      policy: p.name,
      testSuccessAt5Mean: mean,
      testRecallAt20Mean: meanR,
      deltaVsEqualMean: p.name === 'CURRENT_EQUAL_RRF' ? null : meanD,
      deltaVsEqualCi95: p.name === 'CURRENT_EQUAL_RRF' ? null : [lo, hi],
      repetitionsBeatingEqual: p.name === 'CURRENT_EQUAL_RRF' ? null : winRate,
      thetaHistogram: picks
        ? Object.fromEntries(
            GRID.map((t) => [t, picks.filter((x) => x === t).length]).filter(
              ([, c]) => (c as number) > 0,
            ),
          )
        : null,
    });
  }
  console.log('');
  console.log('  Δ is points of success@5 on the held-out half, paired within repetition.');
  console.log('  A CI that includes 0 means the policy is not distinguishable from production');
  console.log('  on data it was not fitted to.');
  console.log('');
  for (const p of POLICIES) {
    const picks = thetaPicks.get(p.name);
    if (!picks) continue;
    const hist = GRID.map((t) => [t, picks.filter((x) => x === t).length] as const).filter(
      ([, c]) => c > 0,
    );
    console.log(
      `  θ chosen by ${p.name.split('(')[0]?.trim()}: ` +
        hist.map(([t, c]) => `${t}×${((c / picks.length) * 100).toFixed(0)}%`).join('  '),
    );
  }
  console.log('');
  console.log(
    '  A θ histogram spread across the grid IS the finding: the training half does not',
  );
  console.log('  contain enough signal to identify a weight, so no constant is defensible.');
  console.log('');

  // ── 3 · PAIRED BOOTSTRAP ON THE FULL SET ──
  console.log('PAIRED BOOTSTRAP (full 283, stratified by group, percentile CI)');
  console.log('-'.repeat(78));
  const brng = mulberry32(SEED ^ 0x5f3759df);
  type Pair = { readonly a: string; readonly at: number; readonly b: string; readonly bt: number };
  const pairs: Pair[] = [
    { a: 'DENSE_ONLY', at: 0, b: 'CURRENT_EQUAL_RRF', bt: 0 },
    {
      a: 'CRIMINAL_DENSE_ONLY + CIVIL_EXISTING_HYBRID',
      at: 0,
      b: 'CURRENT_EQUAL_RRF',
      bt: 0,
    },
    {
      a: 'CRIMINAL_SPARSE_DOWNWEIGHT(theta) + CIVIL_EXISTING_HYBRID',
      at: inSampleTheta.get('CRIMINAL_SPARSE_DOWNWEIGHT(theta) + CIVIL_EXISTING_HYBRID') ?? 0.15,
      b: 'CURRENT_EQUAL_RRF',
      bt: 0,
    },
    {
      a: 'CRIMINAL_DENSE_ONLY + CIVIL_EXISTING_HYBRID',
      at: 0,
      b: 'DENSE_ONLY',
      bt: 0,
    },
  ];

  /** Pre-draw one set of resample index arrays so every pair sees identical draws. */
  const draws: number[][] = [];
  for (let b = 0; b < BOOTSTRAP; b += 1) {
    const idx: number[] = [];
    for (const g of groups) {
      const pool = byGroup.get(g) ?? [];
      for (let i = 0; i < pool.length; i += 1) {
        idx.push(pool[Math.floor(brng() * pool.length)] as number);
      }
    }
    draws.push(idx);
  }

  const bootstrapOut: Record<string, unknown>[] = [];
  console.log(
    'comparison'.padEnd(52) + 'Δsucc@5'.padStart(9) + '95% CI'.padStart(20) + 'P(Δ>0)'.padStart(9),
  );
  for (const pr of pairs) {
    const ra = ranksCache.get(key(pr.a, pr.at)) as (number | null)[];
    const rb = ranksCache.get(key(pr.b, pr.bt)) as (number | null)[];
    const diffs: number[] = [];
    for (const idx of draws) diffs.push(successAt5(ra, idx) - successAt5(rb, idx));
    diffs.sort((x, y) => x - y);
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const lo = quantile(diffs, 0.025);
    const hi = quantile(diffs, 0.975);
    const pGt = diffs.filter((d) => d > 0).length / diffs.length;
    const label = `${pr.a.split('(')[0]?.trim()} − ${pr.b.split('(')[0]?.trim()}`;
    console.log(
      label.slice(0, 51).padEnd(52) +
        ((mean * 100 >= 0 ? '+' : '') + (mean * 100).toFixed(2)).padStart(9) +
        `[${(lo * 100).toFixed(2)}, ${(hi * 100).toFixed(2)}]`.padStart(20) +
        pGt.toFixed(3).padStart(9),
    );
    bootstrapOut.push({
      a: pr.a,
      aTheta: pr.at,
      b: pr.b,
      bTheta: pr.bt,
      deltaSuccessAt5Mean: mean,
      ci95: [lo, hi],
      probDeltaPositive: pGt,
    });
  }
  console.log('');

  // ── 4 · GROUP-LEVEL BOOTSTRAP, criminal only ──
  console.log('CRIMINAL SUBGROUP ONLY (the group the whole recommendation rests on)');
  console.log('-'.repeat(78));
  const criminalIdx = byGroup.get('criminal') ?? [];
  const crng = mulberry32(SEED ^ 0x9e3779b9);
  const critDraws: number[][] = [];
  for (let b = 0; b < BOOTSTRAP; b += 1) {
    const idx: number[] = [];
    for (let i = 0; i < criminalIdx.length; i += 1)
      idx.push(criminalIdx[Math.floor(crng() * criminalIdx.length)] as number);
    critDraws.push(idx);
  }
  const criminalOut: Record<string, unknown>[] = [];
  console.log(
    'policy (criminal queries only)'.padEnd(52) +
      'succ@5'.padStart(9) +
      '95% CI'.padStart(20) +
      'Δ vs EQUAL'.padStart(12),
  );
  const equalCrim = ranksCache.get(key('CURRENT_EQUAL_RRF', 0)) as (number | null)[];
  for (const p of POLICIES) {
    const theta = p.tuned ? (inSampleTheta.get(p.name) ?? 0) : 0;
    const ranks = ranksCache.get(key(p.name, theta)) as (number | null)[];
    const vals: number[] = [];
    const diffs: number[] = [];
    for (const idx of critDraws) {
      vals.push(successAt5(ranks, idx));
      diffs.push(successAt5(ranks, idx) - successAt5(equalCrim, idx));
    }
    vals.sort((a, b) => a - b);
    diffs.sort((a, b) => a - b);
    const point = successAt5(ranks, criminalIdx);
    const meanD = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    console.log(
      p.name.replace('(theta)', `(θ=${theta})`).slice(0, 51).padEnd(52) +
        pct(point).padStart(9) +
        `[${(quantile(vals, 0.025) * 100).toFixed(1)}, ${(quantile(vals, 0.975) * 100).toFixed(1)}]`.padStart(
          20,
        ) +
        ((meanD * 100 >= 0 ? '+' : '') + (meanD * 100).toFixed(2)).padStart(12),
    );
    criminalOut.push({
      policy: p.name,
      theta: p.tuned ? theta : null,
      successAt5: point,
      ci95: [quantile(vals, 0.025), quantile(vals, 0.975)],
      deltaVsEqualMean: meanD,
      deltaVsEqualCi95: [quantile(diffs, 0.025), quantile(diffs, 0.975)],
      probBetterThanEqual: diffs.filter((d) => d > 0).length / diffs.length,
    });
  }
  console.log('');

  const artifact = {
    tool: 'services/harness/src/fusion-policy-cli.ts',
    generatedAt: new Date().toISOString(),
    checkpoint: CHECKPOINT,
    pass: PASS,
    queries: nAll,
    groups: Object.fromEntries(groups.map((g) => [g, (byGroup.get(g) ?? []).length])),
    rrfK: RRF_K,
    depth: DEPTH,
    repeats: REPEATS,
    bootstrap: BOOTSTRAP,
    seed: SEED,
    grid: GRID,
    method: {
      heldOut:
        'repeated stratified split-half; tuned policies pick θ on the train half by success@5 (ties broken toward the LARGER weight, i.e. the higher-coverage choice); all policies scored on the same test half',
      bootstrap:
        'query-level resampling with replacement, stratified by group, identical draws shared across every comparison so differences are paired',
      limitation:
        'CONTROLLED pass, courts=[sc]; every gold judgment is embedded, so both arms can reach every candidate. Nothing here measures the coverage cliff for unembedded documents.',
    },
    fullSetInSample: fullSet,
    heldOut,
    bootstrapPairs: bootstrapOut,
    criminalSubgroup: criminalOut,
  };

  if (OUT) {
    writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`artifact → ${OUT}`);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
