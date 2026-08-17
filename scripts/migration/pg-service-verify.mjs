#!/usr/bin/env node
/**
 * FQ-PGSERVICE's acceptance test, as a command rather than a memory.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PostgreSQL on this machine has been killed four times by `0xC000013A` —
 * `STATUS_CONTROL_C_EXIT`, a console control event delivered to every process
 * attached to a console when that console goes away. It is not a crash and not a
 * PostgreSQL fault. The same code took the entire 38-worker ingest fleet on
 * 15 Aug. The cause was read off the live server rather than guessed: `pg_ctl
 * start` on Windows shells out through `cmd.exe`, so the postmaster inherits
 * that `cmd.exe`'s console and hands it to every backend it forks.
 *
 * Two separate things have to be true for this to stop, and they fail
 * independently — which is why they are checked independently here:
 *
 *   1. THE RUNNING SERVER has no console to be signalled on.
 *   2. SOMETHING STARTS IT after a reboot.
 *
 * (2) is the one that keeps being lost, because it is a different artifact from
 * the thing that runs and only the running thing is ever looked at. On 17 Aug
 * this machine had 12 healthy postgres processes, zero services and zero
 * scheduled tasks: perfectly alive, one reboot from down, and nothing about the
 * live cluster showed it. Bus 0510 is the same shape one lane over.
 *
 * Exit codes: 0 all checks pass · 1 a check failed · 2 could not run.
 */
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import { PG, pgEnv, psqlValue } from './pg-local.mjs';

