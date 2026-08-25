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

/**
 * THE TRANCHE EMBED IS THE SECOND GPU CONSUMER, AND IT HAD NO KEEPER AT ALL.
 *
 * 25 Aug, and it is the reason this block exists. The sidecar wedged at 16:44Z.
 * This keeper noticed within 90 seconds and had it answering again by 16:49:50 —
 * that half worked exactly as designed. But the tranche embedder had already died
 * on the stalled request (an uncaught `AbortSignal.timeout`), and **nothing
 * watched it**, because everything here watches `stage-embed.log` and the tranche
 * writes to `tranche-embed.log`. So the sidecar was healthy from 16:49 and the GPU
 * sat at zero until a human restarted the embedder at 17:02.
 *
 * Thirteen idle minutes because the keeper was fixing the dependency and nobody
 * was watching the dependent. Overnight that is not thirteen minutes.
 *
 * Same discipline as the walk, and one rule the walk does not need:
 * **`TRANCHE EMBED DONE` means never relaunch.** A finished job's log goes silent
 * forever, and silence is this keeper's only signal — without that check it would
 * restart a completed tranche every ten minutes until someone noticed.
 */
const TRANCHE_LOG = join(ROOT, 'docs', 'ai', 'new1-tier-a', 'tranche-embed.log');
const TRANCHE_LAUNCH = join(ROOT, 'services', 'harness', 'src', 'tranche-embed-launch.sh');
const TRANCHE_PAUSE = join(ROOT, '.agents', 'logs', 'new1-tranche-embed.pause');
const WATCH_TRANCHE = (process.env.KEEPER_WATCH_TRANCHE ?? '1') === '1';
/** It writes a progress line about every two minutes; five intervals of quiet is dead or hung. */
const TRANCHE_SILENCE_MS = Number(process.env.KEEPER_TRANCHE_SILENCE_MS ?? 10 * 60_000);
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
    const [pidText, , startedAtText] = held.split(/\s+/);
    const pid = Number(pidText);

    /**
     * A LIVE PID IS NOT THE SAME PROCESS. THIS COST THE LANE ITS SUPERVISOR.
     *
     * This used to be `process.kill(pid, 0)` and nothing else. On 25 Aug the
     * keeper died holding the lock; Windows then recycled its pid to
     * `smartscreen.exe`, and every subsequent 5-minute task run found a LIVE
     * process 18368 and refused:
     *
     *     lock file        18368  2026-08-25T05:16:03Z   (keeper, 09:16 local)
     *     pid 18368 today  smartscreen.exe, created 12:45:47 local
     *
     *     08:48:01  another keeper holds ... (pid 18368) — refusing to start
     *     08:53:01  another keeper holds ... (pid 18368) — refusing to start
     *
     * The lane had no keeper and no sidecar for hours, the scheduled task was
     * firing correctly the whole time, and it would never have recovered on its
     * own — the refusal is permanent once the pid is reused, because nothing
     * ages out.
     *
     * `scripts/lane-lease.mjs` already carries this lesson in its header: the
     * recorded pid must be alive AND STILL THE SAME PROCESS, "because pids are
     * recycled". That knowledge existed in the repo and this file did not have
     * it. So the lock now records the process START TIME and compares it, and a
     * mismatch is treated as stale rather than as a live owner.
     */
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }

    let sameProcess = true;
    if (alive && startedAtText) {
      const actual = processStartedAt(pid);
      if (actual === null) {
        // Could not read it. Prefer taking over: a keeper that will not start is
        // a worse failure than a brief second keeper, and the sidecar port is
        // now guarded by SO_EXCLUSIVEADDRUSE anyway.
        note(`could not read start time for pid ${pid}; treating the lock as stale rather than blocking forever`);
        sameProcess = false;
      } else {
        const drift = Math.abs(Date.parse(actual) - Date.parse(startedAtText));
        // The lock is written moments after the process starts, so a few seconds
        // of drift is expected and minutes of it is a different process.
        sameProcess = Number.isFinite(drift) && drift < 120_000;
        if (!sameProcess) {
          note(
            `pid ${pid} is ALIVE but started ${actual}, while the lock was written at ${startedAtText} — ` +
              'this is a RECYCLED pid, not the old keeper. Taking the lock over.',
          );
        }
      }
    }

    if (alive && sameProcess) {
      note(`another keeper holds ${LOCK} (pid ${pid}) — refusing to start a second one`);
      return false;
    }
    if (!alive) note(`stale lock from pid ${pid} (not running) — taking it over`);
  }
  // pid, lock-write time, and the PROCESS START TIME, which is the field that
  // makes the pid meaningful on a machine that reuses them.
  writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()} ${processStartedAt(process.pid) ?? 'unknown'}\n`);
  return true;
}

/** ISO start time of a pid from the OS, or null if it cannot be determined. */
function processStartedAt(pid) {
  try {
    const r = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}"; if ($p) { $p.CreationDate.ToUniversalTime().ToString("o") }`,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    const out = String(r.stdout ?? '').trim();
    return out.length > 0 && !Number.isNaN(Date.parse(out)) ? out : null;
  } catch {
    return null;
  }
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

