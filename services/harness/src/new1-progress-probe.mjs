#!/usr/bin/env node
/**
 * NEW1 — EMBEDDING PROGRESS PROBE (convergence sprint V2 §7 NEW1-0 / NEW1-6)
 *
 * WHY THIS EXISTS
 * ───────────────
 * The keeper already proved that liveness is not progress: it logged "relaunch
 * issued" nine times in 45 minutes against a walk that could never start, and
 * before that 51 times over 4h20m. `nvidia-smi` said the GPU was busy through
 * most of it. GPU utilisation is not embedding progress; a live pid is not
 * embedding progress; "keeper restarted it" is not embedding progress.
 *
 * The ONLY evidence that embedding is healthy is that the INTENDED OUTPUT moved.
 * For the HEAD walk that output is rows in `new1_doc_vector_stage`.
 *
 * So this probe reports, in one shot, the four quantities that have to be
 * compared across a real interval:
 *
 *   1. new1_doc_vector_stage row count          (the output)
 *   2. worklist position + in-flight batch      (the checkpoint)
 *   3. newest stage-embed.log progress line     (the heartbeat)
 *   4. GPU utilisation / VRAM                   (context ONLY — never the verdict)
 *
 * plus what else was on the box at the moment of measurement, because a 1.4s
 * query once timed at >12 minutes purely because another lane was scanning.
 *
 * USAGE
 *   node services/harness/src/new1-progress-probe.mjs              # one sample
 *   node services/harness/src/new1-progress-probe.mjs --json       # machine form
 *
 * Two samples separated by a real interval are what NEW1-0 requires. A single
 * sample cannot answer the question and this script does not pretend it can.
 */
import postgres from 'postgres';
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const JSON_OUT = process.argv.includes('--json');
const STAGE_EMBED_LOG = new URL('docs/ai/new1-tier-a/stage-embed.log', ROOT);
const STAGE_RUNNER_LOG = new URL('docs/ai/new1-tier-a/stage-runner.log', ROOT);
const SUMMARY = new URL('docs/ai/new1-tier-a/stage-embed-summary.json', ROOT);

/** Last N lines of a file without reading the whole thing into memory twice. */
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

const sql = postgres(url, { max: 1, idle_timeout: 10, connect_timeout: 20 });

try {
  const t = new Date().toISOString();

  // 1. THE OUTPUT. Exact count, not a row estimate — every estimate on this DB
  //    reads 0 after the crash, which is why an estimate cannot be the metric.
  const [{ n: stageRows }] = await sql`SELECT count(*)::bigint AS n FROM new1_doc_vector_stage`;

  // 2. THE CHECKPOINT. The runner's worklist position and the batch in flight.
  const runnerTail = tailLines(STAGE_RUNNER_LOG, 400);
  const worklistLine = [...runnerTail].reverse().find((l) => /worklist \d+\/\d+/.test(l)) ?? null;
  const startLine = [...runnerTail].reverse().find((l) => / START /.test(l)) ?? null;
  const lastDone = existsSync(SUMMARY) ? JSON.parse(readFileSync(SUMMARY, 'utf8')) : null;

  // 3. THE HEARTBEAT. Newest per-batch progress line, and how old it is.
  const embedTail = tailLines(STAGE_EMBED_LOG, 5);
  const lastProgress = embedTail.at(-1) ?? null;
  const lastProgressTs = lastProgress?.match(/^(\S+)\s/)?.[1] ?? null;
  const progressAgeSec = lastProgressTs
    ? Math.round((Date.now() - Date.parse(lastProgressTs)) / 1000)
    : null;
  const staged = lastProgress?.match(/staged (\d+)\/(\d+)/);
  const inserted = lastProgress?.match(/inserted (\d+)/)?.[1];
  const tokPerSec = lastProgress?.match(/(\d+) tok\/s/)?.[1];

  // 4. CONTEXT ONLY. Never the verdict.
  const g = gpu();

  // What else was on the box. A timing recorded without this is not reproducible.
  const activity = await sql`
    SELECT pid, state, wait_event_type, wait_event,
           round(extract(epoch FROM (now() - query_start)))::int AS query_age_s,
           left(regexp_replace(query, '\s+', ' ', 'g'), 90) AS q
    FROM pg_stat_activity
    WHERE state <> 'idle' AND pid <> pg_backend_pid()
    ORDER BY query_start ASC NULLS LAST`;

  const sample = {
    kind: 'new1_progress_sample',
    at: t,
    output: { table: 'new1_doc_vector_stage', rows: Number(stageRows) },
    checkpoint: {
      worklist: worklistLine,
      inFlight: startLine,
      lastCompletedBatch: lastDone
        ? {
            batchFile: lastDone.batchFile?.split('/').pop(),
            inserted: lastDone.inserted,
            tableRowsAtEnd: lastDone.tableRows,
            finishedAt: lastDone.finishedAt,
            recipe: lastDone.recipe,
            tokensPerSecond: Math.round(lastDone.tokensPerSecond),
          }
        : null,
    },
    heartbeat: {
      lastProgressLine: lastProgress,
      lastProgressAgeSec: progressAgeSec,
      stagedInBatch: staged ? `${staged[1]}/${staged[2]}` : null,
      insertedInBatch: inserted ? Number(inserted) : null,
      tokensPerSecond: tokPerSec ? Number(tokPerSec) : null,
    },
    gpuContextOnly: g,
    dbContention: activity.map((a) => ({
      pid: a.pid,
      state: a.state,
      wait: a.wait_event_type ? `${a.wait_event_type}/${a.wait_event}` : null,
      ageS: a.query_age_s,
      q: a.q,
    })),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(sample));
  } else {
    console.log(`SAMPLE AT ${sample.at}`);
    console.log(`  OUTPUT      new1_doc_vector_stage = ${sample.output.rows.toLocaleString()} rows`);
    console.log(`  CHECKPOINT  ${sample.checkpoint.worklist ?? '(none)'}`);
    console.log(`              ${sample.checkpoint.inFlight ?? '(none)'}`);
    if (sample.checkpoint.lastCompletedBatch) {
      const b = sample.checkpoint.lastCompletedBatch;
      console.log(
        `              last done ${b.batchFile} inserted=${b.inserted} rows@end=${b.tableRowsAtEnd} ${b.tokensPerSecond} tok/s  ${b.finishedAt}`,
      );
    }
    console.log(`  HEARTBEAT   ${sample.heartbeat.lastProgressLine ?? '(none)'}`);
    console.log(`              age ${sample.heartbeat.lastProgressAgeSec ?? '?'}s`);
    console.log(
      `  GPU (ctx)   ${g.utilPct ?? '?'}% util, ${g.vramUsedMiB ?? '?'}/${g.vramTotalMiB ?? '?'} MiB  <- NOT progress`,
    );
    console.log(`  DB BUSY     ${sample.dbContention.length} non-idle backend(s)`);
    for (const a of sample.dbContention.slice(0, 12)) {
      console.log(`              pid ${a.pid} ${a.state} ${a.wait ?? '-'} ${a.ageS ?? '?'}s :: ${a.q}`);
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
