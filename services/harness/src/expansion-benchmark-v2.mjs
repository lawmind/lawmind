/**
 * NEW1 P13 — does adding millions of judgments actually make retrieval better?
 *
 * That is the question the whole Tier-A run exists to answer, and it cannot be
 * answered by a single number. An authority can fail to be found for four reasons
 * that want four different fixes, so this reports them as a FUNNEL and never
 * collapses them:
 *
 *   SOURCE_PRESENT     the judgment is in `judgments` at all
 *   SEMANTIC_ELIGIBLE  it passes the deployed Tier-A eligibility view
 *   EMBEDDED           it has a vector in the snapshot being measured
 *   RETRIEVED          it comes back for its own query
 *   CORRECTLY_RANKED   it comes back in the top 5
 *
 * A gold authority missing at stage 1 is an acquisition problem, at stage 2 an
 * eligibility problem, at stage 3 a throughput problem and at stage 4 a ranking
 * problem. Reporting 35.8% success@5 without the funnel tells nobody which of the
 * four to work on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE QUERY TYPES ARE NEVER POOLED
 * ─────────────────────────────────────────────────────────────────────────────
 * `exact_citation` hands the authority's own neutral citation back as the query
 * and `case_title` hands back its title. Both are legitimate — they are the
 * structured routes — but a dense vector over "2025:PHHC:089161" is close to
 * meaningless, and averaging it with a real proposition query produces a number
 * about nothing. Every metric here is per type.
 *
 * Feature use is checked against the leakage contract before scoring, so a future
 * arm that adds an inbound-citation feature will THROW on this gold rather than
 * publish another +21.5 points that were the benchmark rather than the ranking.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadNew3Gold } from './new3-gold-adapter.ts';
import { assertFeatureAllowed } from './gold-contract.ts';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const GPU = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const LABEL = process.env.MILESTONE ?? '250k';
const TABLE = process.env.PROBE_TABLE ?? `new1_probe_fp32_${LABEL}`;
/** Production runs 200. Measuring at 40 answered a question production does not ask. */
const EF_SEARCH = Number(process.env.EF_SEARCH ?? 200);
const TOP_K = Number(process.env.TOP_K ?? 50);
const GOLD = new URL('../../../docs/ai/new3-semantic-expansion-gold.json', import.meta.url);
const OUT = new URL(`../../../docs/ai/new1-tier-a/expansion-benchmark-${LABEL}.json`, import.meta.url);

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 300_000 }, onnotice: () => {} });