function tranchePausedReason() {
  try {
    const reason = readFileSync(TRANCHE_PAUSE, 'utf8').trim();
    return reason.length > 0 ? reason : 'no reason recorded';
  } catch {
    return null;
  }
}

function trancheSilentFor() {
  try {
    return Date.now() - statSync(TRANCHE_LOG).mtimeMs;
  } catch {
    // No log at all is NOT "dead and needs relaunching" — it is "never started".
    // Relaunching on an absent file would start a tranche embed on any box that
    // simply has not run one.
    return Number.NEGATIVE_INFINITY;
  }
}

/**
 * Has the tranche already finished? Read from the log's own tail, because that is
 * the only durable statement the job makes about itself.
 *
 * Deliberately generous about how much tail it reads: the CLI writes a summary
 * block after `TRANCHE EMBED DONE`, so the marker is not guaranteed to be the very
 * last line.
 */
function trancheFinished() {
  try {
    const text = readFileSync(TRANCHE_LOG, 'utf8');
    return text.slice(-4000).includes('TRANCHE EMBED DONE');
  } catch {
    return false;
  }
}

/**
 * Kill any survivor, then relaunch. Structurally the same as `relaunchWalk`, and
 * the `$_.Name -ne 'powershell.exe'` guard is load-bearing for the same reason:
 * the querying shell's own command line contains the pattern it is matching on, so
 * an unguarded filter kills the shell mid-pipeline and exits 255 printing nothing,
 * which reads exactly like success.
 */
