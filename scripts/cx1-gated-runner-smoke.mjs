#!/usr/bin/env node
/**
 * CX1 gated-runner refusal smoke.
 *
 * Proves the runner refuses a prepared DB task without overwriting the normal
 * runner result. It launches no DB/PDF/OCR/vector/HNSW work.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-runner-results');
const REFUSAL_JSON = path.join(OUT_DIR, 'refusal-smoke.json');
const REFUSAL_MD = path.join(OUT_DIR, 'refusal-smoke.md');
const REPORT_JSON = path.join(OUT_DIR, 'runner-smoke.json');
const REPORT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_GATED_RUNNER_SAFETY.md');

function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const normalBefore = fs.existsSync(path.join(ROOT, 'docs', 'ai', 'CX1_GATED_RUNNER.json'))
    ? JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'ai', 'CX1_GATED_RUNNER.json'), 'utf8'))
    : null;
  const refusal = run([
    'scripts/cx1-gated-runner.mjs',
    '--task',
    'cx1-db-sample-census-run',
    '--result-json',
    REFUSAL_JSON,
    '--result-md',
    REFUSAL_MD,
  ]);
  if (refusal.status !== 2) {
    throw new Error(`expected refusal exit code 2, got ${refusal.status}: ${refusal.stderr || refusal.stdout}`);
  }
  const refusalResult = JSON.parse(fs.readFileSync(REFUSAL_JSON, 'utf8'));
  const normalAfter = fs.existsSync(path.join(ROOT, 'docs', 'ai', 'CX1_GATED_RUNNER.json'))
    ? JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'ai', 'CX1_GATED_RUNNER.json'), 'utf8'))
    : null;
  const refusedForGate = refusalResult.status === 'refused' && refusalResult.gate === 'MEDIUM_CLEAN';
  const refusedForNonLight = (refusalResult.refusalReasons || []).some((reason) =>
    /only executes LIGHT tasks/.test(reason),
  );
  const normalPreserved =
    JSON.stringify(normalBefore) === JSON.stringify(normalAfter) ||
    (normalBefore === null && normalAfter === null);
  if (!refusedForGate || !refusedForNonLight || !normalPreserved) {
    throw new Error(
      `refusal smoke failed: refusedForGate=${refusedForGate} refusedForNonLight=${refusedForNonLight} normalPreserved=${normalPreserved}`,
    );
  }
  const report = {
    schema: 'cx1-gated-runner-smoke-v1',
    generatedAt: new Date().toISOString(),
    status: 'pass',
    refusedTask: 'cx1-db-sample-census-run',
    refusalExitCode: refusal.status,
    refusalResult: path.relative(ROOT, REFUSAL_JSON).replaceAll('\\', '/'),
    normalRunnerResultPreserved: true,
    assertions: {
      refusedForMediumCleanGate: refusedForGate,
      refusedBecauseRunnerIsLightOnly: refusedForNonLight,
      noDefaultResultOverwrite: normalPreserved,
    },
    boundary:
      'No DB/PDF/OCR/vector/HNSW work executed; the child runner refused before command execution.',
  };
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [];
  lines.push('# CX1 Gated Runner Safety');
  lines.push('');
  lines.push(`Generated: **${report.generatedAt}**`);
  lines.push('');
  lines.push('Status: **pass**');
  lines.push('');
  lines.push('The smoke requested `cx1-db-sample-census-run` and confirmed the gated runner refused it with exit code 2 because it is not a LIGHT task. The refusal was written to an isolated result file, and the normal runner result was preserved.');
  lines.push('');
  lines.push('Machine outputs:');
  lines.push('');
  lines.push('- `docs/ai/cx1-runner-results/runner-smoke.json`');
  lines.push('- `docs/ai/cx1-runner-results/refusal-smoke.json`');
  lines.push('- `docs/ai/cx1-runner-results/refusal-smoke.md`');
  lines.push('');
  lines.push('Boundary: no DB/PDF/OCR/vector/HNSW work executed.');
  fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`);
  console.log(`wrote ${path.relative(ROOT, REPORT_JSON)}`);
  console.log(`wrote ${path.relative(ROOT, REPORT_MD)}`);
  console.log('status pass');
}

main();
