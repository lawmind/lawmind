#!/usr/bin/env node
/**
 * CX1 run queue.
 *
 * Observer/planner only: reads the scheduler and experiment registry, then
 * writes the next safe commands by gate class. It never launches a workstream.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai');
const QUEUE_JSON = path.join(OUT_DIR, 'CX1_RUN_QUEUE.json');
const QUEUE_MD = path.join(OUT_DIR, 'CX1_RUN_QUEUE.md');
const REGISTRY = path.join(OUT_DIR, 'CX1_EXPERIMENT_REGISTRY.json');

const JOB_CLASS_RANK = {
  LIGHT: 0,
  MEDIUM: 1,
  HEAVY: 2,
  VECTOR_EXCLUSIVE: 3,
};

const TASKS = [
  {
    id: 'cx1-validate-light-artifacts',
    workstream: 'M',
    gate: 'LIGHT',
    status: 'ready',
    command:
      'node --check scripts\\cx1-heavy-lab-runner.mjs scripts\\cx1-db-sample-census.mjs scripts\\cx1-devanagari-scale-plan.mjs scripts\\cx1-hnsw-parameter-plan.mjs scripts\\cx1-run-queue.mjs scripts\\cx1-preflight.mjs scripts\\cx1-gated-runner.mjs scripts\\cx1-gated-runner-smoke.mjs',
    evidence: [
      'docs/ai/CX1_EXPERIMENT_REGISTRY.json',
      'docs/ai/cx1-db-sample-census/sample-census-plan.json',
      'docs/ai/cx1-devanagari-results/scale-validation-plan.json',
      'docs/ai/cx1-vector-results/hnsw-parameter-plan.json',
    ],
    notes: 'Cheap validation only; no DB query.',
  },
  {
    id: 'cx1-db-sample-census-run',
    workstream: 'A/B',
    gate: 'MEDIUM_CLEAN',
    status: 'prepared_not_run',
    registryExperimentId: 'cx1-db-sample-census-harness-20260817',
    command:
      'node scripts\\cx1-db-sample-census.mjs --run --sample-percent 0.25 --limit 20000 --seed 170817',
    evidence: ['docs/ai/CX1_DB_SAMPLE_CENSUS.md', 'docs/ai/cx1-db-sample-census/sample-census.sql'],
    notes: 'Read-only DB sample. Requires low DB pressure and no competing lane readers.',
  },
  {
    id: 'cx1-devanagari-selector-run',
    workstream: 'F',
    gate: 'MEDIUM_CLEAN',
    status: 'prepared_not_run',
    registryExperimentId: 'cx1-devanagari-scale-validation-plan-20260817',
    command:
      'node scripts\\migration\\pg-local.mjs psql -t -A -X -q -f docs\\ai\\cx1-devanagari-results\\scale-validation-selector.sql',
    evidence: [
      'docs/ai/CX1_DEVANAGARI_SCALE_VALIDATION.md',
      'docs/ai/cx1-devanagari-results/scale-validation-selector.sql',
    ],
    notes:
      'Selector only; no PDF fetch/OCR. Save stdout to a lab result file when executed.',
  },
  {
    id: 'cx1-hnsw-d0-plan-run',
    workstream: 'D',
    gate: 'VECTOR_EXCLUSIVE',
    status: 'prepared_not_run',
    registryExperimentId: 'cx1-hnsw-parameter-plan-20260817',
    command: 'future: run D0 rows from docs\\ai\\cx1-vector-results\\hnsw-parameter-plan.json',
    evidence: [
      'docs/ai/CX1_HNSW_PARAMETER_LAB.md',
      'docs/ai/cx1-vector-results/hnsw-parameter-plan.json',
    ],
    notes:
      'Requires disposable vector lab runner before execution. One HNSW build at a time.',
  },
  {
    id: 'cx1-halfvec-c3-ann-recall',
    workstream: 'C',
    gate: 'VECTOR_EXCLUSIVE',
    status: 'prepared_not_run',
    registryExperimentId: 'cx1-halfvec-fidelity-harness-20260817',
    command: 'future: extend scripts\\cx1-halfvec-fidelity.py with C3 ANN recall',
    evidence: ['docs/ai/CX1_HALFVEC_FIDELITY.md'],
    notes: 'C1/C2 complete; C3 needs HNSW ANN recall on copied vectors.',
  },
  {
    id: 'cx1-silver-real-replay-plan',
    workstream: 'G',
    gate: 'MEDIUM_CLEAN',
    status: 'prepared_not_run',
    registryExperimentId: 'cx1-silver-production-prototype-smoke-20260817',
    command: 'future: bounded JSONL export into scripts\\cx1-silver-writer.py under C:\\lawmind\\cx1-lab',
    evidence: ['docs/ai/CX1_SILVER_PRODUCTION_PROTOTYPE.md'],
    notes:
      'Prototype smoke/failure smoke passed; real-corpus replay still needs a bounded read-only exporter.',
  },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function schedulerSnapshot() {
  const result = spawnSync(process.execPath, ['scripts/cx1-heavy-lab-runner.mjs', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    return {
      available: false,
      error: (result.stderr || result.stdout || '').trim(),
      recommendation: { maxClass: 'LIGHT', reasons: ['scheduler failed'] },
    };
  }
  return { available: true, ...JSON.parse(result.stdout) };
}

function hasMainLaneHeavy(snapshot) {
  return (snapshot.processes || []).some((p) => p.isMainLaneHeavy);
}

function gateState(task, snapshot) {
  const maxClass = snapshot.recommendation?.maxClass || 'LIGHT';
  const maxRank = JOB_CLASS_RANK[maxClass] ?? 0;
  const pg = snapshot.postgres || {};
  const active = Number(pg.active || 0);
  const oldest = Number(pg.oldestSeconds || 0);
  const freeRamPct = Number(snapshot.system?.freeRamPct || 0);
  const reasons = [];

  if (task.gate === 'LIGHT') {
    return { runnableNow: true, reasons: ['LIGHT gate allows offline validation'] };
  }

  if (task.gate === 'MEDIUM_CLEAN') {
    if (maxRank < JOB_CLASS_RANK.MEDIUM) reasons.push(`scheduler maxClass is ${maxClass}`);
    if (active > 1) reasons.push(`PostgreSQL active backends=${active}`);
    if (oldest > 120) reasons.push(`oldest transaction=${oldest}s`);
    if (freeRamPct < 25) reasons.push(`RAM free ${freeRamPct.toFixed(1)}%`);
    if (hasMainLaneHeavy(snapshot)) reasons.push('known main-lane heavy process detected');
    return {
      runnableNow: reasons.length === 0,
      reasons: reasons.length ? reasons : ['MEDIUM_CLEAN gate clear'],
    };
  }

  if (task.gate === 'VECTOR_EXCLUSIVE') {
    if (maxClass !== 'VECTOR_EXCLUSIVE') reasons.push(`scheduler maxClass is ${maxClass}`);
    if (active > 0) reasons.push(`PostgreSQL active backends=${active}`);
    if (freeRamPct < 30) reasons.push(`RAM free ${freeRamPct.toFixed(1)}%`);
    if (hasMainLaneHeavy(snapshot)) reasons.push('known main-lane heavy process detected');
    return {
      runnableNow: reasons.length === 0,
      reasons: reasons.length ? reasons : ['VECTOR_EXCLUSIVE gate clear'],
    };
  }

  return { runnableNow: false, reasons: [`unknown gate ${task.gate}`] };
}

function registryStatus(registry, task) {
  if (!task.registryExperimentId) return task.status;
  const entry = registry.experiments.find((e) => e.experimentId === task.registryExperimentId);
  return entry?.status || task.status;
}

function renderMarkdown(queue) {
  const lines = [];
  lines.push('# CX1 Run Queue');
  lines.push('');
  lines.push(`Generated: **${queue.generatedAt}**`);
  lines.push('');
  lines.push('## Scheduler');
  lines.push('');
  lines.push(`Current max class: **${queue.scheduler.maxClass}**`);
  lines.push('');
  lines.push('| Signal | Value |');
  lines.push('|---|---:|');
  lines.push(`| CPU | ${queue.scheduler.cpuPct === null ? 'n/a' : `${queue.scheduler.cpuPct.toFixed(1)}%`} |`);
  lines.push(`| RAM free | ${queue.scheduler.freeRamPct.toFixed(1)}% |`);
  lines.push(`| PostgreSQL active backends | ${queue.scheduler.postgresActive} |`);
  lines.push(`| PostgreSQL oldest transaction | ${queue.scheduler.postgresOldestSeconds}s |`);
  lines.push('');
  lines.push('## Queue');
  lines.push('');
  lines.push('| Task | Workstream | Gate | Runnable now | Status | Reason |');
  lines.push('|---|---|---|---|---|---|');
  for (const task of queue.tasks) {
    lines.push(
      `| \`${task.id}\` | ${task.workstream} | ${task.gate} | ${task.runnableNow ? 'yes' : 'no'} | ${task.registryStatus} | ${task.gateReasons.join('; ')} |`,
    );
  }
  lines.push('');
  lines.push('## Next Safe Command');
  lines.push('');
  if (queue.nextRunnable) {
    lines.push(`Task: \`${queue.nextRunnable.id}\``);
    lines.push('');
    lines.push('```powershell');
    lines.push(queue.nextRunnable.command);
    lines.push('```');
  } else {
    lines.push('No queued task is runnable under the current scheduler gate.');
  }
  lines.push('');
  lines.push('## Boundaries');
  lines.push('');
  lines.push('- This queue is an observer/planner artifact; it launches nothing.');
  lines.push('- Live DB, PDF/OCR, vector-copy, and HNSW work remain gated by scheduler state.');
  lines.push('- No queue item promotes halfvec, OCR text, Gold data, or production schema.');
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const registry = readJson(REGISTRY);
  const snapshot = schedulerSnapshot();
  const tasks = TASKS.map((task) => {
    const gate = gateState(task, snapshot);
    return {
      ...task,
      registryStatus: registryStatus(registry, task),
      runnableNow: gate.runnableNow,
      gateReasons: gate.reasons,
    };
  });
  const nextRunnable =
    tasks.find((task) => task.runnableNow && task.status === 'ready') ||
    tasks.find((task) => task.runnableNow) ||
    null;
  const queue = {
    schema: 'cx1-run-queue-v1',
    generatedAt: new Date().toISOString(),
    status: 'active',
    scheduler: {
      available: snapshot.available,
      maxClass: snapshot.recommendation?.maxClass || 'LIGHT',
      reasons: snapshot.recommendation?.reasons || [],
      cpuPct: snapshot.system?.cpuPct ?? null,
      freeRamPct: snapshot.system?.freeRamPct ?? 0,
      postgresActive: Number(snapshot.postgres?.active || 0),
      postgresOldestSeconds: Number(snapshot.postgres?.oldestSeconds || 0),
    },
    nextRunnable: nextRunnable
      ? { id: nextRunnable.id, command: nextRunnable.command, gate: nextRunnable.gate }
      : null,
    tasks,
  };
  fs.writeFileSync(QUEUE_JSON, `${JSON.stringify(queue, null, 2)}\n`);
  fs.writeFileSync(QUEUE_MD, renderMarkdown(queue));
  console.log(`wrote ${path.relative(ROOT, QUEUE_JSON)}`);
  console.log(`wrote ${path.relative(ROOT, QUEUE_MD)}`);
  console.log(
    queue.nextRunnable
      ? `next ${queue.nextRunnable.id}: ${queue.nextRunnable.command}`
      : 'no task runnable now',
  );
}

main();
