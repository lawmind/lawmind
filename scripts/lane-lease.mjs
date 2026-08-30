#!/usr/bin/env node
/**
 * LANE LEASE — exactly one active owner per lane.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `.agents/bus/.lane-<sessionId>` is a BINDING, not a LEASE: it records which
 * lane a session thinks it is, and nothing stops two sessions writing `LCC`
 * into two different files. That is exactly what happened — a duplicated LCC
 * session, recorded in the master orchestration plan §4 as a process defect.
 *
 * A lease is the missing half: ONE file per lane, holding the owner's identity
 * and a heartbeat, which a second binder must read and refuse.
 *
 * ONE FILE PER LANE, never one shared registry. Five lanes share one worktree;
 * a single registry file is a lost-update race and every lane's rewrite drops
 * another lane's line. `.agents/jobs/registry.jsonl` solves the same problem by
 * being append-only. Here, only the lane's own owner ever writes its own file,
 * so there is no shared writer at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES AN OWNER "HEALTHY"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two independent signals, and BOTH must fail before a takeover is allowed:
 *
 *   1. the recorded pid is still alive AND still the same process (start time
 *      is compared, because pids are recycled), and
 *   2. the heartbeat is younger than STALE_AFTER_MS.
 *
 * A live process with a cold heartbeat is a HUNG owner, not a dead one, and
 * `.agents/logs` records what that costs: a keeper logged "relaunch issued" 51
 * times over 4h20m while the walk was dead, because the check was liveness
 * rather than progress. So a hung owner refuses a takeover by default and needs
 * `--force`, which writes the reason into the superseded record.
 *
 * A dead process with a warm heartbeat is a crashed owner — the common case,
 * since an agent session that is killed never gets to release. That one is
 * recoverable without `--force`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMANDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   acquire <LANE> --session <id> [--task "..."] [--force] [--reason "..."]
 *   heartbeat <LANE> --session <id> [--task "..."] [--progress "..."]
 *   status [LANE]
 *   release <LANE> --session <id>
 *
 * Exit codes: 0 = held by you. 1 = refused (someone else holds it). 2 = usage.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STALE_AFTER_MS, findSessionPid, health } from './lib/process-identity.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEASE_DIR = join(ROOT, '.agents', 'bus', 'leases');
const LANES = ['LCC', 'RCC', 'NEW1', 'NEW2', 'NEW3', 'FIFTH'];

/** A heartbeat older than this is cold. An agent turn can legitimately run for
 *  a long time, so this is generous — it is a staleness floor, not a liveness
 *  check. Liveness is the process table's job. */

const leasePath = (lane) => join(LEASE_DIR, `${lane}.json`);

