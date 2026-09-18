#!/usr/bin/env node
/**
 * NEW1 R9 — the CONTINUOUS incremental queue. R9 §8.
 *
 *   node services/harness/src/delta-queue.mjs               # one pass, then exit
 *   node services/harness/src/delta-queue.mjs --watch       # keep going, 15 min apart
 *   node services/harness/src/delta-queue.mjs --dry-run
 *
 * `delta-manifest.mjs` proves a handoff can be manifested without a census.
 * This makes it happen without me. The directive's wording is *"NEW2 should be
 * able to hand you newly ingested IDs continuously"*, and a tool someone has to
 * remember to run is not continuous — it is a tool plus a habit, and the habit is
 * the part that fails.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WATERMARK IS A TIMESTAMP, NEVER AN ID
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.id` is a random uuid. A watermark of "the highest id I have seen"
 * puts roughly half of every future row BELOW it, and the pass exits clean having
 * skipped them — this repository has already lost a frontier that way once.
 * `created_at` is monotonic with insertion and has its own index
 * (`judgments_created_at_idx`), so it is the only honest cursor here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WATERMARK ADVANCES ON PROOF, NOT ON ATTEMPT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It moves only after the embed process exits 0 AND the durable row count has
 * actually risen by what the batch claimed. Three jobs in this repository have
 * reported COMPLETE while doing 1.1%, nothing, and nothing 549 times; an exit
 * code is a claim and the row delta is the evidence. A pass that embeds nothing
 * leaves the watermark where it was and says so, so the next pass retries the
 * same window rather than stepping over it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OVERLAP IS DELIBERATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Each pass starts one minute BEFORE the stored watermark. NEW2's handoff on
 * 27 Aug lost 339 rows to a two-minute gap between a snapshot and a re-derivation
 * — rows that were in nobody's list. Re-reading a minute of already-processed
 * judgments costs nothing, because the manifest drops anything whose
 * `content_hash` is already staged before the GPU ever sees it. A gap costs a
 * silent hole that only a full reconciliation would ever find.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const STATE = new URL('docs/ai/new1-r9/delta/queue-state.json', ROOT);
const LEDGER = new URL('docs/ai/new1-r9/delta/queue-ledger.jsonl', ROOT);
const OUT_DIR = 'docs/ai/new1-r9/delta';

const WATCH = process.argv.includes('--watch');
const DRY_RUN = process.argv.includes('--dry-run');
const INTERVAL_MS = Number(process.env.QUEUE_INTERVAL_MS ?? 15 * 60 * 1000);
/** Re-read this much already-processed time each pass. A gap is worse than a repeat. */
const OVERLAP_MS = Number(process.env.QUEUE_OVERLAP_MS ?? 60_000);
/** Refuse to manifest an unbounded window: that is the full reconciliation's job, not this one. */
const MAX_ROWS_PER_PASS = Number(process.env.QUEUE_MAX_ROWS ?? 200_000);

const sql = postgres(url, { ssl: false, max: 2, onnotice: () => {}, connection: { statement_timeout: 0 } });

