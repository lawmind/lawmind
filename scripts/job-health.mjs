#!/usr/bin/env node
/**
 * JOB HEALTH — the central operational view of every persistent LawMind job.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three sentences are no longer accepted as proof that work is happening:
 *
 *     "the GPU is running"
 *     "the PID exists"
 *     "Task Scheduler fired"
 *
 * Every one of them has been true on this machine while nothing moved. The
 * fleet has hung with the log growing FASTER than normal; a launcher has
 * resolved a relative path against the Start Menu directory, started nothing,
 * and written no log at all — byte-for-byte indistinguishable from never having
 * been triggered; a walk has held 100% of its scope while 67,617 rows sat
 * unwalked behind its cursor.
 *
 * So this tool refuses to infer. It reports three independent things and lets
 * them disagree in public:
 *
 *   1. WHAT A LANE DECLARED   — `.agents/jobs/registry.jsonl`, append-only,
 *                               one line per job, later lines superseding.
 *   2. WHAT THE OS SHOWS      — one Win32_Process sweep, pid AND creation time,
 *                               because pids are recycled.
 *   3. WHAT ACTUALLY MOVED    — the job's own checkpoint content, fingerprinted
 *                               and compared against the previous observation.
 *
 * The third is the only one that is evidence of progress, and it is the reason
 * `.agents/jobs/observations.jsonl` exists: a single reading cannot tell a
 * moving checkpoint from a frozen one. Two readings can.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY OBSERVATIONS ARE A SEPARATE FILE FROM THE REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC owns VISIBILITY of every lane's jobs. LCC does NOT own the jobs.
 *
 * If this tool wrote its findings back into `registry.jsonl` it would be
 * rewriting NEW1's and NEW2's declared `status` field — taking ownership by
 * side effect. Instead the lane's declaration stays untouched in the registry,
 * and the observed reading is appended to `observations.jsonl`. Where they
 * disagree, BOTH are printed. A registry that says RUNNING over a dead pid is
 * itself a finding, and hiding it behind a silent correction would destroy the
 * signal.
 *
 * Both files are append-only for the same reason: five lanes share one
 * worktree, and a rewrite is a lost-update race.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SEVEN STATES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   RUNNING_PROGRESSING  process alive AND its checkpoint moved inside the
 *                        job's own stall window.
 *   RUNNING_STALLED      process alive, checkpoint has NOT moved for longer
 *                        than the stall window. This is the state the tool
 *                        exists for. It is alive and it is not working.
 *   STARTING             process alive, younger than the grace period, no
 *                        progress reading yet. Not a stall — not yet evidence.
 *   PAUSED               a lane declared it paused. Never inferred.
 *   STOPPED              not running, and that is expected: FINISHED, or
 *                        deliberately STOPPED, or the pid was recycled into
 *                        somebody else's process.
 *   FAILED               the registry declares it RUNNING and the process is
 *                        NOT there. Nobody stopped it on purpose.
 *   UNKNOWN              the probe itself failed, or a live LawMind process
 *                        matches no registry job at all. A failed probe is not
 *                        evidence of death and is never reported as one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node scripts/job-health.mjs              the matrix, for humans
 *   node scripts/job-health.mjs --json       the same reading, machine-readable
 *   node scripts/job-health.mjs --quiet      only rows needing attention
 *   node scripts/job-health.mjs --no-record  do not append an observation
 *   node scripts/job-health.mjs --strict     exit 1 on FAILED / RUNNING_STALLED
 *
 * READ-ONLY with respect to every job. It starts nothing, stops nothing, and
 * kills nothing — a process belonging to another lane is reported, never
 * adjudicated. That rule is not a nicety: a lane has already lost work to
 * another lane killing a process on a name match.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(REPO, '.agents', 'jobs', 'registry.jsonl');
const OBSERVATIONS = join(REPO, '.agents', 'jobs', 'observations.jsonl');

/** A process younger than this with no progress reading is STARTING, not stalled. */
const STARTING_GRACE_MS = 5 * 60 * 1000;

/**
 * Default stall window. Deliberately generous: the GPU walk writes a checkpoint
 * per batch and a batch is minutes, while the citation walk pays ~65s to
 * rebuild its form index on every restart. A window shorter than the slowest
 * legitimate step manufactures false stalls, and a control plane that cries
 * wolf is worse than none.
 */
