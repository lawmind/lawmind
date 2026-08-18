#!/usr/bin/env node
/**
 * Keeps a resumable ingest worker alive across transient network death.
 *
 *   node scripts/supervise.mjs <log-name> -- <tsx args…>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SUPERVISOR RATHER THAN A RETRY IN EVERY CLI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Six long passes have now died the same way: **"Detected unsettled top-level
 * await"**, which is what Node prints when a promise never settles and the
 * process exits with nothing left to do. NEW2 root-caused it (bus 0159):
 * `getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net` — the Railway proxy's
 * hostname transiently fails to resolve on this machine's network path. It is
 * not proxy load and not a code defect.
 *
 * **`connect_timeout` does not save you from it**, which is the part worth
 * knowing: that timeout governs establishing a connection, and a DNS lookup
 * that stalls never gets far enough to be timed. Every one of my workers had
 * `connect_timeout: 120` and died anyway.
 *
 * Each worker could grow its own top-level retry — NEW2 did exactly that for
 * `hc-load-cli` and it was the right call there. But I have six workers and
 * every future one inherits the same hazard, so the retry belongs **outside**
 * them, once. `CLAUDE.md`'s ponytail ladder: the best code is the code you
 * never wrote, and six copies of a retry loop is five too many.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS SAFE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Every supervised worker is resumable by construction.** They skip documents
 * that already have rows, so a restart re-pays nothing and cannot double-write.
 * A supervisor in front of a non-resumable job would be a way to corrupt data
 * quickly; in front of these it is free.
 *
 * **A clean finish is never restarted.** A worker that printed its `RESULTS`
 * block did its job, and relaunching it would loop forever over an empty queue.
 *
 * **A real defect still stops.** Restarts are capped, and a worker that dies
 * immediately on every attempt is reported rather than hammered — repeating a
 * malformed query more slowly is not resilience.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND A WORKER THAT STOPS WITHOUT DYING — the case everything above misses
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every rule above reacts to the child EXITING. A child that HANGS never exits,
 * so none of them fire and the scope is silently down while the process table
 * still shows it.
 *
 * Measured 18 Aug 2026: `hc-boot-mid-3_22` stopped at 07:59:58 — the exact
 * instant the PostgreSQL service was restarted — and sat there ~25 minutes,
 * blocked on a connection the restart took away without tearing the socket down.
 * Its checkpoint offset never moved once. Nothing in this file noticed, because
 * nothing had exited.
 *
 * It was invisible from the outside too: the corpus was gaining ~800k rows/hour
 * from the other ten scopes, so **every aggregate looked healthy**. A human found
 * it by diffing per-scope checkpoint offsets.
 *
 * `db-transient.ts` cannot help here and it is not a gap in it. A retry needs
 * something to catch; a hang throws nothing. The only signal a stalled worker
 * emits is SILENCE, so that is what is watched: these workers print a progress
 * line every batch, and a log that has not grown in `STALL_MS` is a worker that
 * is not working. Killing it turns the one failure this file could not see into
 * the one it handles best — an exit.
 *
 * The threshold is deliberately generous. The slowest healthy rate observed
 * across the fleet is 0.7 docs/s, which is still ~600 documents inside the
 * window, and a single hostile PDF is separately bounded by the extractor's own
 * timeout. Being wrong this way costs one restart from a checkpoint; being wrong
 * the other way cost 25 minutes and would have cost the rest of the run.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout, setInterval, clearInterval } from 'node:timers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const sep = process.argv.indexOf('--');
const logName = process.argv[2];
if (!logName || sep === -1) {
  console.error('usage: node scripts/supervise.mjs <log-name> -- <tsx args…>');
  process.exit(2);
}
const args = process.argv.slice(sep + 1);
const logPath = join(ROOT, `${logName}.log`);

/** Enough to ride out a DNS blip that lasts minutes, not enough to mask a defect. */
const MAX_RESTARTS = 40;
/** A worker that dies faster than this never did any work — likely a real defect. */
const TOO_FAST_MS = 20_000;
/**
 * How long a supervised worker may produce NO output before it is treated as
 * hung. See the header: a hang emits nothing, so silence is the only signal.
 * Generous on purpose — the slowest healthy rate measured across the fleet is
 * 0.7 docs/s, which still writes a progress line every few minutes.
 */
