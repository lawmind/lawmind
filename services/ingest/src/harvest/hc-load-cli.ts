/**
 * Ingest High Court DOCUMENTS from the AWS Open Data bucket into `judgments`.
 *
 *   npx tsx src/harvest/hc-load-cli.ts --court 10_8 --year 2024          # DRY
 *   npx tsx src/harvest/hc-load-cli.ts --court 10_8 --year 2024 --apply
 *
 * **APPROVED by the founder 11 Aug 2026:** *"Yes — ingest High Court documents
 * as searchable text behind the coverage screen, no embeddings for now."*
 * Plan and per-step verification: `docs/HC_INGEST_PLAN.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE CITATION PASS WITH A LOADER ON THE END
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc-citations-cli.ts` already streams these exact PDFs at 41 documents/second
 * and throws the text away. Everything here that touches the network is that
 * pipeline, deliberately unchanged — rewriting a proven streaming path to add a
 * write would be inventing a second implementation of the working half.
 *
 * What is new is the mapping (`hc-load.ts`, pure and separately tested) and the
 * write, which goes through the existing `upsertJudgments`: unique on
 * `source_url`, batched at 100, and already carrying `stripUnstorable` for the
 * invalid-UTF-8 failure (SQLSTATE 22021) that once silently stopped an ingest
 * after 2022.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DRY BY DEFAULT, AND WHY THAT IS NOT CONVENIENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `CONTINUATION_PROMPT.md` §1: this lane published *"resolution will reach
 * 49.1%"* from a SELECT and delivered 40.4% from the write, because 16,790 rows
 * were self-citations a constraint refused. **Never quote a number that implies
 * a write until that exact write has been dry-run.** So `--apply` is required,
 * and the dry run walks the identical path.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE MAY CALL THESE "JUDGMENTS"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured judgment share of this corpus is **0.75%–18.64%**. Every count this
 * prints says "documents". The coverage endpoint already refuses the word and a
 * test asserts no field is ever named `sourceJudgments`.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db-host.ts';
import {
  MAX_TRANSIENT_RETRIES,
  isTransientDbOrNetworkError,
  transientBackoffMs,
} from '../db-transient.ts';
import { existingSourceUrls, upsertJudgments } from '../load.ts';
import {
  clearSucceeded,
  permanentlyFailedUrls,
  recordFailures,
  type LedgerOutcome,
} from './ingest-ledger.ts';
import type { JudgmentRecord } from '../sci.ts';
import { fetchPdfText, isNativeText, warmPdfEngine } from '../text.ts';
import { type SkipReason, isTestFixture, toJudgmentRecord } from './hc-load.ts';
import {
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  rowCount,
  rowGroupRanges,
  sampleRows,
  withTimeout,
} from './hc-metadata.ts';

/**
 * The ONLY metadata columns anything downstream reads — extracted from
 * `toJudgmentRecord`'s own field accesses, not guessed. `pdf_link` locates the
 * PDF; the rest map straight onto the judgment record.
 *
 * **Projection is not a micro-optimisation here.** In the Allahabad 2021 file
 * `raw_html` is 89.5 MB compressed / 441.5 MB uncompressed — 73% of the file —
 * and nothing reads it: the loader fetches the PDF and extracts text itself.
 * Dropping it takes a full-group read from 140.7 MB to 18.2 MB.
 *
 * A column absent from a given file is not an error — hyparquet returns the row
 * without it and `toJudgmentRecord` already treats every field but `pdf_link`
 * and `title` as optional. `order_type`, for instance, is absent from the
 * Allahabad files and present elsewhere.
 */
const METADATA_COLUMNS = [
  'pdf_link',
  'title',
  'cnr',
  'court',
  'decision_date',
  'disposal_nature',
  'order_type',
] as const;
import { installTunedS3Agent } from './s3-agent.ts';

/**
 * Sets the global fetch dispatcher for this whole process — every `fetch()`
 * call made from here, `text.ts`, `hc-metadata.ts` and `sci.ts` picks up the
 * larger keep-alive pool. Must run before any of those modules issue their
 * first request. `docs/CURRENT_PLAN.md` Q1.43.
 */
installTunedS3Agent();

/** A malformed embedded font can hang extraction forever (see `withTimeout`). Bound it, don't wait on it. */
const EXTRACT_TIMEOUT_MS = 90_000;

/**
 * Generous on purpose: a healthy first-batch read of a mid-size partition was
 * measured at 33s, and a 5MB one at 108s while 29 workers shared this machine's
 * 144 Mbps link, so a short bound would abandon files that are merely queued
 * behind the fleet. The point is to have an upper bound at all — a read that
 * has returned nothing in five minutes has stopped, and the retry costs one
 * batch, not the run.
 *
 * **300s is right for the 1,376 ordinary files and WRONG for the big ones, so
 * it is a flag rather than a constant.** Measured 14 Aug 2026: the default
 * excluded `year=2023/court=9_13/bench=cishclko`, which is genuinely readable —
 * 200 rows returned in 507.4s, and its PDFs resolve 4/4. A bound that turns
 * readable data into `metadata_batch_unreadable` is worse than no bound for
 * that file, and this lane reported that whole court-year as a dead end on the
 * strength of it. Raise it only for a run that needs it; every other worker
 * keeps 300s.
 */
const METADATA_READ_TIMEOUT_MS = num('--metadata-timeout', 300) * 1000;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
function num(name: string, fallback: number): number {
  const v = flag(name);
  return v === undefined ? fallback : Number(v);
}

/**
 * Found live (NEW3, 12 Aug): zero process-level crash guard anywhere in
 * `services/ingest/src`. Every "unsettled top-level await" death this session
 * (Uttarakhand, Gauhati, Chhattisgarh, Karnataka, Telangana, Kerala) left no
 * trace beyond Node's own bare warning — nothing here logged what was actually
 * in flight, and a monitoring pass had to CPU-sample and guess rather than
 * read a reason.
 *
 * This does not fix the underlying hang (Node prints "unsettled top-level
 * await" when nothing is progressing, which is a genuine stall, not a thrown
 * error — no handler catches a promise that never rejects). What it DOES fix:
 * a genuinely uncaught exception or rejection from anywhere in the dependency
 * tree (unpdf, postgres.js, undici) now logs its full detail before exit
 * instead of vanishing into the same ambiguous silence. Cheap, standard, and
 * it turns "which crash class was this" from a CPU-sampling exercise back
 * into reading a line of output.
 */