const DEFAULT_STALL_MS = 45 * 60 * 1000;

/** Per-job override, milliseconds. Keyed by job_id. */
const STALL_WINDOW_MS = {
  'new1-doc-vector-embed': 30 * 60 * 1000,
  'new1-gpu-sidecar': 60 * 60 * 1000,
  'new1-sidecar-keeper': 60 * 60 * 1000,
  'citations-backlog-walk': 30 * 60 * 1000,
};

/** Terminal declarations — absence of the process is expected, not a failure. */
const TERMINAL = new Set(['FINISHED', 'STOPPED', 'PAUSED']);

/**
 * Which jobs are worth waking a human for.
 *
 * This list is LCC's, because LCC owns paging — and owning the paging decision
 * is NOT owning the job. A lane can set `"critical": true` on its own registry
 * line and that wins; this map only supplies a default for the long-running
 * jobs whose silence has cost the project real time before.
 *
 * Deliberately short. A pager that fires for every finite one-shot script gets
 * muted, and a muted pager is worse than none — which is the whole reason
 * `metrics.ts` keeps only two severities.
 */
const CRITICAL_BY_DEFAULT = new Set([
  'new1-sidecar-keeper',
  'new1-gpu-sidecar',
  'new1-doc-vector-embed',
  'citations-backlog-walk',
  'new2-hc-classify-walk',
]);

function isCritical(job) {
  // The lane's own declaration wins outright — it owns the job.
  if (typeof job.critical === 'boolean') return job.critical;
  // Then this list. It is checked BEFORE `finite`, because the two longest jobs
  // on this box (the GPU document walk, the HC classify walk) both declare
  // `finite: true` — they end when their scope ends — and a `finite` short
  // circuit silently made the only two jobs anyone would want paged about the
  // only two that could never page.
  if (CRITICAL_BY_DEFAULT.has(job.job_id)) return true;
  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// registry
// ───────────────────────────────────────────────────────────────────────────

/**
 * Last line per job_id wins. A malformed line is REPORTED rather than skipped
 * silently — `registry.jsonl` already contains one truncated write, and a
 * parser that swallows it turns a corrupted append into an invisible one.
 */
function readRegistry() {
  if (!existsSync(REGISTRY)) return { jobs: new Map(), malformed: [] };
  const jobs = new Map();
  const malformed = [];
  const lines = readFileSync(REGISTRY, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const o = JSON.parse(trimmed);
      if (!o.job_id) throw new Error('no job_id');
      jobs.set(o.job_id, { ...o, _line: i + 1 });
    } catch (err) {
      malformed.push({ line: i + 1, reason: err.message, head: trimmed.slice(0, 90) });
    }
  });
  return { jobs, malformed };
}

/** Previous readings, newest per job_id. Same append-only, last-wins rule. */
function readObservations() {
  if (!existsSync(OBSERVATIONS)) return new Map();
  const out = new Map();
  for (const line of readFileSync(OBSERVATIONS, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (o.job_id) out.set(o.job_id, o);
    } catch {
      // An unreadable observation is not worth failing the report over; the
      // registry's malformed lines are the ones that matter, and they are shown.
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// the OS
// ───────────────────────────────────────────────────────────────────────────

/**
 * ONE sweep, not one probe per job. Per-pid probing costs ~700ms each and made
 * the report slow enough that nobody would run it, which is the only way a
 * control plane truly fails.
 *
 * CreationDate is round-tripped to an ISO string inside PowerShell because
 * ConvertTo-Json renders a DateTime as `/Date(...)/`, which `new Date()` cannot
 * parse — the same defect that once made every lane-lease probe read UNKNOWN.
 */
function sweepProcesses() {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,@{n='Created';e={$_.CreationDate.ToString('o')}} | ConvertTo-Json -Compress -Depth 3",
      ],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 },
    ).trim();
    if (!out) return { ok: false, reason: 'empty process sweep', byPid: new Map(), all: [] };
    const arr = JSON.parse(out);
    const list = Array.isArray(arr) ? arr : [arr];
    const byPid = new Map();
    for (const p of list) byPid.set(Number(p.ProcessId), p);
    return { ok: true, byPid, all: list };
  } catch (err) {
    // A failed sweep is UNKNOWN for every job. It is never death.
    return { ok: false, reason: err.message.split('\n')[0], byPid: new Map(), all: [] };
  }
}