const STALL_MS = Number(process.env['SUPERVISE_STALL_MS'] ?? 15 * 60_000);
/** Cheap enough to run often; the check is one integer comparison. */
const STALL_POLL_MS = 30_000;

const finished = () =>
  existsSync(logPath) && /^RESULTS/m.test(readFileSync(logPath, 'utf8').slice(-4000));

/**
 * THE FLEET-WIDE PAUSE SWITCH, added 15 Aug 2026 for the Railway -> local
 * PostgreSQL cutover. `scripts/fleet-stop.ps1` is what writes it.
 *
 * Without this, a graceful pause is impossible to express. The worker side
 * (hc-load-cli's `stopIfRequested`) exits cleanly at a batch boundary, but a
 * supervisor that does not also know about the pause simply RESTARTS it — and
 * the restarted worker exits at once, so the pause reads as a crash loop and
 * burns the 40-restart budget while opening a database connection per attempt.
 * Both halves have to honour the same file or neither does.
 *
 * It is checked before each restart rather than only at entry, because the
 * point of the switch is to stop a fleet that is ALREADY RUNNING.
 *
 * NOTE FOR THE OTHER LANE: this file supervises LCC's paragraph and citation
 * workers too, so this switch stops those as well. That is deliberate and was
 * sent to LCC on the bus rather than slipped in — a database cutover has to
 * quiesce every writer, and a pause switch that stopped only some of them would
 * be worse than none. It is inert until the file exists, and only fleet-stop
 * writes it.
 */
const STOP_FILE = join(ROOT, 'services', 'ingest', '.checkpoints', 'STOP');

function note(line) {
  const stamped = `\n[supervisor ${new Date().toISOString()}] ${line}\n`;
  process.stdout.write(stamped);
  try {
    appendFileSync(logPath, stamped);
  } catch {
    // A log we cannot append to is not a reason to stop supervising.
  }
}

let restarts = 0;
let consecutiveFast = 0;

