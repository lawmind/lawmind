/**
 * NEW1 FINALIZATION — build the approved final HNSW over the coarse-v2 generation.
 *
 * Detached on purpose. A console signal on this box has killed Postgres six times
 * (0xC000013A); a multi-hour index build must never be attached to an interactive
 * shell. Launch with Start-Process, read the log.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INDEX FORM IS COPIED, NOT CHOSEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `halfvec(1024)` expression, `halfvec_cosine_ops`, m=16, ef_construction=64,
 * partial on `snapshot_hash = <ACTIVE>`. Every one of those is the form the R10
 * probe indexes already carry (`new1_probe_hnsw_250000_hnsw`,
 * `new1_probe_hnsw_1000000_hnsw`) and the form the four measured builds in
 * `docs/ai/new1-r10/hnsw-build-measurements.json` were taken on. Changing any of
 * them would make the measured 2,731 bytes/vector and the measured build-time
 * bracket describe a different object than the one being built.
 *
 * The partial predicate is what keeps the 486,955 pre-stamp legacy rows out. They
 * are a SEALED generation in `embedding_snapshot` (UNIDENTIFIED_LEGACY_V1) and
 * mixing them into the graph would put vectors of unknown provenance into the
 * same search space as the corpus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INDEX_CUT_AT IS CAPTURED BEFORE THE BUILD AND WRITTEN DOWN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/new1-r12/INDEX_CUT_POLICY.md` section 2. Rows arriving after the cut
 * are indexed automatically by pgvector's insert path, so the cut is not a
 * boundary anyone has to defend — it is the timestamp that makes "was this row in
 * the original graph or inserted later" answerable instead of guessed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAIN CREATE INDEX, NOT CONCURRENTLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The policy leaves this open and names the question that decides it: must the
 * delta queue keep writing during the build? It must not. The coarse walk is
 * terminal, and the queue has emitted zero rows on every pass for over a day
 * (`docs/ai/new1-r9/delta/queue-ledger.jsonl`) — it reads and classifies, and an
 * empty pass never inserts. CONCURRENTLY would buy nothing, cost a second table
 * pass, and can leave an INVALID index behind.
 *
 * If the queue DOES find work mid-build it blocks on the ShareLock rather than
 * failing: its connection sets `statement_timeout = 0`, and the scheduled task is
 * `MultipleInstances = IgnoreNew` with a 72-hour limit, so a blocked pass waits
 * out the build and later ticks are dropped rather than piling up.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * maintenance_work_mem IS SESSION-LOCAL AND DERIVED FROM TODAY'S HEADROOM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Never global: a global setting would apply to every autovacuum worker on a box
 * that is also serving the retrieval path. The value is passed in by the caller
 * from a live free-memory reading, not baked in here, because the right number on
 * a box with 10 GiB free is not the right number on a box with 24.
 */
import postgres from 'postgres';
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const OUT_DIR = new URL('docs/ai/new1-r14/', ROOT);
mkdirSync(OUT_DIR, { recursive: true });
const LOG = new URL('hnsw-final-build.log', OUT_DIR);
const RECEIPT = new URL(process.env.NEW1_RECEIPT_NAME ?? 'hnsw-final-build.json', OUT_DIR);
const PROGRESS = new URL(process.env.NEW1_PROGRESS_NAME ?? 'hnsw-build-progress.jsonl', OUT_DIR);

const SNAPSHOT = process.env.NEW1_SNAPSHOT_HASH ?? '5b5d02384b46c96c';
const MWM = process.env.NEW1_MAINTENANCE_WORK_MEM ?? '4GB';
const WORKERS = Number(process.env.NEW1_MAINT_WORKERS ?? 4);
const INDEX = 'new1_doc_vector_stage_hnsw';

const log = (m) => {
  const line = `${new Date().toISOString()}  ${m}\n`;
  process.stdout.write(line);
  appendFileSync(LOG, line);
};

const sql = postgres(url, {
  ssl: false,
  max: 1,
  onnotice: (n) => log(`NOTICE ${n.message}`),
  connection: { statement_timeout: 0, idle_in_transaction_session_timeout: 0 },
});

const receipt = {
  kind: 'new1_hnsw_final_build',
  startedAt: new Date().toISOString(),
  snapshotHash: SNAPSHOT,
  maintenanceWorkMem: MWM,
  maxParallelMaintenanceWorkers: WORKERS,
  indexName: INDEX,
};

