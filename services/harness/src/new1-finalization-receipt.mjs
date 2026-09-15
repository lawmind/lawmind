/**
 * NEW1 FINALIZATION — the binding receipt.
 *
 * The completion receipt says the embedding program reached a terminal state.
 * This one binds that state to a specific index object and a specific set of
 * retrieval measurements, so "which graph were those recall numbers taken on"
 * has one answer that survives a fresh agent.
 *
 * It is a BINDING, not a summary: it records the index's oid and relfilenode
 * alongside its definition. A definition can be recreated; an oid cannot be
 * confused with a rebuild.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../../', import.meta.url);
const REPO = fileURLToPath(ROOT);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const OUT_DIR = new URL('docs/ai/new1-r14/', ROOT);
mkdirSync(OUT_DIR, { recursive: true });

const INDEX = 'new1_doc_vector_stage_hnsw';
const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });

const readJson = (rel) => {
  const p = new URL(rel, ROOT);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
const sha = (rel) => {
  const p = new URL(rel, ROOT);
  return existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null;
};

/**
 * The index may not exist. Two attempts at the full 7.67M-row build were cancelled
 * on measured, decaying throughput (HNSW_BUILD_COST_AT_SCALE.md), so this receipt
 * has to be able to say NOT_BUILT as precisely as it says BUILT. A receipt that
 * can only describe success is a receipt nobody can trust about failure.
 */
const [idx] = await sql`
  SELECT c.oid::bigint            AS oid,
         c.relfilenode::bigint    AS relfilenode,
         i.indisvalid             AS valid,
         i.indisready             AS ready,
         pg_relation_size(c.oid)  AS bytes,
         pg_size_pretty(pg_relation_size(c.oid)) AS pretty,
         (SELECT indexdef FROM pg_indexes WHERE indexname = ${INDEX}) AS def
  FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
  WHERE c.relname = ${INDEX}`;

const ANN_FILE = process.env.NEW1_ANN_FILE ?? 'ann-evaluation-probe1m.json';
const build = readJson('docs/ai/new1-r14/hnsw-final-build.json');
const attempts = ['hnsw-build-attempt1-4gb-4workers.json', 'hnsw-build-attempt2-8gb-10workers.json']
  .map((f) => ({ file: f, receipt: readJson(`docs/ai/new1-r14/${f}`), sha256: sha(`docs/ai/new1-r14/${f}`) }))
  .filter((a) => a.receipt !== null);
const census = readJson('docs/ai/new1-r14/terminal-census.json');
const completion = readJson('docs/ai/new1-r14/NEW1_EMBEDDING_COMPLETION_RECEIPT.json');
const ann = readJson(`docs/ai/new1-r14/${ANN_FILE}`);

