/**
 * NEW1 — REPRESENTATION LAB V3. Scale, provenance, and a confidence interval.
 *
 *   pnpm --filter @lawmind/harness rep:lab3
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT V2 ALREADY SETTLED, AND THE PREMISE THIS FILE CORRECTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The round brief asks NEW1 to re-run the representation experiment on
 * "independently phrased ADVOCATE-style questions", on the stated ground that
 * the V2 result "used lifted/verbatim target sentences".
 *
 * THAT PREMISE IS WRONG, and the correction matters more than the re-run would
 * have. `representation-lab-v2-cli.ts` embeds `task.query` from
 * `docs/ai/new2/ADVOCATE100.json`, and those queries are AUTHORED FROM THE LEGAL
 * QUESTION with a leakage guard: the binder measures the longest contiguous
 * shared word run between query and target text and fails a concept task above
 * SIX words. The longest run observed anywhere in the set is 8, and only inside
 * identifier classes where the run IS the citation. V2 also excluded the
 * identifier classes outright. So POOLED_ALL's 73.3% s@5 against HEAD_4800's
 * 20.0% was ALREADY measured on posed advocate questions.
 *
 * The sets that ARE lifted are different files, and they say so themselves:
 * `new3-uncited-authority-gold-v2.json`, `new3-noncitation-gold.json` and
 * `new3-semantic-expansion-gold-v2.json` each record that the query IS an
 * `own_text_span` substring of the target and is therefore "an upper bound, not
 * a paraphrase-robustness measurement".
 *
 * So this lab does not re-litigate the phrasing. It measures the gap directly —
 * the SAME arms, the SAME documents, scored twice, once with posed queries and
 * once with lifted ones — so that "how much does a lifted-sentence benchmark
 * overstate?" stops being an argument and becomes a number.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE THINGS THAT ACTUALLY BLOCK ADOPTING POOLED_ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. EFFECTIVE n. V2's 45 tasks are carried by 20 distinct gold documents.
 *      No confidence interval was reported. A 73.3% over 45 paired observations
 *      needs one before anyone re-embeds 8.85M documents on it.
 *
 *   2. POOL SCALE. V2 scored in a 2,500-document pool. Arm A fell from 37.8%
 *      (260 documents) to 20.0% (2,500) while arm B held at 73.3% — which is
 *      the single most decision-relevant property in the whole result, and it is
 *      measured at two points. Two points do not have a shape. This runs THREE
 *      nested pools and reports the curve.
 *
 *   3. WHAT THE POOL HIDES. V2 force-includes every gold document, so
 *      NOT_IN_INDEX is invisible by construction. In production, 10 of 12
 *      doctrine targets and 10 of 10 fact_pattern targets have NO document
 *      vector at all. An arm comparison that cannot see that is a ranking
 *      result being read as a retrieval result.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE POOL IS NESTED, WHICH IS WHY THE SCALE CURVE IS PAIRED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pool order is: gold, then hard negatives (arm A's own nearest neighbours for
 * the posed queries), then a random fill drawn from `new1_doc_vector_stage` —
 * the real staged population, not a synthetic sample. Every pool size is a
 * PREFIX of the next, so growing the pool only ever ADDS distractors and never
 * swaps them. The difference between two pool sizes is therefore attributable
 * to the added documents and to nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARM A IS READ FROM PRODUCTION, NOT RE-EMBEDDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * V2 re-embedded the HEAD:4800 recipe to build arm A. This reads the actual
 * stored vector out of `new1_doc_vector_stage` wherever one exists, which is
 * both cheaper and stricter: it tests the vectors LawMind would really serve,
 * including whatever recipe drift has accumulated over 1.09M rows. A gold
 * document with no stored vector is not quietly re-embedded into the arm — it
 * is counted as NOT_IN_INDEX first, and only then embedded so the ranking
 * comparison has something to rank.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCORING IS STREAMED, SO NOTHING LARGE IS EVER HELD OR CHECKPOINTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The queries are fixed before the first document is read, so a document's
 * similarity to every query can be computed and DISCARDED as soon as it is
 * embedded. Only a per-query top-500 heap survives. At 25,000 documents the
 * alternative — holding every chunk vector — is about 420 MB of Float32 and a
 * checkpoint file to match; this holds a few megabytes and cannot lose work to
 * a teardown, which is the failure mode this lane has already paid for once.
 *
 * A snapshot of the heaps is taken at each nested pool boundary. That is the
 * whole mechanism behind the scale curve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LATENCY NUMBER IN HERE IS AND IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoring is exhaustive cosine in memory. That is the right instrument for a
 * representation comparison — it removes the index as a variable — and it is
 * NOT production latency. Nothing in this artefact may be quoted as a search
 * time.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { chunkJudgment } from '@lawmind/embed';

import { meanNdcgAtK } from './metrics.ts';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));

const POSED_GOLD = abs(process.env['ADVOCATE100'] ?? 'docs/ai/new2/ADVOCATE100.json');
const LIFTED_GOLD = (
  process.env['LIFTED_GOLD'] ??
  'docs/ai/new3-uncited-authority-gold-v2.json,docs/ai/new3-noncitation-gold.json,docs/ai/new3-semantic-expansion-gold-v2.json'
)
  .split(',')
  .map((s) => abs(s.trim()))
  .filter(Boolean);
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/representation-lab-v3.json');
const GPU_URL = process.env['EMBED_GPU_URL'] ?? 'http://127.0.0.1:8799/embed';

/** The production recipe, byte for byte, for the fallback embed of an unstaged gold. */
const HEAD_CHARS = 4800;
const SALIENT_MAX = 4;
const NEGATIVES_PER_QUERY = Number(process.env['REP_NEGATIVES'] ?? 60);
/** Nested, ascending. Every level is a prefix of the next. */
const POOL_SIZES = (process.env['REP_POOL_SIZES'] ?? '2500,7500,25000')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);
const MAX_POOL = POOL_SIZES[POOL_SIZES.length - 1] ?? 25_000;
/** How many lifted-gold tasks to draw. Bounded: they exist to size a GAP, not to be the study. */
const LIFTED_TASKS = Number(process.env['REP_LIFTED_TASKS'] ?? 250);
/** Deepest rank any arm is asked about. Everything past this is BEYOND_POOL_DEPTH. */
const TOP_K = 500;
const BOOTSTRAP = Number(process.env['REP_BOOTSTRAP'] ?? 2000);

