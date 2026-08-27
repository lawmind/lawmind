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
/**
 * Both files are overridable so the control plane can be TESTED against a
 * fixture instead of only against whatever the box happens to be doing.
 *
 * That is not a convenience. The defect this file was rewritten to fix — a
 * recycled pid adopted as a healthy job — is unreproducible on demand against
 * the live registry: it needs a pid that is alive AND is not the job, and you
 * cannot ask Windows to recycle a number to order. With a fixture registry it is
 * two lines and runs in a second, so the guard has an actual failing case behind
 * it rather than a comment claiming it works.
 */
const argvRaw = process.argv.slice(2);
function argOf(name, fallback) {
  const i = argvRaw.indexOf('--' + name);
  return i === -1 || !argvRaw[i + 1] ? fallback : argvRaw[i + 1];
}
const REGISTRY = resolve(REPO, argOf('registry', join('.agents', 'jobs', 'registry.jsonl')));
const OBSERVATIONS = resolve(REPO, argOf('observations', join('.agents', 'jobs', 'observations.jsonl')));

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
 * How long a job may hold a live process, a moving checkpoint and ZERO durable
 * output before that combination is called REPLAYING rather than progressing.
 *
 * R7 §4 requires the distinction and NEW1's 1181 is why the number is not
 * generous: their HEAD walk held the GPU, advanced its checkpoint and grew its
 * log for 65 minutes while `new1_doc_vector_stage` sat at 2,026,872 rows — the
 * delta was exactly 0. Every signal anyone was watching said healthy. A replay
 * IS legitimate for a while (a resumed walk re-reads its skip prefix), so this
 * is a window and not a threshold; past it, the honest word is REPLAYING.
 */
const REPLAY_WINDOW_MS = 30 * 60 * 1000;

/**
 * Words in a command line that vary between two runs of the SAME job and must
 * not enter its signature: pids, ports chosen at runtime, temp paths, dates.
 * Everything else — the interpreter, the script path, the subcommand, the
 * meaningful flags — is what makes two processes the same job.
 */
