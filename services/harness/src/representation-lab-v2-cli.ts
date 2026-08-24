/**
 * SUPERSEDED BY `representation-lab-v3-cli.ts`. ITS RESULTS ARE NOT SAFE TO QUOTE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file's headline — POOLED_ALL at 73.3% s@5 against HEAD_4800's 20.0%, and
 * the conclusion that "more vectors per document is NOT the lever" — was produced
 * against a pool that contained **ZERO hard negatives**, and every part of that
 * conclusion is reversed once they are present.
 *
 * THE DEFECT, which was silent: the hard-negative draw below issued
 * `SET LOCAL hnsw.ef_search = 200; SELECT …` as ONE tagged template with bound
 * parameters. postgres.js sends a parameterised query as a prepared statement and
 * PostgreSQL refuses multiple commands in one, so every call threw
 * `cannot insert multiple commands into a prepared statement`, every throw was
 * swallowed by the `catch` that logs a skip line, and the pool silently fell back
 * to the random TABLESAMPLE fill alone. The artefact's `hardNegatives` count is
 * `pool.length - gold`, so it reported 2,480 negatives while zero were drawn.
 *
 * The SQL is FIXED below so that a re-run is not wrong. The numbers already
 * published from it are still wrong: same tasks, same arm, same 2,500 pool, V3
 * measures arm B at **24.4%**, not 73.3%.
 *
 * V3 also corrects the pool source (the full staged population, not a 250k
 * probe subset), reads arm A from `new1_doc_vector_stage` instead of
 * re-embedding it, adds confidence intervals and a nested pool-scale curve, and
 * measures NOT_IN_INDEX before the pool force-includes gold.
 *
 * See `docs/ai/new1-tier-a/SEMANTIC_REPRESENTATION_DECISION_V3.md`.
 *
 * Kept, not deleted: it is the record of what was measured and when, and the
 * arm definitions below are the ones V3 reuses.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1 — REPRESENTATION LAB V2. The core research question of the previous round.
 *
 *   pnpm --filter @lawmind/harness rep:lab2
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION, STATED PRECISELY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Can we get PARAGRAPH/FACT sensitivity WITHOUT storing embeddings for every
 * paragraph of 18M judgments?
 *
 * That question exists because of one measurement, not a hunch. Same documents,
 * two queries:
 *
 *   the WHOLE embedded head text     → the document returns at rank 1, 68 of 68
 *   ONE SENTENCE from that same head → the document is in the top 5 **17.5%**
 *
 * The document vector is not broken; a document-level vector cannot answer a
 * sentence-level question. That is a REPRESENTATION problem, and no amount of
 * HNSW tuning touches it. So this lab compares representations and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ARMS, AND WHY EACH ONE IS HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   A  HEAD_4800        the production representation, and the control. One
 *                       vector over the opening 4,800 characters.
 *   B  POOLED_ALL       ONE vector per document, the L2-normalised mean of every
 *                       chunk vector. Same storage as A, sees the whole document.
 *                       If B beats A, the fix is free: re-embed, store one
 *                       vector, change nothing else about the index.
 *   C  POOLED_SALIENT   ONE vector, the normalised mean of head + longest
 *                       interior chunks + tail. An Indian judgment states the
 *                       question at the top and the holding at the bottom
 *                       ("In the result, the appeal is allowed…"); B dilutes
 *                       both with recitals, C is the hypothesis that the dilution
 *                       is what costs the points.
 *   D  MULTI_3          THREE stored vectors — head, salient-interior, tail —
 *                       MAX-pooled at query time. 3x storage, and the first arm
 *                       that can represent two different propositions in one
 *                       judgment separately.
 *   E  LEXICAL_THEN_SEMANTIC  candidates from rarest-3-ANDed lexical retrieval,
 *                       then ordered by the arm-A vector. Storage identical to
 *                       A. This is the arm that could make the 8.85M document
 *                       vectors already on disk useful without re-embedding
 *                       anything.
 *   F  ALL_CHUNKS       every chunk — the paragraph/passage control (P10) and
 *                       the CEILING. ~15.45 vectors/document measured. Nobody
 *                       proposes shipping this at 18M documents; it exists to
 *                       say how much the cheaper arms are giving up.
 *
 * A and F bracket the answer. B, C, D and E are the four ways of buying part of
 * the gap, at four different prices, and the price is reported with the quality
 * in every row — a representation that wins on nDCG and costs 15x storage has
 * not won.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY CANDIDATE RECALL IS REPORTED BEFORE RANK QUALITY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A reranker cannot recover a target that never entered the candidate set. So
 * every arm reports recall@20 / @100 / @500 FIRST. If an arm's recall@500 is
 * poor, its s@5 is not a ranking problem and no reranking work is justified
 * against it. This ordering is the discriminator P3 depends on, computed here so
 * P3 does not have to guess.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE POOL IS THE COMPETITION, NOT A SAMPLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gold: every target bound to an ADVOCATE-100 concept task — the classes that
 * measured doctrine 1/12, fact_pattern 0/10, supporting_authority 0/6. Those are
 * the failures worth explaining.
 *
 * Hard negatives: the judgments the CURRENT production dense arm actually
 * returns for those same queries. Not random documents — the ones that are
 * already beating the gold. An arm that only has to out-score random text has
 * not been tested.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LATENCY NUMBER IN HERE IS AND IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoring is EXHAUSTIVE COSINE IN MEMORY over a few thousand documents. That is
 * the right instrument for a representation comparison — it removes the index
 * as a variable — and it is NOT production latency. The number reported is
 * `scoreMsPerQuery`, labelled as such, and must never be quoted as a search
 * time. Production latency for a winning arm is a separate measurement against a
 * real index, and it belongs to whichever arm survives this.
 *
 * Embedding runs on the GPU sidecar. The CPU belongs to the ingest fleet and the
 * walk, and a lab that starves them has bought its numbers with someone else's
 * throughput.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { chunkJudgment } from '@lawmind/embed';

import { meanNdcgAtK } from './metrics.ts';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));

const GOLD = abs(process.env['ADVOCATE100'] ?? 'docs/ai/new2/ADVOCATE100.json');
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/representation-lab-v2.json');
const GPU_URL = process.env['EMBED_GPU_URL'] ?? 'http://127.0.0.1:8799/embed';

/** One vector's worth of opening text — the production recipe, byte for byte. */
const HEAD_CHARS = 4800;
/** Ceiling on SALIENT chunks. 4 is ~26% of the measured 15.45 chunks/document. */
const SALIENT_MAX = 4;
/** Hard negatives pulled per query from the live dense arm. */
const NEGATIVES_PER_QUERY = Number(process.env['REP_NEGATIVES'] ?? 60);
/** Hard ceiling on documents embedded. Six arms over the pool is the GPU bill. */
const MAX_POOL = Number(process.env['REP_MAX_POOL'] ?? 3000);

