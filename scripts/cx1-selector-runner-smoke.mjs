#!/usr/bin/env node
/**
 * CX1 selector-runner smoke.
 *
 * Proves the selector runner is dry-run by default and refuses unsupported
 * non-selector tasks before execution. No PostgreSQL selector is launched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-selector-results');
const DRY_JSON = path.join(OUT_DIR, 'selector-runner-dry-run.json');
const DRY_MD = path.join(OUT_DIR, 'selector-runner-dry-run.md');
const REFUSAL_JSON = path.join(OUT_DIR, 'selector-runner-refusal.json');
const REFUSAL_MD = path.join(OUT_DIR, 'selector-runner-refusal.md');
const REPORT_JSON = path.join(OUT_DIR, 'selector-runner-smoke.json');
const REPORT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_SELECTOR_RUNNER.md');

function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dryRun = run([
    'scripts/cx1-selector-runner.mjs',
    '--task',
    'cx1-devanagari-selector-run',
    '--result-json',
    rel(DRY_JSON),
    '--result-md',
    rel(DRY_MD),
  ]);
  if (dryRun.status !== 0) {
    throw new Error(`dry-run should exit 0, got ${dryRun.status}: ${dryRun.stderr || dryRun.stdout}`);
  }
  const dryResult = readJson(DRY_JSON);
  const dryRunSafe =
    dryResult.executed === false &&
    ['dry_run_ready', 'dry_run_blocked'].includes(dryResult.status) &&
    dryResult.mode === 'dry-run';

  const refusal = run([
    'scripts/cx1-selector-runner.mjs',
    '--execute',
    '--task',
    'cx1-validate-light-artifacts',
    '--result-json',
    rel(REFUSAL_JSON),
    '--result-md',
    rel(REFUSAL_MD),
  ]);
  if (refusal.status !== 2) {
    throw new Error(`expected unsupported-task refusal exit 2, got ${refusal.status}: ${refusal.stderr || refusal.stdout}`);
  }
  const refusalResult = readJson(REFUSAL_JSON);
  const refusedBeforeExecution =
    refusalResult.status === 'refused' &&
    refusalResult.executed === false &&
    (refusalResult.refusalReasons || []).some((reason) => /MEDIUM_CLEAN/.test(reason)) &&
    (refusalResult.refusalReasons || []).some((reason) => /selector shape/.test(reason));

  if (!dryRunSafe || !refusedBeforeExecution) {
    throw new Error(
      `selector smoke failed: dryRunSafe=${dryRunSafe} refusedBeforeExecution=${refusedBeforeExecution}`,
    );
  }

  const report = {
    schema: 'cx1-selector-runner-smoke-v1',
    generatedAt: new Date().toISOString(),
    status: 'pass',
    assertions: {
      dryRunDoesNotExecute: dryRunSafe,
      unsupportedTaskRefusedBeforeExecution: refusedBeforeExecution,
    },
    dryRunResult: rel(DRY_JSON),
    refusalResult: rel(REFUSAL_JSON),
    boundary:
      'No DB/PDF/OCR/vector/HNSW work executed; dry-run omitted --execute and unsupported execute was refused before command execution.',
  };
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const lines = [];
  lines.push('# CX1 Selector Runner');
  lines.push('');
  lines.push(`Generated: **${report.generatedAt}**`);
  lines.push('');
  lines.push('Status: **pass**');
  lines.push('');
  lines.push('The selector runner smoke confirmed that a prepared selector is dry-run by default and that an unsupported non-selector task is refused before execution.');
  lines.push('');
  lines.push('Machine outputs:');
  lines.push('');
  lines.push('- `docs/ai/cx1-selector-results/selector-runner-smoke.json`');
  lines.push('- `docs/ai/cx1-selector-results/selector-runner-dry-run.json`');
  lines.push('- `docs/ai/cx1-selector-results/selector-runner-refusal.json`');
  lines.push('');
  lines.push('Boundary: no PostgreSQL selector, PDF/OCR, vector, HNSW, Gold, schema, or production mutation work executed.');
  fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`);
  console.log(`wrote ${rel(REPORT_JSON)}`);
  console.log(`wrote ${rel(REPORT_MD)}`);
  console.log('status pass');
}

main();
