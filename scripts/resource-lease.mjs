#!/usr/bin/env node
/**
 * RESOURCE LEASES — `HEAVY_BOX`, `GIT_COMMIT`, `MIGRATION_SLOT`, `DB_MIGRATION`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AND WHY IT IS NOT `lane-lease.mjs`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `lane-lease.mjs` answers "who is LCC right now". This answers a different
 * question: "who currently holds the ONE box / the ONE commit sequence / the
 * ONE migration ordinal". A lane lease is an identity and several can be held
 * at once. A resource lease is a MUTEX and, by definition, cannot.
 *
 * Until 25 Aug 2026 the resource leases were hand-written JSON. Hand-written
 * JSON is not a mutex: read-then-write has a window in the middle, and two
 * lanes that both read "free" both write "mine" and both believe they won. The
 * orchestration lock says exact-path staging alone has not prevented cross-lane
 * commit contamination — this is one reason why.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRIMITIVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `open(path, 'wx')` — create-if-absent, fail-if-present — is atomic in the
 * filesystem, on Windows as on POSIX. One `<DOMAIN>.lock` file per domain is
 * the mutex; the readable `<DOMAIN>.json` beside it is the RECORD, written
 * only by whoever already won the lock. Losing looks like `EEXIST` and is
 * reported as a refusal, never as a retry.
 *
 * The lock file is not the durable state. If the process holding it dies, the
 * lock is stale and `--force` can clear it — but ONLY after `health()` says
 * the recorded pid is genuinely gone. A probe that FAILS reads as `UNKNOWN`,
 * not as death; stealing on an unknown is how a live heavy job loses its box.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A HELD LEASE MUST CARRY (orchestration lock §3)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   job_id · owner · purpose · command fingerprint · pid + creation time ·
 *   input version · durable output metric · starting/current output ·
 *   last progress time · contention class · pause/resume · launcher
 *
 * `acquire` refuses a heavy domain that names no `--durable-metric`, because a
 * job with no durable output metric cannot be shown to be progressing, and
 * "progressing" is the only thing §3 accepts as proof of life.
 */
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSessionPid, health } from './lib/process-identity.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEASE_DIR = join(ROOT, '.agents', 'bus', 'leases');
const BUS = join(ROOT, '.agents', 'bus');

/**
 * Active lanes only (roadmap v7.4 §3.5, A1). A lease record left by a legacy
 * holder (LCC, NEW1, …) stays readable and `--force` clears it on the same
 * dead-pid evidence as before; no legacy lane can acquire anything new.
 */
const LANES = ['SHIP', 'DATA', 'RED'];

/**
 * The domains, and who is allowed to hold each.
 *
 * `MIGRATION_SLOT` is server-owner-only because the orchestration lock says so:
 * the server owner (LCC historically, SHIP since v7.4 A1) owns migration
 * numbering and journal truth, and other lanes (now DATA) REQUEST a slot rather
 * than allocating one. HEAVY_BOX is SHIP/DATA: RED does not run heavy work. Encoding that here means the rule survives a fresh agent
 * who never read §4.
 */
const DOMAINS = {
  HEAVY_BOX: {
    heavy: true,
    holders: ['SHIP', 'DATA'],
    purpose: 'the single box: GPU, large DB writes/scans, OCR fleets, restore/replay, mixed load',
  },
  GIT_COMMIT: {
    heavy: false,
    holders: LANES,
    purpose: 'held across re-read HEAD -> status -> exact-path stage -> inspect -> commit -> release',
    shortLived: true,
  },
  MIGRATION_SLOT: {
    heavy: false,
    holders: ['SHIP'],
    purpose: 'migration ordinal allocation and journal truth; DATA requests a slot from SHIP',
  },
  DB_MIGRATION: {
    heavy: false,
    holders: ['SHIP'],
    purpose: 'legacy R7 file-scope lease over packages/db/drizzle; superseded by MIGRATION_SLOT',
    deprecated: 'MIGRATION_SLOT',
  },
  CLIENT_APPS: { heavy: false, holders: ['SHIP'], purpose: 'apps/** implementation' },
};

const recPath = (d) => join(LEASE_DIR, `${d}.json`);
const lockPath = (d) => join(LEASE_DIR, `${d}.lock`);

function readRec(d) {
  try {
    return JSON.parse(readFileSync(recPath(d), 'utf8'));
  } catch {
    return null;
  }
}