/**
 * Live LawMind work, independent of what any lane declared.
 *
 * Editor/tooling processes that merely happen to sit in the repo directory are
 * excluded by name, not by guesswork: the Railway CLI and chrome-devtools-mcp
 * are MCP transports, and counting them as unregistered jobs would bury the
 * real orphans under permanent noise.
 */
const TOOLING =
  /railway|chrome-devtools-mcp|\\Code\\|antigravity|language-server|eslint|tsserver|vitest|job-health\.mjs|lane-lease\.mjs/i;

const WORKER = /^(node|python|pythonw|cmd|powershell|pwsh)\.exe$/i;

function lawmindProcesses(sweep) {
  const seed = sweep.all.filter((p) => {
    const cl = p.CommandLine || '';
    if (!cl) return false;
    if (!/lawmind/i.test(cl)) return false;
    if (TOOLING.test(cl)) return false;
    return WORKER.test(p.Name || '');
  });

  // Descendant expansion, and it is not optional.
  //
  // The absolute-path match alone MISSED the sidecar keeper: its wrapper is
  // launched with a LawMind path, but the wrapper then `cd /d`s into the repo
  // and runs `node services\harness\src\sidecar-keeper.mjs` — a RELATIVE path,
  // so the string "Lawmind" appears nowhere in the child's command line. The
  // most important long-running process on the box was invisible to the first
  // version of this filter, which is the same class of defect the tool exists
  // to catch, committed by the tool itself.
  //
  // A child of a LawMind process is LawMind work regardless of how its command
  // line reads. Tooling is still excluded by name so an MCP transport spawned
  // under a wrapper does not become a phantom job.
  const chosen = new Map(seed.map((p) => [Number(p.ProcessId), p]));
  for (let pass = 0; pass < 8; pass += 1) {
    let added = 0;
    for (const p of sweep.all) {
      const pid = Number(p.ProcessId);
      if (chosen.has(pid)) continue;
      if (!WORKER.test(p.Name || '')) continue;
      if (TOOLING.test(p.CommandLine || '')) continue;
      if (chosen.has(Number(p.ParentProcessId))) {
        chosen.set(pid, p);
        added += 1;
      }
    }
    if (!added) break;
  }
  return [...chosen.values()];
}

// ───────────────────────────────────────────────────────────────────────────
// what actually moved
// ───────────────────────────────────────────────────────────────────────────

/**
 * The progress fingerprint. A checkpoint's CONTENT, not its mtime.
 *
 * mtime is the wrong measure and has been wrong here before: a worker that
 * rewrites the same cursor every loop touches the file forever while the cursor
 * never advances. Hashing the content means an unchanged checkpoint produces an
 * unchanged fingerprint no matter how often it is rewritten.
 *
 * For a log we hash the LAST 4 KiB and record the byte length separately: a
 * hang that grows the log is real and common here, so length alone cannot be
 * trusted either — but a log whose tail never changes is a usable second signal
 * for a job that declares no checkpoint file at all.
 */
