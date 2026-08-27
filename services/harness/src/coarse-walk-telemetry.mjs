#!/usr/bin/env node
/**
 * NEW1 R9 — the 15-minute ledger for the coarse HEAD walk, and the stall rule.
 *
 * WHY THIS IS A SEPARATE PROCESS FROM THE WALK
 * ────────────────────────────────────────────
 * The walk cannot report on itself. The failure this round is written to prevent
 * is "healthy GPU + zero output": the sidecar answers, `nvidia-smi` reads 100%,
 * every batch prints START and END, and nothing lands. A reporter living inside
 * the walk observes the same lie the walk is telling. This one asks the DATABASE
 * what happened between two real timestamps, which is the only question a stalled
 * walk cannot answer optimistically.
 *
 * WHAT A WINDOW MEANS
 * ───────────────────
 * Rows land per FETCH_PAGE (200 documents, ~13 s), not per batch. So a 15-minute
 * window with zero new rows is NOT the normal shape of a 16-minute batch — it is
 * a stall. That is what makes the rule below safe to state in absolute terms.
 *
 *   1 zero window   noted, no action. Sidecar restarts and DB contention exist.
 *   2 zero windows  ALERT written to WALK_ALERT.json. 30 minutes of GPU for
 *                   nothing is already the failure the directive names.
 *   3 zero windows  STOP. The runner is killed. Nothing is lost: the stage is
 *                   idempotent per document and the checkpoint is the table.
 *
 * Three rather than two before killing, because a single false positive costs a
 * relaunch and a false negative costs 45 minutes — but a rule that only ever
 * warns is a rule that will be scrolled past, which is how the last one survived
 * four hours.
 *
 * ETA HONESTY
 * ───────────
 * `vectorsPerHourWindow` is measured over THIS window only and
 * `vectorsPerHourRun` over the whole run. The ETA is quoted from the run rate,
 * because a single window during someone else's table scan is not the rate the
 * next week will run at.
 */
import postgres from 'postgres';
import {
  readFileSync,
  appendFileSync,
  writeFileSync,
  existsSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const LEDGER = new URL('docs/ai/new1-r9/coarse-walk-telemetry.jsonl', ROOT);
const ALERT = new URL('docs/ai/new1-r9/WALK_ALERT.json', ROOT);
const RUNNER_LOG = new URL('docs/ai/new1-tier-a/stage-runner.log', ROOT);
const EMBED_LOG = new URL('docs/ai/new1-tier-a/stage-embed.log', ROOT);
const COVERAGE = new URL('docs/ai/new1-tier-a/stage-coverage.json', ROOT);

const INTERVAL_MS = Number(process.env.TELEMETRY_INTERVAL_MS ?? 15 * 60 * 1000);
const MAX_SAMPLES = Number(process.env.TELEMETRY_MAX_SAMPLES ?? 0); // 0 = forever
const GPU_BUSY_PCT = Number(process.env.TELEMETRY_GPU_BUSY_PCT ?? 40);
const AUTO_STOP = process.env.TELEMETRY_AUTO_STOP !== '0';

function tailLines(fileUrl, n) {
  if (!existsSync(fileUrl)) return [];
  const size = statSync(fileUrl).size;
  const want = Math.min(size, 200_000);
  const buf = Buffer.alloc(want);
  const fd = openSync(fileUrl, 'r');
  readSync(fd, buf, 0, want, size - want);
  closeSync(fd);
  return buf.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-n);
}

function gpu() {
  try {
    const out = execFileSync(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout: 15_000 },
    ).trim();
    const [util, used, total] = out.split(',').map((s) => Number(s.trim()));
    return { utilPct: util, vramUsedMiB: used, vramTotalMiB: total };
  } catch {
    return { utilPct: null, vramUsedMiB: null, vramTotalMiB: null, error: 'nvidia-smi unavailable' };
  }
}

/** Refusals are counted from the run log, not guessed: they are the GPU we did not spend. */
function refusalsSinceStart(startedAt) {
  let ineligible = 0;
  let textUnsafe = 0;
  let noText = 0;
  let batches = 0;
  let failures = 0;
  for (const line of tailLines(EMBED_LOG, 4000)) {
    // Time-filter the FAILED lines too. Without this the tail's historical
    // failures are counted forever and every report opens with the same five
    // errors that belong to a run that ended two days ago — which reads as an
    // ongoing fault and is the exact opposite of what the number is for.
    if (line.includes('FAILED ')) {
      const ts = line.match(/^(\S+)\s/)?.[1];
      if (ts && Date.parse(ts) >= startedAt) failures += 1;
      continue;
    }
    const i = line.indexOf('STAGE DONE {');
    if (i === -1) continue;
    let rec;
    try {
      rec = JSON.parse(line.slice(line.indexOf('{', i)));
    } catch {
      continue;
    }
    if (!rec.finishedAt || Date.parse(rec.finishedAt) < startedAt) continue;
    batches += 1;
    ineligible += rec.skippedNowIneligible ?? 0;
    textUnsafe += rec.skippedTextUnsafe ?? 0;
    noText += rec.skippedNoText ?? 0;
  }
  return { batches, ineligible, textUnsafe, noText, failures };
}

