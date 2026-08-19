/**
 * `pnpm fusion:routable` — can the router SEE the dimension it routes on?
 *
 * `QUERY_ROUTED_HYBRID` routes on `group ∈ {criminal, civil}`. In the benchmark
 * that label is exact — but it is not a property of the query. `build-queries.ts`
 * takes it from `ci.case_type` of the CITING judgment the passage was cut from
 * (`fetchCandidates`, `AND ci.case_type::text = ${caseType}`). It is a fact about
 * a document in the corpus, attached to a query built from that document.
 *
 * **Production has no such label at query time.** `services/api/src/search/route.ts`
 * accepts `filters.caseType` as an OPTIONAL user-supplied filter; nothing derives
 * a case type from the query text. So a policy that routes on `group` is, today,
 * a policy that routes on something the server does not know.
 *
 * That makes the shippable question different from the one the sweep answered:
 *
 *   sweep asked      does routing help, GIVEN a perfect label?      → yes, +1.8 pts
 *   this asks        can the label be produced from the query?      → measured below
 *   and then         does routing still help on PREDICTED labels?   → measured below
 *
 * The second number is the one that ships, because a router with a 70%-accurate
 * classifier is applying the criminal treatment to civil queries 30% of the time
 * and the benchmark's oracle-labelled result says nothing about that.
 *
 * ── THE CLASSIFIER ──────────────────────────────────────────────────────────
 *
 * Deliberately a transparent lexicon rule, not a model:
 *
 *  · it must be auditable — a fusion policy that changes rankings on an
 *    unexplainable signal is not something the citation harness can reason about;
 *  · it costs nothing at query time, which matters on a route already at p50 43s;
 *  · and if a trivial rule already recovers the label, the expensive option was
 *    never needed. If it does NOT, that is the finding, and it is reported as a
 *    refusal rather than papered over with a better model nobody has measured.
 *
 * Statute names come from `DOMAIN_TRUTH.md` §BNS/BNSS/BSA — both the pre-July-2024
 * codes and their successors, because the corpus spans the transition and a
 * lexicon holding only one side would mis-classify by DATE rather than by SUBJECT.
 *
 * Offline. Ranks and text only. No database, no embedder, no network.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { meanNdcgAtK } from './metrics.ts';
import { mcnemarExactP } from './stats.ts';

const require = createRequire(import.meta.url);

type Arm = 'sparse' | 'dense' | 'hybrid';

type Query = {
  readonly id: string;
  readonly group: string;
  readonly text: string;
  readonly gold: readonly string[];
  readonly ranked: Partial<Record<Arm, readonly string[]>>;
};

const CHECKPOINT =
  process.env['ARMS_CHECKPOINT'] ??
  fileURLToPath(new URL('../../../arms-checkpoint.jsonl', import.meta.url));
const PASS = (process.env['ARMS_PASS'] ?? 'CONTROLLED').toUpperCase();
const OUT = process.env['FUSION_ROUTABLE_JSON'] ?? null;
const RRF_K = Number(process.env['RRF_K'] ?? 60);
const DEPTH = 20;
const REPEATS = Number(process.env['POLICY_REPEATS'] ?? 2000);
const SEED = Number(process.env['POLICY_SEED'] ?? 20260819);

/**
 * Criminal-law markers. Both codes on purpose: BNS/BNSS/BSA from 1 July 2024,
 * IPC/CrPC/Evidence Act before it, and the special statutes that are criminal
 * whichever code was in force. Matched case-insensitively on word boundaries.
 */
const CRIMINAL_MARKERS: readonly string[] = [
  // codes, both sides of the July 2024 transition
  'bharatiya nyaya sanhita',
  'bharatiya nagarik suraksha sanhita',
  'bharatiya sakshya adhiniyam',
  '\\bbns\\b',
  '\\bbnss\\b',
  '\\bbsa\\b',
  'indian penal code',
  '\\bipc\\b',
  'code of criminal procedure',
  '\\bcr\\.?p\\.?c\\b',
  // special criminal statutes
  '\\bpocso\\b',
  '\\bndps\\b',
  '\\buapa\\b',
  'prevention of corruption act',
  'negotiable instruments act',
  'protection of children from sexual offences',
  'narcotic drugs',
  // procedural and substantive criminal vocabulary
  '\\bbail\\b',
  'anticipatory bail',
  '\\bacquitt',
  '\\bconvict',
  '\\baccused\\b',
  '\\bprosecut',
  'charge ?sheet',
  '\\bfir\\b',
  'first information report',
  '\\bmurder\\b',
  'culpable homicide',
  'rarest of rare',
  'death sentence',
  'capital punishment',
  'life imprisonment',
  'criminal appeal',
  'criminal revision',
  'sessions judge',
  'beyond reasonable doubt',
  'investigating officer',
  '\\bremand\\b',
  '\\bcustody\\b',
];

const MARKER_RE = CRIMINAL_MARKERS.map((m) => new RegExp(m, 'i'));

