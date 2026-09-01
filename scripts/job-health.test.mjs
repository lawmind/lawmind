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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * A pid that is not alive. Windows hands out pids well below this, and the tool
 * treats "not in the sweep" identically however the number was chosen -- so if
 * this ever did collide with a live process the fixture degrades to the
 * recycled-pid case, which is asserted separately and expects the same verdict.
 */
const DEAD_PID = 4194301;

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
    /**
     * THE 1 SEP SHAPE: the wrapper pid is gone and the work is advancing.
     *
     * On 1 Sep 2026 this tool reported `new1-coarse-walk` and
     * `new1-coarse-telemetry` FAILED, and PAGED, 42 seconds after reading a
     * receipt that recorded GPU util 99% and 8,176 new vectors in the closing
     * window. The pid it was looking for was a cmd.exe wrapper that had exited;
     * the worker underneath it never stopped.
     *
     * The probe points at a real repo file and the prior observation records 0,
     * so the delta is the whole file and ADVANCING is deterministic -- it does
     * not depend on anything actually running while the test does.
     */
    {
      ...base,
      job_id: 'wrapper-exited-but-producing',
      pid: DEAD_PID,
      pid_created_at: '2026-08-21T15:58:34.0000000+04:00',
      output_probe: { kind: 'lines', label: 'receipts', path: 'PRODUCT_BRIEF.md' },
    },
    // The same claim, but the pid was RECYCLED into a live stranger rather than
    // simply vanishing. Recycling must not become a second route to a false
    // death certificate now that plain absence is closed.
    {
      ...base,
      job_id: 'recycled-but-producing',
      pid: stranger.pid,
      pid_created_at: '2026-08-21T15:58:34.0000000+04:00',
      output_probe: { kind: 'lines', label: 'receipts', path: 'PRODUCT_BRIEF.md' },
    },
    /**
     * The control. Absent AND genuinely silent: the probe is measured, flat
     * against the recorded prior, and its file has not been written for weeks.
     * This one MUST still be FAILED, or the fix has simply abolished the state.
     */
    {
      ...base,
      job_id: 'wrapper-exited-and-silent',
      pid: DEAD_PID,
      pid_created_at: '2026-08-21T15:58:34.0000000+04:00',
      output_probe: { kind: 'lines', label: 'receipts', path: 'BUILD_GUIDE.md' },
    },
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
/**
 * The prior reading each delta is measured against.
 *
 * `wrapper-exited-but-producing` and `recycled-but-producing` record 0, so the
 * next reading is the whole file and the probe is unambiguously ADVANCING.
 * `wrapper-exited-and-silent` records the EXACT current line count, so its delta
 * is 0 -- and because BUILD_GUIDE.md has not been touched in weeks, its mtime
 * puts it past the freshness bound too. Flat AND old is the only shape that may
 * still be called dead.
 */
const silentCount = readFileSync(join(REPO, 'BUILD_GUIDE.md'), 'utf8')
  .split('\n')
  .filter((l) => l.trim()).length;
writeFileSync(
  observations,
  [
    { job_id: 'wrapper-exited-but-producing', observed_at: '2026-09-01T00:00:00.000Z', output_label: 'receipts', output_value: 0 },
    { job_id: 'recycled-but-producing', observed_at: '2026-09-01T00:00:00.000Z', output_label: 'receipts', output_value: 0 },
    {
      job_id: 'wrapper-exited-and-silent',
      observed_at: '2026-09-01T00:00:00.000Z',
      output_label: 'receipts',
      output_value: silentCount,
      last_output_change_at: '2026-08-01T00:00:00.000Z',
    },
  ]
    .map((o) => JSON.stringify(o))
    .join('\n') + '\n',
);

console.log(`job-health identity regression — stranger pid ${stranger.pid} born ${stranger.created}`);

