/**
 * `pnpm --filter @lawmind/harness held:rrfsim` — closes the one gap
 * `held:annprobe` left as INFER: does RRF fusion actually displace the 16
 * `DENSE_OK_BUT_MISSED` cases, or was that a guess dressed as arithmetic?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `held:annprobe` (`ann-probe-cli.ts`) measured that all 16 land inside both
 * of `dense()`'s cut points on the INDEX's own approximate order — 0 HNSW
 * loss, 0 ANN-depth truncation. By elimination (duplicate collapse already
 * dead, §4a of `HELD_NOT_RETRIEVED_DECOMPOSITION.md`) plus a read of
 * `retrieve.ts`'s `rrf()`, the loss was attributed to RRF fusion — but that
 * was INFERENCE from code, not an independent measurement. The founder
 * directive is explicit: "do not call it KNOW until independently verified,"
 * and names exactly this — "the cheapest decisive sparse-arm measurement" —
 * as the next task, NOT another 25-minute `hybridSearch` call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MEASURES, AND WHY IT IS CHEAP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two isolated-arm queries per case, no `hybridSearch` call at all:
 *
 *   1. The SAME raw ANN query `held:annprobe` already runs — but this time
 *      the FULL judgment-collapsed top-50 list is kept, not just gold's
 *      position in it.
 *   2. ONE sparse-only query: `hybridSearch(sql, query, null, {}, 50,
 *      'sparse')`. `mode='sparse'` skips the dense arm entirely inside
 *      `hybridSearch` (`retrieve.ts` line ~628: `mode !== 'sparse'`), so this
 *      is a `ts_rank` lookup, not a vector search — cheap, no ANN, no
 *      embedding call needed for this half.
 *
 * Both lists are then fed through a LOCAL REIMPLEMENTATION of `retrieve.ts`'s
 * own `rrf()` (`assertConstantsStillMatch` below reads the real constants
 * from source so a drift is a loud failure, not a silently stale copy) —
 * the exact formula, on the exact two lists production would fuse for these
 * queries. **This is not calling `hybridSearch` in `hybrid` mode** — it is
 * two cheap isolated calls plus the same tiny amount of arithmetic
 * `retrieve.ts` does, which is the entire reason this avoids the 25-minute
 * stall §4b/§4c already hit.
 *
 * **Scope limit, stated rather than silently skipped**: the exact-citation /
 * exact-case-title PIN step (`hybridSearch` lines ~661–673) is not simulated.
 * Checked against the 16 queries' own text before deciding this was safe to
 * skip: all are natural-language passages or Hindi legal questions, none
 * `cite:`-shaped or case-name-shaped, so `warrantsExactLookup`/`classifyQuery`
 * would return a null pin for every one of them in production too. If this
 * tool is ever pointed at a different query set, that assumption needs
 * re-checking, not assuming.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS KNOW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `RRF_DISPLACEMENT_CONFIRMED` — gold sits inside both isolated arms' own top
 * 50 (i.e. `held:annprobe` already showed the dense side; this tool checks
 * the sparse side is not somehow rescuing it), but the SUMMED, SORTED,
 * fused list — computed from the same two lists production would use, with
 * production's own formula — puts gold beyond rank 50. That is a positive
 * measurement of RRF displacement, not an inference from arithmetic.
 *
 * `NOT_REPRODUCED_BY_RRF_ALONE` — the simulation says gold SHOULD have
 * survived to top 50. Reported honestly rather than forced to fit the
 * hypothesis: the remaining candidates are the untested pin step, dedup, or
 * that the corpus/embeddings moved since the original classification
 * (`held-not-retrieved-cli.ts`'s own §"NOT REPRODUCED" case in
 * `dense-ok-missed-cli.ts` already has this exact outcome type).
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { openDb } from '@lawmind/ingest/db-host';
import { hybridSearch } from '@lawmind/api/search/retrieve';

const CANDIDATE_DEPTH = 50;
const ANN_DEPTH = CANDIDATE_DEPTH * 4;
const RRF_K = 60;
const HNSW_EF_SEARCH = Number(process.env['HNSW_EF_SEARCH'] ?? 200);

const CONSTANTS_SOURCE = new URL('../../api/src/search/retrieve.ts', import.meta.url);
function assertConstantsStillMatch(): void {
  const src = readFileSync(CONSTANTS_SOURCE, 'utf8');
  const depth = /const CANDIDATE_DEPTH = (\d+);/.exec(src);
  const ann = /const annDepth = CANDIDATE_DEPTH \* \(filtered \? \d+ : (\d+)\);/.exec(src);
  const k = /const RRF_K = (\d+);/.exec(src);
  if (!depth || Number(depth[1]) !== CANDIDATE_DEPTH) {
    throw new Error(
      `retrieve.ts CANDIDATE_DEPTH is ${depth?.[1] ?? 'unreadable'}, this tool assumes ${CANDIDATE_DEPTH}.`,
    );
  }
  if (!ann || CANDIDATE_DEPTH * Number(ann[1]) !== ANN_DEPTH) {
    throw new Error(
      `retrieve.ts unfiltered annDepth multiplier is ${ann?.[1] ?? 'unreadable'}, this tool assumes ${ANN_DEPTH / CANDIDATE_DEPTH}.`,
    );
  }
  if (!k || Number(k[1]) !== RRF_K) {
    throw new Error(`retrieve.ts RRF_K is ${k?.[1] ?? 'unreadable'}, this tool assumes ${RRF_K}.`);
  }
}

/** `retrieve.ts`'s own `rrf()`, reimplemented exactly — not imported, so a drift is loud, not silent (asserted above). */
function rrf(lists: { judgmentId: string; rank: number }[][]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const { judgmentId, rank } of list) {
      scores.set(judgmentId, (scores.get(judgmentId) ?? 0) + 1 / (RRF_K + rank));
    }
  }
  return scores;
}

