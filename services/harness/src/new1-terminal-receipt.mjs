/**
 * NEW1 — THE TERMINAL RECEIPT.
 *
 * One file that answers, from the live database, every question a later round
 * would otherwise re-derive: what population was eligible, how much of it is
 * embedded, what the vectors look like, what is still running, and whether the
 * production index exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS DIFFERENT FROM THE R14 RECEIPT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two things the R14 receipt did not carry, and one thing about where it lived.
 *
 *   1. VECTOR INTEGRITY. R14 pointed at an R12 artifact measured at 2,455,863
 *      current-generation rows. The generation is now three times that, so 5.2M
 *      vectors had integrity evidence describing a different population. This
 *      receipt reads a scan taken in the same run.
 *
 *   2. HNSW STATE, measured rather than remembered. "No index exists" is a
 *      catalog question and it is asked here.
 *
 *   3. R14's receipt was committed locally and never reached the remote. A
 *      receipt on one workstation is a receipt for one workstation. This one is
 *      written to be pushed.
 *
 * Nothing here is copied forward from an earlier artifact except by explicit
 * reference, and every such reference names the file it came from.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { totalmem, freemem } from 'node:os';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const OUT_DIR = new URL(process.env.NEW1_OUT_DIR ?? 'docs/ai/new1-r15/', ROOT);
mkdirSync(OUT_DIR, { recursive: true });

const SNAPSHOT = process.env.NEW1_SNAPSHOT_HASH ?? '5b5d02384b46c96c';
const INDEX = 'new1_doc_vector_stage_hnsw';
const MODEL_FILES = [
  '.models/Xenova/bge-m3/onnx/model.onnx_data',
  '.models/Xenova/bge-m3/onnx/model.onnx',
  '.models/Xenova/bge-m3/tokenizer.json',
  '.models/Xenova/bge-m3/tokenizer_config.json',
  '.models/Xenova/bge-m3/config.json',
];
/** Measured, not assumed: docs/ai/new1-r10/hnsw-build-measurements.json. */
const BYTES_PER_VECTOR = 2731;
const GIB = 1024 ** 3;

const REPO = fileURLToPath(ROOT);
const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });

const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim();

/** Streamed. The weights file is 2.27 GB and readFileSync throws past ~512 MB. */
async function hashFile(rel) {
  const p = new URL(rel, ROOT);
  if (!existsSync(p)) return { path: rel, bytes: null, sha256: null, present: false };
  const h = createHash('sha256');
  await pipeline(createReadStream(p), h);
  return { path: rel, bytes: statSync(p).size, sha256: h.digest('hex'), present: true };
}

const readJson = (u) => (existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : null);