const results = [];
const record = (pass, name, detail) => {
  results.push({ pass, name, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} ${detail}`);
};
/** Not every finding is a verdict. Some are just things you want to know. */
const note = (name, detail) => console.log(`note  ${name.padEnd(28)} ${detail}`);

function ps(script) {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).trim();
}

function json(script) {
  const out = ps(`${script} | ConvertTo-Json -Depth 4 -Compress`);
  if (!out) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Is it up, and is it the cluster we mean?
// ─────────────────────────────────────────────────────────────────────────────
async function checkReachable() {
  const reachable = await new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: PG.port });
    s.setTimeout(5000);
    s.on('connect', () => (s.destroy(), resolve(true)));
    s.on('error', () => resolve(false));
    s.on('timeout', () => (s.destroy(), resolve(false)));
  });
  record(reachable, 'port open', `127.0.0.1:${PG.port}`);
  if (!reachable) return false;

  try {
    const db = psqlValue(`SELECT 1 FROM pg_database WHERE datname = '${PG.database}'`);
    record(db === '1', 'target database', `${PG.database} present`);
    const dataDir = psqlValue('SHOW data_directory', PG.database);
    // Normalised both ways: PostgreSQL reports forward slashes, Windows and the
    // config use backslashes, and a mismatch here would be a SECOND cluster
    // answering on the port we expect — the worst possible thing to miss.
    const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    record(norm(dataDir) === norm(PG.data), 'data directory', dataDir);
  } catch (e) {
    record(false, 'target database', String(e.message).split('\n')[0]);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Does the running postmaster have a console to be killed on?
// ─────────────────────────────────────────────────────────────────────────────
function checkNoConsoleAncestor() {
  const procs = json(
    `Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | Select-Object ProcessId,ParentProcessId,CommandLine`,
  );
  if (procs.length === 0) {
    record(false, 'postmaster present', 'no postgres.exe running');
    return;
  }
  // The postmaster is the one whose parent is not itself a postgres.exe.
  const pids = new Set(procs.map((p) => p.ProcessId));
  const masters = procs.filter((p) => !pids.has(p.ParentProcessId));

  // Exactly one postmaster. Two would mean two clusters, which on one data
  // directory is a corruption event and on two is a silent split brain.
  record(
    masters.length === 1,
    'single postmaster',
    `${masters.length} postmaster(s), ${procs.length} postgres.exe total`,
  );
  if (masters.length !== 1) return;

  const master = masters[0];
  const parents = json(
    `Get-CimInstance Win32_Process -Filter "ProcessId=${master.ParentProcessId}" | Select-Object ProcessId,Name,CommandLine`,
  );
  const parent = parents[0];

  if (!parent) {
    // Orphaned: the launcher exited and Windows reparented nothing. This is what
    // a DETACHED_PROCESS start looks like once its launcher is gone, and also
    // what a service looks like from here.
    record(true, 'no console parent', `parent pid ${master.ParentProcessId} is gone`);
    return;
  }

  // A LIVE cmd.exe parent is the exact fingerprint of `pg_ctl start`, and it
  // means the server is sharing that cmd.exe's console right now.
  const isShell = /^(cmd|powershell|pwsh|conhost)\.exe$/i.test(parent.Name ?? '');
  record(
    !isShell,
    'no console parent',
    isShell
      ? `postmaster ${master.ProcessId} has LIVE ${parent.Name} parent ${parent.ProcessId} — sharing its console`
      : `parent is ${parent.Name} (${parent.ProcessId})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Will it come back by itself?
// ─────────────────────────────────────────────────────────────────────────────
function checkBootPersistence() {
  const services = json(
    `Get-CimInstance Win32_Service | Where-Object { $_.PathName -match 'postgres|pgsql' } | Select-Object Name,StartMode,State,PathName`,
  );
  // `State` serialises as its numeric enum through ConvertTo-Json, and "State 3"
  // is not a thing anyone should have to look up mid-incident.
  const tasks = json(
    `Get-ScheduledTask | Where-Object { $_.TaskName -match 'LawMindPostgres' } |` +
      ` Select-Object TaskName,@{n='State';e={$_.State.ToString()}}`,
  );

  const service = services[0];
  const haveService = Boolean(service);
  const haveTask = tasks.length > 0;

  record(
    haveService || haveTask,
    'boot persistence',
    haveService
      ? `service ${service.Name} (${service.StartMode}, ${service.State})`
      : haveTask
        ? `scheduled task ${tasks[0].TaskName} (${tasks[0].State}) — ONLOGON`
        : 'NEITHER a service NOR a scheduled task — will not start after a reboot',
  );

  if (haveService) {
    record(
      /auto/i.test(service.StartMode),
      'service starts at boot',
      `StartMode=${service.StartMode}`,
    );
    note('FQ-PGSERVICE', 'satisfied — a service has no console at all');
  } else if (haveTask) {
    // Deliberately a note and not a FAIL. The task genuinely restores the
    // machine after a reboot, which is the property being tested; it is simply
    // weaker than a service and the difference should not be silently absorbed.
    note(
      'FQ-PGSERVICE',
      'STILL OPEN — a task only starts at LOGON, not at boot, and needs the user to log in',
    );
    note('the one elevated command', `${PG.bin}\\pg_ctl.exe register -N LawMindPostgres -D "${PG.data}" -S auto`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function checkDuplicateClusters() {
  // A second cluster on another port, sharing this data directory, is the
  // failure that produces "my writes vanished" rather than an error.
  const listeners = json(
    `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |` +
      ` Where-Object { $_.OwningProcess -in (Get-Process postgres -ErrorAction SilentlyContinue).Id } |` +
      ` Select-Object LocalAddress,LocalPort,OwningProcess`,
  );
  const ports = [...new Set(listeners.map((l) => l.LocalPort))];
  record(
    ports.length <= 1 && (ports.length === 0 || ports[0] === PG.port),
    'no duplicate cluster',
    ports.length ? `postgres listening on ${ports.join(', ')}` : 'no postgres listener found',
  );
}

async function main() {
  console.log(`FQ-PGSERVICE verification — ${new Date().toISOString()}`);
  console.log(`data ${PG.data}   port ${PG.port}   database ${PG.database}\n`);
  pgEnv(); // fails loudly and early if the password file is missing
  const up = await checkReachable();
  if (up) {
    checkNoConsoleAncestor();
    checkDuplicateClusters();
  }
  checkBootPersistence();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL  ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`could not run: ${e.message}`);
  process.exit(2);
});
