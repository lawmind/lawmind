/**
 * HEAD LENGTH SWEEP — what does `HEAD:4800` actually buy?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS THE HIGHEST-VALUE CHEAP EXPERIMENT IN THE LANE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Tier-A scale run embeds the opening 4,800 characters of every document,
 * ~960 tokens each. `representation-lab-cli.ts` explains that number as "two
 * chunks' worth, so HEAD is never a truncation artefact" — a design rationale,
 * not a measurement. Nothing in this repository has ever compared it against a
 * shorter head.
 *
 * It is worth comparing because the scale run is GPU-bound and nothing else:
 * a phase profile of the live runner put 99.2% of wall time inside the sidecar
 * and 0.9% in the database, so throughput is a pure function of tokens pushed
 * through the encoder. At the measured 32,340 documents/hour the 8,846,550-row
 * manifest is 11.4 days. Transformer cost is superlinear in sequence length, so
 * halving the head is worth more than half the time — IF quality survives.
 *
 * That "if" is the whole experiment. This file does not assume it either way.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS AND IS NOT BEING MEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Exact cosine over a restricted pool, not production ANN. That is deliberate:
 * the question is whether a shorter head changes the RANKING, and putting HNSW
 * in the loop would mix in the 6-9% recall loss already measured at
 * ef_search=40, which varies run to run and is not what is under test. Every arm
 * sees the identical pool and the identical frozen query vectors, so the only
 * difference between arms is head length.
 *
 * The pool is the union of every gold authority and the real ANN candidates
 * retrieved for these queries. Those candidates are the HARD distractors — the
 * documents dense retrieval actually confuses with the answer — which makes this
 * a stricter test than a random pool would be.
 *
 * Queries are NOT re-embedded. They come from the frozen
 * `eval-query-vectors.json` every other probe in this lane uses, because an arm
 * that differed by its query embedding as well as its head length would not be
 * an arm.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const QV = JSON.parse(
  readFileSync(new URL('../../../docs/ai/new1-halfvec/eval-query-vectors.json', import.meta.url), 'utf8'),
);
const POOLS = JSON.parse(readFileSync(new URL('../../../docs/ai/new1-rerank/pools.json', import.meta.url), 'utf8'));
const OUT = new URL('../../../docs/ai/new1-rerank/head-length-sweep.json', import.meta.url);

const HEADS = (process.env.HEADS ?? '1200,2400,4800,9600').split(',').map(Number);
const POOL_DEPTH = Number(process.env.SWEEP_POOL_DEPTH ?? 50);
const MAX_POOL = Number(process.env.SWEEP_MAX_POOL ?? 5000);
const GPU_URL = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0 } });

// ── pool: every gold, plus the hard distractors dense retrieval actually returns
const golds = new Set();
for (const q of POOLS.queries) for (const g of q.gold) golds.add(g);
const distractors = new Set();
for (const q of POOLS.queries) {
  const seen = new Set();
  for (const r of POOLS.pools[q.id] ?? []) {
    if (seen.has(r.judgment_id)) continue;
    seen.add(r.judgment_id);
    if (seen.size > POOL_DEPTH) break;
    if (!golds.has(r.judgment_id)) distractors.add(r.judgment_id);
  }
}
const poolIds = [...golds, ...[...distractors].slice(0, Math.max(0, MAX_POOL - golds.size))];
console.log('HEAD LENGTH SWEEP');
console.log('heads ' + HEADS.join(', '));
console.log('pool ' + poolIds.length + ' documents (' + golds.size + ' gold + ' + (poolIds.length - golds.size) + ' hard distractors)');

// Longest head decides the read; every shorter arm slices the same string, so no
// arm can differ by having read a different copy of the text.
const MAXHEAD = Math.max(...HEADS);
const texts = new Map();
for (let i = 0; i < poolIds.length; i += 1000) {
  const slice = poolIds.slice(i, i + 1000);
  const rows = await sql`
    SELECT id, left(full_text, ${MAXHEAD}) AS head, length(full_text) AS len
    FROM judgments WHERE id = ANY(${slice}::uuid[])
  `;
  for (const r of rows) if (r.head && r.head.trim()) texts.set(r.id, { head: r.head, len: r.len });
}
console.log('text fetched for ' + texts.size + ' of ' + poolIds.length + '\n');
const ids = [...texts.keys()];

async function embedAll(strings, label) {
  const out = [];
  let tokens = 0;
  const BATCH_CHARS = 240_000;
  const t0 = Date.now();
  for (let i = 0; i < strings.length; ) {
    const b = [];
    let c = 0;
    while (i < strings.length && (b.length === 0 || c + strings[i].length < BATCH_CHARS)) {
      c += strings[i].length;
      b.push(strings[i]);
      i += 1;
    }
    const res = await fetch(GPU_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: b }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) throw new Error(label + ': sidecar ' + res.status);
    const j = await res.json();
    for (const v of j.vectors) out.push(Float32Array.from(v));
    tokens += j.tokenCounts.reduce((a, x) => a + x, 0);
  }
  return { vectors: out, tokens, seconds: (Date.now() - t0) / 1000 };
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
};

const queries = QV.queries.filter((q) => q.gold.some((g) => texts.has(g)));
console.log(queries.length + ' of ' + QV.queries.length + ' queries have their gold inside the pool\n');

const results = [];
for (const head of HEADS) {
  const { vectors, tokens, seconds } = await embedAll(ids.map((id) => texts.get(id).head.slice(0, head)), 'HEAD:' + head);
  const ranks = [];
  for (const q of queries) {
    const qv = Float32Array.from(q.vector);
    const scored = vectors.map((v, i) => ({ id: ids[i], s: dot(qv, v) }));
    scored.sort((a, b) => b.s - a.s);
    let rank = null;
    for (let i = 0; i < scored.length; i += 1)
      if (q.gold.includes(scored[i].id)) {
        rank = i + 1;
        break;
      }
    ranks.push(rank);
  }
  const n = ranks.length;
  const dcg = (r) => (r && r <= 10 ? 1 / Math.log2(r + 1) : 0);
  const row = {
    head,
    docs: ids.length,
    tokens,
    tokensPerDoc: Math.round(tokens / ids.length),
    embedSeconds: seconds,
    docsPerHour: Math.round((ids.length / seconds) * 3600),
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt10: ranks.reduce((a, r) => a + dcg(r), 0) / n,
  };
  results.push(row);
  console.log(
    'HEAD:' + String(head).padStart(5) +
      '  s@5 ' + (row.successAt5 * 100).toFixed(1).padStart(5) +
      '%  r@20 ' + (row.recallAt20 * 100).toFixed(1).padStart(5) +
      '%  mrr ' + row.mrr.toFixed(3) +
      '  ndcg@10 ' + row.ndcgAt10.toFixed(3) +
      '  ' + String(row.tokensPerDoc).padStart(4) + ' tok/doc' +
      '  ' + String(row.docsPerHour).padStart(6) + ' docs/hr',
  );
}

// The comparison that decides the scale run: quality delta against the incumbent
// 4,800 and the throughput it would cost or save.
const base = results.find((r) => r.head === 4800) ?? results[results.length - 1];
console.log('\nagainst the incumbent HEAD:' + base.head + ':');
for (const r of results) {
  if (r.head === base.head) continue;
  const days = (8846550 / r.docsPerHour / 24).toFixed(1);
  console.log(
    '  HEAD:' + String(r.head).padStart(5) +
      '  Δs@5 ' + ((r.successAt5 - base.successAt5) * 100).toFixed(2).padStart(6) + 'pt' +
      '  Δr@20 ' + ((r.recallAt20 - base.recallAt20) * 100).toFixed(2).padStart(6) + 'pt' +
      '  Δmrr ' + (r.mrr - base.mrr).toFixed(4).padStart(8) +
      '  speed x' + (r.docsPerHour / base.docsPerHour).toFixed(2) +
      '  manifest ' + days + ' days',
  );
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      kind: 'new1_head_length_sweep',
      generatedAt: new Date().toISOString(),
      note: 'exact cosine over a fixed pool, not production ANN; arms differ only by head length',
      poolDocs: ids.length,
      goldInPool: golds.size,
      queries: queries.length,
      manifestRows: 8846550,
      results,
    },
    null,
    2,
  ),
);
console.log('\nwrote ' + OUT.pathname);
await sql.end({ timeout: 10 });