/** How many distinct criminal markers a query must hit to be routed criminal. */
const THRESHOLD = Number(process.env['ROUTE_THRESHOLD'] ?? 2);

function markerHits(text: string): number {
  let n = 0;
  for (const re of MARKER_RE) if (re.test(text)) n += 1;
  return n;
}

type EvalFixture = {
  readonly queries: readonly {
    readonly id: string;
    readonly group: string;
    readonly goldJudgmentIds: readonly string[];
  }[];
};

async function load(): Promise<Query[]> {
  const fixture = require('./fixtures/queries.eval.json') as EvalFixture;
  const gold = new Map(fixture.queries.map((q) => [q.id, q]));
  const byQuery = new Map<
    string,
    { group: string; text: string; ranked: Partial<Record<Arm, readonly string[]>> }
  >();
  const rl = createInterface({ input: createReadStream(CHECKPOINT), crlfDelay: Infinity });
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    let line: {
      pass: string;
      mode: Arm;
      row: { id: string; group: string; queryText?: string; rankedIds?: string[] };
    };
    try {
      line = JSON.parse(raw) as typeof line;
    } catch {
      continue;
    }
    if (line.pass.toUpperCase() !== PASS || !line.row.rankedIds) continue;
    const e = byQuery.get(line.row.id) ?? {
      group: line.row.group,
      text: line.row.queryText ?? '',
      ranked: {},
    };
    if (!e.text && line.row.queryText) e.text = line.row.queryText;
    e.ranked[line.mode] = line.row.rankedIds;
    byQuery.set(line.row.id, e);
  }
  const out: Query[] = [];
  for (const [id, e] of byQuery) {
    const g = gold.get(id);
    if (!g) continue;
    out.push({ id, group: e.group, text: e.text, gold: g.goldJudgmentIds, ranked: e.ranked });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function fuse(q: Query, wSparse: number, k: number): string[] {
  const scores = new Map<string, number>();
  if (wSparse !== 0)
    (q.ranked.sparse ?? []).forEach((id, i) =>
      scores.set(id, (scores.get(id) ?? 0) + wSparse / (k + (i + 1))),
    );
  (q.ranked.dense ?? []).forEach((id, i) =>
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + (i + 1))),
  );
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