function fingerprint(job) {
  const parts = [];
  const cp = job.checkpoint;
  if (cp && !/^\s*select\b/i.test(cp) && !cp.includes(' ')) {
    const p = resolve(REPO, cp);
    if (existsSync(p)) {
      try {
        const st = statSync(p);
        const body = st.isDirectory()
          ? String(st.mtimeMs)
          : readFileSync(p, 'utf8').slice(0, 256 * 1024);
        parts.push('cp:' + createHash('sha1').update(body).digest('hex').slice(0, 16));
      } catch (err) {
        parts.push('cp:unreadable:' + err.code);
      }
    } else {
      parts.push('cp:absent');
    }
  } else if (cp) {
    // A DB predicate, not a path. Real, but it costs a query, so it is named
    // rather than evaluated here: running it would make a health check a DB_SCAN.
    parts.push('cp:predicate');
  }

  const lg = job.log;
  let logBytes = null;
  if (lg) {
    const p = resolve(REPO, lg);
    if (existsSync(p)) {
      try {
        const st = statSync(p);
        logBytes = st.size;
        const fd = readFileSync(p);
        const tail = fd.subarray(Math.max(0, fd.length - 4096));
        parts.push('log:' + createHash('sha1').update(tail).digest('hex').slice(0, 16));
      } catch (err) {
        parts.push('log:unreadable:' + err.code);
      }
    } else {
      parts.push('log:absent');
    }
  }

  return {
    value: parts.length ? parts.join('|') : null,
    logBytes,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// the state machine
// ───────────────────────────────────────────────────────────────────────────

function classify(job, proc, fp, prev, now) {
  const declared = String(job.status || 'UNKNOWN').toUpperCase();

  if (proc.probeFailed) {
    return { state: 'UNKNOWN', why: 'process sweep failed; absence is not death' };
  }

  const alive = proc.alive === true && proc.sameProcess === true;
  const recycled = proc.alive === true && proc.sameProcess === false;

  if (declared === 'PAUSED') return { state: 'PAUSED', why: 'declared paused by its lane' };

  if (!alive) {
    if (recycled) {
      return {
        state: TERMINAL.has(declared) ? 'STOPPED' : 'FAILED',
        why: `pid ${job.pid} is now a different process (${proc.name}); recorded start ${job.pid_created_at || 'unrecorded'}`,
      };
    }
    if (TERMINAL.has(declared)) return { state: 'STOPPED', why: `declared ${declared}` };
    return { state: 'FAILED', why: `declared ${declared} but no such process` };
  }

  // Alive from here on. The only question left is whether it is working.
  const lastProgressAt = progressSince(fp, prev, now);
  const ageMs = proc.createdAt ? now - Date.parse(proc.createdAt) : null;
  const stallMs = STALL_WINDOW_MS[job.job_id] ?? DEFAULT_STALL_MS;

  if (lastProgressAt === null) {
    if (ageMs !== null && ageMs < STARTING_GRACE_MS) {
      return {
        state: 'STARTING',
        why: `alive ${Math.round(ageMs / 1000)}s, no progress reading yet`,
      };
    }
    if (!fp.value) {
      return {
        state: 'UNKNOWN',
        why: 'alive, but this job declares no checkpoint or log to measure — progress is unmeasurable',
      };
    }
    return {
      state: 'UNKNOWN',
      why: 'alive, first progress reading taken now; no prior observation to compare against — run again to classify',
    };
  }

  const sinceMs = now - lastProgressAt;
  if (sinceMs <= stallMs) {
    return {
      state: 'RUNNING_PROGRESSING',
      why: `checkpoint moved ${Math.round(sinceMs / 60000)}m ago`,
    };
  }
  return {
    state: 'RUNNING_STALLED',
    why: `alive, but nothing moved for ${Math.round(sinceMs / 60000)}m (window ${Math.round(stallMs / 60000)}m)`,
  };
}

/**
 * When did this job LAST really move?
 *
 * If the fingerprint differs from the previous observation, it moved now. If it
 * is identical, it last moved whenever the previous observation said it did —
 * which chains backwards through the observation file to the true instant of
 * change. With no prior observation the honest answer is null, not "now": a
 * first reading cannot distinguish a busy job from a frozen one, and reporting
 * it as healthy is exactly the lie this tool exists to stop telling.
 */
function progressSince(fp, prev, now) {
  if (!fp.value) return null;
  if (!prev) return null;
  if (prev.fingerprint !== fp.value) return now;
  return prev.last_progress_at ? Date.parse(prev.last_progress_at) : null;
}

// ───────────────────────────────────────────────────────────────────────────
// startup mechanisms
// ───────────────────────────────────────────────────────────────────────────

/**
 * How work gets started on this box without an agent typing anything. Every one
 * of these has silently misfired at least once, so they are inventoried whether
 * or not anything is currently running.
 */
function startupMechanisms() {
  const found = [];

  const fmt =
    "Get-ScheduledTask | Where-Object { $_.TaskName -match 'awmind' } | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; ($_.TaskName + '|' + $_.State + '|' + $i.LastRunTime + '|' + $i.LastTaskResult) }";
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', fmt], {
      encoding: 'utf8',
      timeout: 40000,
    }).trim();
    for (const line of out.split('\n')) {
      const [name, state, lastRun, result] = line.trim().split('|');
      if (name) found.push({ kind: 'SCHEDULED_TASK', name, state, lastRun, result });
    }
  } catch (err) {
    found.push({
      kind: 'SCHEDULED_TASK',
      name: '(query failed)',
      state: err.message.split('\n')[0],
    });
  }

  const startupDir = join(
    process.env.APPDATA || '',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
  );
  if (existsSync(startupDir)) {
    try {
      for (const name of readFileSync ? listDir(startupDir) : []) {
        if (!/awmind/i.test(name)) continue;
        found.push({
          kind: 'LOGON_LAUNCHER',
          name,
          state: /\.disabled/i.test(name) ? 'Disabled' : 'Enabled',
          note: 'fires at LOGON, not at boot — a machine sitting at the lock screen runs nothing',
        });
      }
    } catch {
      // A missing or unreadable Startup folder is not worth failing over.
    }
  }

  // The single-instance locks the enrich-worker wrapper holds. A lock with no
  // process behind it is how a launcher fires forever and starts nothing.
  const tmp = process.env.TEMP || process.env.TMP;
  if (tmp) {
    for (const lock of ['lawmind-citations.lock', 'lawmind-paragraphs.lock']) {
      const p = join(tmp, lock);
      if (existsSync(p)) {
        found.push({
          kind: 'WRAPPER_LOCK',
          name: lock,
          state: 'PRESENT',
          note: 'blocks a restart while held; stale if no matching process is alive',
        });
      }
    }
  }

  return found;
}