/**
 * The concept classes. Identifier classes (citation, case_number, cnr) are
 * answered by an exact route that uses no vector at all, so including them would
 * report a representation's quality on a question no representation answers.
 */
const CONCEPT_CLASSES = new Set(
  (
    process.env['REP_CLASSES'] ??
    'doctrine,fact_pattern,supporting_authority,adverse_authority,long_narrative,pasted_passage,current_law,statute'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

type Task = {
  task_id: string;
  query_class: string;
  query: string;
  targets: string[];
  expected?: string;
  proposition_family?: string;
};

type Doc = { id: string; chunks: string[] };

/**
 * BATCH SIZE AND RETRY EXIST BECAUSE THIS RUN ALREADY DIED ONCE, AT 8,094 OF 9,811.
 *
 * The sidecar is SHARED with the Tier-A walk. When the walk holds it, a 240,000-
 * character batch can sit longer than undici's default 300 s headers timeout, and
 * `fetch` throws `UND_ERR_HEADERS_TIMEOUT` — which is not the sidecar failing, it
 * is the sidecar being busy. The first run lost forty minutes of GPU work to one
 * such throw with no retry and no checkpoint.
 *
 * Two changes, both about the same fact:
 *
 *   BATCH_CHARS 60,000   a quarter of the old batch, so each request returns
 *                        inside the timeout even while the walk is mid-batch.
 *                        Slightly more HTTP round-trips; the GPU work is
 *                        identical.
 *   retry with backoff   a busy sidecar is a WAIT, not an error. Three attempts,
 *                        1s/4s/16s, and the failure is only real after all three.
 *
 * The batch is NOT cleared until the request succeeds, so a retry re-sends the
 * same texts and cannot silently drop a vector — which would misalign every
 * vector after it against its owning document and produce a benchmark that is
 * wrong in a way no metric would show.
 */
async function embedAll(texts: readonly string[], label: string): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  const BATCH_CHARS = Number(process.env['REP_BATCH_CHARS'] ?? 60_000);
  const ATTEMPTS = 3;
  let batch: string[] = [];
  let chars = 0;
  let done = 0;

  const postOnce = async (): Promise<number[][]> => {
    const res = await fetch(GPU_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: batch }),
    });
    if (!res.ok) throw new Error(`embed sidecar ${res.status} ${await res.text()}`);
    return ((await res.json()) as { vectors: number[][] }).vectors;
  };

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      try {
        const vectors = await postOnce();
        if (vectors.length !== batch.length) {
          throw new Error(`sidecar returned ${vectors.length} vectors for ${batch.length} texts`);
        }
        for (const v of vectors) out.push(Float32Array.from(v));
        done += batch.length;
        process.stdout.write(`\r  ${label}: ${done}/${texts.length} embedded   `);
        batch = [];
        chars = 0;
        return;
      } catch (error) {
        lastError = error;
        const waitMs = 1000 * 4 ** (attempt - 1);
        process.stdout.write(
          `\n  ${label}: attempt ${attempt}/${ATTEMPTS} failed (${error instanceof Error ? error.message : String(error)}), waiting ${waitMs}ms — the walk holds the GPU, this is a wait not a failure\n`,
        );
        if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw new Error(
      `${label}: ${ATTEMPTS} attempts failed — ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
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

/** Both sides are unit vectors, so the dot product IS the cosine. Not renormalised. */
function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** Mean of unit vectors, renormalised. The definition of every POOLED arm. */
function poolMean(vectors: Float32Array[]): Float32Array | null {
  if (vectors.length === 0) return null;
  const dims = vectors[0]?.length ?? 0;
  const acc = new Float32Array(dims);
  for (const v of vectors) for (let i = 0; i < dims; i += 1) acc[i] = (acc[i] ?? 0) + (v[i] ?? 0);
  let norm = 0;
  for (let i = 0; i < dims; i += 1) norm += (acc[i] ?? 0) * (acc[i] ?? 0);
  norm = Math.sqrt(norm);
  if (!Number.isFinite(norm) || norm === 0) return null;
  for (let i = 0; i < dims; i += 1) acc[i] = (acc[i] ?? 0) / norm;
  return acc;
}

/** head chunk, longest interior chunks, tail chunk — in document order. */
function salientChunks(d: Doc): string[] {
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
}

const headText = (d: Doc): string => d.chunks.join('\n\n').slice(0, HEAD_CHARS).trim();
const tailText = (d: Doc): string => {
  const joined = d.chunks.join('\n\n');
  return joined.slice(Math.max(0, joined.length - HEAD_CHARS)).trim();
};

// ── arm E: lexical candidate generation, in-pool ───────────────────────────────
const STOP = new Set(
  (
    'the a an and or of in to for on by with is are was were be been being that this these those ' +
    'it its as at from not no any all such which who whom whose he she they them his her their ' +
    'court judgment order appeal petition case section act state india union other others anr ors ' +
    'shall may can under upon after before against between whether would could should has have had'
  ).split(/\s+/),
);
const tokenise = (s: string): string[] =>
  s
    .toLowerCase()
    // ASCII only, deliberately. This tokeniser feeds arm E, whose term rarity
    // comes from `lexeme_document_frequency` — a table of ENGLISH lexemes built
    // with `to_tsvector('english', …)`, which does not stem Devanagari at all.
    // A Devanagari range here would produce tokens the df lookup can never
    // score, so every one of them would read as df 0, and "absent means rare"
    // would then select them FIRST. Cross-script retrieval is a real question
    // and it is not answered by widening a character class.
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

const quantile = (xs: number[], q: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

type ArmResult = {
  arm: string;
  vectors: number;
  documents: number;
  vectorsPerDocument: number;
  /** Characters sent to the embedder per document — the GPU bill, not the disk bill. */
  embedCharsPerDocument: number;
  /** halfvec: 1024 dims x 2 bytes, plus pgvector's per-vector overhead ignored. */
  bytesPerDocument: number;
  n: number;
  successAt1: number;
  successAt5: number;
  recallAt20: number;
  recallAt100: number;
  recallAt500: number;
  mrr: number;
  ndcgAt5: number;
  ndcgAt20: number;
  scoreMsPerQuery: number;
  /** Rank buckets, so a miss is attributable rather than merely counted. */
  buckets: Record<string, number>;
};

function bucketOf(rank: number | null): string {
  if (rank === null) return 'ABSENT_FROM_POOL_RANKING';
  if (rank === 1) return 'RANK_1';
  if (rank <= 5) return 'RANK_2_5';
  if (rank <= 20) return 'RANK_6_20';
  if (rank <= 100) return 'RANK_21_100';
  if (rank <= 500) return 'RANK_101_500';
  return 'RANK_BEYOND_500';
}

function score(
  arm: string,
  ranks: (number | null)[],
  meta: {
    vectors: number;
    documents: number;
    embedChars: number;
    scoreMs: number;
  },
): ArmResult {
  const n = ranks.length;
  const at = (k: number): number => ranks.filter((r) => r !== null && r <= k).length / n;
  const buckets: Record<string, number> = {};
  for (const r of ranks) {
    const b = bucketOf(r);
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  return {
    arm,
    vectors: meta.vectors,
    documents: meta.documents,
    vectorsPerDocument: meta.vectors / meta.documents,
    embedCharsPerDocument: meta.embedChars / meta.documents,
    bytesPerDocument: (meta.vectors / meta.documents) * 1024 * 2,
    n,
    successAt1: at(1),
    successAt5: at(5),
    recallAt20: at(20),
    recallAt100: at(100),
    recallAt500: at(500),
    mrr: ranks.reduce((a: number, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt5: meanNdcgAtK(ranks, 5),
    ndcgAt20: meanNdcgAtK(ranks, 20),
    scoreMsPerQuery: meta.scoreMs / n,
    buckets,
  };
}

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const goldFile = JSON.parse(readFileSync(GOLD, 'utf8')) as { tasks: Task[] };
  const tasks = goldFile.tasks.filter(
    (t) => CONCEPT_CLASSES.has(t.query_class) && t.targets.length > 0 && t.expected !== 'REFUSE',
  );
  console.log(`REPRESENTATION_LAB_V2`);
  console.log(`  ${tasks.length} concept tasks over classes: ${[...CONCEPT_CLASSES].join(', ')}`);

  const sql = postgres(url, {
    ssl: sslFor(url),
    max: 2,
    onnotice: () => {},
    connection: { statement_timeout: 20_000 },
  });

  // ── pool: gold + hard negatives from the LIVE dense arm ────────────────────
  const goldIds = new Set<string>();
  for (const t of tasks) for (const id of t.targets) goldIds.add(id);
  console.log(`  gold targets: ${goldIds.size}`);

  /**
   * QUERIES ARE EMBEDDED BEFORE THE POOL IS DRAWN, because the negatives are
   * drawn WITH the query vector.
   *
   * The first version drew them lexically, reasoning that arm A's own nearest
   * neighbours would "rig the comparison". That reasoning had the sign backwards
   * and the instrument was worse for it: a `to_tsvector` over `left(full_text,
   * 20000)` has no index behind it, timed out on most tasks, and left a pool of
   * 260 documents in which `recall@500` was 100% for every arm by construction —
   * a metric that cannot discriminate is not a conservative metric, it is a
   * broken one.
   *
   * Drawing negatives from arm A's OWN index is the CONSERVATIVE direction, not
   * the rigged one. Every negative is a document the production representation
   * already ranks above the gold. If a challenger still beats arm A on a pool
   * built out of arm A's best answers, the result is stronger than it would be
   * against random text — and if it loses, it deserved to.
   */
  const queryVectorsPre = await embedAll(
    tasks.map((t) => t.query),
    'queries',
  );

  const negatives = new Set<string>();
  console.log(
    "  drawing hard negatives — arm A's own nearest neighbours, from new1_probe_half_250k …",
  );
  for (let ti = 0; ti < tasks.length; ti += 1) {
    const t = tasks[ti];
    const qv = queryVectorsPre[ti];
    if (!t || !qv) continue;
    try {
      const literal = `[${Array.from(qv).join(',')}]`;
      // `SET LOCAL` in its own statement, inside a transaction. The single-template
      // form this replaced threw on EVERY call and the throw was swallowed below,
      // so this lab drew no hard negatives at all. See the header.
      const rows = (await sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL hnsw.ef_search = 200');
        return tx<{ judgment_id: string }[]>`
          SELECT judgment_id
          FROM new1_probe_half_250k
          ORDER BY embedding <=> ${literal}::halfvec
          LIMIT ${NEGATIVES_PER_QUERY}
        `;
      })) as unknown as { judgment_id: string }[];
      for (const r of rows) if (!goldIds.has(r.judgment_id)) negatives.add(r.judgment_id);
    } catch (error) {
      console.log(
        `\n  negatives for ${t.task_id} skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.stdout.write(
      `\r  negatives so far: ${negatives.size} (task ${ti + 1}/${tasks.length})   `,
    );
  }
  process.stdout.write('\n');

  /**
   * A bounded random fill, so the pool is not made ENTIRELY of one query's
   * neighbourhood. Without it every document in the pool is topically close to
   * some gold, which flatters every arm's recall and makes rank buckets past the
   * top 100 meaningless.
   */
  const fill = Math.max(0, MAX_POOL - goldIds.size - negatives.size);
  if (fill > 0) {
    try {
      const rows = await sql<{ judgment_id: string }[]>`
        SELECT judgment_id FROM new1_probe_half_250k
        TABLESAMPLE SYSTEM (2) LIMIT ${fill}
      `;
      for (const r of rows) if (!goldIds.has(r.judgment_id)) negatives.add(r.judgment_id);
    } catch (error) {
      console.log(
        `  random fill skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const pool = [...goldIds, ...[...negatives].slice(0, Math.max(0, MAX_POOL - goldIds.size))];
  console.log(
    `  pool: ${pool.length} documents (${goldIds.size} gold + ${pool.length - goldIds.size} negatives)`,
  );

  // ── read text once ─────────────────────────────────────────────────────────
  const docs: Doc[] = [];
  const PAGE = 100;
  let empty = 0;
  for (let i = 0; i < pool.length; i += PAGE) {
    const ids = pool.slice(i, i + PAGE);
    const rows = await sql<{ id: string; full_text: string | null }[]>`
      SELECT id, full_text FROM judgments WHERE id = ANY(${ids}::uuid[])
    `;
    for (const r of rows) {
      if (!r.full_text || r.full_text.trim().length === 0) {
        empty += 1;
        continue;
      }
      docs.push({ id: r.id, chunks: chunkJudgment(r.full_text).map((c) => c.text) });
    }
    process.stdout.write(`\r  read ${docs.length}/${pool.length} judgments   `);
  }
  process.stdout.write('\n');
  await sql.end({ timeout: 5 });
  console.log(`  ${docs.length} with text, ${empty} empty`);

  const have = new Set(docs.map((d) => d.id));
  /** Gold that is not in the pool cannot be found by ANY arm. Declared, never scored as a miss. */
  const scorable = tasks.filter((t) => t.targets.some((id) => have.has(id)));
  console.log(`  scorable tasks: ${scorable.length} of ${tasks.length} (gold present in pool)`);
  console.log('  CONDITIONAL_RECALL: every number below is over gold that is IN the pool.\n');

  // ── queries embedded ONCE, shared by every arm ─────────────────────────────
  // Reused from the pool-drawing pass rather than re-embedded: the comparison is
  // of the DOCUMENT side, and a second embedding pass would let query-side
  // nondeterminism leak into the difference between arms.
  const byTaskId = new Map(tasks.map((t, i) => [t.task_id, queryVectorsPre[i]]));
  const queryVectors = scorable.map((t) => byTaskId.get(t.task_id));

  // ── chunk vectors, embedded ONCE and reused by every vector arm ────────────
  const chunkTexts: string[] = [];
  const chunkOwner: number[] = [];
  for (let di = 0; di < docs.length; di += 1) {
    for (const c of docs[di]?.chunks ?? []) {
      chunkTexts.push(c);
      chunkOwner.push(di);
    }
  }
  console.log(
    `chunks: ${chunkTexts.length} over ${docs.length} documents (${(chunkTexts.length / docs.length).toFixed(2)}/doc)`,
  );
  const chunkVectors = await embedAll(chunkTexts, 'chunks');
  const byDoc: Float32Array[][] = docs.map(() => []);
  for (let i = 0; i < chunkVectors.length; i += 1) {
    const owner = chunkOwner[i];
    const v = chunkVectors[i];
    if (owner !== undefined && v) byDoc[owner]?.push(v);
  }

  // HEAD and TAIL are their own texts (a 4,800-char window is not a chunk
  // boundary), so they are embedded separately rather than pooled from chunks.
  const headVectors = await embedAll(docs.map(headText), 'heads');
  const tailVectors = await embedAll(docs.map(tailText), 'tails');

  const salientIdx: number[][] = docs.map((d) => {
    const want = new Set(salientChunks(d));
    const idx: number[] = [];
    d.chunks.forEach((c, i) => {
      if (want.has(c)) idx.push(i);
    });
    return idx;
  });

  // ── arms as (vectors per document) ────────────────────────────────────────
  type Arm = {
    name: string;
    vectors: (di: number) => Float32Array[];
    embedChars: (di: number) => number;
  };
  const arms: Arm[] = [
    {
      name: 'A_HEAD_4800',
      vectors: (di) => (headVectors[di] ? [headVectors[di] as Float32Array] : []),
      embedChars: (di) => headText(docs[di] as Doc).length,
    },
    {
      name: 'B_POOLED_ALL',
      vectors: (di) => {
        const p = poolMean(byDoc[di] ?? []);
        return p ? [p] : [];
      },
      embedChars: (di) => (docs[di]?.chunks ?? []).reduce((a, c) => a + c.length, 0),
    },
    {
      name: 'C_POOLED_SALIENT',
      vectors: (di) => {
        const picks = (salientIdx[di] ?? [])
          .map((i) => byDoc[di]?.[i])
          .filter((v): v is Float32Array => !!v);
        const p = poolMean(picks);
        return p ? [p] : [];
      },
      embedChars: (di) => salientChunks(docs[di] as Doc).reduce((a, c) => a + c.length, 0),
    },
    {
      name: 'D_MULTI_3',
      vectors: (di) => {
        const head = headVectors[di];
        const tail = tailVectors[di];
        const picks = (salientIdx[di] ?? [])
          .map((i) => byDoc[di]?.[i])
          .filter((v): v is Float32Array => !!v);
        const mid = poolMean(picks.slice(1, -1).length > 0 ? picks.slice(1, -1) : picks);
        return [head, mid, tail].filter((v): v is Float32Array => !!v);
      },
      embedChars: (di) =>
        headText(docs[di] as Doc).length +
        tailText(docs[di] as Doc).length +
        salientChunks(docs[di] as Doc).reduce((a, c) => a + c.length, 0),
    },
    {
      name: 'F_ALL_CHUNKS',
      vectors: (di) => byDoc[di] ?? [],
      embedChars: (di) => (docs[di]?.chunks ?? []).reduce((a, c) => a + c.length, 0),
    },
  ];

  const results: ArmResult[] = [];
  const perTask: Record<string, Record<string, number | null>> = {};

  for (const arm of arms) {
    const flat: { v: Float32Array; di: number }[] = [];
    let embedChars = 0;
    for (let di = 0; di < docs.length; di += 1) {
      for (const v of arm.vectors(di)) flat.push({ v, di });
      embedChars += arm.embedChars(di);
    }

    const t0 = Date.now();
    const ranks: (number | null)[] = [];
    for (let qi = 0; qi < scorable.length; qi += 1) {
      const qv = queryVectors[qi];
      const task = scorable[qi];
      if (!qv || !task) {
        ranks.push(null);
        continue;
      }
      // MAX pooling to the document, exactly as retrieve.ts collapses chunk hits.
      const best = new Float32Array(docs.length).fill(-2);
      for (const { v, di } of flat) {
        const s = cosine(qv, v);
        if (s > (best[di] ?? -2)) best[di] = s;
      }
      const order = Array.from(best.keys()).sort((a, b) => (best[b] ?? -2) - (best[a] ?? -2));
      const goldSet = new Set(task.targets.filter((id) => have.has(id)));
      let rank: number | null = null;
      for (let i = 0; i < order.length; i += 1) {
        const di = order[i];
        if (di !== undefined && goldSet.has(docs[di]?.id ?? '')) {
          rank = i + 1;
          break;
        }
      }
      ranks.push(rank);
      (perTask[task.task_id] ??= {})[arm.name] = rank;
    }
    const r = score(arm.name, ranks, {
      vectors: flat.length,
      documents: docs.length,
      embedChars,
      scoreMs: Date.now() - t0,
    });
    results.push(r);
    console.log(
      `${arm.name.padEnd(18)} ${r.vectorsPerDocument.toFixed(2).padStart(6)} v/doc  ` +
        `s@1 ${pct(r.successAt1).padStart(6)}  s@5 ${pct(r.successAt5).padStart(6)}  ` +
        `r@20 ${pct(r.recallAt20).padStart(6)}  r@100 ${pct(r.recallAt100).padStart(6)}  r@500 ${pct(r.recallAt500).padStart(6)}  ` +
        `nDCG@20 ${r.ndcgAt20.toFixed(3)}  ${(r.bytesPerDocument / 1024).toFixed(1)} KiB/doc`,
    );
  }

  // ── arm E: lexical candidates, then arm-A ordering ────────────────────────
  // Built after the vector arms because it REUSES arm A's vectors — the point of
  // the arm is that it costs no extra storage over what is already on disk.
  const docTokens = docs.map((d) => new Set(tokenise(d.chunks.join(' ').slice(0, 60_000))));

  /**
   * RARITY COMES FROM THE CORPUS, NOT FROM THE POOL. This is the whole arm.
   *
   * The first version computed document frequency over the pool itself, and it
   * produced a candidate set with a MEDIAN SIZE OF 1 — because the rarest term
   * in a 260-document pool is, by definition, a term in one document, and ANDing
   * three of those selects nothing. The arm scored 37.8% recall@500 and looked
   * like a refuted hypothesis when it was really an instrument reading itself.
   *
   * `lexeme_document_frequency` is the same table `retrieve.ts` reads to pick
   * sparse terms, so this arm now selects the terms PRODUCTION would select.
   * **Absent means rare**, the same direction the sparse arm chose and for the
   * same reason: a word nobody measured is far likelier to be a party's name
   * than a word the corpus is saturated with.
   */
  const df = new Map<string, number>();
  {
    const wanted = [...new Set(scorable.flatMap((t) => tokenise(t.query)))];
    const sql2 = postgres(url, {
      ssl: sslFor(url),
      max: 1,
      onnotice: () => {},
      connection: { statement_timeout: 30_000 },
    });
    try {
      const rows = await sql2<{ word: string; document_count: string }[]>`
        WITH w(word) AS (SELECT unnest(${wanted}::text[]))
        SELECT w.word, coalesce(l.document_count, 0)::text AS document_count
        FROM w
        LEFT JOIN lexeme_document_frequency l
          ON l.lexeme = (SELECT lexeme FROM unnest(to_tsvector('english', w.word)) AS lexeme LIMIT 1)
      `;
      for (const r of rows) df.set(r.word, Number(r.document_count));
    } catch (error) {
      console.log(
        `  corpus df lookup failed, arm E falls back to in-pool df: ${error instanceof Error ? error.message : String(error)}`,
      );
      for (const set of docTokens) for (const w of set) df.set(w, (df.get(w) ?? 0) + 1);
    } finally {
      await sql2.end({ timeout: 5 });
    }
  }

  {
    const t0 = Date.now();
    const ranks: (number | null)[] = [];
    const candidateSizes: number[] = [];
    for (let qi = 0; qi < scorable.length; qi += 1) {
      const task = scorable[qi];
      const qv = queryVectors[qi];
      if (!task || !qv) {
        ranks.push(null);
        continue;
      }
      // rarest-3, ANDed — the arm measured at 2.1x recall and 18x faster p50
      // than the production OR pass (sparse-arms.json, arm D).
      const words = [...new Set(tokenise(task.query))]
        .sort((a, b) => (df.get(a) ?? 0) - (df.get(b) ?? 0))
        .slice(0, 3);
      const cands: number[] = [];
      for (let di = 0; di < docs.length; di += 1) {
        const set = docTokens[di];
        if (set && words.every((w) => set.has(w))) cands.push(di);
      }
      // Documented fallback: an empty AND falls back to the rarest TWO, then the
      // rarest one. An empty candidate set is a product failure, not a zero to
      // average away, and it is counted in `emptyCandidateSets`.
      if (cands.length === 0 && words.length >= 2) {
        const two = words.slice(0, 2);
        for (let di = 0; di < docs.length; di += 1) {
          const set = docTokens[di];
          if (set && two.every((w) => set.has(w))) cands.push(di);
        }
      }
      if (cands.length === 0 && words.length >= 1) {
        const one = words[0] as string;
        for (let di = 0; di < docs.length; di += 1) if (docTokens[di]?.has(one)) cands.push(di);
      }
      candidateSizes.push(cands.length);
      const scored = cands
        .map((di) => ({
          di,
          s: cosine(qv, (headVectors[di] ?? new Float32Array(1024)) as Float32Array),
        }))
        .sort((a, b) => b.s - a.s);
      const goldSet = new Set(task.targets.filter((id) => have.has(id)));
      let rank: number | null = null;
      for (let i = 0; i < scored.length; i += 1) {
        const di = scored[i]?.di;
        if (di !== undefined && goldSet.has(docs[di]?.id ?? '')) {
          rank = i + 1;
          break;
        }
      }
      ranks.push(rank);
      (perTask[task.task_id] ??= {})['E_LEXICAL_THEN_SEMANTIC'] = rank;
    }
    const r = score('E_LEXICAL_THEN_SEMANTIC', ranks, {
      vectors: docs.length,
      documents: docs.length,
      embedChars: docs.reduce((a, d) => a + headText(d).length, 0),
      scoreMs: Date.now() - t0,
    });
    results.push(r);
    console.log(
      `${'E_LEXICAL_THEN_SEM'.padEnd(18)} ${r.vectorsPerDocument.toFixed(2).padStart(6)} v/doc  ` +
        `s@1 ${pct(r.successAt1).padStart(6)}  s@5 ${pct(r.successAt5).padStart(6)}  ` +
        `r@20 ${pct(r.recallAt20).padStart(6)}  r@100 ${pct(r.recallAt100).padStart(6)}  r@500 ${pct(r.recallAt500).padStart(6)}  ` +
        `nDCG@20 ${r.ndcgAt20.toFixed(3)}  candidates p50 ${quantile(candidateSizes, 0.5)}`,
    );
    (results[results.length - 1] as ArmResult & { candidates?: unknown }).candidates = {
      p50: quantile(candidateSizes, 0.5),
      p95: quantile(candidateSizes, 0.95),
      max: Math.max(0, ...candidateSizes),
      emptyCandidateSets: candidateSizes.filter((c) => c === 0).length,
    };
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        kind: 'new1_representation_lab_v2',
        generatedAt: new Date().toISOString(),
        goldSetVersion: (goldFile as { gold_set_version?: string }).gold_set_version ?? null,
        classes: [...CONCEPT_CLASSES],
        recallBasis: 'CONDITIONAL_RECALL — scored only over gold present in the pool',
        pool: {
          documents: docs.length,
          gold: goldIds.size,
          hardNegatives: docs.length - [...goldIds].filter((id) => have.has(id)).length,
          tasks: tasks.length,
          scorableTasks: scorable.length,
        },
        latencyNote:
          'scoreMsPerQuery is EXHAUSTIVE in-memory cosine over the pool. It is NOT production latency and must not be quoted as a search time.',
        arms: results,
        perTask,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
