#!/usr/bin/env node
/**
 * NEW2 — STOP NAMED SCOPES. Not the fleet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND STOP TOOL EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `scripts/fleet-stop.ps1` writes `.checkpoints/STOP`, which every supervisor
 * and every worker honours — the whole fleet, including LCC's paragraph and
 * citation workers, quiesces at a batch boundary. That is exactly right for a
 * database cutover and exactly wrong for a width change: the resource policy
 * asks for eight scopes, not zero, and there is no way to express "these three"
 * with a file the other eight also read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ORDER IS THE WHOLE TOOL: SUPERVISOR FIRST, WORKER SECOND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `supervise.mjs` restarts a worker that exits without printing `RESULTS`, and
 * that is its job. Killing the worker first therefore does not stop the scope —
 * it starts a fresh one after the backoff, and the operator sees the width go
 * down and come back up and concludes the kill "did not work". The supervisor
 * has to die first so that nothing is left holding the restart loop.
 *
 * Between the two kills the scope is a worker with no parent watching it. That
 * window is safe *because* every supervised worker is resumable by construction
 * (`supervise.mjs`'s own header): the worst case is one batch re-read from the
 * checkpoint, which is the same cost the supervisor's own restarts pay.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT REFUSES TO GUESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A scope name that matches no running supervisor is an ERROR, not a no-op.
 * "Stopped 2 of 3" reported as success is how a width change silently lands one
 * scope wide, and the fleet-width number is the input to a resource decision
 * someone else is making. Nothing is killed unless every name resolves.
 *
 *   node scripts/migration/new2-scope-stop.mjs hc-boot-hist-8_9 hc-boot-mid-20_7
 *   node scripts/migration/new2-scope-stop.mjs --dry-run <names…>
 */
import { execFileSync } from 'node:child_process';

const DRY = process.argv.includes('--dry-run');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (names.length === 0) {
  console.error('usage: node scripts/migration/new2-scope-stop.mjs [--dry-run] <scope-name…>');
  process.exit(2);
}

/** Same source as `new2-fleet-view.mjs`: only the process table says what runs. */
function processTable() {
  const ps =
    'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
    'ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.CommandLine)" }';
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid, ...rest] = line.split('|');
      return { pid: Number(pid), ppid: Number(ppid), cmd: rest.join('|') ?? '' };
    })
    .filter((p) => Number.isFinite(p.pid));
}

const table = processTable();
const descendantsOf = (pid) => {
  const direct = table.filter((p) => p.ppid === pid);
  return direct.flatMap((d) => [d, ...descendantsOf(d.pid)]);
};

const targets = names.map((name) => {
  const sup = table.find((p) => new RegExp(`supervise\\.mjs\\s+${name}\\s`).test(p.cmd));
  return { name, sup, workers: sup ? descendantsOf(sup.pid) : [] };
});

const missing = targets.filter((t) => !t.sup).map((t) => t.name);
if (missing.length > 0) {
  console.error(`no running supervisor for: ${missing.join(', ')}`);
  console.error('refusing to stop a partial set — the fleet width would be wrong and reported as right.');
  process.exit(1);
}

for (const t of targets) {
  console.log(`${t.name}  supervisor ${t.sup.pid}  workers ${t.workers.map((w) => w.pid).join(',') || '(none)'}`);
}
if (DRY) {
  console.log('\n--dry-run: nothing killed.');
  process.exit(0);
}

/**
 * `taskkill /T` would take the whole tree in one call, but it walks the tree
 * ITSELF and gives no control over the order — the worker can die before the
 * supervisor and get restarted. Two explicit passes, supervisors then workers,
 * is the only way to guarantee the order this file exists to guarantee.
 */
const kill = (pid, what) => {
  try {
    execFileSync('taskkill.exe', ['/PID', String(pid), '/F'], { stdio: 'pipe' });
    console.log(`  killed ${what} ${pid}`);
  } catch (err) {
    /* Already gone is the outcome we wanted; anything else is worth printing. */
    console.log(`  ${what} ${pid}: ${String(err.stderr ?? err.message).trim().slice(0, 120)}`);
  }
};

console.log('\nsupervisors first:');
for (const t of targets) kill(t.sup.pid, `supervisor ${t.name}`);
console.log('workers second:');
for (const t of targets) for (const w of t.workers) kill(w.pid, `worker ${t.name}`);

console.log(`\nstopped ${targets.length} scope(s). Verify with: node scripts/migration/new2-fleet-view.mjs --window 60`);
