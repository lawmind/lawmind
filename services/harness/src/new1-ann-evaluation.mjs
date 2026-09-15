/**
 * NEW1 FINALIZATION — EXACT vs ANN over the final HNSW.
 *
 * Creating an index successfully is not evidence that search works. This is the
 * measurement `docs/ai/new1-r12/INDEX_CUT_POLICY.md` makes mandatory before any
 * semantic capability is exposed, and it is the only thing that can distinguish
 * "the graph was built" from "the graph finds what a sequential scan finds".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUERY VECTORS ARE FROZEN, NOT RE-EMBEDDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/new1-halfvec/eval-query-vectors.json` — the same 283 vectors every
 * probe in this lane has used since 19 Aug. Re-embedding per experiment would
 * make two runs differ by the embedder as well as by the thing under test, and
 * BGE-M3 through onnxruntime is not bit-identical across providers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO BASELINES, BECAUSE THERE ARE TWO LOSSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `exact_halfvec`  sequential scan in the index's own representation. Recall
 *                  against this is GRAPH loss alone — what HNSW missed.
 * `exact_fp32`     sequential scan on the stored fp32 vectors. Recall against
 *                  this is TOTAL loss — graph plus half-precision quantisation.
 *
 * Reporting only the first would flatter the index; reporting only the second
 * would blame the graph for the representation. Both are cheap to take together
 * because they share the scan budget, and the difference between them is the
 * number that decides whether halfvec is still the right call at 7.65M rows.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ef_search IS SET, NEVER INHERITED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An ad-hoc vector query runs at pgvector's default 40 while production runs 200.
 * Every ANN measurement here sets `hnsw.ef_search` explicitly on its own
 * connection and reads it back, so no number in this artifact describes a setting
 * nobody chose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHECKPOINTED PER QUERY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 160 of 283 queries were lost once to a teardown because the write was at the
 * end. Every query appends its own line before the next one starts, and a rerun
 * resumes from what is on disk.
 */
