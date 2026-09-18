/**
 * `pnpm fusion:sweep` — what sparse is WORTH in the fusion, measured offline.
 *
 * Bus 0713 settled the mechanism and ruled out the alternatives: gold was
 * dense-only in 22 of 22 damaged queries, 47.1% of displacers were sparse-only
 * at sparse rank 1-2, and RRF with a single `k` gives an 18.0%-recall arm the
 * same rank-for-rank influence as a 40.6%-recall one. What it did NOT produce
 * is the number to ship. This does.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS OFFLINE AND WHY THAT IS SOUND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RRF is a function of RANKS ONLY. `arms-checkpoint.jsonl` carries every
 * returned rank for all three arms across the frozen 283-query set, so every
 * weighting of those same two lists is computable from the file. Re-running the
 * database would produce the same ranks at far greater cost, on a box whose CPU
 * is saturated — and would not be a cleaner measurement, it would be a noisier
 * one, because the corpus is growing underneath the sparse arm while the dense
 * arm is frozen at 619,636 embedded chunks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIMIT, STATED BEFORE ANY NUMBER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The checkpoint records **20 ranks per arm**, because the harness asked for 20.
 * Production fuses lists **50 deep** (`CANDIDATE_DEPTH` in `retrieve.ts`), so a
 * document at dense rank 34 can reach production's hybrid top 20 and is simply
 * not in this file. Every reconstruction here is therefore fusion **restricted
 * to depth 20**, and the FIDELITY block measures the size of that restriction
 * against the hybrid the same run actually recorded, rather than assuming it
 * away. A sweep whose baseline cannot reproduce the observed system is not
 * evidence, so the fidelity block runs first and prints whether it did.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS SWEPT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   score(d) = wDense/(k + rankDense(d)) + wSparse/(k + rankSparse(d))
 *
 * `wDense` is pinned at 1 and `wSparse` swept, because only the RATIO matters —
 * RRF ordering is invariant under a common positive scale factor. `k` stays at
 * the production 60 for the sweep; the K-SENSITIVITY block re-runs the chosen
 * weight across k to show the recommendation is not an artefact of one constant.
 *
 * Ties break exactly as production breaks them: `rrf()` fills its Map from the
 * sparse list first and then the dense list, and `Array.prototype.sort` is
 * stable, so an equal score keeps sparse-first insertion order. Reproduced here
 * rather than approximated — a tie-break difference is worth about one query at
 * k=60 and would be indistinguishable from a real effect at these sample sizes.
 *
 * Offline. No database, no embedder, no network.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mcnemarExactP, queriesToSettle } from './stats.ts';
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

/**
 * Repo root, not the harness package — `arms-cli.ts` writes the checkpoint to
 * `../../../arms-checkpoint.jsonl` relative to this directory, and resolving it
 * from `import.meta.url` means the tool works from any working directory
 * (`pnpm --filter` runs it from the package root, a shell usually from the repo).
 */
const CHECKPOINT =
  process.env['ARMS_CHECKPOINT'] ??
  fileURLToPath(new URL('../../../arms-checkpoint.jsonl', import.meta.url));
const PASS = (process.env['ARMS_PASS'] ?? 'CONTROLLED').toUpperCase();
const OUT = process.env['FUSION_SWEEP_JSON'] ?? null;
const RRF_K = Number(process.env['RRF_K'] ?? 60);
/** What the harness asked for, and therefore the deepest rank on disk. */
const DEPTH = 20;

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
  let malformed = 0;
  let missingRankedIds = 0;
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    let line: Line;
    try {
      line = JSON.parse(raw) as Line;
    } catch {
      malformed += 1;
      continue;
    }
    if (line.pass.toUpperCase() !== PASS) continue;
    if (!line.row.rankedIds) {
      missingRankedIds += 1;
      continue;
    }
    const entry = byQuery.get(line.row.id) ?? {
      group: line.row.group,
      language: line.row.language,
      ranked: {},
    };
    entry.ranked[line.mode] = line.row.rankedIds;
    byQuery.set(line.row.id, entry);
  }
  if (malformed > 0) console.log(`  ${malformed} malformed lines skipped`);
  if (missingRankedIds > 0)
    console.log(`  ${missingRankedIds} rows carry no rankedIds and were skipped`);

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