process.on('uncaughtException', (error) => {
  console.error(`FATAL uncaughtException: ${error?.stack ?? error}`);
  process.exit(1);
});
/**
 * Counted so the RESULTS block can report them. A rejection we decline to die on
 * must still be visible, or "we survived it" becomes "we never saw it".
 */
let foreignRejections = 0;

/**
 * A rejection with NO frame in our own source cannot have left OUR state
 * undefined, because none of our code ran.
 *
 * `crash-guard.ts` states the rule this narrows: *"an ingest worker that
 * continues after an unhandled rejection has undefined state, and these workers
 * are all resumable -- dying loudly and being restarted is strictly better."*
 * That reasoning is right and it is a statement about OUR state. This is the one
 * shape it does not cover.
 *
 * Measured, 18 Aug 2026. `hc-boot-29_3-y2023` died three times in 32 seconds:
 *
 *     FATAL unhandledRejection: Error        <- empty message
 *         at BaseExceptionClosure (unpdf/dist/pdfjs.mjs:1:7031)
 *         at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
 *         at async resolvePDFJSImport (unpdf/dist/index.mjs:112:20)
 *
 * Three facts pin it down:
 *
 *   1. `import('unpdf/pdfjs')` in an isolated process succeeds — 61 exports. So
 *      the bundle is not broken and this is not a packaging fault.
 *   2. Adding `warmPdfEngine()` moved the stack to `warmPdfEngine -> main` and
 *      the worker STILL died, while the awaited import itself resolved and the
 *      run got as far as printing its file count. So the rejection we are
 *      dying on is NOT the promise we await: the module job produces a second
 *      one, and nothing in this file is on its chain. No `try/catch` anywhere
 *      in this codebase can reach it — that was verified by adding one.
 *   3. Every restart replays the same first batch from the same checkpoint, so
 *      the supervisor's "died within 20s three times" rule fires and the scope
 *      goes DOWN. One library-internal rejection retires a whole court-year.
 *
 * THE TEST IS THE THROW SITE, NOT THE WHOLE STACK, and the first version of
 * this guard got that wrong and did nothing.
 *
 * It asked whether the stack mentioned `services/ingest/src` anywhere. On an
 * ASYNC stack it always does: V8 reconstructs the await chain, so the frames
 * below the throw are every caller that was waiting on it —
 * `warmPdfEngine`, `main` — even though not one line of them was executing when
 * pdf.js threw. The guard classified the rejection as ours and killed the worker
 * exactly as before, which is how it was caught: `SURVIVED` never printed once.
 *
 * Only the TOP frame says where the error was born. If it names a dependency,
 * none of our code was on the stack at the moment of the throw, and the "our
 * state may be undefined" argument has nothing to attach to.
 *
 * A rejection with no stack, or whose top frame is ours, is FATAL exactly as
 * before — an unattributable failure is the one we must not assume is harmless.
 */
const OUR_SOURCE = /services[\\/]ingest[\\/]src[\\/]/;
/** The first `at …` line — where it was thrown, not who was waiting. */
function throwSite(stack: string): string | undefined {
  return stack.split('\n').find((line) => line.trimStart().startsWith('at '));
}
process.on('unhandledRejection', (reason) => {
  const stack = reason instanceof Error ? reason.stack : undefined;
  const site = stack === undefined ? undefined : throwSite(stack);
  if (site !== undefined && !OUR_SOURCE.test(site)) {
    foreignRejections++;
    console.error(
      `SURVIVED unhandledRejection #${foreignRejections} — thrown inside a dependency, not ` +
        `in services/ingest/src, so no code of ours was running and our state is intact. ` +
        `Not exiting.\n  throw site:${site}\n${stack}`,
    );
    return;
  }
  console.error(`FATAL unhandledRejection: ${stack ?? reason}`);
  process.exit(1);
});

const APPLY = process.argv.includes('--apply');
const COURT = flag('--court');
const YEAR = flag('--year') ? Number(flag('--year')) : undefined;
/** `--from-year 2016` ingests the decade and stops, newest first. */
const FROM_YEAR = flag('--from-year') ? Number(flag('--from-year')) : undefined;
/**
 * `--to-year 2015` bounds the window from ABOVE, and it exists because the
 * fleet's own scheduling had made the historical corpus unreachable.
 *
 * Measured 14 Aug 2026, not assumed: the corpus held **4,762,373 documents, of
 * which 42,027 fall before 2016** — 0.88%, against ~4,757,636 pre-2016
 * documents in the source (`allYears` 20,529,203 minus `last10Years`
 * 15,771,567, `docs/HC_METADATA_SURVEY.json`). Every one of the 22 live
 * workers was launched `--from-year 2016`, so each stops at 2016 by
 * construction and **no worker in the fleet could ever reach 1950–2015.** That
 * is not a source gap and not a crash; it is the scheduling choice above,
 * unbounded on one side only, and it would have stayed invisible because the
 * headline coverage number keeps rising the whole time.
 *
 * Pairs with `--from-year`, so `--from-year 1950 --to-year 2015` is the
 * historical complement of the running fleet's window rather than a second
 * worker competing over the same partitions.
 */
const TO_YEAR = flag('--to-year') ? Number(flag('--to-year')) : undefined;
const LIMIT = num('--limit', 0);
const BATCH = num('--batch', 200);
const CONCURRENCY = num('--concurrency', 16);

