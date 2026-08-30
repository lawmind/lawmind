/**
 * PROCESS IDENTITY — the one copy.
 *
 * Extracted from `scripts/lane-lease.mjs` on 25 Aug 2026 so that the lane
 * leases and the R8.1 resource leases (`HEAVY_BOX`, `GIT_COMMIT`,
 * `MIGRATION_SLOT`) share ONE implementation of the recycled-pid fix rather
 * than two copies that drift apart. The orchestration lock calls that drift out
 * by name: "Canonical documentation drift is itself a risk."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE DISTINCTIONS THIS FILE EXISTS TO KEEP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. **A pid is not an identity.** Windows recycles pids, so a lease naming pid
 *    20228 can be "confirmed alive" by an unrelated process that inherited the
 *    number. Identity is pid + creation time, plus a command fingerprint where
 *    the caller supplies one.
 *
 * 2. **A failed probe is not a dead process.** `alive: null` means the question
 *    was not answered. Letting that read as death is how a live holder gets
 *    force-stolen.
 *
 * 3. **An unresolved pid is not a pid you have lying around.** On 25 Aug 2026 a
 *    transient probe failure made `findSessionPid()` return null, the caller
 *    fell back to `process.pid`, and `MIGRATION_SLOT` was stamped with the pid
 *    of a node process that exited milliseconds later — a lease that read DEAD
 *    to everyone the instant it was written. Callers record `null` and
 *    `pidResolution: 'UNRESOLVED'` instead.
 */
import { execFileSync } from 'node:child_process';

/** Heartbeat older than this and a live-looking lease is treated as HUNG. */
export const STALE_AFTER_MS = 90 * 60 * 1000;

/**
 * How fresh `lastProgressAt` must be for a lease that opts into durable-progress
 * liveness. Thirty minutes is longer than any single unit of work this repo
 * heartbeats on (the coarse walk reports every 5, its batches take ~20) and far
 * shorter than the 90-minute heartbeat staleness, so a job that has genuinely
 * stopped stops reading alive within one window rather than one and a half hours.
 */
export const PROGRESS_STALE_AFTER_MS = 30 * 60 * 1000;

/** Names that identify an agent session process rather than a shell or helper. */
const AGENT_NAMES = ['claude', 'codex'];

/**
 * CreationDate is stamped as a round-trip string in PowerShell rather than in
 * node: ConvertTo-Json renders a DateTime as `/Date(1787500353189)/`, which
 * `new Date()` cannot parse, and the resulting throw made every probe read as
 * UNKNOWN.
 */
const SELECT = "Select-Object ProcessId,ParentProcessId,Name,@{n='Created';e={$_.CreationDate.ToString('o')}},CommandLine";

/**
 * PowerShell writes stdout in the console's ANSI codepage, not UTF-8. Any
 * non-ASCII character in ANY live process's command line therefore arrives as
 * invalid bytes, `JSON.parse` throws, and EVERY probe on this box returns
 * UNKNOWN — not just the probe for that process.
 *
 * Found 25 Aug 2026: a lease whose `--task` contained "§4" made its own
 * liveness unverifiable, deterministically. A repo that handles Devanagari
 * paths would hit this far more often than a section sign does.
 *
 * Forcing the output encoding is the whole fix. It must be set on
 * `[Console]::OutputEncoding` INSIDE the child, before the pipeline runs.
 */
const UTF8_PREAMBLE = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';

