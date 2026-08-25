#!/usr/bin/env node
/**
 * NEW1 — 100k PASSAGE TRANCHE VALIDATION. R7 §9 NEW1-P0 / gate G3.
 *
 * Input:  docs/ai/new1-tier-a/TRANCHE_100K_MANIFEST.json  (what is in the index)
 *         docs/ai/new1-tier-a/V31_MANIFEST.json           (the frozen task set)
 *         docs/ai/new1-tier-a/V31_ABSTENTION_SPLIT.json    (dev / held-out)
 *         new1_tranche_passages                            (the real vectors)
 * Output: docs/ai/new1-tier-a/PASSAGE_100K_METRICS.json    (raw, per task)
 *         docs/ai/new1-tier-a/passage-eval.checkpoint.jsonl
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO NUMBERS, ALWAYS BOTH, AND THE SECOND ONE IS NOT THE HEADLINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   END_TO_END   a task succeeds only if its target entered the tranche
 *                NATURALLY and ranks in top-k. A FORCED target is a MISS.
 *                Answers: "would an advocate get the right authority?"
 *
 *   CONDITIONAL  among tasks whose target is in the index at all (natural OR
 *                forced), does it rank?
 *                Answers: "is the representation good at ordering?"
 *
 * This lane has already published a conditional number as if it were the product
 * number once — 37.8% when the advocate-facing figure was 24.4%, corrected in bus
 * 1162/1163. The correction is why this file refuses to emit one without the
 * other: `--conditional-only` is not a flag, and there is no code path that
 * writes one metric block.
 *
 * The gap is large here BY CONSTRUCTION. Only 3 of 213 gold targets landed in the
 * tranche naturally, because the draw is gold-blind over 8.85M documents. 210 are
 * forced and every one is an END_TO_END miss. That makes END_TO_END on this
 * tranche a near-floor number and CONDITIONAL the informative one — and saying so
 * here, in the file that computes them, is the only defence against someone later
 * quoting whichever suits them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO AGGREGATE MAY HIDE A ZERO FAMILY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `adverse_authority` and `statute` scored ZERO for every representation arm ever
 * tested on this project. That is NEW1's most important negative result. R7 §9
 * names adverse / statute / pasted-passage / wrong-domain as classes that may
 * never be hidden behind an aggregate, so every metric is emitted per family and
 * the summary REFUSES to print an overall line without the family table beneath
 * it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANN vs EXACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every query runs three ways: HNSW at production `ef_search`, HNSW at the probe
 * harness's `ef_search`, and an exact scan with index scans disabled. The exact
 * arm is the ground truth for what the ANN arm LOST — a recall number quoted
 * without it is a statement about an index, not about a representation.
 *
 * `ef_search` is 40 in NEW1's probe harness and 200 in production `retrieve.ts`.
 * Both are run and both are labelled, because quoting the 40 number as production
 * has nearly happened here.
 *
 * USAGE
 *   node services/harness/src/passage-eval-cli.mjs --index    # build HNSW, measure it
 *   node services/harness/src/passage-eval-cli.mjs            # run the evaluation
 */
import postgres from 'postgres';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const P = (rel) => new URL(rel, ROOT);
const TRANCHE = P('docs/ai/new1-tier-a/TRANCHE_100K_MANIFEST.json');
const V31 = P('docs/ai/new1-tier-a/V31_MANIFEST.json');
const SPLIT = P('docs/ai/new1-tier-a/V31_ABSTENTION_SPLIT.json');
const OUT = P('docs/ai/new1-tier-a/PASSAGE_100K_METRICS.json');
const CKPT = P('docs/ai/new1-tier-a/passage-eval.checkpoint.jsonl');
const INDEX_OUT = P('docs/ai/new1-tier-a/PASSAGE_INDEX_BUILD.json');

