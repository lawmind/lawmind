/**
 * `pnpm --filter @lawmind/harness held:annprobe` — settles the 16
 * `DENSE_OK_BUT_MISSED` cases without running the full pipeline.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY NOT `held:whymissed`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `held:decompose` measured gold's EXACT rank (sequential scan, no HNSW) and
 * found 16 cases inside both cut points (`chunkRank <= 200`, `judgmentRank <=
 * 50`) that the pipeline still lost. `held:whymissed`
 * (`dense-ok-missed-cli.ts`) was built to explain them by re-running
 * `hybridSearch` twice per case (`hybrid` and `dense` modes) — and it did not
 * complete: one call exceeded 25 minutes under this session's live load
 * (NEW2's ingest fleet + the machine reboot at 22:27Z), was checkpointless,
 * and the kill cost the whole partial run.
 *
 * §4a of `docs/ai/HELD_NOT_RETRIEVED_DECOMPOSITION.md` already MEASURED cause
 * 3 (content_hash duplicate collapse) dead — 0 of 16 gold judgments have a
 * byte-identical twin. That leaves exactly two candidates, and both are
 * decidable from a SINGLE raw ANN query per case, with none of
 * `hybridSearch`'s sparse arm, filter joins, or RRF fusion in the way:
 *
 *   1. HNSW APPROXIMATION LOSS — the index itself, at production's exact
 *      settings (`ef_search=200`, `iterative_scan=relaxed_order`), does not
 *      return any of gold's chunks in its top `annDepth=200`, even though
 *      exact sequential scan says a gold chunk sits at rank <= 164.
 *   2. RRF FUSION DISPLACEMENT (by elimination) — the ANN top-200 DOES
 *      contain a gold chunk, collapses to a judgment rank <= 50 on ANN order
 *      alone, and the loss is downstream of the index: `hybridSearch`'s
 *      fusion, dedup, or filter logic.
 *
 * This is exactly the "cheaper decisive measurement" `HELD_NOT_RETRIEVED_
 * DECOMPOSITION.md` §4b named as next session's first task: "one ANN query
 * per case (~19s, no full pipeline)". ~16 queries, checkpointed, one query
 * each — not the 32-call (16 × hybrid + dense) shape that stalled.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT MEASURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - The sparse arm, RRF's actual output, or `hybridSearch`'s filter/dedup
 *   path — those require the full pipeline and are exactly what a JUDGMENT
 *   RANK <= 50 with an ANN HIT here implicates BY ELIMINATION, not what this
 *   tool observes directly. If ANN hits and this tool's judgment-collapse
 *   rank is <= 50 but the real pipeline still lost it, the residual cause is
 *   `hybridSearch` itself and is a separate, smaller follow-up — not
 *   re-litigated here.
 * - No new gold. Reads the existing `held-not-retrieved-checkpoint.jsonl`
 *   rows already classified `DENSE_OK_BUT_MISSED`.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { openDb } from '@lawmind/ingest/db-host';

/** Copies of `retrieve.ts` constants — see `held-not-retrieved-cli.ts` for why a copy, not an import. */
const CANDIDATE_DEPTH = 50;
const ANN_DEPTH = CANDIDATE_DEPTH * 4;
const HNSW_EF_SEARCH = Number(process.env['HNSW_EF_SEARCH'] ?? 200);

const CONSTANTS_SOURCE = new URL('../../api/src/search/retrieve.ts', import.meta.url);
function assertConstantsStillMatch(): void {
  const src = readFileSync(CONSTANTS_SOURCE, 'utf8');
  const depth = /const CANDIDATE_DEPTH = (\d+);/.exec(src);
  const ann = /const annDepth = CANDIDATE_DEPTH \* \(filtered \? \d+ : (\d+)\);/.exec(src);
  if (!depth || Number(depth[1]) !== CANDIDATE_DEPTH) {
    throw new Error(`retrieve.ts CANDIDATE_DEPTH is ${depth?.[1] ?? 'unreadable'}, this tool assumes ${CANDIDATE_DEPTH}.`);
  }
  if (!ann || CANDIDATE_DEPTH * Number(ann[1]) !== ANN_DEPTH) {
    throw new Error(`retrieve.ts unfiltered annDepth multiplier is ${ann?.[1] ?? 'unreadable'}, this tool assumes ${ANN_DEPTH / CANDIDATE_DEPTH}.`);
  }
}

