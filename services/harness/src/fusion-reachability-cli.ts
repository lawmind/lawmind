/**
 * `pnpm fusion:reach` — does the COVERAGE-GATED form of the routing policy
 * actually fire on the damage it was designed to undo?
 *
 * `NEW1_FUSION_WEIGHT_SWEEP.md` recommends:
 *
 *     wSparse(query, document) = 0.15  if group(query) is criminal
 *                                       AND document is embedded
 *                                1.0   otherwise
 *
 * The reachability term is there for a real reason — an unembedded document has
 * no dense score at all, so down-weighting sparse over it would push 99%+ of the
 * corpus below every embedded candidate on every query. Keeping `w = 1` for
 * unembedded documents preserves that reachability.
 *
 * But it has a consequence nobody measured, and it points the other way:
 *
 * > **If the documents that DISPLACED gold are themselves unembedded, the gate
 * > exempts exactly the documents causing the harm, and the policy fixes
 * > nothing in production while measuring as a fix on this benchmark.**
 *
 * The benchmark cannot answer that from ranks alone. Embedded-ness is a fact
 * about `judgment_chunks`, not about the checkpoint. So this tool takes every
 * candidate id the frozen run returned, asks the database which of them carry a
 * chunk, and then re-runs the fusion three ways:
 *
 *   ROUTED_UNGATED    criminal → wSparse = θ for every document
 *   ROUTED_GATED      criminal → wSparse = θ only for EMBEDDED documents
 *                                (the shipped recommendation's exact shape)
 *   CURRENT_EQUAL     production today
 *
 * If GATED ≈ UNGATED on this set, the gate is free and the recommendation
 * stands. If GATED ≈ EQUAL, the gate has neutralised the fix and the
 * recommendation must not ship in that shape.
 *
 * Read-only. One `SELECT` over `judgment_chunks` restricted to the candidate ids
 * the checkpoint already names — bounded by `283 × 3 arms × 20 ranks`, not by
 * the corpus.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { sslFor } from './db-url.ts';
import { mcnemarExactP } from './stats.ts';
import { meanNdcgAtK } from './metrics.ts';

const require = createRequire(import.meta.url);

type Arm = 'sparse' | 'dense' | 'hybrid';

type Query = {
  readonly id: string;
  readonly group: string;
  readonly gold: readonly string[];
  readonly ranked: Partial<Record<Arm, readonly string[]>>;
};

const CHECKPOINT =
  process.env['ARMS_CHECKPOINT'] ??
  fileURLToPath(new URL('../../../arms-checkpoint.jsonl', import.meta.url));
const PASS = (process.env['ARMS_PASS'] ?? 'CONTROLLED').toUpperCase();
const OUT = process.env['FUSION_REACH_JSON'] ?? null;
const RRF_K = Number(process.env['RRF_K'] ?? 60);
const DEPTH = 20;
const THETA = Number(process.env['ROUTED_THETA'] ?? 0.15);

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
    { group: string; ranked: Partial<Record<Arm, readonly string[]>> }
  >();
  const rl = createInterface({ input: createReadStream(CHECKPOINT), crlfDelay: Infinity });
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    let line: { pass: string; mode: Arm; row: { id: string; group: string; rankedIds?: string[] } };
    try {
      line = JSON.parse(raw) as typeof line;
    } catch {
      continue;
    }
    if (line.pass.toUpperCase() !== PASS || !line.row.rankedIds) continue;
    const e = byQuery.get(line.row.id) ?? { group: line.row.group, ranked: {} };
    e.ranked[line.mode] = line.row.rankedIds;
    byQuery.set(line.row.id, e);
  }
  const out: Query[] = [];
  for (const [id, e] of byQuery) {
    const g = gold.get(id);
    if (!g) continue;
    out.push({ id, group: e.group, gold: g.goldJudgmentIds, ranked: e.ranked });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** Weighted RRF where the sparse weight may differ PER DOCUMENT. */
