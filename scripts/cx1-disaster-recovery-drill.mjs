#!/usr/bin/env node
/**
 * CX1 disaster-recovery drill planner.
 *
 * Offline only: reads existing backup/migration evidence and prepares a
 * restore-drill checklist plus a read-only smoke SQL for a future disposable
 * restored cluster. It does not download R2 objects, run pg_basebackup,
 * pg_verifybackup, pg_restore, pg_ctl, or query PostgreSQL.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-disaster-recovery-drill');
const OUT_JSON = path.join(OUT_DIR, 'drill-plan.json');
const OUT_CHECKLIST = path.join(OUT_DIR, 'acceptance-checklist.csv');
const OUT_SQL = path.join(OUT_DIR, 'restore-smoke.sql');
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_DISASTER_RECOVERY_DRILL.md');

const INPUTS = {
  backupArchitecture: 'docs/ops/LOW_COST_BACKUP_ARCHITECTURE.md',
  architecturePacket: 'docs/ai/CX1_ARCHITECTURE_PACKET_V2.md',
  migrationCompare: 'docs/ops/migration/compare-final.json',
  localSmoke: 'docs/ops/migration/smoke-local.json',
};

const EXPECTED_PATTERNS = [
  ['backupArchitecture', /Stage A uses a full plain-format pg_basebackup with required WAL\s+streamed into the backup/],
  ['backupArchitecture', /pg_verifybackup against the plain backup/],
  ['backupArchitecture', /a full restore into a different local data directory/],
  ['backupArchitecture', /LawMind smoke tests against the restored cluster/],
  ['backupArchitecture', /prior 25 MB download is not restore-throughput\s+evidence/],
  ['backupArchitecture', /encrypt before off-machine storage/],
  ['architecturePacket', /Acceptance requires pg_verifybackup, a full\s+restore into a different data directory, and LawMind smoke tests/],
  ['architecturePacket', /R2 remains the initial provider for operational simplicity/],
];

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function read(relativePath) {
  return fs.readFileSync(abs(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs(relativePath))).digest('hex');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function validateInputs(textByKey) {
  return EXPECTED_PATTERNS.map(([key, pattern]) => {
    const ok = pattern.test(textByKey[key]);
    if (!ok) throw new Error(`missing expected Workstream L evidence pattern in ${key}: ${pattern}`);
    return { input: key, status: 'pass', pattern: String(pattern) };
  });
}

function acceptanceChecklist() {
  return [
    {
      phase: 'L0-source-selection',
      check: 'Identify exact accepted base backup ID, object keys, backup_manifest path, WAL start/end, and encryption/key procedure.',
      evidence: 'chain manifest or operator-captured backup metadata',
      gate: 'before-download',
      status: 'not_run',
    },
    {
      phase: 'L1-object-readback',
      check: 'Download or mount backup objects from R2 into CX1 disposable storage and hash every object against the source manifest.',
      evidence: 'object hash manifest and byte counts',
      gate: 'HEAVY_IDLE',
      status: 'not_run',
    },
    {
      phase: 'L2-pg-verifybackup',
      check: 'Run pg_verifybackup against the plain base backup, including WAL parsing.',
      evidence: 'pg_verifybackup stdout/stderr, exit code, duration',
      gate: 'HEAVY_IDLE',
      status: 'not_run',
    },
    {
      phase: 'L3-disposable-restore',
      check: 'Restore into a different data directory under C:/lawmind/cx1-lab/dr-restore and start on a non-production port.',
      evidence: 'pg_ctl log, restored data-dir path, port, startup duration',
      gate: 'HEAVY_IDLE',
      status: 'not_run',
    },
    {
      phase: 'L4-restored-smoke-sql',
      check: 'Run restore-smoke.sql only against the restored cluster, not Gold.',
      evidence: 'restore-smoke output JSON sections',
      gate: 'RESTORED_CLUSTER_ONLY',
      status: 'not_run',
    },
    {
      phase: 'L5-compare-to-baseline',
      check: 'Compare extension versions, relation estimates, migration state, representative counts, generated columns, citation lookup, full-text search, vector readiness, and application preflight.',
      evidence: 'comparison report against migration manifests and local smoke baseline',
      gate: 'RESTORED_CLUSTER_ONLY',
      status: 'not_run',
    },
    {
      phase: 'L6-rto-rpo',
      check: 'Record backup readback duration, verify duration, WAL replay duration, restored bytes, disk peak, RTO, and effective RPO.',
      evidence: 'timing and disk telemetry JSON',
      gate: 'after-restore',
      status: 'not_run',
    },
    {
      phase: 'L7-cleanup',
      check: 'Stop restored cluster and remove only CX1 disposable restore paths after evidence is written.',
      evidence: 'cleanup manifest with deleted paths and bytes',
      gate: 'after-evidence',
      status: 'not_run',
    },
  ];
}

function drillPhases() {
  return [
    {
      phase: 'Stage A baseline restore',
      state: 'prepared_not_run',
      commandShape:
        'pg_verifybackup <base-backup-dir>; pg_ctl -D C:/lawmind/cx1-lab/dr-restore/<id>/pgdata -o "-p <nonprod-port>" start; psql -p <nonprod-port> -f restore-smoke.sql',
      boundary: 'Disposable restore only; never start on 5432 and never point smoke SQL at Gold.',
    },
    {
      phase: 'Stage B incremental benchmark',
      state: 'future_benchmark',
      commandShape:
        'Only after Stage A accepted: pg_basebackup --incremental=<ancestor manifest>; pg_combinebackup; pg_verifybackup; full disposable restore.',
      boundary: 'Do not enable incremental retention before a successful full restore gate.',
    },
  ];
}

function restoreSmokeSql() {
  return `WITH extension_versions AS (
  SELECT extname, extversion
  FROM pg_extension
  WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto')
),
database_shape AS (
  SELECT
    current_database() AS database_name,
    version() AS postgres_version,
    pg_database_size(current_database())::bigint AS database_bytes
),
relation_estimates AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS relation_name,
    c.relkind,
    c.reltuples::bigint AS estimated_rows,
    pg_total_relation_size(c.oid)::bigint AS total_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'm', 'i')
),
representative_samples AS (
  SELECT 'judgments' AS table_name, count(*)::bigint AS bounded_rows
  FROM (SELECT 1 FROM judgments LIMIT 1000) s
  UNION ALL
  SELECT 'judgment_chunks', count(*)::bigint
  FROM (SELECT 1 FROM judgment_chunks LIMIT 1000) s
  UNION ALL
  SELECT 'judgment_citations', count(*)::bigint
  FROM (SELECT 1 FROM judgment_citations LIMIT 1000) s
  UNION ALL
  SELECT 'document_enrichments', count(*)::bigint
  FROM (SELECT 1 FROM document_enrichments LIMIT 1000) s
),
generated_columns AS (
  SELECT
    c.relname AS table_name,
    a.attname AS column_name,
    a.attgenerated AS generated_kind
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND a.attgenerated <> ''
),
citation_lookup_probe AS (
  SELECT
    count(*)::bigint AS alias_rows_sampled,
    count(*) FILTER (WHERE alias_key IS NULL OR judgment_id IS NULL)::bigint AS malformed_alias_rows
  FROM (SELECT alias_key, judgment_id FROM judgment_citation_aliases LIMIT 1000) a
),
full_text_probe AS (
  SELECT count(*)::bigint AS hits
  FROM (
    SELECT id
    FROM judgments
    WHERE search_tsv @@ plainto_tsquery('english', 'constitutional')
    LIMIT 5
  ) q
),
vector_probe AS (
  SELECT
    count(*)::bigint AS vector_rows_sampled,
    max(vector_dims(embedding))::int AS max_embedding_dims
  FROM (SELECT embedding FROM judgment_chunks WHERE embedding IS NOT NULL LIMIT 100) v
)
SELECT 'database_shape' AS section, to_jsonb(database_shape) AS data FROM database_shape
UNION ALL
SELECT 'extension_versions', coalesce(jsonb_agg(to_jsonb(extension_versions) ORDER BY extname), '[]'::jsonb) FROM extension_versions
UNION ALL
SELECT 'relation_estimates_top', jsonb_agg(to_jsonb(x) ORDER BY x.total_bytes DESC)
FROM (SELECT * FROM relation_estimates ORDER BY total_bytes DESC LIMIT 50) x
UNION ALL
SELECT 'representative_samples', jsonb_agg(to_jsonb(representative_samples) ORDER BY table_name) FROM representative_samples
UNION ALL
SELECT 'generated_columns', coalesce(jsonb_agg(to_jsonb(generated_columns) ORDER BY table_name, column_name), '[]'::jsonb) FROM generated_columns
UNION ALL
SELECT 'citation_lookup_probe', to_jsonb(citation_lookup_probe) FROM citation_lookup_probe
UNION ALL
SELECT 'full_text_probe', to_jsonb(full_text_probe) FROM full_text_probe
UNION ALL
SELECT 'vector_probe', to_jsonb(vector_probe) FROM vector_probe;
`;
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# CX1 Disaster Recovery Drill');
  lines.push('');
  lines.push(`Generated: **${result.generatedAt}**`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('Workstream L prepared-not-run checkpoint. This artifact converts the existing backup architecture into a concrete restore-drill checklist and a bounded smoke SQL for a future disposable restored cluster. It does not download R2 objects, run PostgreSQL backup/restore commands, start a restored server, query Gold, or change production state.');
  lines.push('');
  lines.push('## Source Evidence');
  lines.push('');
  lines.push('| Source | Hash | Role |');
  lines.push('|---|---|---|');
  for (const input of result.inputs) {
    lines.push(`| \`${input.path}\` | \`${input.sha256.slice(0, 16)}...\` | ${input.role} |`);
  }
  lines.push('');
  lines.push('## Prepared Outputs');
  lines.push('');
  lines.push(`- Machine plan: \`${result.planJson}\``);
  lines.push(`- Acceptance checklist: \`${result.acceptanceChecklistCsv}\``);
  lines.push(`- Restore-smoke SQL: \`${result.restoreSmokeSql}\``);
  lines.push('');
  lines.push('## Acceptance Gate');
  lines.push('');
  lines.push('A backup is not accepted by CX1 until all of these have evidence from a restored disposable cluster:');
  lines.push('');
  for (const row of result.acceptanceChecklist) {
    lines.push(`- ${row.phase}: ${row.check}`);
  }
  lines.push('');
  lines.push('## Existing Relevant Evidence');
  lines.push('');
  lines.push(`- Migration compare baseline: ${result.baselines.migrationCompare.counts.fail} fail / ${result.baselines.migrationCompare.counts.warn} warn / ${result.baselines.migrationCompare.counts.info} info, compared at ${result.baselines.migrationCompare.comparedAt}.`);
  lines.push(`- Local smoke baseline: ${result.baselines.localSmoke.passCount} pass, ${result.baselines.localSmoke.failCount} fail, ${result.baselines.localSmoke.nullCount} informational/null.`);
  lines.push('- The local smoke full-text GIN-index choice failure is carried as a known baseline caveat, not treated as DR evidence yet.');
  lines.push('');
  lines.push('## Not Yet KNOW');
  lines.push('');
  lines.push('- R2 object readback throughput, restored bytes, WAL replay duration, RTO, and RPO are not measured by this offline pass.');
  lines.push('- File identity or a migration compare is not a substitute for a restore drill.');
  lines.push('- The smoke SQL must be run only against the restored disposable cluster on a non-production port.');
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push(result.boundary);
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const textByKey = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, read(file)]));
  const validations = validateInputs(textByKey);
  const migrationCompare = readJson(INPUTS.migrationCompare);
  const localSmoke = readJson(INPUTS.localSmoke);
  const smokeResults = localSmoke.results || [];
  const checklist = acceptanceChecklist();
  const result = {
    schema: 'cx1-disaster-recovery-drill-v1',
    generatedAt: new Date().toISOString(),
    status: 'prepared_not_run',
    boundary:
      'Offline Workstream L only: no R2 download, no provider operation, no pg_basebackup, no pg_verifybackup, no restore, no pg_ctl, no PostgreSQL query, no production write, and no Gold cleanup.',
    inputs: [
      {
        key: 'backupArchitecture',
        path: INPUTS.backupArchitecture,
        sha256: sha256(INPUTS.backupArchitecture),
        role: 'Stage A/Stage B backup acceptance design',
      },
      {
        key: 'architecturePacket',
        path: INPUTS.architecturePacket,
        sha256: sha256(INPUTS.architecturePacket),
        role: 'CX1 architecture correction and backup policy source',
      },
      {
        key: 'migrationCompare',
        path: INPUTS.migrationCompare,
        sha256: sha256(INPUTS.migrationCompare),
        role: 'current local migration comparison baseline',
      },
      {
        key: 'localSmoke',
        path: INPUTS.localSmoke,
        sha256: sha256(INPUTS.localSmoke),
        role: 'current local LawMind smoke baseline',
      },
    ],
    validations,
    baselines: {
      migrationCompare: {
        comparedAt: migrationCompare.comparedAt,
        sourceLabel: migrationCompare.source?.label,
        targetLabel: migrationCompare.target?.label,
        counts: migrationCompare.counts,
        findings: migrationCompare.findings,
      },
      localSmoke: {
        at: localSmoke.at,
        passCount: smokeResults.filter((r) => r.pass === true).length,
        failCount: smokeResults.filter((r) => r.pass === false).length,
        nullCount: smokeResults.filter((r) => r.pass === null).length,
        failedChecks: smokeResults.filter((r) => r.pass === false).map((r) => r.name),
      },
    },
    drillPhases: drillPhases(),
    acceptanceChecklist: checklist,
    restoreSmokeSql: rel(OUT_SQL),
    acceptanceChecklistCsv: rel(OUT_CHECKLIST),
    planJson: rel(OUT_JSON),
    nextGate:
      'HEAVY_IDLE for R2 readback/verify/restore; RESTORED_CLUSTER_ONLY for restore-smoke SQL execution on a non-production port',
  };

  fs.writeFileSync(OUT_SQL, restoreSmokeSql());
  writeCsv(OUT_CHECKLIST, checklist, ['phase', 'check', 'evidence', 'gate', 'status']);
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, renderMarkdown(result));
  console.log(`wrote ${rel(OUT_JSON)}`);
  console.log(`wrote ${rel(OUT_MD)}`);
}

main();