type DecomposeRow = {
  queryId: string;
  group: string;
  goldJudgmentIds: string[];
  chunkRank: number | null;
  judgmentRank: number | null;
  mechanism: string;
};
type HarnessQuery = { id: string; group: string; query: string; goldJudgmentIds: string[] };

type Verdict = 'ANN_HIT_JUDGMENT_IN_POOL' | 'ANN_HIT_JUDGMENT_COLLAPSED_OUT' | 'ANN_MISS_HNSW_LOSS';

type ProbeRow = {
  queryId: string;
  exactChunkRank: number | null;
  exactJudgmentRank: number | null;
  /** Position of gold's best chunk within THIS ANN call's top-200, 1-based; null = absent from the ANN result entirely. */
  annChunkRank: number | null;
  /** Judgment-collapse rank (first-sighting, same rule as `retrieve.ts` `dense()`) within the ANN order, capped at 200 chunks scanned. */
  annJudgmentRank: number | null;
  verdict: Verdict;
  ms: number;
};

const DECOMPOSE_PATH = new URL('../../../held-not-retrieved-checkpoint.jsonl', import.meta.url);
const CHECKPOINT_PATH = new URL('../../../ann-probe-checkpoint.jsonl', import.meta.url);

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

  const decomposed = readJsonl<DecomposeRow>(DECOMPOSE_PATH).filter((r) => r.mechanism === 'DENSE_OK_BUT_MISSED');
  if (decomposed.length === 0) {
    throw new Error('No DENSE_OK_BUT_MISSED rows in held-not-retrieved-checkpoint.jsonl — run `held:decompose` first.');
  }

  const queries = new Map(
    [
      ...(loadFixture('queries.eval.json').queries ?? []),
      ...(loadFixture('queries.hand.json').queries ?? []),
      ...(loadFixture('queries.derived.json').queries ?? []),
    ].map((q) => [q.id, q]),
  );

  const done = new Map(readJsonl<ProbeRow>(CHECKPOINT_PATH).map((r) => [r.queryId, r]));
  const pending = decomposed.filter((r) => !done.has(r.queryId));

  console.log('ANN-ONLY PROBE — the 16 that should have been impossible');
  console.log('='.repeat(78));
  console.log(`${decomposed.length} DENSE_OK_BUT_MISSED · ${done.size} already checkpointed · ${pending.length} pending`);
  console.log(`ann settings: ef_search=${HNSW_EF_SEARCH}, annDepth=${ANN_DEPTH} chunks, candidateDepth=${CANDIDATE_DEPTH} judgments\n`);

  if (pending.length === 0) {
    report(readJsonl<ProbeRow>(CHECKPOINT_PATH));
    return;
  }

  // One heavy caller against a shared proxy — LANE_PROTOCOL §5. Sequential,
  // not concurrent: 16 queries at ~19s each is ~5 minutes either way, and
  // concurrency is exactly what turned the last attempt into a multi-lane
  // contention problem.
  const sql = await openDb(url, 2);
  try {
    const embedder = await getEmbedder();

    for (const [i, r] of pending.entries()) {
      const q = queries.get(r.queryId);
      if (!q) {
        console.log(`  [${i + 1}/${pending.length}] ${r.queryId} — not in fixtures, skipped (not checkpointed)`);
        continue;
      }

      const startedAt = Date.now();
      try {
        const [emb] = await embedder.embed([q.query]);
        if (!emb) throw new Error('embedder returned nothing');
        const v = toVectorLiteral(emb.vector);

        // Exactly `retrieve.ts` `dense()`'s ANN stage: same SET LOCALs, same
        // ORDER BY, same LIMIT. No sparse arm, no filter join, no RRF.
        const chunkRows = await sql.begin(async (tx) => {
          await tx`SET LOCAL hnsw.ef_search = ${sql.unsafe(String(HNSW_EF_SEARCH))}`;
          await tx`SET LOCAL hnsw.iterative_scan = relaxed_order`;
          return tx<{ judgment_id: string }[]>`
            SELECT c.judgment_id
            FROM judgment_chunks c
            ORDER BY c.embedding <=> ${v}::vector
            LIMIT ${ANN_DEPTH}`;
        });

        let annChunkRank: number | null = null;
        let annJudgmentRank: number | null = null;
        const seen = new Set<string>();
        let judgmentsSoFar = 0;
        for (const [idx, row] of chunkRows.entries()) {
          if (!seen.has(row.judgment_id)) {
            seen.add(row.judgment_id);
            judgmentsSoFar++;
          }
          if (r.goldJudgmentIds.includes(row.judgment_id)) {
            if (annChunkRank === null) annChunkRank = idx + 1;
            if (annJudgmentRank === null) annJudgmentRank = judgmentsSoFar;
          }
        }

        const verdict: Verdict =
          annChunkRank === null
            ? 'ANN_MISS_HNSW_LOSS'
            : annJudgmentRank !== null && annJudgmentRank <= CANDIDATE_DEPTH
              ? 'ANN_HIT_JUDGMENT_IN_POOL'
              : 'ANN_HIT_JUDGMENT_COLLAPSED_OUT';

        const row: ProbeRow = {
          queryId: r.queryId,
          exactChunkRank: r.chunkRank,
          exactJudgmentRank: r.judgmentRank,
          annChunkRank,
          annJudgmentRank,
          verdict,
          ms: Date.now() - startedAt,
        };
        appendFileSync(CHECKPOINT_PATH, JSON.stringify(row) + '\n');
        console.log(
          `  [${i + 1}/${pending.length}] ${r.queryId.padEnd(20)} exact(chunk=${r.chunkRank},jud=${r.judgmentRank}) ` +
            `ann(chunk=${annChunkRank ?? 'MISS'},jud=${annJudgmentRank ?? '-'}) ${verdict} ${(row.ms / 1000).toFixed(1)}s`,
        );
      } catch (err) {
        // Not checkpointed — a failure is not a measurement.
        console.log(`  [!] ${r.queryId.padEnd(20)} FAILED: ${(err as Error).message} — will retry next run`);
      }
    }

    report(readJsonl<ProbeRow>(CHECKPOINT_PATH));
  } finally {
    await sql.end();
  }
}