import postgres from 'postgres';
import { readFileSync, existsSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const OUT_DIR = new URL('docs/ai/new1-r14/', ROOT);
mkdirSync(OUT_DIR, { recursive: true });
/** Suffix every artifact, so a 1M probe run can never be mistaken for a full run. */
const TAG = process.env.NEW1_EVAL_TAG ?? '';
const LOG = new URL(`ann-eval${TAG}.log`, OUT_DIR);
const EXACT_CK = new URL(`ann-eval-exact${TAG}.jsonl`, OUT_DIR);
const ANN_CK = new URL(`ann-eval-ann${TAG}.jsonl`, OUT_DIR);

const SNAPSHOT = process.env.NEW1_SNAPSHOT_HASH ?? '5b5d02384b46c96c';
/**
 * WHICH OBJECT IS UNDER TEST.
 *
 * Default is the final index over the whole generation. It is a parameter and not
 * a constant because the 7.67M-row build did not complete on this box (see
 * HNSW_BUILD_COST_AT_SCALE.md), and the identically-shaped 1M-row probe
 * (`new1_probe_hnsw_1000000`, halfvec(1024), m=16, ef_construction=64, partial on
 * the same snapshot) is the largest object of the approved form that DOES exist.
 *
 * Every artifact this writes records the table, the index and the row count, so a
 * number taken at 1M can never be read later as a number taken at 7.67M.
 */
const TABLE = process.env.NEW1_EVAL_TABLE ?? 'new1_doc_vector_stage';
const INDEX = process.env.NEW1_EVAL_INDEX ?? 'new1_doc_vector_stage_hnsw';
const EF_VALUES = (process.env.NEW1_EF_VALUES ?? '40,64,100,200,400').split(',').map(Number);
const TOPK = 100;
/** How many of the 283 get the expensive exact arm. Stated in the artifact. */
const EXACT_N = Number(process.env.NEW1_EXACT_N ?? 40);

const log = (m) => {
  const line = `${new Date().toISOString()}  ${m}\n`;
  process.stdout.write(line);
  appendFileSync(LOG, line);
};

const readJsonl = (u) =>
  existsSync(u)
    ? readFileSync(u, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

const lit = (v) => `[${v.join(',')}]`;
const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const sql = postgres(url, {
  ssl: false,
  max: 1,
  onnotice: () => {},
  connection: { statement_timeout: 0, idle_in_transaction_session_timeout: 0 },
});

/**
 * The two shapes this harness has to span.
 *
 * `new1_doc_vector_stage` carries `content_hash` and `court` on the row. The R10
 * probe tables carry neither — only `judgment_id`, `snapshot_hash`, `embedding`.
 * Recall must be matched on CONTENT identity where that exists, because two
 * judgments with byte-identical text are one answer and counting them as two
 * would inflate recall; where it does not exist, `judgment_id` is the identity
 * and the distinction cannot arise. The court filter joins `judgments` when the
 * table has no court of its own, which is also the shape production would use.
 *
 * Resolved from the catalogue at startup and RECORDED in the artifact, never
 * assumed, so the artifact says which identity its recall figures were matched on.
 */
let IDENT_SQL = 's.content_hash';
let IDENT_JOIN = '';
let COURT_SQL = 's.court';
let COURT_JOIN = '';
let IDENT_KIND = 'content_hash';

async function resolveShape() {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = ${TABLE}`;
  const have = new Set(cols.map((c) => c.column_name));
  if (!have.has('embedding') || !have.has('snapshot_hash') || !have.has('judgment_id')) {
    throw new Error(`${TABLE} does not have the columns this harness needs: ${[...have].join(', ')}`);
  }
  if (have.has('content_hash')) {
    IDENT_SQL = 's.content_hash';
    IDENT_JOIN = '';
    IDENT_KIND = 'content_hash';
  } else {
    IDENT_SQL = 's.judgment_id::text';
    IDENT_JOIN = '';
    IDENT_KIND = 'judgment_id';
  }
  if (have.has('court')) {
    COURT_SQL = 's.court';
    COURT_JOIN = '';
  } else {
    COURT_SQL = 'j.court';
    COURT_JOIN = 'JOIN judgments j ON j.id = s.judgment_id';
  }
}

const fixture = JSON.parse(readFileSync(new URL('docs/ai/new1-halfvec/eval-query-vectors.json', ROOT), 'utf8'));
const QUERIES = fixture.queries;

/**
 * The exact subset is a DETERMINISTIC stride through the fixture order, not a
 * random draw: a rerun must measure the same queries, and the fixture order
 * interleaves the two groups already.
 */
function exactSubset() {
  if (EXACT_N >= QUERIES.length) return QUERIES;
  const stride = QUERIES.length / EXACT_N;
  const out = [];
  for (let i = 0; i < EXACT_N; i++) out.push(QUERIES[Math.floor(i * stride)]);
  return out;
}

/**
 * Map each gold judgment id to the identity the RESULT ROWS carry.
 *
 * On `new1_doc_vector_stage` that is `content_hash`, because the stage row for a
 * gold judgment may legitimately be its byte-identical twin's row and matching on
 * the id alone would score a correct hit as a miss. On a probe table with no
 * content_hash the row identity IS the judgment id, and mapping to content_hash
 * there compares a hash against a uuid and can only ever return zero — which is
 * exactly the false negative this function has to avoid.
 */
async function goldIdentities() {
  const ids = [...new Set(QUERIES.flatMap((q) => q.gold ?? []))];
  const m = new Map();
  if (IDENT_KIND === 'judgment_id') {
    for (const id of ids) m.set(id, id);
    return m;
  }
  const rows = await sql`SELECT id, content_hash FROM judgments WHERE id = ANY(${ids}::uuid[])`;
  for (const r of rows) m.set(r.id, r.content_hash);
  return m;
}

/**
 * The exact arm must NOT use the index we are measuring. `SET LOCAL` is wrong
 * here: postgres.js sends a parameterised query over the extended protocol,
 * which carries one statement per message and has no implicit transaction block
 * for a LOCAL setting to live in. The plan-forcing settings are therefore set on
 * the SESSION, asserted by reading them back, and reset afterwards.
 */
async function withSeqScan(fn) {
  await sql.unsafe('SET enable_indexscan = off');
  await sql.unsafe('SET enable_bitmapscan = off');
  const [g] = await sql`SELECT current_setting('enable_indexscan') AS i, current_setting('enable_bitmapscan') AS b`;
  if (g.i !== 'off' || g.b !== 'off') throw new Error(`plan forcing did not take: indexscan=${g.i} bitmapscan=${g.b}`);
  try {
    return await fn();
  } finally {
    await sql.unsafe('RESET enable_indexscan');
    await sql.unsafe('RESET enable_bitmapscan');
  }
}

async function runExact(q) {
  const v = lit(q.vector);
  return withSeqScan(async () => {
    const t0 = Date.now();
    const rows = await sql.unsafe(
      `SELECT s.judgment_id, ${IDENT_SQL} AS ident,
              (s.embedding::halfvec(1024) <=> $1::halfvec(1024)) AS d_half
       FROM ${TABLE} s ${IDENT_JOIN}
       WHERE s.snapshot_hash = $2
       ORDER BY s.embedding::halfvec(1024) <=> $1::halfvec(1024)
       LIMIT ${TOPK}`,
      [v, SNAPSHOT],
    );
    const halfMs = Date.now() - t0;

    const t1 = Date.now();
    const rows32 = await sql.unsafe(
      `SELECT s.judgment_id, ${IDENT_SQL} AS ident,
              (s.embedding <=> $1::vector(1024)) AS d_fp32
       FROM ${TABLE} s ${IDENT_JOIN}
       WHERE s.snapshot_hash = $2
       ORDER BY s.embedding <=> $1::vector(1024)
       LIMIT ${TOPK}`,
      [v, SNAPSHOT],
    );
    const fp32Ms = Date.now() - t1;

    return {
      id: q.id,
      group: q.group,
      gold: q.gold ?? [],
      exactHalfvec: rows.map((r) => ({ j: r.judgment_id, c: r.ident, d: Number(r.d_half) })),
      exactFp32: rows32.map((r) => ({ j: r.judgment_id, c: r.ident, d: Number(r.d_fp32) })),
      halfMs,
      fp32Ms,
    };
  });
}

/**
 * `hnsw.iterative_scan` is the setting that decides whether a FILTERED query can
 * be complete. pgvector applies a non-indexed predicate AFTER the index scan, so
 * with iterative scan off a narrow filter silently returns fewer than k rows — an
 * empty screen that is a property of the index, not of the law. The filtered arm
 * is therefore measured BOTH ways rather than at whichever default the session
 * happened to inherit.
 */
async function runAnn(q, ef, { filtered = false, court = null, iterative = 'off' } = {}) {
  const v = lit(q.vector);
  await sql.unsafe(`SET hnsw.ef_search = ${ef}`);
  await sql.unsafe(`SET hnsw.iterative_scan = ${iterative}`);
  const [chk] = await sql`
    SELECT current_setting('hnsw.ef_search') AS ef, current_setting('hnsw.iterative_scan') AS it`;
  if (Number(chk.ef) !== ef) throw new Error(`ef_search did not take: asked ${ef}, read ${chk.ef}`);
  if (chk.it !== iterative) throw new Error(`iterative_scan did not take: asked ${iterative}, read ${chk.it}`);

  const t0 = Date.now();
  const rows = filtered
    ? await sql.unsafe(
        `SELECT s.judgment_id, ${IDENT_SQL} AS ident, ${COURT_SQL} AS court,
                (s.embedding::halfvec(1024) <=> $1::halfvec(1024)) AS d
         FROM ${TABLE} s ${COURT_JOIN}
         WHERE s.snapshot_hash = $2 AND ${COURT_SQL} = $3
         ORDER BY s.embedding::halfvec(1024) <=> $1::halfvec(1024)
         LIMIT ${TOPK}`,
        [v, SNAPSHOT, court],
      )
    : await sql.unsafe(
        `SELECT s.judgment_id, ${IDENT_SQL} AS ident,
                (s.embedding::halfvec(1024) <=> $1::halfvec(1024)) AS d
         FROM ${TABLE} s ${IDENT_JOIN}
         WHERE s.snapshot_hash = $2
         ORDER BY s.embedding::halfvec(1024) <=> $1::halfvec(1024)
         LIMIT ${TOPK}`,
        [v, SNAPSHOT],
      );
  const ms = Date.now() - t0;
  return { ms, rows: rows.map((r) => ({ j: r.judgment_id, c: r.ident, d: Number(r.d) })) };
}

/** recall@k of `got` against `truth`, matched on CONTENT identity, not row id. */
function recallAt(truth, got, k) {
  const t = new Set(truth.slice(0, k).map((r) => r.c));
  if (t.size === 0) return null;
  let hit = 0;
  for (const r of got.slice(0, k)) if (t.has(r.c)) hit++;
  return hit / t.size;
}

/**
 * The EXPLAIN is taken with the SAME bind parameters the measurement used. An
 * inlined literal is not evidence here: a bind parameter has already, once,
 * changed a plan in this repository from cost 18.72 to 9,255,009, so a plan
 * printed from a hand-edited query describes a statement nobody ran.
 */
async function explainFor(q, ef, { filtered = false, court = null, iterative = 'off' } = {}) {
  await sql.unsafe(`SET hnsw.ef_search = ${ef}`);
  await sql.unsafe(`SET hnsw.iterative_scan = ${iterative}`);
  const rows = filtered
    ? await sql.unsafe(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
         SELECT s.judgment_id FROM ${TABLE} s ${COURT_JOIN}
         WHERE s.snapshot_hash = $2 AND ${COURT_SQL} = $3
         ORDER BY s.embedding::halfvec(1024) <=> $1::halfvec(1024)
         LIMIT ${TOPK}`,
        [lit(q.vector), SNAPSHOT, court],
      )
    : await sql.unsafe(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
         SELECT s.judgment_id FROM ${TABLE} s
         WHERE s.snapshot_hash = $2
         ORDER BY s.embedding::halfvec(1024) <=> $1::halfvec(1024)
         LIMIT ${TOPK}`,
        [lit(q.vector), SNAPSHOT],
      );
  return rows.map((r) => r['QUERY PLAN']).join('\n');
}

async function main() {
  /**
   * Load pgvector explicitly before touching its GUCs. Postgres accepts a dotted
   * setting it does not know as a PLACEHOLDER, so `SET hnsw.ef_search = 200`
   * followed by `current_setting` would read back 200 and assert clean even on a
   * connection where the extension had never been loaded and the setting governed
   * nothing. LOAD makes the assertion mean what it says.
   */
  await sql.unsafe(`LOAD 'vector'`);
  const guc = await sql`
    SELECT name, setting FROM pg_settings
    WHERE name IN ('hnsw.ef_search','hnsw.iterative_scan','hnsw.max_scan_tuples','hnsw.scan_mem_multiplier')
    ORDER BY name`;
  if (guc.length !== 4) throw new Error(`pgvector GUCs not registered: ${JSON.stringify(guc)}`);
  log(`pgvector GUCs: ${guc.map((g) => `${g.name}=${g.setting}`).join(' ')}`);

  log(`START ann evaluation — snapshot ${SNAPSHOT}, ef ${EF_VALUES.join('/')}, exact subset ${EXACT_N}/${QUERIES.length}`);

  await resolveShape();
  log(`table ${TABLE}, index ${INDEX}, identity matched on ${IDENT_KIND}`);

  const [{ def, valid, bytes }] = await sql`
    SELECT (SELECT indexdef FROM pg_indexes WHERE indexname = ${INDEX}) AS def,
           (SELECT indisvalid FROM pg_index WHERE indexrelid = ${INDEX}::regclass) AS valid,
           pg_relation_size(${INDEX}::regclass) AS bytes`;
  if (!valid) throw new Error(`${INDEX} is not valid — refusing to measure it`);
  const [{ rows_indexed }] = await sql.unsafe(
    `SELECT count(*)::bigint AS rows_indexed FROM ${TABLE} WHERE snapshot_hash = $1`,
    [SNAPSHOT],
  );
  log(`index valid, ${bytes} bytes, ${rows_indexed} rows in the indexed population`);

  // ── EXACT ARM, checkpointed ───────────────────────────────────────────────
  const subset = exactSubset();
  const done = new Set(readJsonl(EXACT_CK).map((r) => r.id));
  log(`exact arm: ${subset.length} queries, ${done.size} already checkpointed`);
  for (const [i, q] of subset.entries()) {
    if (done.has(q.id)) continue;
    const r = await runExact(q);
    appendFileSync(EXACT_CK, `${JSON.stringify(r)}\n`);
    log(`  exact ${i + 1}/${subset.length} ${q.id}  halfvec ${r.halfMs}ms  fp32 ${r.fp32Ms}ms`);
  }
  const exact = new Map(readJsonl(EXACT_CK).map((r) => [r.id, r]));

  // ── ANN ARM ───────────────────────────────────────────────────────────────
  const annDone = new Set(readJsonl(ANN_CK).map((r) => `${r.ef}:${r.id}:${r.pass}`));
  const courts = await sql.unsafe(
    `SELECT ${COURT_SQL} AS court, count(*)::bigint AS n
     FROM ${TABLE} s ${COURT_JOIN}
     WHERE s.snapshot_hash = $1
     GROUP BY ${COURT_SQL} ORDER BY 2 DESC LIMIT 1`,
    [SNAPSHOT],
  );
  const bigCourt = courts[0].court;
  log(`filtered-arm court: ${bigCourt} (${courts[0].n} rows)`);

  for (const ef of EF_VALUES) {
    for (const [i, q] of QUERIES.entries()) {
      // cold-ish pass first, then a warm repeat: the same query twice, the
      // second one reading what the first pulled into cache. Level 1 of any
      // latency curve pays the cold cost, so it is recorded separately rather
      // than averaged in.
      for (const pass of ['cold', 'warm']) {
        const key = `${ef}:${q.id}:${pass}`;
        if (annDone.has(key)) continue;
        const a = await runAnn(q, ef);
        const rec = { ef, id: q.id, group: q.group, pass, ms: a.ms, rows: pass === 'warm' ? [] : a.rows, n: a.rows.length };
        if (pass === 'cold') rec.rows = a.rows;
        appendFileSync(ANN_CK, `${JSON.stringify(rec)}\n`);
      }
      // filtered arm, one pass per query per iterative_scan mode
      for (const it of ['off', 'relaxed_order']) {
        const fkey = `${ef}:${q.id}:filtered-${it}`;
        if (annDone.has(fkey)) continue;
        const f = await runAnn(q, ef, { filtered: true, court: bigCourt, iterative: it });
        appendFileSync(
          ANN_CK,
          `${JSON.stringify({ ef, id: q.id, group: q.group, pass: `filtered-${it}`, iterative: it, ms: f.ms, rows: f.rows, n: f.rows.length, court: bigCourt })}\n`,
        );
      }
      if ((i + 1) % 50 === 0) log(`  ann ef=${ef} ${i + 1}/${QUERIES.length}`);
    }
    log(`ann arm ef=${ef} complete`);
  }
  return { bytes, def, bigCourt, exact, subset, rowsIndexed: Number(rows_indexed) };
}

async function report(ctx) {
  const { bytes, def, bigCourt, exact, subset, rowsIndexed } = ctx;
  const ann = readJsonl(ANN_CK);
  const golds = await goldIdentities();

  /**
   * How many gold targets are in the indexed population AT ALL.
   *
   * `knownTargetRetention` is a ratio whose denominator is queries, not reachable
   * targets. On a sampled probe table most gold judgments are simply absent, and
   * the ratio then reads 0 — which looks like a retrieval failure and is really a
   * population fact. Reporting the two together is the difference between "the
   * index lost them" and "they were never in it".
   */
  const goldIds = [...new Set(QUERIES.flatMap((q) => q.gold ?? []))];
  const presentRows = await sql.unsafe(
    `SELECT s.judgment_id FROM ${TABLE} s
     WHERE s.snapshot_hash = $1 AND s.judgment_id = ANY($2::uuid[])`,
    [SNAPSHOT, goldIds],
  );
  const presentGold = new Set(presentRows.map((r) => r.judgment_id));
  const goldPresent = { present: presentGold.size };
  /** Queries with at least one gold target actually in this indexed population. */
  const reachableGold = new Set(
    QUERIES.filter((q) => (q.gold ?? []).some((g) => presentGold.has(g))).map((q) => q.id),
  );

  const out = {
    kind: 'new1_ann_evaluation',
    writtenAt: new Date().toISOString(),
    snapshotHash: SNAPSHOT,
    table: TABLE,
    indexName: INDEX,
    rowsIndexed,
    identityMatchedOn: IDENT_KIND,
    scaleWarning:
      TABLE === 'new1_doc_vector_stage'
        ? 'Measured on the full generation.'
        : `MEASURED ON ${rowsIndexed} ROWS, NOT ON THE FULL ${'7,673,717'}-ROW GENERATION. ` +
          'The index form is identical (halfvec(1024), halfvec_cosine_ops, m=16, ' +
          'ef_construction=64, partial on the same snapshot), so these figures describe ' +
          'the FORM faithfully. They do NOT describe the full-generation index, which was ' +
          'not built — recall and latency both move with graph size, and nothing here ' +
          'licenses a claim about 7.67M rows.',
    indexDef: def,
    indexBytes: Number(bytes),
    topK: TOPK,
    queriesTotal: QUERIES.length,
    exactSubsetSize: subset.length,
    exactSubsetNote:
      `The exact arm is a sequential scan of ${SNAPSHOT} for every query, twice ` +
      `(halfvec and fp32). It is run on a deterministic stride subset because a ` +
      `full 283-query exact arm is two scans per query over a 45 GB table. ` +
      `Recall figures are therefore over ${subset.length} queries; latency and ` +
      `zero-result figures are over all ${QUERIES.length}.`,
    filteredCourt: bigCourt,
    goldTargets: {
      distinctGoldJudgments: goldIds.length,
      presentInIndexedPopulation: goldPresent.present,
      queriesWithReachableGold: reachableGold.size,
      note:
        goldPresent.present === 0
          ? 'NONE of the gold judgments is in this indexed population, so knownTargetRetention says nothing about the index. It is a property of which rows this table holds.'
          : 'knownTargetRetention is computed ONLY over the ' + reachableGold.size + ' queries whose gold target is actually present in this indexed population. Queries whose gold is absent are excluded rather than scored as misses, because a target that was never in the table cannot be retained.',
    },
    byEf: [],
  };

  for (const ef of EF_VALUES) {
    const cold = ann.filter((r) => r.ef === ef && r.pass === 'cold');
    const warm = ann.filter((r) => r.ef === ef && r.pass === 'warm');
    const filtOff = ann.filter((r) => r.ef === ef && r.pass === 'filtered-off');
    const filtRel = ann.filter((r) => r.ef === ef && r.pass === 'filtered-relaxed_order');
    const byId = new Map(cold.map((r) => [r.id, r]));

    const rec = { halfvec: {}, fp32: {} };
    for (const k of [10, 50, 100]) {
      const hs = [];
      const fs = [];
      for (const q of subset) {
        const e = exact.get(q.id);
        const a = byId.get(q.id);
        if (!e || !a) continue;
        const rh = recallAt(e.exactHalfvec, a.rows, k);
        const rf = recallAt(e.exactFp32, a.rows, k);
        if (rh !== null) hs.push(rh);
        if (rf !== null) fs.push(rf);
      }
      rec.halfvec[`recall@${k}`] = hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : null;
      rec.fp32[`recall@${k}`] = fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : null;
      rec.queriesScored = hs.length;
    }

    // known-target retention: does the gold judgment's CONTENT appear in top-k
    let goldIn = 0;
    let goldTotal = 0;
    for (const q of QUERIES) {
      const a = byId.get(q.id);
      if (!a) continue;
      const want = new Set((q.gold ?? []).map((g) => golds.get(g)).filter(Boolean));
      if (want.size === 0) continue;
      // Only queries whose gold is actually IN the indexed population can be
      // retained; counting the rest would measure the sample, not the index.
      if (!reachableGold.has(q.id)) continue;
      goldTotal++;
      if (a.rows.some((r) => want.has(String(r.c)))) goldIn++;
    }

    const zero = cold.filter((r) => r.n === 0).length;
    const filteredSummary = (rows, mode) => ({
      iterativeScan: mode,
      court: bigCourt,
      p50: pct(rows.map((r) => r.ms), 50),
      p95: pct(rows.map((r) => r.ms), 95),
      p99: pct(rows.map((r) => r.ms), 99),
      zeroResults: rows.filter((r) => r.n === 0).length,
      shortOfK: rows.filter((r) => r.n > 0 && r.n < TOPK).length,
      meanRowsReturned: rows.length ? rows.reduce((a, r) => a + r.n, 0) / rows.length : null,
      n: rows.length,
    });

    out.byEf.push({
      ef,
      recall: rec,
      knownTargetRetention: goldTotal ? goldIn / goldTotal : null,
      knownTargetQueries: goldTotal,
      warm: { p50: pct(warm.map((r) => r.ms), 50), p95: pct(warm.map((r) => r.ms), 95), p99: pct(warm.map((r) => r.ms), 99), n: warm.length },
      coldish: { p50: pct(cold.map((r) => r.ms), 50), p95: pct(cold.map((r) => r.ms), 95), p99: pct(cold.map((r) => r.ms), 99), n: cold.length },
      filtered: {
        iterativeScanOff: filteredSummary(filtOff, 'off'),
        iterativeScanRelaxedOrder: filteredSummary(filtRel, 'relaxed_order'),
      },
      zeroResultsUnfiltered: zero,
    });
  }

  const exactRows = [...exact.values()];
  out.exactBaseline = {
    halfvecMs: { p50: pct(exactRows.map((r) => r.halfMs), 50), p95: pct(exactRows.map((r) => r.halfMs), 95) },
    fp32Ms: { p50: pct(exactRows.map((r) => r.fp32Ms), 50), p95: pct(exactRows.map((r) => r.fp32Ms), 95) },
    n: exactRows.length,
  };
  out.explainAtProductionEf = await explainFor(QUERIES[0], 200);
  out.explainFilteredAtProductionEf = await explainFor(QUERIES[0], 200, {
    filtered: true,
    court: bigCourt,
    iterative: 'relaxed_order',
  });
  out.explainExactBaseline = await withSeqScan(async () => {
    const rows = await sql.unsafe(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT judgment_id FROM new1_doc_vector_stage
       WHERE snapshot_hash = $2
       ORDER BY embedding::halfvec(1024) <=> $1::halfvec(1024)
       LIMIT ${TOPK}`,
      [lit(QUERIES[0].vector), SNAPSHOT],
    );
    return rows.map((r) => r['QUERY PLAN']).join('\n');
  });
  out.explainFilteredNote =
    'pgvector applies a non-indexed filter AFTER the index scan, so the filtered ' +
    'arm measures completeness directly: shortOfK counts queries that returned ' +
    'fewer than topK rows because the court predicate ate the ANN pool. The arm is ' +
    'run at hnsw.iterative_scan = off AND relaxed_order, because that setting is ' +
    'what decides whether a filtered query can be complete at all, and a number ' +
    'taken at whichever value the session inherited would describe nothing.';
  out.unfilteredIterativeScan =
    'off — the unfiltered arm has no predicate for iterative scan to satisfy, so it ' +
    'is measured at the pgvector default and the setting is asserted, not inherited.';

  writeFileSync(new URL(`ann-evaluation${TAG}.json`, OUT_DIR), `${JSON.stringify(out, null, 2)}\n`);
  log(`WROTE docs/ai/new1-r14/ann-evaluation${TAG}.json`);
  return out;
}

try {
  const ctx = await main();
  await report(ctx);
  log('ANN EVALUATION COMPLETE');
} catch (e) {
  log(`FAILED ${e.message}\n${e.stack}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
