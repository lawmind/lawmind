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
 * `FREE` · `HEALTHY` · `HUNG` · `PID_RECYCLED` · `DEAD` · `UNKNOWN`.
 *
 * `commandFingerprint`, when the lease carries one, is a third identity factor:
 * a session pid can be alive, be the same process, and still be running
 * something other than the job the lease claims.
 */
export function health(lease, { staleAfterMs = STALE_AFTER_MS, table = null } = {}) {
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

  if (proc.alive === null) return { state: 'UNKNOWN', proc, age, note: proc.reason };
  if (proc.alive && sameProcess && !fingerprintOk)
    return { state: 'PID_RECYCLED', proc, age, note: 'command fingerprint does not match' };
  if (proc.alive && sameProcess && !heartbeatCold) return { state: 'HEALTHY', proc, age };
  if (proc.alive && sameProcess && heartbeatCold) return { state: 'HUNG', proc, age };
  if (proc.alive && !sameProcess) return { state: 'PID_RECYCLED', proc, age };
  return { state: 'DEAD', proc, age };
}
