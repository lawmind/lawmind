/**
 * EXPANDED HC BENCHMARK — does the Tier-A expansion retrieve law the old
 * semantic universe could not see at all?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS DIFFERENT FROM EVERY OTHER PROBE IN THE LANE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The controlled 283-query set is Supreme-Court-shaped and, more importantly,
 * every one of its gold authorities is already in `judgment_chunks`. It can
 * therefore only ever measure RANKING. It cannot measure reach, because nothing
 * in it was ever out of reach.
 *
 * NEW3's `new3-semantic-expansion-gold.json` is built for the opposite case: 250
 * High Court authorities in courts the chunk universe never covered. Verified
 * against the database rather than taken on report:
 *
 *     250 of 250 gold present in `judgments`
 *       0 of 250 present in `judgment_chunks`     <- the old universe is BLIND here
 *     210 of 250 present in `new1_doc_vector_stage`
 *
 * So the two arms are not two rankers over one pool. Arm A is a universe in which
 * the answer does not exist, and the benchmark's job is to say what Arm B buys
 * over that. A success@5 of 0.0% on Arm A is the CORRECT reading, not a bug, and
 * the run asserts the reason for it rather than letting a zero speak for itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE QUERY TYPES, SCORED SEPARATELY, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 emits `proposition`, `exact_citation` and `case_title` for each authority.
 * Pooling them would hide the finding most likely to matter: a dense arm is
 * expected to be strong on `proposition` (semantic) and weak on `exact_citation`
 * (a citation string is a lexical object, which is what the sparse arm is for).
 * Reporting one blended number would let a good semantic result cover for a bad
 * citation result, and citation-shaped queries falling through to semantic search
 * is a defect this repo has already had to fix once.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCORING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Exact cosine over each arm's whole table — no ANN, no ef_search — because the
 * question is what the REPRESENTATION can reach, and an index recall term would
 * confound that with HNSW's own loss. `new1_doc_vector_stage` carries one vector
 * per document, so its rows are already judgments; `judgment_chunks` is folded
 * chunk-to-judgment by best chunk, matching `retrieve.ts`.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const GOLD = JSON.parse(
  readFileSync(new URL('../../../docs/ai/new3-semantic-expansion-gold.json', import.meta.url), 'utf8'),
);
const OUT = new URL('../../../docs/ai/new1-rerank/expanded-hc-benchmark.json', import.meta.url);

const GPU_URL = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const TOPK = Number(process.env.BENCH_TOPK ?? 20);
const LIMIT = Number(process.env.BENCH_QUERIES ?? Infinity);

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 } });
const lit = (v) => '[' + Array.from(v).join(',') + ']';

const rows = GOLD.rows.slice(0, LIMIT);
const goldIds = [...new Set(rows.map((r) => r.goldJudgmentId))];
console.log('EXPANDED HC BENCHMARK — ' + rows.length + ' queries over ' + goldIds.length + ' HC authorities');
console.log('source ' + GOLD.builtBy + ', method ' + GOLD.method);

// ── the claim this benchmark rests on, asserted rather than assumed ──────────
const [reach] = await sql`
  SELECT
    (SELECT count(*)::int FROM judgments WHERE id = ANY(${goldIds}::uuid[]))                    AS in_judgments,
    (SELECT count(DISTINCT judgment_id)::int FROM judgment_chunks WHERE judgment_id = ANY(${goldIds}::uuid[])) AS in_chunks,
    (SELECT count(*)::int FROM new1_doc_vector_stage WHERE judgment_id = ANY(${goldIds}::uuid[]))              AS in_stage
`;
const [sizes] = await sql`
  SELECT (SELECT count(*)::int FROM judgment_chunks) AS chunks,
         (SELECT count(*)::int FROM new1_doc_vector_stage) AS stage
`;
console.log(
  'gold reachability: judgments ' + reach.in_judgments + '/' + goldIds.length +
    ' · judgment_chunks ' + reach.in_chunks + '/' + goldIds.length +
    ' · new1_doc_vector_stage ' + reach.in_stage + '/' + goldIds.length,
);
console.log('universe sizes: chunks ' + sizes.chunks.toLocaleString() + ' · stage ' + sizes.stage.toLocaleString() + '\n');

// ── embed the queries once, on the same sidecar the corpus used ─────────────
async function embedAll(texts) {
  const out = [];
  const BATCH_CHARS = 120_000;
  for (let i = 0; i < texts.length; ) {
    const b = [];
    let c = 0;
    while (i < texts.length && (b.length === 0 || c + texts[i].length < BATCH_CHARS)) {
      c += texts[i].length;
      b.push(texts[i]);
      i += 1;
    }
    const res = await fetch(GPU_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: b }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) throw new Error('sidecar ' + res.status + ': ' + (await res.text()).slice(0, 200));
    for (const v of (await res.json()).vectors) out.push(Float32Array.from(v));
  }
  return out;
}
const t0 = Date.now();
const vectors = await embedAll(rows.map((r) => r.query));
console.log('embedded ' + vectors.length + ' queries in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's\n');

/** Exact scan. No ANN: the question is reach, not index recall. */
async function topStage(qv) {
  return sql.unsafe(
    'SELECT judgment_id FROM new1_doc_vector_stage ORDER BY embedding <=> $1::vector LIMIT ' + TOPK,
    [lit(qv)],
  );
}
async function topChunks(qv) {
  return sql.unsafe(
    'SELECT judgment_id FROM judgment_chunks ORDER BY embedding <=> $1::vector LIMIT ' + TOPK * 4,
    [lit(qv)],
  );
}
const fold = (rs) => {
  const seen = new Set();
  const out = [];
  for (const r of rs) {
    if (seen.has(r.judgment_id)) continue;
    seen.add(r.judgment_id);
    out.push(r.judgment_id);
  }
  return out;
};

