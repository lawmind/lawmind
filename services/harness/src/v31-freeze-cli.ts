/**
 * NEW1 — V3.1 BENCHMARK FREEZE. Convergence sprint V2 §7 NEW1-1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * V3 produced the numbers a launch decision now rests on — F_ALL_CHUNKS 37.8%
 * against A_HEAD_4800 2.2% on posed advocate questions. NEW1-1 requires that the
 * next semantic benchmark be EXACTLY replayable. V3 is not, and a result nobody
 * can replay is an anecdote with a confidence interval printed on it.
 *
 * V3's gold loading is already deterministic (a stride, not a sample). The
 * non-determinism is exactly two sites, both found by reading rather than by
 * re-running:
 *
 *   1. `bootstrapCi` calls `Math.random()` — every re-run resamples, so every
 *      published interval is a different interval.
 *   2. the pool's random fill is `TABLESAMPLE SYSTEM (3)` with no `REPEATABLE`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SEED IS NOT ENOUGH, WHICH IS THE WHOLE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious fix is `TABLESAMPLE SYSTEM (3) REPEATABLE (seed)`. It does not
 * work here, and the reason is measurable rather than theoretical.
 *
 * The fill is drawn from `new1_doc_vector_stage`, and THE HEAD WALK IS WRITING
 * TO THAT TABLE WHILE THE BENCHMARK RUNS — measured this session at +1,601 rows
 * in 331 seconds. `TABLESAMPLE SYSTEM` samples PHYSICAL PAGES. `REPEATABLE`
 * fixes which pages are chosen, not what is on them, so a replay a day later
 * reads the same page numbers out of a bigger table and gets a different pool.
 * The seed makes the drift silent instead of removing it, which is worse than
 * leaving it visible.
 *
 * So V3.1 does not re-sample under a seed. It materialises the identity of every
 * object into an artifact, and replay reads the artifact. Seeded drawing is used
 * ONCE, to build the manifest; after that the manifest IS the benchmark. A frozen
 * list cannot drift when a table grows underneath it.
 *
 * That distinction is the deliverable. Everything below is bookkeeping for it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT GETS FROZEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   random seed · bootstrap seed
 *   query IDs · SHA-256 of each query's text
 *   target IDs
 *   target/proposition clusters
 *   pool IDs · hard-negative IDs
 *   segmentation version · embedder model + file digests
 *   court/task strata
 *
 * and a `manifestSha256` over the whole thing, so "did this replay run the same
 * benchmark" is a string comparison rather than a judgement call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON COUNTING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1-1 also says: do not inflate n by counting many queries against one
 * authority as independent authorities. So the manifest carries THREE
 * denominators and names them — tasks, distinct targets, and target clusters —
 * where a cluster is the set of tasks sharing any target, closed transitively.
 * Fifteen queries about one judgment are one authority, and the interval that
 * respects that is the cluster interval.
 *
 * USAGE
 *   DATABASE_URL=... tsx src/v31-freeze-cli.ts
 *   OUT=... V31_SEED=... tsx src/v31-freeze-cli.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

// ── The frozen configuration. Changing any of these makes a DIFFERENT benchmark,
//    which is why every one is recorded in the manifest rather than left in env. ──
const SEED = process.env['V31_SEED'] ?? 'lawmind-new1-v3.1-2026-08-25';
const BOOTSTRAP_SEED = process.env['V31_BOOTSTRAP_SEED'] ?? `${SEED}#bootstrap`;
const POSED_GOLD = abs(process.env['ADVOCATE100'] ?? 'docs/ai/new2/ADVOCATE100.json');
const LIFTED_GOLD = (
  process.env['LIFTED_GOLD'] ??
  'docs/ai/new3-uncited-authority-gold-v2.json,docs/ai/new3-noncitation-gold.json,docs/ai/new3-semantic-expansion-gold-v2.json'
)
  .split(',')
  .map((s) => abs(s.trim()))
  .filter(Boolean);
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/V31_MANIFEST.json');
const LIFTED_TASKS = Number(process.env['REP_LIFTED_TASKS'] ?? 250);
const POOL_SIZES = (process.env['REP_POOL_SIZES'] ?? '2500,7500,25000')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);
const MAX_POOL = POOL_SIZES[POOL_SIZES.length - 1] ?? 25_000;
const CONCEPT_CLASSES = new Set(
  (
    process.env['REP_CLASSES'] ??
    'doctrine,fact_pattern,supporting_authority,adverse_authority,long_narrative,pasted_passage,current_law,statute'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const SEGMENTATION_VERSION =
  process.env['V31_SEGMENTATION'] ?? 'harness/chunk.ts@HEAD:4800+salient4+multi3+allchunks';
const MODEL_DIR = join(ROOT, '.models', 'Xenova', 'bge-m3');

type Provenance = 'POSED' | 'LIFTED';
type Task = {
  taskId: string;
  provenance: Provenance;
  queryClass: string;
  query: string;
  targets: string[];
};

// ── Gold loading, mirroring representation-lab-v3-cli.ts exactly ──────────────
// Deliberately duplicated rather than imported: V3's loaders are not exported,
// and a freeze that silently diverges from the thing it claims to freeze is the
// one bug this file cannot be allowed to have. Any change there must land here.

function loadPosed(): Task[] {
  const gold = JSON.parse(readFileSync(POSED_GOLD, 'utf8')) as {
    tasks: {
      task_id: string;
      query_class: string;
      query: string;
      targets: string[];
      expected?: string;
    }[];
  };
  return gold.tasks
    .filter(
      (t) => CONCEPT_CLASSES.has(t.query_class) && t.targets.length > 0 && t.expected !== 'REFUSE',
    )
    .map((t) => ({
      taskId: t.task_id,
      provenance: 'POSED' as const,
      queryClass: t.query_class,
      query: t.query,
      targets: t.targets,
    }));
}

function loadLifted(): Task[] {
  const out: Task[] = [];
  for (const file of LIFTED_GOLD) {
    if (!existsSync(file)) continue;
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
  if (out.length <= LIFTED_TASKS) return out;
  const stride = out.length / LIFTED_TASKS;
  const picked: Task[] = [];
  for (let i = 0; i < LIFTED_TASKS; i += 1) {
    const t = out[Math.floor(i * stride)];
    if (t) picked.push(t);
  }
  return picked;
}

/**
 * TARGET / PROPOSITION CLUSTERS — union-find over shared targets.
 *
 * Two tasks join the same cluster when they share ANY target, and the relation is
 * closed transitively. This is the denominator NEW1-1 asks for: n counted in
 * authorities rather than in questions, so that fifteen queries about one
 * judgment cannot present themselves as fifteen independent successes.
 */
