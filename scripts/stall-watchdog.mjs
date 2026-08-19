#!/usr/bin/env node
/**
 * Run a long job and RESTART IT WHEN IT GOES SILENT — not when it exits.
 *
 *   node scripts/stall-watchdog.mjs --log <file> --stall 600 -- <cmd> [args...]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS EXISTS FOR, MEASURED 19 AUG 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Tier-A manifest walk and the legal-object factory both stopped at 14:31
 * and were discovered at 23:03. **Four and a half hours of nothing**, and every
 * cheap check said they were fine:
 *
 *   · both node processes were alive and in the process table;
 *   · neither had exited, so nothing that reacts to exit codes fired;
 *   · no error was logged, because no error occurred in the process.
 *
 * The cause was outside them. The Postgres cluster restarted underneath — the
 * same 0xC000013A console-signal death NEW2 documented six times in four days —
 * and `postgres.js`, with a query in flight, awaited a reply that was never
 * coming. A promise that never settles is not a crash. It is a process that
 * looks perfect forever.
 *
 * `supervise.mjs` cannot catch this and is not broken for failing to: it reacts
 * to EXIT, and a hang never exits. This watches the only signal a hang cannot
 * fake — whether the job is still SAYING anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE LOG FILE AND NOT A HEARTBEAT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A heartbeat needs the job to cooperate, which means editing every job and
 * trusting each one to emit from a place a hang cannot reach. Log growth is
 * already produced by work being done, needs no change to the job, and works for
 * any command.
 *
 * The cost is honest and stated: a job that legitimately runs quiet for longer
 * than `--stall` gets killed. So `--stall` must exceed the longest normal gap
 * between output lines, and jobs that print per batch rather than per run are
 * the ones this suits.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESTART IS SAFE ONLY BECAUSE THE JOBS ARE RESUMABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This kills and re-runs the identical command. That is correct for the census,
 * the manifest and the factory because each checkpoints in the database and
 * resumes from where it stopped — the manifest came back at batch 233 with
 * 2,327,876 rows already emitted, losing only the batch in flight.
 *
 * **Do not point this at a job that is not resumable.** A restart would redo
 * work, and for anything that ACCUMULATES a count that is not a slow path, it is
 * a wrong number that no later check can detect.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, statSync } from 'node:fs';

function flag(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
}

const logPath = flag('log', null);
const stallSeconds = Number(flag('stall', 600));
const sep = process.argv.indexOf('--');
const cmd = sep === -1 ? [] : process.argv.slice(sep + 1);

if (!logPath || cmd.length === 0) {
  console.error('usage: node scripts/stall-watchdog.mjs --log <file> [--stall 600] -- <cmd> [args...]');
  process.exit(2);
}

function note(line) {
  const stamped = '[watchdog ' + new Date().toISOString() + '] ' + line + '\n';
  process.stdout.write(stamped);
  try {
    appendFileSync(logPath, stamped);
  } catch {
    // The log being unwritable is not a reason to stop supervising.
  }
}

/** Size, or -1 when the file does not exist yet. Never throws. */
function logSize() {
  try {
    return statSync(logPath).size;
  } catch {
    return -1;
  }
}

let restarts = 0;
let stopping = false;

function runOnce() {
  const child = spawn(cmd[0], cmd.slice(1), {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });

  let lastSize = logSize();
  let lastGrowth = Date.now();

  const timer = setInterval(() => {
    const size = logSize();
    if (size !== lastSize) {
      lastSize = size;
      lastGrowth = Date.now();
      return;
    }
    const quiet = (Date.now() - lastGrowth) / 1000;
    if (quiet < stallSeconds) return;

    note(
      'STALLED — ' + Math.round(quiet) + 's without output (limit ' + stallSeconds + 's). ' +
        'Killing pid ' + child.pid + ' and restarting. This is the shape a hung DB ' +
        'connection makes: alive, silent, and never exiting.',
    );
    clearInterval(timer);
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone; the exit handler below still fires.
    }
  }, 15_000);

  child.on('exit', (code, signal) => {
    clearInterval(timer);
    if (stopping) return;
    restarts += 1;
    note('child exited (code ' + code + ', signal ' + signal + ') — restart #' + restarts + ' in 10s');
    setTimeout(runOnce, 10_000);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    note('received ' + sig + ' — not restarting');
    process.exit(0);
  });
}

note('supervising: ' + cmd.join(' ') + '  (stall limit ' + stallSeconds + 's)');
runOnce();