for (;;) {
  if (existsSync(STOP_FILE)) {
    note(`PAUSED: ${STOP_FILE} exists — not restarting. Delete it and relaunch to resume.`);
    break;
  }
  if (finished()) {
    note('worker finished cleanly — not restarting.');
    break;
  }

  const startedAt = Date.now();
  const code = await new Promise((resolve) => {
    /**
     * THE WORKER IS SPAWNED DIRECTLY: `node tsx/dist/cli.mjs ...`.
     *
     * It used to be `spawn('npx.cmd', ['tsx', ...args], { shell: true })`, and the
     * reasoning for that was sound: `npx.cmd` is a batch script, spawning one
     * without a shell fails with `spawn EINVAL`, and a supervisor that cannot spawn
     * is worse than no supervisor because it looks like coverage.
     *
     * Every word of that is still true, and the premise is avoidable. `npx` was
     * only ever resolving `tsx`, which lives at a known path inside this repo -- so
     * the shell and the `.cmd` and the whole npx layer exist to answer a question
     * that can be answered statically. Counted on the live fleet, 18 Aug 2026:
     *
     *     supervise.mjs -> cmd.exe -> npx-cli.js -> tsx/dist/cli.mjs -> worker
     *
     * The `npx-cli.js` hop is a full Node process holding ~79 MB and doing nothing
     * after startup. At the eight-scope rung that is ~630 MB; at the twenty-scope
     * width where PostgreSQL was killed it is ~1.6 GB -- spent entirely on path
     * resolution. Free RAM is the measured ceiling on fleet width (LCC, bus 0670:
     * 5.7% free with 71 node processes shortly before the postmaster died), so a
     * process per scope is not bookkeeping. It is width.
     *
     * Removing the shell removes a defect class rather than guarding against it.
     * The re-quoting this call used to do existed because `shell: true` makes Node
     * join argv into ONE command line without quoting, so
     * `--court "High Court of Gujarat"` arrived as four tokens and `--court` picked
     * up `High`; the pass then selected zero rows and reported a clean-looking
     * success for work it never did. With no shell, argv is passed through as an
     * array and cannot be re-split. The quoting is gone because the hazard is gone,
     * not because it was tidied away.
     *
     * `process.execPath` rather than the string `node`: the supervisor must launch
     * the worker on the interpreter it is itself running on, and that is also the
     * one lookup a broken PATH cannot take away.
     */
    const child = spawn(
      process.execPath,
      [join(ROOT, 'services', 'ingest', 'node_modules', 'tsx', 'dist', 'cli.mjs'), ...args],
      {
        cwd: join(ROOT, 'services', 'ingest'),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    /**
     * Last time the child said ANYTHING. Updated from the data handlers rather
     * than by stat-ing the log, because the log is shared across restarts and
     * appended by whoever ran last — its mtime is not this child's liveness.
     */
    let lastOutputAt = Date.now();
    // Append rather than truncate: the log is the resume story across restarts.
    const append = (buf) => {
      lastOutputAt = Date.now();
      try {
        appendFileSync(logPath, buf);
      } catch {
        /* ignore */
      }
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    /**
     * THE STALL WATCHDOG. Turns a hang — which this supervisor cannot see —
     * into an exit, which is the only thing it handles.
     *
     * SIGKILL rather than SIGTERM: the worker is wedged on a socket that will
     * never answer, so asking it politely is asking the thing that is stuck to
     * unstick itself. Every supervised worker is resumable from its checkpoint,
     * so the cost is at most one re-read batch.
     *
     * The kill makes `child.on('close')` fire, so the normal restart path —
     * backoff, `consecutiveFast`, `MAX_RESTARTS`, the STOP check — applies
     * unchanged. A worker that hangs on every attempt therefore still gets
     * reported and stopped rather than restarted forever.
     */
    const watchdog = setInterval(() => {
      const silentFor = Date.now() - lastOutputAt;
      if (silentFor < STALL_MS) return;
      note(
        `STALLED — no output for ${(silentFor / 60_000).toFixed(1)} min (limit ` +
          `${(STALL_MS / 60_000).toFixed(1)} min). A hang exits nothing, so killing it to ` +
          'restart from the checkpoint.',
      );
      clearInterval(watchdog);
      try {
        child.kill('SIGKILL');
      } catch {
        /* the close handler below reports whatever happens next */
      }
    }, STALL_POLL_MS);
    /** Unref'd so a finished supervisor is never held open by its own timer. */
    watchdog.unref?.();
    const stopWatchdog = () => clearInterval(watchdog);
    child.on('error', (err) => {
      stopWatchdog();
      note(`spawn failed: ${err.message}`);
      resolve(-1);
    });
    child.on('close', (code) => {
      stopWatchdog();
      resolve(code);
    });
  });

  const ranFor = Date.now() - startedAt;
  if (finished()) {
    note(`worker finished cleanly after ${restarts} restart(s).`);
    break;
  }

  consecutiveFast = ranFor < TOO_FAST_MS ? consecutiveFast + 1 : 0;
  if (consecutiveFast >= 3) {
    note(
      `died within ${TOO_FAST_MS / 1000}s three times running (exit ${code}) — ` +
        'this is a defect, not a network blip. Stopping.',
    );
    break;
  }
  if (++restarts > MAX_RESTARTS) {
    note(`exceeded ${MAX_RESTARTS} restarts — stopping rather than looping forever.`);
    break;
  }

  const wait = Math.min(60_000, 2000 * 2 ** Math.min(consecutiveFast, 5));
  note(`exited ${code} after ${(ranFor / 1000).toFixed(0)}s without finishing — restart ${restarts} in ${wait / 1000}s`);
  await new Promise((r) => setTimeout(r, wait));
}