function readState() {
  if (!existsSync(STATE)) return { watermark: null, passes: 0, embedded: 0 };
  return JSON.parse(readFileSync(STATE, 'utf8'));
}
function writeState(s) {
  mkdirSync(new URL(OUT_DIR + '/', ROOT), { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
}
function note(rec) {
  mkdirSync(new URL(OUT_DIR + '/', ROOT), { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(rec) + '\n');
  console.log(rec.at + '  ' + rec.kind + '  ' + JSON.stringify({ ...rec, kind: undefined, at: undefined }));
}

/**
 * THE EVIDENCE GATE COUNTS THIS PASS OWN IDS, NOT THE TABLE — 29 Aug 2026.
 *
 * It used to be `count(*) FROM new1_doc_vector_stage` before and after, and the
 * difference was the proof that the pass produced output. That was sound while
 * this was the only writer. It no longer is: the coarse walk inserts into the
 * same table continuously at thousands of rows an hour, so a whole-table delta
 * is positive whatever this pass did or did not do. The gate could only ever
 * have produced a FALSE PASS, never a false failure, which is the direction
 * that matters — it would advance the watermark over rows it never embedded,
 * and the hole would stay invisible until a full reconciliation.
 *
 * Counting the manifest OWN ids is exact under any concurrency, and it is what
 * the docstring above always meant by "the row delta is the evidence".
 */
async function stagedAmong(ids) {
  if (ids.length === 0) return 0;
  const [r] = await sql`
    SELECT count(*)::bigint AS n FROM new1_doc_vector_stage
     WHERE judgment_id = ANY(${ids}::uuid[])`;
  return Number(r.n);
}

function idsInBatchFile(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l).judgmentId);
}

async function pass() {
  const state = readState();
  const at = new Date().toISOString();

  // First run with no watermark: seed it from the newest row we have already
  // staged rather than from the epoch. Manifesting 18.7M rows here would be the
  // full census wearing a queue's clothes.
  if (!state.watermark) {
    const [seed] = await sql`
      SELECT max(j.created_at) AS t FROM judgments j
       WHERE EXISTS (SELECT 1 FROM new1_doc_vector_stage s WHERE s.judgment_id = j.id)`;
    state.watermark = (seed?.t ?? new Date(0)).toISOString();
    note({ kind: 'queue_seed', at, watermark: state.watermark,
           why: 'no stored watermark; seeded from the newest already-staged judgment' });
    writeState(state);
  }

  const from = new Date(Date.parse(state.watermark) - OVERLAP_MS).toISOString();
  const [{ n, newest }] = await sql`
    SELECT count(*)::bigint AS n, max(created_at) AS newest
      FROM judgments WHERE created_at > ${from}::timestamptz`;
  const pending = Number(n);

  if (pending === 0) {
    note({ kind: 'queue_idle', at, from, pending: 0, watermark: state.watermark });
    return { pending: 0, embedded: 0 };
  }
  if (pending > MAX_ROWS_PER_PASS) {
    note({ kind: 'queue_REFUSED', at, from, pending, cap: MAX_ROWS_PER_PASS,
           why: 'window is larger than one pass should manifest — this is a reconciliation, not a delta. Run tier-census/doc-vector-batches, or raise QUEUE_MAX_ROWS deliberately.' });
    return { pending, embedded: 0, refused: true };
  }

  const label = 'queue-' + at.replace(/[:.]/g, '-');

  const args = ['services/harness/src/delta-manifest.mjs', '--since', from, '--label', label, '--out', OUT_DIR];
  if (DRY_RUN) args.push('--dry-run');
  const manifestOut = execFileSync(process.execPath, args, { encoding: 'utf8', cwd: new URL('.', ROOT).pathname.replace(/^\//, ''), timeout: 30 * 60_000 });
  const manifest = JSON.parse(manifestOut.slice(manifestOut.indexOf('{'), manifestOut.lastIndexOf('}') + 1));

  if (DRY_RUN || manifest.emitted === 0) {
    note({ kind: DRY_RUN ? 'queue_dry_run' : 'queue_nothing_to_embed', at, from, pending,
           emitted: manifest.emitted, alreadyCovered: manifest.alreadyCoveredByContentHash,
           // `pending` counts every judgment in the window; `alreadyCovered` counts
           // only eligible representatives. The difference used to be an unnamed
           // residual read off two numbers that answer different questions. It is
           // now the manifest's own exhaustive decomposition, and `unnamed` is the
           // number that must stay at zero.
           states: manifest.states ?? null, residual: manifest.residualCheck ?? null });
    if (!DRY_RUN && newest) {
      // Everything in the window was already covered — the watermark may advance,
      // because "covered by content hash" IS coverage.
      state.watermark = newest.toISOString();
      state.passes += 1;
      writeState(state);
    }
    return { pending, embedded: 0 };
  }

  const batchFile = new URL(OUT_DIR + '/delta-' + label + '.jsonl', ROOT).pathname.replace(/^\//, '');
  const batchIds = idsInBatchFile(batchFile);
  const before = await stagedAmong(batchIds);
  // ABSOLUTE path to the repo-root tsx. A relative `node_modules/tsx/dist/cli.mjs`
  // resolves against `services/harness/`, where tsx is NOT installed — pnpm hoists
  // it to the root. That spelling exits with MODULE_NOT_FOUND, and it would have
  // done so on the first real delta days from now rather than here.
  const TSX_CLI = new URL('node_modules/tsx/dist/cli.mjs', ROOT).pathname.replace(/^\//, '');
  if (!existsSync(TSX_CLI)) throw new Error('tsx cli not found at ' + TSX_CLI);
  /**
   * LOSING THE GPU RACE IS A STATE, NOT AN EXCEPTION — 29 Aug 2026.
   *
   * `doc-vector-embed.mjs` holds one lock for the single 8 GB card and waits up
   * to 30 minutes for it before refusing. That refusal is correct — two
   * embedders on this card do not queue, they compete for memory that is not
   * there — but it arrived here as an uncaught `execFileSync` throw, so the pass
   * died with a stack trace and wrote NOTHING to the ledger. On 29 Aug that
   * happened twice (14:14Z and 14:44Z) behind a long coarse batch; the queue
   * recovered at 14:59 only because the scheduled task fires again every 15
   * minutes, and the ledger account of that afternoon jumps straight from
   * 13:59 to 14:59 with the contention invisible.
   *
   * A delay nobody can see is indistinguishable from a delay nobody bounded. So
   * the wait gets a name, the watermark is NOT advanced, and the next fire
   * retries the same window. This adds no second writer and changes no
   * scheduling — it only makes the fairness that already exists legible.
   */
  try {
    execFileSync(
      process.execPath,
      [TSX_CLI, 'src/doc-vector-embed.mjs'],
      {
        encoding: 'utf8',
        cwd: new URL('services/harness/', ROOT).pathname.replace(/^\//, ''),
        timeout: 6 * 60 * 60_000,
        env: { ...process.env, DATABASE_URL: url, BATCH_FILE: batchFile,
               STAGE_LOG_PATH: '../../../' + OUT_DIR + '/stage-embed-' + label + '.log',
               SUMMARY_PATH_REL: '../../../' + OUT_DIR + '/summary-' + label + '.json' },
      },
    );
  } catch (e) {
    const said = String(e?.stdout ?? '') + String(e?.stderr ?? '') + String(e?.message ?? '');
    const deferred = said.includes('GPU embed lock held by live pid');
    const holder = said.match(/GPU embed lock held by live pid (\d+) \(([^)]*)\)/);
    note({
      kind: deferred ? 'queue_DEFERRED_GPU_BUSY' : 'queue_EMBED_FAILED',
      at, from, pending, emitted: manifest.emitted,
      manifestIds: batchIds.length, batchFile,
      states: manifest.states ?? null, residual: manifest.residualCheck ?? null,
      lockHolderPid: holder ? Number(holder[1]) : null,
      lockHolderBatch: holder ? holder[2] : null,
      detail: said.split(/\r?\n/).filter(Boolean).slice(-3).join(' | ').slice(0, 400),
      why: deferred
        ? 'the coarse walk held the single-GPU lock past the wait — watermark NOT advanced, the same window is retried on the next fire. This is the fairness bound, not a fault.'
        : 'the embed exited non-zero — watermark NOT advanced, the same window is retried on the next fire.',
    });
    if (deferred) return { pending, embedded: 0, deferred: true };
    throw e;
  }

  const after = await stagedAmong(batchIds);
  const delta = after - before;

  // THE EVIDENCE GATE. An exit code is a claim; the row delta is the proof.
  if (delta <= 0) {
    note({ kind: 'queue_NO_OUTPUT', at, from, pending, emitted: manifest.emitted,
           manifestIds: batchIds.length, stagedAmongThemBefore: before, stagedAmongThemAfter: after,
           why: 'the embed exited 0 and not one id this pass manifested became staged — watermark NOT advanced, the same window is retried next pass' });
    return { pending, embedded: 0, noOutput: true };
  }

  state.watermark = newest.toISOString();
  state.passes = (state.passes ?? 0) + 1;
  state.embedded = (state.embedded ?? 0) + delta;
  state.lastLabel = label;
  state.lastIdsHash = manifest.idsHash;
  writeState(state);
  note({ kind: 'queue_pass', at, from, pending, emitted: manifest.emitted,
         alreadyCovered: manifest.alreadyCoveredByContentHash, rowsAdded: delta,
         watermark: state.watermark, idsHash: manifest.idsHash,
         definitionHash: manifest.definitionHash });
  return { pending, embedded: delta };
}

try {
  for (;;) {
    await pass();
    if (!WATCH) break;
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
} finally {
  await sql.end({ timeout: 10 });
}
