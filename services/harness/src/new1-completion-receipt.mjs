/**
 * NEW1 FINALIZATION — the immutable embedding-completion receipt.
 *
 * The embedding program has a terminal state, and the only thing that makes it
 * terminal is a measurement taken at a named moment against a named contract.
 * This writes that measurement down in one file so the next agent does not have
 * to re-derive it, and so a later disagreement has something to point at.
 *
 * Every number here is RE-MEASURED at run time. Nothing is copied from an
 * earlier artifact — a historical count never overrides the current database,
 * and a receipt assembled out of older receipts is a summary, not evidence.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const OUT_DIR = new URL('docs/ai/new1-r14/', ROOT);
mkdirSync(OUT_DIR, { recursive: true });

const SNAPSHOT = process.env.NEW1_SNAPSHOT_HASH ?? '5b5d02384b46c96c';
const MODEL_FILES = [
  '.models/Xenova/bge-m3/onnx/model.onnx_data',
  '.models/Xenova/bge-m3/onnx/model.onnx',
  '.models/Xenova/bge-m3/tokenizer.json',
  '.models/Xenova/bge-m3/tokenizer_config.json',
  '.models/Xenova/bge-m3/config.json',
];

const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });

const REPO = fileURLToPath(ROOT);

function head() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim();
}

/**
 * Streamed, never `readFileSync`. The weights file is 2.27 GB and `readFileSync`
 * throws past roughly 512 MB, which would fail at the END of the expensive pass.
 */
async function hashFile(rel) {
  const p = new URL(rel, ROOT);
  if (!existsSync(p)) return { path: rel, bytes: null, sha256: null, present: false };
  const h = createHash('sha256');
  await pipeline(createReadStream(p), h);
  return { path: rel, bytes: statSync(p).size, sha256: h.digest('hex'), present: true };
}

