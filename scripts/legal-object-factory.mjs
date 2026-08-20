#!/usr/bin/env node
/**
 * The DeepSeek legal-object factory — the same rotation as
 * `legal-object-factory.sh`, in Node, because the bash loop cannot survive on
 * this machine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS ALONGSIDE THE .sh
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The shell loop died mid-round with:
 *
 *     dofork: child -1 - forked process died unexpectedly, exit code 0xC000026B
 *     legal-object-factory.sh: fork: retry: Resource temporarily unavailable
 *
 * Git-bash emulates `fork()` on Windows and a loop that forks a `node`, a
 * `timeout` and a `grep` every batch runs it out eventually. It is the same
 * class of failure as the console-signal deaths that kept killing Postgres: the
 * work was fine, the process substrate was not.
 *
 * Node spawns Win32 processes directly. One child at a time, awaited, no shell.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE CALLER, IN ORDER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/DEEPSEEK_DATA_MOAT.md` §1 measured that several callers against the
 * free InferX pool worsen its 429 rate, so one caller finishes sooner than three
 * fighting each other. Concurrency stays 1 both between tasks and inside them.
 *
 * The five composite tasks run BEFORE the nine atomic ones in each round: the
 * composites are measured over 7,000+ documents at 79-81% claim verification and
 * the atomics have two smoke runs behind them. Order is the cheapest expression
 * of "prove it at scale before it displaces what works".
 *
 * Each pass re-selects, and the selector's anti-join on
 * `(judgment_id, task, prompt_version, status='ok')` means a pass never re-does
 * what the previous one landed — the loop ADVANCES rather than spinning.
 *
 * Run it under the stall watchdog, never bare:
 *
 *   node scripts/stall-watchdog.mjs --log .scratch/logs/legal-object-factory.log \
 *     --stall 1800 -- node scripts/legal-object-factory.mjs
 *
 * Bare, a Postgres restart hangs a child silently and nothing notices — that
 * cost 4.5 hours on 19 Aug.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 0051's composite tasks, measured. */
const COMPOSITE = ['holding', 'case_structure', 'arguments', 'authorities', 'topics'];
/** 0054's atomic vocabulary, builders in `services/ingest/src/enrich-atomic.ts`. */
const ATOMIC = [
  'issue',
  'relief',
  'reasoning_proposition',
  'procedural_event',
  'date_event',
  'fact_proposition',
  'party_action',
  'court_action',
  'statute_role',
];
const TASKS = [...COMPOSITE, ...ATOMIC];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const LIMIT = arg('limit', '60');
/** A batch that has not finished in an hour is stuck, not slow. */
const BATCH_TIMEOUT_MS = Number(arg('batch-timeout', '3600')) * 1000;

/**
 * The lines worth keeping. The per-document progress lines are thousands per
 * round and the summary is what a human reads — the same filter the shell
 * version piped through `grep -E`.
 */
const KEEP =
  /CLAIMS|^documents |^calls failed|^rejection|^ +\d+ +evidence|verification state|^ {2}(partial|rejected|verified|unverified) /;

function runBatch(task) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--env-file=.env', 'node_modules/tsx/dist/cli.mjs', 'services/ingest/src/enrich-cli.ts', '--task', task, '--limit', LIMIT],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const timer = setTimeout(() => {
      console.log(`  [factory] ${task} exceeded ${BATCH_TIMEOUT_MS / 1000}s — killing the batch, not the loop`);
      child.kill('SIGKILL');
    }, BATCH_TIMEOUT_MS);

    let buffered = '';
    const onData = (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) if (KEEP.test(line)) console.log(line);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) console.log(`  [factory] ${task} exited ${code ?? signal}`);
      resolve();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      console.log(`  [factory] ${task} failed to spawn: ${error.message}`);
      resolve();
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let round = 0;
for (;;) {
  round++;
  for (const task of TASKS) {
    console.log(`=== round ${round} · ${task} · ${new Date().toISOString().slice(11, 19)} ===`);
    await runBatch(task);
  }
  await sleep(10_000);
}