const INDEX_ONLY = process.argv.includes('--index');
const GPU = (process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799').replace(/\/embed\/?$/, '');
/** Production runs 200. The probe harness runs 40. Both, always, both labelled. */
const EF_PROD = Number(process.env.EF_PROD ?? 200);
const EF_PROBE = Number(process.env.EF_PROBE ?? 40);
/** Deepest k any metric needs. Passages, not documents — documents come after aggregation. */
const PASSAGE_DEPTH = Number(process.env.PASSAGE_DEPTH ?? 2000);
const KS = [1, 5, 20, 100, 500];
/** The floor `aboveFloor` counts against. A usable-set size, not a quality claim. */
const SIM_FLOOR = Number(process.env.SIM_FLOOR ?? 0.5);
/** Smoke-test bound. A harness proved on 8 tasks beats one discovered broken after six hours. */
const TASK_LIMIT = Number(process.env.TASK_LIMIT ?? Infinity);

const url =
  process.env.DATABASE_URL ??
  readFileSync(P('.env'), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const log = (s) => console.log(`${new Date().toISOString()}  ${s}`);
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ── the frozen task set, with its query TEXT recovered and hash-verified ──────
//
// The manifest stores `querySha256` and not the query. Recovering the text from
// the gold files and re-hashing it is not a formality: it proves the task set
// being scored is the one that was frozen, which a filename cannot.
function loadQueryTexts() {
  const texts = new Map();
  const posed = JSON.parse(readFileSync(P('docs/ai/new2/ADVOCATE100.json'), 'utf8'));
  for (const t of posed.tasks) texts.set(t.task_id, t.query);
  for (const f of [
    'docs/ai/new3-uncited-authority-gold-v2.json',
    'docs/ai/new3-noncitation-gold.json',
    'docs/ai/new3-semantic-expansion-gold-v2.json',
  ]) {
    if (!existsSync(P(f))) continue;
    const j = JSON.parse(readFileSync(P(f), 'utf8'));
    for (const r of j.cases ?? []) {
      const id = r.query_id ?? r.id;
      if (id && r.query) texts.set(id, r.query);
    }
  }
  return texts;
}

async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const part = texts.slice(i, i + 32);
    const res = await fetch(`${GPU}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: part }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`embed sidecar ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (body.vectors.length !== part.length)
      throw new Error(`sidecar returned ${body.vectors.length} vectors for ${part.length} texts`);
    for (const v of body.vectors) out.push(`[${v.join(',')}]`);
  }
  return out;
}

const sql = postgres(url, { max: 1, idle_timeout: 60, connect_timeout: 30 });

try {
  // ═══════════════════════════════════════════════════════════════════════════
  // INDEX BUILD — measured, because the full-build decision turns on these
  // ═══════════════════════════════════════════════════════════════════════════
  if (INDEX_ONLY) {
    const [{ n, d }] = await sql`
      SELECT count(*)::text AS n, count(DISTINCT judgment_id)::text AS d FROM new1_tranche_passages`;
    log(`indexing ${Number(n).toLocaleString()} passages over ${Number(d).toLocaleString()} documents`);

    const [{ heap }] = await sql`SELECT pg_total_relation_size('new1_tranche_passages')::text AS heap`;
    const wal0 = await sql`SELECT pg_current_wal_lsn() AS lsn`;

    await sql.unsafe(`DROP INDEX IF EXISTS new1_tranche_passages_hnsw`);
    // maintenance_work_mem is the single knob that decides whether HNSW builds in
    // memory or spills. Set explicitly and RECORDED, because a build time quoted
    // without it is not reproducible.
    const mwm = process.env.HNSW_MAINT_MEM ?? '2GB';
    await sql.unsafe(`SET maintenance_work_mem = '${mwm}'`);
    await sql.unsafe(`SET max_parallel_maintenance_workers = ${Number(process.env.HNSW_WORKERS ?? 2)}`);

    const t0 = Date.now();
    await sql.unsafe(`
      CREATE INDEX new1_tranche_passages_hnsw ON new1_tranche_passages
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = ${Number(process.env.HNSW_M ?? 16)}, ef_construction = ${Number(process.env.HNSW_EFC ?? 64)})`);
    const buildSeconds = Number(((Date.now() - t0) / 1000).toFixed(1));

    const [{ idx }] = await sql`SELECT pg_relation_size('new1_tranche_passages_hnsw')::text AS idx`;
    const wal1 = await sql`SELECT pg_current_wal_lsn() AS lsn`;
    const [{ walbytes }] = await sql`
      SELECT pg_wal_lsn_diff(${wal1[0].lsn}::pg_lsn, ${wal0[0].lsn}::pg_lsn)::text AS walbytes`;

    const body = {
      kind: 'new1_passage_index_build',
      builtAt: new Date().toISOString(),
      passages: Number(n),
      documents: Number(d),
      heapBytes: Number(heap),
      indexBytes: Number(idx),
      buildSeconds,
      walBytesDuringBuild: Number(walbytes),
      params: {
        m: Number(process.env.HNSW_M ?? 16),
        efConstruction: Number(process.env.HNSW_EFC ?? 64),
        maintenanceWorkMem: mwm,
        maxParallelMaintenanceWorkers: Number(process.env.HNSW_WORKERS ?? 2),
      },
      note:
        'Build time and index size are the numbers the full-corpus passage decision turns on. maintenance_work_mem is recorded because a build time quoted without it is not reproducible.',
    };
    writeFileSync(INDEX_OUT, JSON.stringify(body, null, 2) + '\n');
    log('');
    log('INDEX BUILT');
    log(`  passages     ${Number(n).toLocaleString()} over ${Number(d).toLocaleString()} documents`);
    log(`  heap         ${(Number(heap) / 2 ** 30).toFixed(2)} GiB`);
    log(`  index        ${(Number(idx) / 2 ** 30).toFixed(2)} GiB`);
    log(`  build        ${buildSeconds}s`);
    log(`  WAL          ${(Number(walbytes) / 2 ** 30).toFixed(2)} GiB`);
    process.exit(0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════
  const tranche = JSON.parse(readFileSync(TRANCHE, 'utf8'));
  const v31 = JSON.parse(readFileSync(V31, 'utf8'));
  const split = JSON.parse(readFileSync(SPLIT, 'utf8'));
  const splitOf = new Map((split.tasks ?? []).map((t) => [t.taskId, t.split]));

  const naturalGold = new Set(tranche.gold.naturalIds);
  const forcedGold = new Set(tranche.gold.forcedIds);

  // What is ACTUALLY in the index, read from the DB — never from the manifest.
  // The manifest says what was SELECTED; a partial build means those are
  // different sets, and scoring against intent instead of reality is how a
  // benchmark flatters itself.
  const indexed = new Set(
    (await sql`SELECT DISTINCT judgment_id::text AS id FROM new1_tranche_passages`).map((r) => r.id),
  );
  const [{ n: passageCount }] = await sql`SELECT count(*)::text AS n FROM new1_tranche_passages`;
  log(`index holds ${Number(passageCount).toLocaleString()} passages over ${indexed.size.toLocaleString()} documents`);
  log(`tranche manifest selected ${tranche.actualSize.toLocaleString()} + ${forcedGold.size} forced gold`);

  const texts = loadQueryTexts();
  const tasks = [];
  for (const t of v31.tasks) {
    const q = texts.get(t.taskId);
    if (!q) throw new Error(`no query text for ${t.taskId} — refusing to score a task set I cannot reconstruct`);
    if (sha(q) !== t.querySha256)
      throw new Error(`query text for ${t.taskId} does not match the frozen hash — the task set has drifted`);
    tasks.push({ ...t, query: q, split: splitOf.get(t.taskId) ?? 'UNASSIGNED' });
  }
  if (Number.isFinite(TASK_LIMIT)) tasks.length = Math.min(tasks.length, TASK_LIMIT);
  log(`tasks ${tasks.length}, every query text hash-verified against the frozen manifest`);

  log('embedding queries…');
  const vectors = await embedAll(tasks.map((t) => t.query));

  /**
   * THE CHECKPOINT IS KEYED TO THE INDEX IT WAS SCORED AGAINST.
   *
   * A resumable checkpoint is a hazard here in a way it is not for an embed job.
   * The embed is idempotent per document; THIS is a measurement, and a row scored
   * against 64,960 passages is not comparable with one scored against 249,000.
   * Resuming across a grown index would silently blend two different experiments
   * into one artifact, and the artifact would look completely normal.
   *
   * So every line records `indexPassages`, and any line that disagrees with the
   * live count is discarded rather than reused. This lane has been bitten by a
   * stale file that looked identical to a live one before.
   */
  const done = new Set();
  let stale = 0;
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split(/[\r\n]+/)) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.indexPassages !== Number(passageCount)) {
          stale += 1;
          continue;
        }
        done.add(r.taskId);
      } catch {
        /* a torn last line is expected after a kill; skip it */
      }
    }
    log(`checkpoint: ${done.size} usable scored tasks` + (stale > 0 ? `, ${stale} DISCARDED as scored against a different index size` : ''));
  }

  const ARMS = [
    { name: 'ann_ef200', kind: 'ann', ef: EF_PROD },
    { name: 'ann_ef40', kind: 'ann', ef: EF_PROBE },
    { name: 'exact', kind: 'exact', ef: null },
  ];

  const results = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    if (done.has(t.taskId)) continue;
    const vec = vectors[i];
    const row = { taskId: t.taskId, indexPassages: Number(passageCount), queryClass: t.queryClass, provenance: t.provenance, split: t.split, arms: {} };

    for (const arm of ARMS) {
      const t0 = Date.now();
      let rows;
      if (arm.kind === 'ann') {
        rows = await sql.begin(async (tx) => {
          // SET LOCAL so it dies with the transaction rather than leaking into
          // the next arm and silently making two arms the same arm.
          await tx.unsafe(`SET LOCAL hnsw.ef_search = ${arm.ef}`);
          return tx`
            SELECT judgment_id::text AS id, chunk_index, char_offset, body_length,
                   1 - (embedding <=> ${vec}::vector) AS sim
            FROM new1_tranche_passages
            ORDER BY embedding <=> ${vec}::vector
            LIMIT ${PASSAGE_DEPTH}`;
        });
      } else {
        rows = await sql.begin(async (tx) => {
          // The ground truth for what ANN LOST. Index scans off, so this is a
          // brute-force cosine over every passage in the tranche.
          await tx.unsafe(`SET LOCAL enable_indexscan = off`);
          await tx.unsafe(`SET LOCAL enable_bitmapscan = off`);
          return tx`
            SELECT judgment_id::text AS id, chunk_index, char_offset, body_length,
                   1 - (embedding <=> ${vec}::vector) AS sim
            FROM new1_tranche_passages
            ORDER BY embedding <=> ${vec}::vector
            LIMIT ${PASSAGE_DEPTH}`;
        });
      }
      const ms = Date.now() - t0;

      // PASSAGE -> DOCUMENT by MAX similarity. A document is as relevant as its
      // best passage; summing would reward long documents for being long, which
      // is the failure mode a passage index exists to remove.
      const best = new Map();
      for (const r of rows) {
        const prev = best.get(r.id);
        if (!prev || r.sim > prev.sim)
          best.set(r.id, { sim: r.sim, chunkIndex: r.chunk_index, charOffset: r.char_offset, bodyLength: r.body_length });
      }
      const ordered = [...best.entries()].sort((a, b) => b[1].sim - a[1].sim);
      const ranked = ordered.map(([id]) => id);

      /**
       * THE ABSTENTION SIGNALS, captured here because they must be computable by
       * the SERVER at request time.
       *
       * Nothing below needs a label, a target, or anything known only after the
       * fact. That constraint is the point: the benchmark's own `queryClass` is
       * exactly such a field — it is a property of the CITING judgment and
       * production cannot compute it — so a calibration resting on it would be a
       * benchmark artefact rather than a product control.
       */
      const topSim = ordered.length > 0 ? Number(ordered[0][1].sim) : null;
      const fifth = ordered.length >= 5 ? Number(ordered[4][1].sim) : null;

      row.arms[arm.name] = {
        efSearch: arm.ef,
        latencyMs: ms,
        topSim,
        simGap: topSim !== null && fifth !== null ? Number((topSim - fifth).toFixed(6)) : null,
        aboveFloor: ordered.filter(([, v]) => Number(v.sim) >= SIM_FLOOR).length,
        passagesReturned: rows.length,
        documentsAfterAggregation: ranked.length,
        // Only the depth any metric reads. Storing 2,000 ids per task per arm
        // would make the artifact hundreds of MB for no measurement.
        topDocuments: ranked.slice(0, 500),
        topPassage: rows[0]
          ? { id: rows[0].id, chunkIndex: rows[0].chunk_index, charOffset: rows[0].char_offset, sim: rows[0].sim }
          : null,
      };
    }

    // Checkpointed per task. 160 of 283 queries were lost once to a teardown
    // because the write was at the end.
    appendFileSync(CKPT, JSON.stringify(row) + '\n');
    results.push(row);
    if ((i + 1) % 25 === 0) log(`  scored ${i + 1}/${tasks.length}`);
  }

  // Re-read everything from the checkpoint so a resumed run scores identically
  // to an uninterrupted one.
  const all = readFileSync(CKPT, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    // Same guard as the resume: a row scored against a different index size is a
    // different experiment and may not be averaged into this one.
    .filter((r) => r.indexPassages === Number(passageCount));
  const byId = new Map(all.map((r) => [r.taskId, r]));

  const score = (task, armRow) => {
    const targets = task.targets;
    const ranked = armRow.topDocuments;
    // Where did each target come from? This is the whole END_TO_END rule.
    const anyNatural = targets.some((x) => naturalGold.has(x) && indexed.has(x));
    const anyIndexed = targets.some((x) => indexed.has(x));
    let bestRank = Infinity;
    for (const x of targets) {
      const p = ranked.indexOf(x);
      if (p >= 0 && p + 1 < bestRank) bestRank = p + 1;
    }
    const out = { bestRank: Number.isFinite(bestRank) ? bestRank : null, anyNatural, anyIndexed };
    for (const k of KS) {
      // END_TO_END: a FORCED target is a MISS however well it ranks.
      out[`e2e@${k}`] = anyNatural && bestRank <= k ? 1 : 0;
      // CONDITIONAL: scored only over tasks whose target is in the index at all.
      out[`cond@${k}`] = anyIndexed ? (bestRank <= k ? 1 : 0) : null;
    }
    out.mrr = Number.isFinite(bestRank) ? 1 / bestRank : 0;
    out.e2eMrr = anyNatural && Number.isFinite(bestRank) ? 1 / bestRank : 0;
    // Single-target tasks, so nDCG reduces to 1/log2(rank+1).
    out.ndcg = Number.isFinite(bestRank) ? 1 / Math.log2(bestRank + 1) : 0;
    return out;
  };

  const families = {};
  const armNames = ARMS.map((a) => a.name);
  const scored = [];
  for (const t of tasks) {
    const r = byId.get(t.taskId);
    if (!r) continue;
    const s = { taskId: t.taskId, queryClass: t.queryClass, provenance: t.provenance, split: t.split, arms: {} };
    for (const a of armNames)
      s.arms[a] = {
        ...score(t, r.arms[a]),
        latencyMs: r.arms[a].latencyMs,
        topSim: r.arms[a].topSim,
        simGap: r.arms[a].simGap,
        aboveFloor: r.arms[a].aboveFloor,
      };
    scored.push(s);
    (families[t.queryClass] ??= []).push(s);
  }

  const agg = (rowsIn, arm) => {
    const n = rowsIn.length;
    if (n === 0) return null;
    const condDenom = rowsIn.filter((r) => r.arms[arm].anyIndexed).length;
    const o = { tasks: n, targetsInIndex: condDenom, targetsNatural: rowsIn.filter((r) => r.arms[arm].anyNatural).length };
    for (const k of KS) {
      o[`e2e_s@${k}`] = Number((rowsIn.reduce((a, r) => a + r.arms[arm][`e2e@${k}`], 0) / n).toFixed(4));
      o[`cond_s@${k}`] =
        condDenom === 0
          ? null
          : Number(
              (rowsIn.filter((r) => r.arms[arm].anyIndexed).reduce((a, r) => a + r.arms[arm][`cond@${k}`], 0) / condDenom).toFixed(4),
            );
    }
    o.e2e_mrr = Number((rowsIn.reduce((a, r) => a + r.arms[arm].e2eMrr, 0) / n).toFixed(4));
    o.cond_mrr =
      condDenom === 0
        ? null
        : Number((rowsIn.filter((r) => r.arms[arm].anyIndexed).reduce((a, r) => a + r.arms[arm].mrr, 0) / condDenom).toFixed(4));
    o.cond_ndcg =
      condDenom === 0
        ? null
        : Number((rowsIn.filter((r) => r.arms[arm].anyIndexed).reduce((a, r) => a + r.arms[arm].ndcg, 0) / condDenom).toFixed(4));
    const lat = rowsIn.map((r) => r.arms[arm].latencyMs).sort((a, b) => a - b);
    o.latencyP50 = lat[Math.floor(lat.length * 0.5)] ?? null;
    o.latencyP95 = lat[Math.floor(lat.length * 0.95)] ?? null;
    return o;
  };

  // ANN-vs-EXACT: what did the index LOSE? Measured as top-k document overlap
  // against the exact arm, per task, then averaged.
  const annLoss = {};
  for (const armName of ['ann_ef200', 'ann_ef40']) {
    const per = [];
    for (const t of tasks) {
      const r = byId.get(t.taskId);
      if (!r) continue;
      const ex = new Set(r.arms.exact.topDocuments.slice(0, 100));
      const an = r.arms[armName].topDocuments.slice(0, 100);
      const overlap = an.filter((x) => ex.has(x)).length;
      per.push(overlap / Math.max(1, ex.size));
      }
    annLoss[armName] = {
      recallAt100VsExact: Number((per.reduce((a, b) => a + b, 0) / Math.max(1, per.length)).toFixed(4)),
      tasksCompared: per.length,
      note: 'Fraction of the EXACT arm top-100 documents that the ANN arm also returned in its top-100. 1.0 means the index lost nothing at this depth.',
    };
  }

  const body = {
    kind: 'new1_passage_100k_metrics',
    version: 1,
    builtAt: new Date().toISOString(),
    trancheContentSha256: tranche.contentSha256,
    v31ManifestSha256: v31.manifestSha256 ?? null,
    indexState: {
      passages: Number(passageCount),
      documentsIndexed: indexed.size,
      trancheSelected: tranche.actualSize,
      forcedGold: forcedGold.size,
      buildComplete: indexed.size >= tranche.actualSize + forcedGold.size,
      note:
        'documentsIndexed is read from the DB, never from the manifest. If buildComplete is false these metrics describe a PREFIX of the tranche — and because the embed order is global priority-hash order, that prefix is a uniform sample of it.',
    },
    goldReachability: {
      total: tranche.gold.total,
      natural: tranche.gold.natural,
      forced: tranche.gold.forced,
      naturalAndIndexed: [...naturalGold].filter((x) => indexed.has(x)).length,
      forcedAndIndexed: [...forcedGold].filter((x) => indexed.has(x)).length,
      rule: 'END_TO_END counts a FORCED target as a MISS. CONDITIONAL may include it. Reporting one without the other is not permitted.',
    },
    arms: Object.fromEntries(armNames.map((a) => [a, agg(scored, a)])),
    byFamily: Object.fromEntries(
      Object.entries(families).map(([fam, rowsIn]) => [fam, Object.fromEntries(armNames.map((a) => [a, agg(rowsIn, a)]))]),
    ),
    bySplit: Object.fromEntries(
      ['DEVELOPMENT', 'HELD_OUT', 'UNASSIGNED'].map((s) => [
        s,
        Object.fromEntries(armNames.map((a) => [a, agg(scored.filter((r) => r.split === s), a)])),
      ]),
    ),
    annVsExact: annLoss,
    perTask: scored,
  };
  writeFileSync(OUT, JSON.stringify(body, null, 2) + '\n');

  log('');
  log('PASSAGE METRICS WRITTEN');
  log(`  file  ${OUT.pathname}`);
  log('');
  log('  arm         e2e_s@1  e2e_s@5  cond_s@1  cond_s@5  cond_mrr  p50ms');
  for (const a of armNames) {
    const x = body.arms[a];
    log(
      `  ${a.padEnd(11)} ${String(x['e2e_s@1']).padStart(7)} ${String(x['e2e_s@5']).padStart(8)} ` +
        `${String(x['cond_s@1']).padStart(9)} ${String(x['cond_s@5']).padStart(9)} ${String(x.cond_mrr).padStart(9)} ${String(x.latencyP50).padStart(6)}`,
    );
  }
  log('');
  log('  BY FAMILY (cond_s@5, ann_ef200) — no aggregate above may be read without this:');
  for (const [fam, v] of Object.entries(body.byFamily)) {
    const x = v.ann_ef200;
    log(`    ${fam.padEnd(22)} tasks ${String(x.tasks).padStart(3)}  inIndex ${String(x.targetsInIndex).padStart(3)}  cond_s@5 ${String(x['cond_s@5']).padStart(6)}  e2e_s@5 ${String(x['e2e_s@5']).padStart(6)}`);
  }
  log('');
  for (const [a, v] of Object.entries(annLoss)) log(`  ANN vs EXACT  ${a}: recall@100 ${v.recallAt100VsExact}`);
} finally {
  await sql.end({ timeout: 15 });
}
