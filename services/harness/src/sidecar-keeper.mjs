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
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PORT = Number(process.env.SIDECAR_PORT ?? 8799);
const HEALTH = `http://127.0.0.1:${PORT}/health`;
const SERVER = join(ROOT, 'services', 'embed', 'gpu', 'server.py');
const LOG = join(ROOT, '.agents', 'logs', 'new1-sidecar.log');
/** Whatever PowerShell says about a relaunch. Separate file so it is not lost in the health chatter. */
const RELAUNCH_LOG = join(ROOT, '.agents', 'logs', 'new1-walk-relaunch.log');
const KEEPER_LOG = join(ROOT, '.agents', 'logs', 'new1-sidecar-keeper.log');
const LOCK = join(ROOT, '.agents', 'logs', `new1-sidecar-keeper.${PORT}.lock`);

const POLL_MS = Number(process.env.KEEPER_POLL_MS ?? 20_000);
/** Two consecutive misses, not one: a single slow reply during a 240k-char batch is not a death. */
const MISSES_BEFORE_RESTART = Number(process.env.KEEPER_MISSES ?? 2);
/**
 * Warm-up is now a BOUNDED WAIT, not a fixed sleep. `KEEPER_WARMUP_MS` was 45s
 * against a measured 49.8s model load and lost the race — see the restart branch
 * in main(). The ceiling is generous because the cost of waiting is idle time,
 * and the cost of not waiting is a restart storm against a healthy process.
 */
const WARMUP_CEILING_MS = Number(process.env.KEEPER_WARMUP_CEILING_MS ?? 180_000);
const WARMUP_POLL_MS = Number(process.env.KEEPER_WARMUP_POLL_MS ?? 3_000);

const STAGE_LOG = join(ROOT, 'docs', 'ai', 'new1-tier-a', 'stage-embed.log');
const WALK_LAUNCH = join(ROOT, 'services', 'harness', 'src', 'walk-launch.sh');
const WATCH_WALK = (process.env.KEEPER_WATCH_WALK ?? '1') === '1';
/** Presence of this file suspends walk relaunch. Its contents are the reason, and are logged. */
const WALK_PAUSE = join(ROOT, '.agents', 'logs', 'new1-walk.pause');
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

/**
 * Kill any sidecar that is already running, and WAIT for the VRAM back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEATH SPIRAL THIS ENDS, MEASURED 22 Aug 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `startSidecar` spawned a replacement and never killed the process it was
 * replacing. Every unreachable-sidecar restart therefore ADDED one. After
 * fifteen restarts the box held **16 sidecar processes holding 7,872 MiB of
 * 8,188 MiB of VRAM**, at 1% GPU utilisation — none of them serving, all of them
 * holding. The next spawn had no memory to load a model into, so it was
 * unreachable too, so the keeper spawned another.
 *
 * The walk's runner aborted `tier-a-batch-00112` after its three attempts with
 * `fetch failed`, which is exactly what a starved sidecar looks like from the
 * outside, and the keeper's own log recorded fifteen confident recoveries while
 * the thing it was recovering got monotonically worse.
 *
 * **A restart that does not free what it is replacing is not a restart.** This
 * kills by the SAME command-line predicate the process table can see, excludes
 * the querying shell (the trap this file already documents for the walk), and
 * then waits for the memory rather than racing the next model load.
 */
/**
 * THE PREDICATE IS THE WHOLE FUNCTION, AND IT WAS WRONG FOR THE WORST REASON.
 *
 * Until 25 Aug 2026 the filter read `'embed..gpu..server\.py'`. Each `..` is TWO
 * regex wildcards, but the command line this has to match is
 *
 *   python C:\...\services\embed\gpu\server.py --port 8799
 *
 * which has exactly ONE character — a single backslash — between `embed` and
 * `gpu`. So the predicate matched NOTHING, `Stop-Process` was handed nothing,
 * PowerShell exited 0, and the line below logged a confident "killed any
 * existing sidecar" over a sweep that had killed nobody. Measured on the live
 * box: the old pattern matched 0 of 2 running sidecars, the fixed one matched 2.
 *
 * The cost was not theoretical. Keeper RESTART #2 at 02:46Z spawned pid 28592
 * while pid 20452 still held port 8799, so the new process could not bind, did
 * ~18 CPU-seconds of nothing for four hours, and sat on a CUDA context on an
 * 8 GiB card that was already at 7,360 MiB — starving the very tranche build the
 * restart existed to protect.
 *
 * `[\/]` rather than `.`: the separator is a backslash today and a forward
 * slash the moment anything launches this through Git Bash, and a wildcard that
 * matches whatever happens to be there is how the first version got it wrong.
 *
 * AND THE SWEEP NOW VERIFIES ITSELF. Logging success unconditionally is the
 * defect, not a detail of it: this counts the survivors afterwards and says so,
 * because "I killed it" and "I could not kill it" must not produce the same log.
 */
