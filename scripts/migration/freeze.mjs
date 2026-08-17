#!/usr/bin/env node
/**
 * STAGE D — the write freeze.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES AND WHY IT IS A SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Stops every LawMind process on this machine that writes to the database, so
 * the final dump is taken against a source nobody is changing. The founder
 * directive authorises this pause explicitly: *"Temporarily stop
 * database-writing workers for final consistency. This temporary pause IS
 * AUTHORIZED."*
 *
 * It is a script and not a sequence of `taskkill` commands for one reason:
 * **the fleet has to come back.** ~20 ingest workers were running when this was
 * written, each with its own court code, year range, batch size and
 * concurrency on its command line. That configuration exists nowhere except in
 * the command lines of running processes, and killing them without recording it
 * destroys it. `freeze` writes an inventory first; `thaw` replays it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUPERVISORS BEFORE WORKERS, AND WHY THE ORDER IS NOT OPTIONAL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `scripts/supervise.mjs` exists to restart a worker that dies — that is its
 * whole job, and it is good at it. Kill a worker while its supervisor lives and
 * the supervisor immediately starts a new one, so the freeze never happens and
 * the process list looks like nothing you did had any effect.
 *
 * So: supervisors first, confirmed dead, THEN their workers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FREEZE IS NOT CONFIRMED BY THIS SCRIPT'S OWN SUCCESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Killing every process it can find proves only that. The freeze is confirmed
 * against `pg_stat_activity` — no active queries, no open transactions — by
 * `activity.mjs --require-quiet`, because a writer on another machine, or one
 * this script's patterns did not match, is invisible from a process list.
 *
 *   node scripts/migration/freeze.mjs inventory   # look, change nothing
 *   node scripts/migration/freeze.mjs freeze
 *   node scripts/migration/freeze.mjs thaw --target local
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INVENTORY = path.join(REPO_ROOT, 'docs', 'ops', 'migration', 'fleet-inventory.json');

/**
 * What counts as a LawMind database writer. Deliberately specific: matching on
 * "node" would kill the agent sessions, the editor's language servers and this
 * script's own parent.
 */
const WRITER_PATTERNS = [
  /supervise\.mjs/i,
  /hc-load-cli/i,
  /enrich-cli/i,
  /citations-cli/i,
  /paragraphs-cli/i,
  /hc-classify/i,
  /statutes?-cli/i,
  /arms-cli/i,
  /treatment/i,
  /lawmind-.*startup/i,
  /legal-object-stage/i,
];

function psList() {
  // CIM over tasklist: tasklist truncates the command line, and the command
  // line is the only place a worker's court code and year range exist.
  const ps = `Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cmd.exe' OR Name='npx.cmd'" |
    Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate |
    ConvertTo-Json -Depth 3 -Compress`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`process listing failed: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout || '[]');
  return Array.isArray(parsed) ? parsed : [parsed];
}

function classify(procs) {
  const writers = procs.filter((p) => p.CommandLine && WRITER_PATTERNS.some((re) => re.test(p.CommandLine)));
  const supervisors = writers.filter((p) => /supervise\.mjs/i.test(p.CommandLine));
  const supervisorPids = new Set(supervisors.map((p) => p.ProcessId));
  const workers = writers.filter((p) => !supervisorPids.has(p.ProcessId));
  return { writers, supervisors, workers };
}

/** The supervised job's name, which is how `thaw` knows what to restart. */
function superviseLabel(cmd) {
  const m = cmd.match(/supervise\.mjs\s+(\S+)/i);
  return m ? m[1] : null;
}

function inventory({ write } = {}) {
  const procs = psList();
  const { writers, supervisors, workers } = classify(procs);

  console.log(`fleet: ${procs.length} node/cmd processes scanned`);
  console.log(`fleet: ${supervisors.length} supervisors · ${workers.length} workers · ${writers.length} total writers`);
  console.log('');
  for (const s of supervisors) {
    console.log(`  SUPERVISOR ${String(s.ProcessId).padStart(6)}  ${superviseLabel(s.CommandLine) ?? '?'}`);
  }
  for (const w of workers) {
    console.log(`  worker     ${String(w.ProcessId).padStart(6)}  ${w.CommandLine.slice(0, 120)}`);
  }

  const record = {
    tool: 'scripts/migration/freeze.mjs',
    takenAt: new Date().toISOString(),
    note:
      'The fleet as it was immediately before the Railway->local write freeze. ' +
      'This is the ONLY record of each worker\'s arguments; the processes themselves were the previous one.',
    supervisors: supervisors.map((p) => ({
      pid: p.ProcessId,
      label: superviseLabel(p.CommandLine),
      commandLine: p.CommandLine,
    })),
    workers: workers.map((p) => ({ pid: p.ProcessId, parentPid: p.ParentProcessId, commandLine: p.CommandLine })),
  };

  if (write) {
    // ── REFUSE TO OVERWRITE A RICHER INVENTORY WITH A POORER ONE ────────────
    //
    // This file is the ONLY copy of 37 workers' court codes, year ranges, batch
    // sizes and concurrency settings — that configuration previously existed
    // nowhere but in the command lines of running processes, and the freeze
    // killed those processes.
    //
    // So the dangerous case is not a crash, it is a perfectly successful re-run:
    // once the fleet is stopped, `inventory --write` finds zero supervisors and
    // would cheerfully replace the record with an empty one. The data would be
    // gone, the command would report success, and nothing would look wrong until
    // someone tried to restart the fleet.
    //
    // Noticed before it happened rather than after, which is the only reason
    // this comment is not an incident report.
    if (fs.existsSync(INVENTORY)) {
      try {
        const prev = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
        const had = prev.supervisors?.length ?? 0;
        const now = record.supervisors.length;
        if (now < had && !process.argv.includes('--force')) {
          console.log('');
          console.log(`fleet: REFUSED to overwrite ${INVENTORY}`);
          console.log(`fleet: it records ${had} supervisor(s); this scan found ${now}.`);
          console.log('fleet: that file is the only record of how the fleet was configured, and');
          console.log('fleet: after a freeze this scan is EXPECTED to find nothing. Overwriting');
          console.log('fleet: it here would destroy the thing `thaw` reads. Pass --force only if');
          console.log('fleet: you genuinely mean to replace a full inventory with a smaller one.');
          return record;
        }
      } catch {
        // An unreadable previous inventory is not a reason to refuse a good new
        // one — but it IS a reason to say so rather than silently replace it.
        console.log(`fleet: existing ${INVENTORY} could not be parsed; writing a fresh one`);
      }
    }
    fs.mkdirSync(path.dirname(INVENTORY), { recursive: true });
    fs.writeFileSync(INVENTORY, JSON.stringify(record, null, 2));
    console.log('');
    console.log(`fleet: inventory written to ${INVENTORY}`);
  }
  return record;
}

function kill(pids, label) {
  if (pids.length === 0) {
    console.log(`freeze: no ${label} to stop`);
    return;
  }
  console.log(`freeze: stopping ${pids.length} ${label} — ${pids.join(', ')}`);
  // /T takes the process tree: a supervisor's npx.cmd shim and the tsx process
  // under it are separate pids, and leaving either behind leaves a writer alive.
  const r = spawnSync('taskkill.exe', ['/F', '/T', ...pids.flatMap((p) => ['/PID', String(p)])], {
    encoding: 'utf8',
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const ok = (out.match(/SUCCESS/g) ?? []).length;
  console.log(`freeze: taskkill reported ${ok} termination(s)`);
}

function sleep(ms) {
  spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`], { timeout: ms + 5000 });
}

