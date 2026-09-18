/**
 * `pnpm rep:lab` — is 15.45 vectors per document buying anything?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS THE EXPENSIVE QUESTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The index holds **15.45 vectors per document**, measured over the 40,161
 * embedded judgments (`docs/ai/new1-post-0055/vectors-per-document.json`). CX1's
 * scenarios were priced at one vector per document, so every scale figure in
 * them is short by that factor: TIER_A is **13.5M vectors and ~70 GiB halfvec**,
 * not 1.7M and 9 GiB.
 *
 * Nobody has measured what the other 14.45 vectors are worth. This does, before
 * the multiplier is committed to at corpus scale.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESIGN, AND WHY IT IS AFFORDABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A representation change cannot be evaluated against the production index —
 * that index IS the baseline representation. So this builds its own small index
 * three times over and searches it in memory.
 *
 * **The pool is not sampled, it is the real competition.** It is the union of
 * every judgment the dense arm actually returned across all 283 evaluation
 * queries, plus every gold judgment — including the 110 gold the dense arm never
 * returned, which must be present or the experiment would only ever be scored on
 * queries dense already wins. 4,546 judgments: real hard negatives, at a size
 * one GPU-hour can embed three times.
 *
 * Chunking uses the production chunker (`chunkJudgment`, maxChars 2400), so
 * ALL_CHUNKS reproduces what the real index holds rather than approximating it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE REPRESENTATIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ALL_CHUNKS   every chunk. The production representation, and the control.
 *   HEAD         ONE vector per document, over the opening `HEAD_CHARS`.
 *                An Indian judgment opens with the court, the parties, the
 *                provisions in issue and the question presented — so this is
 *                not "a random slice", it is the closest thing the document has
 *                to a self-description.
 *   SALIENT      a bounded selection of chunks: the opening, the closing, and
 *                the longest interior chunks up to `SALIENT_MAX`. The holding
 *                in an Indian judgment is overwhelmingly at the end ("In the
 *                result, the appeal is allowed..."), and the reasoning that
 *                earns it is in the longest paragraphs.
 *
 * HEAD is the 1-vector floor and ALL_CHUNKS the ceiling. SALIENT exists because
 * a verdict of "the floor is nearly the ceiling" and "the floor is far below it"
 * would both leave the actual decision — how many vectors — unanswered.
 *
 * **What this does NOT test.** The directive's second candidate is verified
 * holding/issue/proposition vectors. Those do not exist as data yet: the
 * proposition/evidence stage is PLANNED in `RETRIEVAL_PROGRAM.md`, so there is
 * nothing to embed. Measuring HEAD and SALIENT tells us whether that stage is
 * worth building, which is the honest order.
 *
 * Scoring is exactly the harness's: cosine over L2-normalised vectors, best
 * chunk wins the document (`MAX` pooling, as `retrieve.ts` does), single gold,
 * success@5 / recall@20 / MRR / nDCG.
 *
 * Reads the database ONCE for judgment text. Embeds on the GPU sidecar, which
 * is the point — the CPU is saturated by the ingest fleet and this work does not
 * touch it.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { chunkJudgment } from '@lawmind/embed';
import { meanNdcgAtK } from './metrics.ts';
import { sslFor } from './db-url.ts';

const require = createRequire(import.meta.url);

const POOL_FILE = process.env['REP_POOL'] ?? null;
const OUT = process.env['REP_LAB_JSON'] ?? null;
const GPU_URL = process.env['EMBED_GPU_URL'] ?? 'http://127.0.0.1:8799/embed';
/** Bounded so a bad pool file cannot turn into an unbounded corpus read. */
const MAX_POOL = Number(process.env['REP_MAX_POOL'] ?? 6000);

/** One vector's worth of opening text. Two chunks' worth, so HEAD is never a truncation artefact. */
const HEAD_CHARS = 4800;
/** Ceiling on SALIENT chunks per document. 4 is ~26% of the measured 15.45. */
const SALIENT_MAX = 4;

type EvalFixture = {
  readonly queries: readonly {
    readonly id: string;
    readonly group: string;
    readonly query: string;
    readonly goldJudgmentIds: readonly string[];
  }[];
};

type Doc = { id: string; chunks: string[] };

