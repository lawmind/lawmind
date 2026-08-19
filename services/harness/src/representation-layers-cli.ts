/**
 * `pnpm rep:layers` — P5. What is the MINIMUM vector multiplier that beats the
 * old full-chunk retrieval?
 *
 * `NEW1_REPRESENTATION_LAB.md` (18 Aug) established the floor and the ceiling on
 * this same pool: HEAD (1 vector/document) retains 89-96% of ALL_CHUNKS
 * (32.8 vectors/document) quality. It also established that a naive 4-vector
 * selection (SALIENT: opening, closing, longest interior) is WORSE than HEAD on
 * every metric — so "more vectors" is not automatically "better", and the
 * question P5 asks is which ADDITIONAL vector, if any, earns its storage.
 *
 * The layers, each strictly additive over the one above it:
 *
 *   A  HEAD                        1/doc   the frozen baseline
 *   B  + TAIL                      2/doc   the operative conclusion. An Indian
 *                                          judgment states its holding at the end
 *                                          ("In the result, the appeal is
 *                                          allowed…"), so TAIL is the closest
 *                                          text-addressable proxy for a HOLDING
 *                                          vector while the legal-object stage is
 *                                          still PLANNED rather than built.
 *   C  + ISSUE                     3/doc   the span around the first issue marker
 *                                          ("the question that arises", "point for
 *                                          determination", "whether"). Proxy for
 *                                          the ISSUE/PROPOSITION vector, same
 *                                          reason.
 *   D  + MEDOID2                   5/doc   the two chunks closest to the
 *                                          document's own centroid — "important
 *                                          paragraphs" chosen by the document's
 *                                          own geometry rather than by a rule
 *                                          about where holdings usually sit.
 *
 * And two controls, without which none of the above is interpretable:
 *
 *   RANDOM4      HEAD + 4 chunks drawn by a SEEDED rng. If D beats this, the
 *                selection is doing the work; if it does not, the vector COUNT
 *                is, and the clever selector is decoration. SALIENT's failure is
 *                exactly what an uncontrolled selector looks like.
 *   ALL_CHUNKS   the ceiling being competed against, recomputed here rather than
 *                quoted, so every number in the table comes off one run.
 *
 * ── WHERE THE VECTORS COME FROM ─────────────────────────────────────────────
 *
 * Chunk vectors are READ FROM `judgment_chunks` rather than recomputed: the pool
 * is Supreme Court and 100% embedded (measured, `fusion-reachability.json`), and
 * re-embedding 149k chunks costs ~2 GPU-hours to reproduce vectors the database
 * already holds. That is only sound if the stored vectors and the sidecar's agree,
 * which is CHECKED at startup on a sample and ABORTS if it does not hold — a
 * document side split across two embedders would put a systematic offset inside
 * the very comparison this tool exists to make.
 *
 * HEAD/TAIL/ISSUE spans do not exist in the database and are embedded on the GPU.
 * Queries are the frozen `eval-query-vectors.json`, shared with the halfvec C3/C4
 * probe so the two experiments cannot disagree about the query side.
 */
import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { sslFor } from './db-url.ts';
import { meanNdcgAtK } from './metrics.ts';

const require = createRequire(import.meta.url);

const CHECKPOINT =
  process.env['ARMS_CHECKPOINT'] ??
  fileURLToPath(new URL('../../../arms-checkpoint.jsonl', import.meta.url));
const QUERY_VECTORS =
  process.env['QUERY_VECTORS'] ??
  fileURLToPath(new URL('../../../docs/ai/new1-halfvec/eval-query-vectors.json', import.meta.url));
const OUT = process.env['REP_LAYERS_JSON'] ?? null;
const GPU_URL = process.env['EMBED_GPU_URL'] ?? 'http://127.0.0.1:8799/embed';
const MAX_POOL = Number(process.env['REP_MAX_POOL'] ?? 6000);
const SPAN_CHARS = Number(process.env['SPAN_CHARS'] ?? 4800);
const SEED = Number(process.env['REP_SEED'] ?? 20260819);
/** Cosine below which stored and sidecar vectors are NOT the same embedder. */
const EQUIVALENCE_FLOOR = Number(process.env['EQUIVALENCE_FLOOR'] ?? 0.999);

type Vec = Float32Array;

type Doc = {
  id: string;
  chunkVectors: Vec[];
  chunkTexts: string[];
  head?: Vec;
  tail?: Vec;
  issue?: Vec;
};

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

