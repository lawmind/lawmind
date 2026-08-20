/**
 * NEW1 — keep the GPU embedding sidecar alive for the duration of the Tier-A run.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Tier-A walk died on 20 Aug at 07:16Z, 800 rows into batch 00088, and the
 * GPU then sat idle for four hours. The walk itself was not at fault: it retries
 * a failed batch three times, thirty seconds apart, and aborts rather than
 * marching on. What it cannot do is bring the sidecar BACK — and the sidecar had
 * no keeper and no log, so the cause of that death is now unrecoverable.
 *
 * Ninety seconds of tolerance is the wrong shape for an eleven-day run. This
 * closes both halves: the sidecar is restarted when it stops answering, and
 * every restart is written down so the NEXT death is diagnosable.
 *
 * LIVENESS IS THE HEALTH ENDPOINT, NOT THE PROCESS TABLE
 * ------------------------------------------------------
 * A python process that is alive but wedged looks identical to a healthy one in
 * `Get-CimInstance`, and the fleet has been fooled by exactly that shape before
 * (a postgres.js promise that never settles looks perfect forever). `/health`
 * asks the thing we actually depend on. `pgrep` does not exist on this box in a
 * form that answers the question, so the process table is not consulted at all.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not restart the WALK. A restarted sidecar is enough for the walk's own
 * retry to succeed, and a keeper that also relaunches the runner is a keeper that
 * can start a second concurrent walk over the same manifest.
 *
 * It refuses to start if another keeper holds the lock, because two keepers race
 * to spawn two sidecars on one port and the loser's failure is silent.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PORT = Number(process.env.SIDECAR_PORT ?? 8799);
const HEALTH = `http://127.0.0.1:${PORT}/health`;
const SERVER = join(ROOT, 'services', 'embed', 'gpu', 'server.py');
const LOG = join(ROOT, '.agents', 'logs', 'new1-sidecar.log');
const KEEPER_LOG = join(ROOT, '.agents', 'logs', 'new1-sidecar-keeper.log');
const LOCK = join(ROOT, '.agents', 'logs', `new1-sidecar-keeper.${PORT}.lock`);

const POLL_MS = Number(process.env.KEEPER_POLL_MS ?? 20_000);
/** Two consecutive misses, not one: a single slow reply during a 240k-char batch is not a death. */
const MISSES_BEFORE_RESTART = Number(process.env.KEEPER_MISSES ?? 2);
/** Loading BGE-M3 onto the GPU took 3.8 s cold; give it room before the first poll counts. */
const WARMUP_MS = Number(process.env.KEEPER_WARMUP_MS ?? 45_000);

function note(line) {
  const stamped = `${new Date().toISOString()}  ${line}\n`;
  appendFileSync(KEEPER_LOG, stamped);
  process.stdout.write(stamped);
}

function claimLock() {
  if (existsSync(LOCK)) {
    const held = readFileSync(LOCK, 'utf8').trim();
    // A stale lock from a killed keeper must not block the replacement forever,
    // so the pid is checked rather than trusted.
    const pid = Number(held.split(/\s+/)[0]);
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive) {
      note(`another keeper holds ${LOCK} (pid ${pid}) — refusing to start a second one`);
      return false;
    }
    note(`stale lock from pid ${pid} (not running) — taking it over`);
  }
  writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}\n`);
  return true;
}

async function healthy() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(HEALTH, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

function startSidecar() {
  // Detached, with stdio to the log file: the sidecar must outlive whichever
  // shell the keeper was launched from, and its stderr is the only record of
  // why it died last time.
  const child = spawn('python', [SERVER, '--port', String(PORT)], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
  });
  const sink = (chunk) => appendFileSync(LOG, chunk.toString());
  child.stdout.on('data', sink);
  child.stderr.on('data', sink);
  child.unref();
  note(`spawned sidecar pid ${child.pid}`);
  return child.pid;
}

async function main() {
  if (!claimLock()) return 1;
  const release = () => {
    try {
      unlinkSync(LOCK);
    } catch {
      /* already gone */
    }
  };
  process.on('exit', release);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  note(`keeper up — polling ${HEALTH} every ${POLL_MS / 1000}s, restart after ${MISSES_BEFORE_RESTART} misses`);

  let misses = 0;
  let restarts = 0;
  let lastOk = Date.now();

  for (;;) {
    const ok = await healthy();
    if (ok) {
      if (misses > 0) note(`sidecar answering again after ${misses} miss(es)`);
      misses = 0;
      lastOk = Date.now();
    } else {
      misses += 1;
      note(`health MISS ${misses}/${MISSES_BEFORE_RESTART} (last ok ${Math.round((Date.now() - lastOk) / 1000)}s ago)`);
      if (misses >= MISSES_BEFORE_RESTART) {
        restarts += 1;
        note(`RESTART #${restarts} — sidecar unreachable`);
        startSidecar();
        misses = 0;
        await new Promise((r) => setTimeout(r, WARMUP_MS));
        lastOk = Date.now();
        continue;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.exitCode = (await main()) ?? 0;