/** Kill the detached walk. The stage is idempotent, so this costs at most one batch. */
function stopWalk() {
  const killed = [];
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "stage-runner|walk-launch|doc-vector-embed" } | Select-Object -ExpandProperty ProcessId',
      ],
      { encoding: 'utf8', timeout: 30_000 },
    ).trim();
    for (const pid of out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      try {
        execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { encoding: 'utf8', timeout: 20_000 });
        killed.push(Number(pid));
      } catch {
        /* already gone */
      }
    }
  } catch (e) {
    return { killed, error: String(e?.message ?? e) };
  }
  return { killed };
}

const sql = postgres(url, { max: 1, idle_timeout: 30, connect_timeout: 20 });

const startedAt = Date.now();
const [{ n: startRows }] = await sql`SELECT count(*)::bigint AS n FROM new1_doc_vector_stage`;
const startCount = Number(startRows);

const cov = existsSync(COVERAGE) ? JSON.parse(readFileSync(COVERAGE, 'utf8')) : null;
// The denominator is the CENSUS population, stated once and never recomputed
// mid-run: a denominator that moves makes every percentage in the ledger
// incomparable with the one above it.
const eligibleTotal = cov ? cov.manifestRows : null;
const realRemainingAtStart = cov
  ? cov.cells.filter((c) => !c.complete).reduce((a, c) => a + c.missing, 0)
  : null;

let prev = startCount;
let zeroWindows = 0;
let samples = 0;

appendFileSync(
  LEDGER,
  JSON.stringify({
    kind: 'new1_coarse_walk_telemetry_open',
    at: new Date(startedAt).toISOString(),
    startingRows: startCount,
    eligibleTotal,
    realRemainingAtStart,
    coverageMeasuredAt: cov?.measuredAt ?? null,
    completeTolerance: cov?.completeTolerance ?? null,
    intervalMs: INTERVAL_MS,
    autoStop: AUTO_STOP,
  }) + '\n',
);

for (;;) {
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
  samples += 1;
  const at = Date.now();
  const [{ n }] = await sql`SELECT count(*)::bigint AS n FROM new1_doc_vector_stage`;
  const rows = Number(n);
  const windowNew = rows - prev;
  const runNew = rows - startCount;
  const runHours = (at - startedAt) / 3_600_000;
  const vph = windowNew / (INTERVAL_MS / 3_600_000);
  const vphRun = runHours > 0 ? runNew / runHours : 0;
  const remaining = realRemainingAtStart === null ? null : realRemainingAtStart - runNew;
  const etaHours = remaining !== null && vphRun > 0 ? remaining / vphRun : null;
  const g = gpu();
  const ref = refusalsSinceStart(startedAt);
  const worklist =
    [...tailLines(RUNNER_LOG, 400)].reverse().find((l) => /worklist \d+\/\d+/.test(l)) ?? null;

  const gpuBusy = (g.utilPct ?? 0) >= GPU_BUSY_PCT;
  if (windowNew === 0 && gpuBusy) zeroWindows += 1;
  else zeroWindows = 0;

  const sample = {
    kind: 'new1_coarse_walk_telemetry',
    at: new Date(at).toISOString(),
    sample: samples,
    eligibleTotal,
    alreadyEmbedded: rows,
    newVectorsThisWindow: windowNew,
    newVectorsThisRun: runNew,
    vectorsPerHourWindow: Math.round(vph),
    vectorsPerHourRun: Math.round(vphRun),
    remainingRealWork: remaining,
    etaHours: etaHours === null ? null : Number(etaHours.toFixed(1)),
    etaDays: etaHours === null ? null : Number((etaHours / 24).toFixed(2)),
    gpu: g,
    worklist,
    refusalsSinceStart: ref,
    zeroOutputWindows: zeroWindows,
  };
  appendFileSync(LEDGER, JSON.stringify(sample) + '\n');
  console.log(
    `${sample.at}  rows ${rows}  +${windowNew} (${Math.round(vph)}/h win, ${Math.round(vphRun)}/h run)  eta ${sample.etaDays ?? '?'}d  gpu ${g.utilPct}%  zero ${zeroWindows}  ${worklist ?? ''}`,
  );

  if (zeroWindows >= 2) {
    const alert = {
      ...sample,
      kind: 'new1_coarse_walk_ALERT',
      why: `${zeroWindows} consecutive ${INTERVAL_MS / 60000}-minute windows with GPU >= ${GPU_BUSY_PCT}% and ZERO new vectors.`,
      action: zeroWindows >= 3 && AUTO_STOP ? 'STOPPING the walk' : 'alert only; stopping at 3',
    };
    if (zeroWindows >= 3 && AUTO_STOP) alert.stopResult = stopWalk();
    writeFileSync(ALERT, JSON.stringify(alert, null, 2) + '\n');
    appendFileSync(LEDGER, JSON.stringify(alert) + '\n');
    console.error('ALERT ' + alert.why + ' — ' + alert.action);
    if (zeroWindows >= 3 && AUTO_STOP) break;
  }
  prev = rows;
  if (MAX_SAMPLES > 0 && samples >= MAX_SAMPLES) break;
}
await sql.end({ timeout: 5 });
