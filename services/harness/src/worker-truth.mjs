#!/usr/bin/env node
/**
 * NEW1 — WHAT THE BUS SAYS ABOUT THE BOX MUST BE WHAT THE BOX IS DOING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS EXISTS TO END
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `HEAVY_BOX` and the `NEW1` lane lease record the pid of the AGENT SESSION that
 * acquired them. The coarse GPU walk does not run inside that session — it is a
 * Windows scheduled task, deliberately, so it survives the session dying, and it
 * has. On 29 Aug 2026 the NEW1 session died at 06:12Z; the walk kept running and
 * kept producing about 28,000 vectors an hour; and for the next eleven hours
 * `resource-lease status HEAVY_BOX` told every other lane
 *
 *     HEAVY_BOX: HELD  (process DEAD)
 *
 * while the box was in fact fully occupied. A lane that believed it would have
 * force-cleared the lock and put a second heavy job onto one 8 GB GPU. The lease
 * was not lying about the pid — it was answering the wrong question.
 *
 * So the lease stops being heartbeated by the agent and starts being heartbeated
 * by THIS, from a scheduled task on the same 5-minute trigger as the walk's own
 * keeper. It writes a heartbeat only when the worker is provably alive, which
 * makes the other half of the invariant hold too: when the walk stops, nothing
 * refreshes `lastProgressAt`, and the lease decays to DEAD on its own inside one
 * window. Nobody has to remember to release it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE WITNESSES, AND WHY NOT ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. THE SINGLE-WRITER LOCK — `.agents/logs/new1-gpu-embed.lock` names the pid
 *      currently holding the GPU and the batch file it is on. `process.kill(pid, 0)`
 *      answers whether that pid exists. This is the only witness that identifies
 *      the WRITER rather than the work.
 *
 *   2. THE RUNNER LOG — its last line and its mtime. A hung worker keeps its lock
 *      and its pid forever; this repo has already recorded a postgres.js promise
 *      that never settled and looked perfect the whole time. A log that has not
 *      moved in twenty minutes is the cheapest way to see that.
 *
 *   3. THE DURABLE METRIC — `count(*) FROM new1_doc_vector_stage`. Rows are the
 *      only thing that cannot be faked by a process that is merely running. §3 of
 *      the orchestration lock: GPU %, pid and log heartbeat are secondary signals.
 *
 * A worker is ALIVE only if the lock holder is alive AND either the log or the row
 * count moved since the last sample. Two of three is not enough when the one that
 * abstains is the durable one, so the metric is required in every verdict.
 *
 * Run: node services/harness/src/worker-truth.mjs
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../../', import.meta.url);
const p = (rel) => new URL(rel, ROOT).pathname.replace(/^\//, '');

const GPU_LOCK = p('.agents/logs/new1-gpu-embed.lock');
const RUNNER_LOG = p('docs/ai/new1-tier-a/stage-runner.log');
const OUT = p('docs/ai/new1-r10/worker-truth.json');
const LEASE = p('scripts/resource-lease.mjs');

/** A log or a row count that has not moved in this long is not progress. */
const QUIET_MS = Number(process.env.WORKER_QUIET_MS ?? 20 * 60 * 1000);

const url = readFileSync(p('.env'), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const prev = readJson(OUT, null);
const at = new Date().toISOString();

const lock = readJson(GPU_LOCK, null);
const writerAlive = pidAlive(lock?.pid);

let logMtime = null;
let logTail = null;
if (existsSync(RUNNER_LOG)) {
  const st = statSync(RUNNER_LOG);
  logMtime = st.mtime.toISOString();
  const fsmod = await import('node:fs');
  const want = Math.min(st.size, 65536);
  const buf = Buffer.alloc(want);
  const fd = fsmod.openSync(RUNNER_LOG, 'r');
  fsmod.readSync(fd, buf, 0, want, st.size - want);
  fsmod.closeSync(fd);
  const lines = buf.toString('utf8').split(/\r?\n/).filter(Boolean);
  logTail = lines[lines.length - 1] ?? null;
}

const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: '120000' } });
let rows = null;
let dbError = null;
try {
  const [r] = await sql`SELECT count(*)::bigint n FROM new1_doc_vector_stage`;
  rows = Number(r.n);
} catch (e) {
  dbError = String(e?.message ?? e);
} finally {
  await sql.end({ timeout: 5 });
}