const loaded = loadNew3Gold(GOLD.pathname.replace(/^\//, ''));
console.log(`gold: ${loaded.rows.length} usable of ${loaded.totals.rowsInFile} (${loaded.dropped.length} dropped)`);

// Dense similarity is the only family this arm reads. Asserting it per row means a
// gold set that forbids it — none does today — stops the run instead of being
// silently scored anyway.
for (const r of loaded.rows) assertFeatureAllowed(r, 'dense_similarity');

// ── the funnel, computed once per distinct authority ─────────────────────────
const authorities = [...new Set(loaded.rows.map((r) => r.goldAuthorityId))];
const present = await sql`
  SELECT e.id,
         (e.axis_a_identity AND e.axis_b_text AND e.axis_c_role
          AND coalesce(e.is_bail_order, false) = false
          AND e.value_band = ANY(ARRAY['standard','full','substantial'])) AS eligible,
         e.court, e.value_band, e.hc_document_class
  FROM judgment_embedding_eligibility e
  WHERE e.id = ANY(${authorities}::uuid[])
`;
const presentById = new Map(present.map((r) => [r.id, r]));
const embedded = await sql.unsafe(
  `SELECT judgment_id FROM ${TABLE} WHERE judgment_id = ANY($1::uuid[])`,
  [authorities],
);
const embeddedIds = new Set(embedded.map((r) => r.judgment_id));

const funnel = {
  goldAuthorities: authorities.length,
  sourcePresent: present.length,
  semanticEligible: present.filter((r) => r.eligible).length,
  embedded: embeddedIds.size,
};
console.log(
  `funnel: source ${funnel.sourcePresent}/${funnel.goldAuthorities} · eligible ${funnel.semanticEligible} · embedded ${funnel.embedded}`,
);

// ── embed the queries once, on the same sidecar the corpus used ──────────────
async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const slice = texts.slice(i, i + 32);
    const res = await fetch(GPU, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: slice }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error('sidecar ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const body = await res.json();
    out.push(...body.vectors);
  }
  return out;
}
const t0 = Date.now();
const vectors = await embedAll(loaded.rows.map((r) => r.query));
console.log(`embedded ${vectors.length} queries in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

await sql.unsafe(`SET hnsw.ef_search = ${EF_SEARCH}`);

const results = [];
const latencies = [];
for (const [i, row] of loaded.rows.entries()) {
  const lit = '[' + vectors[i].join(',') + ']';
  const t = Date.now();
  const hits = await sql.unsafe(
    `SELECT judgment_id FROM ${TABLE} ORDER BY embedding <=> $1::vector LIMIT ${TOP_K}`,
    [lit],
  );
  latencies.push(Date.now() - t);
  const rank = hits.findIndex((h) => h.judgment_id === row.goldAuthorityId) + 1;
  const e = presentById.get(row.goldAuthorityId);
  results.push({
    queryId: row.queryId,
    queryType: row.queryType,
    goldAuthorityId: row.goldAuthorityId,
    sourcePresent: Boolean(e),
    semanticEligible: Boolean(e?.eligible),
    embedded: embeddedIds.has(row.goldAuthorityId),
    rank: rank || null,
  });
  if ((i + 1) % 100 === 0) console.log(`  scored ${i + 1}/${loaded.rows.length}`);
}

const pct = (a, b) => (b === 0 ? null : Number(((100 * a) / b).toFixed(2)));
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

function summarise(rows) {
  const ranked = rows.filter((r) => r.rank !== null);
  const mrr = rows.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / Math.max(rows.length, 1);
  // nDCG with one relevant document per query reduces to 1/log2(rank+1).
  const ndcg = rows.reduce((a, r) => a + (r.rank && r.rank <= 10 ? 1 / Math.log2(r.rank + 1) : 0), 0) / Math.max(rows.length, 1);
  // The conditional figure is the honest one for RANKING: of the authorities that
  // are actually in the index, how many surface? The unconditional figure mixes
  // ranking quality with embedding coverage and moves when neither changes.
  const embeddedRows = rows.filter((r) => r.embedded);
  return {
    queries: rows.length,
    embeddedGold: embeddedRows.length,
    successAt5: pct(rows.filter((r) => r.rank && r.rank <= 5).length, rows.length),
    successAt5GivenEmbedded: pct(embeddedRows.filter((r) => r.rank && r.rank <= 5).length, embeddedRows.length),
    recallAt20: pct(rows.filter((r) => r.rank && r.rank <= 20).length, rows.length),
    recallAt20GivenEmbedded: pct(embeddedRows.filter((r) => r.rank && r.rank <= 20).length, embeddedRows.length),
    presentAt50: pct(ranked.length, rows.length),
    mrr: Number(mrr.toFixed(4)),
    ndcgAt10: Number(ndcg.toFixed(4)),
  };
}

const byType = {};
for (const t of [...new Set(results.map((r) => r.queryType))].sort()) {
  byType[t] = summarise(results.filter((r) => r.queryType === t));
}

const report = {
  kind: 'new1_expansion_benchmark_v2',
  milestone: LABEL,
  probeTable: TABLE,
  efSearch: EF_SEARCH,
  topK: TOP_K,
  measuredAt: new Date().toISOString(),
  goldFile: 'docs/ai/new3-semantic-expansion-gold.json',
  goldDropped: loaded.dropped.length,
  funnel,
  byQueryType: byType,
  latencyMs: { p50: quantile(latencies, 0.5), p95: quantile(latencies, 0.95), max: Math.max(...latencies) },
  results,
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

console.log(`\nMILESTONE ${LABEL}  table ${TABLE}  ef_search ${EF_SEARCH}`);
console.log(
  `funnel  source ${funnel.sourcePresent}/${funnel.goldAuthorities}  eligible ${funnel.semanticEligible}  embedded ${funnel.embedded}`,
);
for (const [t, m] of Object.entries(byType)) {
  console.log(`\n  ${t}  (${m.queries} queries, ${m.embeddedGold} with an embedded gold)`);
  console.log(`    success@5      ${m.successAt5}%   given embedded ${m.successAt5GivenEmbedded}%`);
  console.log(`    recall@20      ${m.recallAt20}%   given embedded ${m.recallAt20GivenEmbedded}%`);
  console.log(`    present@${TOP_K}     ${m.presentAt50}%`);
  console.log(`    MRR ${m.mrr}   nDCG@10 ${m.ndcgAt10}`);
}
console.log(`\nlatency  p50 ${report.latencyMs.p50}ms  p95 ${report.latencyMs.p95}ms  max ${report.latencyMs.max}ms`);
console.log(`\nwrote ${OUT.pathname}`);
await sql.end({ timeout: 10 });