function ps(command, { timeout = 20000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return execFileSync('powershell', ['-NoProfile', '-Command', UTF8_PREAMBLE + command], {
    encoding: 'utf8',
    timeout,
    maxBuffer,
  }).trim();
}

const shape = (o) => ({
  pid: Number(o.ProcessId),
  ppid: Number(o.ParentProcessId),
  name: o.Name,
  createdAt: o.Created ?? null,
  commandLine: o.CommandLine ?? null,
});

/**
 * Look one pid up in the OS process table.
 *
 * `alive: null` means the probe failed and the question is unanswered.
 */
export function inspectPid(pid) {
  if (pid == null) return { alive: false, reason: 'no pid recorded' };
  try {
    const out = ps(`Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}" | ${SELECT} | ConvertTo-Json -Compress`);
    if (!out) return { alive: false, reason: 'not in process table' };
    return { alive: true, ...shape(JSON.parse(out)) };
  } catch (err) {
    return { alive: null, reason: `probe failed: ${firstLine(err.message)}` };
  }
}

/**
 * Snapshot the whole process table in ONE PowerShell call.
 *
 * The parent walk used to spawn one PowerShell per hop — five spawns to climb
 * node -> bash -> bash -> bash -> claude, and five chances to fail. One call
 * has one chance to fail, and it either works or says so.
 */
const NEWLINE = String.fromCharCode(10);
const firstLine = (m) => String(m).split(NEWLINE)[0].trim();

let lastTableError = null;

export function processTable() {
  lastTableError = null;
  try {
    const out = ps(`Get-CimInstance Win32_Process | ${SELECT} | ConvertTo-Json -Compress`, { timeout: 30000 });
    if (!out) return null;
    const rows = JSON.parse(out);
    const byPid = new Map();
    for (const r of Array.isArray(rows) ? rows : [rows]) byPid.set(Number(r.ProcessId), shape(r));
    return byPid;
  } catch (err) {
    // Do NOT swallow this. The snapshot failing under load is exactly what made
    // a lease read UNRESOLVED intermittently, and a bare catch made it look
    // like the walk had simply found nothing.
    lastTableError = firstLine(err.message);
    return null;
  }
}

/**
 * Walk up from this node process to the owning agent session process.
 *
 * `null` = the walk genuinely found no agent ancestor.
 * `{ unresolved: true }` = the probe itself failed. Not the same thing.
 */
export function findSessionPid() {
  const table = processTable();
  // The snapshot is the fast path, not the only path. When it fails — and under
  // fleet load it does — fall back to climbing hop by hop rather than reporting
  // UNRESOLVED on the first stumble.
  const lookup = table
    ? (pid) => table.get(pid)
    : (pid) => {
        const i = inspectPid(pid);
        return i.alive === true ? i : null;
      };
  if (!table && inspectPid(process.pid).alive !== true) {
    return { unresolved: true, reason: `process table snapshot failed (${lastTableError}) and the per-hop probe failed too` };
  }
  let pid = process.pid;
  for (let i = 0; i < 24; i += 1) {
    const info = lookup(pid);
    if (!info) return null;
    if (AGENT_NAMES.some((n) => String(info.name || '').toLowerCase().includes(n))) {
      return { pid, name: info.name, createdAt: info.createdAt, commandLine: info.commandLine };
    }
    if (!info.ppid || info.ppid === pid) return null;
    pid = info.ppid;
  }
  return null;
}

/**
 * Classify a lease record against the OS.
 *
 * `FREE` · `HEALTHY` · `HUNG` · `PID_RECYCLED` · `DEAD` · `UNKNOWN`, plus
 * `HEALTHY_BY_PROGRESS` for a lease that opted in to durable-progress liveness.
 *
 * A verdict may additionally carry `contested: true` — see the block at the
 * bottom of this function. `contested` NEVER changes the state; it says the
 * lease's own durable output disagrees with the process table, and a
 * destructive path must refuse rather than act on the state alone.
 *
 * `commandFingerprint`, when the lease carries one, is a third identity factor:
 * a session pid can be alive, be the same process, and still be running
 * something other than the job the lease claims.
 */
export function health(
  lease,
  { staleAfterMs = STALE_AFTER_MS, progressStaleAfterMs = PROGRESS_STALE_AFTER_MS, table = null } = {},
) {
  if (!lease) return { state: 'FREE' };
  const age = Date.now() - new Date(lease.heartbeatAt).getTime();

  // No pid recorded is an ABSENCE OF EVIDENCE, not evidence of death.
  if (lease.pid == null) {
    return { state: 'UNKNOWN', proc: { alive: null }, age, note: 'no pid recorded on the lease' };
  }

  const proc = table
    ? (table.has(Number(lease.pid))
        ? { alive: true, ...table.get(Number(lease.pid)) }
        : { alive: false, reason: 'not in process table' })
    : inspectPid(lease.pid);

  const heartbeatCold = age > staleAfterMs;
  const sameProcess =
    proc.alive === true &&
    (!lease.pidCreatedAt || !proc.createdAt || lease.pidCreatedAt === proc.createdAt);
  const fingerprintOk =
    !lease.commandFingerprint ||
    !proc.commandLine ||
    String(proc.commandLine).includes(lease.commandFingerprint);

  /**
   * A PID IS NOT THE ONLY WITNESS — 29 Aug 2026.
   *
   * `HEAVY_BOX` records the pid of the AGENT SESSION that acquired it, and until
   * now that pid was the only thing this function would accept as proof of life.
   * For a lane lease that is right: the question there is literally "is that agent
   * still running". For a heavy resource it is wrong, and measurably so — on
   * 29 Aug the NEW1 session died at 06:12Z while the coarse GPU walk it had
   * launched kept running detached, and for the next eleven hours the bus told
   * every other lane `HEAVY_BOX: HELD (process DEAD)` while the box was in fact
   * fully occupied, producing ~28,000 vectors an hour. A lane reading that and
   * force-clearing the lock would have put a second heavy job on one GPU.
   *
   * So a lease MAY nominate durable output as its witness instead, by carrying
   * `livenessSource: 'durable-progress'`. Then a fresh `lastProgressAt` — which
   * `heartbeat --current-output` only advances when the durable metric actually
   * MOVED — keeps it alive whatever happened to the session that opened it.
   *
   * This is opt-in per record and it only ever moves a verdict TOWARDS alive, so
   * no existing lease changes behaviour and the direction of any error is
   * "harder to steal", never "easier". A job that truly stops stops advancing its
   * metric, and the lease then decays to DEAD on its own within one window.
   */
  const byProgress = () => {
    if (lease.livenessSource !== 'durable-progress') return null;
    if (!lease.lastProgressAt) return null;
    const progressAge = Date.now() - new Date(lease.lastProgressAt).getTime();
    if (!(progressAge < progressStaleAfterMs)) return null;
    return {
      state: 'HEALTHY_BY_PROGRESS',
      proc,
      age,
      progressAge,
      note: 'session pid is gone, but the durable output metric moved ' + Math.round(progressAge / 60000) + 'm ago',
    };
  };

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * A LEASE THAT NEVER OPTED IN CAN STILL BE CONTRADICTED BY ITS OWN OUTPUT
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `byProgress()` above is OPT-IN: it only fires when the record carries
   * `livenessSource: 'durable-progress'`. That is the right default, because a
   * lease's state must never become more permissive by accident.
   *
   * It leaves a hole, and the hole cost 341 minutes on 29-30 Aug 2026. The
   * `HEAVY_BOX` resource lease had opted in and read `HEALTHY_BY_PROGRESS`
   * correctly the whole time. NEW1's LANE lease had not, so the same worker read
   *
   *     resource-lease status HEAVY_BOX   HELD (HEALTHY_BY_PROGRESS)
   *     lane-lease     status NEW1        DEAD
   *
   * — while the GPU sat at 99% and the batch cursor moved. Two halves of one
   * truth, disagreeing, and the dangerous half is the one that invites a lane to
   * clear the lock and put a second heavy job on one GPU.
   *
   * So a non-opted-in lease whose OWN recorded output moved recently is marked
   * `contested`. The STATE is unchanged — still DEAD, still PID_RECYCLED — so
   * nothing that reads `state` becomes more permissive. What changes is that a
   * destructive path can see the contradiction and refuse, and `status` can
   * print it instead of a flat DEAD that is materially misleading.
   *
   * The evidence has to be the lease's own: a fresh `lastProgressAt` AND a
   * `currentOutput` that differs from `previousOutput`. A timestamp alone would
   * be satisfied by a heartbeat, and a heartbeat is exactly what a hung worker
   * keeps producing.
   */
  const contested =
    lease.livenessSource !== 'durable-progress' &&
    lease.lastProgressAt != null &&
    Date.now() - new Date(lease.lastProgressAt).getTime() < progressStaleAfterMs &&
    lease.currentOutput != null &&
    String(lease.currentOutput) !== String(lease.previousOutput ?? '');

  const contest = (verdict) =>
    contested
      ? {
          ...verdict,
          contested: true,
          note:
            (verdict.note ? verdict.note + '; ' : '') +
            'CONTESTED: the pid is gone but the durable output this lease itself records moved ' +
            Math.round((Date.now() - new Date(lease.lastProgressAt).getTime()) / 60000) +
            'm ago (' +
            String(lease.previousOutput) +
            ' -> ' +
            String(lease.currentOutput) +
            '). The logical worker is alive; only the session that opened the lease is gone.',
        }
      : verdict;

  if (proc.alive === null) return byProgress() ?? contest({ state: 'UNKNOWN', proc, age, note: proc.reason });
  if (proc.alive && sameProcess && !fingerprintOk)
    return byProgress() ?? contest({ state: 'PID_RECYCLED', proc, age, note: 'command fingerprint does not match' });
  if (proc.alive && sameProcess && !heartbeatCold) return { state: 'HEALTHY', proc, age };
  if (proc.alive && sameProcess && heartbeatCold) return { state: 'HUNG', proc, age };
  if (proc.alive && !sameProcess) return byProgress() ?? contest({ state: 'PID_RECYCLED', proc, age });
  return byProgress() ?? contest({ state: 'DEAD', proc, age });
}
