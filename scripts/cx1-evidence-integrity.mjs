#!/usr/bin/env node
/**
 * CX1 evidence integrity audit.
 *
 * Offline only. Builds a manifest for CX1 evidence files and checks registry,
 * queue, preflight, SQL, and path boundaries. It does not connect to
 * PostgreSQL, fetch PDFs, run OCR, copy vectors, call a model, or write outside
 * docs/ai.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-evidence-integrity');
const OUT_JSON = path.join(OUT_DIR, 'integrity-report.json');
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_EVIDENCE_INTEGRITY.md');
const OUT_MANIFEST_JSON = path.join(OUT_DIR, 'artifact-manifest.json');
const OUT_MANIFEST_CSV = path.join(OUT_DIR, 'artifact-manifest.csv');

const REGISTRY_PATH = 'docs/ai/CX1_EXPERIMENT_REGISTRY.json';
const QUEUE_PATH = 'docs/ai/CX1_RUN_QUEUE.json';
const PREFLIGHT_PATH = 'docs/ai/CX1_PREFLIGHT.json';
const STATUS_PATH = 'docs/ai/CX1_HEAVY_LAB_STATUS.md';
const ALLOWED_STATUSES = new Set(['active', 'complete', 'complete_sample', 'prepared_not_run']);
const ALLOWED_GATES = new Set(['LIGHT', 'MEDIUM_CLEAN', 'HEAVY', 'VECTOR_EXCLUSIVE']);
const FORBIDDEN_SQL = /\b(insert|update|delete|merge|drop|alter|create|truncate|vacuum|analyze|copy|grant|revoke|call)\b/i;

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

const SELF_OUTPUTS = new Set([
  rel(OUT_JSON),
  rel(OUT_MD),
  rel(OUT_MANIFEST_JSON),
  rel(OUT_MANIFEST_CSV),
]);

function readText(relativePath) {
  return fs.readFileSync(abs(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function statusOf(findings) {
  return findings.some((finding) => finding.severity === 'fail') ? 'fail' : 'pass';
}

function addFinding(findings, severity, area, message, detail = {}) {
  findings.push({ severity, area, message, ...detail });
}

function exists(relativePath) {
  return fs.existsSync(abs(relativePath));
}

function isInsideDocsAi(relativePath) {
  return relativePath.replaceAll('\\', '/').startsWith('docs/ai/');
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function registryPaths(registry) {
  const paths = new Map();
  for (const experiment of registry.experiments || []) {
    for (const field of ['script', 'report', 'resultFile']) {
      const value = experiment[field];
      if (!value) continue;
      const item = paths.get(value) || { path: value, fields: [], experiments: [] };
      item.fields.push(field);
      item.experiments.push(experiment.experimentId);
      paths.set(value, item);
    }
  }
  return paths;
}

function queuePaths(queue) {
  const paths = new Map();
  for (const task of queue.tasks || []) {
    for (const value of task.evidence || []) {
      const item = paths.get(value) || { path: value, tasks: [] };
      item.tasks.push(task.id);
      paths.set(value, item);
    }
  }
  return paths;
}

function discoverEvidenceFiles(registry, queue) {
  const pathSet = new Set();
  for (const item of registryPaths(registry).values()) pathSet.add(item.path);
  for (const item of queuePaths(queue).values()) pathSet.add(item.path);
  for (const file of walk(abs('docs/ai'), (full) => {
    const relative = rel(full);
    if (!relative.includes('/CX1_') && !relative.includes('/cx1-')) return false;
    return /\.(json|md|csv|sql)$/i.test(relative);
  })) {
    pathSet.add(rel(file));
  }
  for (const selfOutput of SELF_OUTPUTS) pathSet.delete(selfOutput);
  return Array.from(pathSet).sort((a, b) => a.localeCompare(b));
}

function buildManifest(files, registry, queue) {
  const byRegistry = registryPaths(registry);
  const byQueue = queuePaths(queue);
  return files.map((relativePath) => {
    const full = abs(relativePath);
    const stat = fs.existsSync(full) ? fs.statSync(full) : null;
    return {
      path: relativePath,
      exists: Boolean(stat),
      sizeBytes: stat?.size ?? null,
      sha256: stat ? sha256(full) : null,
      registryExperiments: byRegistry.get(relativePath)?.experiments.join(';') || '',
      registryFields: byRegistry.get(relativePath)?.fields.join(';') || '',
      queueTasks: byQueue.get(relativePath)?.tasks.join(';') || '',
    };
  });
}

function checkRegistry(registry, findings) {
  if (registry.schema !== 'cx1-experiment-registry-v1') {
    addFinding(findings, 'fail', 'registry', 'unexpected registry schema', { schema: registry.schema });
  }
  const ids = new Set();
  for (const experiment of registry.experiments || []) {
    if (!experiment.experimentId) {
      addFinding(findings, 'fail', 'registry', 'experiment missing experimentId');
      continue;
    }
    if (ids.has(experiment.experimentId)) {
      addFinding(findings, 'fail', 'registry', 'duplicate experimentId', { experimentId: experiment.experimentId });
    }
    ids.add(experiment.experimentId);
    if (!ALLOWED_STATUSES.has(experiment.status)) {
      addFinding(findings, 'fail', 'registry', 'unknown experiment status', {
        experimentId: experiment.experimentId,
        status: experiment.status,
      });
    }
    for (const field of ['script', 'report', 'resultFile']) {
      const value = experiment[field];
      if (!value) continue;
      if (!exists(value) && !SELF_OUTPUTS.has(value)) {
        addFinding(findings, 'fail', 'registry', 'registry reference missing', {
          experimentId: experiment.experimentId,
          field,
          path: value,
        });
      }
      if ((field === 'report' || field === 'resultFile') && !isInsideDocsAi(value)) {
        addFinding(findings, 'fail', 'registry', 'CX1 report/result outside docs/ai', {
          experimentId: experiment.experimentId,
          field,
          path: value,
        });
      }
    }
    if ((experiment.status === 'complete' || experiment.status === 'complete_sample') && !experiment.resultFile) {
      addFinding(findings, 'warn', 'registry', 'completed experiment has no resultFile', {
        experimentId: experiment.experimentId,
      });
    }
  }
}

function checkQueue(queue, registry, findings) {
  if (queue.schema !== 'cx1-run-queue-v1') {
    addFinding(findings, 'fail', 'queue', 'unexpected queue schema', { schema: queue.schema });
  }
  const experimentIds = new Set((registry.experiments || []).map((experiment) => experiment.experimentId));
  const ids = new Set();
  for (const task of queue.tasks || []) {
    if (!task.id) {
      addFinding(findings, 'fail', 'queue', 'task missing id');
      continue;
    }
    if (ids.has(task.id)) addFinding(findings, 'fail', 'queue', 'duplicate task id', { taskId: task.id });
    ids.add(task.id);
    if (!ALLOWED_GATES.has(task.gate)) {
      addFinding(findings, 'fail', 'queue', 'unknown gate', { taskId: task.id, gate: task.gate });
    }
    if (task.registryExperimentId && !experimentIds.has(task.registryExperimentId)) {
      addFinding(findings, 'fail', 'queue', 'task references missing registry experiment', {
        taskId: task.id,
        registryExperimentId: task.registryExperimentId,
      });
    }
    for (const evidence of task.evidence || []) {
      if (!exists(evidence)) {
        addFinding(findings, 'fail', 'queue', 'queue evidence missing', { taskId: task.id, path: evidence });
      }
    }
    if (task.runnableNow && task.gate !== 'LIGHT') {
      addFinding(findings, 'fail', 'queue', 'non-LIGHT task marked runnable', {
        taskId: task.id,
        gate: task.gate,
        gateReasons: task.gateReasons,
      });
    }
    if (task.gate !== 'LIGHT' && /^node --check\b/i.test(task.command || '')) {
      addFinding(findings, 'fail', 'queue', 'non-LIGHT task uses LIGHT validation command', { taskId: task.id });
    }
  }
  if (queue.nextRunnable && !ids.has(queue.nextRunnable.id)) {
    addFinding(findings, 'fail', 'queue', 'nextRunnable is not in task list', { nextRunnable: queue.nextRunnable.id });
  }
}

function checkPreflight(preflight, findings) {
  if (preflight.schema !== 'cx1-preflight-v1') {
    addFinding(findings, 'fail', 'preflight', 'unexpected preflight schema', { schema: preflight.schema });
  }
  if (preflight.status !== 'pass') {
    addFinding(findings, 'fail', 'preflight', 'preflight is not passing', { status: preflight.status });
  }
  for (const check of preflight.checks || []) {
    if (check.status !== 'pass') {
      addFinding(findings, 'fail', 'preflight', 'preflight check is not passing', {
        check: check.id,
        status: check.status,
      });
    }
  }
}

function checkSqlFiles(files, findings) {
  for (const relativePath of files.filter((file) => file.endsWith('.sql'))) {
    const sql = readText(relativePath);
    const stripped = stripSqlComments(sql);
    const forbidden = stripped.match(FORBIDDEN_SQL)?.[1] || null;
    const startsWithRead = /^\s*(with|select)\b/i.test(stripped);
    if (forbidden || !startsWithRead) {
      addFinding(findings, 'fail', 'sql', 'SQL file is not lexically read-only', {
        path: relativePath,
        forbiddenToken: forbidden,
        startsWithRead,
      });
    }
  }
}

function checkStatusDocument(registry, findings) {
  if (!exists(STATUS_PATH)) {
    addFinding(findings, 'fail', 'status', 'status document missing', { path: STATUS_PATH });
    return;
  }
  const status = readText(STATUS_PATH);
  for (const experiment of registry.experiments || []) {
    if (!experiment.report) continue;
    if (experiment.report === STATUS_PATH) continue;
    if (!status.includes(experiment.report)) {
      addFinding(findings, 'warn', 'status', 'status document does not mention registry report', {
        experimentId: experiment.experimentId,
        report: experiment.report,
      });
    }
  }
}

function checkJsonFiles(files, findings) {
  for (const relativePath of files.filter((file) => file.endsWith('.json'))) {
    try {
      JSON.parse(readText(relativePath));
    } catch (error) {
      addFinding(findings, 'fail', 'json', 'JSON file failed to parse', {
        path: relativePath,
        error: error.message,
      });
    }
  }
}

function checkOrphans(files, registry, queue, findings) {
  const referenced = new Set();
  for (const item of registryPaths(registry).values()) referenced.add(item.path);
  for (const item of queuePaths(queue).values()) referenced.add(item.path);
  for (const file of files) {
    if (file.endsWith('.sql')) continue;
    if (referenced.has(file)) continue;
    if (/\/cx1-[^/]+\/.+\.(json|csv)$/i.test(file)) {
      addFinding(findings, 'info', 'manifest', 'CX1 evidence file is not directly referenced by registry or queue', {
        path: file,
      });
    }
  }
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# CX1 Evidence Integrity');
  lines.push('');
  lines.push(`Generated: **${report.generatedAt}**`);
  lines.push('');
  lines.push(`Status: **${report.status}**`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Signal | Value |');
  lines.push('|---|---:|');
  lines.push(`| Registry experiments | ${report.summary.registryExperiments} |`);
  lines.push(`| Queue tasks | ${report.summary.queueTasks} |`);
  lines.push(`| Manifest files | ${report.summary.manifestFiles} |`);
  lines.push(`| JSON files parsed | ${report.summary.jsonFiles} |`);
  lines.push(`| SQL files scanned | ${report.summary.sqlFiles} |`);
  lines.push(`| Fail findings | ${report.summary.failFindings} |`);
  lines.push(`| Warn findings | ${report.summary.warnFindings} |`);
  lines.push(`| Info findings | ${report.summary.infoFindings} |`);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (!report.findings.length) {
    lines.push('No findings.');
  } else {
    lines.push('| Severity | Area | Message | Detail |');
    lines.push('|---|---|---|---|');
    for (const finding of report.findings) {
      const detail = Object.entries(finding)
        .filter(([key]) => !['severity', 'area', 'message'].includes(key))
        .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(';') : value}`)
        .join('; ');
      lines.push(`| ${finding.severity} | ${finding.area} | ${finding.message} | ${detail || ''} |`);
    }
  }
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push('This audit is offline. It reads and hashes CX1 files, parses JSON, performs lexical SQL scans, and writes evidence under `docs/ai`. It does not query PostgreSQL, fetch PDFs, run OCR, copy vectors, build indexes, call a model, or modify production state.');
  lines.push('');
  lines.push('## Manifest');
  lines.push('');
  lines.push('- `docs/ai/cx1-evidence-integrity/artifact-manifest.json`');
  lines.push('- `docs/ai/cx1-evidence-integrity/artifact-manifest.csv`');
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const registry = readJson(REGISTRY_PATH);
  const queue = readJson(QUEUE_PATH);
  const preflight = readJson(PREFLIGHT_PATH);
  const findings = [];

  checkRegistry(registry, findings);
  checkQueue(queue, registry, findings);
  checkPreflight(preflight, findings);

  const files = discoverEvidenceFiles(registry, queue);
  checkJsonFiles(files, findings);
  checkSqlFiles(files, findings);
  checkStatusDocument(registry, findings);
  checkOrphans(files, registry, queue, findings);

  const manifest = buildManifest(files, registry, queue);
  const report = {
    schema: 'cx1-evidence-integrity-v1',
    generatedAt: new Date().toISOString(),
    status: statusOf(findings),
    boundary:
      'offline only: no PostgreSQL query, no PDF fetch, no OCR, no vector copy, no HNSW build, no model call, no production write',
    inputs: [REGISTRY_PATH, QUEUE_PATH, PREFLIGHT_PATH, STATUS_PATH],
    summary: {
      registryExperiments: registry.experiments.length,
      queueTasks: queue.tasks.length,
      manifestFiles: manifest.length,
      jsonFiles: files.filter((file) => file.endsWith('.json')).length,
      sqlFiles: files.filter((file) => file.endsWith('.sql')).length,
      failFindings: findings.filter((finding) => finding.severity === 'fail').length,
      warnFindings: findings.filter((finding) => finding.severity === 'warn').length,
      infoFindings: findings.filter((finding) => finding.severity === 'info').length,
    },
    findings,
    manifestPath: rel(OUT_MANIFEST_JSON),
  };

  fs.writeFileSync(OUT_MANIFEST_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  writeCsv(OUT_MANIFEST_CSV, manifest, [
    'path',
    'exists',
    'sizeBytes',
    'sha256',
    'registryExperiments',
    'registryFields',
    'queueTasks',
  ]);
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, renderMarkdown(report));
  console.log(`wrote ${rel(OUT_JSON)}`);
  console.log(`wrote ${rel(OUT_MANIFEST_JSON)}`);
  console.log(`wrote ${rel(OUT_MD)}`);
  console.log(`status ${report.status}`);
  if (report.status !== 'pass') process.exit(1);
}

main();