const receipt = {
  kind: 'NEW1_FINALIZATION_RECEIPT',
  version: 1,
  writtenAt: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim(),

  binds: {
    embeddingCompletionReceipt: {
      path: 'docs/ai/new1-r14/NEW1_EMBEDDING_COMPLETION_RECEIPT.json',
      sha256: sha('docs/ai/new1-r14/NEW1_EMBEDDING_COMPLETION_RECEIPT.json'),
    },
    terminalCensus: {
      path: 'docs/ai/new1-r14/terminal-census.json',
      sha256: sha('docs/ai/new1-r14/terminal-census.json'),
    },
    buildReceipt: {
      path: 'docs/ai/new1-r14/hnsw-final-build.json',
      sha256: sha('docs/ai/new1-r14/hnsw-final-build.json'),
    },
    annEvaluation: {
      path: `docs/ai/new1-r14/${ANN_FILE}`,
      sha256: sha(`docs/ai/new1-r14/${ANN_FILE}`),
    },
    buildCostCorrection: {
      path: 'docs/ai/new1-r14/HNSW_BUILD_COST_AT_SCALE.md',
      sha256: sha('docs/ai/new1-r14/HNSW_BUILD_COST_AT_SCALE.md'),
    },
  },

  snapshotHash: completion?.generation?.activeSnapshotId ?? null,
  modelIdentity: completion?.model?.modelIdentity ?? null,
  modelRevision: completion?.model?.modelRevision ?? null,

  index: {
    state: idx ? (idx.valid ? 'BUILT' : 'BUILT_INVALID') : 'NOT_BUILT',
    name: INDEX,
    oid: idx ? Number(idx.oid) : null,
    relfilenode: idx ? Number(idx.relfilenode) : null,
    valid: idx?.valid ?? null,
    ready: idx?.ready ?? null,
    definition: idx?.def ?? null,
    bytes: idx ? Number(idx.bytes) : null,
    size: idx?.pretty ?? null,
    /**
     * Only meaningful for an index that exists. An INDEX_CUT_AT belonging to a
     * build that was cancelled is a timestamp for a graph nobody can query, and
     * leaving it at the top level would let a later reader bind evidence to it.
     * Each attempt keeps its own cut in `attempts` below.
     */
    indexCutAt: idx ? (build?.indexCutAt ?? null) : null,
    buildSeconds: idx ? (build?.buildSeconds ?? null) : null,
    buildHours: idx && build?.buildSeconds ? Number((build.buildSeconds / 3600).toFixed(2)) : null,
    rowsIndexed: idx ? (build?.rowsToIndex ?? null) : null,
    bytesPerVector: idx ? (build?.bytesPerVector ?? null) : null,
    maintenanceWorkMem: idx ? (build?.maintenanceWorkMem ?? null) : null,
    populationThatWouldHaveBeenIndexed: build?.rowsToIndex ?? null,
    attempts: attempts.map((a) => ({
      file: a.file,
      sha256: a.sha256,
      result: a.receipt.result,
      error: a.receipt.error ?? null,
      maintenanceWorkMem: a.receipt.maintenanceWorkMem,
      workers: a.receipt.maxParallelMaintenanceWorkers,
      indexCutAt: a.receipt.indexCutAt,
    })),
    notBuiltBecause: idx
      ? null
      : 'The build requires 19.52 GiB resident (7,673,717 x 2,731 bytes, confirmed by two ' +
        'spill points landing within 0.02% of that constant). This box has 11.7 GiB available. ' +
        'Post-spill throughput is ~24 tuples/s and is indifferent to parallelism: 4 workers gave ' +
        '24.7/s and 10 gave 24.2/s while doing 2.3x the disk reads. Residency is the only lever ' +
        'and the gap has no setting that closes it. Raised as FQ-NEW1-R14-RAM. ' +
        'docs/ai/new1-r14/HNSW_BUILD_COST_AT_SCALE.md',
    baselinePreserved:
      'Both attempts were cancelled with pg_cancel_backend and the table verified afterwards: ' +
      '8,160,672 rows, 7,673,717 current-generation, new1_doc_vector_stage_pkey the only index. ' +
      'Nothing was dropped, truncated or rewritten.',
  },

  population: census?.fourState ?? null,

  annEvidence: ann
    ? {
        measuredOnTable: ann.table,
        measuredOnIndex: ann.indexName,
        rowsIndexed: ann.rowsIndexed,
        scaleWarning: ann.scaleWarning,
        identityMatchedOn: ann.identityMatchedOn,
        goldTargets: ann.goldTargets,
        exactSubsetSize: ann.exactSubsetSize,
        queriesTotal: ann.queriesTotal,
        byEf: ann.byEf.map((e) => ({
          ef: e.ef,
          recallHalfvec: e.recall.halfvec,
          recallFp32: e.recall.fp32,
          knownTargetRetention: e.knownTargetRetention,
          warmP50: e.warm.p50,
          warmP95: e.warm.p95,
          warmP99: e.warm.p99,
          coldP50: e.coldish.p50,
          coldP95: e.coldish.p95,
          coldP99: e.coldish.p99,
          filtered: e.filtered,
        })),
      }
    : null,

  productBoundary: {
    PUBLIC_SEMANTIC_SEARCH: 'DISABLED',
    how:
      'By construction, not by restraint. services/api/src/search/retrieve.ts reads ' +
      'judgment_chunks UNION new1_tranche_passages and does not reference ' +
      'new1_doc_vector_stage anywhere, and there is no index on that table to read. ' +
      'No capability registry row, no route, no mobile surface, no coverage claim and ' +
      'no marketing was changed in this round. Enabling public semantic search is a ' +
      'product decision recorded in the capability registry, which belongs to NEW3.',
    capabilityRowUntouched: 'V1_CAPABILITY_REGISTRY_R16.json#search.semantic.broad — INTERNAL_EXPERIMENTAL, publicState DISABLED. Evidence sent to NEW3 on the bus; the row was not edited by this lane.',
  },
};

writeFileSync(new URL('NEW1_FINALIZATION_RECEIPT.json', OUT_DIR), `${JSON.stringify(receipt, null, 2)}\n`);
console.log('wrote docs/ai/new1-r14/NEW1_FINALIZATION_RECEIPT.json');
await sql.end({ timeout: 10 });
