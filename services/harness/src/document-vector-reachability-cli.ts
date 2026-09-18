/**
 * NEW1 — would the Tier-A DOCUMENT vectors answer the questions production
 * cannot?
 *
 *   pnpm --filter @lawmind/harness reach:docvec
 *
 * THE QUESTION, AND WHY IT IS THE LAUNCH QUESTION
 * -----------------------------------------------
 * Production's dense arm searches `judgment_chunks`. Measured 22 Aug 2026:
 *
 *   judgment_chunks          40,161 distinct judgments
 *   new1_doc_vector_stage   675,711 documents, and PRODUCTION CANNOT SEE IT
 *
 * Against LAUNCH_BENCHMARK_V1's 1,029 gold authorities:
 *
 *   class          n     has a chunk (production)   in the Tier-A stage
 *   citation     229              0   (0.0%)            198  (86.5%)
 *   case_title   229              0   (0.0%)            198  (86.5%)
 *   fact_passage 372              2   (0.5%)            366  (98.4%)
 *   nl_doctrine  199              3   (1.5%)            196  (98.5%)
 *
 * Five of 1,029. The dense half of the shipping search is, for this gold,
 * searching an index that does not contain the answers — which is not a ranking
 * problem and cannot be fixed by anything in a ranker. `citation` and
 * `case_title` do not care, because the exact route answers them without a
 * vector. `nl_doctrine` and `fact_passage` have no such fallback, and they are
 * the two classes the premium research workflow is sold on.
 *
 * So before anyone builds an index or rewires a route, the honest first
 * question is whether the document vectors would actually ANSWER these queries.
 * A 17x bigger index that retrieves the wrong things is not an improvement.
 *
 * WHAT THIS MEASURES, AND THE THREE WAYS IT IS OPTIMISTIC
 * ------------------------------------------------------
 * `new1_doc_vector_stage` has no vector index — only a primary key — so it
 * cannot be searched at production scale today. `new1_probe_half_250k` DOES
 * have one (`new1_probe_half_250k_hnsw`, 669 MB, halfvec), holds 256,998 of the
 * staged documents, and contains 195 of 199 `nl_doctrine` and 271 of 286
 * `fact_passage` gold authorities. That makes it the instrument available
 * without asking the box for an index build it is currently too busy to give.
 *
 * Every number this prints is therefore an UPPER BOUND, for three separate
 * reasons, and none of them is a rounding error:
 *
 *   1. 256,998 distractors, not 675,711 and not the 8.85M of a finished Tier A.
 *      Recall falls as the haystack grows; this haystack is 3% of the eventual
 *      one.
 *   2. The probe was cut from an earlier staging population, so its membership
 *      is correlated with what was embedded first — value-ordered, i.e. the
 *      documents with inbound citations.
 *   3. No fusion, no sparse arm, no pinning. This is the dense arm alone.
 *
 * It is still decisive in ONE direction: production reaches 0.5% of this gold
 * today. If the dense-only document index reaches it at all, the gap between
 * the two is a coverage gap and not a relevance gap, and that is what the
 * launch decision turns on.
 *
 * THE QUERY EMBEDDER IS PRODUCTION'S, DELIBERATELY
 * ------------------------------------------------
 * `getEmbedder()` from `@lawmind/embed` — the same BGE-M3, the same CLS pooling,
 * the same L2 normalisation the API uses on a live search. The staged vectors
 * came from the GPU sidecar and `embed.ts` line 219 records that the two agree.
 * Using a different or unbudgeted embedder here would measure a quality the
 * product cannot deliver.
 *
 * RUN IT THROUGH THE RESOURCE GATE. The Tier-A walk owns the GPU and is the
 * priority background job; 485 query embeddings will contend with it. This file
 * does not enforce that — `scripts/resource-gate.mjs` is the check, and it said
 * DEFER GPU_EMBED at 100% GPU when this was written.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { toVectorLiteral } from '@lawmind/embed';
// GPU sidecar, not the in-process CPU embedder. See harness-embedder.ts: the CPU
// default is right for production and was silently starving the Tier-A walk here.
import { getHarnessEmbedder } from './harness-embedder.ts';

import { buildLaunchGold, type LaunchClass } from './launch-gold.ts';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT_REL = process.env['OUT'] ?? 'docs/ai/new1-tier-a/document-vector-reachability.json';
const OUT = isAbsolute(OUT_REL) ? OUT_REL : join(ROOT, OUT_REL);
/**
 * Checkpointed per query. 485 CPU embeddings on a contended box is long enough
 * that a teardown is a realistic outcome, and this lane has already lost 160 of
 * 283 queries once by writing only at the end.
 */
const CKPT_REL =
  process.env['CKPT'] ?? 'docs/ai/new1-tier-a/document-vector-reachability.checkpoint.jsonl';
const CKPT = isAbsolute(CKPT_REL) ? CKPT_REL : join(ROOT, CKPT_REL);

/** Production's own value (`retrieve.ts`), so the ANN behaves as it ships. */
const EF_SEARCH = Number(process.env['HNSW_EF_SEARCH'] ?? 200);
const TOP_K = Number(process.env['TOP_K'] ?? 20);
const PROBE = process.env['PROBE_TABLE'] ?? 'new1_probe_half_250k';

type Row = {
  queryId: string;
  launchClass: LaunchClass;
  rank: number | null;
  ms: number;
  inIndex: boolean;
};