function listDir(dir) {
  return execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-ChildItem -LiteralPath "${dir}" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }`,
    ],
    { encoding: 'utf8', timeout: 30000 },
  )
    .trim()
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────
// rendering
// ───────────────────────────────────────────────────────────────────────────

const ATTENTION = new Set(['FAILED', 'RUNNING_STALLED', 'UNKNOWN']);

function ago(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '-';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${String(m % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)}d`;
}

function pad(s, n) {
  const t = s === null || s === undefined ? '-' : String(s);
  return t.length > n ? t.slice(0, n - 1) + '~' : t.padEnd(n);
}

function table(rows) {
  const head = [
    pad('JOB', 28),
    pad('OWNER', 5),
    pad('PID', 6),
    pad('AGE', 5),
    pad('STATE', 20),
    pad('HEARTBT', 7),
    pad('PROGRESS', 8),
    pad('METRIC', 30),
    pad('STARTUP', 15),
    pad('RS', 2),
    pad('RESOURCE', 11),
  ].join(' ');
  const lines = [head, '-'.repeat(head.length)];
  for (const r of rows) {
    lines.push(
      [
        pad(r.job_id, 28),
        pad(r.owner_lane, 5),
        pad(r.pid ?? '-', 6),
        pad(r.age, 5),
        pad(r.state, 20),
        pad(r.heartbeat, 7),
        pad(r.progress, 8),
        pad(r.metric, 30),
        pad(r.startup, 15),
        pad(r.restarts ?? '-', 2),
        pad(r.resource_class, 11),
      ].join(' '),
    );
  }
  return lines.join('\n');
}

function startupOf(job) {
  const c = String(job.command || '');
  if (job.startup_mechanism) return job.startup_mechanism;
  if (/sidecar-keeper/.test(c)) return 'SCHEDULED_TASK';
  if (/enrich-worker/.test(c)) return 'LOGON_LAUNCHER';
  return 'agent-launched';
}

// ───────────────────────────────────────────────────────────────────────────
// main
// ───────────────────────────────────────────────────────────────────────────

/**
 * Publish the reading to `ops_job_observations` so `admin/metrics.ts` can page
 * on it.
 *
 * The file stays the working memory; this is the published copy. One direction
 * of flow — nothing here reads the table back, so the pager and the report can
 * never disagree about the same minute.
 *
 * A publish failure is REPORTED and does not fail the report: the matrix is
 * still correct on the console when the database is the thing that is down, and
 * "could not publish" is exactly the moment you most want to still see it.
 */