/**
 * Measured live (bus 0257/0261): a large court with several prior partial
 * generations behind it (Madras ~1.5M source documents, Kerala ~570K) can
 * spend 45+ minutes silently re-scanning batches that are 100% `already_held`
 * before reaching fresh material — every restart re-pays that scan from
 * offset 0. `existingSourceUrls` is not wrong to check; the loop is wrong to
 * forget where it already checked.
 *
 * A local per-court JSON checkpoint, not a DB migration: a wrong or stale
 * checkpoint costs at most a little re-scanning — `source_url`'s unique index
 * is still the real safety net, this is purely a speed optimisation on top of
 * it. Skipped entirely for the general sweep (no `--court`), which has no
 * single court identity to key a checkpoint on and is not the courts this was
 * measured against.
 *
 * **The checkpoint is keyed on court AND year scope, because "one worker per
 * court" stopped being true on 14 Aug 2026.** It was true when this was
 * written, and it was the stated reason no cross-process coordination was
 * needed. What broke it: newest-first ordering (justified below) starves the
 * old years on the big courts. Measured that day — Bombay held 0 of ~788,000
 * source documents across 2023-2025 and eleven courts held zero 2023
 * judgments at all — because a 2.4M-document court is still inside year=2026.
 * The fix is a second, year-scoped worker per starved court, and `saveCheckpoint`
 * rewrites the WHOLE file, so two workers sharing `${COURT}.json` would each
 * persist only their own view and silently erase the other's progress on every
 * write. Scoping the filename keeps them independent. A worker with no `--year`
 * keeps the original path exactly, so nothing already running is disturbed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A FILE-POSITION OFFSET HERE, WHEN THE PROJECT'S OWN RULE IS "KEYSET,
 * NEVER OFFSET" — the rule is about a different failure mode than this file
 * ─────────────────────────────────────────────────────────────────────────
 *
 * That rule targets a MUTABLE database table: a concurrent insert or delete
 * shifts what "row N" means between two OFFSET queries, silently skipping or
 * duplicating rows. **The source here is a single immutable parquet object
 * published once by AWS Open Data** (`hc-metadata.ts`'s own header) — nothing
 * writes to it during a run, so row N always names the identical record on
 * every read. The correctness risk the rule exists to prevent does not exist
 * for this data source. Confirmed with the founder directly rather than
 * assumed either way.
 *
 * What DOES need guarding, and is guarded below: the file could be a
 * DIFFERENT object than the one the checkpoint was recorded against — a
 * re-published release with a changed row count, or (less likely) a stale
 * checkpoint from a court/testing run pointed at the wrong path. So the
 * checkpoint stores `size` alongside `offset`, and a resume is refused
 * (falls back to offset 0 for that file, not a hard failure) whenever the
 * file's CURRENT size — from the same S3 listing this run already fetched,
 * no extra request — does not match what was recorded. A resumed offset
 * that turns out to exceed the file's current row count is refused the same
 * way, at the call site.
 */
type Checkpoint = Record<string, { offset: number; size: number }>;

const CHECKPOINT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.checkpoints');
/**
 * `-to${TO_YEAR}` is APPENDED rather than folded into the existing shape, and
 * that is deliberate: 22 workers are running right now against
 * `${COURT}.json`, and any change to how an unbounded worker's key is built
 * would orphan every one of their checkpoints at the next restart. A worker
 * that passes no `--to-year` — which is all of them — keeps a byte-identical
 * path. `saveCheckpoint` rewrites the WHOLE file, so a historical worker
 * sharing a key with a live one would silently erase its progress on every
 * write; a distinct suffix is what keeps the two windows independent, the same
 * reasoning `-y${YEAR}` was added for on 14 Aug.
 */
const CHECKPOINT_PATH = COURT
  ? join(CHECKPOINT_DIR, `${COURT}${YEAR ? `-y${YEAR}` : ''}${TO_YEAR ? `-to${TO_YEAR}` : ''}.json`)
  : null;

/**
 * A MISSING checkpoint and an UNREADABLE one are not the same event, and
 * collapsing them is what made this silent. Found 15 Aug 2026 while proving the
 * fleet could be stopped for the local-Postgres cutover and resumed without
 * losing position.
 *
 * The old body was `catch { return {}; }`, which treats a truncated or
 * half-written file exactly like a first run: every file in the scope resumes
 * from offset 0. That is still CORRECT — `source_url`'s unique index catches the
 * duplicates, as the header says — but the header's other claim, that it "costs
 * at most a little re-scanning", is what stopped holding. At 34 concurrent
 * workers with offsets in the tens of thousands, a reset is hours of re-read and
 * re-attempted inserts against a database we are about to migrate, and nothing
 * anywhere would have said it happened.
 *
 * So: ENOENT stays silent, because a first run is not an incident. Anything else
 * is preserved to `.corrupt-<timestamp>` and shouted about. It still returns `{}`
 * and re-scans rather than exiting — a worker that refuses to start would be
 * restarted forever by its supervisor, which is worse than a slow correct run —
 * but the evidence survives instead of being overwritten by the next save.
 */
/**
 * Sweep this scope's stale `.tmp` files at startup.
 *
 * `saveCheckpoint` writes `<scope>.json.<pid>.tmp` and renames it over the real
 * file, so a completed save leaves nothing behind. A worker KILLED between the
 * write and the rename leaves the temp file instead — which is the whole point,
 * because before write-then-rename that same kill truncated the real checkpoint.
 *
 * They accumulate, though: two force-kill rounds of ~70 workers each left 109 of
 * them, which is also the clearest evidence available that the write window is
 * real and regularly occupied rather than theoretical.
 *
 * Safe to delete unconditionally here: the launcher's per-scope duplicate guard
 * means only one worker owns this scope, so at ITS startup every temp file for
 * this scope is by definition from a dead predecessor. Our own pid's file is
 * excluded anyway, in case a future caller loads twice.
 */
async function sweepStaleTemps(): Promise<void> {
  if (!CHECKPOINT_PATH) return;
  const base = `${basename(CHECKPOINT_PATH)}.`;
  const mine = `${base}${process.pid}.tmp`;
  try {
    const entries = await readdir(CHECKPOINT_DIR);
    await Promise.all(
      entries
        .filter((e) => e.startsWith(base) && e.endsWith('.tmp') && e !== mine)
        .map((e) => unlink(join(CHECKPOINT_DIR, e)).catch(() => {})),
    );
  } catch {
    // A directory we cannot list is not a reason to refuse to harvest.
  }
}

