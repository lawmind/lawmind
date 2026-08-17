#!/usr/bin/env node
/**
 * CX1 gated runner.
 *
 * Executes only queue-approved LIGHT tasks. It refreshes the run queue first,
 * refuses DB/PDF/OCR/vector/HNSW tasks, and writes a small execution result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const QUEUE_JSON = path.join(ROOT, 'docs', 'ai', 'CX1_RUN_QUEUE.json');
const DEFAULT_RESULT_JSON = path.join(ROOT, 'docs', 'ai', 'CX1_GATED_RUNNER.json');
const DEFAULT_RESULT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_GATED_RUNNER.md');

const LIGHT_TASKS = new Map([
  [
    'cx1-validate-light-artifacts',
    {
      command: process.execPath,
      args: [
        '--check',
        'scripts/cx1-heavy-lab-runner.mjs',
        'scripts/cx1-db-sample-census.mjs',
        'scripts/cx1-devanagari-scale-plan.mjs',
        'scripts/cx1-hnsw-parameter-plan.mjs',
        'scripts/cx1-run-queue.mjs',
        'scripts/cx1-preflight.mjs',
        'scripts/cx1-gated-runner.mjs',
        'scripts/cx1-gated-runner-smoke.mjs',
      ],
      display:
        'node --check scripts\\cx1-heavy-lab-runner.mjs scripts\\cx1-db-sample-census.mjs scripts\\cx1-devanagari-scale-plan.mjs scripts\\cx1-hnsw-parameter-plan.mjs scripts\\cx1-run-queue.mjs scripts\\cx1-preflight.mjs scripts\\cx1-gated-runner.mjs scripts\\cx1-gated-runner-smoke.mjs',
    },
  ],
]);

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function outputPaths() {
  const json = path.resolve(ROOT, arg('--result-json', DEFAULT_RESULT_JSON));
  const md = path.resolve(ROOT, arg('--result-md', DEFAULT_RESULT_MD));
  return { json, md };
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

function refreshQueue() {
  const result = run(process.execPath, ['scripts/cx1-run-queue.mjs']);
  if (result.status !== 0) {
    throw new Error(`queue refresh failed: ${result.stderr || result.stdout}`);
  }
}

function readQueue() {
  return JSON.parse(fs.readFileSync(QUEUE_JSON, 'utf8'));
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# CX1 Gated Runner');
  lines.push('');
  lines.push(`Generated: **${result.generatedAt}**`);
  lines.push('');
  lines.push(`Status: **${result.status}**`);
  lines.push('');
  lines.push(`Task: \`${result.taskId}\``);
  lines.push('');
  lines.push(`Gate: **${result.gate || 'n/a'}**`);
  lines.push('');
  lines.push('## Command');
  lines.push('');
  lines.push('```powershell');
  lines.push(result.command || '(not executed)');
  lines.push('```');
  lines.push('');
  lines.push('## Outcome');
  lines.push('');
  lines.push(`Exit code: **${result.exitCode ?? 'n/a'}**`);
  if (result.refusalReasons?.length) {
    lines.push('');
    lines.push('Refusal reasons:');
    for (const reason of result.refusalReasons) lines.push(`- ${reason}`);
  }
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push('This runner only executes queue-approved LIGHT tasks. It does not execute DB, PDF/OCR, vector-copy, HNSW, Gold, retrieval, or production-schema commands.');
  return `${lines.join('\n')}\n`;
}

function writeResult(result, outputs) {
  fs.mkdirSync(path.dirname(outputs.json), { recursive: true });
  fs.mkdirSync(path.dirname(outputs.md), { recursive: true });
  fs.writeFileSync(outputs.json, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(outputs.md, renderMarkdown(result));
}

function main() {
  const requested = arg('--task');
  const outputs = outputPaths();
  refreshQueue();
  const queue = readQueue();
  const taskId = requested || queue.nextRunnable?.id || null;
  const task = queue.tasks.find((item) => item.id === taskId);
  const generatedAt = new Date().toISOString();

  if (!task) {
    const result = {
      schema: 'cx1-gated-runner-v1',
      generatedAt,
      status: 'refused',
      taskId,
      refusalReasons: ['requested task not found in CX1_RUN_QUEUE.json'],
      queueGeneratedAt: queue.generatedAt,
      scheduler: queue.scheduler,
    };
    writeResult(result, outputs);
    console.error(`refused: ${result.refusalReasons.join('; ')}`);
    process.exit(2);
  }

  const refusalReasons = [];
  if (!task.runnableNow) refusalReasons.push(`queue says task is not runnable: ${task.gateReasons.join('; ')}`);
  if (task.gate !== 'LIGHT') refusalReasons.push(`runner only executes LIGHT tasks; task gate is ${task.gate}`);
  if (!LIGHT_TASKS.has(task.id)) refusalReasons.push('task is not in the LIGHT execution allowlist');

  if (refusalReasons.length) {
    const result = {
      schema: 'cx1-gated-runner-v1',
      generatedAt,
      status: 'refused',
      taskId: task.id,
      gate: task.gate,
      command: task.command,
      refusalReasons,
      queueGeneratedAt: queue.generatedAt,
      scheduler: queue.scheduler,
    };
    writeResult(result, outputs);
    console.error(`refused ${task.id}: ${refusalReasons.join('; ')}`);
    process.exit(2);
  }

  const allowed = LIGHT_TASKS.get(task.id);
  const executed = run(allowed.command, allowed.args);
  const result = {
    schema: 'cx1-gated-runner-v1',
    generatedAt,
    status: executed.status === 0 ? 'pass' : 'fail',
    taskId: task.id,
    gate: task.gate,
    command: allowed.display,
    exitCode: executed.status,
    stdout: (executed.stdout || '').trim(),
    stderr: (executed.stderr || '').trim(),
    queueGeneratedAt: queue.generatedAt,
    scheduler: queue.scheduler,
  };
  writeResult(result, outputs);
  console.log(`task ${task.id} ${result.status}`);
  if (executed.status !== 0) process.exit(executed.status || 1);
}

main();