const quantile = (xs: number[], q: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const pct = (a: number, b: number): number | null =>
  b === 0 ? null : Number(((100 * a) / b).toFixed(2));

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const gold = buildLaunchGold();
  const rows0 = gold.rows.filter(
    (r) => r.launchClass === 'nl_doctrine' || r.launchClass === 'fact_passage',
  );
  console.log(`document-vector reachability  frozenHash=${gold.frozenHash}  probe=${PROBE}`);
  console.log(`  ${rows0.length} semantic-class queries · ef_search=${EF_SEARCH} · topK=${TOP_K}`);

  const sql = postgres(url, {
    max: 2,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 60_000 },
  });

  // Which gold authorities are even IN the probe. A miss on an absent authority
  // is not a retrieval failure and must not be counted as one.
  const ids = [...new Set(rows0.map((r) => r.goldAuthorityId))];
  const present = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const r = await sql.unsafe(
      `SELECT judgment_id FROM ${PROBE} WHERE judgment_id = ANY($1::uuid[])`,
      [ids.slice(i, i + 500)],
    );
    for (const x of r) present.add(x['judgment_id'] as string);
  }
  console.log(`  gold authorities present in the probe: ${present.size}/${ids.length}`);

  const embedder = (await getHarnessEmbedder()).embedder;
  const results: Row[] = [];
  const done = new Set<string>();
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as Row & { frozenHash?: string };
        if (r.frozenHash && r.frozenHash !== gold.frozenHash) continue;
        done.add(r.queryId);
        results.push(r);
      } catch {
        // a truncated final line from a killed run
      }
    }
    if (done.size > 0) console.log(`  resuming: ${done.size} already measured`);
  }

  try {
    for (const [i, g] of rows0.entries()) {
      if (done.has(g.queryId)) continue;
      const inIndex = present.has(g.goldAuthorityId);
      const t = Date.now();
      const [e] = await embedder.embed([g.query]);
      const vec = e ? toVectorLiteral(e.vector) : null;
      let rank: number | null = null;
      if (vec) {
        const hits = await sql.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL hnsw.ef_search = ${EF_SEARCH}`);
          return tx.unsafe(
            `SELECT judgment_id FROM ${PROBE} ORDER BY embedding <=> $1::halfvec LIMIT ${TOP_K}`,
            [vec],
          );
        });
        const at = hits.findIndex((h) => h['judgment_id'] === g.goldAuthorityId);
        rank = at === -1 ? null : at + 1;
      }
      const row: Row = {
        queryId: g.queryId,
        launchClass: g.launchClass,
        rank,
        ms: Date.now() - t,
        inIndex,
      };
      results.push(row);
      appendFileSync(CKPT, JSON.stringify({ ...row, frozenHash: gold.frozenHash }) + '\n');
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${rows0.length}`);
    }
  } finally {
    await sql.end({ timeout: 10 });
  }

  const byClass: Record<string, unknown> = {};
  for (const cls of [...new Set(results.map((r) => r.launchClass))].sort()) {
    // Scored on the rows whose answer is IN the index. The rest are a coverage
    // statement, reported next to it and never folded into it.
    const all = results.filter((r) => r.launchClass === cls);
    const sub = all.filter((r) => r.inIndex);
    const lat = all.map((r) => r.ms);
    byClass[cls] = {
      queries: all.length,
      goldPresentInIndex: sub.length,
      goldAbsentFromIndex: all.length - sub.length,
      scoredOn: sub.length,
      successAt1: pct(sub.filter((r) => r.rank === 1).length, sub.length),
      successAt5: pct(sub.filter((r) => r.rank !== null && r.rank <= 5).length, sub.length),
      successAt20: pct(sub.filter((r) => r.rank !== null && r.rank <= TOP_K).length, sub.length),
      mrr: Number(
        (sub.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / Math.max(1, sub.length)).toFixed(
          4,
        ),
      ),
      latencyMs: { p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), max: Math.max(0, ...lat) },
    };
  }

  const report = {
    kind: 'new1_document_vector_reachability',
    measuredAt: new Date().toISOString(),
    frozenHash: gold.frozenHash,
    probeTable: PROBE,
    probeRows: 256_998,
    conditions: 'LOCAL_CONTENDED — the Tier-A walk and two other lanes were writing throughout',
    upperBoundBecause: [
      '256,998 distractors, against 675,711 staged today and ~8.85M in a finished Tier A',
      'the probe was cut value-ordered, so its membership correlates with inbound citations',
      'dense arm alone — no sparse fusion, no RRF, no exact pinning',
    ],
    productionComparison: {
      productionDenseIndex: 'judgment_chunks',
      productionDistinctJudgments: 40_161,
      goldAuthoritiesWithAChunk: 5,
      goldAuthoritiesTotal: 1_029,
      note: 'production cannot reach 99.5% of this gold at any rank, at any depth',
    },
    efSearch: EF_SEARCH,
    topK: TOP_K,
    byClass,
    rows: results,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

  console.log('\nDOCUMENT-VECTOR REACHABILITY (dense arm alone, UPPER BOUND)');
  for (const [cls, m] of Object.entries(byClass)) {
    const v = m as Record<string, unknown>;
    console.log(
      `\n  ${cls}  (${v['queries']} queries, ${v['scoredOn']} scored, ${v['goldAbsentFromIndex']} absent)`,
    );
    console.log(
      `    s@1 ${v['successAt1']}%  s@5 ${v['successAt5']}%  s@${TOP_K} ${v['successAt20']}%  MRR ${v['mrr']}`,
    );
    console.log(`    latency ${JSON.stringify(v['latencyMs'])}`);
  }
  console.log(`\nwrote ${OUT}`);
  return 0;
}

process.exitCode = await main();