try {
  const report = runHealth(registry, observations);
  const by = new Map(report.jobs.map((j) => [j.job_id, j]));

  /**
   * AMENDED 1 Sep 2026. The assertion used to require state === FAILED.
   *
   * What this test protects is that a recycled pid is REFUSED as an identity and
   * never reads as healthy. It does NOT get to decide that a refused identity
   * proves the job is dead -- these fixtures declare no output probe, so nothing
   * about their progress was measured, and this file own doctrine is that
   * unmeasured and zero are opposite facts. FAILED is now reserved for absence
   * that was CONFIRMED against a measured, stale probe; unmeasured absence is
   * STALE_REGISTRATION. The refusal is unchanged; only the name of the honest
   * answer moved.
   */
  const HEALTHY_STATES = ['RUNNING_PROGRESSING', 'RUNNING_BY_PROGRESS', 'STARTING', 'IDLE_CAUGHT_UP'];

  const noBirth = by.get('recycled-no-birthtime');
  check(
    'a live pid with NO recorded creation time and a mismatched command is REFUSED',
    noBirth?.state === 'STALE_REGISTRATION' && noBirth?.identity === 'PID_RECYCLED',
    `got state=${noBirth?.state} identity=${noBirth?.identity} — this is the 23660 defect; ` +
      'it must never read RUNNING, STARTING or RUNNING_PROGRESSING',
  );
  check(
    'a refused identity never reads as healthy',
    !HEALTHY_STATES.includes(noBirth?.state),
    `got state=${noBirth?.state}`,
  );
  check(
    'an unmeasured absence does not authorise a restart',
    noBirth?.restart_safe === false,
    `restart_safe=${noBirth?.restart_safe} blockers=${JSON.stringify(noBirth?.restart_blockers)}`,
  );
  check(
    'the refusal says WHY, naming the process that actually holds the pid',
    /DIFFERENT process \(postgres\.exe/.test(noBirth?.why ?? ''),
    `why="${noBirth?.why}"`,
  );

  const wrongBirth = by.get('recycled-wrong-birthtime');
  check(
    'a live pid with a DISAGREEING creation time is REFUSED',
    wrongBirth?.state === 'STALE_REGISTRATION' && wrongBirth?.identity === 'PID_RECYCLED',
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

  // ── the 1 Sep false-failure regression ───────────────────────────────────

  const producing = by.get('wrapper-exited-but-producing');
  check(
    'a job whose wrapper pid EXITED is not FAILED while its durable output advances',
    producing?.state === 'RUNNING_BY_PROGRESS',
    `got state=${producing?.state} delta=${producing?.output_delta} why="${producing?.why}" — ` +
      'this is the 1 Sep defect: FAILED and PAGED on a job producing 32,400 vectors/hour',
  );
  check(
    'the progressing verdict names the durable evidence it rests on',
    /durable output moved/.test(producing?.why ?? ''),
    `why="${producing?.why}"`,
  );
  check(
    'a progressing job is NEVER a restart candidate',
    producing?.restart_safe === false,
    `restart_safe=${producing?.restart_safe} — restarting this would have killed live work`,
  );

  const recycledProducing = by.get('recycled-but-producing');
  check(
    'a RECYCLED pid is not FAILED either while durable output advances',
    recycledProducing?.state === 'RUNNING_BY_PROGRESS',
    `got state=${recycledProducing?.state} why="${recycledProducing?.why}"`,
  );
  check(
    'and it still refuses the recycled pid as an identity',
    recycledProducing?.identity === 'PID_RECYCLED',
    `identity=${recycledProducing?.identity} — progress must not launder a wrong identity`,
  );

  const silent = by.get('wrapper-exited-and-silent');
  check(
    'absent AND measurably silent is still FAILED — the state was not abolished',
    silent?.state === 'FAILED',
    `got state=${silent?.state} delta=${silent?.output_delta} why="${silent?.why}"`,
  );
  check(
    'the death claim says it was confirmed, not merely observed absent',
    /Confirmed: absent AND not producing/.test(silent?.why ?? ''),
    `why="${silent?.why}"`,
  );

  check(
    'every job carries a restart-safety verdict, so the answer is auditable either way',
    report.jobs.every((j) => typeof j.restart_safe === 'boolean'),
    'a row with no restart_safe field lets a caller invent its own answer',
  );

  check(
    'every job carries an instance id, so a pid alone is never the identity',
    report.jobs.filter((j) => j.pid && j.pid_alive).every((j) => Boolean(j.instance)),
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
