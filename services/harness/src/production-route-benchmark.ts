/**
 * NEW1 — the same gold, through the PRODUCTION retrieval path.
 *
 * WHY THIS EXISTS, STATED AS A CORRECTION
 * ---------------------------------------
 * `expansion-benchmark-v2.mjs` measures the dense index in isolation, which is
 * the right scope for the halfvec and scale questions it was built for. It
 * reported `exact_citation` at 0.9% success@5 and `case_title` at 5.7%, and I
 * drew a product conclusion from that: that the exact and lexical routes did not
 * exist and needed building.
 *
 * That conclusion was wrong. `retrieve.ts` already pins an exact citation lookup
 * and an exact case-title lookup ahead of the ranked list, in every mode, and
 * `query-shape.ts` already classifies which of the two applies. The 0.9% is a
 * true statement about a vector index and a false statement about the product.
 *
 * So this runs the SAME gold queries through `hybridSearch` — the function the
 * API actually calls — and reports what an advocate would really get. Correcting
 * the claim without measuring it would have replaced one guess with another.
 *
 * WHAT IT IS NOT COMPARABLE TO
 * ----------------------------
 * Production reads `judgment_chunks`, not `new1_doc_vector_stage`. The 250k
 * Tier-A vectors are NOT visible to this path. So the two benchmarks answer
 * different questions and must never be put in one table:
 *
 *   expansion-benchmark-v2  what does the NEW corpus do, dense-only
 *   this                    what does the SHIPPING pipeline do, today
 *
 * The `proposition` figures here will be low for a reason that is not a ranking
 * defect: most of these High Court authorities have no chunk, which is the whole
 * motivation for the Tier-A run.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
import { hybridSearch } from '@lawmind/api/search/retrieve';
import { loadNew3Gold } from './new3-gold-adapter.ts';
import { sslFor } from './db-url.ts';

const LIMIT = Number(process.env['TOP_K'] ?? 20);
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT_REL = process.env['OUT'] ?? 'docs/ai/new1-tier-a/production-route-benchmark.json';
const OUT = isAbsolute(OUT_REL) ? OUT_REL : join(ROOT, OUT_REL);

type Row = {
  queryId: string;
  queryType: string;
  goldAuthorityId: string;
  rank: number | null;
  pinnedFirst: boolean;
  ms: number;
};

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 2, ssl: sslFor(url), onnotice: () => {} });

  const loaded = loadNew3Gold('docs/ai/new3-semantic-expansion-gold.json');
  console.log(`gold: ${loaded.rows.length} usable of ${loaded.totals.rowsInFile}`);

  const rows: Row[] = [];
  try {
    for (const [i, g] of loaded.rows.entries()) {
      const t = Date.now();
      const hits = await hybridSearch(sql, g.query, null, {}, LIMIT);
      const ms = Date.now() - t;
      const rank = hits.findIndex((h) => h.judgmentId === g.goldAuthorityId) + 1;
      rows.push({
        queryId: g.queryId,
        queryType: g.queryType,
        goldAuthorityId: g.goldAuthorityId,
        rank: rank || null,
        // The exact route pins its hit at position 1. Recording it separately
        // means "the route fired" and "the ranker happened to agree" stay
        // distinguishable, which a rank alone cannot say.
        pinnedFirst: rank === 1,
        ms,
      });
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${loaded.rows.length}`);
    }
  } finally {
    await sql.end({ timeout: 10 });
  }

  const pct = (a: number, b: number): number | null => (b === 0 ? null : Number(((100 * a) / b).toFixed(2)));
  const quantile = (xs: number[], q: number): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  };

  const byType: Record<string, unknown> = {};
  for (const t of [...new Set(rows.map((r) => r.queryType))].sort()) {
    const sub = rows.filter((r) => r.queryType === t);
    const lat = sub.map((r) => r.ms);
    byType[t] = {
      queries: sub.length,
      successAt1: pct(sub.filter((r) => r.rank === 1).length, sub.length),
      successAt5: pct(sub.filter((r) => r.rank !== null && r.rank <= 5).length, sub.length),
      recallAt20: pct(sub.filter((r) => r.rank !== null && r.rank <= 20).length, sub.length),
      mrr: Number((sub.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / sub.length).toFixed(4)),
      latencyMs: { p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), max: Math.max(...lat) },
    };
  }

  const report = {
    kind: 'new1_production_route_benchmark',
    measuredAt: new Date().toISOString(),
    path: 'hybridSearch (services/api/src/search/retrieve.ts)',
    note: 'reads judgment_chunks; the Tier-A stage vectors are NOT visible to this path',
    topK: LIMIT,
    byQueryType: byType,
    rows,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

  console.log('\nPRODUCTION ROUTE (hybridSearch)');
  for (const [t, m] of Object.entries(byType)) {
    const v = m as Record<string, unknown>;
    console.log(`\n  ${t}  (${v['queries']} queries)`);
    console.log(`    success@1  ${v['successAt1']}%   success@5 ${v['successAt5']}%   recall@20 ${v['recallAt20']}%`);
    console.log(`    MRR ${v['mrr']}   latency ${JSON.stringify(v['latencyMs'])}`);
  }
  console.log(`\nwrote ${OUT}`);
  return 0;
}

process.exitCode = await main();