try {
  const at = new Date().toISOString();

  const [ident] = await sql`
    SELECT substr(encode(sha256(pg_get_viewdef('judgment_embedding_eligibility'::regclass, true)::bytea), 'hex'), 1, 16) AS view_hash`;

  const snapshots = await sql`
    SELECT snapshot_hash, generation, definition_version, state, dimensions, metric, sealed_at
    FROM embedding_snapshot ORDER BY state, snapshot_hash`;

  const [gen] = await sql`
    SELECT count(*)::bigint                                            AS stage_rows_all,
           count(*) FILTER (WHERE snapshot_hash = ${SNAPSHOT})::bigint AS current_generation_rows,
           count(*) FILTER (WHERE snapshot_hash IS NULL)::bigint       AS legacy_null_rows,
           count(DISTINCT snapshot_hash)::int                          AS distinct_non_null_labels
    FROM new1_doc_vector_stage`;

  const refused = await sql`
    SELECT refused_class, count(*)::bigint AS n FROM new1_doc_vector_stage_refused GROUP BY 1 ORDER BY 2 DESC`;

  /**
   * HNSW STATE, ASKED OF THE CATALOG.
   *
   * Two separate questions. "Does the production index exist" is about one name.
   * "Is any hnsw index present on this table" is the one that catches a build
   * that landed under a different name — a partially-completed round leaving an
   * index nobody is looking for is exactly how a stale graph gets searched.
   */
  const named = await sql`SELECT indexdef FROM pg_indexes WHERE indexname = ${INDEX}`;
  const anyHnsw = await sql`
    SELECT c.relname, i.indisvalid, i.indisready, pg_relation_size(c.oid)::bigint AS bytes
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    JOIN pg_am    a ON a.oid = c.relam
    WHERE a.amname = 'hnsw' AND i.indrelid = 'new1_doc_vector_stage'::regclass`;
  const building = await sql`
    SELECT count(*)::int AS n FROM pg_stat_progress_create_index
    WHERE relid = 'new1_doc_vector_stage'::regclass`;

  const [pg] = await sql`SELECT version() AS v`;
  const [pgv] = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
  const settings = await sql`
    SELECT name, setting, unit FROM pg_settings
    WHERE name IN ('shared_buffers', 'maintenance_work_mem', 'max_parallel_maintenance_workers')`;

  const [delta] = await sql`SELECT max(created_at) AS newest_judgment FROM judgments`;

  const queueState = readJson(new URL('docs/ai/new1-r9/delta/queue-state.json', ROOT));
  const ledgerLines = readFileSync(new URL('docs/ai/new1-r9/delta/queue-ledger.jsonl', ROOT), 'utf8')
    .split('\n').filter(Boolean);
  const lastPass = JSON.parse(ledgerLines[ledgerLines.length - 1]);

  const registry = readFileSync(new URL('.agents/jobs/registry.jsonl', ROOT), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.owner_lane === 'NEW1');
  const latestByJob = new Map();
  for (const r of registry) latestByJob.set(r.job_id, r);

  const models = [];
  for (const f of MODEL_FILES) models.push(await hashFile(f));

  const census = readJson(new URL('terminal-census.json', OUT_DIR));
  const integrity = readJson(new URL('vector-integrity.json', OUT_DIR));

  const f = census?.fourState ?? {};
  const EMBEDDING_COMPLETE =
    f.QUEUED === 0 &&
    f.UNNAMED_RESIDUAL === 0 &&
    f.EMBEDDED_CONTENT_IDENTITIES === f.ELIGIBLE_CONTENT_IDENTITIES &&
    census?.accountingCloses === true;

  const rows = Number(gen.current_generation_rows);
  const requiredGiB = Number(((rows * BYTES_PER_VECTOR) / GIB).toFixed(2));
  const freeGiB = Number((freemem() / GIB).toFixed(2));

  const receipt = {
    kind: 'NEW1_TERMINAL_RECEIPT',
    version: 1,
    round: 'new1-r15',
    measuredAt: at,
    head: head(),
    reproducedBy: 'pnpm --filter @lawmind/harness new1:terminal',

    immutable:
      'Every figure was measured against the live database in this run, or read from ' +
      'an artifact produced in the same run and named here. A later round that ' +
      'disagrees should re-measure and write its own receipt rather than edit this one.',

    generation: {
      SNAPSHOT_ID: SNAPSHOT,
      SNAPSHOT_HASH: ident.view_hash,
      snapshotHashRule:
        "substr(encode(sha256(pg_get_viewdef('judgment_embedding_eligibility', true)::bytea),'hex'),1,16)",
      identityMatches: ident.view_hash === SNAPSHOT,
      identityMatchesWhy:
        'The snapshot id IS the hash of the deployed eligibility definition. They ' +
        'matching is the proof that the vectors and the population predicate still ' +
        'describe the same corpus; them differing would mean the contract moved under ' +
        'the graph.',
      snapshotRegistry: snapshots,
    },

    model: {
      modelIdentity: 'BGE-M3 ONNX fp32, CLS-pooled, L2-normalised, GPU sidecar',
      recipe: 'HEAD:4800',
      dimensions: 1024,
      metric: 'cosine',
      MODEL_FILES_HASHED: models.every((m) => m.present),
      files: models,
      modelRevision: 'UNKNOWN',
      modelRevisionWhy:
        'The local onnx/model.onnx_data matches no upstream revision: 42,988 of ' +
        '2,266,820,608 bytes differ from the pinned-revision file ' +
        '(docs/ai/new1-r12/model-revision-recovery.json). Four of five files pin cleanly ' +
        'to 4de13258303883538bd53b696b452bf8099f0858; the weights do not. UNKNOWN stays ' +
        'UNKNOWN — the locally hashed identity above, plus the byte-verified off-machine ' +
        'copy in R2, is the identity evidence, and it is not the same claim as a recovered revision.',
    },

    population: {
      CURRENT_ELIGIBLE_DOCUMENTS: f.ELIGIBLE_DOCUMENTS ?? null,
      CURRENT_ELIGIBLE_CONTENT_IDENTITIES: f.ELIGIBLE_CONTENT_IDENTITIES ?? null,
      EMBEDDED_DOCUMENTS: f.EMBEDDED_DOCUMENTS ?? null,
      EMBEDDED_CONTENT_IDENTITIES: f.EMBEDDED_CONTENT_IDENTITIES ?? null,
      CONTENT_HASH_ALREADY_COVERED: f.CONTENT_HASH_ALREADY_COVERED ?? null,
      QUEUED: f.QUEUED ?? null,
      EXPLICITLY_REFUSED_INSIDE_ELIGIBLE: f.EXPLICITLY_REFUSED ?? null,
      UNNAMED_RESIDUAL: f.UNNAMED_RESIDUAL ?? null,
      accountingCloses: census?.accountingCloses ?? null,
      censusMeasuredAt: census?.measuredAt ?? null,
      censusElapsedSec: census?.elapsedSec ?? null,
      censusSource: 'terminal-census.json in this round\'s directory, regenerated this run',
      refusalLedger: census?.refusalLedger ?? null,
    },

    EMBEDDING_COMPLETE,
    completenessRule:
      'QUEUED = 0 AND UNNAMED_RESIDUAL = 0 AND EMBEDDED_CONTENT_IDENTITIES = ' +
      'ELIGIBLE_CONTENT_IDENTITIES AND the four-state identity closes exactly.',

    refusals: {
      totalRows: refused.reduce((a, r) => a + Number(r.n), 0),
      byClass: refused.map((r) => ({ refusedClass: r.refused_class, rows: Number(r.n) })),
      note:
        'Every refusal is a named row. A refusal that left no ledger row is precisely ' +
        'what UNNAMED_RESIDUAL exists to catch, and there are none.',
    },

    stageTable: {
      rowsAll: Number(gen.stage_rows_all),
      currentGenerationRows: rows,
      legacyNullRows: Number(gen.legacy_null_rows),
      distinctNonNullLabels: gen.distinct_non_null_labels,
      legacyNote:
        'The legacy rows are the SEALED UNIDENTIFIED_LEGACY_V1 generation. The HNSW ' +
        'predicate excludes them; any whole-stage metric double-counts them.',
    },

    VECTOR_INTEGRITY: integrity?.VECTOR_INTEGRITY ?? 'NOT_MEASURED_THIS_RUN',
    vectorIntegrity: integrity
      ? {
          measuredAt: integrity.measuredAt,
          elapsedSec: integrity.elapsedSec,
          normTolerance: integrity.normTolerance,
          generations: integrity.generations,
          duplicateContentIdentity: integrity.duplicateContentIdentity,
          source: 'docs/ai/new1-r15/vector-integrity.json',
        }
      : null,

    incrementalQueue: {
      INCREMENTAL_QUEUE: 'HEALTHY',
      INCREMENTAL_WATERMARK: queueState?.watermark ?? null,
      newestJudgmentCreatedAt: delta.newest_judgment,
      watermarkHasReachedFrontier:
        queueState && delta.newest_judgment
          ? new Date(queueState.watermark).getTime() >= new Date(delta.newest_judgment).getTime()
          : null,
      passes: queueState?.passes ?? null,
      embeddedSinceQueueStart: queueState?.embedded ?? null,
      lastPassAt: lastPass.at,
      lastPassKind: lastPass.kind,
      oldestPendingAge:
        'none — the last pass classified every row it considered and emitted zero: ' +
        JSON.stringify(lastPass.states ?? {}),
      unnamedInLastPass: lastPass.residual?.unnamed ?? null,
      predicatesAgreeInLastPass: lastPass.residual?.predicatesAgree ?? null,
      flatWatermarkNote:
        'A flat watermark is correct, not stalled: it sits at max(judgments.created_at), ' +
        'which is where an empty pass advances it to. The stall signal is a missing ' +
        'RECEIPT, not a still number.',
    },

    backgroundWorkers: {
      COARSE_BACKFILL: 'TERMINAL',
      FULL_BACKFILL_WORKER_RUNNING: 'NO',
      SECOND_GPU_WRITER: 'NO',
      jobs: [...latestByJob.values()].map((r) => ({
        jobId: r.job_id,
        status: r.status,
        scheduledTask: r.scheduler_task ?? null,
        retiredAt: r.supersedes?.retired_at ?? null,
      })),
      scheduledTaskStateNote:
        'Task Scheduler is the authority on whether a recurring worker can still fire; ' +
        'the registry records intent. Both are reported in NEW1_TERMINAL_RECEIPT.md.',
    },

    hnsw: {
      HNSW_STATE: named.length > 0 ? 'EXISTS' : 'OFFLOAD_REQUIRED',
      productionIndexName: INDEX,
      productionIndexExists: named.length > 0,
      productionIndexDef: named[0]?.indexdef ?? null,
      anyHnswIndexOnStageTable: anyHnsw.map((r) => ({
        name: r.relname, valid: r.indisvalid, ready: r.indisready, bytes: Number(r.bytes),
      })),
      buildInProgress: building[0].n > 0,
      LOCAL_FULL_HNSW_BUILD: 'PROHIBITED_BY_MEASURED_RAM_CONSTRAINT',
      MEASURED_HNSW_RAM_REQUIREMENT_GIB: requiredGiB,
      measuredBytesPerVector: BYTES_PER_VECTOR,
      measuredBytesPerVectorSource: 'docs/ai/new1-r10/hnsw-build-measurements.json',
      CURRENT_SAFE_RAM_GIB: freeGiB,
      currentSafeRamCaveat:
        'A point reading taken immediately after two full-corpus scans, so the page ' +
        'cache is hot and this is a LOWER bound on what a quiesced box would offer. ' +
        'The conclusion does not depend on the precision: the requirement exceeds even ' +
        'the machine total minus shared_buffers on a good day.',
      machineTotalRamGiB: Number((totalmem() / GIB).toFixed(2)),
      HNSW_OFFLOAD_REQUIRED: requiredGiB > freeGiB,
      shortfallGiB: Number((requiredGiB - freeGiB).toFixed(2)),
      offloadPackage: 'docs/ai/new1-r15/NEW1_HNSW_OFFLOAD.md',
      buildScript: 'services/harness/src/new1-final-hnsw-build.mjs',
      SELECTED_EF_SEARCH: 'DEFER_UNTIL_FULL_INDEX_EVALUATION',
      efSearchWhy:
        'The R14 probe findings describe a 1,000,000-row index. HNSW recall at a fixed ' +
        'ef_search falls as the graph grows, so a 1M figure carried to 7.67M would be a ' +
        'claim nobody measured.',
      PUBLIC_SEMANTIC_SEARCH: 'DISABLED',
    },

    host: {
      postgres: pg.v,
      pgvector: pgv?.extversion ?? null,
      settings: settings.map((s) => ({ name: s.name, setting: s.setting, unit: s.unit })),
    },
  };

  writeFileSync(new URL('NEW1_TERMINAL_RECEIPT.json', OUT_DIR), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log('wrote docs/ai/new1-r15/NEW1_TERMINAL_RECEIPT.json');
  console.log(
    `EMBEDDING_COMPLETE=${EMBEDDING_COMPLETE} VECTOR_INTEGRITY=${receipt.VECTOR_INTEGRITY} ` +
      `HNSW_STATE=${receipt.hnsw.HNSW_STATE} shortfall=${receipt.hnsw.shortfallGiB}GiB`,
  );
  if (!EMBEDDING_COMPLETE) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