function killExistingSidecars() {
  // String.raw, not a quoted literal: the pattern PowerShell must receive is
  // `embed[\/]gpu[\/]server\.py` — a character class of backslash-or-slash and
  // an ESCAPED dot — and every attempt to write that through ordinary JS string
  // escapes lost a level somewhere and silently produced a class that matched
  // only a forward slash. String.raw hands the regex over byte for byte.
  const PATTERN = String.raw`embed[\\/]gpu[\\/]server\.py`;
  const MATCH = `$_.Name -eq 'python.exe' -and $_.CommandLine -match '${PATTERN}'`;
  const ps = [
    `$before = @(Get-CimInstance Win32_Process | Where-Object { ${MATCH} });`,
    '$before | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} };',
    'Start-Sleep -Milliseconds 1500;',
    `$after = @(Get-CimInstance Win32_Process | Where-Object { ${MATCH} });`,
    '$ids = ($before | ForEach-Object { $_.ProcessId }) -join "|";',
    'Write-Output ("SWEEP matched=" + $before.Count + " survived=" + $after.Count + " pids=" + $ids)',
  ].join(' ');
  /**
   * SUCCESS IS THE NARROW PATH. EVERY OTHER OUTCOME IS A FAILURE, LOUDLY.
   *
   * The first version of this verification had the same defect it was written to
   * kill, reached by a third route. On 25 Aug at 03:58:13Z the keeper logged
   * RESTART #1 and at 03:59:23Z logged `swept existing sidecars — (no output)`.
   * Seventy seconds, against a 60s `spawnSync` timeout: PowerShell was killed
   * mid-run, `stdout` came back empty, `survived` parsed as `NaN`, and
   * `NaN > 0` is **false** — so it fell through to the success branch and
   * announced a sweep that had timed out. Sidecar 20452 survived, a second
   * sidecar was spawned that could not bind, and the log said everything was
   * fine.
   *
   * `Get-CimInstance Win32_Process` is not fast on a box under IO pressure, and
   * this one was: the walk was at 494 tok/s behind a saturated disk at the time.
   * So the timeout is raised — but raising it is the small half of the fix.
   *
   * The real rule is that this function may only report success when it has
   * POSITIVELY READ `survived=0`. A timeout, a signal, a non-zero exit, stderr
   * output, or a line it cannot parse are each a distinct failure and each says
   * so. "I killed it" and "I could not tell whether I killed it" must not
   * produce the same log line — which is the entire lesson of the bug above.
   */
  try {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
      timeout: 180_000,
    });

    const stdout = String(r.stdout ?? '').trim();
    const stderr = String(r.stderr ?? '').trim();
    const line = stdout.split(/\r?\n/).filter(Boolean).at(-1) ?? '';
    const m = line.match(/SWEEP matched=(\d+) survived=(\d+)/);

    if (r.error) {
      note(`SWEEP FAILED — could not run: ${r.error.message}. Assume the old sidecar is STILL ALIVE.`);
      return;
    }
    if (r.signal) {
      note(
        `SWEEP FAILED — PowerShell killed by ${r.signal} (timeout ${180_000 / 1000}s). ` +
          'This is the 03:59Z failure mode: no output is NOT a clean sweep. Assume the old sidecar is STILL ALIVE.',
      );
      return;
    }
    if (r.status !== 0) {
      note(`SWEEP FAILED — PowerShell exited ${r.status}. stderr: ${stderr.slice(0, 300) || '(none)'}`);
      return;
    }
    if (!m) {
      note(
        `SWEEP FAILED — unparseable result ${JSON.stringify(line) || '(empty)'}. ` +
          `stderr: ${stderr.slice(0, 300) || '(none)'}. Not treating this as success.`,
      );
      return;
    }

    const matched = Number(m[1]);
    const survived = Number(m[2]);
    if (survived > 0) {
      note(`SWEEP INCOMPLETE — ${line}. A restart that does not free the port is not a restart, and this one did not.`);
    } else {
      note(`swept ${matched} existing sidecar(s), 0 survived — ${line}`);
    }
  } catch (e) {
    note('SWEEP FAILED — threw: ' + (e?.message ?? e) + '. Assume the old sidecar is STILL ALIVE.');
  }
}

