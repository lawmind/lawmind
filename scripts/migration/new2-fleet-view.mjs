#!/usr/bin/env node
/**
 * NEW2 — ONE ROW PER SCOPE, derived from the process table, not from a list.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AND WHY `new2-fleet-metrics.mjs` IS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `new2-fleet-metrics.mjs` answers "is the fleet working" with AGGREGATES —
 * documents/hour, a summed checkpoint offset, one workers-alive integer. Every
 * one of those has now hidden a dead scope at least once:
 *
 *   17 Aug  two canaries died on a transient EPERM and the verifier passed,
 *           because row growth is a sum (bus 0665).
 *   18 Aug  `3_22` reconnected after the postmaster restart, re-walked a
 *           different year partition and wrote nothing for ~18 minutes at
 *           0.9 docs/s against 35.2 — while the corpus gained ~800k rows/hour
 *           from the other ten scopes and every aggregate read healthy
 *           (bus 0693, 0701).
 *
 * A sum over eleven scopes cannot report on one of them. So this tool never
 * sums anything across scopes: it prints a row per scope and a per-scope
 * verdict, and the fleet verdict is the WORST row, not the total.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SCOPE LIST COMES FROM THE PROCESS TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Not from `.checkpoints/*.json` (49 files, most of them finished bands), not
 * from a plan file, and not from the log directory. All three describe what was
 * *intended*; only the process table describes what is *running*, and the gap
 * between those two is the entire class of defect this tool exists for — on
 * 18 Aug eighteen scopes were down and nothing had relaunched them, which no
 * artifact on disk could have revealed (bus 0701).
 *
 * Each supervisor's argv carries `--court/--from-year/--to-year`, so the
 * checkpoint path is DERIVED with `hc-load-cli.ts`'s own rule rather than
 * guessed from the log name. A guess would silently read the wrong file the
 * moment a scope's year window changes, and read it successfully.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROGRESS LINES, NOT LOG BYTES — the measurement the watchdog cannot make
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `supervise.mjs`'s stall watchdog treats ANY stdout byte as life. That is
 * unsafe for exactly one reason, and it is not hypothetical: unpdf's bundled
 * pdfjs repairs a malformed embedded font by calling `Math.sumPrecise`, which
 * does not exist on Node v24.14.1, and the failure is swallowed as a warning
 * rather than thrown (`hc-metadata.ts` documents the dead run it was found by).
 * The worker then prints that warning **on a loop, forever**, having stopped
 * advancing. Measured on this fleet 18 Aug: 7,363 of the last 7,395 lines of
 * `hc-boot-hist-3_22.log` were that one warning.
 *
 * So a hang in that shape produces a log that GROWS FASTER THAN A HEALTHY ONE
 * while the scope does nothing. Log mtime, log size and the watchdog all read
 * it as alive. The only honest signals are the ones the worker emits when it
 * has actually done work:
 *
 *   - the `[n] mapped=… written=…` progress line, and
 *   - the checkpoint offset, which only moves after a batch commits.
 *
 * Both are sampled twice here, `--window` seconds apart. A scope that moves
 * neither is DOWN whatever its log is doing.
 *
 *   node scripts/migration/new2-fleet-view.mjs [--window 90] [--json]
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CKPT_DIR = join(ROOT, 'services', 'ingest', '.checkpoints');
const OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-fleet-view.json');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
/**
 * THE WINDOW HAS TO BE LONGER THAN ONE BATCH, AND THE DEFAULT WAS NOT.
 *
 * These workers commit in batches of 200 documents and only then move the
 * checkpoint and print a progress line. A scope running at the slowest healthy
 * rate measured across this fleet — 0.7 docs/s — therefore emits NOTHING for
 * ~285 seconds while working perfectly.
 *
 * Sampled over 90 s, that scope shows `ckpt+ 0  writ+ 0` with a growing log,
 * which is exactly the signature of the `Math.sumPrecise` hang this tool was
 * built to expose. Measured 18 Aug 2026: at `--window 60` three of eight scopes
 * read `log-only`; the same eight at `--window 300` read `ok`, having advanced
 * 1,400-4,161 documents each. **All three were false alarms, from this tool.**
 *
 * That is worse than a missed detection. A watchdog that cries wolf gets
 * ignored, and the next thing ignored is the real hang. So the default is now
 * longer than the slowest batch interval, and a shorter window does not produce
 * a confident bad verdict — it produces `inconclusive`, below.
 */
const MIN_CONCLUSIVE_S = 300;
const WINDOW_S = Number(arg('window', String(MIN_CONCLUSIVE_S)));
const JSON_ONLY = process.argv.includes('--json');