function freeze() {
  const before = inventory({ write: true });

  // 1. Supervisors first. A worker killed under a live supervisor is replaced.
  kill(before.supervisors.map((s) => s.pid), 'supervisors');
  sleep(3000);

  // 2. Then the workers, re-listed rather than reused: killing the supervisors
  //    may already have taken some of them, and some may have respawned in the
  //    gap before the supervisor died.
  const after = classify(psList());
  kill(after.workers.map((w) => w.ProcessId), 'workers');
  sleep(3000);

  // 3. Sweep. Anything a supervisor restarted in the last few seconds.
  const finalScan = classify(psList());
  if (finalScan.writers.length > 0) {
    console.log(`freeze: ${finalScan.writers.length} writer(s) still present, second sweep`);
    kill(finalScan.writers.map((w) => w.ProcessId), 'stragglers');
    sleep(3000);
  }

  const done = classify(psList());
  console.log('');
  if (done.writers.length === 0) {
    console.log('freeze: no LawMind writer processes remain on this machine.');
  } else {
    console.log(`freeze: ${done.writers.length} writer(s) SURVIVED — listed below. Do not dump yet.`);
    for (const w of done.writers) console.log(`  ${w.ProcessId}  ${w.CommandLine.slice(0, 120)}`);
  }

  console.log('');
  console.log('freeze: a process list is NOT the freeze. Confirm against the database:');
  console.log('    node scripts/migration/activity.mjs --require-quiet');
  console.log('  A writer on another machine, or one these patterns missed, is invisible here.');
  return done.writers.length === 0 ? 0 : 1;
}

/**
 * Bring the fleet back, pointed at whichever database is named. After cutover
 * that is the local one — which is the entire point of the migration, and the
 * step most easily forgotten while everyone is looking at row counts.
 */
function thaw() {
  const argv = process.argv.slice(2);
  const target = argv.includes('--target') ? argv[argv.indexOf('--target') + 1] : 'local';
  if (!fs.existsSync(INVENTORY)) {
    console.error(`No inventory at ${INVENTORY}. Nothing to restart from.`);
    process.exit(2);
  }
  const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  console.log(`thaw: ${inv.supervisors.length} supervised job(s) recorded at ${inv.takenAt}`);
  console.log(`thaw: target database = ${target}`);
  console.log('');

  // Deliberately NOT automatic. Each worker's arguments were captured from a
  // running process, and replaying a command line verbatim into a new shell is
  // the kind of thing that silently starts twenty workers against the wrong
  // database. They are printed for a human to start, in the order recorded.
  console.log('thaw: the recorded fleet, to be restarted against the LOCAL database.');
  console.log('      Confirm .env DATABASE_URL points at the local cluster FIRST —');
  console.log('      LANE_PROTOCOL.md\'s rule applies: group live PIDs by their arg and');
  console.log('      assert count == 1 after any multi-worker relaunch.');
  console.log('');
  for (const s of inv.supervisors) {
    console.log(`  ${s.commandLine}`);
  }
  console.log('');
  console.log(`thaw: ${inv.supervisors.length} command(s) above. None were started by this script.`);
}

const cmd = process.argv[2];
if (cmd === 'inventory') inventory({ write: process.argv.includes('--write') });
else if (cmd === 'freeze') process.exit(freeze());
else if (cmd === 'thaw') thaw();
else {
  console.log('usage: freeze.mjs inventory [--write] | freeze | thaw [--target local]');
  process.exit(2);
}
