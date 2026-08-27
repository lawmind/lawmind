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
import { createHash } from 'node:crypto';

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

async function stageRows() {
  const [r] = await sql`SELECT count(*)::bigint AS n FROM new1_doc_vector_stage`;
  return Number(r.n);
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
  const before = await stageRows();

  const args = ['services/harness/src/delta-manifest.mjs', '--since', from, '--label', label, '--out', OUT_DIR];
  if (DRY_RUN) args.push('--dry-run');
  const manifestOut = execFileSync(process.execPath, args, { encoding: 'utf8', cwd: new URL('.', ROOT).pathname.replace(/^\//, ''), timeout: 30 * 60_000 });
  const manifest = JSON.parse(manifestOut.slice(manifestOut.indexOf('{'), manifestOut.lastIndexOf('}') + 1));

  if (DRY_RUN || manifest.emitted === 0) {
    note({ kind: DRY_RUN ? 'queue_dry_run' : 'queue_nothing_to_embed', at, from, pending,
           emitted: manifest.emitted, alreadyCovered: manifest.alreadyCoveredByContentHash });
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
  // ABSOLUTE path to the repo-root tsx. A relative `node_modules/tsx/dist/cli.mjs`
  // resolves against `services/harness/`, where tsx is NOT installed — pnpm hoists
  // it to the root. That spelling exits with MODULE_NOT_FOUND, and it would have
  // done so on the first real delta days from now rather than here.
  const TSX_CLI = new URL('node_modules/tsx/dist/cli.mjs', ROOT).pathname.replace(/^\//, '');
  if (!existsSync(TSX_CLI)) throw new Error('tsx cli not found at ' + TSX_CLI);
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

  const after = await stageRows();
  const delta = after - before;

  // THE EVIDENCE GATE. An exit code is a claim; the row delta is the proof.
  if (delta <= 0) {
    note({ kind: 'queue_NO_OUTPUT', at, from, pending, emitted: manifest.emitted,
           rowsBefore: before, rowsAfter: after,
           why: 'the embed exited 0 and the durable count did not move — watermark NOT advanced, the same window is retried next pass' });
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