/**
 * Every `node.exe` with its full command line.
 *
 * PowerShell rather than `pgrep`: `pgrep` does not exist on this box and
 * `! pgrep -f x` therefore reports GONE for everything, which is how a live
 * fleet was once recorded as dead. `Win32_Process` is the only source here
 * that carries both the parent link and the argv.
 */
function processTable() {
  const ps =
    'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
    'ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.CommandLine)" }';
  let out;
  try {
    out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    /* An unreadable process table is not an empty fleet, but this tool samples
     * twice and a missing sample simply produces no rows for that pass. */
    return [];
  }
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid, ...rest] = line.split('|');
      return { pid: Number(pid), ppid: Number(ppid), cmd: rest.join('|') ?? '' };
    })
    .filter((p) => Number.isFinite(p.pid));
}

/**
 * `hc-load-cli.ts` builds its checkpoint path as
 * `${court}${year ? -y{year} : ''}${toYear ? -to{toYear} : ''}.json`.
 *
 * Reproduced from the flags rather than parsed out of the supervisor's log
 * name, because the log name is a human label (`hc-boot-hist-27_1`) chosen by
 * the launcher and carries no year window at all. Two scopes for one court —
 * which is the whole point of the hist/mid split — share a log-name stem
 * prefix and would collide.
 */
function checkpointPathFor(argv) {
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? null : argv[i + 1];
  };
  const court = flag('court');
  if (!court) return null;
  const year = flag('year');
  const toYear = flag('to-year');
  return join(CKPT_DIR, `${court}${year ? `-y${year}` : ''}${toYear ? `-to${toYear}` : ''}.json`);
}

/** Sum of every per-file row offset. Only advances when a batch has committed. */
function checkpointOffset(path) {
  if (!path || !existsSync(path)) return { offset: null, files: 0, mtime: null };
  try {
    const raw = readFileSync(path, 'utf8');
    const obj = JSON.parse(raw);
    let sum = 0;
    let files = 0;
    for (const v of Object.values(obj)) {
      if (v && typeof v.offset === 'number') {
        sum += v.offset;
        files++;
      }
    }
    return { offset: sum, files, mtime: statSync(path).mtimeMs };
  } catch {
    return { offset: null, files: 0, mtime: null, unreadable: true };
  }
}

/** Reads the tail of a file without pulling the whole thing into memory. */
function tailOf(path, bytes) {
  const size = statSync(path).size;
  const span = Math.min(size, bytes);
  const buf = Buffer.alloc(span);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buf, 0, span, size - span);
  } finally {
    closeSync(fd);
  }
  return { text: buf.toString('utf8'), size };
}

/**
 * The last `[n] mapped=… written=…` line, read from the TAIL of the file.
 *
 * These logs run to 139 MB — reading one whole is a measurement that changes
 * what it measures, and reading eleven of them twice is worse. 256 KiB is
 * comfortably more than the warning flood can put between two progress lines
 * in a healthy scope, and a scope where it is not is reported as having no
 * progress, which is the correct answer for it.
 */
function lastProgress(logPath) {
  if (!existsSync(logPath)) return null;
  const { text, size } = tailOf(logPath, 256 * 1024);
  let last = null;
  const re = /\[([\d,]+)\]\s+mapped=([\d,]+)\s+written=([\d,]+)\s+([\d.]+)\s+docs\/s/g;
  for (let m; (m = re.exec(text)); ) last = m;
  if (!last) return null;
  const n = (s) => Number(s.replace(/,/g, ''));
  const partition = text.slice(last.index, last.index + 200).match(/docs\/s\s+\S\s+(\S+)/)?.[1] ?? null;
  return {
    seen: n(last[1]),
    mapped: n(last[2]),
    written: n(last[3]),
    docsPerS: Number(last[4]),
    partition,
    logSize: size,
  };
}

/**
 * Restarts and stall kills, counted from the supervisor's own notes.
 *
 * `supervise.mjs` appends `[supervisor …] …restart N…` and `…STALLED…` to the
 * SAME log the worker writes, so these live in the big file, not in the
 * `.super.log` (which holds only what the supervisor printed to its own stdout
 * and is 0 bytes for every scope launched detached).
 */