function report(rows: ProbeRow[]): void {
  console.log('\n' + '='.repeat(78));
  console.log('ATTRIBUTION — the 16 DENSE_OK_BUT_MISSED cases');
  console.log('='.repeat(78));
  const by = new Map<Verdict, ProbeRow[]>();
  for (const r of rows) by.set(r.verdict, [...(by.get(r.verdict) ?? []), r]);
  const order: Verdict[] = ['ANN_MISS_HNSW_LOSS', 'ANN_HIT_JUDGMENT_COLLAPSED_OUT', 'ANN_HIT_JUDGMENT_IN_POOL'];
  const label: Record<Verdict, string> = {
    ANN_MISS_HNSW_LOSS: 'HNSW approximation loss — index itself does not return gold',
    ANN_HIT_JUDGMENT_COLLAPSED_OUT:
      'ANN finds gold, but judgment-collapse on ANN order alone already pushes it past 50 (candidate generation, not fusion)',
    ANN_HIT_JUDGMENT_IN_POOL: 'ANN finds gold inside both cut points — loss is downstream of the index (fusion/hybridSearch)',
  };
  for (const v of order) {
    const n = by.get(v)?.length ?? 0;
    console.log(`  ${String(n).padStart(2)} / ${rows.length}  ${v}`);
    console.log(`       ${label[v]}`);
  }
  const total = 16;
  if (rows.length < total) console.log(`\n  (${total - rows.length} still unmeasured — re-run to complete)`);
}

await main();