function relaunchTranche() {
  const killPs = [
    'Get-CimInstance Win32_Process |',
    "Where-Object { $_.Name -ne 'powershell.exe' -and $_.CommandLine -match 'tranche-embed-cli|tranche-embed-launch' } |",
    'ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }',
  ].join(' ');
  try {
    const k = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', killPs], {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 60_000,
    });
    const err = String(k.stderr ?? '').trim();
    if (err.length > 0)
      appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  tranche kill STDERR  ${err}\n`);
  } catch (e) {
    appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  tranche kill threw  ${e?.message ?? e}\n`);
  }

  const bash = process.env.KEEPER_BASH ?? 'C:/Program Files/Git/bin/bash.exe';
  appendFileSync(
    RELAUNCH_LOG,
    `${new Date().toISOString()}  tranche relaunch COMMAND  spawn ${bash} ${TRANCHE_LAUNCH} (cwd ${ROOT}, detached, no shell)\n`,
  );
  try {
    const child = spawn(bash, [TRANCHE_LAUNCH], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (e) =>
      appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  tranche spawn error  ${e.message}\n`),
    );
    child.unref();
    appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  spawned tranche pid ${String(child.pid)}\n`);
  } catch (e) {
    appendFileSync(RELAUNCH_LOG, `${new Date().toISOString()}  tranche spawn threw  ${e?.message ?? e}\n`);
  }

  note('TRANCHE EMBED RELAUNCH issued (killed any survivors first). It resumes from the last committed batch.');
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
  note(
    WATCH_TRANCHE
      ? `watching the tranche embed — ${TRANCHE_LOG} silent for ${TRANCHE_SILENCE_MS / 60_000} min means relaunch, ` +
          'unless it is paused or has already written TRANCHE EMBED DONE'
      : 'tranche watching DISABLED (KEEPER_WATCH_TRANCHE=0)',
  );

  let misses = 0;
  let restarts = 0;
  let walkRelaunches = 0;
  let walkQuietSince = 0;
  let pauseAnnounced = false;
  let trancheRelaunches = 0;
  let trancheQuietSince = 0;
  let tranchePauseAnnounced = false;
  let trancheDoneAnnounced = false;
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
        const spawnedPid = startSidecar();
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
            const secs = Math.round((Date.now() - (warmupDeadline - WARMUP_CEILING_MS)) / 1000);
            /**
             * DID MY SPAWN ACTUALLY TAKE, OR DID THE OLD ONE RECOVER?
             *
             * 25 Aug, 16:49:50Z, this line read "sidecar answered 3s after spawn"
             * and it was crediting itself for someone else's recovery. The sweep
             * had just logged `SWEEP FAILED — ETIMEDOUT. Assume the old sidecar is
             * STILL ALIVE`, so the incumbent still held port 8799 — and
             * `server.py` sets `SO_EXCLUSIVEADDRUSE`, so the newly spawned process
             * could not bind and exited. The health that came back was the OLD
             * sidecar un-wedging on its own after ~5.5 minutes.
             *
             * The distinction is not cosmetic. "My restart fixed it" and "it
             * recovered by itself and my restart did nothing" imply opposite
             * things about whether this keeper is load-bearing, and a log that
             * cannot tell them apart will keep reporting a working restart path
             * long after it has stopped working.
             */
            let mine = true;
            if (spawnedPid) {
              try {
                process.kill(spawnedPid, 0);
              } catch {
                mine = false;
              }
            }
            note(
              mine
                ? `sidecar answered ${secs}s after spawn (spawned pid ${String(spawnedPid)} is alive — this restart took)`
                : `sidecar answered ${secs}s after spawn, but spawned pid ${String(spawnedPid)} is GONE — ` +
                    'it could not bind the port and exited. The INCUMBENT recovered on its own; this restart did nothing. ' +
                    'Do not read this as a working restart path.',
            );
            break;
          }
        }
        if (!warmedUp) {
          /**
           * Deliberately does NOT claim this is a failure.
           *
           * The first wording said "this is a genuine failure, not a slow model
           * load", and the very first time it fired it was wrong: the sidecar
           * answered at ~200s because another GPU consumer was competing for the
           * card during its load. The ceiling cannot distinguish a dead sidecar
           * from a very slow one — that is precisely what it does not know — so
           * it reports the fact and hands the judgement back to normal polling
           * rather than asserting a cause it cannot see.
           */
          note(
            `sidecar has not answered ${WARMUP_CEILING_MS / 1000}s after spawn — resuming normal health polling. ` +
              'This may be a dead sidecar or a very slow load under GPU contention; this line cannot tell them apart.',
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

    // Same rule as the walk: judged only while the sidecar answers. Relaunching an
    // embedder into a dead sidecar burns its retries and aborts it for good.
    if (WATCH_TRANCHE && ok && Date.now() - trancheQuietSince > WALK_GRACE_MS) {
      const paused = tranchePausedReason();
      const silent = trancheSilentFor();
      if (trancheFinished()) {
        if (!trancheDoneAnnounced) {
          note('tranche embed reports TRANCHE EMBED DONE — not watched further. A finished job is silent by definition.');
          trancheDoneAnnounced = true;
        }
      } else if (paused !== null) {
        if (silent > TRANCHE_SILENCE_MS && !tranchePauseAnnounced) {
          note(`tranche relaunch PAUSED by ${TRANCHE_PAUSE} — ${paused}. It is NOT running and that is deliberate.`);
          tranchePauseAnnounced = true;
        }
      } else if (silent > TRANCHE_SILENCE_MS) {
        tranchePauseAnnounced = false;
        trancheRelaunches += 1;
        note(
          `TRANCHE EMBED SILENT for ${Math.round(silent / 60_000)} min — relaunch #${trancheRelaunches}. ` +
            'Hung and dead look identical from here and want the same treatment.',
        );
        relaunchTranche();
        trancheQuietSince = Date.now();
      }
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.exitCode = (await main()) ?? 0;