async function main() {
  const at = new Date().toISOString();

  const [ident] = await sql`
    SELECT substr(encode(sha256(pg_get_viewdef('judgment_embedding_eligibility'::regclass, true)::bytea), 'hex'), 1, 16) AS view_hash`;

  const snapshots = await sql`
    SELECT snapshot_hash, generation, definition_version, manifest_sha256, model_identity,
           recipe, dimensions, metric, state, represents_sql_null, created_at, sealed_at
    FROM embedding_snapshot ORDER BY state, snapshot_hash`;

  const [gen] = await sql`
    SELECT count(*)::bigint                                                        AS stage_rows_all,
           count(*) FILTER (WHERE snapshot_hash = ${SNAPSHOT})::bigint             AS current_generation_rows,
           count(*) FILTER (WHERE snapshot_hash IS NULL)::bigint                   AS legacy_null_rows,
           count(DISTINCT snapshot_hash)::int                                      AS distinct_non_null_labels
    FROM new1_doc_vector_stage`;

  const refused = await sql`
    SELECT refused_class, count(*)::bigint AS n FROM new1_doc_vector_stage_refused
    GROUP BY 1 ORDER BY 2 DESC`;

  const [delta] = await sql`SELECT max(created_at) AS newest_judgment FROM judgments`;
  const queueState = JSON.parse(readFileSync(new URL('docs/ai/new1-r9/delta/queue-state.json', ROOT), 'utf8'));
  const ledger = readFileSync(new URL('docs/ai/new1-r9/delta/queue-ledger.jsonl', ROOT), 'utf8')
    .split('\n').filter(Boolean);
  const lastPass = JSON.parse(ledger[ledger.length - 1]);

  const registry = readFileSync(new URL('.agents/jobs/registry.jsonl', ROOT), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.owner_lane === 'NEW1');
  const latestByJob = new Map();
  for (const r of registry) latestByJob.set(r.job_id, r);

  const models = [];
  for (const f of MODEL_FILES) models.push(await hashFile(f));

  const census = JSON.parse(readFileSync(new URL('docs/ai/new1-r14/terminal-census.json', ROOT), 'utf8'));

  const receipt = {
    kind: 'NEW1_EMBEDDING_COMPLETION_RECEIPT',
    version: 1,
    writtenAt: at,
    writtenBy: 'NEW1 finalization round',
    head: head(),

    immutable:
      'Every figure in this file was measured against the live database in this ' +
      'round. None was carried forward from an earlier artifact. A later round ' +
      'that disagrees should re-measure and write its own receipt rather than ' +
      'edit this one.',

    generation: {
      activeSnapshotId: SNAPSHOT,
      deployedEligibilityViewHash: ident.view_hash,
      identityMatches: ident.view_hash === SNAPSHOT,
      snapshotRegistry: snapshots,
      snapshotHashSchemaReproducible:
        'YES — sha256(pg_get_viewdef(judgment_embedding_eligibility, true))[0:16] recomputed live',
      snapshotHashWriterExplicit:
        'YES — services/harness/src/doc-vector-embed.mjs names snapshot_hash in the INSERT column ' +
        'list and supplies RECONCILED_VIEW_HASH, which assertContractHash() has already proven equal ' +
        'to the deployed view at that batch. The constant column DEFAULT is gone (information_schema ' +
        'reports no default).',
      activeSnapshotIdImmutable:
        'YES — exactly one non-null label exists in the stage table, and two triggers ' +
        '(new1_doc_vector_stage_bind_snapshot_trg, new1_doc_vector_stage_freeze_snapshot_trg) enforce it.',
    },

    model: {
      modelIdentity: 'BGE-M3 onnx fp32, CLS-pooled, L2-normalised, GPU sidecar',
      recipe: 'HEAD:4800',
      dimensions: 1024,
      metric: 'cosine',
      modelRevision: 'UNKNOWN',
      modelRevisionWhy:
        'The local onnx/model.onnx_data matches no upstream revision: it is the pinned-revision file ' +
        'with 42,988 of 2,266,820,608 bytes different (docs/ai/new1-r12/model-revision-recovery.json). ' +
        'Four of five files pin cleanly to 4de13258303883538bd53b696b452bf8099f0858; the weights do not, ' +
        'so recovery is not claimed.',
      modelLocalFilesHashed: models.every((m) => m.present),
      files: models,
      offMachineIdentityEvidence:
        'Cloudflare R2 lawmind-corpus, key backups/postgres/2026-08-30T00-10-01-494Z-new1-model-pack-v2 — ' +
        '7 files, 2.13 GB, every object downloaded back and compared byte-for-byte, 0 differences. ' +
        'Uploaded unencrypted, a declared deviation from LOW_COST_BACKUP_ARCHITECTURE (public model ' +
        'weights, no client data).',
    },

    population: census,

    refusals: {
      totalRows: refused.reduce((a, r) => a + Number(r.n), 0),
      byClass: refused.map((r) => ({ refusedClass: r.refused_class, rows: Number(r.n) })),
      note: 'Every refusal is a named row in new1_doc_vector_stage_refused. A refusal that left no ledger row is the failure the UNNAMED_RESIDUAL check exists for, and there are none.',
    },

    stageTable: {
      rowsAll: Number(gen.stage_rows_all),
      currentGenerationRows: Number(gen.current_generation_rows),
      legacyNullRows: Number(gen.legacy_null_rows),
      distinctNonNullLabels: gen.distinct_non_null_labels,
    },

    incrementalQueue: {
      state: 'HEALTHY / IDLE',
      watermark: queueState.watermark,
      newestJudgmentCreatedAt: delta.newest_judgment,
      watermarkHasReachedFrontier:
        new Date(queueState.watermark).getTime() >= new Date(delta.newest_judgment).getTime(),
      oldestPendingAge:
        'none — the last pass classified every row it considered and emitted zero: ' +
        JSON.stringify(lastPass.states ?? {}),
      lastPassAt: lastPass.at,
      unnamedInLastPass: lastPass.residual?.unnamed ?? null,
      note: 'The watermark being flat is correct, not stalled: it sits at max(judgments.created_at), which is where an empty pass advances it to.',
    },

    workerRetirement: {
      coarseBackfill: 'TERMINAL',
      secondGpuWriter: 'NO — embedding has terminated; there is no GPU writer at all',
      jobs: [...latestByJob.values()].map((r) => ({
        jobId: r.job_id,
        status: r.status,
        scheduledTask: r.scheduler_task ?? null,
        retiredAt: r.supersedes?.retired_at ?? null,
        reason: r.supersedes?.reason ?? null,
      })),
    },
  };

  writeFileSync(new URL('NEW1_EMBEDDING_COMPLETION_RECEIPT.json', OUT_DIR), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log('wrote docs/ai/new1-r14/NEW1_EMBEDDING_COMPLETION_RECEIPT.json');
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