function writeRec(d, rec) {
  mkdirSync(LEASE_DIR, { recursive: true });
  writeFileSync(recPath(d), `${JSON.stringify(rec, null, 2)}\n`);
}

/** Which lane is running this. Same binding rule as the bus. */
function whoAmI() {
  const env = (process.env['LAWMIND_LANE'] ?? '').toUpperCase();
  if (LANES.includes(env)) return env;
  const id = process.env['CLAUDE_CODE_SESSION_ID'];
  if (id) {
    const f = join(BUS, `.lane-${id.replace(/[^A-Za-z0-9._-]/g, '')}`);
    if (existsSync(f)) {
      const v = readFileSync(f, 'utf8').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (LANES.includes(v)) return v;
    }
  }
  return '';
}

const arg = (name, argv) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name, argv) => argv.includes(`--${name}`);

/**
 * Take the mutex. Atomic: `wx` fails rather than truncating if the lock exists.
 * Returns `{ ok: true }` or `{ ok: false, heldBy }` — never a retry loop.
 */
function takeLock(d, payload) {
  mkdirSync(LEASE_DIR, { recursive: true });
  let fd;
  try {
    fd = openSync(lockPath(d), 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') {
      let heldBy = null;
      try {
        heldBy = JSON.parse(readFileSync(lockPath(d), 'utf8'));
      } catch {
        /* a torn/empty lock file is still a held lock */
      }
      return { ok: false, heldBy };
    }
    throw err;
  }
  writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
  closeSync(fd);
  return { ok: true };
}

function describe(d, rec, h) {
  if (!rec) return `${d}: FREE`;
  const lines = [
    `${d}: ${rec.state}  (process ${h.state})`,
    `  holder    ${rec.holder}`,
    `  session   ${rec.sessionId ?? '-'}`,
    `  pid       ${rec.pid ?? '-'}${h.proc?.name ? ` (${h.proc.name})` : ''}`,
    `  acquired  ${rec.acquiredAt ?? '-'}`,
    `  heartbeat ${rec.heartbeatAt ?? '-'}${h.age != null ? `  (${Math.round(h.age / 60000)}m ago)` : ''}`,
    `  task      ${rec.task ?? '-'}`,
  ];
  if (rec.durableOutputMetric) lines.push(`  metric    ${rec.durableOutputMetric}`);
  if (rec.startingOutput != null) lines.push(`  output    start ${rec.startingOutput} -> current ${rec.currentOutput ?? '?'} @ ${rec.lastProgressAt ?? '?'}`);
  if (rec.commandFingerprint) lines.push(`  command   ${rec.commandFingerprint}`);
  if (h.note) lines.push(`  note      ${h.note}`);
  return lines.join('\n');
}

