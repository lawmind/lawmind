#!/usr/bin/env node
/**
 * CX1 selector runner.
 *
 * Lab-only wrapper for prepared read-only SQL selectors. It refreshes the CX1
 * queue, validates the task/SQL shape, defaults to dry-run, and writes all
 * evidence under docs/ai/cx1-selector-results.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const QUEUE_JSON = path.join(ROOT, 'docs', 'ai', 'CX1_RUN_QUEUE.json');
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-selector-results');
const DEFAULT_JSON = path.join(OUT_DIR, 'selector-runner-latest.json');
const DEFAULT_MD = path.join(OUT_DIR, 'selector-runner-latest.md');
const FORBIDDEN_SQL = /\b(insert|update|delete|merge|drop|alter|create|truncate|vacuum|analyze|copy|grant|revoke|call)\b/i;

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function abs(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function outputPaths(taskId) {
  const jsonArg = arg('--result-json');
  const mdArg = arg('--result-md');
  const safeTask = (taskId || 'unknown-task').replace(/[^a-z0-9_.-]+/gi, '-');
  const json = jsonArg ? path.resolve(ROOT, jsonArg) : DEFAULT_JSON;
  const md = mdArg ? path.resolve(ROOT, mdArg) : DEFAULT_MD;
  const outRoot = path.resolve(OUT_DIR);
  for (const file of [json, md]) {
    if (!isInside(file, outRoot)) {
      throw new Error(`result path must stay under ${rel(outRoot)}: ${rel(file)}`);
    }
  }
  return { json, md, safeTask };
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
}

function refreshQueue() {
  const result = run(process.execPath, ['scripts/cx1-run-queue.mjs']);
  if (result.status !== 0) {
    throw new Error(`queue refresh failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
}

function readQueue() {
  return JSON.parse(fs.readFileSync(QUEUE_JSON, 'utf8'));
}

function normalizeCommand(command) {
  return String(command || '').replaceAll('/', '\\').trim();
}

function parseSelectorCommand(task) {
  const command = normalizeCommand(task.command);
  const match = command.match(
    /^node\s+scripts\\migration\\pg-local\.mjs\s+psql\s+-t\s+-A\s+-X\s+-q\s+-f\s+(docs\\ai\\cx1-[^"'<>|;&]+\.sql)$/i,
  );
  if (!match) return null;
  const sqlPath = match[1].replaceAll('\\', '/');
  return {
    display: task.command,
    sqlPath,
    args: ['scripts/migration/pg-local.mjs', 'psql', '-t', '-A', '-X', '-q', '-f', sqlPath],
  };
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

function validateSql(sqlPath) {
  const full = abs(sqlPath);
  const docsAi = path.resolve(ROOT, 'docs', 'ai');
  if (!isInside(full, docsAi)) {
    return { ok: false, reason: `SQL path is outside docs/ai: ${sqlPath}` };
  }
  if (!/^docs\/ai\/cx1-[^/]+\/[^/]+\.sql$/i.test(sqlPath)) {
    return { ok: false, reason: `SQL path is not a CX1 selector path: ${sqlPath}` };
  }
  if (!fs.existsSync(full)) {
    return { ok: false, reason: `SQL file missing: ${sqlPath}` };
  }
  const stripped = stripSqlComments(fs.readFileSync(full, 'utf8'));
  const forbidden = stripped.match(FORBIDDEN_SQL)?.[1] || null;
  const startsWithRead = /^\s*(with|select)\b/i.test(stripped);
  if (forbidden) return { ok: false, reason: `SQL contains forbidden token: ${forbidden}` };
  if (!startsWithRead) return { ok: false, reason: 'SQL does not start with SELECT/WITH' };
  return { ok: true, startsWithRead, forbiddenToken: null };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# CX1 Selector Runner');
  lines.push('');
  lines.push(`Generated: **${result.generatedAt}**`);
  lines.push('');
  lines.push(`Status: **${result.status}**`);
  lines.push('');
  lines.push(`Task: \`${result.taskId || 'n/a'}\``);
  lines.push('');
  lines.push(`Mode: **${result.mode}**`);
  lines.push('');
  lines.push(`Gate: **${result.gate || 'n/a'}**`);
  lines.push('');
  lines.push('## Command');
  lines.push('');
  lines.push('```powershell');
  lines.push(result.command || '(not executable)');
  lines.push('```');
  lines.push('');
  if (result.sqlPath) {
    lines.push(`SQL: \`${result.sqlPath}\``);
    lines.push('');
  }
  lines.push('## Outcome');
  lines.push('');
  lines.push(`Executed: **${result.executed ? 'yes' : 'no'}**`);
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
  lines.push('This runner executes only queue-cleared MEDIUM_CLEAN read-only selector SQL through pg-local psql. It never writes outside docs/ai/cx1-selector-results and never runs PDF/OCR, vector, HNSW, Gold, schema, or production mutation commands.');
  return `${lines.join('\n')}\n`;
}

function writeResult(result, outputs) {
  fs.mkdirSync(path.dirname(outputs.json), { recursive: true });
  fs.mkdirSync(path.dirname(outputs.md), { recursive: true });
  fs.writeFileSync(outputs.json, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(outputs.md, renderMarkdown(result));
}

function main() {
  const taskId = arg('--task');
  const execute = hasFlag('--execute');
  const generatedAt = new Date().toISOString();
  const outputs = outputPaths(taskId);
  refreshQueue();
  const queue = readQueue();
  const task = queue.tasks.find((item) => item.id === taskId);
  const refusalReasons = [];

  if (!taskId) refusalReasons.push('missing required --task');
  if (!task) {
    refusalReasons.push('requested task not found in CX1_RUN_QUEUE.json');
  }

  const parsed = task ? parseSelectorCommand(task) : null;
  if (task && task.gate !== 'MEDIUM_CLEAN') {
    refusalReasons.push(`selector runner only executes MEDIUM_CLEAN tasks; task gate is ${task.gate}`);
  }
  if (task && !parsed) {
    refusalReasons.push('task command is not an allowed pg-local psql selector shape');
  }
  const sqlCheck = parsed ? validateSql(parsed.sqlPath) : null;
  if (sqlCheck && !sqlCheck.ok) refusalReasons.push(sqlCheck.reason);
  if (task && !task.runnableNow) {
    refusalReasons.push(`queue says task is not runnable: ${task.gateReasons.join('; ')}`);
  }

  const base = {
    schema: 'cx1-selector-runner-v1',
    generatedAt,
    taskId,
    mode: execute ? 'execute' : 'dry-run',
    gate: task?.gate || null,
    command: task?.command || null,
    sqlPath: parsed?.sqlPath || null,
    queueGeneratedAt: queue.generatedAt,
    scheduler: queue.scheduler,
    evidencePath: rel(outputs.json),
  };

  if (refusalReasons.length || !execute) {
    const status = refusalReasons.length ? (execute ? 'refused' : 'dry_run_blocked') : 'dry_run_ready';
    const result = {
      ...base,
      status,
      executed: false,
      exitCode: null,
      refusalReasons,
      dryRunNote: execute ? null : 'No selector executed because --execute was not supplied.',
    };
    writeResult(result, outputs);
    console.log(`${status} ${taskId || '(missing task)'}`);
    if (execute && refusalReasons.length) process.exit(2);
    return;
  }

  const executed = run(process.execPath, parsed.args);
  const result = {
    ...base,
    status: executed.status === 0 ? 'pass' : 'fail',
    executed: true,
    exitCode: executed.status,
    stdout: (executed.stdout || '').trim(),
    stderr: (executed.stderr || '').trim(),
    refusalReasons: [],
  };
  writeResult(result, outputs);
  console.log(`executed ${taskId}: ${result.status}`);
  if (executed.status !== 0) process.exit(executed.status || 1);
}

main();