function clusterTasks(tasks: readonly Task[]): {
  clusterOf: Map<string, number>;
  clusters: string[][];
} {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) ?? r;
    let c = x;
    while ((parent.get(c) ?? c) !== c) {
      const next = parent.get(c) ?? c;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const t of tasks) {
    parent.set(`task:${t.taskId}`, parent.get(`task:${t.taskId}`) ?? `task:${t.taskId}`);
    for (const g of t.targets) {
      parent.set(`gold:${g}`, parent.get(`gold:${g}`) ?? `gold:${g}`);
      union(`task:${t.taskId}`, `gold:${g}`);
    }
  }
  const byRoot = new Map<string, string[]>();
  for (const t of tasks) {
    const r = find(`task:${t.taskId}`);
    byRoot.set(r, [...(byRoot.get(r) ?? []), t.taskId]);
  }
  // Sorted by first member, so cluster ids are stable across runs.
  const clusters = [...byRoot.values()]
    .map((v) => [...v].sort())
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
  const clusterOf = new Map<string, number>();
  clusters.forEach((members, i) => members.forEach((m) => clusterOf.set(m, i)));
  return { clusterOf, clusters };
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error(
      'DATABASE_URL is not set. Export it first — an unreadable gate and a busy one print the same word.',
    );
    process.exit(2);
  }
  const sql = postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 30, ssl: sslFor(url) });

  try {
    const posed = loadPosed();
    const lifted = loadLifted();
    const tasks = [...posed, ...lifted];
    console.log(`tasks: ${posed.length} POSED + ${lifted.length} LIFTED = ${tasks.length}`);

    const goldIds = [...new Set(tasks.flatMap((t) => t.targets))].sort();
    const { clusterOf, clusters } = clusterTasks(tasks);
    console.log(
      `denominators — tasks ${tasks.length} · distinct targets ${goldIds.length} · target clusters ${clusters.length}`,
    );

    // ── STRATA. Court and year from the DB, task family from gold.
    const courtRows = goldIds.length
      ? await sql<{ id: string; court: string | null; year: number | null }[]>`
          SELECT id::text AS id, court::text AS court,
                 EXTRACT(YEAR FROM judgment_date)::int AS year
          FROM judgments WHERE id::text = ANY(${goldIds})`
      : [];
    const courtOf = new Map(courtRows.map((r) => [r.id, r.court ?? 'UNKNOWN']));
    const yearOf = new Map(courtRows.map((r) => [r.id, r.year]));

    const taskStrata: Record<string, number> = {};
    for (const t of tasks) taskStrata[t.queryClass] = (taskStrata[t.queryClass] ?? 0) + 1;
    const courtStrata: Record<string, number> = {};
    for (const g of goldIds) {
      const c = courtOf.get(g) ?? 'NOT_IN_JUDGMENTS_TABLE';
      courtStrata[c] = (courtStrata[c] ?? 0) + 1;
    }

    // ── REACHABILITY, measured BEFORE the pool force-includes gold. This number
    //    decides whether a metric is end-to-end or merely conditional.
    const staged = goldIds.length
      ? await sql<{ judgment_id: string }[]>`
          SELECT DISTINCT judgment_id::text AS judgment_id
          FROM new1_doc_vector_stage WHERE judgment_id::text = ANY(${goldIds})`
      : [];
    const stagedSet = new Set(staged.map((r) => r.judgment_id));
    const notInIndex = goldIds.filter((g) => !stagedSet.has(g));
    console.log(
      `gold with a production vector: ${stagedSet.size}/${goldIds.length} — ${notInIndex.length} NOT_IN_INDEX (${(
        (100 * notInIndex.length) /
        Math.max(1, goldIds.length)
      ).toFixed(1)}%)`,
    );

    // ── THE POOL FILL, frozen by identity rather than by seed.
    //
    // `ORDER BY md5(judgment_id || seed)` is a deterministic function of the ROW,
    // not of the physical page, so it does not care where a row lives or when it
    // was vacuumed. It still changes when rows are ADDED — which is exactly why
    // the resulting ids are written into the manifest and never re-drawn.
    const fillWanted = Math.max(0, MAX_POOL - goldIds.length);
    console.log(`drawing ${fillWanted} distractors, seeded by row identity (not by page)…`);
    const fillRows = await sql<{ judgment_id: string }[]>`
      SELECT judgment_id::text AS judgment_id
      FROM (SELECT DISTINCT judgment_id FROM new1_doc_vector_stage) d
      WHERE NOT (judgment_id::text = ANY(${goldIds}))
      ORDER BY md5(judgment_id::text || ${SEED})
      LIMIT ${fillWanted}`;
    const distractors = fillRows.map((r) => r.judgment_id);

    // A bare `count(*)` always returns exactly one row, but
    // `noUncheckedIndexedAccess` cannot know that, and destructuring the field
    // straight out of `rows[0]` is what broke the typecheck. The assertion is
    // the claim "this aggregate returns a row", which is true of `count(*)`.
    const [stageRow] = await sql<{ n: string }[]>`
      SELECT count(*)::bigint AS n FROM new1_doc_vector_stage`;
    const stageRowsAtFreeze = stageRow!.n;

    // Gold first, then distractors: every pool size stays a PREFIX of the next,
    // so the nesting V3 relies on for its scale curve still holds.
    const pool = [...goldIds, ...distractors].slice(0, MAX_POOL);

    // ── EMBEDDER IDENTITY. A file digest, not a directory name: a benchmark
    //    replayed against a re-downloaded model is not a replay.
    const modelFiles = ['onnx/model.onnx', 'tokenizer.json', 'config.json'];
    const embedder: Record<string, unknown> = { dir: '.models/Xenova/bge-m3', dimensions: 1024 };
    for (const f of modelFiles) {
      const p = join(MODEL_DIR, f);
      if (!existsSync(p)) {
        embedder[f] = 'MISSING';
        continue;
      }
      const st = statSync(p);
      // model.onnx is large; digest the small files fully and the big one by
      // size+mtime, which catches a swap without reading a gigabyte every freeze.
      embedder[f] =
        st.size > 64 * 1024 * 1024
          ? { bytes: st.size, mtime: st.mtime.toISOString() }
          : sha(readFileSync(p, 'utf8'));
    }

    const body = {
      kind: 'new1_v31_benchmark_manifest',
      version: 'V3.1',
      builtAt: new Date().toISOString(),
      supersedes: 'docs/ai/new1-tier-a/representation-lab-v3.json',
      whyNotASeed:
        'The fill source new1_doc_vector_stage is written by the live HEAD walk (+1,601 rows in 331s, measured 2026-08-25). TABLESAMPLE REPEATABLE fixes which PAGES are read, not what is on them, so a seeded re-draw against a grown table yields a different pool. Identity is frozen into this artifact instead; replay reads these ids and never re-draws.',
      knownNonDeterminismInV3: [
        'representation-lab-v3-cli.ts:359 bootstrapCi uses Math.random() — every re-run publishes a different interval.',
        'representation-lab-v3-cli.ts:623 pool fill uses TABLESAMPLE SYSTEM (3) with no REPEATABLE.',
      ],
      seeds: { seed: SEED, bootstrapSeed: BOOTSTRAP_SEED },
      denominators: {
        tasks: tasks.length,
        distinctTargets: goldIds.length,
        targetClusters: clusters.length,
        note: 'Report intervals over all three. Many queries against one authority are ONE authority.',
      },
      config: {
        poolSizes: POOL_SIZES,
        maxPool: MAX_POOL,
        liftedTasks: LIFTED_TASKS,
        conceptClasses: [...CONCEPT_CLASSES],
      },
      segmentationVersion: SEGMENTATION_VERSION,
      embedder,
      strata: { byTaskClass: taskStrata, byCourt: courtStrata },
      reachabilityAtFreeze: {
        goldTotal: goldIds.length,
        goldWithProductionVector: stagedSet.size,
        notInIndex: notInIndex.length,
        notInIndexIds: notInIndex,
        stageRowsAtFreeze: Number(stageRowsAtFreeze),
        note: 'Measured BEFORE the pool force-includes gold. END-TO-END success must count these as misses; only CONDITIONAL ranking may exclude them.',
      },
      tasks: tasks.map((t) => ({
        taskId: t.taskId,
        provenance: t.provenance,
        queryClass: t.queryClass,
        querySha256: sha(t.query),
        queryChars: t.query.length,
        targets: t.targets,
        targetCourts: t.targets.map((g) => courtOf.get(g) ?? 'NOT_IN_JUDGMENTS_TABLE'),
        targetYears: t.targets.map((g) => yearOf.get(g) ?? null),
        clusterId: clusterOf.get(t.taskId) ?? -1,
        targetsInIndexAtFreeze: t.targets.filter((g) => stagedSet.has(g)).length,
      })),
      clusters: clusters.map((members, i) => ({
        clusterId: i,
        taskIds: members,
        size: members.length,
      })),
      pool: {
        size: pool.length,
        goldCount: goldIds.length,
        distractorCount: pool.length - goldIds.length,
        ids: pool,
      },
    };

    /**
     * TWO checksums, because they answer two different questions and collapsing
     * them makes the useful one useless.
     *
     * `manifestSha256` covers the file as written, `builtAt` included — file
     * integrity.
     *
     * `contentSha256` EXCLUDES `builtAt`, and it is the one that means anything:
     * "are these two freezes the same benchmark?". Measured — two independent
     * freezes minutes apart produced identical tasks, clusters, strata, seeds,
     * config, embedder digests AND all 25,000 pool ids, and still differed in
     * `manifestSha256` for the sole reason that a timestamp was inside the hash.
     * A checksum that always reports "different" is not a checksum.
     */
    const { builtAt: _builtAt, ...invariant } = body;
    const contentSha256 = sha(JSON.stringify(invariant));
    const manifestSha256 = sha(JSON.stringify(body));
    writeFileSync(OUT, JSON.stringify({ ...body, contentSha256, manifestSha256 }, null, 2));

    console.log('');
    console.log('V3.1 MANIFEST FROZEN');
    console.log(`  file           ${OUT}`);
    console.log(`  contentSha256  ${contentSha256}   <- compare THIS across freezes`);
    console.log(`  manifestSha256 ${manifestSha256}   (file integrity; includes builtAt)`);
    console.log(
      `  tasks          ${tasks.length}  (POSED ${posed.length} / LIFTED ${lifted.length})`,
    );
    console.log(`  targets        ${goldIds.length} distinct · ${clusters.length} clusters`);
    console.log(
      `  pool           ${pool.length} ids frozen (${goldIds.length} gold + ${pool.length - goldIds.length} distractors)`,
    );
    console.log(
      `  NOT_IN_INDEX   ${notInIndex.length}/${goldIds.length} gold have no production vector`,
    );
    console.log(`  stage rows     ${Number(stageRowsAtFreeze).toLocaleString()} at freeze time`);
  } finally {
    await sql.end({ timeout: 10 });
  }
}

await main();