function main() {
  const [, , action, domainRaw, ...argv] = process.argv;
  const d = (domainRaw ?? '').toUpperCase();

  if (action === 'status' && !d) {
    for (const dom of Object.keys(DOMAINS)) {
      const rec = readRec(dom);
      const h = rec && rec.state === 'HELD' ? health(rec) : { state: 'n/a' };
      console.log(describe(dom, rec, h));
      if (rec?.state === 'HELD' && !existsSync(lockPath(dom))) {
        console.log('  WARNING   record says HELD but no lock file exists — the mutex is not actually taken');
      }
      console.log('');
    }
    return;
  }

  if (!DOMAINS[d]) {
    console.error('usage: resource-lease.mjs <acquire|heartbeat|release|status> <DOMAIN> [options]');
    console.error(`  domains: ${Object.keys(DOMAINS).join(', ')}`);
    console.error('  acquire  --task "..." [--job-id X] [--durable-metric "SQL or file"] [--command-fingerprint "..."]');
    console.error('           [--contention-class "..."] [--input-version "..."] [--starting-output N] [--force --reason "..."]');
    console.error('           [--liveness durable-progress] [--launcher "..."]');
    console.error('  heartbeat --current-output N');
    process.exit(2);
  }

  const spec = DOMAINS[d];
  const rec = readRec(d);

  if (action === 'status') {
    const h = rec && rec.state === 'HELD' ? health(rec) : { state: 'n/a' };
    console.log(describe(d, rec, h));
    if (rec?.state === 'HELD' && !existsSync(lockPath(d))) {
      console.log('  WARNING   record says HELD but no lock file exists — the mutex is not actually taken');
    }
    if (rec?.state !== 'HELD' && existsSync(lockPath(d))) {
      console.log('  WARNING   a lock file exists but the record does not say HELD — orphaned lock');
    }
    return;
  }

  const me = whoAmI();
  if (!me) {
    console.error('This session has no lane, so a lease would have no holder.');
    console.error(`  echo SHIP > .agents/bus/.lane-${process.env['CLAUDE_CODE_SESSION_ID'] ?? '<session-id>'}`);
    process.exit(2);
  }
  if (!spec.holders.includes(me)) {
    console.error(`${d} may only be held by ${spec.holders.join('/')}, and this session is ${me}.`);
    if (d === 'MIGRATION_SLOT') console.error('  Request a slot from LCC on the bus instead of allocating an ordinal.');
    process.exit(2);
  }
  if (spec.deprecated && action === 'acquire') {
    console.error(`${d} is superseded by ${spec.deprecated}. Acquire that instead.`);
    process.exit(2);
  }

  if (action === 'acquire') {
    const task = arg('task', argv);
    if (!task) {
      console.error('--task is required: a lease with no stated purpose cannot be adjudicated later.');
      process.exit(2);
    }
    const durableMetric = arg('durable-metric', argv);
    if (spec.heavy && !durableMetric) {
      console.error(`${d} is a heavy domain. --durable-metric is required.`);
      console.error('  §3: progress is proved by durable output. GPU %, pid and log heartbeat are secondary signals only.');
      process.exit(2);
    }

    const self = findSessionPid();
    const now = new Date().toISOString();
    const payload = {
      domain: d,
      holder: me,
      sessionId: process.env['CLAUDE_CODE_SESSION_ID'] ?? null,
      pid: self?.unresolved ? null : (self?.pid ?? null),
      pidName: self?.name ?? null,
      pidCreatedAt: self?.createdAt ?? null,
      pidResolution: self?.unresolved ? 'UNRESOLVED' : self ? 'RESOLVED' : 'NO_AGENT_ANCESTOR',
      host: hostname(),
      acquiredAt: now,
      heartbeatAt: now,
      lastProgressAt: now,
      task,
      purpose: spec.purpose,
      jobId: arg('job-id', argv) ?? null,
      commandFingerprint: arg('command-fingerprint', argv) ?? null,
      inputVersion: arg('input-version', argv) ?? null,
      durableOutputMetric: durableMetric ?? null,
      startingOutput: arg('starting-output', argv) ?? null,
      currentOutput: arg('starting-output', argv) ?? null,
      contentionClass: arg('contention-class', argv) ?? null,
      pauseResume: arg('pause-resume', argv) ?? null,
      launcher: arg('launcher', argv) ?? null,
      // Which witness this lease trusts. Default (null) is the historical rule:
      // the holder's session pid, and nothing else. `durable-progress` says the
      // durable output metric is the witness instead, for a job that outlives the
      // session that started it. See health() in scripts/lib/process-identity.mjs.
      livenessSource: arg('liveness', argv) ?? null,
      state: 'HELD',
    };

    let got = takeLock(d, payload);

    if (!got.ok) {
      const holderRec = readRec(d);
      const h = holderRec ? health(holderRec) : { state: 'UNKNOWN', note: 'no record beside the lock' };
      const heldByName = got.heldBy?.holder ?? holderRec?.holder ?? 'someone';
      if (!flag('force', argv)) {
        console.error(`REFUSED: ${d} is held by ${heldByName} (process ${h.state}).`);
        if (h.state === 'DEAD') console.error('  The holding process is gone. Re-run with --force --reason "..." to clear a dead lock.');
        else if (h.state === 'UNKNOWN') console.error(`  The liveness probe FAILED (${h.note}). That is not evidence of death — do not force on it.`);
        else console.error('  Wait, or ask on the bus. Do not force a live holder.');
        process.exit(1);
      }
      const reason = arg('reason', argv);
      if (!reason) {
        console.error('--force requires --reason "..."');
        process.exit(2);
      }
      // HEALTHY_BY_PROGRESS belongs in this list, not beside DEAD. It means the
      // session that opened the lease is gone but the job it launched is still
      // moving the durable metric — which is the case where stealing the box does
      // the most damage, because the thing you would collide with is invisible in
      // the process table under the holder's name.
      if (h.state === 'HEALTHY' || h.state === 'HUNG' || h.state === 'HEALTHY_BY_PROGRESS') {
        console.error(`REFUSED: --force will not steal ${d} from a ${h.state} holder (${holderRec?.holder}, pid ${holderRec?.pid}).`);
        console.error('  Resolve it on the bus. A mutex that can be taken from a live owner is not a mutex.');
        process.exit(1);
      }
      if (h.state === 'UNKNOWN') {
        console.error(`REFUSED: the liveness probe for pid ${holderRec?.pid} failed (${h.note}).`);
        console.error('  A failed probe is not a dead process. Re-run when the probe works.');
        process.exit(1);
      }
      console.log(`clearing ${h.state} lock on ${d} (prior holder ${holderRec?.holder}, pid ${holderRec?.pid}) — ${reason}`);
      try { unlinkSync(lockPath(d)); } catch { /* already gone */ }
      payload.tookOverFrom = {
        holder: holderRec?.holder ?? null,
        sessionId: holderRec?.sessionId ?? null,
        pid: holderRec?.pid ?? null,
        health: h.state,
        reason,
      };
      got = takeLock(d, payload);
      if (!got.ok) {
        console.error(`REFUSED: ${d} was re-taken by ${got.heldBy?.holder} between the clear and the retry. Not racing it.`);
        process.exit(1);
      }
    }

    writeRec(d, payload);
    console.log(`${d}: ACQUIRED by ${me} (pid ${payload.pid})`);
    if (payload.pidResolution !== 'RESOLVED') {
      // Safe, but weak. A lease with no pid reads UNKNOWN forever: nobody can
      // steal it, and nobody can confirm it either. Seen intermittently when
      // the acquire runs inside a heavy compound command.
      console.log(`  WARNING   session pid is ${payload.pidResolution} — this lease cannot be health-checked.`);
      console.log('            Re-run the acquire on its own to stamp a real pid.');
    }
    if (payload.tookOverFrom) console.log(`  took over from ${payload.tookOverFrom.holder} — prior process ${payload.tookOverFrom.health}`);
    return;
  }

  if (action === 'heartbeat') {
    if (!rec || rec.state !== 'HELD') {
      console.error(`${d} is not held; nothing to heartbeat.`);
      process.exit(1);
    }
    if (rec.holder !== me) {
      console.error(`${d} is held by ${rec.holder}, not ${me}.`);
      process.exit(1);
    }
    const now = new Date().toISOString();
    const cur = arg('current-output', argv);
    const moved = cur != null && String(cur) !== String(rec.currentOutput);
    rec.heartbeatAt = now;
    if (cur != null) {
      rec.previousOutput = rec.currentOutput;
      rec.currentOutput = cur;
      if (moved) rec.lastProgressAt = now;
      rec.zeroDeltaWindows = moved ? 0 : (rec.zeroDeltaWindows ?? 0) + 1;
    }
    writeRec(d, rec);
    const verdict =
      cur == null ? 'RUNNING_UNKNOWN_OUTPUT'
      : moved ? 'RUNNING_PROGRESSING'
      : (rec.zeroDeltaWindows ?? 0) >= 2 ? 'STALLED_OR_REPLAYING'
      : 'RUNNING_NO_DELTA_1_WINDOW';
    console.log(`${d}: ${verdict}${cur != null ? `  ${rec.previousOutput ?? '?'} -> ${cur}` : ''}`);
    if (verdict === 'STALLED_OR_REPLAYING') {
      console.log('  §3: zero useful delta for two consecutive windows. Investigate before reporting progress.');
      process.exitCode = 3;
    }
    return;
  }

  if (action === 'release') {
    if (!rec) {
      console.error(`${d} has no record.`);
      process.exit(1);
    }
    if (rec.state === 'HELD' && rec.holder !== me && !flag('force', argv)) {
      console.error(`${d} is held by ${rec.holder}, not ${me}. Use --force --reason "..." only to clear a dead holder.`);
      process.exit(1);
    }
    rec.state = 'RELEASED';
    rec.releasedAt = new Date().toISOString();
    rec.releasedBy = me;
    if (arg('reason', argv)) rec.releaseReason = arg('reason', argv);
    writeRec(d, rec);
    try { unlinkSync(lockPath(d)); } catch { /* already gone */ }
    console.log(`${d}: RELEASED by ${me}`);
    return;
  }

  console.error(`unknown action "${action}"`);
  process.exit(2);
}

main();