function supervisorNotes(logPath) {
  if (!existsSync(logPath)) return { restarts: 0, stalls: 0, lastNote: null, finished: false };
  const { text } = tailOf(logPath, 2 * 1024 * 1024);
  /**
   * A worker that printed `RESULTS` did its job and stopped on purpose.
   *
   * `supervise.mjs` uses exactly this test to decide not to restart, so a scope
   * in that state is winding down, not broken — but it presents to the sampler
   * as a live supervisor whose checkpoint, counters and log have all stopped
   * moving, which is the signature of a hang.
   *
   * Measured 18 Aug 2026: `23_23` finished at 104,783 of 104,831 documents
   * (99.95% of source) and this tool called it `down`. That is the most
   * expensive false alarm available here — the obvious response to `down` is to
   * relaunch, and relaunching a finished scope re-walks a completed court.
   */
  const finished = /^RESULTS/m.test(text.slice(-8000));
  const notes = [...text.matchAll(/\[supervisor ([^\]]+)\] (.+)/g)];
  const restarts = notes.filter((m) => /restart \d+ in/.test(m[2])).length;
  const stalls = notes.filter((m) => /^STALLED/.test(m[2])).length;
  const lastNote = notes.length ? { at: notes.at(-1)[1], text: notes.at(-1)[2].slice(0, 120) } : null;
  return { restarts, stalls, lastNote, finished };
}

function sample() {
  const table = processTable();
  const supervisors = table.filter((p) => /supervise\.mjs/.test(p.cmd));

  return supervisors.map((sup) => {
    const m = sup.cmd.match(/supervise\.mjs\s+(\S+)\s+--\s+(.*)$/);
    const name = m?.[1] ?? 'unknown';
    const argv = (m?.[2] ?? '').trim().split(/\s+/);
    const logPath = join(ROOT, `${name}.log`);
    const ckptPath = checkpointPathFor(argv);

    /* The worker chain is supervisor -> tsx/cli.mjs -> the real process. Both
     * matter: a supervisor with no child is between restarts, which is a
     * different state from a supervisor whose child is wedged. */
    const kids = table.filter((p) => p.ppid === sup.pid);
    const grandkids = kids.flatMap((k) => table.filter((p) => p.ppid === k.pid));

    return {
      scope: name,
      court: argv[argv.indexOf('--court') + 1] ?? null,
      fromYear: argv.includes('--from-year') ? Number(argv[argv.indexOf('--from-year') + 1]) : null,
      toYear: argv.includes('--to-year') ? Number(argv[argv.indexOf('--to-year') + 1]) : null,
      supervisorPid: sup.pid,
      workerPids: [...kids, ...grandkids].map((p) => p.pid),
      checkpointPath: ckptPath ? ckptPath.replace(ROOT, '.') : null,
      checkpoint: checkpointOffset(ckptPath),
      progress: lastProgress(logPath),
      logMtime: existsSync(logPath) ? statSync(logPath).mtimeMs : null,
      logSize: existsSync(logPath) ? statSync(logPath).size : null,
      ...supervisorNotes(logPath),
    };
  });
}

const before = sample();
if (!JSON_ONLY) {
  console.log(`NEW2 FLEET VIEW — ${before.length} supervisor(s), sampling ${WINDOW_S}s…`);
}
await sleep(WINDOW_S * 1000);
const after = sample();

const beforeByScope = new Map(before.map((s) => [s.scope, s]));
const now = Date.now();

