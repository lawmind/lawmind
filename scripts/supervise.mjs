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
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const finished = () =>
  existsSync(logPath) && /^RESULTS/m.test(readFileSync(logPath, 'utf8').slice(-4000));

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
  if (finished()) {
    note('worker finished cleanly — not restarting.');
    break;
  }

  const startedAt = Date.now();
  const code = await new Promise((resolve) => {
    /**
     * `shell: true` is REQUIRED on Windows and is not a style choice: `npx.cmd`
     * is a batch script, and spawning one without a shell fails with
     * `spawn EINVAL`. The first version of this supervisor did exactly that and
     * died before launching anything -- a supervisor that cannot spawn is worse
     * than no supervisor, because it looks like coverage.
     *
     * The arguments are ours, not user input, so the shell is not an injection
     * surface here.
     */
    /**
     * ARGUMENTS ARE RE-QUOTED, and skipping that silently corrupted a run.
     *
     * With `shell: true` Node joins the argv array into ONE command line
     * without quoting anything, so `--court "High Court of Gujarat"` reaches
     * the worker as four separate tokens and `--court` picks up `High`. The
     * pass then selected zero rows and reported "examined 0 · REPAIRED 0" —
     * a clean-looking success for work it never did, which is the worst way
     * for this to fail.
     *
     * Anything containing whitespace is wrapped; embedded quotes are escaped.
     */
    const quoted = ['tsx', ...args].map((a) =>
      /\s/.test(a) ? `"${a.replace(/(["\\])/g, '\\$1')}"` : a,
    );
    const child = spawn('npx.cmd', quoted, {
      cwd: join(ROOT, 'services', 'ingest'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    // Append rather than truncate: the log is the resume story across restarts.
    const append = (buf) => {
      try {
        appendFileSync(logPath, buf);
      } catch {
        /* ignore */
      }
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (err) => {
      note(`spawn failed: ${err.message}`);
      resolve(-1);
    });
    child.on('close', resolve);
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