const ARMS = (process.env.BENCH_ARMS ?? 'stage,chunks').split(',');
const ranks = { stage: [], chunks: [] };
const lat = { stage: [], chunks: [] };
const byType = {};

for (const [i, r] of rows.entries()) {
  const qv = vectors[i];
  const type = r.queryType;
  byType[type] ??= { stage: [], chunks: [] };
  for (const arm of ARMS) {
    const t = Date.now();
    const got = arm === 'stage' ? fold(await topStage(qv)) : fold(await topChunks(qv));
    lat[arm].push(Date.now() - t);
    let rank = null;
    for (let k = 0; k < got.length; k += 1)
      if (got[k] === r.goldJudgmentId) {
        rank = k + 1;
        break;
      }
    ranks[arm].push(rank);
    byType[type][arm].push(rank);
  }
  if ((i + 1) % 50 === 0)
    console.log('  ' + (i + 1) + '/' + rows.length + '  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}

const dcg = (r) => (r && r <= 10 ? 1 / Math.log2(r + 1) : 0);
function metrics(rs) {
  const n = rs.length;
  if (n === 0) return null;
  return {
    n,
    successAt5: rs.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: rs.filter((r) => r !== null && r <= 20).length / n,
    mrr: rs.reduce((a, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt10: rs.reduce((a, r) => a + dcg(r), 0) / n,
  };
}
const pctl = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null;
};

console.log('');
const overall = {};
for (const arm of ARMS) {
  overall[arm] = metrics(ranks[arm]);
  const m = overall[arm];
  console.log(
    (arm === 'stage' ? 'TIER-A DOC VECTORS' : 'OLD CHUNK UNIVERSE').padEnd(20) +
      '  s@5 ' + (m.successAt5 * 100).toFixed(1).padStart(5) + '%' +
      '  r@20 ' + (m.recallAt20 * 100).toFixed(1).padStart(5) + '%' +
      '  mrr ' + m.mrr.toFixed(3) +
      '  ndcg@10 ' + m.ndcgAt10.toFixed(3) +
      '  p50 ' + pctl(lat[arm], 0.5) + 'ms',
  );
}
console.log('\nby query type:');
const perType = {};
for (const [type, v] of Object.entries(byType)) {
  perType[type] = Object.fromEntries(ARMS.map((a) => [a, metrics(v[a])]));
  const parts = ARMS.map(
    (a) => (a === 'stage' ? 'tierA' : 'chunks') + ' s@5 ' + (perType[type][a].successAt5 * 100).toFixed(1) + '%',
  );
  console.log('  ' + type.padEnd(16) + parts.join('   '));
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      kind: 'new1_expanded_hc_benchmark',
      generatedAt: new Date().toISOString(),
      goldSource: { file: 'docs/ai/new3-semantic-expansion-gold.json', builtBy: GOLD.builtBy, method: GOLD.method },
      note: 'exact cosine, no ANN — the question is what the REPRESENTATION reaches, not index recall',
      goldAuthorities: goldIds.length,
      queries: rows.length,
      reachability: reach,
      universeSizes: sizes,
      overall,
      byQueryType: perType,
      latencyMs: Object.fromEntries(ARMS.map((a) => [a, { p50: pctl(lat[a], 0.5), p95: pctl(lat[a], 0.95) }])),
    },
    null,
    2,
  ),
);
console.log('\nwrote ' + OUT.pathname);
await sql.end({ timeout: 10 });