/**
 * Identifier classes are answered by an exact route that uses no vector at all,
 * so scoring a representation on them reports its quality on a question no
 * representation answers. Same filter as V2, deliberately unchanged.
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

type Provenance = 'POSED' | 'LIFTED';

type Task = {
  taskId: string;
  provenance: Provenance;
  queryClass: string;
  query: string;
  targets: string[];
};

type Doc = { id: string; chunks: string[] };

const ARMS = ['A_HEAD_4800_PRODUCTION', 'B_POOLED_ALL', 'C_POOLED_SALIENT', 'D_MULTI_3', 'F_ALL_CHUNKS'] as const;
type Arm = (typeof ARMS)[number];

// ── GPU sidecar ───────────────────────────────────────────────────────────────

/**
 * Batched, retried, and the batch is NOT cleared until the request succeeds.
 *
 * The sidecar is shared with the Tier-A walk. A busy sidecar is a WAIT, not an
 * error — V2 lost forty minutes of GPU work to one `UND_ERR_HEADERS_TIMEOUT`
 * with no retry. A retry that re-sent a partial batch would misalign every
 * vector after it against its owning document and produce a benchmark wrong in
 * a way no metric would show, so the batch is only dropped on success.
 */
async function embedAll(texts: readonly string[], label: string): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  const BATCH_CHARS = Number(process.env['REP_BATCH_CHARS'] ?? 60_000);
  const ATTEMPTS = 4;
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
        if (texts.length > 200) process.stdout.write(`\r  ${label}: ${done}/${texts.length} embedded   `);
        batch = [];
        chars = 0;
        return;
      } catch (error) {
        lastError = error;
        const waitMs = 1000 * 4 ** (attempt - 1);
        process.stdout.write(
          `\n  ${label}: attempt ${attempt}/${ATTEMPTS} failed (${error instanceof Error ? error.message : String(error)}), waiting ${waitMs}ms — a busy sidecar is a wait, not a failure\n`,
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
  if (texts.length > 200) process.stdout.write('\n');
  return out;
}

// ── vector helpers ────────────────────────────────────────────────────────────

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

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/**
 * Parse pgvector's text form. `new1_doc_vector_stage.embedding` comes back as
 * '[0.1,0.2,…]' over the wire; the driver has no vector type.
 */
function parseVector(raw: unknown): Float32Array | null {
  if (raw === null || raw === undefined) return null;
  const s = typeof raw === 'string' ? raw : String(raw);
  const body = s.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (body.length === 0) return null;
  const parts = body.split(',');
  const v = new Float32Array(parts.length);
  for (let i = 0; i < parts.length; i += 1) v[i] = Number(parts[i]);
  return v;
}

// ── streamed top-K, one heap per (arm, query) ─────────────────────────────────

/**
 * Fixed-capacity ascending-by-score keeper. Small enough that an array with a
 * linear insert beats a real heap at K=500 and one insert per document.
 */
class TopK {
  private readonly cap: number;
  /** scores[i] ascending; ids[i] parallel. The worst survivor is index 0. */
  private scores: number[] = [];
  private ids: string[] = [];
  constructor(cap: number) {
    this.cap = cap;
  }
  offer(id: string, score: number): void {
    if (this.scores.length >= this.cap && score <= (this.scores[0] ?? -Infinity)) return;
    let lo = 0;
    let hi = this.scores.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.scores[mid] ?? -Infinity) < score) lo = mid + 1;
      else hi = mid;
    }
    this.scores.splice(lo, 0, score);
    this.ids.splice(lo, 0, id);
    if (this.scores.length > this.cap) {
      this.scores.shift();
      this.ids.shift();
    }
  }
  /** 1-based rank of the best-ranked member of `targets`, or null if none present. */
  rankOfAny(targets: ReadonlySet<string>): number | null {
    for (let i = this.ids.length - 1, r = 1; i >= 0; i -= 1, r += 1) {
      const id = this.ids[i];
      if (id !== undefined && targets.has(id)) return r;
    }
    return null;
  }
  snapshotRank(targets: ReadonlySet<string>): number | null {
    return this.rankOfAny(targets);
  }
}