/** Batched POST to the GPU sidecar. Batches are bounded by CHARACTERS, not rows. */
async function embedAll(texts: readonly string[], label: string): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  const BATCH_CHARS = 240_000;
  let batch: string[] = [];
  let chars = 0;
  let done = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const res = await fetch(GPU_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: batch }),
    });
    if (!res.ok) throw new Error(`${label}: embed server ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { vectors: number[][] };
    for (const v of body.vectors) out.push(Float32Array.from(v));
    done += batch.length;
    process.stdout.write(`\r  ${label}: ${done}/${texts.length} embedded   `);
    batch = [];
    chars = 0;
  };

  for (const t of texts) {
    batch.push(t);
    chars += t.length;
    if (chars >= BATCH_CHARS) await flush();
  }
  await flush();
  process.stdout.write('\n');
  return out;
}

function cosine(a: Float32Array, b: Float32Array): number {
  // Both sides are L2-normalised by the embedder, so the dot product IS the
  // cosine. Not renormalised here — doing so would hide a normalisation bug.
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** The three representations, as pure functions over a document's chunks. */
const REPRESENTATIONS: Readonly<Record<string, (d: Doc) => string[]>> = {
  ALL_CHUNKS: (d) => d.chunks,
  HEAD: (d) => {
    const joined = d.chunks.join('\n\n').slice(0, HEAD_CHARS);
    return joined.trim().length > 0 ? [joined] : [];
  },
  SALIENT: (d) => {
    if (d.chunks.length <= SALIENT_MAX) return d.chunks;
    const first = d.chunks[0];
    const last = d.chunks[d.chunks.length - 1];
    const interior = d.chunks
      .slice(1, -1)
      .map((text, i) => ({ text, i }))
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, SALIENT_MAX - 2)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.text);
    return [first, ...interior, last].filter((t): t is string => t !== undefined);
  },
};

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
    vectorsPerDocument: vectors / documents,
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  if (!POOL_FILE) {
    console.error('REP_POOL must name a JSON array of judgment ids');
    process.exitCode = 2;
    return;
  }
  const pool = (JSON.parse(readFileSync(POOL_FILE, 'utf8')) as string[]).slice(0, MAX_POOL);
  const fixture = require('./fixtures/queries.eval.json') as EvalFixture;

  console.log(`representation lab — ${pool.length} judgments, ${fixture.queries.length} queries`);
  console.log(`GPU sidecar ${GPU_URL}\n`);

  const url = process.env['DATABASE_URL'] ?? '';
  const sql = postgres(url, { ssl: sslFor(url), max: 2 });

  // One read, paged. `full_text` is the whole judgment and some run to millions
  // of characters, so this is paged rather than pulled in a single statement.
  const docs: Doc[] = [];
  const PAGE = 200;
  let read = 0;
  let empty = 0;
  for (let i = 0; i < pool.length; i += PAGE) {
    const ids = pool.slice(i, i + PAGE);
    const rows = await sql<{ id: string; full_text: string | null }[]>`
      SELECT id, full_text FROM judgments WHERE id = ANY(${ids})
    `;
    for (const r of rows) {
      if (!r.full_text || r.full_text.trim().length === 0) {
        empty += 1;
        continue;
      }
      docs.push({ id: r.id, chunks: chunkJudgment(r.full_text).map((c) => c.text) });
    }
    read += rows.length;
    process.stdout.write(`\r  read ${read}/${pool.length} judgments   `);
  }
  process.stdout.write('\n');
  await sql.end();
  console.log(
    `  ${docs.length} judgments with text, ${empty} empty, ${pool.length - read} not found\n`,
  );

  // Queries are embedded ONCE and shared by all three representations — the
  // comparison is of the document side only, and re-embedding the query per
  // representation would let query-side noise leak into the difference.
  const queries = fixture.queries.filter((q) => q.goldJudgmentIds.length > 0);
  const queryVectors = await embedAll(
    queries.map((q) => q.query),
    'queries',
  );

  const results: Record<string, Metrics> = {};
  const perQueryRanks: Record<string, (number | null)[]> = {};

  for (const [name, select] of Object.entries(REPRESENTATIONS)) {
    const texts: string[] = [];
    const owner: string[] = [];
    for (const d of docs) {
      for (const t of select(d)) {
        texts.push(t);
        owner.push(d.id);
      }
    }
    console.log(
      `${name}: ${texts.length} vectors over ${docs.length} documents (${(texts.length / docs.length).toFixed(2)}/doc)`,
    );
    const vectors = await embedAll(texts, name);

    const ranks: (number | null)[] = [];
    for (let qi = 0; qi < queries.length; qi += 1) {
      const qv = queryVectors[qi];
      const q = queries[qi];
      if (!qv || !q) {
        ranks.push(null);
        continue;
      }
      // MAX pooling: a document scores as its single best chunk, which is what
      // `retrieve.ts` does when it collapses chunk hits to judgments.
      const best = new Map<string, number>();
      for (let vi = 0; vi < vectors.length; vi += 1) {
        const v = vectors[vi];
        const id = owner[vi];
        if (!v || id === undefined) continue;
        const s = cosine(qv, v);
        const prev = best.get(id);
        if (prev === undefined || s > prev) best.set(id, s);
      }
      const ordered = [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      const at = ordered.findIndex(([id]) => q.goldJudgmentIds.includes(id));
      ranks.push(at === -1 ? null : at + 1);
    }
    perQueryRanks[name] = ranks;
    results[name] = score(ranks, texts.length, docs.length);
  }

  console.log('');
  console.log(
    'representation'.padEnd(14) +
      'vec/doc'.padStart(9) +
      'vectors'.padStart(10) +
      'succ@5'.padStart(8) +
      'rec@20'.padStart(8) +
      'MRR'.padStart(7) +
      'nDCG@5'.padStart(8) +
      'nDCG@20'.padStart(9),
  );
  for (const [name, m] of Object.entries(results)) {
    console.log(
      name.padEnd(14) +
        m.vectorsPerDocument.toFixed(2).padStart(9) +
        String(m.vectors).padStart(10) +
        pct(m.successAt5).padStart(8) +
        pct(m.recallAt20).padStart(8) +
        m.mrr.toFixed(3).padStart(7) +
        m.ndcgAt5.toFixed(3).padStart(8) +
        m.ndcgAt20.toFixed(3).padStart(9),
    );
  }

  const base = results['ALL_CHUNKS'];
  if (base) {
    console.log('');
    console.log('QUALITY RETAINED per vector spent, against ALL_CHUNKS:');
    for (const [name, m] of Object.entries(results)) {
      if (name === 'ALL_CHUNKS') continue;
      const costRatio = m.vectorsPerDocument / base.vectorsPerDocument;
      const keptS5 = base.successAt5 === 0 ? null : m.successAt5 / base.successAt5;
      const keptR20 = base.recallAt20 === 0 ? null : m.recallAt20 / base.recallAt20;
      console.log(
        `  ${name.padEnd(12)} ${pct(costRatio)} of the vectors  ->  ` +
          `${keptS5 === null ? 'n/a' : pct(keptS5)} of success@5, ${keptR20 === null ? 'n/a' : pct(keptR20)} of recall@20`,
      );
    }
  }

  if (OUT) {
    writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          kind: 'new1_representation_lab',
          createdAt: new Date().toISOString(),
          poolRequested: pool.length,
          documentsWithText: docs.length,
          queries: queries.length,
          headChars: HEAD_CHARS,
          salientMax: SALIENT_MAX,
          chunker: 'services/embed/src/chunk.ts chunkJudgment, defaultChunkOptions (maxChars 2400)',
          embedder: 'BGE-M3 fp32 via the GPU sidecar, CLS-pooled and L2-normalised',
          pooling: 'MAX over a document chunks, matching retrieve.ts',
          results,
          note: 'the pool is the union of every judgment the dense arm returned across the 283 eval queries, plus all gold — real hard negatives, not a random sample',
          limits: [
            'exact search over an in-memory pool of ~4.5k documents, NOT an ANN index over 9.5M. Absolute figures are not comparable to the production baseline; the comparison BETWEEN representations is the measurement.',
            'verified holding/issue/proposition vectors are not tested because that data does not exist yet — the proposition stage is PLANNED in RETRIEVAL_PROGRAM.md.',
          ],
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nwrote ${OUT}`);
  }
}

await main();
