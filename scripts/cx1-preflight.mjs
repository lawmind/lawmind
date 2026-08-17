#!/usr/bin/env node
/**
 * CX1 offline preflight.
 *
 * Verifies that prepared CX1 scripts/manifests/selectors are syntactically
 * usable and remain shadow-safe. It does not connect to PostgreSQL, fetch PDFs,
 * run OCR, copy vectors, or execute any prepared workstream.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'docs', 'ai', 'CX1_PREFLIGHT.json');
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_PREFLIGHT.md');

const NODE_SCRIPTS = [
  'scripts/cx1-heavy-lab-runner.mjs',
  'scripts/cx1-corpus-census.mjs',
  'scripts/cx1-embedding-eligibility-census.mjs',
  'scripts/cx1-db-sample-census.mjs',
  'scripts/cx1-devanagari-scale-plan.mjs',
  'scripts/cx1-hnsw-parameter-plan.mjs',
  'scripts/cx1-run-queue.mjs',
  'scripts/cx1-document-classification-audit.mjs',
  'scripts/cx1-legal-object-efficiency.mjs',
  'scripts/cx1-evidence-integrity.mjs',
  'scripts/cx1-selector-runner.mjs',
  'scripts/cx1-selector-runner-smoke.mjs',
  'scripts/cx1-retrieval-matrix.mjs',
  'scripts/cx1-citation-graph-census.mjs',
  'scripts/cx1-premium-backend-lab.mjs',
  'scripts/cx1-disaster-recovery-drill.mjs',
  'scripts/cx1-heavy-lab-final.mjs',
  'scripts/cx1-preflight.mjs',
  'scripts/cx1-gated-runner.mjs',
  'scripts/cx1-gated-runner-smoke.mjs',
];

const PYTHON_SCRIPTS = [
  'scripts/cx1-halfvec-fidelity.py',
  'scripts/cx1_silver_lib.py',
  'scripts/cx1-silver-writer.py',
  'scripts/cx1-silver-compact.py',
  'scripts/cx1-silver-smoke.py',
  'scripts/cx1-silver-failure-smoke.py',
];

const JSON_FILES = [
  'docs/ai/CX1_EXPERIMENT_REGISTRY.json',
  'docs/ai/CX1_RUN_QUEUE.json',
  'docs/ai/CX1_GATED_RUNNER.json',
  'docs/ai/cx1-runner-results/runner-smoke.json',
  'docs/ai/cx1-runner-results/refusal-smoke.json',
  'docs/ai/cx1-corpus-census/metadata-coverage.json',
  'docs/ai/cx1-embedding-eligibility/population-scenarios.json',
  'docs/ai/cx1-vector-results/halfvec-fidelity.json',
  'docs/ai/cx1-vector-results/hnsw-parameter-plan.json',
  'docs/ai/cx1-devanagari-results/scale-validation-plan.json',
  'docs/ai/cx1-db-sample-census/sample-census-plan.json',
  'docs/ai/cx1-classification-audit/classification-audit.json',
  'docs/ai/cx1-classification-audit/sample-plan.json',
  'docs/ai/cx1-legal-object-efficiency/triage-summary.json',
  'docs/ai/cx1-legal-object-efficiency/router-proposal.json',
  'docs/ai/cx1-evidence-integrity/integrity-report.json',
  'docs/ai/cx1-evidence-integrity/artifact-manifest.json',
  'docs/ai/cx1-selector-results/selector-runner-smoke.json',
  'docs/ai/cx1-selector-results/selector-runner-dry-run.json',
  'docs/ai/cx1-selector-results/selector-runner-refusal.json',
  'docs/ai/cx1-retrieval-matrix/matrix-plan.json',
  'docs/ai/cx1-citation-graph-census/citation-graph-census.json',
  'docs/ai/cx1-premium-backend-lab/premium-backend-lab.json',
  'docs/ai/cx1-disaster-recovery-drill/drill-plan.json',
  'docs/ai/cx1-silver-results/prototype-smoke.json',
  'docs/ai/cx1-silver-results/failure-smoke.json',
];

const SQL_FILES = [
  'docs/ai/cx1-db-sample-census/sample-census.sql',
  'docs/ai/cx1-devanagari-results/scale-validation-selector.sql',
  'docs/ai/cx1-classification-audit/sample-selector.sql',
  'docs/ai/cx1-legal-object-efficiency/efficiency-selector.sql',
  'docs/ai/cx1-legal-object-efficiency/llm-cost-selector.sql',
  'docs/ai/cx1-citation-graph-census/graph-census-selector.sql',
  'docs/ai/cx1-disaster-recovery-drill/restore-smoke.sql',
];

const FORBIDDEN_SQL = /\b(insert|update|delete|merge|drop|alter|create|truncate|vacuum|analyze|copy|grant|revoke|call)\b/i;

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

function pythonExe() {
  const venv = 'C:\\lawmind\\cx1-lab\\venv\\Scripts\\python.exe';
  return fs.existsSync(venv) ? venv : 'python';
}

function checkNodeSyntax() {
  const result = run(process.execPath, ['--check', ...NODE_SCRIPTS]);
  return {
    id: 'node-syntax',
    status: result.status === 0 ? 'pass' : 'fail',
    command: `node --check ${NODE_SCRIPTS.join(' ')}`,
    files: NODE_SCRIPTS,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function checkPythonCompile() {
  const py = pythonExe();
  const result = run(py, ['-m', 'py_compile', ...PYTHON_SCRIPTS]);
  return {
    id: 'python-compile',
    status: result.status === 0 ? 'pass' : 'fail',
    command: `${py} -m py_compile ${PYTHON_SCRIPTS.join(' ')}`,
    files: PYTHON_SCRIPTS,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function checkJsonFiles() {
  const findings = [];
  for (const file of JSON_FILES) {
    const full = abs(file);
    if (!fs.existsSync(full)) {
      findings.push({ file, status: 'fail', error: 'missing' });
      continue;
    }
    try {
      JSON.parse(fs.readFileSync(full, 'utf8'));
      findings.push({ file, status: 'pass' });
    } catch (error) {
      findings.push({ file, status: 'fail', error: error.message });
    }
  }
  return {
    id: 'json-parse',
    status: findings.every((f) => f.status === 'pass') ? 'pass' : 'fail',
    findings,
  };
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

function checkSqlReadOnly() {
  const findings = [];
  for (const file of SQL_FILES) {
    const full = abs(file);
    if (!fs.existsSync(full)) {
      findings.push({ file, status: 'fail', error: 'missing' });
      continue;
    }
    const sql = fs.readFileSync(full, 'utf8');
    const stripped = stripSqlComments(sql);
    const forbidden = stripped.match(FORBIDDEN_SQL)?.[1] || null;
    const startsWithRead = /^\s*(with|select)\b/i.test(stripped);
    findings.push({
      file,
      status: !forbidden && startsWithRead ? 'pass' : 'fail',
      startsWithRead,
      forbiddenToken: forbidden,
    });
  }
  return {
    id: 'sql-readonly-scan',
    status: findings.every((f) => f.status === 'pass') ? 'pass' : 'fail',
    findings,
    caveat: 'Lexical guard only. It proves no obvious mutating SQL token in prepared selectors; it is not a PostgreSQL parser.',
  };
}

function checkRegistryReferences() {
  const registryPath = abs('docs/ai/CX1_EXPERIMENT_REGISTRY.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const findings = [];
  for (const experiment of registry.experiments) {
    for (const field of ['script', 'report', 'resultFile']) {
      const value = experiment[field];
      if (!value) continue;
      const full = abs(value);
      findings.push({
        experimentId: experiment.experimentId,
        field,
        path: value,
        status: fs.existsSync(full) ? 'pass' : 'fail',
      });
    }
  }
  return {
    id: 'registry-references',
    status: findings.every((f) => f.status === 'pass') ? 'pass' : 'fail',
    findings,
  };
}

function checkRunQueue() {
  const queue = JSON.parse(fs.readFileSync(abs('docs/ai/CX1_RUN_QUEUE.json'), 'utf8'));
  const forbiddenRunnable = queue.tasks.filter(
    (task) => task.runnableNow && task.gate !== 'LIGHT',
  );
  const hasNext = Boolean(queue.nextRunnable);
  const nextMatches = !queue.nextRunnable || queue.tasks.some((task) => task.id === queue.nextRunnable.id);
  return {
    id: 'run-queue-gates',
    status: forbiddenRunnable.length === 0 && hasNext && nextMatches ? 'pass' : 'fail',
    scheduler: queue.scheduler,
    nextRunnable: queue.nextRunnable,
    forbiddenRunnable,
  };
}

function checkLabFences() {
  const files = [
    'scripts/cx1_silver_lib.py',
    'scripts/cx1-silver-smoke.py',
    'scripts/cx1-silver-failure-smoke.py',
  ];
  const findings = files.map((file) => {
    const text = fs.readFileSync(abs(file), 'utf8');
    const hasLabRoot = /C:\/lawmind\/cx1-lab|C:\\\\lawmind\\\\cx1-lab/.test(text);
    const hasOutsideGuard =
      file.endsWith('cx1_silver_lib.py') ? /def require_lab_path/.test(text) : /require_lab_path/.test(text);
    return {
      file,
      status: hasLabRoot && hasOutsideGuard ? 'pass' : 'fail',
      hasLabRoot,
      hasOutsideGuard,
    };
  });
  return {
    id: 'lab-path-fences',
    status: findings.every((f) => f.status === 'pass') ? 'pass' : 'fail',
    findings,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# CX1 Preflight');
  lines.push('');
  lines.push(`Generated: **${report.generatedAt}**`);
  lines.push('');
  lines.push(`Status: **${report.status}**`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| Check | Status | Detail |');
  lines.push('|---|---|---|');
  for (const check of report.checks) {
    let detail = '';
    if (check.id === 'node-syntax' || check.id === 'python-compile') {
      detail = check.command;
    } else if (check.id === 'json-parse') {
      detail = `${check.findings.filter((f) => f.status === 'pass').length}/${check.findings.length} JSON files parsed`;
    } else if (check.id === 'sql-readonly-scan') {
      detail = `${check.findings.filter((f) => f.status === 'pass').length}/${check.findings.length} SQL files passed lexical read-only scan`;
    } else if (check.id === 'registry-references') {
      detail = `${check.findings.filter((f) => f.status === 'pass').length}/${check.findings.length} registry references exist`;
    } else if (check.id === 'run-queue-gates') {
      detail = `next ${check.nextRunnable?.id || 'none'}; scheduler ${check.scheduler.maxClass}`;
    } else if (check.id === 'lab-path-fences') {
      detail = `${check.findings.filter((f) => f.status === 'pass').length}/${check.findings.length} lab fence checks passed`;
    }
    lines.push(`| ${check.id} | ${check.status} | ${detail} |`);
  }
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push('This preflight is offline. It does not query PostgreSQL, fetch PDFs, run OCR, copy vectors, build HNSW indexes, or modify canonical production state.');
  lines.push('');
  lines.push('## Caveats');
  lines.push('');
  lines.push('- SQL read-only validation is lexical and conservative; live execution remains scheduler-gated.');
  lines.push('- Registry reference existence proves files exist, not that completed measurements cover broader claims.');
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  const checks = [
    checkNodeSyntax(),
    checkPythonCompile(),
    checkJsonFiles(),
    checkSqlReadOnly(),
    checkRegistryReferences(),
    checkRunQueue(),
    checkLabFences(),
  ];
  const status = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
  const report = {
    schema: 'cx1-preflight-v1',
    generatedAt: new Date().toISOString(),
    status,
    boundary:
      'offline only: no PostgreSQL query, no PDF fetch, no OCR, no vector copy, no HNSW build, no production write',
    checks,
  };
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, renderMarkdown(report));
  console.log(`wrote ${rel(OUT_JSON)}`);
  console.log(`wrote ${rel(OUT_MD)}`);
  console.log(`status ${status}`);
  if (status !== 'pass') process.exit(1);
}

main();