async function publish(rows, nowIso) {
  const { default: postgres } = await import(
    '../services/ingest/node_modules/postgres/src/index.js'
  );
  const url =
    process.env.DATABASE_URL ??
    (readFileSync(join(REPO, '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m) ?? [])[1];
  if (!url) throw new Error('no DATABASE_URL in the environment or .env');

  const sql = postgres(url.trim(), { max: 1, onnotice: () => {} });
  try {
    const payload = rows
      .filter((r) => r.job_id !== '(unregistered)')
      .map((r) => ({
        job_id: r.job_id,
        owner_lane: r.owner_lane ?? '?',
        observed_at: nowIso,
        state: r.state,
        declared_status: r.declared ?? null,
        pid: r.pid ?? null,
        pid_alive: r.pid_alive ?? null,
        pid_created_at: r.pid_created_at ?? null,
        parent_pid: r.parent ?? null,
        startup_mechanism: r.startup ?? null,
        resource_class: r.resource_class ?? null,
        restart_count: r.restarts ?? null,
        progress_fingerprint: r.fingerprint ?? null,
        progress_metric: r.metric ?? null,
        last_progress_at: r.last_progress_at ?? null,
        checkpoint: r.checkpoint ?? null,
        log: r.log ?? null,
        critical: Boolean(r.critical),
        why: r.why ?? null,
        observer: 'LCC job-health',
      }));
    if (payload.length === 0) return { ok: true, rows: 0 };
    await sql`INSERT INTO ops_job_observations ${sql(payload)}`;
    return { ok: true, rows: payload.length };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const strict = argv.includes('--strict');
  const record = !argv.includes('--no-record');
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { jobs, malformed } = readRegistry();
  const prevObs = readObservations();
  const sweep = sweepProcesses();
  const live = lawmindProcesses(sweep);

  const rows = [];
  const observations = [];
  const claimedPids = new Set();

  for (const job of jobs.values()) {
    const pid = job.pid ? Number(job.pid) : null;
    const osProc = pid ? sweep.byPid.get(pid) : undefined;
    if (pid && osProc) claimedPids.add(pid);

    const proc = {
      probeFailed: !sweep.ok,
      alive: pid ? Boolean(osProc) : false,
      name: osProc?.Name ?? null,
      createdAt: osProc?.Created ?? null,
      // Without a recorded creation time we cannot rule out recycling. The
      // registry schema does not require one, so this is recorded as an
      // assumption rather than a check that was made.
      sameProcess: osProc ? !job.pid_created_at || job.pid_created_at === osProc.Created : false,
    };

    const fp = fingerprint(job);
    const prev = prevObs.get(job.job_id);
    const verdict = classify(job, proc, fp, prev, now);
    const lastProgressAt = progressSince(fp, prev, now);

    const declaredProgressAt = job.last_verified_progress?.at
      ? Date.parse(job.last_verified_progress.at)
      : null;

    rows.push({
      job_id: job.job_id,
      owner_lane: job.owner_lane,
      pid: proc.alive ? pid : (job.pid ?? null),
      pid_alive: proc.alive,
      pid_created_at: proc.createdAt,
      fingerprint: fp.value,
      last_progress_at: lastProgressAt
        ? new Date(lastProgressAt).toISOString()
        : (prev?.last_progress_at ?? null),
      age: proc.createdAt ? ago(now - Date.parse(proc.createdAt)) : '-',
      state: verdict.state,
      declared: job.status,
      heartbeat: declaredProgressAt ? ago(now - declaredProgressAt) : '-',
      progress: lastProgressAt ? ago(now - lastProgressAt) : '-',
      metric: job.progress_invariant ?? null,
      checkpoint: job.checkpoint ?? null,
      log: job.log ?? null,
      startup: startupOf(job),
      restarts: job.restart_count ?? null,
      restart_policy: job.restart_policy ?? null,
      resource_class: job.resource_class ?? null,
      critical: isCritical(job),
      why: verdict.why,
      command: job.command ?? null,
      parent: osProc?.ParentProcessId ?? null,
      registry_line: job._line,
    });

    observations.push({
      job_id: job.job_id,
      observed_at: nowIso,
      state: verdict.state,
      declared_status: job.status ?? null,
      pid,
      pid_alive: proc.alive,
      pid_created_at: proc.createdAt,
      fingerprint: fp.value,
      log_bytes: fp.logBytes,
      last_progress_at: lastProgressAt
        ? new Date(lastProgressAt).toISOString()
        : (prev?.last_progress_at ?? null),
      why: verdict.why,
      observer: 'LCC job-health',
    });
  }

  // Live LawMind work that no registry job claims. These are the ones nobody is
  // watching, which is why they are printed in the attention list rather than a
  // footnote.
  const orphans = live
    .filter((p) => !claimedPids.has(Number(p.ProcessId)))
    .filter((p) => {
      // A descendant of a claimed process is that job's own subprocess, not an
      // orphan. Walk up a bounded number of generations.
      let ppid = Number(p.ParentProcessId);
      for (let i = 0; i < 6 && ppid; i += 1) {
        if (claimedPids.has(ppid)) return false;
        ppid = Number(sweep.byPid.get(ppid)?.ParentProcessId ?? 0);
      }
      return true;
    })
    .map((p) => ({
      job_id: '(unregistered)',
      owner_lane: '?',
      pid: Number(p.ProcessId),
      age: p.Created ? ago(now - Date.parse(p.Created)) : '-',
      state: 'UNKNOWN',
      heartbeat: '-',
      progress: '-',
      metric: 'no registry record — nobody declared this',
      startup: `ppid ${p.ParentProcessId}`,
      restarts: null,
      resource_class: null,
      command: (p.CommandLine || '').slice(0, 220),
      why: 'live LawMind process with no job_id; owner unknown, NOT adjudicated',
      parent: Number(p.ParentProcessId),
    }));

  const all = [...rows, ...orphans];
  const attention = all.filter((r) => ATTENTION.has(r.state));
  const startup = startupMechanisms();

  if (record && observations.length) {
    appendFileSync(OBSERVATIONS, observations.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }

  let published = null;
  if (argv.includes('--publish')) {
    try {
      published = await publish(rows, nowIso);
    } catch (err) {
      published = { ok: false, error: err.message.split('\n')[0] };
    }
  }

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          observed_at: nowIso,
          process_sweep_ok: sweep.ok,
          process_sweep_error: sweep.ok ? null : sweep.reason,
          lawmind_processes: live.length,
          published,
          jobs: all,
          attention: attention.map((r) => `${r.job_id}#${r.pid}`),
          startup_mechanisms: startup,
          malformed_registry_lines: malformed,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    const shown = quiet ? attention : all;
    console.log(`LAWMIND JOB HEALTH  ${nowIso}`);
    console.log(
      `process sweep: ${sweep.ok ? `${sweep.all.length} processes, ${live.length} LawMind` : 'FAILED — ' + sweep.reason}`,
    );
    console.log('');
    console.log(table(shown));
    console.log('');
    if (attention.length) {
      console.log(`NEEDS ATTENTION (${attention.length}):`);
      for (const r of attention) {
        console.log(`  ${r.state.padEnd(20)} ${r.job_id}${r.pid ? ' pid ' + r.pid : ''} — ${r.why}`);
        if (r.command) console.log(`      ${String(r.command).slice(0, 170)}`);
      }
      console.log('');
    }
    console.log('STARTUP MECHANISMS:');
    for (const s of startup) {
      const tail = s.lastRun ? `last ${s.lastRun} rc=${s.result}` : (s.note ?? '');
      console.log(
        `  ${s.kind.padEnd(16)} ${String(s.name).padEnd(44)} ${String(s.state ?? '').padEnd(9)} ${tail}`,
      );
    }
    if (malformed.length) {
      console.log('');
      console.log(
        `MALFORMED REGISTRY LINES (${malformed.length}) — an append that did not complete:`,
      );
      for (const m of malformed) console.log(`  line ${m.line}: ${m.reason} :: ${m.head}`);
    }
    console.log('');
    if (published) {
      console.log('');
      console.log(
        published.ok
          ? `published ${published.rows} observation(s) to ops_job_observations`
          : `PUBLISH FAILED — ${published.error} (the matrix above is still correct)`,
      );
    }
    console.log('');
    console.log(
      'A process being alive does not prove progress. A process being absent does not prove completion.',
    );
  }

  if (strict && attention.some((r) => r.state === 'FAILED' || r.state === 'RUNNING_STALLED')) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
