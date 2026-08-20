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
 * IT WATCHES THE WALK TOO, AND THAT WAS A CORRECTION
 * ---------------------------------------------------
 * The first version of this file said, in as many words, that it deliberately did
 * NOT restart the walk — a restarted sidecar is enough for the walk's own retry,
 * and a keeper that relaunches the runner could start a second concurrent walk.
 * Three and a half hours later the walk was gone and so was this keeper: both had
 * been launched with `nohup ... &` from inside a session shell, and both died with
 * it at 13:39Z. The GPU sat at 0% until 17:00Z. Nothing reported anything, because
 * a process that is killed does not write "I was killed".
 *
 * So the reasoning was right about the RISK and wrong about the trade. Two walks
 * is a bad outcome; zero walks for three hours is the outcome we actually got, and
 * it is silent. The walk is now watched by SILENCE — `stage-embed.log` gains a line
 * roughly every twenty seconds while a batch is running, so twenty minutes without
 * one means hung or dead, and both want the same treatment. The double-walk risk is
 * handled by killing any surviving walk processes before relaunching, not by
 * declining to look.
 *
 * Silence, not exit. A worker that exits gets noticed by anything; a worker that
 * hangs holding no connection looks perfect forever and is the failure this fleet
 * keeps hitting.
 *
 * It refuses to start if another keeper holds the lock, because two keepers race
 * to spawn two sidecars on one port and the loser's failure is silent.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
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

const STAGE_LOG = join(ROOT, 'docs', 'ai', 'new1-tier-a', 'stage-embed.log');
const WALK_LAUNCH = join(ROOT, 'services', 'harness', 'src', 'walk-launch.sh');
const WATCH_WALK = (process.env.KEEPER_WATCH_WALK ?? '1') === '1';
/**
 * Twenty minutes. A running batch appends a progress line every 200 documents,
 * which is about twenty seconds — so this is a fifty-fold margin and will not fire
 * on a slow batch. The gap it must catch was three hours and twenty minutes.
 */
const WALK_SILENCE_MS = Number(process.env.KEEPER_WALK_SILENCE_MS ?? 20 * 60_000);
/** After a relaunch, do not judge the walk again until it has had time to log. */
const WALK_GRACE_MS = Number(process.env.KEEPER_WALK_GRACE_MS ?? 5 * 60_000);

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

/**
 * Kill anything still running the walk, then start one.
 *
 * The kill is by COMMAND LINE, not by a pid file, because the thing being killed
 * may be a hung descendant several processes below the runner (bash -> npx -> cmd
 * -> node -> node) and a pid file names only the top. `pgrep` does not exist on
 * this box in a form that answers the question, so PowerShell's process table is
 * the tool; `Where-Object` on the command line finds every generation.
 */
function relaunchWalk() {
  // `$_.Name -ne 'powershell.exe'` is load-bearing, not defensive tidiness.
  //
  // A process query that matches on CommandLine MATCHES THE QUERYING SHELL: the
  // PowerShell process running this very command has 'doc-vector-embed' in its own
  // command line, so an unguarded filter selects it, `Stop-Process` kills the shell
  // mid-pipeline, and the `Start-Process` that was supposed to relaunch the walk
  // never runs. It exits 255 and prints nothing, which reads exactly like success.
  // Verified by hand this session, three times, before the cause was obvious.
  const ps = [
    'Get-CimInstance Win32_Process |',
    "Where-Object { $_.Name -ne 'powershell.exe' -and $_.CommandLine -match 'stage-runner|doc-vector-embed|walk-launch' } |",
    'ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} };',
    'Start-Sleep -Seconds 3;',
    `Start-Process -FilePath 'C:\\Program Files\\Git\\bin\\bash.exe' -ArgumentList '${WALK_LAUNCH.replace(/\\/g, '\\\\')}' -WorkingDirectory '${ROOT.replace(/\\/g, '\\\\')}' -WindowStyle Hidden`,
  ].join(' ');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  note('WALK RELAUNCH issued (killed any survivors first)');
}

function walkSilentFor() {
  try {
    return Date.now() - statSync(STAGE_LOG).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
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
  note(
    WATCH_WALK
      ? `watching the walk too — ${STAGE_LOG} silent for ${WALK_SILENCE_MS / 60_000} min means relaunch`
      : 'walk watching DISABLED (KEEPER_WATCH_WALK=0)',
  );

  let misses = 0;
  let restarts = 0;
  let walkRelaunches = 0;
  let walkQuietSince = 0;
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

    // The walk is judged only while the sidecar is answering. Relaunching a walk
    // into a dead sidecar burns its three retries and aborts it for good.
    if (WATCH_WALK && ok && Date.now() - walkQuietSince > WALK_GRACE_MS) {
      const silent = walkSilentFor();
      if (silent > WALK_SILENCE_MS) {
        walkRelaunches += 1;
        note(
          `WALK SILENT for ${Math.round(silent / 60_000)} min — relaunch #${walkRelaunches}. ` +
            'Hung and dead look identical from here and want the same treatment.',
        );
        relaunchWalk();
        walkQuietSince = Date.now();
      }
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.exitCode = (await main()) ?? 0;