function readLease(lane) {
  const p = leasePath(lane);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeLease(lane, record) {
  mkdirSync(LEASE_DIR, { recursive: true });
  writeFileSync(leasePath(lane), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

const fmtAge = (ms) => `${Math.round(ms / 60000)}m`;

function describe(lane, lease, h) {
  if (!lease) return `${lane}: FREE`;
  return [
    // CONTESTED is printed on the headline, not buried three lines down. A flat
    // `NEW1: DEAD` beside a GPU at 99% is the exact reading that cost 341
    // minutes on 29-30 Aug 2026, and a reader who stops at the first line must
    // not be misled by it.
    `${lane}: ${h.state}${h.contested === true ? ' (CONTESTED — durable output is still moving)' : ''}${lease.state === 'RELEASED' ? ' (released)' : ''}`,
    `  session   ${lease.sessionId}`,
    `  pid       ${lease.pid} (${h.proc?.alive === true ? h.proc.name : (h.proc?.reason ?? 'unknown')})`,
    `  host      ${lease.host}`,
    `  acquired  ${lease.acquiredAt}`,
    `  heartbeat ${lease.heartbeatAt}  (${fmtAge(h.age ?? 0)} ago)`,
    `  task      ${lease.task ?? '-'}`,
    `  progress  ${lease.progress ?? '-'}`,
    ...(h.contested === true || h.state === 'HEALTHY_BY_PROGRESS'
      ? [
          `  output    ${lease.previousOutput ?? '-'} -> ${lease.currentOutput ?? '-'}  @ ${lease.lastProgressAt ?? '-'}`,
          `  note      ${h.note ?? '-'}`,
        ]
      : []),
  ].join('\n');
}

function arg(name, argv) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const lane = rest[0] && LANES.includes(rest[0].toUpperCase()) ? rest[0].toUpperCase() : undefined;
  const sessionId = arg('session', rest);
  const task = arg('task', rest);
  const progress = arg('progress', rest);
  const force = rest.includes('--force');
  const reason = arg('reason', rest);

  if (cmd === 'status') {
    for (const l of lane ? [lane] : LANES) {
      const lease = readLease(l);
      console.log(describe(l, lease, health(lease)));
      console.log('');
    }
    return 0;
  }

  if (!cmd || !lane || !sessionId) {
    console.error(
      'usage: lane-lease.mjs <acquire|heartbeat|release|status> <LANE> --session <id> [--task "..."] [--force --reason "..."]',
    );
    console.error('       acquire   [--liveness durable-progress] [--durable-metric "SQL or file"]');
    console.error('       heartbeat [--current-output <n>]   (advances lastProgressAt only when the value MOVED)');
    return 2;
  }

  const lease = readLease(lane);
  const h = health(lease);
  const mine = lease && lease.sessionId === sessionId;

  if (cmd === 'release') {
    if (!lease) {
      console.log(`${lane}: already FREE`);
      return 0;
    }
    if (!mine && !force) {
      console.error(`REFUSED — ${lane} is held by ${lease.sessionId}, not by you.`);
      return 1;
    }
    writeLease(lane, { ...lease, releasedAt: new Date().toISOString(), state: 'RELEASED' });
    console.log(`${lane}: released by ${sessionId}`);
    return 0;
  }

  if (cmd === 'heartbeat') {
    if (!lease || !mine) {
      console.error(`REFUSED — you do not hold ${lane}.`);
      console.error(describe(lane, lease, h));
      return 1;
    }
    /**
     * `--current-output` is what makes `--liveness durable-progress` mean
     * something. `lastProgressAt` moves ONLY when the durable metric actually
     * moved, never merely because someone called heartbeat — so a lane whose
     * worker has stopped still decays to DEAD inside one window, which is the
     * half of the invariant that keeps the signal honest.
     */
    const currentOutput = arg('current-output', rest);
    const moved = currentOutput != null && currentOutput !== lease.currentOutput;
    writeLease(lane, {
      ...lease,
      heartbeatAt: new Date().toISOString(),
      task: task ?? lease.task,
      progress: progress ?? lease.progress,
      ...(currentOutput == null
        ? {}
        : {
            previousOutput: lease.currentOutput ?? null,
            currentOutput,
            lastProgressAt: moved ? new Date().toISOString() : (lease.lastProgressAt ?? null),
          }),
    });
    console.log(
      `${lane}: heartbeat ok (${sessionId})` +
        (currentOutput == null ? '' : ` output ${currentOutput}${moved ? ' (moved)' : ' (flat)'}`),
    );
    return 0;
  }

  if (cmd !== 'acquire') {
    console.error(`unknown command: ${cmd}`);
    return 2;
  }

  // ── acquire ────────────────────────────────────────────────────────────────
  const released = lease?.state === 'RELEASED';

  if (lease && !mine && !released) {
    const blocking =
      h.state === 'HEALTHY' ||
      h.state === 'UNKNOWN' || // a failed probe is not evidence of death
      (h.state === 'HUNG' && !force) ||
      /**
       * CONTESTED: the session pid is gone and the lease's own durable output
       * moved anyway. That is a live logical worker with a dead launcher, which
       * is the NORMAL shape of a scheduled task, and taking the lane over on the
       * strength of the pid alone is how a second heavy job lands on one GPU.
       *
       * `--force` still works, and it records the health and the reason in
       * `supersededOwner`, so a takeover over a live worker is a decision
       * somebody signed rather than one the tool made quietly.
       */
      (h.contested === true && !force);
    if (blocking) {
      console.error(`REFUSED — ${lane} already has an owner. Do not run a second ${lane} session.`);
      console.error(describe(lane, lease, h));
      if (h.state === 'HUNG') {
        console.error('\n  The owner process is ALIVE but its heartbeat is cold. That is a HUNG');
        console.error('  owner, not a dead one. Confirm the process is abandoned, then re-run');
        console.error('  with --force --reason "<what you verified>".');
      }
      if (h.state === 'UNKNOWN') {
        console.error(`\n  Could not probe the owner process (${h.note}). A failed probe is not`);
        console.error('  evidence of death — resolve the probe before taking over.');
      }
      if (h.contested === true) {
        console.error('\n  The session that opened this lease is gone, but THE WORK IT LAUNCHED IS');
        console.error('  NOT. This lease records its own durable output, and that output moved');
        console.error(`  recently: ${h.note}`);
        console.error('\n  A scheduled task outliving its launcher is the normal shape, not a fault.');
        console.error('  Verify by the OUTPUT, never by the pid. If the worker really has stopped,');
        console.error('  re-run with --force --reason "<the metric you checked, and what it read>".');
      }
      return 1;
    }
  }

  const self = findSessionPid();
  const now = new Date().toISOString();
  const record = {
    lane,
    sessionId,
    pid: self?.unresolved ? null : (self?.pid ?? null),
    pidName: self?.name ?? null,
    pidCreatedAt: self?.createdAt ?? null,
    host: hostname(),
    acquiredAt: mine && lease ? lease.acquiredAt : now,
    heartbeatAt: now,
    task: task ?? null,
    progress: progress ?? null,
    state: 'HELD',
    /**
     * A LANE LEASE MAY OUTLIVE ITS SESSION — 30 Aug 2026.
     *
     * For most lanes the recorded session pid is the right witness: the question
     * is literally "is that agent still running". NEW1 is different, and the bus
     * has already been wrong about it. The coarse walk is a Windows scheduled
     * task precisely so it survives the session that launched it, and on
     * 29-30 Aug the NEW1 session ended while the walk kept producing ~31,000
     * vectors an hour — for 341 minutes `lane-lease status` reported
     *
     *     NEW1: DEAD
     *
     * while the GPU sat at 99% and the batch cursor moved 236 -> 241. HEAVY_BOX
     * had already been given `livenessSource: 'durable-progress'` for exactly
     * this and read correctly the whole time; the lane lease had not, so the two
     * halves of the same truth disagreed.
     *
     * Opt-in per record, and `health()` only ever lets it move a verdict TOWARDS
     * alive, so no lane that omits it changes behaviour.
     */
    durableOutputMetric: arg('durable-metric', rest) ?? lease?.durableOutputMetric ?? null,
    livenessSource: arg('liveness', rest) ?? (mine ? (lease?.livenessSource ?? null) : null),
    currentOutput: mine ? (lease?.currentOutput ?? null) : null,
    lastProgressAt: mine ? (lease?.lastProgressAt ?? null) : null,
    supersededOwner:
      lease && !mine
        ? {
            sessionId: lease.sessionId,
            pid: lease.pid,
            health: h.state,
            heartbeatAt: lease.heartbeatAt,
            takeoverReason: reason ?? null,
          }
        : undefined,
  };
  writeLease(lane, record);
  console.log(`${lane}: ACQUIRED by ${sessionId} (pid ${record.pid ?? 'unknown'})`);
  if (record.supersededOwner) {
    console.log(`  took over from ${lease.sessionId} — prior owner ${h.state}`);
  }
  return 0;
}

process.exit(main());