const logMoved = prev?.runnerLog?.mtime ? logMtime !== prev.runnerLog.mtime : true;
const rowsMoved = prev?.rows != null && rows != null ? rows > prev.rows : rows != null;
const logAgeMs = logMtime ? Date.now() - Date.parse(logMtime) : null;

/**
 * The verdict, and the ONE thing it may not do: report alive on an unanswered
 * question. A database that cannot be reached is UNKNOWN, never STOPPED — the
 * walk does not stop because the reporter lost its connection, and a lease that
 * decays on a failed probe is how a live job loses its box.
 */
let verdict;
let why;
if (dbError) {
  verdict = 'UNKNOWN';
  why = 'the durable metric could not be read: ' + dbError.slice(0, 200);
} else if (!writerAlive) {
  verdict = 'STOPPED';
  why = lock
    ? 'the GPU lock names pid ' + lock.pid + ', which is not in the process table'
    : 'there is no GPU lock file — no embedder holds the card';
} else if (!rowsMoved && !logMoved && logAgeMs != null && logAgeMs > QUIET_MS) {
  verdict = 'HUNG';
  why =
    'the lock holder pid ' + lock.pid + ' is alive but neither the row count nor the runner log has moved, ' +
    'and the log is ' + Math.round(logAgeMs / 60000) + 'm old';
} else {
  verdict = 'ALIVE';
  why =
    'GPU lock held by live pid ' + lock.pid + '; ' +
    (rowsMoved ? 'row count advanced' : 'row count flat this window') + '; ' +
    (logMoved ? 'runner log advanced' : 'runner log flat this window');
}

const truth = {
  kind: 'new1_worker_truth',
  at,
  verdict,
  why,
  writer: { pid: lock?.pid ?? null, alive: writerAlive, batchFile: lock?.batchFile ?? null, since: lock?.at ?? null },
  runnerLog: { mtime: logMtime, ageMinutes: logAgeMs == null ? null : Math.round(logAgeMs / 60000), lastLine: logTail },
  rows,
  previousRows: prev?.rows ?? null,
  rowsDelta: rows != null && prev?.rows != null ? rows - prev.rows : null,
  previousAt: prev?.at ?? null,
  dbError,
  heartbeat: null,
};

/**
 * Heartbeat ONLY on ALIVE. Not on HUNG, and not on UNKNOWN.
 *
 * A hung worker holding the box is a real problem and the lease decaying is how
 * anyone finds out; refreshing it would hide exactly the failure that made this
 * file necessary. UNKNOWN abstains for the opposite reason — it is not evidence
 * of anything, in either direction.
 */
if (verdict === 'ALIVE' && rows != null) {
  try {
    const out = execFileSync(process.execPath, [LEASE, 'heartbeat', 'HEAVY_BOX', '--current-output', String(rows)], {
      encoding: 'utf8',
      env: { ...process.env, LAWMIND_LANE: 'NEW1' },
      timeout: 120000,
    });
    truth.heartbeat = { ok: true, said: out.trim().split(/\r?\n/)[0] };
  } catch (e) {
    truth.heartbeat = { ok: false, said: String(e?.stdout ?? e?.message ?? e).trim().split(/\r?\n/).slice(0, 2).join(' | ') };
  }
} else {
  truth.heartbeat = { ok: false, said: 'not heartbeated: verdict is ' + verdict };
}

writeFileSync(OUT, JSON.stringify(truth, null, 2) + '\n');
console.log(at + '  ' + verdict + '  rows ' + rows + ' (' + (truth.rowsDelta ?? '?') + ')  ' + why);
if (truth.heartbeat) console.log('  heartbeat: ' + truth.heartbeat.said);
process.exitCode = verdict === 'ALIVE' ? 0 : verdict === 'UNKNOWN' ? 0 : 3;