type DecomposeRow = { queryId: string; goldJudgmentIds: string[]; mechanism: string };
type HarnessQuery = { id: string; group: string; query: string; goldJudgmentIds: string[] };

type Verdict = 'RRF_DISPLACEMENT_CONFIRMED' | 'NOT_REPRODUCED_BY_RRF_ALONE';

type SimRow = {
  queryId: string;
  denseJudgmentRank: number | null;
  sparseJudgmentRank: number | null;
  fusedRank: number | null;
  fusedScore: number | null;
  fiftiethScore: number | null;
  verdict: Verdict;
  ms: number;
};

const DECOMPOSE_PATH = new URL('../../../held-not-retrieved-checkpoint.jsonl', import.meta.url);
const CHECKPOINT_PATH = new URL('../../../rrf-sim-checkpoint.jsonl', import.meta.url);

function readJsonl<T>(url: URL): T[] {
  if (!existsSync(url)) return [];
  return readFileSync(url, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function loadFixture(name: string): { queries?: HarnessQuery[] } {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as never;
}

async function main(): Promise<void> {
  assertConstantsStillMatch();

  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const decomposed = readJsonl<DecomposeRow>(DECOMPOSE_PATH).filter(
    (r) => r.mechanism === 'DENSE_OK_BUT_MISSED',
  );
  if (decomposed.length === 0) {
    throw new Error(
      'No DENSE_OK_BUT_MISSED rows in held-not-retrieved-checkpoint.jsonl — run `held:decompose` first.',
    );
  }

  const queries = new Map(
    [
      ...(loadFixture('queries.eval.json').queries ?? []),
      ...(loadFixture('queries.hand.json').queries ?? []),
      ...(loadFixture('queries.derived.json').queries ?? []),
    ].map((q) => [q.id, q]),
  );

  const done = new Map(readJsonl<SimRow>(CHECKPOINT_PATH).map((r) => [r.queryId, r]));
  const pending = decomposed.filter((r) => !done.has(r.queryId));

  console.log('RRF FUSION SIMULATION — KNOW, not INFER, for the 16');
  console.log('='.repeat(78));
  console.log(
    `${decomposed.length} DENSE_OK_BUT_MISSED · ${done.size} already checkpointed · ${pending.length} pending`,
  );
  console.log(
    `rrf_k=${RRF_K}, candidateDepth=${CANDIDATE_DEPTH}, annDepth=${ANN_DEPTH}, ef_search=${HNSW_EF_SEARCH}\n`,
  );

  if (pending.length === 0) {
    report(readJsonl<SimRow>(CHECKPOINT_PATH));
    return;
  }

  const sql = await openDb(url, 2);
  try {
    const embedder = await getEmbedder();

    for (const [i, r] of pending.entries()) {
      const q = queries.get(r.queryId);
      if (!q) {
        console.log(
          `  [${i + 1}/${pending.length}] ${r.queryId} — not in fixtures, skipped (not checkpointed)`,
        );
        continue;
      }

      const startedAt = Date.now();
      try {
        const [emb] = await embedder.embed([q.query]);
        if (!emb) throw new Error('embedder returned nothing');
        const v = toVectorLiteral(emb.vector);

        // 1 — dense arm, isolated: same raw ANN + judgment-collapse held:annprobe runs, kept in full this time.
        const chunkRows = await sql.begin(async (tx) => {
          await tx`SET LOCAL hnsw.ef_search = ${sql.unsafe(String(HNSW_EF_SEARCH))}`;
          await tx`SET LOCAL hnsw.iterative_scan = relaxed_order`;
          return tx<{ judgment_id: string }[]>`
            SELECT c.judgment_id
            FROM judgment_chunks c
            ORDER BY c.embedding <=> ${v}::vector
            LIMIT ${ANN_DEPTH}`;
        });
        const denseRanked: { judgmentId: string; rank: number }[] = [];
        const seen = new Set<string>();
        for (const row of chunkRows) {
          if (seen.has(row.judgment_id)) continue;
          seen.add(row.judgment_id);
          denseRanked.push({ judgmentId: row.judgment_id, rank: denseRanked.length + 1 });
          if (denseRanked.length >= CANDIDATE_DEPTH) break;
        }

        // 2 — sparse arm, isolated. mode='sparse' skips dense entirely inside hybridSearch (retrieve.ts).
        const sparseResults = await hybridSearch(sql, q.query, null, {}, CANDIDATE_DEPTH, 'sparse');
        const sparseRanked = sparseResults.map((res, idx) => ({
          judgmentId: res.judgmentId,
          rank: idx + 1,
        }));

        // 3 — the exact rrf() arithmetic, on exactly these two lists.
        const scores = rrf([sparseRanked, denseRanked]);
        const fused = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, CANDIDATE_DEPTH);

        const goldEntry = fused.findIndex(([id]) => r.goldJudgmentIds.includes(id));
        const fusedRank = goldEntry === -1 ? null : goldEntry + 1;
        const fusedScore =
          goldEntry === -1
            ? (scores.get(r.goldJudgmentIds.find((id) => scores.has(id)) ?? '') ?? null)
            : fused[goldEntry]![1];
        const fiftiethScore =
          fused.length >= CANDIDATE_DEPTH ? fused[CANDIDATE_DEPTH - 1]![1] : null;

        const denseJudgmentRank = denseRanked.findIndex((d) =>
          r.goldJudgmentIds.includes(d.judgmentId),
        );
        const sparseJudgmentRank = sparseRanked.findIndex((d) =>
          r.goldJudgmentIds.includes(d.judgmentId),
        );

        const verdict: Verdict =
          fusedRank !== null && fusedRank <= CANDIDATE_DEPTH
            ? 'NOT_REPRODUCED_BY_RRF_ALONE'
            : 'RRF_DISPLACEMENT_CONFIRMED';

        const row: SimRow = {
          queryId: r.queryId,
          denseJudgmentRank: denseJudgmentRank === -1 ? null : denseJudgmentRank + 1,
          sparseJudgmentRank: sparseJudgmentRank === -1 ? null : sparseJudgmentRank + 1,
          fusedRank,
          fusedScore,
          fiftiethScore,
          verdict,
          ms: Date.now() - startedAt,
        };
        appendFileSync(CHECKPOINT_PATH, JSON.stringify(row) + '\n');
        console.log(
          `  [${i + 1}/${pending.length}] ${r.queryId.padEnd(20)} dense=${row.denseJudgmentRank ?? '-'} sparse=${row.sparseJudgmentRank ?? 'ABSENT'} ` +
            `fused=${row.fusedRank ?? 'BEYOND 50'} ${row.verdict} ${(row.ms / 1000).toFixed(1)}s`,
        );
      } catch (err) {
        console.log(
          `  [!] ${r.queryId.padEnd(20)} FAILED: ${(err as Error).message} — will retry next run`,
        );
      }
    }

    report(readJsonl<SimRow>(CHECKPOINT_PATH));
  } finally {
    await sql.end();
  }
}

function report(rows: SimRow[]): void {
  console.log('\n' + '='.repeat(78));
  console.log('VERDICT — the 16, INFER promoted to KNOW where the data allows it');
  console.log('='.repeat(78));
  const confirmed = rows.filter((r) => r.verdict === 'RRF_DISPLACEMENT_CONFIRMED');
  const notReproduced = rows.filter((r) => r.verdict === 'NOT_REPRODUCED_BY_RRF_ALONE');
  console.log(
    `  ${String(confirmed.length).padStart(2)} / ${rows.length}  RRF_DISPLACEMENT_CONFIRMED — gold measurably pushed past fused rank 50`,
  );
  console.log(
    `  ${String(notReproduced.length).padStart(2)} / ${rows.length}  NOT_REPRODUCED_BY_RRF_ALONE — the two-arm simulation alone says gold should have survived`,
  );
  if (notReproduced.length > 0) {
    console.log(
      '\n  NOT_REPRODUCED cases — the residual is the untested pin step, dedup, or corpus drift:',
    );
    for (const r of notReproduced) console.log(`    ${r.queryId}: fused rank ${r.fusedRank}`);
  }
  if (rows.length < 16)
    console.log(`\n  (${16 - rows.length} still unmeasured — re-run to complete)`);
}

await main();