function score(ranks: readonly (number | null)[]): Record<string, number> {
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

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  const queries = await load();
  const withText = queries.filter((q) => q.text.length > 0).length;
  console.log('FUSION ROUTING FEASIBILITY — is the routing dimension observable?');
  console.log('='.repeat(78));
  console.log(
    `pass ${PASS}   queries ${queries.length}   with query text ${withText}   markers ${CRIMINAL_MARKERS.length}   threshold ${THRESHOLD}`,
  );
  console.log('');

  // ── 1 · classifier accuracy against the fixture label ──
  const predicted = queries.map((q) => (markerHits(q.text) >= THRESHOLD ? 'criminal' : 'civil'));
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  queries.forEach((q, i) => {
    const isCrim = q.group === 'criminal';
    const sayCrim = predicted[i] === 'criminal';
    if (isCrim && sayCrim) tp += 1;
    else if (!isCrim && sayCrim) fp += 1;
    else if (!isCrim && !sayCrim) tn += 1;
    else fn += 1;
  });
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  console.log('CLASSIFIER vs THE FIXTURE LABEL (case_type of the CITING judgment)');
  console.log('-'.repeat(78));
  console.log(`  predicted criminal ${tp + fp}   actual criminal ${tp + fn}`);
  console.log(`  TP ${tp}   FP ${fp}   TN ${tn}   FN ${fn}`);
  console.log(
    `  precision ${pct(precision)}   recall ${pct(recall)}   accuracy ${pct((tp + tn) / queries.length)}`,
  );
  console.log('');
  console.log('  A threshold sweep, so the number above is not one arbitrary cut:');
  const sweep: Record<string, unknown>[] = [];
  for (let t = 1; t <= 6; t += 1) {
    let a = 0;
    let b = 0;
    let c = 0;
    queries.forEach((q) => {
      const say = markerHits(q.text) >= t;
      if (q.group === 'criminal' && say) a += 1;
      else if (q.group !== 'criminal' && say) b += 1;
      else if (q.group === 'criminal' && !say) c += 1;
    });
    const p = a + b === 0 ? 0 : a / (a + b);
    const r = a + c === 0 ? 0 : a / (a + c);
    console.log(
      `    threshold ${t}: routed ${String(a + b).padStart(3)}  precision ${pct(p).padStart(6)}  recall ${pct(r).padStart(6)}`,
    );
    sweep.push({ threshold: t, routed: a + b, precision: p, recall: r });
  }
  console.log('');

  // ── 2 · the policy under oracle vs predicted labels ──
  const equal = queries.map((q) => goldRank(fuse(q, 1, RRF_K), q.gold));
  const dense = queries.map((q) => goldRank(fuse(q, 0, RRF_K), q.gold));
  const oracle = queries.map((q) => goldRank(fuse(q, q.group === 'criminal' ? 0 : 1, RRF_K), q.gold));
  const pred = queries.map((q, i) =>
    goldRank(fuse(q, predicted[i] === 'criminal' ? 0 : 1, RRF_K), q.gold),
  );

  console.log('POLICY UNDER ORACLE vs PREDICTED LABELS (criminal → dense-only)');
  console.log('-'.repeat(78));
  console.log(
    'policy'.padEnd(40) +
      'succ@5'.padStart(8) +
      'rec@20'.padStart(8) +
      'MRR'.padStart(7) +
      'vs EQUAL +/−'.padStart(14) +
      'McNemar p'.padStart(11),
  );
  const rows: [string, (number | null)[]][] = [
    ['CURRENT_EQUAL_RRF', equal],
    ['DENSE_ONLY', dense],
    ['ROUTED (oracle label)', oracle],
    ['ROUTED (lexicon classifier)', pred],
  ];
  const policyOut: Record<string, unknown>[] = [];
  for (const [name, r] of rows) {
    const m = score(r);
    let gained = 0;
    let lost = 0;
    for (let i = 0; i < r.length; i += 1) {
      const a = r[i];
      const b = equal[i];
      const aHit = a !== null && a !== undefined && a <= 5;
      const bHit = b !== null && b !== undefined && b <= 5;
      if (aHit && !bHit) gained += 1;
      if (!aHit && bHit) lost += 1;
    }
    const p = mcnemarExactP(gained, lost);
    console.log(
      name.padEnd(40) +
        pct(m['successAt5'] ?? 0).padStart(8) +
        pct(m['recallAt20'] ?? 0).padStart(8) +
        (m['mrr'] ?? 0).toFixed(3).padStart(7) +
        `+${gained}/−${lost}`.padStart(14) +
        (p === null ? '—' : p.toFixed(4)).padStart(11),
    );
    policyOut.push({ policy: name, ...m, vsEqual: { gained, lost, mcnemarP: p } });
  }
  console.log('');

  // ── 3 · held-out split-half on PREDICTED labels ──
  // The classifier's lexicon is FIXED (not fitted per split), so the only thing
  // the split-half protects against here is the metric being read off the same
  // queries that motivated the policy. Reported for comparability with
  // `fusion-policy-cli.ts`, whose splits use the identical seed and strata.
  const rng = mulberry32(SEED);
  const idxCrim = queries.map((_, i) => i).filter((i) => queries[i]?.group === 'criminal');
  const idxCiv = queries.map((_, i) => i).filter((i) => queries[i]?.group !== 'criminal');
  const diffs: number[] = [];
  const s5 = (r: (number | null)[], idx: number[]): number =>
    idx.length === 0
      ? 0
      : idx.filter((i) => {
          const v = r[i];
          return v !== null && v !== undefined && v <= 5;
        }).length / idx.length;
  for (let rep = 0; rep < REPEATS; rep += 1) {
    const test: number[] = [];
    for (const pool of [idxCrim, idxCiv]) {
      const arr = [...pool];
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const a = arr[i] as number;
        arr[i] = arr[j] as number;
        arr[j] = a;
      }
      test.push(...arr.slice(Math.floor(arr.length / 2)));
    }
    diffs.push(s5(pred, test) - s5(equal, test));
  }
  diffs.sort((a, b) => a - b);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const lo = diffs[Math.floor(diffs.length * 0.025)] ?? 0;
  const hi = diffs[Math.floor(diffs.length * 0.975)] ?? 0;
  console.log('HELD-OUT (same seed and strata as fusion:policy)');
  console.log('-'.repeat(78));
  console.log(
    `  ROUTED(classifier) − CURRENT_EQUAL_RRF on held-out halves: ${(mean * 100 >= 0 ? '+' : '') + (mean * 100).toFixed(2)} pts  95% CI [${(lo * 100).toFixed(2)}, ${(hi * 100).toFixed(2)}]`,
  );
  console.log('');

  const artifact = {
    tool: 'services/harness/src/fusion-routing-feasibility-cli.ts',
    generatedAt: new Date().toISOString(),
    pass: PASS,
    queries: queries.length,
    threshold: THRESHOLD,
    markers: CRIMINAL_MARKERS,
    classifier: { tp, fp, tn, fn, precision, recall, accuracy: (tp + tn) / queries.length },
    thresholdSweep: sweep,
    policies: policyOut,
    heldOut: { meanDeltaVsEqual: mean, ci95: [lo, hi], repeats: REPEATS, seed: SEED },
    limitation:
      'The fixture label is case_type of the CITING judgment, not a property of the query. Production exposes filters.caseType as an OPTIONAL user filter and derives nothing from query text. Both the label and the classifier are therefore proxies for a signal production does not currently compute.',
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