function commandSignature(cmd) {
  if (!cmd) return null;
  return (
    String(cmd)
      .toLowerCase()
      // Absolute paths differ between a launcher's copy and the repo's copy of
      // the same script; the tail is what identifies it.
      .replace(/[a-z]:\\[^"'\s]*[\\/]/g, '')
      .replace(/\\/g, '/')
      .replace(/"/g, '')
      // Volatile: pids, epoch stamps, uuids, ports.
      .replace(/\b\d{4,}\b/g, '#')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '#')
      .replace(/\s+/g, ' ')
      .trim() || null
  );
}

/**
 * Do two command lines describe the same job?
 *
 * Deliberately NOT string equality. The keeper's wrapper is launched by absolute
 * path and then runs `node services/harness/src/sidecar-keeper.mjs` relative —
 * the same job, two command lines with almost nothing in common textually. What
 * they DO share is the script path, and a script path is the strongest identity
 * signal a command line carries. So the test is: does the declared signature's
 * most distinctive token (its script path) appear in the observed one, or the
 * other way round.
 */
function signatureMatches(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const script = (s) => (s.match(/[\w.-]+\.(mjs|mts|ts|js|py|cmd|ps1|sh)\b/g) || []).pop();
  const sa = script(a);
  const sb = script(b);
  if (sa && sb) return sa === sb;
  return a.includes(b) || b.includes(a);
}

/**
 * The instance id. R7 §4 requires one, and it exists because a pid is not an
 * identity: pids are recycled, and this box recycled 23660 into a stranger
 * within four days (see `.agents/jobs/observations.jsonl` @ 11:04:09.169Z,
 * where THIS tool adopted that stranger and reported NEW1's GPU sidecar as
 * STARTING). pid alone is a name that another process can inherit; pid PLUS
 * creation time cannot be inherited by anything.
 */
function instanceIdOf(pid, createdAt) {
  if (!pid) return null;
  if (!createdAt) return `${pid}@unrecorded`;
  return `${pid}@${String(createdAt).replace(/[-:]/g, '').slice(0, 15)}`;
}

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

/**
 * Default output probes, LCC's, on the same footing as `CRITICAL_BY_DEFAULT`:
 * a lane's own `output_probe` on its registry line wins outright, and this only
 * supplies one for the jobs whose silence has already cost real time.
 *
 * Declaring these here rather than editing another lane's registry line is
 * deliberate. The registry holds what a LANE DECLARED; rewriting NEW1's line to
 * add a field LCC wants would be taking ownership of their job by side effect,
 * which is the thing `observations.jsonl` exists to avoid.
 *
 * Every table named here was confirmed present with `to_regclass` before being
 * written down. None of them is a `count(*)` over the 18.7M-row `judgments`
 * heap: a probe that is itself a DB_SCAN turns the monitor into a competitor of
 * the work it monitors, and would need a heavy window of its own.
 *
 * `new1-gpu-sidecar` shares the walk's probe on purpose. A stateless HTTP
 * service has no output of its own, so `/health` returning 200 is the only thing
 * it can prove about itself — and 200 with CUDA resident is exactly what was
 * true for the 65 minutes NEW1 produced nothing. The only honest measure of a
 * sidecar's usefulness is whether its CONSUMER's rows moved.
 */
const OUTPUT_PROBE_BY_DEFAULT = {
  'new1-doc-vector-embed': {
    kind: 'sql',
    label: 'staged_vectors',
    query: 'select count(*)::bigint from new1_doc_vector_stage',
  },
  'new1-gpu-sidecar': {
    kind: 'sql',
    label: 'consumer_vectors',
    query: 'select count(*)::bigint from new1_doc_vector_stage',
  },
};

function outputSpecOf(job) {
  return job.output_probe ?? OUTPUT_PROBE_BY_DEFAULT[job.job_id] ?? null;
}

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
 * PowerShell writes stdout in the console's ANSI codepage, not UTF-8. One
 * non-ASCII character in ANY live process command line therefore makes this
 * sweep unparseable — and a failed sweep is UNKNOWN for EVERY job, not just
 * for that one process. Measured 25 Aug 2026: a single section sign in one
 * command line took the whole control plane blind with "Bad control
 * character in string literal". This repo handles Devanagari paths.
 */
const UTF8_PREAMBLE = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';

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
        `${UTF8_PREAMBLE}Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,@{n='Created';e={$_.CreationDate.ToString('o')}} | ConvertTo-Json -Compress -Depth 3`,
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
// durable output — the only thing that is evidence of WORK
// ───────────────────────────────────────────────────────────────────────────

/**
 * A checkpoint says where a worker has READ to. Only the output says what it
 * WROTE, and R7 §4 accepts nothing else:
 *
 *   embedding/passage jobs   new durable vectors/passages
 *   citation-key builder     real key coverage / lag closure
 *   classifier               newly classified rows
 *   OCR                      queue -> recovery delta
 *   alert poller             tick + evaluated conditions + delivery result
 *
 * A registry line declares this as `output_probe`:
 *
 *   { "kind": "sql",   "label": "staged_vectors", "query": "select count(*) from new1_doc_vector_stage" }
 *   { "kind": "lines", "label": "strata",         "path":  "docs/ai/new2-r7/data-moat-census.jsonl" }
 *   { "kind": "bytes", "label": "artifact",       "path":  "docs/ops/.../result.json" }
 *
 * SQL probes are OFF by default and run only under `--with-output`. A health
 * check that silently issues counts against a 22 GB heap becomes a DB_SCAN, and
 * a monitoring tool that competes with the work it monitors is its own defect.
 * Without the flag the probe is reported as `NOT_MEASURED`, never as zero —
 * unmeasured and zero are opposite facts and this file has already been burned
 * once by a check that returned 0 for every input.
 */
async function outputProbe(job, prev, now, enabled) {
  const spec = outputSpecOf(job);
  if (!spec) return { declared: false, measured: false, label: null, value: null, delta: null };

  const label = spec.label || spec.kind || 'output';
  const prevValue = prev?.output_value ?? null;
  const prevAt = prev?.last_output_change_at ? Date.parse(prev.last_output_change_at) : null;

  const settle = (value) => {
    if (value === null || value === undefined) {
      return { declared: true, measured: false, label, value: null, delta: null, why: 'probe returned nothing' };
    }
    const delta = prevValue === null || prevValue === undefined ? null : Number(value) - Number(prevValue);
    const changed = delta === null ? true : delta !== 0;
    return {
      declared: true,
      measured: true,
      label,
      value: Number(value),
      delta,
      lastOutputAt: changed ? now : prevAt,
    };
  };

  try {
    if (spec.kind === 'lines' || spec.kind === 'bytes') {
      const p = resolve(REPO, spec.path);
      if (!existsSync(p)) return settle(0);
      if (spec.kind === 'bytes') return settle(statSync(p).size);
      const body = readFileSync(p, 'utf8');
      return settle(body.split('\n').filter((l) => l.trim()).length);
    }
    if (spec.kind === 'sql') {
      if (!enabled) {
        return {
          declared: true,
          measured: false,
          label,
          value: null,
          delta: null,
          why: 'NOT_MEASURED — SQL probe skipped; pass --with-output to run it',
        };
      }
      const value = await runSqlProbe(spec.query);
      return settle(value);
    }
  } catch (err) {
    return {
      declared: true,
      measured: false,
      label,
      value: null,
      delta: null,
      why: 'probe failed: ' + err.message.split('\n')[0],
    };
  }
  return { declared: true, measured: false, label, value: null, delta: null, why: 'unknown probe kind' };
}

let sqlHandle = null;
async function runSqlProbe(query) {
  if (!sqlHandle) {
    const { default: postgres } = await import(
      '../services/ingest/node_modules/postgres/src/index.js'
    );
    const url =
      process.env.DATABASE_URL ??
      (readFileSync(join(REPO, '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m) ?? [])[1];
    if (!url) throw new Error('no DATABASE_URL');
    // A monitoring query may never outlive the interval it monitors.
    //
    // The bound is set on the CONNECTION, not with `SET LOCAL`. `SET LOCAL`
    // outside an explicit transaction emits a warning and applies to nothing —
    // measured here on 25 Aug 2026, when the first version of this probe ran
    // past 120 seconds against a database another lane was scanning, with a
    // "20s timeout" that was never in force. A timeout that does not apply is
    // worse than none: it is a bound everyone believes in.
    sqlHandle = postgres(url.trim(), {
      max: 1,
      onnotice: () => {},
      connect_timeout: 10,
      connection: { statement_timeout: '20000' },
    });
  }
  const rows = await sqlHandle.unsafe(query);
  const last = Array.isArray(rows) ? rows[rows.length - 1] : rows;
  const first = Array.isArray(last) ? last[0] : last;
  if (!first) return null;
  const v = Object.values(first)[0];
  return v === null || v === undefined ? null : Number(v);
}

// ───────────────────────────────────────────────────────────────────────────
// identity — pid + creation time + command signature + instance id
// ───────────────────────────────────────────────────────────────────────────

/**
 * WHY THIS REPLACED A ONE-LINE `byPid.get(pid)` LOOKUP
 * ─────────────────────────────────────────────────────
 * On 25 Aug 2026 at 11:04:09.169Z this tool reported NEW1's GPU sidecar as
 * `STARTING`, age 0m, pid 23660 alive. pid 23660 had been dead for days. What
 * it found was a transient shell that Windows had recycled the number into,
 * created — per the tool's own recorded observation — at
 * `2026-08-25T15:04:09.1427650+04:00`, i.e. 25 milliseconds before the sweep
 * that read it, and four days after the registry's `started_at`.
 *
 * The old code could not have caught it. `sameProcess` read
 * `!job.pid_created_at || job.pid_created_at === osProc.Created`, so a registry
 * line with NO recorded creation time — which is most of them, because the
 * schema never required one — short-circuited to TRUE. Absence of the check was
 * scored as the check passing. That is the same inversion as the stale lock file
 * that made "already running" mean "nothing is running", and it is worse here,
 * because the tool's entire purpose is to refuse to infer.
 *
 * So identity is now decided in this order, and the verdict is carried out to
 * the report rather than collapsed into a boolean:
 *
 *   CONFIRMED_BY_CREATION   pid alive AND its creation time equals the recorded one.
 *                           Nothing can forge this; a recycled pid has a later birth.
 *   CONFIRMED_BY_SIGNATURE  pid alive, no creation time on record, but the live
 *                           command line names the same script. Weaker, honest, useful.
 *   PID_RECYCLED            pid alive and it is demonstrably somebody else.
 *   REDISCOVERED            the recorded pid is gone, but exactly one live process
 *                           runs this job's command. The job moved, not died —
 *                           this is what turns the keeper chain from four UNKNOWN
 *                           orphans into one attributed job.
 *   ABSENT                  no live process matches by pid or by signature.
 *   UNVERIFIABLE            the sweep itself failed. Never death.
 */
function identify(job, sweep, live) {
  if (!sweep.ok) {
    return {
      probeFailed: true,
      identity: 'UNVERIFIABLE',
      alive: false,
      pid: job.pid ? Number(job.pid) : null,
      osProc: null,
      name: null,
      createdAt: null,
      instanceId: null,
      sameProcess: false,
    };
  }

  const declaredSig = commandSignature(job.command);
  const declaredPid = job.pid ? Number(job.pid) : null;
  const atPid = declaredPid ? sweep.byPid.get(declaredPid) : undefined;

  const shape = (p, identity) => ({
    probeFailed: false,
    identity,
    alive: identity === 'CONFIRMED_BY_CREATION' || identity === 'CONFIRMED_BY_SIGNATURE'
      || identity === 'REDISCOVERED',
    pid: p ? Number(p.ProcessId) : declaredPid,
    osProc: p ?? null,
    name: p?.Name ?? null,
    createdAt: p?.Created ?? null,
    parentPid: p ? Number(p.ParentProcessId) : null,
    commandLine: p?.CommandLine ?? null,
    instanceId: p ? instanceIdOf(Number(p.ProcessId), p.Created) : null,
    sameProcess: identity === 'CONFIRMED_BY_CREATION',
  });

  if (atPid) {
    if (job.pid_created_at) {
      if (job.pid_created_at === atPid.Created) return shape(atPid, 'CONFIRMED_BY_CREATION');
      return shape(atPid, 'PID_RECYCLED');
    }
    // No creation time on record. The command line is the only evidence left,
    // and it is real evidence — it is what separates NEW1's python sidecar from
    // a shell that inherited its number.
    if (signatureMatches(declaredSig, commandSignature(atPid.CommandLine))) {
      return shape(atPid, 'CONFIRMED_BY_SIGNATURE');
    }
    return shape(atPid, 'PID_RECYCLED');
  }

  // The recorded pid is not there. Before calling it dead, ask whether the job
  // is running under a different pid — a keeper restart, a logon relaunch, a
  // supervise.mjs respawn. A job that moved is not a job that failed.
  /**
   * A RETIRED job does not get to rediscover itself.
   *
   * Rediscovery exists for a job that MOVED — a keeper restart, a logon
   * relaunch. It is the wrong answer for a job whose lane has declared it
   * finished, because the process that matches its signature is almost always
   * its SUCCESSOR under a new job_id, and adopting it prints the retired line as
   * RUNNING_PROGRESSING. Measured 27 Aug 2026: `new2-paragraphs-apply`, retired
   * that morning with a written reason, adopted `lcc-paragraphs-apply`'s wrapper
   * and both rows reported the same live instance. One logical job, two owners,
   * and the retired one wearing a RUNNING state — which is the exact fiction this
   * file exists to refuse.
   */
  if (declaredSig && !TERMINAL.has(String(job.status || '').toUpperCase())) {
    const candidates = live.filter((p) =>
      signatureMatches(declaredSig, commandSignature(p.CommandLine)),
    );
    if (candidates.length === 1) return shape(candidates[0], 'REDISCOVERED');
    if (candidates.length > 1) {
      const newest = candidates
        .slice()
        .sort((a, b) => Date.parse(b.Created || 0) - Date.parse(a.Created || 0))[0];
      const out = shape(newest, 'REDISCOVERED');
      out.duplicates = candidates.map((p) => Number(p.ProcessId));
      return out;
    }
  }

  return shape(null, 'ABSENT');
}

/**
 * A shell that outlived its batch.
 *
 * `cmd /K` keeps the console open after the script it was given returns. The
 * paragraphs launcher uses it, so on 25 Aug 2026 `cmd 20124` sat alive from
 * 12:45:50 onward with its log's final line reading `PAUSED by
 * services/ingest/.checkpoints/STOP -- not starting`. The batch had EXITED. Any
 * check asking "is the cmd alive" scored a dead console as a healthy worker.
 *
 * The mechanical tell is that a shell doing real work has a worker child; a
 * shell whose batch returned has nothing under it but its own conhost. That is
 * what is tested here — never the log text, which is job-specific.
 */
function isEmptyShell(proc, sweep) {
  if (!proc.osProc) return false;
  if (!/^(cmd|powershell|pwsh)\.exe$/i.test(proc.name || '')) return false;
  const pid = Number(proc.pid);
  for (const p of sweep.all) {
    if (Number(p.ParentProcessId) !== pid) continue;
    if (/^conhost\.exe$/i.test(p.Name || '')) continue;
    return false;
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// the state machine
// ───────────────────────────────────────────────────────────────────────────

function classify(job, proc, fp, prev, now, out, sweep, startup) {
  const declared = String(job.status || 'UNKNOWN').toUpperCase();

  if (proc.probeFailed) {
    return { state: 'UNKNOWN', why: 'process sweep failed; absence is not death' };
  }

  if (declared === 'PAUSED') return { state: 'PAUSED', why: 'declared paused by its lane' };

  // A cadence job is not supposed to have a pid. Judging it by one reports
  // LCC's own ten-minute pager as FAILED for nine minutes out of every ten.
  if (job.kind === 'cadence') return classifyCadence(job, prev, now, out, startup);

  if (proc.identity === 'PID_RECYCLED') {
    return {
      state: TERMINAL.has(declared) ? 'STOPPED' : 'FAILED',
      why:
        `pid ${proc.pid} is now a DIFFERENT process (${proc.name}, born ${proc.createdAt}) — ` +
        `recorded start ${job.pid_created_at || 'unrecorded'}, declared command "${String(job.command || '').slice(0, 60)}". ` +
        'Identity refused: a recycled pid is not this job.',
    };
  }

  if (!proc.alive) {
    if (TERMINAL.has(declared)) return { state: 'STOPPED', why: `declared ${declared}` };
    return { state: 'FAILED', why: `declared ${declared} but no process matches by pid or by command signature` };
  }

  // A shell whose batch returned. Alive, and finished — which is a different
  // fact from alive-and-stuck, and the two want opposite responses.
  if (sweep && isEmptyShell(proc, sweep)) {
    return {
      state: 'STOPPED',
      why:
        `console shell alive with no worker child — the batch exited and \`cmd /K\` held the window open. ` +
        'processAlive=true, outputDelta=0, and the honest state is finished, not stalled.',
    };
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
  if (sinceMs > stallMs) {
    return {
      state: 'RUNNING_STALLED',
      why: `alive, but nothing moved for ${Math.round(sinceMs / 60000)}m (window ${Math.round(stallMs / 60000)}m)`,
    };
  }

  // ── The checkpoint moved. That is NOT the same as work being done. ──
  //
  // R7 §4: "Progress = new durable vector/passages + consistent checkpoint/log
  // movement." Both halves. A resumed walk re-reading its skip prefix advances
  // its checkpoint, grows its log and inserts nothing, and that is precisely how
  // NEW1 lost 65 GPU-minutes on 25 Aug with `outputDelta` exactly 0.
  //
  // So when a job declares an output probe, the probe decides. When it does not,
  // the state is still RUNNING_PROGRESSING but the reason says which evidence it
  // rests on, because "checkpoint moved" is a weaker claim than "rows appeared"
  // and the report should not let the two look alike.
  if (out && out.measured) {
    if (out.delta === null) {
      return {
        state: 'RUNNING_PROGRESSING',
        why: `checkpoint moved ${Math.round(sinceMs / 60000)}m ago; output ${out.label}=${out.value}, first reading — no prior value to difference`,
      };
    }
    if (out.delta > 0) {
      return {
        state: 'RUNNING_PROGRESSING',
        why: `durable output moved: ${out.label} +${out.delta} (now ${out.value})`,
      };
    }
    const replayMs = now - (out.lastOutputAt ?? lastProgressAt);
    if (replayMs > REPLAY_WINDOW_MS) {
      return {
        state: 'RUNNING_REPLAYING',
        why:
          `checkpoint and log are moving but ${out.label} has not changed in ${Math.round(replayMs / 60000)}m ` +
          `(still ${out.value}). Alive, resident, advancing — and producing nothing. ` +
          'A bounded replay is legitimate; past the window it must be declared, not inferred.',
      };
    }
    return {
      state: 'RUNNING_REPLAYING',
      why: `output flat at ${out.value} for ${Math.round(replayMs / 60000)}m — inside the ${Math.round(REPLAY_WINDOW_MS / 60000)}m replay window, not yet a stall`,
    };
  }

  return {
    state: 'RUNNING_PROGRESSING',
    why: `checkpoint moved ${Math.round(sinceMs / 60000)}m ago — no output probe declared, so this rests on checkpoint motion alone`,
  };
}

/**
 * A tick job's health, which has nothing to do with a process table.
 *
 * Three independent facts, and R7 §4 wants all three kept apart rather than
 * collapsed into "the poller is fine":
 *
 *   DID IT FIRE          the scheduler's own LastRunTime, inside cadence x tolerance
 *   DID IT SUCCEED       the scheduler's LastTaskResult
 *   DID IT DO ANYTHING   receipts appended since the last observation
 *
 * The middle one is the trap. A task can report `rc=0` having exited early on a
 * missing environment variable, and "Task Scheduler fired" is on this file's own
 * list of sentences that are not proof of work. So a fired-and-rc-0 tick with no
 * receipt movement is reported as firing-but-not-producing, not as healthy.
 */
function classifyCadence(job, prev, now, out, startup) {
  const task = (startup || []).find(
    (s) => s.kind === 'SCHEDULED_TASK' && s.name === job.scheduler_task,
  );

  if (!task) {
    return {
      state: 'FAILED',
      why: `declares scheduled task "${job.scheduler_task}" and no such task is registered — nothing will ever fire it`,
    };
  }
  if (/disabled/i.test(task.state || '')) {
    return { state: 'STOPPED', why: `scheduled task "${task.name}" is Disabled` };
  }

  const lastRun = task.lastRun ? Date.parse(task.lastRun) : NaN;
  const toleranceMs = (job.cadence_seconds ?? 600) * (job.cadence_tolerance ?? 2) * 1000;

  if (Number.isNaN(lastRun)) {
    return { state: 'UNKNOWN', why: `scheduled task "${task.name}" reports no last-run time` };
  }

  const sinceRun = now - lastRun;
  if (sinceRun > toleranceMs) {
    return {
      state: 'RUNNING_STALLED',
      why:
        `scheduled task "${task.name}" last fired ${Math.round(sinceRun / 60000)}m ago, ` +
        `cadence ${Math.round((job.cadence_seconds ?? 600) / 60)}m x tolerance ${job.cadence_tolerance ?? 2}` +
        (task.boots === false ? ' — and its principal is Interactive, so a locked machine fires it never' : ''),
    };
  }

  const rc = String(task.result ?? '');
  if (rc && rc !== '0' && rc !== '267009') {
    return {
      state: 'FAILED',
      why: `scheduled task "${task.name}" fired ${Math.round(sinceRun / 60000)}m ago and returned rc=${rc}`,
    };
  }

  if (out && out.measured) {
    if (out.delta === null) {
      return {
        state: 'RUNNING_PROGRESSING',
        why: `tick ${Math.round(sinceRun / 60000)}m ago, rc=0, ${out.label}=${out.value} — first reading, no delta yet`,
      };
    }
    if (out.delta > 0) {
      return {
        state: 'RUNNING_PROGRESSING',
        why: `tick ${Math.round(sinceRun / 60000)}m ago, rc=0, ${out.label} +${out.delta}`,
      };
    }
    // Ticking and writing nothing is the NORMAL case for a pager: no condition
    // fired, or every condition was inside its cooldown. It is only worth a word
    // when it has been true long enough that "the pager works" is untested.
    const quietMs = now - (out.lastOutputAt ?? lastRun);
    return {
      state: 'RUNNING_PROGRESSING',
      why:
        `tick ${Math.round(sinceRun / 60000)}m ago, rc=0, ${out.label} unchanged at ${out.value} ` +
        `for ${Math.round(quietMs / 60000)}m — evaluated and had nothing to deliver, or everything was inside cooldown`,
    };
  }

  return {
    state: 'RUNNING_PROGRESSING',
    why: `tick ${Math.round(sinceRun / 60000)}m ago, rc=0 — receipts NOT read, so this is "it fired", not "it worked"`,
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

  // ── Windows services ───────────────────────────────────────────────────
  //
  // Added 25 Aug 2026, and the omission it fixes was actively misleading rather
  // than merely incomplete. This inventory listed exactly one Postgres entry:
  // the scheduled task `LawMindPostgres`, State `Disabled`, last run 18 Aug. Read
  // literally, the control plane said the database has no working startup
  // mechanism. The truth is the opposite — Postgres runs as a Windows SERVICE,
  // `StartMode=Auto`, `LocalSystem`, and it came up 13 seconds after the 25 Aug
  // boot with nobody logged in. The disabled task is a fossil of how it used to
  // be started.
  //
  // This is the one component on the box that genuinely survives a reboot
  // unattended, and it was the one the dashboard could not see.
  const svc =
    "Get-CimInstance Win32_Service | Where-Object { $_.Name -match 'lawmind|postgres' } | ForEach-Object { ($_.Name + '|' + $_.State + '|' + $_.StartMode + '|' + $_.StartName) }";
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', svc], {
      encoding: 'utf8',
      timeout: 40000,
    }).trim();
    for (const line of out.split('\n')) {
      const [name, state, startMode, account] = line.trim().split('|');
      if (!name) continue;
      found.push({
        kind: 'WINDOWS_SERVICE',
        name,
        state,
        startMode,
        boots: /auto/i.test(startMode || ''),
        note: /auto/i.test(startMode || '')
          ? `starts at BOOT as ${account} — recovers with nobody logged in`
          : `StartMode ${startMode} — does NOT come back on its own`,
      });
    }
  } catch (err) {
    found.push({ kind: 'WINDOWS_SERVICE', name: '(query failed)', state: err.message.split('\n')[0] });
  }

  // ── Scheduled tasks ────────────────────────────────────────────────────
  //
  // LogonType is carried because it is the whole answer to "does this recover
  // unattended". A task with a time trigger LOOKS like a boot mechanism; if its
  // principal is `Interactive` it does not fire until somebody logs in, and R7
  // §4 forbids calling that unattended recovery.
  const fmt =
    "Get-ScheduledTask | Where-Object { $_.TaskName -match 'awmind' } | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; ($_.TaskName + '|' + $_.State + '|' + $i.LastRunTime + '|' + $i.LastTaskResult + '|' + $_.Principal.LogonType) }";
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', fmt], {
      encoding: 'utf8',
      timeout: 40000,
    }).trim();
    for (const line of out.split('\n')) {
      const [name, state, lastRun, result, logonType] = line.trim().split('|');
      if (!name) continue;
      found.push({
        kind: 'SCHEDULED_TASK',
        name,
        state,
        lastRun,
        result,
        logonType,
        boots: !/interactive/i.test(logonType || ''),
        note: /interactive/i.test(logonType || '')
          ? 'LogonType Interactive — fires only after a human logs in, NOT at boot'
          : null,
      });
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
          boots: false,
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

/**
 * `RUNNING_REPLAYING` is in this set on purpose. It is not an error state — a
 * resumed walk legitimately replays — but it is the state that has cost this
 * project the most time while looking healthy, and the whole point of naming it
 * is that somebody sees it.
 */
const ATTENTION = new Set(['FAILED', 'RUNNING_STALLED', 'RUNNING_REPLAYING', 'UNKNOWN']);

/**
 * R7 §8 LCC-P0 item 6: "add alert condition for critical process alive/GPU busy
 * with zero output beyond justified window".
 *
 * Kept separate from the state machine because it answers a different question.
 * The state machine asks *what is this job doing*; this asks *is it worth waking
 * someone*. A non-critical job replaying for an hour is a note. A critical job
 * holding a GPU and producing nothing for an hour is the 65 minutes NEW1 lost.
 */
function pageable(r) {
  if (!r.critical) return null;
  if (r.state === 'FAILED') {
    return { severity: 'PAGE', reason: `critical job ${r.job_id} declared RUNNING and is not there — ${r.why}` };
  }
  if (r.state === 'RUNNING_STALLED') {
    return { severity: 'PAGE', reason: `critical job ${r.job_id} is alive and nothing has moved — ${r.why}` };
  }
  if (r.state === 'RUNNING_REPLAYING' && r.output_delta === 0) {
    const heavy = r.resource_class === 'GPU_EMBED' || r.resource_class === 'VECTOR_BUILD';
    return {
      severity: heavy ? 'PAGE' : 'WARN',
      reason:
        `critical job ${r.job_id} is alive${heavy ? ' and holding the GPU' : ''} with ${r.output_label} delta 0 — ${r.why}`,
    };
  }
  if (r.output_state === 'NOT_MEASURED' && r.state.startsWith('RUNNING')) {
    return {
      severity: 'WARN',
      reason: `critical job ${r.job_id} reports RUNNING but its output was NOT MEASURED — run with --with-output before believing it`,
    };
  }
  return null;
}

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

/**
 * The columns R7 §8 LCC-P0 names, in its order:
 *   JOB | OWNER | INSTANCE | PID | STATE | HEARTBEAT | LAST OUTPUT | OUTPUT DELTA
 *       | CHECKPOINT | STARTUP | RESTARTS | RESOURCE
 *
 * OUTPUT DELTA is deliberately adjacent to STATE, because the pair is the whole
 * argument: `RUNNING_*` next to a delta of `0` is the shape that cost NEW1 65
 * GPU-minutes, and it should be readable in one glance rather than derived.
 * `n/m` means the job declares no output probe; `?` means one is declared and
 * was not measured on this run. Neither is ever printed as a zero.
 */
function outputCell(r) {
  if (r.output_state === 'NOT_DECLARED') return 'n/m';
  if (r.output_state === 'NOT_MEASURED') return '?';
  if (r.output_delta === null) return 'first';
  return (r.output_delta > 0 ? '+' : '') + r.output_delta;
}

function table(rows) {
  const cols = [
    ['JOB', 26, (r) => r.job_id],
    ['OWNER', 5, (r) => r.owner_lane],
    ['INSTANCE', 20, (r) => r.instance ?? '-'],
    ['PID', 6, (r) => r.pid ?? '-'],
    ['STATE', 20, (r) => r.state],
    ['HEARTBT', 7, (r) => r.heartbeat],
    ['LASTOUT', 8, (r) => (r.output_value === null ? '-' : String(r.output_value))],
    ['ODELTA', 7, outputCell],
    ['CHECKPOINT', 26, (r) => r.checkpoint ?? '-'],
    ['STARTUP', 15, (r) => r.startup],
    ['RS', 2, (r) => r.restarts ?? '-'],
    ['RESOURCE', 11, (r) => r.resource_class],
  ];
  const head = cols.map(([name, w]) => pad(name, w)).join(' ');
  const lines = [head, '-'.repeat(head.length)];
  for (const r of rows) {
    lines.push(cols.map(([, w, get]) => pad(get(r), w)).join(' '));
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
  const withOutput = argv.includes('--with-output');
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { jobs, malformed } = readRegistry();
  const prevObs = readObservations();
  const sweep = sweepProcesses();
  const live = lawmindProcesses(sweep);
  // Hoisted above the job loop: a cadence job's liveness IS its scheduler row.
  const startup = startupMechanisms();

  const rows = [];
  const observations = [];
  const claimedPids = new Set();

  for (const job of jobs.values()) {
    const proc = identify(job, sweep, live);
    const pid = proc.pid;
    const osProc = proc.osProc;
    if (proc.pid) claimedPids.add(proc.pid);

    const fp = fingerprint(job);
    const prev = prevObs.get(job.job_id);
    const out = await outputProbe(job, prev, now, withOutput);
    const verdict = classify(job, proc, fp, prev, now, out, sweep, startup);
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
      instance: proc.instanceId ?? (job.instance_id ?? null),
      identity: proc.identity,
      duplicates: proc.duplicates ?? null,
      state: verdict.state,
      declared: job.status,
      heartbeat: declaredProgressAt ? ago(now - declaredProgressAt) : '-',
      progress: lastProgressAt ? ago(now - lastProgressAt) : '-',
      output_label: out.label,
      output_value: out.measured ? out.value : null,
      output_delta: out.measured ? out.delta : null,
      output_state: out.declared ? (out.measured ? 'MEASURED' : 'NOT_MEASURED') : 'NOT_DECLARED',
      output_why: out.why ?? null,
      last_output_change_at: out.lastOutputAt ? new Date(out.lastOutputAt).toISOString() : null,
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
      identity: proc.identity,
      instance_id: proc.instanceId ?? null,
      fingerprint: fp.value,
      log_bytes: fp.logBytes,
      last_progress_at: lastProgressAt
        ? new Date(lastProgressAt).toISOString()
        : (prev?.last_progress_at ?? null),
      // Carried forward when unmeasured, NOT reset to null: a run without
      // --with-output must not erase the last real reading, or the next run
      // computes its delta against nothing and calls a frozen job healthy.
      output_label: out.label ?? prev?.output_label ?? null,
      output_value: out.measured ? out.value : (prev?.output_value ?? null),
      output_delta: out.measured ? out.delta : null,
      last_output_change_at: out.lastOutputAt
        ? new Date(out.lastOutputAt).toISOString()
        : (prev?.last_output_change_at ?? null),
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
      // ...and neither is an ANCESTOR of one. The keeper is launched as
      // `cmd -> node sidecar-keeper.mjs -> python server.py`. Rediscovery
      // attributes the node and the python to their jobs, and the wrapper `cmd`
      // was then reported as an unregistered orphan — the launcher of a job we
      // had just identified, listed as a process nobody declared. Walking down
      // as well as up costs one bounded pass and removes a permanent false
      // positive that would have trained everyone to ignore this list.
      const kin = new Set([Number(p.ProcessId)]);
      for (let pass = 0; pass < 6; pass += 1) {
        let added = 0;
        for (const q of sweep.all) {
          const qp = Number(q.ProcessId);
          if (kin.has(qp)) continue;
          if (kin.has(Number(q.ParentProcessId))) {
            if (claimedPids.has(qp)) return false;
            kin.add(qp);
            added += 1;
          }
        }
        if (!added) break;
      }
      return true;
    })
    .map((p) => {
      const pid = Number(p.ProcessId);
      const proc = {
        pid,
        name: p.Name,
        osProc: p,
        alive: true,
        identity: 'UNREGISTERED',
        createdAt: p.Created,
      };
      // A console shell that outlived its batch is not an orphan worker, and
      // calling it one buries the real orphans. Say which it is.
      const shell = isEmptyShell(proc, sweep);
      return {
        job_id: '(unregistered)',
        owner_lane: '?',
        pid,
        instance: instanceIdOf(pid, p.Created),
        identity: 'UNREGISTERED',
        age: p.Created ? ago(now - Date.parse(p.Created)) : '-',
        state: shell ? 'STOPPED' : 'UNKNOWN',
        heartbeat: '-',
        progress: '-',
        output_value: null,
        output_delta: null,
        output_state: 'NOT_DECLARED',
        checkpoint: null,
        metric: 'no registry record — nobody declared this',
        startup: `ppid ${p.ParentProcessId}`,
        restarts: null,
        resource_class: null,
        critical: false,
        command: (p.CommandLine || '').slice(0, 220),
        why: shell
          ? 'console shell with no worker child — its batch exited and `cmd /K` held the window open. Alive, and finished.'
          : 'live LawMind process with no job_id; owner unknown, NOT adjudicated',
        parent: Number(p.ParentProcessId),
      };
    });

  const all = [...rows, ...orphans];
  const attention = all.filter((r) => ATTENTION.has(r.state));
  const pages = rows.map((r) => pageable(r)).filter(Boolean);

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
    if (pages.length) {
      console.log(`PAGEABLE (${pages.length}):`);
      for (const p of pages) console.log(`  ${p.severity.padEnd(5)} ${p.reason}`);
      console.log('');
    }
    console.log('STARTUP MECHANISMS:');
    for (const s of startup) {
      const when = s.boots === true ? 'BOOT ' : s.boots === false ? 'LOGON' : '  ?  ';
      const tail = s.lastRun ? `last ${s.lastRun} rc=${s.result}` : (s.note ?? '');
      console.log(
        `  ${when} ${s.kind.padEnd(16)} ${String(s.name).padEnd(44)} ${String(s.state ?? '').padEnd(9)} ${tail}`,
      );
    }
    // The one line that answers "does this box come back on its own".
    const bootable = startup.filter((s) => s.boots === true && !/disabled/i.test(s.state || ''));
    const logon = startup.filter((s) => s.boots === false && !/disabled/i.test(s.state || ''));
    console.log('');
    console.log(
      `  UNATTENDED RECOVERY: ${bootable.length} mechanism(s) start at BOOT, ${logon.length} need an interactive LOGON.` +
        (logon.length
          ? ' A rebooted machine sitting at the lock screen runs only the first group.'
          : ''),
    );
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