function startSidecar() {
  killExistingSidecars();
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
  /**
   * STEP 1 — kill any survivor. STILL PowerShell, because the process table is
   * the only thing on this box that can find a hung descendant several
   * generations below the runner (bash -> npx -> cmd -> node -> node).
   *
   * `$_.Name -ne 'powershell.exe'` is load-bearing, not defensive tidiness.
   *
   * A process query that matches on CommandLine MATCHES THE QUERYING SHELL: the
   * PowerShell process running this very command has 'doc-vector-embed' in its own
   * command line, so an unguarded filter selects it, `Stop-Process` kills the shell
   * mid-pipeline, and the launch that was supposed to relaunch the walk never runs.
   * It exits 255 and prints nothing, which reads exactly like success.
   *
   * `spawnSync`, not the old detached `spawn`: the kill must finish before the
   * start, and a fire-and-forget kill raced the launch it was meant to precede.
   */
  const killPs = [
    'Get-CimInstance Win32_Process |',
    "Where-Object { $_.Name -ne 'powershell.exe' -and $_.CommandLine -match 'stage-runner|doc-vector-embed|walk-launch' } |",
    'ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }',
  ].join(' ');
  try {
    const k = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', killPs], {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 60_000,
    });
    const err = String(k.stderr ?? '').trim();
    if (err.length > 0) appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  kill STDERR  ${err}