function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** Batched POST to the sidecar, bounded by characters rather than rows. */
async function embedAll(texts: readonly string[], label: string): Promise<Vec[]> {
  const out: Vec[] = [];
  const BATCH_CHARS = 240_000;
  let i = 0;
  const t0 = Date.now();
  while (i < texts.length) {
    const batch: string[] = [];
    let chars = 0;
    while (i < texts.length && (batch.length === 0 || chars + (texts[i] ?? '').length < BATCH_CHARS)) {
      const t = texts[i] ?? '';
      batch.push(t);
      chars += t.length;
      i += 1;
    }
    const res = await fetch(GPU_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) throw new Error(`sidecar ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { vectors: number[][] };
    for (const v of body.vectors) out.push(Float32Array.from(v));
    process.stdout.write(
      `\r  ${label}: ${out.length}/${texts.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s   `,
    );
  }
  process.stdout.write('\n');
  return out;
}

type EvalFixture = {
  readonly queries: readonly { readonly id: string; readonly goldJudgmentIds: readonly string[] }[];
};

/**
 * The pool, rebuilt exactly as the 18 Aug lab defined it: every judgment the
 * DENSE arm returned across the 283 eval queries, plus every gold. Rebuilt from
 * the checkpoint rather than read from a saved list, because the checkpoint is
 * the frozen record and a saved list is one more thing that can drift from it.
 */
async function buildPool(): Promise<{ pool: string[]; gold: Map<string, readonly string[]> }> {
  const fixture = require('./fixtures/queries.eval.json') as EvalFixture;
  const gold = new Map(fixture.queries.map((q) => [q.id, q.goldJudgmentIds]));
  const pool = new Set<string>();
  for (const ids of gold.values()) for (const id of ids) pool.add(id);
  const rl = createInterface({ input: createReadStream(CHECKPOINT), crlfDelay: Infinity });
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    let line: { pass: string; mode: string; row: { rankedIds?: string[] } };
    try {
      line = JSON.parse(raw) as typeof line;
    } catch {
      continue;
    }
    if (line.pass.toUpperCase() !== 'CONTROLLED' || line.mode !== 'dense') continue;
    for (const id of line.row.rankedIds ?? []) pool.add(id);
  }
  return { pool: [...pool].sort().slice(0, MAX_POOL), gold };
}

const ISSUE_MARKERS =
  /(the question (that|which) arises|point for determination|question for consideration|the issue (is|before us)|whether the)/i;

function headSpan(text: string): string {
  return text.slice(0, SPAN_CHARS).trim();
}
function tailSpan(text: string): string {
  return text.slice(Math.max(0, text.length - SPAN_CHARS)).trim();
}
function issueSpan(text: string): string {
  const searchFrom = Math.min(SPAN_CHARS, text.length);
  const m = ISSUE_MARKERS.exec(text.slice(searchFrom));
  if (!m) {
    // No marker: the block after HEAD, so the layer is still ADDITIVE text and
    // the comparison is not silently measuring "sometimes one fewer vector".
    return text.slice(SPAN_CHARS, SPAN_CHARS * 2).trim();
  }
  const at = searchFrom + m.index;
  const start = Math.max(0, at - Math.floor(SPAN_CHARS / 3));
  return text.slice(start, start + SPAN_CHARS).trim();
}

type Metrics = {
  n: number;
  successAt5: number;
  recallAt20: number;
  mrr: number;
  ndcgAt5: number;
  ndcgAt20: number;
  vectors: number;
  vectorsPerDocument: number;
};

function score(ranks: (number | null)[], vectors: number, documents: number): Metrics {
  const n = ranks.length;
  return {
    n,
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a: number, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt5: meanNdcgAtK(ranks, 5),
    ndcgAt20: meanNdcgAtK(ranks, 20),
    vectors,
    vectorsPerDocument: documents === 0 ? 0 : vectors / documents,
  };
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '';
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const qv = JSON.parse(readFileSync(QUERY_VECTORS, 'utf8')) as {
    queries: { id: string; group: string; gold: string[]; vector: number[] }[];
  };
  const { pool } = await buildPool();
  console.log('REPRESENTATION LAYERS — P5');
  console.log('='.repeat(78));
  console.log(`pool ${pool.length} judgments   queries ${qv.queries.length}   span ${SPAN_CHARS} chars`);

  const sql = postgres(url, { ssl: sslFor(url), max: 2, connection: { statement_timeout: 0 } });

  // ── chunk vectors and texts, from the database ──
  const docs = new Map<string, Doc>();
  const PAGE = 100;
  let read = 0;
  for (let i = 0; i < pool.length; i += PAGE) {
    const ids = pool.slice(i, i + PAGE);
    const rows = await sql<
      { judgment_id: string; chunk_index: number; chunk_text: string; embedding: string }[]
    >`
      SELECT judgment_id, chunk_index, chunk_text, embedding::text AS embedding
      FROM judgment_chunks
      WHERE judgment_id = ANY(${ids}::uuid[])
      ORDER BY judgment_id, chunk_index
    `;
    for (const r of rows) {
      const d = docs.get(r.judgment_id) ?? { id: r.judgment_id, chunkVectors: [], chunkTexts: [] };
      d.chunkVectors.push(Float32Array.from(JSON.parse(r.embedding) as number[]));
      d.chunkTexts.push(r.chunk_text);
      docs.set(r.judgment_id, d);
    }
    read += ids.length;
    process.stdout.write(`\r  read ${read}/${pool.length} judgments   `);
  }
  process.stdout.write('\n');
  console.log(`  ${docs.size} judgments carry chunks`);

  // ── the equivalence check, before anything depends on it ──
  const sample: { text: string; stored: Vec }[] = [];
  const rng0 = mulberry32(SEED);
  const docList = [...docs.values()];
  while (sample.length < 60 && docList.length > 0) {
    const d = docList[Math.floor(rng0() * docList.length)];
    if (!d) break;
    const j = Math.floor(rng0() * d.chunkTexts.length);
    const text = d.chunkTexts[j];
    const stored = d.chunkVectors[j];
    if (text && stored) sample.push({ text, stored });
  }
  const reembedded = await embedAll(
    sample.map((s) => s.text),
    'equivalence sample',
  );
  const cosines = reembedded.map((v, i) => dot(v, sample[i]?.stored as Vec));
  const minCos = Math.min(...cosines);
  const meanCos = cosines.reduce((a, b) => a + b, 0) / cosines.length;
  console.log(
    `  stored-vs-sidecar cosine over ${cosines.length} chunks: mean ${meanCos.toFixed(6)}, min ${minCos.toFixed(6)}`,
  );
  if (minCos < EQUIVALENCE_FLOOR) {
    console.error(
      `REFUSING: stored chunk vectors and the sidecar disagree (min cosine ${minCos.toFixed(6)} < ${EQUIVALENCE_FLOOR}).`,
    );
    console.error(
      'Mixing them would put a systematic offset inside the layer comparison. Re-embed the chunks, or run against a matching embedder.',
    );
    await sql.end({ timeout: 5 });
    process.exit(2);
  }

  // ── the spans that are NOT in the database ──
  const ids = [...docs.keys()];
  const fullTexts = new Map<string, string>();
  read = 0;
  for (let i = 0; i < ids.length; i += PAGE) {
    const page = ids.slice(i, i + PAGE);
    const rows = await sql<{ id: string; full_text: string | null }[]>`
      SELECT id, full_text FROM judgments WHERE id = ANY(${page}::uuid[])
    `;
    for (const r of rows) if (r.full_text) fullTexts.set(r.id, r.full_text);
    read += page.length;
    process.stdout.write(`\r  read ${read}/${ids.length} full texts   `);
  }
  process.stdout.write('\n');
  await sql.end({ timeout: 5 });

  const spanIds: string[] = [];
  const spanTexts: string[] = [];
  for (const id of ids) {
    const t = fullTexts.get(id);
    if (!t) continue;
    spanIds.push(id);
    spanTexts.push(headSpan(t), tailSpan(t), issueSpan(t));
  }
  console.log(`  embedding ${spanTexts.length} spans for ${spanIds.length} documents`);
  const spanVectors = await embedAll(spanTexts, 'spans');
  spanIds.forEach((id, i) => {
    const d = docs.get(id);
    if (!d) return;
    const h = spanVectors[i * 3];
    const t = spanVectors[i * 3 + 1];
    const iss = spanVectors[i * 3 + 2];
    if (h) d.head = h;
    if (t) d.tail = t;
    if (iss) d.issue = iss;
  });

  // ── the representations, as vector selectors ──
  const rng = mulberry32(SEED);
  const randomPick = new Map<string, number[]>();
  for (const d of docs.values()) {
    const n = d.chunkVectors.length;
    const idx = new Set<number>();
    while (idx.size < Math.min(4, n)) idx.add(Math.floor(rng() * n));
    randomPick.set(d.id, [...idx]);
  }

  /** The two chunks nearest the document's own centroid. */
  function medoid2(d: Doc): Vec[] {
    if (d.chunkVectors.length <= 2) return d.chunkVectors;
    const dim = d.chunkVectors[0]?.length ?? 0;
    const centroid = new Float32Array(dim);
    for (const v of d.chunkVectors)
      for (let i = 0; i < dim; i += 1) centroid[i] = (centroid[i] ?? 0) + (v[i] ?? 0);
    let norm = 0;
    for (let i = 0; i < dim; i += 1) norm += (centroid[i] ?? 0) ** 2;
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < dim; i += 1) centroid[i] = (centroid[i] ?? 0) / norm;
    return d.chunkVectors
      .map((v, i) => ({ v, i, s: dot(v, centroid) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 2)
      .map((x) => x.v);
  }

  const REPRESENTATIONS: Record<string, (d: Doc) => Vec[]> = {
    'A_HEAD': (d) => (d.head ? [d.head] : []),
    'B_HEAD_TAIL': (d) => [d.head, d.tail].filter((v): v is Vec => !!v),
    'C_HEAD_TAIL_ISSUE': (d) => [d.head, d.tail, d.issue].filter((v): v is Vec => !!v),
    'D_HEAD_TAIL_ISSUE_MEDOID2': (d) => [
      ...[d.head, d.tail, d.issue].filter((v): v is Vec => !!v),
      ...medoid2(d),
    ],
    'CONTROL_HEAD_RANDOM4': (d) => [
      ...(d.head ? [d.head] : []),
      ...(randomPick.get(d.id) ?? []).map((i) => d.chunkVectors[i]).filter((v): v is Vec => !!v),
    ],
    'CEILING_ALL_CHUNKS': (d) => d.chunkVectors,
  };

  console.log('');
  console.log(
    'representation'.padEnd(30) +
      'vec/doc'.padStart(9) +
      'succ@5'.padStart(8) +
      'rec@20'.padStart(8) +
      'MRR'.padStart(7) +
      'nDCG@5'.padStart(8) +
      'nDCG@20'.padStart(9),
  );
  console.log('-'.repeat(79));

  const results: Record<string, Metrics> = {};
  const docsArr = [...docs.values()];
  for (const [name, sel] of Object.entries(REPRESENTATIONS)) {
    const perDoc = docsArr.map((d) => ({ id: d.id, vectors: sel(d) }));
    const total = perDoc.reduce((a, d) => a + d.vectors.length, 0);
    const ranks: (number | null)[] = [];
    for (const q of qv.queries) {
      const qvec = Float32Array.from(q.vector);
      // MAX pooling: a document scores as its single best vector, matching
      // retrieve.ts's first-sighting collapse over chunk hits.
      const scored = perDoc
        .map((d) => {
          let best = -Infinity;
          for (const v of d.vectors) {
            const s = dot(qvec, v);
            if (s > best) best = s;
          }
          return { id: d.id, s: best };
        })
        .filter((x) => Number.isFinite(x.s))
        .sort((a, b) => b.s - a.s);
      let rank: number | null = null;
      for (let i = 0; i < scored.length; i += 1) {
        if (q.gold.includes(scored[i]?.id ?? '')) {
          rank = i + 1;
          break;
        }
      }
      ranks.push(rank);
    }
    const m = score(ranks, total, docsArr.length);
    results[name] = m;
    console.log(
      name.padEnd(30) +
        m.vectorsPerDocument.toFixed(2).padStart(9) +
        pct(m.successAt5).padStart(8) +
        pct(m.recallAt20).padStart(8) +
        m.mrr.toFixed(3).padStart(7) +
        m.ndcgAt5.toFixed(3).padStart(8) +
        m.ndcgAt20.toFixed(3).padStart(9),
    );
  }

  const ceiling = results['CEILING_ALL_CHUNKS'];
  console.log('');
  console.log('RETENTION AGAINST THE FULL-CHUNK CEILING');
  console.log('-'.repeat(79));
  console.log(
    'representation'.padEnd(30) +
      'vec share'.padStart(11) +
      'succ@5 kept'.padStart(13) +
      'rec@20 kept'.padStart(13) +
      'beats ceiling?'.padStart(16),
  );
  for (const [name, m] of Object.entries(results)) {
    if (!ceiling) break;
    const beats = m.successAt5 >= ceiling.successAt5 && m.recallAt20 >= ceiling.recallAt20;
    console.log(
      name.padEnd(30) +
        pct(m.vectors / ceiling.vectors).padStart(11) +
        pct(m.successAt5 / ceiling.successAt5).padStart(13) +
        pct(m.recallAt20 / ceiling.recallAt20).padStart(13) +
        (name === 'CEILING_ALL_CHUNKS' ? '—' : beats ? 'YES' : 'no').padStart(16),
    );
  }

  if (OUT) {
    writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          kind: 'new1_representation_layers',
          createdAt: new Date().toISOString(),
          pool: docsArr.length,
          queries: qv.queries.length,
          spanChars: SPAN_CHARS,
          seed: SEED,
          chunkVectorSource: 'judgment_chunks.embedding, equivalence-checked against the sidecar',
          equivalence: { sampled: cosines.length, meanCosine: meanCos, minCosine: minCos, floor: EQUIVALENCE_FLOOR },
          embedder: 'BGE-M3 fp32 via the GPU sidecar, CLS-pooled and L2-normalised',
          queryVectors: QUERY_VECTORS,
          pooling: 'MAX over a document vectors',
          results,
          limitation:
            'exact search over an in-memory pool of hard negatives, not HNSW over the corpus. The comparison BETWEEN representations is the measurement; the absolute figures are not production numbers.',
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nartifact → ${OUT}`);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
