#!/usr/bin/env node
/**
 * JOB REGISTER — the write side of the process-control plane.
 *
 * `job-health.mjs` READS the registry and never writes it. This is the only
 * thing that writes it, and it exists because of a specific failure R7 §8
 * LCC-P0 names: "atomically retire old keeper instance and register new".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A COMMAND AND NOT "JUST APPEND A LINE"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Hand-appending is how the registry got into the state it is in. Measured on
 * 25 Aug 2026, before this file existed:
 *
 *   - `new1-gpu-sidecar` declared `"pid": 23660, "status": "RUNNING"`. 23660 had
 *     been dead for days, and at 11:04:09.169Z Windows had recycled the number
 *     into a transient shell — which `job-health.mjs` then adopted and reported
 *     as the sidecar STARTING. The live sidecar was pid 4116 and no line said so.
 *   - Two of the three `RUNNING` rows carried `"pid": null`. A null pid cannot be
 *     reconciled against an OS process tree at all.
 *   - One line was truncated mid-append and is unparsable to this day.
 *   - The alert poller — a scheduled task, ten-minute cadence, LCC's own — had
 *     no registry line whatsoever, so the control plane reported LCC's pager as
 *     an unregistered orphan every time it fired.
 *
 * Every one of those is a hand-append. So this command refuses the shapes that
 * caused them: it will not register a pid that is not alive, it always records
 * the pid's CREATION TIME (the only part of an identity a recycled pid cannot
 * inherit), and it retires the previous instance in the SAME line that registers
 * the new one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY RETIRE AND REGISTER MUST BE ONE LINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious implementation is two appends: mark the old one STOPPED, then add
 * the new one RUNNING. Between those two appends the registry says the job is
 * stopped, and `job-health.mjs --strict` runs from CI and from the ten-minute
 * alert tick. A keeper that restarts on a five-minute trigger would eventually
 * land a tick inside that gap and page a human about a job that is fine.
 *
 * Worse in the other order: register-then-retire leaves two RUNNING rows for one
 * job_id, and last-line-wins silently discards the older — including its
 * `restart_count`, which is the number that tells you a job is crash-looping.
 *
 * One line carries both facts. `supersedes` records the instance being retired
 * and why, so the handover is auditable rather than inferred from two adjacent
 * lines that might not be adjacent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node scripts/job-register.mjs claim <job_id> --pid <pid> --lane LCC \
 *        [--purpose "..."] [--checkpoint <path|predicate>] [--log <path>] \
 *        [--resource LIGHT|CPU_HEAVY|DB_SCAN|GPU_EMBED|VECTOR_BUILD] \
 *        [--restart-policy resume-from-checkpoint|never-auto-restart|continuous] \
 *        [--startup SCHEDULED_TASK|LOGON_LAUNCHER|WINDOWS_SERVICE|agent-launched] \
 *        [--output-sql "select count(*) from t"] [--output-label name] \
 *        [--caught-up-sql "select backlog from ..."] [--caught-up-equals 0] \
 *        [--output-lines <path>] [--critical] [--reason "why the handover"]
 *
 *   node scripts/job-register.mjs retire <job_id> --reason "..." [--state STOPPED|FINISHED|FAILED]
 *   node scripts/job-register.mjs show <job_id>
 *
 * A `claim` inherits every field it is not given from the job's previous line,
 * so a keeper restart is `claim <job_id> --pid <new>` and nothing else.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(REPO, '.agents', 'jobs', 'registry.jsonl');

const LANES = new Set(['LCC', 'RCC', 'NEW1', 'NEW2', 'NEW3']);
const RESOURCES = new Set(['LIGHT', 'CPU_HEAVY', 'DB_SCAN', 'GPU_EMBED', 'VECTOR_BUILD']);

function die(msg) {
  console.error('job-register: ' + msg);
  process.exit(2);
}

function readRegistry() {
  if (!existsSync(REGISTRY)) return { jobs: new Map(), malformed: [] };
  const jobs = new Map();
  const malformed = [];
  readFileSync(REGISTRY, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const t = line.trim();
      if (!t) return;
      try {
        const o = JSON.parse(t);
        if (o.job_id) jobs.set(o.job_id, { ...o, _line: i + 1 });
      } catch (err) {
        malformed.push({ line: i + 1, reason: err.message });
      }
    });
  return { jobs, malformed };
}

/**
 * The pid's creation time, straight from the OS.
 *
 * Not optional and not defaultable. A registry line without one cannot tell a
 * live job from a stranger wearing its number, which is exactly the 23660
 * failure this file was written after. If the pid is not there, `claim` fails
 * rather than recording a hopeful line — a registry that claims RUNNING over
 * nothing is worse than no registry, because it silences the FAILED state that
 * would otherwise have paged someone.
 */