async function loadCheckpoint(): Promise<Checkpoint> {
  if (!CHECKPOINT_PATH) return {};
  await sweepStaleTemps();
  let raw: string;
  try {
    raw = await readFile(CHECKPOINT_PATH, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    console.error(
      `CHECKPOINT UNREADABLE ${CHECKPOINT_PATH}: ${(err as Error).message} — resuming from 0`,
    );
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const kept = `${CHECKPOINT_PATH}.corrupt-${Date.now()}`;
    await rename(CHECKPOINT_PATH, kept).catch(() => {});
    console.error(
      `CHECKPOINT CORRUPT ${CHECKPOINT_PATH} (${raw.length} bytes): ${(err as Error).message}\n` +
        `  kept at ${kept}; this scope re-scans from offset 0 — position was NOT preserved`,
    );
    return {};
  }
}

async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
  if (!CHECKPOINT_PATH) return;
  /**
   * A DRY RUN MUST NOT ADVANCE THE CHECKPOINT. Found 14 Aug 2026 by doing it.
   *
   * Verifying the new `--to-year` flag with a `--limit 5` dry run on Sikkim
   * left `11_24-to2015.json` on disk recording those batches as done. Nothing
   * had been written, so a later `--apply` over the same window would have
   * skipped them — silently, and permanently as far as that worker is
   * concerned.
   *
   * The reason this is worse than it looks is the checkpoint's own
   * justification: it is documented above as "purely a speed optimisation"
   * because `source_url`'s unique index is the real safety net. That premise
   * only holds when the skipped batches were actually INSERTED. On a dry run
   * they were not, so the safety net has nothing to catch and the skip becomes
   * a permanent hole rather than a saved re-scan.
   */
  if (!APPLY) return;
  await mkdir(CHECKPOINT_DIR, { recursive: true });
  /**
   * WRITE-THEN-RENAME, not write-in-place. `writeFile` opens with `w`, which
   * TRUNCATES before it writes: for the width of that window the checkpoint on
   * disk is a zero-byte file, and this is called after every 200-row batch on
   * every one of 34 workers. A kill in that window — a `taskkill` for the
   * migration pause, or either of the two unclean reboots this machine took on
   * 15 Aug — leaves a file that `loadCheckpoint` cannot parse, and that court's
   * position is gone.
   *
   * `rename` over an existing path is atomic on NTFS (Node issues MoveFileEx
   * with MOVEFILE_REPLACE_EXISTING) and on POSIX. The reader therefore only ever
   * sees the complete previous checkpoint or the complete new one, never a
   * truncated one, whatever moment the process dies at.
   *
   * The temp name carries the pid because historical and unbounded workers for
   * the same court write DIFFERENT checkpoint paths but share this directory,
   * and two processes racing on one `.tmp` would reintroduce exactly the torn
   * write this removes.
   */
  const tmp = `${CHECKPOINT_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(checkpoint), 'utf8');
  await renameWithRetry(tmp, CHECKPOINT_PATH);
}

/**
 * `rename` IS ATOMIC ON NTFS. IT IS NOT RELIABLE ON NTFS, AND THOSE ARE DIFFERENT
 * PROPERTIES.
 *
 * Measured 17 Aug 2026, on the first fleet start after the local cutover: TWO of
 * the three canaries died within 20 seconds of launch, both identically —
 *
 *     FATAL uncaughtException: Error: EPERM: operation not permitted, rename
 *       '...\.checkpoints\10_8.json.16652.tmp' -> '...\.checkpoints\10_8.json'
 *       at async saveCheckpoint (hc-load-cli.ts:377)
 *
 * and `supervise.mjs` then correctly refused to keep restarting them: *"died
 * within 20s three times running — this is a defect, not a network blip.
 * Stopping."* `hc-boot-10_8` (recent) and `hc-boot-hist-27_1` (pre-2016) were
 * gone. The verifier still passed, because the surviving workers were inserting
 * rows and advancing offsets — aggregate row growth cannot see a dead scope.
 *
 * **The lock was transient.** Checked afterwards rather than assumed: the same
 * rename over the same existing path in the same directory succeeds, and neither
 * checkpoint is held open by anything. That is the classic Windows shape — a
 * virus scanner or the search indexer opens the file we JUST wrote, and the
 * rename lands inside the handful of milliseconds it holds it. Nothing in this
 * lane is racing: `10_8.json` is written only by the unscoped `10_8` worker, and
 * the year- and range-scoped workers write `-y<year>` and `-to<year>` paths.
 *
 * So the defect is that a millisecond-scale external hold was fatal. Retrying is
 * correct rather than a workaround, and specifically:
 *
 * - Only the RENAME retries. The temp file is already written and fsync-ordered;
 *   re-writing it would widen the window rather than narrow it.
 * - Only EPERM/EACCES/EBUSY retry. ENOENT means the temp vanished, which is a
 *   real fault and must still throw — retrying it would spin forever on a bug.
 * - The last failure is RETHROWN. A checkpoint that silently fails to save is
 *   worse than a crash: the worker keeps going and re-scans from a stale offset
 *   on the next start, which is the exact cost this whole write-then-rename
 *   mechanism exists to avoid. A save that cannot complete must still be loud.
 */
const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 5 || code === undefined || !RENAME_RETRY_CODES.has(code)) throw error;
      /** 20ms, 40, 80, 160, 320 — the observed hold is far shorter than the sum. */
      await new Promise((r) => setTimeout(r, 20 * 2 ** attempt));
    }
  }
}

/**
 * THE MIGRATION PAUSE SWITCH. Added 15 Aug 2026 for the Railway -> local
 * PostgreSQL cutover, where "stop the write fleet" has to mean something
 * stronger than `taskkill`.
 *
 * Windows has no SIGTERM: every stop this fleet has ever taken was a
 * `TerminateProcess`, landing wherever the worker happened to be — quite
 * possibly mid-batch, with an INSERT in flight against a database that is about
 * to be migrated. Correctness survived that only because `source_url` is unique
 * and the checkpoint is now written atomically. That is a safety net, not a
 * clean stop, and a net is the wrong thing to be standing on while the database
 * underneath is being replaced.
 *
 * So: a sentinel file, checked at the BATCH BOUNDARY, which is the one point
 * where no row is half-written and the checkpoint on disk is exactly current.
 * The worker exits 0 there and nothing is in flight.
 *
 * It deliberately does NOT print a `RESULTS` block. `supervise.mjs` treats
 * `RESULTS` in the log tail as "this scope is complete, do not restart", and the
 * launcher rotates such a log — a paused scope that claimed completion would be
 * indistinguishable from a finished one, which is the exact confusion that cost
 * hc-boot-mid-9_13 a day of no-op launches.
 *
 * `existsSync` per batch is a stat on a local path once per 200 rows, against
 * batches that each do network reads and a database round trip. It is not
 * measurable next to that.
 *
 * ORDER MATTERS FOR THE CALLER, and `scripts/fleet-stop.ps1` documents it: kill
 * the supervisors FIRST, then drop this file. Dropping it while supervisors are
 * alive gives a restart loop of workers that start, see the file and exit —
 * burning the 40-restart budget and looking exactly like a crash loop.
 */
const STOP_FILE = join(CHECKPOINT_DIR, 'STOP');
function stopIfRequested(): void {
  if (!existsSync(STOP_FILE)) return;
  console.log(
    `PAUSED by ${STOP_FILE} at a batch boundary — checkpoint on disk is current, nothing in flight. ` +
      `Delete the file and relaunch to resume from exactly here.`,
  );
  process.exit(0);
}

/**
 * The verification the founder's exception requires before trusting a
 * stored offset: same object identity (the map is already keyed on
 * `file.key`, the exact S3 path), same size as when the checkpoint was
 * written (the nearest thing to a version check this bucket's plain
 * `ListObjectsV2` listing offers — no ETag parsed, ETags on multipart
 * uploads are not a content hash anyway), and the offset within the
 * file's current bounds. Any mismatch refuses the resume rather than
 * risking a skipped or duplicated record, and re-scans that one file
 * from 0 — never a hard failure, since `source_url`'s unique index still
 * makes a full re-scan correct, only slower.
 */
function verifiedResumeOffset(
  checkpoint: Checkpoint,
  key: string,
  currentSize: number,
  total: number,
): number {
  const entry = checkpoint[key];
  if (!entry) return 0;
  if (entry.size !== currentSize) return 0;
  if (!Number.isInteger(entry.offset) || entry.offset < 0 || entry.offset >= total) return 0;
  return entry.offset;
}

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
// `openDb` (LCC, bus 0170) resolves the proxy hostname via public DNS and
// hands the driver an address directly — the actual fix for the
// `getaddrinfo ENOTFOUND` deaths this session had (bus 0159/0165/0170): the
// OS resolver on this machine is the thing that intermittently fails, and
// `connect_timeout` alone cannot help because a stalled lookup never reaches
// the stage that timeout governs. Bundles connect_timeout: 120 and
// idle_timeout: 0 already.
const sql = await openDb(url, 3);

type Tally = Record<string, number>;
const tally: Tally = {};
const bump = (k: string, n = 1) => (tally[k] = (tally[k] ?? 0) + n);

/**
 * Rows landing on 1 January are COUNTED, never dropped.
 *
 * Found while verifying the date rule: several 1950 partitions carry runs of
 * `Sun Jan 01 1950`, which reads as a placeholder for "date unknown" rather than
 * as a real sitting. **A corpus where thousands of documents claim 1 January
 * would corrupt ordering and every "as at" answer.** It is reported so the
 * number can be looked at before the full run, because silently dropping a
 * document is the one thing this codebase never does.
 */
const isJanFirst = (iso: string) => iso.slice(5) === '01-01';

async function main(): Promise<void> {
  console.log(`HIGH COURT DOCUMENT INGEST${APPLY ? '' : ' — DRY RUN'}`);
  console.log('='.repeat(74));

  /**
   * Load PDF.js before the concurrent pool exists. `warmPdfEngine` explains the
   * poison-pill crash this removes; the short version is that 32 tasks racing
   * the same dynamic import produced a rejection no `try/catch` here could
   * reach, and the worker died on the same batch on every restart.
   *
   * Awaited, not fired and forgotten: if the bundle cannot load, this run has
   * no extractor and every document would be recorded as a failure. Better to
   * say so on line three than to write a court's worth of `pdf_failed`.
   */
  await warmPdfEngine();

  const keys = await listMetadataKeys();
  const files = keys
    .map((k) => ({ ...k, p: parsePartitions(k.key) }))
    .filter((x): x is typeof x & { p: NonNullable<typeof x.p> } => x.p !== null)
    .filter((x) => (COURT ? x.p.courtCode === COURT : true))
    .filter((x) => (YEAR ? x.p.year === YEAR : true))
    .filter((x) => (FROM_YEAR ? x.p.year >= FROM_YEAR : true))
    .filter((x) => (TO_YEAR ? x.p.year <= TO_YEAR : true))
    .filter((x) => !isTestFixture(x.p))
    /**
     * **NEWEST FIRST, and this is not cosmetic.**
     *
     * The first run of this CLI went 1950 → 1951 → 1952, because that is the
     * order the bucket lists partitions in. Two things are wrong with that:
     * an advocate needs recent law far more than 1950s law, and **any
     * interruption of a multi-week ingest would leave us holding the least
     * useful half.** Descending, an interruption leaves the most useful half.
     *
     * It also front-loads the years that carry a **neutral citation** (2023+),
     * which are the only High Court documents that are citable rather than
     * merely searchable — `CURRENT_PLAN.md` §Q2.
     */
    .sort((a, b) => b.p.year - a.p.year);

  console.log(
    `${files.length} metadata files in scope` +
      `${COURT ? ` · court=${COURT}` : ''}${YEAR ? ` · year=${YEAR}` : ''}` +
      `${FROM_YEAR ? ` · from=${FROM_YEAR}` : ''}${TO_YEAR ? ` · to=${TO_YEAR}` : ''}`,
  );
  if (files.length === 0) return;

  const started = Date.now();
  let seen = 0;
  let mapped = 0;
  let written = 0;
  let ledgerWrites = 0;
  const samples: JudgmentRecord[] = [];
  const checkpoint = await loadCheckpoint();

  for (const file of files) {
    // Assigned in the `try` below, whose `catch` always `continue`s — so a `0`
    // here is never read. It is also the row count this scope is about, and a
    // dead default of zero on that is worth not having.
    let total: number;
    const countAbort = new AbortController();
    try {
      /**
       * Bounded for the same reason the batch read below is, and this one was
       * the actual gap: `sampleRows` got a timer on 14 Aug while this call,
       * which runs once per file BEFORE any batch, kept none. The court=5_15
       * worker then sat 46 minutes having written nothing — no error, no
       * progress, no exit — because it never got past the footer read of its
       * first file. Bounding `sampleRows` alone moved the hang one line
       * earlier rather than removing it.
       */
      total = await withTimeout(
        () => rowCount(file.key, countAbort.signal),
        METADATA_READ_TIMEOUT_MS,
        `rowCount ${file.key}`,
      );
    } catch {
      countAbort.abort();
      bump('metadata_unreadable');
      continue;
    }
    if (total === 0) continue;

    const resumeFrom = verifiedResumeOffset(checkpoint, file.key, file.size, total);

    /**
     * Row-group boundaries, read from the footer once per file.
     *
     * **A row group is the smallest unit a parquet reader can decode**, so a
     * 200-row window into a 351,704-row group decodes the whole group and
     * discards 351,504 rows. The Allahabad 2021 file is exactly that shape and
     * `BATCH=200` would have re-read its 140.7 MB **1,759 times** — about
     * 247 GB to ingest one file. It never finished; see `rowGroupRanges` in
     * `hc-metadata.ts` for the full measurement and the incident it caused.
     *
     * Falling back to one synthetic group on failure keeps the OLD behaviour
     * rather than skipping the file: a footer we cannot read is a reason to try
     * the slow path, not a reason to write the file off.
     */
    let groups: Array<{ start: number; end: number }>;
    const groupAbort = new AbortController();
    try {
      groups = await withTimeout(
        () => rowGroupRanges(file.key, groupAbort.signal),
        METADATA_READ_TIMEOUT_MS,
        `rowGroups ${file.key}`,
      );
    } catch {
      groupAbort.abort();
      bump('rowgroups_unreadable');
      groups = [{ start: 0, end: total }];
    }

    for (const group of groups) {
      if (group.end <= resumeFrom) continue;
      if (LIMIT > 0 && seen >= LIMIT) break;

      /**
       * ONE read per row group, projected to the seven columns
       * `toJudgmentRecord` actually consumes. `raw_html` alone is 73% of the
       * Allahabad file and nothing reads it — the loader fetches the PDF and
       * extracts text itself.
       */
      let groupRows: Record<string, unknown>[];
      const groupReadAbort = new AbortController();
      try {
        groupRows = await withTimeout(
          () =>
            sampleRows<Record<string, unknown>>(
              file.key,
              group.start,
              group.end,
              groupReadAbort.signal,
              METADATA_COLUMNS,
            ),
          METADATA_READ_TIMEOUT_MS,
          `metadata ${file.key} group @${group.start}`,
        );
      } catch {
        groupReadAbort.abort();
        bump('metadata_batch_unreadable');
        /*
         * `continue`, not `break`. The old code broke out of the whole file on
         * one unreadable window, which — combined with the RESULTS sentinel —
         * turned a timeout into a permanent COMPLETE the supervisor would never
         * retry. A later group may well be readable; an unreadable one is
         * counted and skipped, never allowed to write off its siblings.
         */
        continue;
      }

      for (let offset = Math.max(group.start, resumeFrom); offset < group.end; offset += BATCH) {
        if (LIMIT > 0 && seen >= LIMIT) break;
        stopIfRequested();
        const want = Math.min(BATCH, group.end - offset);
        /**
         * An in-memory window into the group already read above — no network call.
         *
         * The bounded-read machinery that used to live here (a `withTimeout` per
         * 200-row batch, added 14 Aug after a worker sat 16 minutes at 0.4% CPU)
         * has moved UP to the group read, which is now the only place bytes cross
         * the wire. The hazard it guarded against is unchanged and still guarded;
         * what changed is that it is paid once per group instead of once per 200
         * rows.
         */
        const rows = groupRows.slice(offset - group.start, offset - group.start + want);

        // Resumability lives in the database: source_url is uniquely indexed, so a
        // killed run is restarted with the same command and skips what it has.
        const rawCandidates = rows
          .map((r) => {
            const link = (r['pdf_link'] as string | undefined) ?? null;
            return link ? { row: r, url: pdfUrlFor(file.p, link) } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        // Found live: `upsertBatch` batches up to 100 rows into ONE `INSERT …
        // ON CONFLICT (source_url) DO UPDATE`, and Postgres refuses outright if
        // the same conflict key appears twice in one statement — "ON CONFLICT
        // DO UPDATE command cannot affect row a second time", not a retryable
        // error, crashed the whole process. The metadata source itself carries
        // duplicate rows within a single parquet file (same `pdf_link`), which
        // `existingSourceUrls` cannot catch — it only knows what a PREVIOUS
        // batch already wrote. First occurrence wins, matching this codebase's
        // "one sighting per document" rule for citations.
        const seenUrls = new Set<string>();
        const candidates = rawCandidates.filter((c) => {
          if (seenUrls.has(c.url)) return false;
          seenUrls.add(c.url);
          return true;
        });
        bump('duplicate_in_batch', rawCandidates.length - candidates.length);
        if (candidates.length === 0) {
          checkpoint[file.key] = { offset: offset + want, size: file.size };
          await saveCheckpoint(checkpoint);
          continue;
        }

        const already = await existingSourceUrls(
          sql,
          candidates.map((c) => c.url),
        );
        const held = candidates.filter((c) => !already.has(c.url));
        bump('already_held', candidates.length - held.length);

        /**
         * THE FAILURE LEDGER, the other half of `existingSourceUrls`.
         *
         * `judgments.source_url` records what SUCCEEDED. Until now nothing
         * recorded what FAILED, so every restart re-downloaded every failure
         * forever and could not tell "not yet tried" from "tried three times".
         *
         * Measured on this fleet: `hc-boot-23_23-y2024` was scheduled against
         * 15,890 remaining documents and recorded 15,869 `pdf_missing` — the
         * metadata is in the parquet, the PDFs are not in the bucket. Roughly 21
         * were genuinely recoverable. Without this filter that scope pays 15,869
         * 404s on every future start.
         *
         * Only `permanent` rows are excluded, so a transient S3 hiccup still gets
         * its three attempts. `ingest-ledger.ts` explains which outcomes go
         * permanent on first sight and why.
         */
        const condemned = await permanentlyFailedUrls(
          sql,
          held.map((c) => c.url),
        );
        const todo = held.filter((c) => !condemned.has(c.url));
        bump('ledger_permanent_skip', held.length - todo.length);
        if (todo.length === 0) {
          checkpoint[file.key] = { offset: offset + want, size: file.size };
          await saveCheckpoint(checkpoint);
          continue;
        }

        /**
         * EXPLICIT, because the inferred union let `url` widen to
         * `string | undefined` once the ledger started reading it. Naming the
         * shape makes the compiler check every `return` in this callback
         * against it instead of unioning whatever each branch happens to
         * produce — and a skip whose URL went missing is a ledger row that
         * silently never gets written.
         */
        /**
         * The fetch-level outcomes, named once so the union, the `bump` cast and
         * the ledger cannot drift apart. `pdf_missing` is absent deliberately: it
         * is a legacy ledger value that is never written again — see the
         * `pdf_absent` section of `ingest-ledger.ts`.
         */
        type FetchOutcome = 'pdf_absent' | 'pdf_unavailable' | 'pdf_failed' | 'pdf_timeout';
        type MapResult =
          { skip: SkipReason | FetchOutcome; url: string } | { record: JudgmentRecord };
        const records = await mapConcurrent<(typeof todo)[number], MapResult>(
          todo,
          CONCURRENCY,
          async (c) => {
            // No initialisers: every `catch` path below returns, so these are read
            // only after the `try` has assigned all three. A placeholder `''`/`1`
            // here is unreachable, and an unreachable default on the extracted text
            // is the kind that quietly becomes a real empty document if the control
            // flow ever changes.
            let text: string;
            let pages: number;
            let method: string | null;
            // Aborts the fetch at the same deadline `withTimeout` gives up at, so a
            // stalled socket is actually closed rather than merely abandoned — this
            // run touches 15.77M documents over days, and a leaked connection per
            // timeout would eventually starve the pool. Parsing itself cannot be
            // aborted (unpdf/pdfjs takes no signal), so `withTimeout` still races it.
            const controller = new AbortController();
            const abortTimer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
            try {
              // The WHOLE per-document operation is bounded, not just parsing.
              // A stalled fetch (no bytes, no error, no CPU — a dead socket the
              // OS never reports as closed) hangs identically to the font-repair
              // loop that motivated `withTimeout` in the first place: zero CPU,
              // one worker permanently short, `Promise.all` in `mapConcurrent`
              // never resolves. Observed directly restarting this run — CPU time
              // flat across a 5s sample while "stuck" mid-batch.
              //
              // `fetchPdfText` (`../text.ts`) replaces the inline `unpdf` calls
              // this line used to make — it is the SAME extraction plus the
              // measured `pdftotext` fallback for the font-corruption pattern
              // found on 37.0% of Bombay High Court documents (`CURRENT_PLAN.md`
              // Q1.20/Q1.27), and already carries `stripUnstorable` internally
              // via `normaliseWhitespace`, so that call is no longer needed here.
              const extracted = await withTimeout(
                () => fetchPdfText(c.url, controller.signal),
                EXTRACT_TIMEOUT_MS,
                c.url,
              );
              text = extracted.text;
              pages = extracted.pages;
              method = extracted.method;
            } catch (error) {
              if (error instanceof Error && error.message.startsWith('timeout after')) {
                return { skip: 'pdf_timeout' as const, url: c.url };
              }
              /**
               * `fetchPdfText` throws `GET <url> → <status>` on a non-OK response.
               * This used to match `/→ \d{3}$/` and call EVERY status `pdf_missing`,
               * which put a 404 and a 503 on the same retry schedule — and the retry
               * rule was justified on the ground that one request cannot tell them
               * apart. It can; the status was being discarded.
               *
               * 120 recorded `pdf_missing` URLs HEADed at random on 18 Aug 2026:
               * 120 of 120 returned 404. So the status is CAPTURED and split.
               *
               *   404/403/410  the object is not there — `pdf_absent`, permanent on
               *                sight, because the next GET reads the same absence.
               *   anything else the server declined to answer — `pdf_unavailable`,
               *                retryable, which is what the original rule was for.
               *
               * A 403 counts as absent on this bucket: it is public and unkeyed, so
               * a refusal is about the object, not about us.
               */
              const status =
                error instanceof Error ? /→ (\d{3})$/.exec(error.message)?.[1] : undefined;
              if (status === undefined) return { skip: 'pdf_failed' as const, url: c.url };
              return status === '404' || status === '403' || status === '410'
                ? { skip: 'pdf_absent' as const, url: c.url }
                : { skip: 'pdf_unavailable' as const, url: c.url };
            } finally {
              clearTimeout(abortTimer);
            }
            const out = toJudgmentRecord(
              c.row,
              file.p,
              text,
              c.url,
              isNativeText(text.length, pages),
              method,
            );
            if (!out.ok) return { skip: out.reason, url: c.url };
            return { record: out.record };
          },
        );

        const batch: JudgmentRecord[] = [];
        /** Every skip carries its URL now, so the ledger can be written per document. */
        const failures: LedgerOutcome[] = [];
        for (const r of records) {
          seen++;
          if ('skip' in r) {
            bump(r.skip as SkipReason | FetchOutcome);
            failures.push({
              sourceUrl: r.url,
              outcome: r.skip,
              courtCode: file.p.courtCode,
              year: file.p.year,
            });
            continue;
          }
          mapped++;
          if (isJanFirst(r.record.judgmentDate)) bump('date_is_1_january');
          if (samples.length < 5) samples.push(r.record);
          batch.push(r.record);
        }

        if (APPLY && batch.length > 0) {
          const res = await upsertJudgments(sql, batch);
          written += res.inserted + res.updated;
          /**
           * A document that finally loaded is no longer a failure. Cleared AFTER
           * the upsert, so a ledger row is only removed once `judgments` genuinely
           * holds the record and the two ledgers cannot disagree.
           */
          await clearSucceeded(
            sql,
            batch.map((b) => b.sourceUrl),
          );
        }
        /**
         * Dry runs record nothing. `--apply` is the flag that means "this run's
         * conclusions are durable", and a DRY run that condemned documents to
         * `permanent` would make a rehearsal change what a real run does.
         */
        if (APPLY) ledgerWrites += await recordFailures(sql, failures);

        // Dry runs never advance the checkpoint: nothing was actually written,
        // so a later `--apply` run must still see and process this offset.
        if (APPLY) {
          checkpoint[file.key] = { offset: offset + want, size: file.size };
          await saveCheckpoint(checkpoint);
        }

        const secs = (Date.now() - started) / 1000;
        console.log(
          `[${seen.toLocaleString()}] mapped=${mapped.toLocaleString()} ` +
            `written=${written.toLocaleString()} ` +
            `${(seen / Math.max(secs, 1)).toFixed(1)} docs/s · ${file.p.courtCode}/${file.p.year}`,
        );
      }
    }
    if (LIMIT > 0 && seen >= LIMIT) break;
  }

  console.log('');
  /**
   * The sentinel `scripts/supervise.mjs` reads to decide a run FINISHED rather
   * than died — its `finished()` matches `/^RESULTS/m` against the tail of the
   * log, and "a clean finish is never restarted" is the property that makes
   * supervising this worker safe at all.
   *
   * Added 14 Aug 2026 because it was missing: `paragraphs-cli.ts` printed it
   * and this did not, so a supervised harvest worker that had legitimately
   * exhausted its court would have been relaunched every 30 seconds forever,
   * re-reading every parquet footer in its scope on each pass. The supervisor
   * was correct; this file simply never told it when it was done.
   */
  console.log('RESULTS');
  console.log(`DOCUMENTS SEEN    ${seen.toLocaleString()}`);
  console.log(`MAPPED            ${mapped.toLocaleString()}`);
  console.log(`WRITTEN           ${written.toLocaleString()}`);
  /**
   * Printed, not merely counted. The same lint rule caught `skippedMissing`
   * in `enrich-cli.ts` being tallied and never reported, and the lesson is
   * the same one: a number the code keeps but nobody sees is a fact the next
   * person has to rediscover. This one answers "is the failure ledger
   * actually being written", which is the whole point of wiring it up.
   */
  console.log(`LEDGER FAILURES   ${ledgerWrites.toLocaleString()} recorded to hc_ingest_ledger`);
  if (foreignRejections > 0) {
    console.log(
      `DEPENDENCY FAULTS ${foreignRejections.toLocaleString()} unhandled rejection(s) survived — ` +
        `none had a frame in services/ingest/src. Each is printed above with its stack.`,
    );
  }
  console.log('');
  console.log('outcomes, and every skipped document is counted rather than dropped:');
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(8)}  ${k}`);
  }

  // S5 of the plan: READ five mapped records by eye before trusting the mapping.
  if (samples.length > 0) {
    console.log('');
    console.log('five mapped records — READ THESE, do not skim them:');
    for (const r of samples) {
      console.log(`  ${r.judgmentDate}  ${r.court}  [${r.caseType ?? 'no side'}]`);
      console.log(`    title  ${r.caseTitle.slice(0, 88)}`);
      console.log(`    number ${r.caseNumber ?? '—'}   neutral ${r.neutralCitation ?? '—'}`);
      console.log(`    text   ${r.fullText.replace(/\s+/g, ' ').slice(0, 88)}…`);
    }
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing written. Re-run with --apply.');
    console.log('These are DOCUMENTS. Measured judgment share is 0.75%–18.64%.');
  }
}

/**
 * A DNS blip on the shared Railway proxy hostname crashes the whole process
 * with an UNCAUGHT `ENOTFOUND` (or a handful of related transient network
 * codes) rather than a catchable rejection inside `main()`'s own try/catch —
 * postgres.js throws it straight from query construction. Found live: five
 * workers crashed within the same few minutes on
 * `getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net`, and the hostname resolved
 * fine moments later — a transient consumer-router DNS hiccup, not a broken
 * environment. `main()` is resumable by construction (`source_url` skip), so
 * retrying the WHOLE run costs only a fast re-check of already-held rows,
 * not lost work.
 */
// The errno list moved to `../db-transient.ts` with the classifier that reads it.

/**
 * The classifier and the budget now live in `../db-transient.ts`, shared.
 *
 * They were local to this file when the postmaster restarted at 22:36:43Z on
 * 17 Aug and every worker in the fleet died between 22:39:07Z and 22:39:41Z on
 * `PostgresError: the database system is not yet accepting connections`. This
 * wrapper would have absorbed it; it never fired because the local classifier
 * matched Node errno strings only, and a PostgresError carries a SQLSTATE in
 * the same `.code` field. An audit found the identical hole in every other
 * writer in this service, which is why the judgement moved out of here rather
 * than being fixed in place.
 */
try {
  for (let attempt = 1; ; attempt++) {
    try {
      await main();
      break;
    } catch (error) {
      if (!isTransientDbOrNetworkError(error) || attempt >= MAX_TRANSIENT_RETRIES) throw error;
      const delayMs = transientBackoffMs(attempt);
      const code = (error as NodeJS.ErrnoException).code;
      console.error(
        `transient db/network error (${code}), attempt ${attempt}/${MAX_TRANSIENT_RETRIES} — retrying in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
} finally {
  await sql.end();
}
