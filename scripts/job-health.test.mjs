#!/usr/bin/env node
/**
 * JOB HEALTH — regression tests for the identity rules.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE EXIST, WITH THE DATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * On 25 Aug 2026 at 11:04:09.169Z `job-health.mjs` reported NEW1's GPU sidecar
 * as `STARTING`, age 0m, pid 23660 alive. pid 23660 had been dead for days.
 * Windows had recycled the number into a transient shell born — per the tool's
 * own recorded observation in `.agents/jobs/observations.jsonl` —
 * `2026-08-25T15:04:09.1427650+04:00`, twenty-five milliseconds before the sweep
 * that read it, and four days after the registry's `started_at`.
 *
 * The cause was one expression:
 *
 *     sameProcess: !job.pid_created_at || job.pid_created_at === osProc.Created
 *
 * A registry line with no recorded creation time — which was most of them, since
 * the schema never required one — short-circuited to TRUE. **The absence of the
 * check was scored as the check passing.** A tool whose entire purpose is to
 * refuse to infer inferred, and reported another lane's dead job as healthy.
 *
 * The reason this is a test file and not a comment: that failure cannot be
 * reproduced on demand against the live registry. It needs a pid that is alive
 * AND is not the job it claims to be, and nobody can ask Windows to recycle a
 * number to order. So the fixture builds the condition deliberately, by pointing
 * a fake registry line at a process that is certainly alive and certainly not a
 * LawMind worker — the Postgres postmaster.
 *
 * Run:  node scripts/job-health.test.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEALTH = join(REPO, 'scripts', 'job-health.mjs');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
}

/**
 * A process that is certainly alive and certainly is not any LawMind job.
 *
 * The postmaster is the right choice on purpose: it is long-lived, so the test
 * is not racing a process that might exit mid-run; and no registry line could
 * legitimately claim it, so a tool that accepts it as a worker has failed in
 * exactly the way that matters.
 */
function livingStranger() {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "$p = Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" | Sort-Object CreationDate | Select-Object -First 1; if ($p) { ($p.ProcessId.ToString() + '|' + $p.CreationDate.ToString('o')) }",
    ],
    { encoding: 'utf8', timeout: 40000 },
  ).trim();
  if (!out) return null;
  const [pid, created] = out.split('|');
  return { pid: Number(pid), created };
}

function runHealth(registryPath, obsPath) {
  const out = execFileSync(
    process.execPath,
    [HEALTH, '--json', '--no-record', '--registry', registryPath, '--observations', obsPath],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024, cwd: REPO },
  );
  return JSON.parse(out);
}

const stranger = livingStranger();
if (!stranger) {
  console.error(
    'job-health.test: no postgres.exe running, so there is no known-alive stranger to point a\n' +
      'fixture at. This test needs one live process it can prove is not a LawMind job.\n' +
      'SKIPPED rather than passed — an untested guard must not report success.',
  );
  process.exit(3);
}

const dir = mkdtempSync(join(tmpdir(), 'lawmind-jobhealth-'));
const registry = join(dir, 'registry.jsonl');
const observations = join(dir, 'observations.jsonl');

const base = {
  owner_lane: 'NEW1',
  command: 'python services/embed/gpu/server.py --port 8799',
  started_at: '2026-08-21T15:58:34+04:00',
  checkpoint: 'none',
  log: null,
  restart_policy: 'continuous',
  finite: false,
  resource_class: 'GPU_EMBED',
  progress_invariant: 'durable vectors',
  status: 'RUNNING',
};

writeFileSync(
  registry,
  [
    // THE 23660 SHAPE: a live pid, no recorded creation time, and a command that
    // is nothing like the declared one.
    { ...base, job_id: 'recycled-no-birthtime', pid: stranger.pid },
    // The same, but with a creation time on record that disagrees. This one the
    // old code DID catch; it is here so a future change cannot fix the first case
    // by deleting the second check.
    {
      ...base,
      job_id: 'recycled-wrong-birthtime',
      pid: stranger.pid,
      pid_created_at: '2026-08-21T15:58:34.0000000+04:00',
    },
    // The honest positive: right pid, right creation time. Identity must be
    // CONFIRMED here, or the guard has simply learned to say no to everything.
    {
      ...base,
      job_id: 'identity-confirmed',
      pid: stranger.pid,
      pid_created_at: stranger.created,
      command: 'postgres',
      resource_class: 'LIGHT',
    },
    // A cadence job naming a scheduled task that does not exist. Nothing will
    // ever fire it, and "no process" must not be mistaken for "between ticks".
    {
      job_id: 'cadence-orphaned',
      owner_lane: 'LCC',
      kind: 'cadence',
      pid: null,
      scheduler_task: 'Lawmind-task-that-does-not-exist',
      cadence_seconds: 600,
      cadence_tolerance: 2,
      resource_class: 'LIGHT',
      output_probe: { kind: 'lines', label: 'receipts', path: '.agents/ops/alerts.jsonl' },
      status: 'RUNNING',
    },
  ]
    .map((o) => JSON.stringify(o))
    .join('\n') + '\n',
);
writeFileSync(observations, '');

console.log(`job-health identity regression — stranger pid ${stranger.pid} born ${stranger.created}`);

try {
  const report = runHealth(registry, observations);
  const by = new Map(report.jobs.map((j) => [j.job_id, j]));

  const noBirth = by.get('recycled-no-birthtime');
  check(
    'a live pid with NO recorded creation time and a mismatched command is REFUSED',
    noBirth?.state === 'FAILED' && noBirth?.identity === 'PID_RECYCLED',
    `got state=${noBirth?.state} identity=${noBirth?.identity} — this is the 23660 defect; ` +
      'it must never read RUNNING, STARTING or RUNNING_PROGRESSING',
  );
  check(
    'the refusal says WHY, naming the process that actually holds the pid',
    /DIFFERENT process \(postgres\.exe/.test(noBirth?.why ?? ''),
    `why="${noBirth?.why}"`,
  );

  const wrongBirth = by.get('recycled-wrong-birthtime');
  check(
    'a live pid with a DISAGREEING creation time is REFUSED',
    wrongBirth?.state === 'FAILED' && wrongBirth?.identity === 'PID_RECYCLED',
    `got state=${wrongBirth?.state} identity=${wrongBirth?.identity}`,
  );

  const confirmed = by.get('identity-confirmed');
  check(
    'a live pid with the CORRECT creation time is accepted as the same process',
    confirmed?.identity === 'CONFIRMED_BY_CREATION',
    `got identity=${confirmed?.identity} — the guard must still be able to say yes`,
  );
  check(
    'an accepted job is never reported FAILED',
    confirmed?.state !== 'FAILED',
    `got state=${confirmed?.state}`,
  );

  const cadence = by.get('cadence-orphaned');
  check(
    'a cadence job whose scheduled task does not exist is FAILED, not idle',
    cadence?.state === 'FAILED',
    `got state=${cadence?.state} why="${cadence?.why}" — nothing will ever fire it`,
  );

  check(
    'every job carries an instance id, so a pid alone is never the identity',
    report.jobs.filter((j) => j.pid).every((j) => Boolean(j.instance)),
    'a row with a pid and no instance id has nothing a recycled pid could fail to match',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('');
if (failures) {
  console.log(`job-health identity regression: ${failures} FAILED`);
  process.exit(1);
}
console.log('job-health identity regression: all checks passed');