`);
  } catch (e) {
    appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  kill threw  ${e?.message ?? e}
`);
  }

  /**
   * STEP 2 — START THE WALK. THE CAUSE OF 21 SILENT FAILURES IS NOW MEASURED, AND
   * IT WAS THE CALLER, EXACTLY AS THE PREVIOUS AGENT WROTE DOWN AND DID NOT TEST.
   *
   * Three variants of the SAME `Start-Process` command line, 23 Aug 2026, each
   * launching one marker script that appends a line and sleeps:
   *
   *   node spawns bash.exe DIRECTLY, detached                    -> MARKER RAN
   *   node spawns PowerShell `detached: true` -> Start-Process   -> NOTHING
   *   node spawns PowerShell attached (a console) -> same cmd    -> MARKER RAN
   *
   * The command is identical in variants 2 and 3. The only difference is
   * `detached: true`, which on Windows means DETACHED_PROCESS and therefore NO
   * CONSOLE — and a PowerShell with no console cannot create a process through
   * `Start-Process`, which goes via ShellExecute when `-WindowStyle` is given.
   * It exits 0 and says nothing, which is why three earlier hypotheses about the
   * command's quoting were all refuted: the command was never the problem.
   *
   * So PowerShell is removed from the launch path entirely. `child_process.spawn`
   * calls CreateProcess directly — no shell, no ShellExecute, no window station —
   * and a detached child of THIS keeper still outlives the session, which was the
   * original reason `Start-Process` was reached for.
   *
   * `stdio: 'ignore'`: the runner already redirects its own output into
   * stage-runner.log inside walk-launch.sh, and a pipe held open across an
   * unref'd detached child is a handle this process would then own forever.
   */
  const bash = process.env.KEEPER_BASH ?? 'C:/Program Files/Git/bin/bash.exe';
  appendFileSync(
    RELAUNCH_LOG,
    `${new Date().toISOString()}  relaunch COMMAND  spawn ${bash} ${WALK_LAUNCH} (cwd ${ROOT}, detached, no shell)
`,
  );
  try {
    const child = spawn(bash, [WALK_LAUNCH], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (e) =>
      appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  spawn error  ${e.message}
`),
    );
    child.unref();
    appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  spawned walk pid ${String(child.pid)}
`);
  } catch (e) {
    appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  spawn threw  ${e?.message ?? e}
`);
  }

  note('WALK RELAUNCH issued (killed any survivors first)');
  // ...and then CHECK, because "issued" is not "happened".
  //
  // On 21 Aug this function logged "RELAUNCH issued" 51 consecutive times, five
  // minutes apart, while the walk stayed dead for four hours and twenty minutes.
  // Every one of those lines was written unconditionally. The verification below
  // is what turned 21 more identical failures into something diagnosable, and it
  // STAYS now that the launch works — a launch that succeeds today can stop
  // succeeding tomorrow, and the log must be the thing that notices.
  setTimeout(() => {
    verifyRelaunch().catch((e) => note('relaunch verification errored: ' + (e?.message ?? e)));
  }, RELAUNCH_VERIFY_MS).unref?.();
}

/** How long to give Start-Process before asking whether anything actually started. */
const RELAUNCH_VERIFY_MS = 20_000;

/** Consecutive relaunches that produced no runner. Escalates the log, never silently. */
let failedRelaunches = 0;

/**
 * Did the relaunch produce a live runner? Answered from the process table, not
 * from the fact that `spawn` did not throw.
 */
async function verifyRelaunch() {
  const ps = [
    '@(Get-CimInstance Win32_Process |',
    "Where-Object { $_.Name -ne 'powershell.exe' -and $_.CommandLine -match 'stage-runner|doc-vector-embed' }).Count",
  ].join(' ');
  const out = await new Promise((resolve) => {
    let buf = '';
    const c = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    c.stdout.on('data', (d) => (buf += d));
    c.on('close', () => resolve(buf.trim()));
    c.on('error', () => resolve(''));
  });
  const n = Number.parseInt(out, 10);
  if (Number.isFinite(n) && n > 0) {
    if (failedRelaunches > 0) note(`relaunch VERIFIED after ${failedRelaunches} failed attempt(s) — ${n} process(es)`);
    else note(`relaunch VERIFIED — ${n} walk process(es) live`);
    failedRelaunches = 0;
    return;
  }
  failedRelaunches += 1;
  // Deliberately loud and deliberately not fatal: the keeper's job is to keep
  // trying, but a human reading this log must not have to count identical lines
  // to notice that none of them worked.
  note(
    `relaunch DID NOT TAKE — no walk process ${RELAUNCH_VERIFY_MS / 1000}s after Start-Process ` +
      `(consecutive failures: ${failedRelaunches}). The walk is NOT running. ` +
      'Check the last FAILED line in stage-embed.log — a contract-hash refusal will fail every retry identically.',
  );
}

/**
 * A DELIBERATE PAUSE, so that quieting the box for a measurement does not mean
 * fighting the keeper.
 *
 * The walk and this lane's experiments are two GPU consumers on one sidecar, and
 * that is already measured as the working limit on this box. When a
 * decision-critical experiment needs the GPU, the walk has to stop — and until
 * now the only way to stop it was to kill it and then watch the keeper faithfully
 * restart it five minutes later, which is the keeper doing its job.
 *
 * The pause is a FILE, not an env var, because the keeper is started by Task
 * Scheduler and nobody can hand it an environment. It holds a reason; an
 * unexplained pause is how a walk stays down for a week.
 */
function walkPausedReason() {
  try {
    const reason = readFileSync(WALK_PAUSE, 'utf8').trim();
    return reason.length > 0 ? reason : 'no reason recorded';
  } catch {
    return null;
  }
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
  let pauseAnnounced = false;
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
        /**
         * WAIT FOR IT TO ANSWER, DO NOT SLEEP A GUESS.
         *
         * This was `setTimeout(WARMUP_MS)` with WARMUP_MS = 45s, and the model
         * takes longer than that to load: measured on this box, "model loaded in
         * 49.8s" under IO pressure and 27.0s clean. So the keeper resumed
         * counting misses BEFORE the sidecar could possibly answer, hit two
         * misses in 40s, and restarted a process whose only fault was still
         * starting. Observed 25 Aug: spawn 05:10:06 → RESTART #2 at 05:11:11,
         * a storm forming out of nothing but a stopwatch set too short.
         *
         * A fixed sleep is the wrong shape regardless of its value — it is
         * either too short on a loaded box or wasted time on an idle one. This
         * polls for the answer and proceeds the moment it arrives, with a
         * ceiling so a sidecar that will NEVER answer still gets escalated.
         *
         * The keeper exists to restart a STALLED sidecar. A STARTING one is not
         * stalled, and the two must not look the same.
         */
        const warmupDeadline = Date.now() + WARMUP_CEILING_MS;
        let warmedUp = false;
        while (Date.now() < warmupDeadline) {
          await new Promise((r) => setTimeout(r, WARMUP_POLL_MS));
          if (await healthy()) {
            warmedUp = true;
            note(`sidecar answered ${Math.round((Date.now() - (warmupDeadline - WARMUP_CEILING_MS)) / 1000)}s after spawn`);
            break;
          }
        }
        if (!warmedUp) {
          note(
            `sidecar STILL not answering ${WARMUP_CEILING_MS / 1000}s after spawn — this is a genuine failure, not a slow model load.`,
          );
        }
        lastOk = Date.now();
        continue;
      }
    }

    // The walk is judged only while the sidecar is answering. Relaunching a walk
    // into a dead sidecar burns its three retries and aborts it for good.
    if (WATCH_WALK && ok && Date.now() - walkQuietSince > WALK_GRACE_MS) {
      const paused = walkPausedReason();
      const silent = walkSilentFor();
      if (paused !== null) {
        if (silent > WALK_SILENCE_MS && !pauseAnnounced) {
          note(`walk relaunch PAUSED by ${WALK_PAUSE} — ${paused}. The walk is NOT running and that is deliberate.`);
          pauseAnnounced = true;
        }
      } else if (silent > WALK_SILENCE_MS) {
        pauseAnnounced = false;
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