try {
  log(`START final HNSW build — snapshot ${SNAPSHOT}, mwm ${MWM}, workers ${WORKERS}`);

  // ── the index must not already exist ──────────────────────────────────────
  const existing = await sql`SELECT indexdef FROM pg_indexes WHERE indexname = ${INDEX}`;
  if (existing.length > 0) {
    log(`REFUSED — ${INDEX} already exists: ${existing[0].indexdef}`);
    receipt.result = 'REFUSED_ALREADY_EXISTS';
    receipt.existingDef = existing[0].indexdef;
    throw new Error('index already exists');
  }

  // ── the generation must still be the single ACTIVE one ────────────────────
  const active = await sql`SELECT snapshot_hash, state FROM embedding_snapshot WHERE state = 'ACTIVE'`;
  if (active.length !== 1 || active[0].snapshot_hash !== SNAPSHOT) {
    log(`REFUSED — ACTIVE generation is ${JSON.stringify(active)}, not ${SNAPSHOT}`);
    receipt.result = 'REFUSED_GENERATION_NOT_ACTIVE';
    throw new Error('generation is not the single ACTIVE one');
  }

  // ── the eligibility definition must still hash to the generation id ───────
  const [{ h }] = await sql`
    SELECT substr(encode(sha256(pg_get_viewdef('judgment_embedding_eligibility'::regclass, true)::bytea), 'hex'), 1, 16) AS h`;
  if (h !== SNAPSHOT) {
    log(`REFUSED — deployed eligibility view hashes to ${h}, not ${SNAPSHOT}`);
    receipt.result = 'REFUSED_VIEW_DRIFT';
    throw new Error('eligibility view drifted');
  }
  log(`contract identity confirmed: deployed view hashes to ${h}, ACTIVE generation matches`);

  // ── INDEX_CUT_AT, read from the database, before anything else ────────────
  const [{ cut }] = await sql`SELECT now() AS cut`;
  receipt.indexCutAt = cut;
  log(`INDEX_CUT_AT ${cut.toISOString()}`);

  // ── residual at the cut. Bounded by created_at, so it is cheap: the
  //    corpus-wide census already proved zero, and this only has to cover what
  //    arrived while that census was running or since it finished.
  const since = process.env.NEW1_CENSUS_FROM ?? '2026-09-15T09:18:00Z';
  const [resid] = await sql`
    WITH e AS (
      SELECT el.content_hash
      FROM judgments j
      JOIN judgment_embedding_eligibility el ON el.id = j.id
      WHERE j.created_at >= ${since}::timestamptz
        AND j.created_at <= ${cut}
        AND el.axis_a_identity AND el.axis_b_text AND el.axis_c_role
        AND coalesce(el.is_bail_order, false) = false
        AND el.value_band = ANY(ARRAY['standard','full','substantial'])
    )
    SELECT count(*)::int AS considered,
           count(*) FILTER (
             WHERE NOT EXISTS (
               SELECT 1 FROM new1_doc_vector_stage s
               WHERE s.content_hash = e.content_hash AND s.snapshot_hash = ${SNAPSHOT})
           )::int AS uncovered
    FROM e`;
  receipt.residualSinceCensus = { since, considered: resid.considered, uncovered: resid.uncovered };
  log(`residual since census (${since} .. cut): considered ${resid.considered}, uncovered ${resid.uncovered}`);
  if (resid.uncovered > 0) {
    receipt.result = 'REFUSED_RESIDUAL_AT_CUT';
    throw new Error(`${resid.uncovered} eligible content identities are uncovered at INDEX_CUT_AT`);
  }

  const [{ n }] = await sql`SELECT count(*)::bigint AS n FROM new1_doc_vector_stage WHERE snapshot_hash = ${SNAPSHOT}`;
  receipt.rowsToIndex = Number(n);
  log(`rows to index ${n}`);

  // ── build ─────────────────────────────────────────────────────────────────
  await sql.unsafe(`SET maintenance_work_mem = '${MWM}'`);
  await sql.unsafe(`SET max_parallel_maintenance_workers = ${WORKERS}`);
  const [mem] = await sql`
    SELECT current_setting('maintenance_work_mem') AS mwm,
           current_setting('max_parallel_maintenance_workers') AS w`;
  log(`session settings confirmed: maintenance_work_mem=${mem.mwm} max_parallel_maintenance_workers=${mem.w}`);
  receipt.sessionSettingsConfirmed = { maintenance_work_mem: mem.mwm, max_parallel_maintenance_workers: mem.w };

  const ddl =
    `CREATE INDEX ${INDEX} ON new1_doc_vector_stage ` +
    `USING hnsw (((embedding)::halfvec(1024)) halfvec_cosine_ops) ` +
    `WITH (m = 16, ef_construction = 64) ` +
    `WHERE (snapshot_hash = '${SNAPSHOT}')`;
  receipt.ddl = ddl;
  log(`DDL ${ddl}`);

  /**
   * A SECOND connection samples pg_stat_progress_create_index while the first
   * blocks in CREATE INDEX. Attempt 1 ran for 4h55m at 4 GB / 4 workers and was
   * cancelled at 52.5%: measured clean, it did 233 tuples/s at 1.9M elements,
   * 31/s at 4.0M and 24.7/s at 4.03M. A decaying rate is invisible in a single
   * end-of-run duration, and it is the only thing that says early whether a build
   * will land today or in a week. The curve is the artifact.
   */
  const probe = postgres(url, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });
  let lastTuples = 0;
  let lastAt = Date.now();
  const sampler = setInterval(async () => {
    try {
      const [p] = await probe`
        SELECT phase, tuples_done::bigint AS tuples, blocks_done::bigint AS blocks, blocks_total::bigint AS blocks_total
        FROM pg_stat_progress_create_index LIMIT 1`;
      if (!p) return;
      const now = Date.now();
      const tuples = Number(p.tuples);
      const rate = (tuples - lastTuples) / ((now - lastAt) / 1000);
      const remaining = Number(n) - tuples;
      const rec = {
        at: new Date(now).toISOString(),
        phase: p.phase,
        tuples,
        blocks: Number(p.blocks),
        blocksTotal: Number(p.blocks_total),
        tuplesPerSecond: Number(rate.toFixed(1)),
        projectedHoursRemaining: rate > 0 ? Number((remaining / rate / 3600).toFixed(2)) : null,
      };
      appendFileSync(PROGRESS, `${JSON.stringify(rec)}\n`);
      log(`progress ${tuples}/${n} (${((100 * tuples) / Number(n)).toFixed(1)}%) ${rec.tuplesPerSecond}/s projected ${rec.projectedHoursRemaining}h remaining`);
      lastTuples = tuples;
      lastAt = now;
    } catch (e) {
      log(`progress sample failed: ${e.message}`);
    }
  }, Number(process.env.NEW1_PROGRESS_MS ?? 300_000));

  const t0 = Date.now();
  try {
    await sql.unsafe(ddl);
  } finally {
    clearInterval(sampler);
    await probe.end({ timeout: 5 }).catch(() => {});
  }
  const seconds = (Date.now() - t0) / 1000;
  receipt.buildSeconds = seconds;
  log(`INDEX BUILT in ${seconds.toFixed(1)}s (${(seconds / 3600).toFixed(2)}h)`);

  const [sz] = await sql`
    SELECT pg_relation_size(${INDEX}::regclass) AS bytes,
           pg_size_pretty(pg_relation_size(${INDEX}::regclass)) AS pretty,
           (SELECT indexdef FROM pg_indexes WHERE indexname = ${INDEX}) AS def,
           (SELECT indisvalid FROM pg_index WHERE indexrelid = ${INDEX}::regclass) AS valid`;
  receipt.indexBytes = Number(sz.bytes);
  receipt.indexSize = sz.pretty;
  receipt.indexDef = sz.def;
  receipt.indexValid = sz.valid;
  receipt.bytesPerVector = Math.round(Number(sz.bytes) / Number(n));
  log(`index ${sz.pretty} (${sz.bytes} bytes, ${receipt.bytesPerVector} B/vector), valid=${sz.valid}`);

  receipt.result = sz.valid ? 'BUILT' : 'BUILT_INVALID';
  receipt.finishedAt = new Date().toISOString();
  log(`BUILD COMPLETE ${receipt.result}`);
} catch (e) {
  receipt.result = receipt.result ?? 'FAILED';
  receipt.error = e.message;
  receipt.finishedAt = new Date().toISOString();
  log(`FAILED ${e.message}`);
  process.exitCode = 1;
} finally {
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  await sql.end({ timeout: 10 });
}