// ── statistics ────────────────────────────────────────────────────────────────

/**
 * Bootstrap CI over TASKS, which is the unit that was sampled.
 *
 * Not over documents and not over arms: the arms are paired on the same tasks,
 * so the interval that matters for "is B better than A" is the interval on the
 * PAIRED DIFFERENCE, reported alongside each arm's own interval.
 */
function bootstrapCi(values: readonly number[], iterations: number): { lo: number; hi: number } {
  const n = values.length;
  if (n === 0) return { lo: 0, hi: 0 };
  const means: number[] = [];
  for (let b = 0; b < iterations; b += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += values[Math.floor(Math.random() * n)] ?? 0;
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return {
    lo: means[Math.floor(0.025 * iterations)] ?? 0,
    hi: means[Math.min(iterations - 1, Math.floor(0.975 * iterations))] ?? 0,
  };
}

type ScoreBlock = {
  arm: Arm;
  provenance: Provenance;
  poolSize: number;
  n: number;
  effectiveDistinctTargets: number;
  successAt1: number;
  successAt5: number;
  successAt5Ci: { lo: number; hi: number };
  recallAt20: number;
  recallAt100: number;
  recallAt500: number;
  mrr: number;
  ndcgAt20: number;
  failures: Record<string, number>;
};

function summarise(
  arm: Arm,
  provenance: Provenance,
  poolSize: number,
  tasks: readonly Task[],
  ranks: readonly (number | null)[],
  notInIndex: ReadonlySet<string>,
  goldIssue: ReadonlySet<string>,
): ScoreBlock {
  const hitAt = (k: number): number[] => ranks.map((r) => (r !== null && r <= k ? 1 : 0));
  const s1 = hitAt(1);
  const s5 = hitAt(5);
  const distinct = new Set<string>();
  for (const t of tasks) for (const id of t.targets) distinct.add(id);

  const failures: Record<string, number> = {
    NOT_IN_INDEX: 0,
    INDEXED_NOT_IN_CANDIDATES: 0,
    CANDIDATE_BADLY_RANKED: 0,
    GOLD_IDENTITY_ISSUE: 0,
    SUCCEEDED_AT_5: 0,
  };
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    const r = ranks[i] ?? null;
    if (!t) continue;
    if (t.targets.every((id) => goldIssue.has(id))) failures['GOLD_IDENTITY_ISSUE'] = (failures['GOLD_IDENTITY_ISSUE'] ?? 0) + 1;
    else if (r !== null && r <= 5) failures['SUCCEEDED_AT_5'] = (failures['SUCCEEDED_AT_5'] ?? 0) + 1;
    else if (t.targets.every((id) => notInIndex.has(id))) failures['NOT_IN_INDEX'] = (failures['NOT_IN_INDEX'] ?? 0) + 1;
    else if (r === null || r > TOP_K) failures['INDEXED_NOT_IN_CANDIDATES'] = (failures['INDEXED_NOT_IN_CANDIDATES'] ?? 0) + 1;
    else failures['CANDIDATE_BADLY_RANKED'] = (failures['CANDIDATE_BADLY_RANKED'] ?? 0) + 1;
  }

  const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    arm,
    provenance,
    poolSize,
    n: tasks.length,
    effectiveDistinctTargets: distinct.size,
    successAt1: mean(s1),
    successAt5: mean(s5),
    successAt5Ci: bootstrapCi(s5, BOOTSTRAP),
    recallAt20: mean(hitAt(20)),
    recallAt100: mean(hitAt(100)),
    recallAt500: mean(hitAt(500)),
    mrr: mean(ranks.map((r) => (r === null ? 0 : 1 / r))),
    ndcgAt20: meanNdcgAtK([...ranks], 20),
    failures,
  };
}