function processFacts(pid) {
  let out;
  try {
    out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if ($p) { ($p.CreationDate.ToString('o') + '|' + $p.Name + '|' + $p.ParentProcessId + '|' + $p.CommandLine) }`,
      ],
      { encoding: 'utf8', timeout: 40000 },
    ).trim();
  } catch (err) {
    die(`could not probe pid ${pid}: ${err.message.split('\n')[0]}`);
  }
  if (!out) return null;
  const [created, name, ppid, ...rest] = out.split('|');
  return { created, name, ppid: Number(ppid), commandLine: rest.join('|') };
}

function instanceIdOf(pid, createdAt) {
  return `${pid}@${String(createdAt).replace(/[-:]/g, '').slice(0, 15)}`;
}

function flag(argv, name, fallback = undefined) {
  const i = argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) die(`--${name} needs a value`);
  return v;
}

function claim(argv) {
  const jobId = argv[0];
  if (!jobId || jobId.startsWith('--')) die('claim needs a <job_id>');

  const { jobs } = readRegistry();
  const prev = jobs.get(jobId) ?? null;

  const pidRaw = flag(argv, 'pid');
  if (!pidRaw) die('claim needs --pid');
  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid <= 0) die(`--pid must be a positive integer, got "${pidRaw}"`);

  const facts = processFacts(pid);
  if (!facts) {
    die(
      `pid ${pid} is not in the process table. Refusing to register a dead pid as RUNNING — ` +
        'that is the exact shape that made new1-gpu-sidecar claim 23660 for four days. ' +
        'If the job has finished, use `retire`.',
    );
  }

  const lane = flag(argv, 'lane', prev?.owner_lane);
  if (!lane) die('claim needs --lane on a job with no previous line');
  if (!LANES.has(lane)) die(`--lane must be one of ${[...LANES].join(', ')}`);

  const resource = flag(argv, 'resource', prev?.resource_class ?? 'LIGHT');
  if (!RESOURCES.has(resource)) die(`--resource must be one of ${[...RESOURCES].join(', ')}`);

  const outputSql = flag(argv, 'output-sql');
  const outputLines = flag(argv, 'output-lines');
  const outputLabel = flag(argv, 'output-label', 'output');
  let outputProbe = prev?.output_probe ?? null;
  if (outputSql) outputProbe = { kind: 'sql', label: outputLabel, query: outputSql };
  if (outputLines) outputProbe = { kind: 'lines', label: outputLabel, path: outputLines };

  const caughtUpSql = flag(argv, 'caught-up-sql');
  const caughtUpLabel = flag(argv, 'caught-up-label', prev?.caught_up_probe?.label ?? 'backlog');
  const caughtUpEqualsRaw = flag(argv, 'caught-up-equals', prev?.caught_up_probe?.equals ?? 0);
  const caughtUpEquals = Number(caughtUpEqualsRaw);
  if (!Number.isFinite(caughtUpEquals)) die('--caught-up-equals must be numeric');
  let caughtUpProbe = prev?.caught_up_probe ?? null;
  if (caughtUpSql) {
    caughtUpProbe = {
      kind: 'sql',
      label: caughtUpLabel,
      query: caughtUpSql,
      equals: caughtUpEquals,
    };
  }

  const now = new Date().toISOString();

  // The handover, in one field. `restart_count` deliberately carries forward and
  // increments: a keeper that replaces its sidecar six times in an hour is a
  // restart storm, and that is only visible if the count survives the handover.
  const sameInstance =
    prev && prev.pid === pid && prev.pid_created_at === facts.created;
  const supersedes =
    prev && !sameInstance
      ? {
          instance_id: prev.instance_id ?? (prev.pid ? `${prev.pid}@unrecorded` : null),
          pid: prev.pid ?? null,
          pid_created_at: prev.pid_created_at ?? null,
          declared_status: prev.status ?? null,
          retired_at: now,
          reason: flag(argv, 'reason', 'replaced by a new instance'),
        }
      : null;

  const line = {
    job_id: jobId,
    owner_lane: lane,
    purpose: flag(argv, 'purpose', prev?.purpose ?? '(unstated)'),
    pid,
    pid_created_at: facts.created,
    instance_id: instanceIdOf(pid, facts.created),
    ppid: facts.ppid,
    command: flag(argv, 'command', facts.commandLine || prev?.command || null),
    started_at: sameInstance ? (prev?.started_at ?? facts.created) : facts.created,
    checkpoint: flag(argv, 'checkpoint', prev?.checkpoint ?? null),
    log: flag(argv, 'log', prev?.log ?? null),
    restart_policy: flag(argv, 'restart-policy', prev?.restart_policy ?? 'never-auto-restart'),
    startup_mechanism: flag(argv, 'startup', prev?.startup_mechanism ?? 'agent-launched'),
    finite: prev?.finite ?? false,
    resource_class: resource,
    progress_invariant: flag(argv, 'progress-invariant', prev?.progress_invariant ?? null),
    output_probe: outputProbe,
    caught_up_probe: caughtUpProbe,
    last_verified_progress: prev?.last_verified_progress ?? null,
    restart_count: sameInstance ? (prev?.restart_count ?? 0) : (prev?.restart_count ?? 0) + (prev ? 1 : 0),
    critical: argv.includes('--critical') ? true : (prev?.critical ?? undefined),
    status: 'RUNNING',
    supersedes,
    written_by: 'job-register',
    written_at: now,
  };

  for (const k of Object.keys(line)) if (line[k] === undefined) delete line[k];

  appendFileSync(REGISTRY, JSON.stringify(line) + '\n');
  console.log(
    `claimed ${jobId} -> instance ${line.instance_id} (pid ${pid}, born ${facts.created})` +
      (supersedes ? `\n  retired ${supersedes.instance_id} in the same line — ${supersedes.reason}` : ''),
  );
  if (line.restart_count) console.log(`  restart_count ${line.restart_count}`);
  if (!outputProbe) {
    console.log(
      '  WARNING: no output probe declared. This job can only ever be reported as\n' +
        '  "checkpoint moved", which is not evidence of work — pass --output-sql or\n' +
        '  --output-lines so a replay can be told from production.',
    );
  }
}

/**
 * A CADENCE job — one that is not supposed to have a pid.
 *
 * The alert poller runs every ten minutes, does one tick and exits. Forcing it
 * into the pid model gives the worst of both: register the pid and it reads
 * FAILED nine minutes out of ten; leave it unregistered and the control plane
 * reports LCC's own pager as an unregistered orphan, which is what it did.
 *
 * So its liveness is its SCHEDULER'S last-run time and its progress is its
 * receipts file. R7 §4 asks exactly this of a poller — "scheduled tick +
 * evaluated conditions + delivery result" — and none of those three is a pid.
 *
 * `--tolerance` is the multiplier on the cadence before a missed tick counts.
 * Two by default: one skipped fire is a busy machine, two in a row is the
 * scheduler not firing, and those want different responses.
 */
function cadence(argv) {
  const jobId = argv[0];
  if (!jobId || jobId.startsWith('--')) die('cadence needs a <job_id>');
  const { jobs } = readRegistry();
  const prev = jobs.get(jobId) ?? null;

  const task = flag(argv, 'task', prev?.scheduler_task);
  if (!task) die('cadence needs --task <scheduled task name>');
  const seconds = Number(flag(argv, 'every', prev?.cadence_seconds ?? 600));
  if (!Number.isFinite(seconds) || seconds <= 0) die('--every must be seconds');

  const lane = flag(argv, 'lane', prev?.owner_lane);
  if (!lane || !LANES.has(lane)) die(`cadence needs --lane (${[...LANES].join(', ')})`);

  const outputLines = flag(argv, 'output-lines', prev?.output_probe?.path);
  const outputLabel = flag(argv, 'output-label', prev?.output_probe?.label ?? 'receipts');
  if (!outputLines) {
    die(
      'cadence needs --output-lines <receipts file>. A tick job with no receipts ' +
        'can only prove it RAN, never that it evaluated anything — and "the task ' +
        'fired" is on R7 §2\'s list of things that are not completion.',
    );
  }

  const now = new Date().toISOString();
  const line = {
    job_id: jobId,
    owner_lane: lane,
    purpose: flag(argv, 'purpose', prev?.purpose ?? '(unstated)'),
    kind: 'cadence',
    pid: null,
    scheduler_task: task,
    cadence_seconds: seconds,
    cadence_tolerance: Number(flag(argv, 'tolerance', prev?.cadence_tolerance ?? 2)),
    command: flag(argv, 'command', prev?.command ?? null),
    checkpoint: flag(argv, 'checkpoint', prev?.checkpoint ?? null),
    log: flag(argv, 'log', prev?.log ?? null),
    restart_policy: 'continuous',
    startup_mechanism: 'SCHEDULED_TASK',
    finite: false,
    resource_class: flag(argv, 'resource', prev?.resource_class ?? 'LIGHT'),
    progress_invariant: flag(
      argv,
      'progress-invariant',
      prev?.progress_invariant ?? 'a scheduled tick that evaluated conditions and recorded a delivery result',
    ),
    output_probe: { kind: 'lines', label: outputLabel, path: outputLines },
    critical: argv.includes('--critical') ? true : (prev?.critical ?? undefined),
    status: 'RUNNING',
    started_at: prev?.started_at ?? now,
    written_by: 'job-register',
    written_at: now,
  };
  for (const k of Object.keys(line)) if (line[k] === undefined) delete line[k];
  appendFileSync(REGISTRY, JSON.stringify(line) + '\n');
  console.log(
    `registered cadence job ${jobId} — task "${task}" every ${seconds}s, receipts ${outputLines}`,
  );
}

function retire(argv) {
  const jobId = argv[0];
  if (!jobId || jobId.startsWith('--')) die('retire needs a <job_id>');
  const { jobs } = readRegistry();
  const prev = jobs.get(jobId);
  if (!prev) die(`no registry line for "${jobId}" — nothing to retire`);

  /**
   * PAUSED is accepted here because `job-health.mjs` already READS it —
   * `classify()` returns `{ state: 'PAUSED', why: 'declared paused by its lane' }`
   * — and nothing could ever WRITE it. A state the reader understands and the
   * writer cannot produce is a state that does not exist.
   *
   * It matters for the case it was missing in: a continuous job stopped
   * DELIBERATELY, for a quiet window or a freeze, and left declared RUNNING reads
   * as FAILED — "declared RUNNING but no process matches". That is a fake alarm,
   * and a control plane that cries wolf on its own maintenance is one nobody
   * reads. The difference between "it died" and "I stopped it" is the difference
   * between a page and a note.
   */
  const state = flag(argv, 'state', 'STOPPED');
  if (!['STOPPED', 'FINISHED', 'FAILED', 'PAUSED'].includes(state)) {
    die('--state must be STOPPED, FINISHED, FAILED or PAUSED');
  }
  const now = new Date().toISOString();
  const line = {
    ...prev,
    pid: null,
    status: state,
    supersedes: {
      instance_id: prev.instance_id ?? (prev.pid ? `${prev.pid}@unrecorded` : null),
      pid: prev.pid ?? null,
      pid_created_at: prev.pid_created_at ?? null,
      declared_status: prev.status ?? null,
      retired_at: now,
      reason: flag(argv, 'reason', 'retired'),
    },
    written_by: 'job-register',
    written_at: now,
  };
  delete line._line;
  appendFileSync(REGISTRY, JSON.stringify(line) + '\n');
  console.log(`retired ${jobId} as ${state} — ${line.supersedes.reason}`);
}

function show(argv) {
  const jobId = argv[0];
  const { jobs, malformed } = readRegistry();
  if (jobId) {
    const j = jobs.get(jobId);
    if (!j) die(`no registry line for "${jobId}"`);
    console.log(JSON.stringify(j, null, 2));
    return;
  }
  for (const [id, j] of jobs) {
    console.log(
      `${String(j.status).padEnd(9)} ${id.padEnd(30)} ${j.owner_lane}  pid=${j.pid ?? '-'}  instance=${j.instance_id ?? '-'}  probe=${j.output_probe ? j.output_probe.label : 'none'}`,
    );
  }
  if (malformed.length) {
    console.log('');
    console.log(`MALFORMED LINES (${malformed.length}):`);
    for (const m of malformed) console.log(`  line ${m.line}: ${m.reason}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'claim') claim(rest);
else if (cmd === 'cadence') cadence(rest);
else if (cmd === 'retire') retire(rest);
else if (cmd === 'show') show(rest);
else {
  console.error(
    'usage: job-register.mjs <claim|cadence|retire|show> <job_id> [flags]\n' +
      '       claim   <job_id> --pid <pid> [--lane LCC] [--output-sql "..."] [--reason "..."]\n' +
      '       cadence <job_id> --task <scheduled task> --every <seconds> --lane LCC --output-lines <receipts>\n' +
      '       retire  <job_id> --reason "..." [--state STOPPED|FINISHED|FAILED|PAUSED]\n' +
      '       show    [job_id]',
  );
  process.exit(2);
}