/**
 * Weighted RRF over the two stored lists, reproducing production's insertion
 * order and stable sort so ties break identically. A weight of 0 contributes
 * nothing — the arm is genuinely absent, not present with a tiny score.
 */
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

/** 1-based rank of the gold judgment, or null. Single gold per query by construction. */
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

function score(ranks: (number | null)[]): Metrics {
  const n = ranks.length;
  if (n === 0) return { n: 0, successAt5: 0, recallAt20: 0, mrr: 0, ndcgAt5: 0, ndcgAt20: 0 };
  return {
    n,
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a: number, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt5: meanNdcgAtK(ranks, 5),
    ndcgAt20: meanNdcgAtK(ranks, 20),
  };
}

type Config = { readonly name: string; readonly wSparse: number; readonly wDense: number };

const CONFIGS: Config[] = [
  { name: 'DENSE_ONLY', wSparse: 0, wDense: 1 },
  { name: 'SPARSE_ONLY', wSparse: 1, wDense: 0 },
  { name: 'w=0.05', wSparse: 0.05, wDense: 1 },
  { name: 'w=0.10', wSparse: 0.1, wDense: 1 },
  { name: 'w=0.15', wSparse: 0.15, wDense: 1 },
  { name: 'w=0.20', wSparse: 0.2, wDense: 1 },
  { name: 'w=0.25', wSparse: 0.25, wDense: 1 },
  { name: 'w=0.30', wSparse: 0.3, wDense: 1 },
  { name: 'w=0.40', wSparse: 0.4, wDense: 1 },
  { name: 'w=0.50', wSparse: 0.5, wDense: 1 },
  { name: 'w=0.60', wSparse: 0.6, wDense: 1 },
  { name: 'w=0.70', wSparse: 0.7, wDense: 1 },
  { name: 'w=0.85', wSparse: 0.85, wDense: 1 },
  { name: 'EQUAL (production)', wSparse: 1, wDense: 1 },
];

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  console.log(`fusion sweep — ${CHECKPOINT}, pass ${PASS}, k=${RRF_K}, depth ${DEPTH}\n`);
  const queries = await load();
  const complete = queries.filter((q) => q.ranked.dense && q.ranked.sparse);
  console.log(`${queries.length} queries loaded, ${complete.length} with BOTH arms recorded\n`);
  if (complete.length === 0) {
    console.error('no query carries both arms — nothing to sweep');
    process.exitCode = 1;
    return;
  }

  const withHybrid = complete.filter((q) => q.ranked.hybrid);
  const recon = withHybrid.map((q) => fuse(q, 1, 1, RRF_K));
  const observedRanks = withHybrid.map((q) => goldRank(q.ranked.hybrid ?? [], q.gold));
  const reconRanks = recon.map((r, i) => goldRank(r, withHybrid[i]?.gold ?? []));
  const observed = score(observedRanks);
  const reconstructed = score(reconRanks);

  let overlapSum = 0;
  let top5ExactSame = 0;
  let unreachable = 0;
  let hybridSlots = 0;
  for (let i = 0; i < withHybrid.length; i += 1) {
    const q = withHybrid[i];
    const r = recon[i];
    if (!q || !r) continue;
    const hy = q.ranked.hybrid ?? [];
    const union = new Set([...(q.ranked.dense ?? []), ...(q.ranked.sparse ?? [])]);
    const inRecon = new Set(r);
    overlapSum += hy.filter((id) => inRecon.has(id)).length / Math.max(1, hy.length);
    if (hy.slice(0, 5).join('|') === r.slice(0, 5).join('|')) top5ExactSame += 1;
    hybridSlots += hy.length;
    unreachable += hy.filter((id) => !union.has(id)).length;
  }
  const meanOverlap = overlapSum / Math.max(1, withHybrid.length);

  console.log('FIDELITY — depth-20 reconstruction of EQUAL weighting vs the recorded hybrid');
  console.log(`  queries with a recorded hybrid     ${withHybrid.length}`);
  console.log(`  mean top-20 overlap                ${pct(meanOverlap)}`);
  console.log(`  identical top 5                    ${top5ExactSame}/${withHybrid.length}`);
  console.log(
    `  hybrid slots in NEITHER stored arm ${unreachable}/${hybridSlots} (${pct(
      unreachable / Math.max(1, hybridSlots),
    )}) — arrived from ranks 21-50, invisible here`,
  );
  console.log(
    `  observed hybrid      success@5 ${pct(observed.successAt5)}  recall@20 ${pct(
      observed.recallAt20,
    )}  MRR ${observed.mrr.toFixed(3)}`,
  );
  console.log(
    `  reconstructed EQUAL  success@5 ${pct(reconstructed.successAt5)}  recall@20 ${pct(
      reconstructed.recallAt20,
    )}  MRR ${reconstructed.mrr.toFixed(3)}`,
  );
  console.log('');

  /**
   * OBSERVED ARMS — the strongest evidence in this file, and the only block
   * that involves no reconstruction at all.
   *
   * Everything else recomputes fusion from truncated lists. This compares the
   * hybrid the run ACTUALLY recorded against the dense arm the same run
   * recorded, query by query, both at their full stored depth. If production
   * fusion damages recall, it is visible here without a model of fusion.
   */
  const obsDense = withHybrid.map((q) => goldRank(q.ranked.dense ?? [], q.gold));
  const obsHybrid = withHybrid.map((q) => goldRank(q.ranked.hybrid ?? [], q.gold));
  const paired = (k: number): { gained: number; lost: number; p: number | null } => {
    let gained = 0;
    let lost = 0;
    for (let i = 0; i < obsDense.length; i += 1) {
      const d = obsDense[i];
      const h = obsHybrid[i];
      const dHit = d !== null && d !== undefined && d <= k;
      const hHit = h !== null && h !== undefined && h <= k;
      if (hHit && !dHit) gained += 1;
      if (dHit && !hHit) lost += 1;
    }
    return { gained, lost, p: mcnemarExactP(gained, lost) };
  };
  const obsS5 = paired(5);
  const obsR20 = paired(20);
  console.log('OBSERVED ARMS — recorded hybrid vs recorded dense, paired, NO reconstruction');
  console.log(
    `  success@5   hybrid gains ${obsS5.gained}, loses ${obsS5.lost}  McNemar exact p ${
      obsS5.p === null ? 'n/a' : obsS5.p.toFixed(4)
    }`,
  );
  console.log(
    `  recall@20   hybrid gains ${obsR20.gained}, loses ${obsR20.lost}  McNemar exact p ${
      obsR20.p === null ? 'n/a' : obsR20.p.toFixed(4)
    }`,
  );
  /**
   * "Not significant" and "no effect" are different findings and only one of
   * them means stop. `stats.ts` exists for exactly this, and the number it
   * returns is what NEW3's gold-set expansion should be sized against.
   */
  /**
   * The same paired test WITHIN each query group. This is what decides between
   * a single weight and a router: a uniform effect wants one weight, an effect
   * that lives in one group and not the other is what routing is FOR. Reported
   * with its own n because a group of 83 settles far less than a set of 283.
   */
  const groupsObs = [...new Set(withHybrid.map((q) => q.group))].sort();
  const perGroup = groupsObs.map((g) => {
    const idx = withHybrid.map((q, i) => (q.group === g ? i : -1)).filter((i) => i >= 0);
    const at = (k: number): { gained: number; lost: number; p: number | null } => {
      let gained = 0;
      let lost = 0;
      for (const i of idx) {
        const d = obsDense[i];
        const h = obsHybrid[i];
        const dHit = d !== null && d !== undefined && d <= k;
        const hHit = h !== null && h !== undefined && h <= k;
        if (hHit && !dHit) gained += 1;
        if (dHit && !hHit) lost += 1;
      }
      return { gained, lost, p: mcnemarExactP(gained, lost) };
    };
    return { group: g, n: idx.length, successAt5: at(5), recallAt20: at(20) };
  });
  for (const g of perGroup) {
    console.log(
      `  ${g.group.padEnd(9)} n=${String(g.n).padStart(3)}  success@5 +${g.successAt5.gained}/-${
        g.successAt5.lost
      } p ${g.successAt5.p === null ? 'n/a' : g.successAt5.p.toFixed(4)}   recall@20 +${
        g.recallAt20.gained
      }/-${g.recallAt20.lost} p ${g.recallAt20.p === null ? 'n/a' : g.recallAt20.p.toFixed(4)}`,
    );
  }
  const settleS5 = queriesToSettle(obsS5.gained, obsS5.lost, withHybrid.length);
  const settleR20 = queriesToSettle(obsR20.gained, obsR20.lost, withHybrid.length);
  console.log(
    `  queries needed to settle at 80% power   success@5 ${settleS5 ?? 'n/a'}   recall@20 ${
      settleR20 ?? 'n/a'
    }   (have ${withHybrid.length})`,
  );
  console.log('');

  const denseRanks = complete.map((q) => goldRank(q.ranked.dense ?? [], q.gold));
  const results = CONFIGS.map((c) => {
    const fused = complete.map((q) => fuse(q, c.wSparse, c.wDense, RRF_K));
    const ranks = fused.map((r, i) => goldRank(r, complete[i]?.gold ?? []));
    const overall = score(ranks);

    let preserved = 0;
    let destroyed = 0;
    let created = 0;
    for (let i = 0; i < ranks.length; i += 1) {
      const d = denseRanks[i];
      const f = ranks[i];
      const dHit = d !== null && d !== undefined && d <= 5;
      const fHit = f !== null && f !== undefined && f <= 5;
      if (dHit && fHit) preserved += 1;
      else if (dHit && !fHit) destroyed += 1;
      else if (!dHit && fHit) created += 1;
    }

    let recallCreated = 0;
    let recallDestroyed = 0;
    for (let i = 0; i < ranks.length; i += 1) {
      const d = denseRanks[i];
      const f = ranks[i];
      const dHit = d !== null && d !== undefined;
      const fHit = f !== null && f !== undefined;
      if (!dHit && fHit) recallCreated += 1;
      if (dHit && !fHit) recallDestroyed += 1;
    }

    const byGroup: Record<string, Metrics> = {};
    for (const g of [...new Set(complete.map((q) => q.group))]) {
      byGroup[g] = score(ranks.filter((_, i) => complete[i]?.group === g));
    }

    return {
      config: c,
      overall,
      byGroup,
      transitions: {
        successAt5: {
          preserved,
          destroyed,
          created,
          mcnemarExactP: mcnemarExactP(created, destroyed),
        },
        recallAt20: {
          created: recallCreated,
          destroyed: recallDestroyed,
          mcnemarExactP: mcnemarExactP(recallCreated, recallDestroyed),
        },
      },
      ranks,
    };
  });

  console.log('SWEEP — every configuration over the same query set, k=60');
  console.log(
    'config'.padEnd(20) +
      'succ@5'.padStart(8) +
      'rec@20'.padStart(8) +
      'MRR'.padStart(7) +
      'nDCG@5'.padStart(8) +
      'nDCG@20'.padStart(9) +
      'kept'.padStart(6) +
      'lost'.padStart(6) +
      'new'.padStart(5) +
      '   McNemar p',
  );
  for (const r of results) {
    const t = r.transitions.successAt5;
    console.log(
      r.config.name.padEnd(20) +
        pct(r.overall.successAt5).padStart(8) +
        pct(r.overall.recallAt20).padStart(8) +
        r.overall.mrr.toFixed(3).padStart(7) +
        r.overall.ndcgAt5.toFixed(3).padStart(8) +
        r.overall.ndcgAt20.toFixed(3).padStart(9) +
        String(t.preserved).padStart(6) +
        String(t.destroyed).padStart(6) +
        String(t.created).padStart(5) +
        '   ' +
        (t.mcnemarExactP === null ? 'n/a' : t.mcnemarExactP.toFixed(3)),
    );
  }
  console.log('');
  console.log('  kept/lost/new are success@5 transitions against DENSE_ONLY on the SAME query.');
  console.log(
    '  "lost" is a dense win destroyed by fusion. "new" is a query only fusion gets right.',
  );
  console.log('');

  const groups = [...new Set(complete.map((q) => q.group))].sort();
  console.log(
    `STRATIFIED by query group — ${groups
      .map((g) => `${g} n=${complete.filter((q) => q.group === g).length}`)
      .join(', ')}`,
  );
  console.log(
    'config'.padEnd(20) +
      groups.map((g) => `${g} succ@5`.padStart(18)).join('') +
      groups.map((g) => `${g} rec@20`.padStart(18)).join(''),
  );
  for (const r of results) {
    console.log(
      r.config.name.padEnd(20) +
        groups.map((g) => pct(r.byGroup[g]?.successAt5 ?? 0).padStart(18)).join('') +
        groups.map((g) => pct(r.byGroup[g]?.recallAt20 ?? 0).padStart(18)).join(''),
    );
  }
  console.log('');

  const denseOnly = results.find((r) => r.config.name === 'DENSE_ONLY');
  const equal = results.find((r) => r.config.name === 'EQUAL (production)');
  const oracleRanks = complete.map((_, i) => {
    const d = denseOnly?.ranks[i] ?? null;
    const e = equal?.ranks[i] ?? null;
    if (d === null) return e;
    if (e === null) return d;
    return Math.min(d, e);
  });
  const oracle = score(oracleRanks);
  console.log(
    'ROUTING CEILING — an ORACLE that picks, per query, whichever of DENSE_ONLY / EQUAL ranks gold higher',
  );
  console.log(
    `  oracle   success@5 ${pct(oracle.successAt5)}  recall@20 ${pct(
      oracle.recallAt20,
    )}  MRR ${oracle.mrr.toFixed(3)}`,
  );
  console.log(
    '  This is an UPPER BOUND no router can beat, not a proposal. It needs a signal we do not have at query time.',
  );
  console.log('');

  const best = results
    .filter((r) => r.config.wDense === 1 && r.config.wSparse > 0 && r.config.wSparse < 1)
    .sort(
      (a, b) => b.overall.successAt5 - a.overall.successAt5 || b.overall.mrr - a.overall.mrr,
    )[0];
  const kSensitivity: { k: number; denseOnly: Metrics; best: Metrics; equal: Metrics }[] = [];
  for (const k of [10, 20, 60, 120, 300]) {
    const m = (c: Config): Metrics =>
      score(complete.map((q) => goldRank(fuse(q, c.wSparse, c.wDense, k), q.gold)));
    kSensitivity.push({
      k,
      denseOnly: m({ name: 'd', wSparse: 0, wDense: 1 }),
      best: best ? m(best.config) : m({ name: 'd', wSparse: 0, wDense: 1 }),
      equal: m({ name: 'e', wSparse: 1, wDense: 1 }),
    });
  }
  console.log(
    `K-SENSITIVITY — does the ordering survive a different RRF constant? (best weighted = ${
      best?.config.name ?? 'n/a'
    })`,
  );
  console.log(
    'k'.padStart(5) +
      'DENSE_ONLY'.padStart(14) +
      'best-weighted'.padStart(16) +
      'EQUAL'.padStart(12) +
      '   (success@5)',
  );
  for (const row of kSensitivity) {
    console.log(
      String(row.k).padStart(5) +
        pct(row.denseOnly.successAt5).padStart(14) +
        pct(row.best.successAt5).padStart(16) +
        pct(row.equal.successAt5).padStart(12),
    );
  }
  console.log('');

  if (OUT) {
    writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          document: 'NEW1 offline fusion weight sweep',
          owner: 'NEW1',
          writtenAt: new Date().toISOString(),
          method: 'weighted RRF recomputed from arms-checkpoint.jsonl ranks. No database run.',
          checkpoint: CHECKPOINT,
          pass: PASS,
          rrfK: RRF_K,
          depth: DEPTH,
          limit:
            'the checkpoint stores 20 ranks per arm; production fuses 50. Every figure here is fusion RESTRICTED TO DEPTH 20 — see fidelity.',
          queries: complete.length,
          fidelity: {
            queriesWithHybrid: withHybrid.length,
            meanTop20Overlap: meanOverlap,
            identicalTop5: top5ExactSame,
            hybridSlotsInNeitherStoredArm: unreachable,
            hybridSlots,
            observedHybrid: observed,
            reconstructedEqual: reconstructed,
          },
          configs: results.map((r) => ({
            name: r.config.name,
            wSparse: r.config.wSparse,
            wDense: r.config.wDense,
            overall: r.overall,
            byGroup: r.byGroup,
            transitions: r.transitions,
          })),
          observedArms: {
            note: 'recorded hybrid vs recorded dense, paired, no reconstruction. The strongest evidence here.',
            successAt5: { ...obsS5, queriesToSettle: settleS5 },
            recallAt20: { ...obsR20, queriesToSettle: settleR20 },
            byGroup: perGroup,
          },
          routingCeiling: oracle,
          kSensitivity,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`written ${OUT}`);
  }
}

await main();