// ── gold loading ──────────────────────────────────────────────────────────────

function loadPosed(): Task[] {
  const gold = JSON.parse(readFileSync(POSED_GOLD, 'utf8')) as {
    tasks: { task_id: string; query_class: string; query: string; targets: string[]; expected?: string }[];
  };
  return gold.tasks
    .filter((t) => CONCEPT_CLASSES.has(t.query_class) && t.targets.length > 0 && t.expected !== 'REFUSE')
    .map((t) => ({
      taskId: t.task_id,
      provenance: 'POSED' as const,
      queryClass: t.query_class,
      query: t.query,
      targets: t.targets,
    }));
}

/**
 * The lifted sets, drawn deterministically.
 *
 * Every row here has a query that IS a substring of its own target — the files
 * say so in their own `caveat` field. They are loaded ONLY to size the overstatement
 * a lifted benchmark produces, never as evidence of advocate-task performance,
 * and every number derived from them carries `provenance: LIFTED`.
 */
function loadLifted(): Task[] {
  const out: Task[] = [];
  for (const file of LIFTED_GOLD) {
    if (!existsSync(file)) {
      console.log(`  lifted gold missing, skipped: ${file}`);
      continue;
    }
    const j = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const rows = (j['cases'] ?? []) as {
      id?: string;
      query_id?: string;
      query?: string;
      authority_id?: string;
      queryClass?: string;
      queryType?: string;
    }[];
    for (const r of rows) {
      const id = r.query_id ?? r.id;
      if (!id || !r.query || !r.authority_id) continue;
      out.push({
        taskId: id,
        provenance: 'LIFTED',
        queryClass: r.queryClass ?? r.queryType ?? 'lifted',
        query: r.query,
        targets: [r.authority_id],
      });
    }
  }
  // Deterministic stride rather than a random sample, so a re-run draws the same
  // tasks and two runs of this file are comparable to each other.
  if (out.length <= LIFTED_TASKS) return out;
  const stride = out.length / LIFTED_TASKS;
  const picked: Task[] = [];
  for (let i = 0; i < LIFTED_TASKS; i += 1) {
    const t = out[Math.floor(i * stride)];
    if (t) picked.push(t);
  }
  return picked;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const posed = loadPosed();
  const lifted = loadLifted();
  const tasks = [...posed, ...lifted];
  console.log('REPRESENTATION_LAB_V3');
  console.log(`  ${posed.length} POSED tasks (ADVOCATE-100 concept classes, leakage guard <= 6 shared words)`);
  console.log(`  ${lifted.length} LIFTED tasks (own_text_span queries — an UPPER BOUND, loaded to size the gap)`);
  console.log(`  pools: ${POOL_SIZES.join(' -> ')} (nested; each is a prefix of the next)`);

  const sql = postgres(url, {
    ssl: sslFor(url),
    max: 2,
    onnotice: () => {},
    connection: { statement_timeout: 60_000 },
  });

  // ── queries embedded FIRST: the hard negatives are drawn with the query vector
  const queryVectors = await embedAll(
    tasks.map((t) => t.query),
    'queries',
  );

  const goldIds = new Set<string>();
  for (const t of tasks) for (const id of t.targets) goldIds.add(id);
  console.log(`  gold targets: ${goldIds.size} distinct documents`);

  /**
   * WHICH GOLD IS ACTUALLY IN PRODUCTION. This is measured BEFORE the pool is
   * built, because the pool force-includes gold and would otherwise erase the
   * answer. It is the NOT_IN_INDEX class, and in this lane it has already been
   * the dominant failure mode.
   */
  const stagedGold = new Set<string>();
  {
    const ids = [...goldIds];
    for (let i = 0; i < ids.length; i += 500) {
      const rows = await sql<{ judgment_id: string }[]>`
        SELECT judgment_id FROM new1_doc_vector_stage WHERE judgment_id = ANY(${ids.slice(i, i + 500)}::uuid[])
      `;
      for (const r of rows) stagedGold.add(r.judgment_id);
    }
  }
  const notInIndex = new Set([...goldIds].filter((id) => !stagedGold.has(id)));
  console.log(
    `  gold WITH a production vector: ${stagedGold.size}/${goldIds.size}; NOT_IN_INDEX: ${notInIndex.size} (${pct(notInIndex.size / Math.max(1, goldIds.size))})`,
  );

  // ── hard negatives: arm A's own nearest neighbours, POSED queries only ──────
  // Drawing them for the lifted tasks too would let the lifted set shape the
  // competition the posed set is judged in, and the posed set is the one that
  // decides anything.
  const negatives = new Set<string>();
  let negativeDraws = 0;
  let negativeDrawFailures = 0;
  console.log("  drawing hard negatives — arm A's own nearest neighbours, from new1_probe_half_250k …");
  for (let ti = 0; ti < tasks.length; ti += 1) {
    const t = tasks[ti];
    const qv = queryVectors[ti];
    if (!t || !qv || t.provenance !== 'POSED') continue;
    try {
      const literal = `[${Array.from(qv).join(',')}]`;
      /**
       * THE `SET LOCAL` GOES IN ITS OWN STATEMENT, INSIDE A TRANSACTION, AND
       * THAT IS A CORRECTION TO V2 RATHER THAN A STYLE PREFERENCE.
       *
       * V2 wrote `SET LOCAL hnsw.ef_search = 200; SELECT …` as ONE tagged
       * template with bound parameters. postgres.js sends a parameterised query
       * as a prepared statement, and PostgreSQL refuses multiple commands in
       * one: every call threw `cannot insert multiple commands into a prepared
       * statement`, was swallowed by this same catch, and printed one skip line
       * per task into a console nobody kept.
       *
       * So V2 drew ZERO hard negatives. Its pool was the random TABLESAMPLE fill
       * alone, and its stated conservatism — "every negative is a document the
       * production representation already ranks above the gold" — did not
       * happen. Reproduced deliberately, 23 Aug: the V2 form fails, this form
       * returns rows. Every other `SET LOCAL hnsw` site in the repository
       * already uses this shape; V2 was the only one that did not.
       */
      const rows = await sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL hnsw.ef_search = 200');
        return tx<{ judgment_id: string }[]>`
          SELECT judgment_id FROM new1_probe_half_250k
          ORDER BY embedding <=> ${literal}::halfvec
          LIMIT ${NEGATIVES_PER_QUERY}
        `;
      });
      for (const r of rows as unknown as { judgment_id: string }[]) {
        if (!goldIds.has(r.judgment_id)) negatives.add(r.judgment_id);
      }
      negativeDraws += 1;
    } catch (error) {
      negativeDrawFailures += 1;
      console.log(`\n  negatives for ${t.taskId} skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.stdout.write(`\r  negatives so far: ${negatives.size} (task ${ti + 1}/${tasks.length})   `);
  }
  process.stdout.write('\n');

  /**
   * RANDOM FILL FROM THE STAGED POPULATION, not from a probe subset.
   *
   * `new1_doc_vector_stage` is what LawMind would actually serve. Filling from
   * it means the distractors at pool size 25,000 are real staged documents in
   * their real proportions, so the scale curve is a statement about the corpus
   * rather than about a sampling frame.
   */
  const hardNegativeCount = negatives.size;
  console.log(`  hard negatives drawn: ${hardNegativeCount} distinct, from ${negativeDraws} successful draws (${negativeDrawFailures} failed)`);

  const fill = Math.max(0, MAX_POOL - goldIds.size - negatives.size);
  if (fill > 0) {
    console.log(`  random fill: ${fill} documents from new1_doc_vector_stage …`);
    try {
      const rows = await sql<{ judgment_id: string }[]>`
        SELECT judgment_id FROM new1_doc_vector_stage TABLESAMPLE SYSTEM (3) LIMIT ${fill}
      `;
      for (const r of rows) if (!goldIds.has(r.judgment_id)) negatives.add(r.judgment_id);
    } catch (error) {
      console.log(`  random fill skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Gold first, then negatives: every pool size is a prefix, so the nesting holds.
  const pool = [...goldIds, ...[...negatives].slice(0, Math.max(0, MAX_POOL - goldIds.size))];
  console.log(`  pool: ${pool.length} documents (${goldIds.size} gold + ${pool.length - goldIds.size} distractors)`);
  const effectivePoolSizes = POOL_SIZES.filter((n) => n <= pool.length);
  if (effectivePoolSizes[effectivePoolSizes.length - 1] !== pool.length) effectivePoolSizes.push(pool.length);

  // ── the streamed scoring state ─────────────────────────────────────────────
  const heaps = new Map<string, TopK>();
  const key = (arm: Arm, ti: number): string => `${arm}#${ti}`;
  for (const arm of ARMS) for (let ti = 0; ti < tasks.length; ti += 1) heaps.set(key(arm, ti), new TopK(TOP_K));

  /** rank snapshots: `${arm}#${poolSize}` -> ranks parallel to `tasks`. */
  const snapshots = new Map<string, (number | null)[]>();
  const targetSets = tasks.map((t) => new Set(t.targets));

  const goldIssue = new Set<string>();
  let processed = 0;
  let chunkTotal = 0;
  let charsEmbedded = 0;
  let missingProductionVector = 0;
  const startedAt = Date.now();

  const BLOCK = Number(process.env['REP_BLOCK'] ?? 200);
  let nextBoundary = 0;

  const takeSnapshot = (poolSize: number): void => {
    for (const arm of ARMS) {
      const ranks: (number | null)[] = [];
      for (let ti = 0; ti < tasks.length; ti += 1) {
        ranks.push(heaps.get(key(arm, ti))?.snapshotRank(targetSets[ti] ?? new Set()) ?? null);
      }
      snapshots.set(`${arm}#${poolSize}`, ranks);
    }
    console.log(`\n  — snapshot at pool size ${poolSize} (${processed} documents processed)`);
  };

  for (let i = 0; i < pool.length; i += BLOCK) {
    const ids = pool.slice(i, i + BLOCK);
    const rows = await sql<{ id: string; full_text: string | null; embedding: unknown }[]>`
      SELECT j.id, j.full_text, s.embedding
      FROM judgments j
      LEFT JOIN new1_doc_vector_stage s ON s.judgment_id = j.id
      WHERE j.id = ANY(${ids}::uuid[])
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));

    const docs: Doc[] = [];
    const production: (Float32Array | null)[] = [];
    for (const id of ids) {
      const r = byId.get(id);
      if (!r || !r.full_text || r.full_text.trim().length === 0) {
        if (goldIds.has(id)) goldIssue.add(id);
        continue;
      }
      docs.push({ id, chunks: chunkJudgment(r.full_text).map((c) => c.text) });
      production.push(parseVector(r.embedding));
    }
    if (docs.length === 0) {
      processed += ids.length;
      continue;
    }

    // Texts to embed: every chunk, plus a HEAD:4800 fallback wherever production
    // has no stored vector. Salient/tail arms reuse the chunk vectors, so nothing
    // is embedded twice.
    const chunkTexts: string[] = [];
    const chunkOwner: number[] = [];
    const headTexts: string[] = [];
    const headOwner: number[] = [];
    for (let di = 0; di < docs.length; di += 1) {
      const d = docs[di];
      if (!d) continue;
      for (const c of d.chunks) {
        chunkTexts.push(c);
        chunkOwner.push(di);
      }
      if (production[di] === null || production[di] === undefined) {
        missingProductionVector += 1;
        headTexts.push(headText(d));
        headOwner.push(di);
      }
    }
    chunkTotal += chunkTexts.length;
    for (const t of chunkTexts) charsEmbedded += t.length;
    for (const t of headTexts) charsEmbedded += t.length;

    const chunkVectors = await embedAll(chunkTexts, 'chunks');
    const headVectors = headTexts.length > 0 ? await embedAll(headTexts, 'head-fallback') : [];

    const byDoc: Float32Array[][] = docs.map(() => []);
    for (let ci = 0; ci < chunkVectors.length; ci += 1) {
      const owner = chunkOwner[ci];
      const v = chunkVectors[ci];
      if (owner === undefined || !v) continue;
      byDoc[owner]?.push(v);
    }
    for (let hi = 0; hi < headVectors.length; hi += 1) {
      const owner = headOwner[hi];
      const v = headVectors[hi];
      if (owner === undefined || !v) continue;
      production[owner] = v;
    }

    // ── score this block against every query, then discard its vectors ───────
    for (let di = 0; di < docs.length; di += 1) {
      const d = docs[di];
      if (!d) continue;
      const chunks = byDoc[di] ?? [];
      const chunkIndex = new Map<string, number>();
      d.chunks.forEach((text, idx) => chunkIndex.set(text, idx));

      const armVectors: Partial<Record<Arm, Float32Array[]>> = {};
      const a = production[di];
      if (a) armVectors['A_HEAD_4800_PRODUCTION'] = [a];
      const b = poolMean(chunks);
      if (b) armVectors['B_POOLED_ALL'] = [b];
      const salient = salientChunks(d)
        .map((t) => chunkIndex.get(t))
        .filter((idx): idx is number => idx !== undefined)
        .map((idx) => chunks[idx])
        .filter((v): v is Float32Array => v !== undefined);
      const c = poolMean(salient);
      if (c) armVectors['C_POOLED_SALIENT'] = [c];
      // D: head / salient-interior / tail as THREE stored vectors, max-pooled at query time.
      const dHead = chunks[0];
      const dTail = chunks[chunks.length - 1];
      const dMid = poolMean(salient.slice(1, -1));
      const dVecs = [dHead, dMid, dTail].filter((v): v is Float32Array => v !== undefined && v !== null);
      if (dVecs.length > 0) armVectors['D_MULTI_3'] = dVecs;
      if (chunks.length > 0) armVectors['F_ALL_CHUNKS'] = chunks;
      void tailText;

      for (const arm of ARMS) {
        const vecs = armVectors[arm];
        if (!vecs || vecs.length === 0) continue;
        for (let ti = 0; ti < tasks.length; ti += 1) {
          const qv = queryVectors[ti];
          if (!qv) continue;
          let best = -Infinity;
          for (const v of vecs) {
            const s = cosine(qv, v);
            if (s > best) best = s;
          }
          heaps.get(key(arm, ti))?.offer(d.id, best);
        }
      }
      processed += 1;

      while (nextBoundary < effectivePoolSizes.length && processed >= (effectivePoolSizes[nextBoundary] ?? Infinity)) {
        takeSnapshot(effectivePoolSizes[nextBoundary] ?? processed);
        nextBoundary += 1;
      }
    }
    const rate = processed / Math.max(1, (Date.now() - startedAt) / 1000);
    process.stdout.write(
      `\r  scored ${processed}/${pool.length} documents · ${chunkTotal} chunks · ${rate.toFixed(1)} doc/s   `,
    );
  }
  process.stdout.write('\n');
  while (nextBoundary < effectivePoolSizes.length) {
    takeSnapshot(effectivePoolSizes[nextBoundary] ?? processed);
    nextBoundary += 1;
  }
  await sql.end({ timeout: 5 });

  // ── summarise ──────────────────────────────────────────────────────────────
  const results: ScoreBlock[] = [];
  const byProvenance: Record<Provenance, number[]> = { POSED: [], LIFTED: [] };
  tasks.forEach((t, i) => byProvenance[t.provenance].push(i));

  for (const poolSize of effectivePoolSizes) {
    for (const arm of ARMS) {
      const ranks = snapshots.get(`${arm}#${poolSize}`);
      if (!ranks) continue;
      for (const provenance of ['POSED', 'LIFTED'] as const) {
        const idx = byProvenance[provenance];
        if (idx.length === 0) continue;
        results.push(
          summarise(
            arm,
            provenance,
            poolSize,
            idx.map((i) => tasks[i]).filter((t): t is Task => t !== undefined),
            idx.map((i) => ranks[i] ?? null),
            notInIndex,
            goldIssue,
          ),
        );
      }
    }
  }

  /** Paired difference B - A on s@5, the number the adoption decision turns on. */
  const pairedDiffs: Record<string, { delta: number; ci: { lo: number; hi: number }; n: number }> = {};
  for (const poolSize of effectivePoolSizes) {
    const a = snapshots.get(`A_HEAD_4800_PRODUCTION#${poolSize}`);
    const b = snapshots.get(`B_POOLED_ALL#${poolSize}`);
    if (!a || !b) continue;
    for (const provenance of ['POSED', 'LIFTED'] as const) {
      const idx = byProvenance[provenance];
      if (idx.length === 0) continue;
      const diffs = idx.map((i) => {
        const ra = a[i] ?? null;
        const rb = b[i] ?? null;
        return (rb !== null && rb <= 5 ? 1 : 0) - (ra !== null && ra <= 5 ? 1 : 0);
      });
      pairedDiffs[`${provenance}#${poolSize}`] = {
        delta: diffs.reduce((x, y) => x + y, 0) / diffs.length,
        ci: bootstrapCi(diffs, BOOTSTRAP),
        n: diffs.length,
      };
    }
  }

  const artefact = {
    kind: 'new1_representation_lab_v3',
    generatedAt: new Date().toISOString(),
    premiseCorrection:
      'The round brief states the V2 POOLED_ALL result used lifted/verbatim target sentences. It did not: V2 embedded ADVOCATE-100 task.query, which is authored from the legal question under a <=6 shared-word leakage guard, over concept classes only. This run keeps those posed queries AND adds an explicitly lifted set so the overstatement can be measured rather than asserted.',
    poolSizes: effectivePoolSizes,
    poolComposition: {
      documents: pool.length,
      gold: goldIds.size,
      distractors: pool.length - goldIds.size,
      hardNegativeDrawsSucceeded: negativeDraws,
      hardNegativeDrawsFailed: negativeDrawFailures,
      hardNegativesDistinct: hardNegativeCount,
      fillSource: 'new1_doc_vector_stage TABLESAMPLE SYSTEM (3)',
      nested: true,
    },
    productionCoverage: {
      goldTotal: goldIds.size,
      goldWithProductionVector: stagedGold.size,
      goldNotInIndex: notInIndex.size,
      note: 'measured against new1_doc_vector_stage BEFORE the pool force-includes gold. NOT_IN_INDEX is a production fact; the pool then embeds the missing ones so ranking is still comparable.',
    },
    embedding: {
      chunksEmbedded: chunkTotal,
      charsEmbedded,
      documentsMissingProductionVector: missingProductionVector,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
    },
    goldIdentityIssues: [...goldIssue],
    latencyNote:
      'This file contains NO latency measurement. Scoring is exhaustive in-memory cosine and nothing here may be quoted as a search time.',
    recallBasis:
      'CONDITIONAL on the gold being in the pool, which it always is by construction. Real-world reachability is the productionCoverage block, NOT recall@k.',
    arms: results,
    pairedDeltaBminusA_successAt5: pairedDiffs,
    tasks: tasks.map((t, i) => ({
      taskId: t.taskId,
      provenance: t.provenance,
      queryClass: t.queryClass,
      targets: t.targets,
      targetInProduction: t.targets.some((id) => stagedGold.has(id)),
      ranks: Object.fromEntries(
        effectivePoolSizes.flatMap((p) => ARMS.map((arm) => [`${arm}#${p}`, snapshots.get(`${arm}#${p}`)?.[i] ?? null])),
      ),
    })),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artefact, null, 1));

  console.log('\n── s@5 by arm, provenance and pool size ──');
  for (const provenance of ['POSED', 'LIFTED'] as const) {
    const rows = results.filter((r) => r.provenance === provenance);
    if (rows.length === 0) continue;
    console.log(`\n  ${provenance}  (n=${rows[0]?.n}, distinct targets ${rows[0]?.effectiveDistinctTargets})`);
    console.log(`  ${'arm'.padEnd(26)}${effectivePoolSizes.map((p) => String(p).padStart(16)).join('')}`);
    for (const arm of ARMS) {
      const cells = effectivePoolSizes.map((p) => {
        const r = rows.find((x) => x.arm === arm && x.poolSize === p);
        return r ? `${pct(r.successAt5)} [${pct(r.successAt5Ci.lo)},${pct(r.successAt5Ci.hi)}]`.padStart(16) : ''.padStart(16);
      });
      console.log(`  ${arm.padEnd(26)}${cells.join('')}`);
    }
  }
  console.log(`\n  artefact: ${OUT}`);
  return 0;
}

process.exitCode = await main();