const rows = after.map((a) => {
  const b = beforeByScope.get(a.scope);
  const ckptDelta =
    b?.checkpoint?.offset != null && a.checkpoint?.offset != null ? a.checkpoint.offset - b.checkpoint.offset : null;
  const rawWrittenDelta =
    b?.progress?.written != null && a.progress?.written != null ? a.progress.written - b.progress.written : null;
  /**
   * A NEGATIVE delta is a counter RESET, not negative progress.
   *
   * The log is appended across restarts, so a scope that relaunched between the
   * two samples has the previous run's high-water line in the first sample and
   * the new run's low counter in the second. Measured on the two scopes launched
   * 19 Aug: `-120846` and `-65066`, while both checkpoints advanced normally.
   *
   * Reported as `null` (unknown) rather than as a number, because a negative
   * rate is not a thing and printing one invites someone to read it as loss.
   * The checkpoint delta is the trustworthy signal across a restart and the
   * verdict already prefers it.
   */
  const writtenDelta = rawWrittenDelta != null && rawWrittenDelta < 0 ? null : rawWrittenDelta;
  const counterReset = rawWrittenDelta != null && rawWrittenDelta < 0;
  const logDelta = b?.logSize != null && a.logSize != null ? a.logSize - b.logSize : null;

  /**
   * THE VERDICT, and the order of the tests is the finding.
   *
   * `log-only` sits ABOVE `down` deliberately: a scope whose log is growing
   * while neither its checkpoint nor its written counter moves is the
   * `Math.sumPrecise` hang, and it is the one state that every other tool we
   * own — including the supervisor's own watchdog — scores as healthy. Calling
   * it `down` would be true but would lose the reason.
   */
  let verdict;
  /* Checked FIRST: a finished scope is neither healthy nor broken, and both of
   * those answers provoke the wrong action. See supervisorNotes. */
  if (a.finished) verdict = 'finished';
  else if (a.workerPids.length === 0) verdict = 'no-worker';
  else if (ckptDelta > 0 || writtenDelta > 0) verdict = 'ok';
  /**
   * A window too short to contain one batch cannot tell a hang from a healthy
   * slow scope, so it does not try. `inconclusive` is a real answer and is not
   * counted against the fleet — see MIN_CONCLUSIVE_S for the run where this
   * tool reported three healthy scopes as hung.
   */
  else if (WINDOW_S < MIN_CONCLUSIVE_S) verdict = 'inconclusive';
  else if (logDelta > 0) verdict = 'log-only';
  else verdict = 'down';

  return {
    scope: a.scope,
    court: a.court,
    band: a.fromYear ? `${a.fromYear}-${a.toYear ?? 'now'}` : 'recent',
    verdict,
    supervisorPid: a.supervisorPid,
    workers: a.workerPids.length,
    checkpointOffset: a.checkpoint?.offset ?? null,
    checkpointDelta: ckptDelta,
    checkpointAgeS: a.checkpoint?.mtime ? Math.round((now - a.checkpoint.mtime) / 1000) : null,
    written: a.progress?.written ?? null,
    writtenDelta,
    counterReset,
    docsPerS: a.progress?.docsPerS ?? null,
    partition: a.progress?.partition ?? null,
    logDeltaBytes: logDelta,
    logSizeMB: a.logSize != null ? Number((a.logSize / 1048576).toFixed(1)) : null,
    restarts: a.restarts,
    stallKills: a.stalls,
    lastSupervisorNote: a.lastNote,
    checkpointPath: a.checkpointPath,
  };
});

rows.sort((x, y) => (x.scope < y.scope ? -1 : 1));

const counts = rows.reduce((acc, r) => ((acc[r.verdict] = (acc[r.verdict] ?? 0) + 1), acc), {});
const report = {
  at: new Date().toISOString(),
  windowSeconds: WINDOW_S,
  width: rows.length,
  healthy: counts.ok ?? 0,
  counts,
  /* The fleet is as healthy as its worst scope. A sum would say otherwise and
   * that is exactly the mistake this tool exists to stop making. */
  /**
   * `inconclusive` does not degrade the fleet. Reporting DEGRADED on a window
   * that cannot support the claim is how this tool would train people to
   * disregard it.
   */
  fleetVerdict:
    rows.length > 0 &&
    rows.every((r) => r.verdict === 'ok' || r.verdict === 'inconclusive' || r.verdict === 'finished')
      ? rows.some((r) => r.verdict === 'inconclusive')
        ? `OK-SO-FAR (window ${WINDOW_S}s is under ${MIN_CONCLUSIVE_S}s — re-run longer to conclude)`
        : 'ALL-OK'
      : 'DEGRADED',
  scopes: rows,
};

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (JSON_ONLY) {
  console.log(JSON.stringify(report));
} else {
  const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
  const num = (s, n) => String(s ?? '—').padStart(n);
  console.log(
    `\n  ${pad('scope', 22)} ${pad('band', 10)} ${pad('verdict', 9)} ${num('ckpt+', 7)} ${num('writ+', 7)} ` +
      `${num('docs/s', 7)} ${num('log+KB', 8)} ${num('rstrt', 5)} ${num('stall', 5)}  partition`,
  );
  for (const r of rows) {
    console.log(
      `  ${pad(r.scope, 22)} ${pad(r.band, 10)} ${pad(r.verdict, 9)} ${num(r.checkpointDelta, 7)} ` +
        `${num(r.writtenDelta, 7)} ${num(r.docsPerS, 7)} ${num(r.logDeltaBytes != null ? Math.round(r.logDeltaBytes / 1024) : null, 8)} ` +
        `${num(r.restarts, 5)} ${num(r.stallKills, 5)}  ${r.partition ?? '—'}`,
    );
  }
  console.log(
    `\n  width ${report.width}   ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')}   ` +
      `FLEET ${report.fleetVerdict}`,
  );
  console.log(`  wrote ${OUT.replace(ROOT, '.')}`);
}

/* A degraded fleet is a non-zero exit so this can gate a script. */
process.exit(report.fleetVerdict === 'DEGRADED' ? 1 : 0);