function fuse(q: Query, wSparseFor: (docId: string) => number, k: number): string[] {
  const scores = new Map<string, number>();
  (q.ranked.sparse ?? []).forEach((id, i) => {
    const w = wSparseFor(id);
    if (w !== 0) scores.set(id, (scores.get(id) ?? 0) + w / (k + (i + 1)));
  });
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

function score(ranks: readonly (number | null)[]): {
  n: number;
  successAt5: number;
  recallAt20: number;
  mrr: number;
  ndcgAt5: number;
  ndcgAt20: number;
} {
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

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  const queries = await load();
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error(
      'CORPUS_DATABASE_URL / DATABASE_URL is not set — cannot ask which candidates are embedded.',
    );
    process.exit(1);
  }

  const candidates = new Set<string>();
  for (const q of queries) {
    for (const arm of ['sparse', 'dense', 'hybrid'] as const)
      for (const id of q.ranked[arm] ?? []) candidates.add(id);
    for (const g of q.gold) candidates.add(g);
  }
  const ids = [...candidates];
  console.log('FUSION REACHABILITY — is the coverage gate exempting the displacers?');
  console.log('='.repeat(78));
  console.log(
    `pass ${PASS}   queries ${queries.length}   distinct candidates ${ids.length}   θ ${THETA}`,
  );

  const sql = postgres(url, { ssl: sslFor(url), max: 2, connection: { statement_timeout: 0 } });
  let embedded: Set<string>;
  try {
    const rows = await sql<{ judgment_id: string }[]>`
      SELECT DISTINCT judgment_id
      FROM judgment_chunks
      WHERE judgment_id = ANY(${ids}::uuid[])
    `;
    embedded = new Set(rows.map((r) => r.judgment_id));
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    `embedded candidates ${embedded.size} / ${ids.length}  (${pct(embedded.size / ids.length)})`,
  );
  console.log('');

  // per-arm embedded share
  console.log('EMBEDDED SHARE OF WHAT EACH ARM RETURNED');
  console.log('-'.repeat(78));
  for (const arm of ['dense', 'sparse', 'hybrid'] as const) {
    let tot = 0;
    let emb = 0;
    for (const q of queries)
      for (const id of q.ranked[arm] ?? []) {
        tot += 1;
        if (embedded.has(id)) emb += 1;
      }
    console.log(`  ${arm.padEnd(8)} ${emb}/${tot}  ${pct(tot === 0 ? 0 : emb / tot)}`);
  }
  const goldEmbedded = queries.filter((q) => q.gold.some((g) => embedded.has(g))).length;
  console.log(
    `  gold     ${goldEmbedded}/${queries.length}  ${pct(goldEmbedded / queries.length)}`,
  );
  console.log('');

  // ── the policies ──
  const denseRanks = queries.map((q) =>
    goldRank(
      fuse(q, () => 0, RRF_K),
      q.gold,
    ),
  );
  const equalRanks = queries.map((q) =>
    goldRank(
      fuse(q, () => 1, RRF_K),
      q.gold,
    ),
  );
  const ungated = queries.map((q) =>
    goldRank(
      fuse(q, () => (q.group === 'criminal' ? THETA : 1), RRF_K),
      q.gold,
    ),
  );
  const gated = queries.map((q) =>
    goldRank(
      fuse(q, (d) => (q.group === 'criminal' && embedded.has(d) ? THETA : 1), RRF_K),
      q.gold,
    ),
  );
  const routedDenseUngated = queries.map((q) =>
    goldRank(
      fuse(q, () => (q.group === 'criminal' ? 0 : 1), RRF_K),
      q.gold,
    ),
  );
  const routedDenseGated = queries.map((q) =>
    goldRank(
      fuse(q, (d) => (q.group === 'criminal' && embedded.has(d) ? 0 : 1), RRF_K),
      q.gold,
    ),
  );

  const named: [string, (number | null)[]][] = [
    ['DENSE_ONLY', denseRanks],
    ['CURRENT_EQUAL_RRF', equalRanks],
    [`ROUTED_UNGATED θ=${THETA}`, ungated],
    [`ROUTED_GATED θ=${THETA} (shipped shape)`, gated],
    ['ROUTED_UNGATED θ=0 (criminal dense-only)', routedDenseUngated],
    ['ROUTED_GATED θ=0', routedDenseGated],
  ];

  const criminal = queries.map((q) => q.group === 'criminal');
  const sub = (r: (number | null)[], want: boolean): (number | null)[] =>
    r.filter((_, i) => criminal[i] === want);

  console.log('POLICY COMPARISON');
  console.log('-'.repeat(78));
  console.log(
    'policy'.padEnd(42) +
      'succ@5'.padStart(8) +
      'rec@20'.padStart(8) +
      'MRR'.padStart(7) +
      'crim@5'.padStart(8) +
      'civ@5'.padStart(8),
  );
  const rowsOut: Record<string, unknown>[] = [];
  for (const [name, r] of named) {
    const m = score(r);
    const c = score(sub(r, true));
    const v = score(sub(r, false));
    console.log(
      name.slice(0, 41).padEnd(42) +
        pct(m.successAt5).padStart(8) +
        pct(m.recallAt20).padStart(8) +
        m.mrr.toFixed(3).padStart(7) +
        pct(c.successAt5).padStart(8) +
        pct(v.successAt5).padStart(8),
    );
    let gained = 0;
    let lost = 0;
    for (let i = 0; i < r.length; i += 1) {
      const a = r[i];
      const b = equalRanks[i];
      const aHit = a !== null && a !== undefined && a <= 5;
      const bHit = b !== null && b !== undefined && b <= 5;
      if (aHit && !bHit) gained += 1;
      if (!aHit && bHit) lost += 1;
    }
    rowsOut.push({
      policy: name,
      all: m,
      criminal: c,
      civil: v,
      vsEqual: { gained, lost, mcnemarP: mcnemarExactP(gained, lost) },
    });
  }
  console.log('');

  // ── the displacer audit ──
  console.log('DISPLACER AUDIT — criminal queries EQUAL damaged, by displacer embedded-ness');
  console.log('-'.repeat(78));
  let damaged = 0;
  let displacersTotal = 0;
  let displacersEmbedded = 0;
  let displacersSparseOnly = 0;
  let displacersSparseOnlyEmbedded = 0;
  const perQuery: Record<string, unknown>[] = [];
  for (let i = 0; i < queries.length; i += 1) {
    const q = queries[i] as Query;
    if (q.group !== 'criminal') continue;
    const d = denseRanks[i];
    const e = equalRanks[i];
    const dHit = d !== null && d !== undefined && d <= 5;
    const eHit = e !== null && e !== undefined && e <= 5;
    if (!dHit || eHit) continue;
    damaged += 1;
    const fusedList = fuse(q, () => 1, RRF_K);
    const goldPos = fusedList.findIndex((id) => q.gold.includes(id));
    const above = goldPos === -1 ? fusedList.slice(0, 5) : fusedList.slice(0, goldPos);
    const denseSet = new Set(q.ranked.dense ?? []);
    let qEmb = 0;
    let qSparseOnly = 0;
    for (const id of above) {
      displacersTotal += 1;
      const isEmb = embedded.has(id);
      if (isEmb) {
        displacersEmbedded += 1;
        qEmb += 1;
      }
      if (!denseSet.has(id)) {
        displacersSparseOnly += 1;
        qSparseOnly += 1;
        if (isEmb) displacersSparseOnlyEmbedded += 1;
      }
    }
    perQuery.push({
      queryId: q.id,
      denseGoldRank: d,
      equalGoldRank: e,
      displacers: above.length,
      displacersEmbedded: qEmb,
      displacersSparseOnly: qSparseOnly,
    });
  }
  console.log(`  criminal queries EQUAL destroyed: ${damaged}`);
  console.log(`  documents displacing gold in those queries: ${displacersTotal}`);
  console.log(
    `    embedded: ${displacersEmbedded}  (${pct(displacersTotal === 0 ? 0 : displacersEmbedded / displacersTotal)})  ← the gate DOWN-WEIGHTS these`,
  );
  console.log(
    `    unembedded: ${displacersTotal - displacersEmbedded}  (${pct(displacersTotal === 0 ? 0 : 1 - displacersEmbedded / displacersTotal)})  ← the gate EXEMPTS these`,
  );
  console.log(
    `  of which sparse-only (absent from the dense list): ${displacersSparseOnly}, embedded ${displacersSparseOnlyEmbedded}`,
  );
  console.log('');
  console.log(
    '  A high embedded share means the gate and the fix agree and the recommendation is safe',
  );
  console.log(
    '  to ship in its stated shape. A high UNEMBEDDED share means the gate exempts the very',
  );
  console.log('  documents doing the damage, and the policy is a no-op where it matters.');
  console.log('');

  const artifact = {
    tool: 'services/harness/src/fusion-reachability-cli.ts',
    generatedAt: new Date().toISOString(),
    pass: PASS,
    queries: queries.length,
    theta: THETA,
    rrfK: RRF_K,
    distinctCandidates: ids.length,
    embeddedCandidates: embedded.size,
    goldEmbeddedQueries: goldEmbedded,
    policies: rowsOut,
    displacerAudit: {
      criminalQueriesDamagedByEqual: damaged,
      displacersTotal,
      displacersEmbedded,
      displacersSparseOnly,
      displacersSparseOnlyEmbedded,
      perQuery,
    },
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
