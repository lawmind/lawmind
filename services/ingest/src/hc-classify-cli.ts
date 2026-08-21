/**
 * Classify the High Court corpus, and report what it actually contains.
 *
 *   pnpm --filter @lawmind/ingest run hc:classify              # report only
 *   pnpm --filter @lawmind/ingest run hc:classify --confirm    # write
 *   pnpm --filter @lawmind/ingest run hc:classify --sample 20  # validation sample
 *
 * Dry by default. The parser is pure and lives in `hc-classify.ts`; this file is
 * the database half and holds no classification rules of its own.
 *
 * `--sample N` prints N real rows per class with their text, for reading by a
 * human. A classifier validated only against its own author's test fixtures has
 * been validated against the author's idea of a High Court order.
 */
import type { Sql } from 'postgres';

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db-host.ts';
import { classifyHcDocument } from './hc-classify.ts';
import { installCrashGuard } from './crash-guard.ts';

/**
 * THE MIGRATION PAUSE SWITCH — the same sentinel `hc-load-cli.ts` honours, and
 * this file needs it for the same reason: it WRITES (`writeClasses`), so it has
 * to be quiet before the database moves underneath it.
 *
 * Found by rehearsing the pause on 15 Aug 2026 rather than by reading code: 152
 * worker processes stood themselves down in about thirty seconds and exactly
 * FOUR would not — all of them this classifier, because only the harvester had
 * the hook. A pause that leaves a writer running is not a pause, and the only
 * reason it was visible at all is that fleet-stop.ps1 waits and counts instead
 * of assuming.
 *
 * Checked per PAGE rather than per row: a page is already the unit this walk
 * commits in, so it is the point where nothing is half-written. The check sits
 * BEFORE the cursor advances, so a paused run re-reads the page it stopped on —
 * `--resume` selects on `hc_class_method IS NULL`, so anything already written
 * is simply not selected again.
 */
const STOP_FILE = join(dirname(fileURLToPath(import.meta.url)), '../.checkpoints/STOP');
function stopIfRequested(): void {
  if (!existsSync(STOP_FILE)) return;
  console.log(
    `\nPAUSED by ${STOP_FILE} at a page boundary — nothing in flight. ` +
      `Delete the file and relaunch to resume from the first unclassified row.`,
  );
  process.exit(0);
}


// Silent deaths cost three runs today; log the cause instead of vanishing.
installCrashGuard('hc-classify');
const BATCH = 1000;

type Row = {
  id: string;
  disposal_nature: string | null;
  case_number: string | null;
  full_text: string;
  len: number;
};

type Update = { id: string; cls: string | null; method: string };

/**
 * One page, folded into the running counters. Returns only the small
 * id/class/method triples — it never retains text beyond the caller's page,
 * which is the whole point of the streaming rewrite.
 */
function classifyPage(
  page: readonly Row[],
  byClass: Map<string, number>,
  byMethod: Map<string, number>,
  chars: Map<string, number>,
  samples: Map<string, Row[]>,
  sampleN: number,
): Update[] {
  const updates: Update[] = [];
  for (const r of page) {
    const { documentClass, method } = classifyHcDocument({
      disposalNature: r.disposal_nature,
      caseNumber: r.case_number,
      fullText: r.full_text,
    });
    const key = documentClass ?? '(unclassified)';
    byClass.set(key, (byClass.get(key) ?? 0) + 1);
    chars.set(key, (chars.get(key) ?? 0) + r.len);
    // Unclassified methods carry the offending value; keep only the head so the
    // report does not become a list of 9,800 disposal strings.
    const head = method.split(':')[0]!;
    byMethod.set(head, (byMethod.get(head) ?? 0) + 1);
    updates.push({ id: r.id, cls: documentClass, method });
    const bucket = samples.get(key) ?? [];
    if (bucket.length < sampleN) {
      bucket.push(r);
      samples.set(key, bucket);
    }
  }
  return updates;
}

/**
 * Postgres error codes that mean "the server was busy", not "the query is wrong".
 *
 * `57014` is `statement_timeout`, and it is the one that has actually killed
 * this walk: measured 21 Aug 2026, the process died after 706,000 rows when a
 * `writeClasses` UPDATE waited ten minutes behind a full-text `ILIKE` scan that
 * another job in this same lane was running, and the resulting rejection was an
 * uncaughtException. **Fifty-five minutes of the walk that protects the GPU feed
 * were lost to a transient lock queue.**
 *
 * The list is deliberately short. A constraint violation, a type error or a
 * syntax error must still kill the run loudly on the first occurrence —
 * retrying those is how a broken write becomes a broken write repeated eight
 * times, and the second failure mode is much harder to see than the first.
 */
const TRANSIENT_PG_CODES = new Set([
  '57014', // statement_timeout — the measured one
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
  '08006', // connection_failure
  '08003', // connection_does_not_exist
  '57P01', // admin_shutdown
]);

const WRITE_ATTEMPTS = 5;

/**
 * Retry a statement while the failure is the server being busy.
 *
 * One helper for the read and the write, so the two cannot drift into disagreeing
 * about what "transient" means — which is how a guard ends up covering the half
 * of the job that was never the one failing.
 *
 * Backoff is 2s, 4s, 8s, 16s rather than a fixed delay, because the thing being
 * waited out is another job's minutes-long scan, and retrying into the queue it
 * is stuck behind only makes that queue longer. Every retry is announced on
 * stderr: a walk that quietly retries is a walk whose slowdown has no
 * explanation, and this one has to be diagnosable at 3am by its log alone.
 */
async function withTransientRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (attempt >= WRITE_ATTEMPTS || code === undefined || !TRANSIENT_PG_CODES.has(code)) throw err;
      const waitMs = 2000 * 2 ** (attempt - 1);
      console.error(
        `\n  ${what} retry ${attempt}/${WRITE_ATTEMPTS - 1} after ${code} — waiting ${waitMs / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

async function writeClasses(sql: Sql, updates: readonly Update[]): Promise<void> {
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    /**
     * Retry the SLICE, not the page.
     *
     * Each slice is its own statement and its own transaction, so a retry
     * re-runs exactly the work that failed. The UPDATE is idempotent — it sets
     * two columns to values computed from the row's own text — so a slice that
     * partially succeeded and then timed out is safe to run again, and a slice
     * the walk already wrote is safe to write identically.
     */
    await withTransientRetry(
      'write',
      () => sql`
        UPDATE judgments AS j SET hc_document_class = v.cls, hc_class_method = v.method
        FROM (VALUES ${sql(slice.map((u) => [u.id, u.cls, u.method] as const))})
             AS v(id, cls, method)
        WHERE j.id = v.id::uuid`,
    );
  }
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const confirm = process.argv.includes('--confirm');
  const sampleAt = process.argv.indexOf('--sample');
  const sampleN = sampleAt === -1 ? 0 : Number(process.argv[sampleAt + 1] ?? 5);
  /**
   * `openDb()`, not `postgres()` directly. A stalled DNS lookup is NOT covered
   * by `connect_timeout`, and seven long-running passes died on exactly that
   * today before `db-host.ts` existed. This job walks the whole corpus, so it is
   * precisely the shape that gets caught by it.
   */
  /**
   * TEN MINUTES, and it is the supervisor's SIGKILL that makes it necessary.
   *
   * Measured 18 Aug 2026: `hc-classify-boot` was stall-killed twice and
   * restarted five times, and each dead worker left its `UPDATE judgments SET
   * hc_document_class …` running server side holding row locks. Four such
   * backends were found in `pg_stat_activity` at 57, 42, 27 and 12 minutes,
   * three of them blocked on the first — a convoy the restart loop built rather
   * than cleared, because killing a client does not kill its statement.
   *
   * A page write is 2,000 rows in batches of 1,000 and takes seconds when the
   * box is not saturated. Ten minutes is far outside that and far inside the
   * fifteen-minute stall window, so a statement this bound cancels is one that
   * was going to be SIGKILLed anyway — and now dies with its locks instead of
   * outliving them. `db-host.ts` has the full note.
   */
  const sql = await openDb(url, 2, 10 * 60_000);

  try {
    /**
     * PAGED AND RESUMABLE, because the corpus outgrew the original query.
     *
     * This selected `full_text` for every non-Supreme-Court judgment in one
     * result set. That was fine at 40,980 documents and is not fine at 265,000+
     * — the High Court ingest is currently landing ~34,000 an hour, and the
     * whole set is several gigabytes of text in a single round trip over a
     * shared proxy.
     *
     * `--resume` restricts the walk to rows no rule has judged yet
     * (`hc_class_method IS NULL`), so a re-run after an interrupted pass costs
     * only what is left. Without it the walk covers everything, which is what a
     * changed rule set needs.
     */
    const RESUME = process.argv.includes('--resume');
    /**
     * `--restale` — re-assess rows a PREVIOUS rule set could not claim.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * INTENT: code stamps `unclassified_disposal:<raw>` and `--resume` then
     * skips the row forever, because it has a method; the task expects the
     * 14 Aug vocabulary extension to have reduced the unclassified population;
     * `hc-classify.ts` MEASURED_VOCABULARY says those strings were added
     * precisely so they would stop being unclassified. Spec and task agree and
     * the CODE CANNOT EXPRESS EITHER — there was no selector for "judged, but
     * by rules that have since changed".
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Measured before writing this, by replaying today's `classifyHcDocument`
     * over the raw disposal strings the column recorded
     * (`disposal-coverage-cli.ts`, 332 distinct strings, 883,796 rows):
     *
     *   STALE      123,840  14.0%  today's rules DO classify these
     *   RESIDUE    755,620  85.5%  refused on purpose (DISPOSED/CLOSED family)
     *   CANDIDATE    4,336   0.5%  refused, and not by a documented decision
     *
     * `DISMISSED AS WITHDRAWN` (20,674), `DISMISSED AS INFRUCTUOUS` (16,878),
     * `38-RULE ABSOLUTE/ALLOWED @ FH` (8,586) and the `DISMISED` misspelling
     * (4,209) are all in the STALE column — every one of them named in
     * MEASURED_VOCABULARY as a string the rules were extended to catch.
     *
     * **This is why the flag is not `--resume` widened.** A row stamped
     * `unclassified_disposal:` and a row stamped nothing look identical to any
     * count of `hc_document_class IS NULL`, and they want opposite work: the
     * first wants a re-run of rules that already exist, the second wants a
     * classifier pass it has never had. Conflating them is how "we need better
     * rules" gets concluded from a population that needed no new rule at all.
     *
     * Deliberately does NOT include `no_disposal_nature` (164,993 rows). Those
     * rows have an empty source field; no rule change can help them and
     * re-reading their text every time the vocabulary moves is pure cost.
     */
    const RESTALE = process.argv.includes('--restale');
    if (RESTALE && RESUME) {
      console.error('--restale and --resume select disjoint populations; pass one.');
      process.exit(2);
    }
    /**
     * `--restale-rule <name>` — re-assess the rows ONE NAMED RULE could now
     * claim, after that rule changed.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * INTENT: code has `--restale`, which selects `unclassified_disposal:%`;
     * the task after the 21 Aug bail fix expects rows the previous rule set
     * claimed WRONGLY to be re-assessed; `--restale`'s own doc says its purpose
     * is rows a previous rule set "could not claim". Those are different
     * populations and the code could express only the first, so this adds the
     * second rather than widening a flag whose meaning is documented.
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Narrow on purpose, in two independent ways, because the alternative is a
     * full-text re-read of every `decided` row — the exact cost `--restale`
     * exists to avoid.
     *
     * **The method filter is exact, not a guess.** `BAIL_PHRASE` is reached only
     * inside the `isMerits` branch of `classifyHcDocument`, and that branch has
     * exactly two outcomes: `disposal_nature_merits` and
     * `disposal_nature_merits_short`. No row stamped anything else can change
     * verdict because this rule changed. Verified by reading the function, and
     * it is the ordering that makes it true — `isBail` and `isProcedural` both
     * return before `isMerits` is reached.
     *
     * **The text prefilter is exact too.** Every alternative in `BAIL_PHRASE`
     * contains the literal substring `bail`, so a document without it cannot
     * match under any spacing. `ILIKE '%bail%'` is therefore a superset of the
     * rule's precondition and can only cost work, never correctness. It is what
     * keeps this from shipping a million documents' `full_text` over the wire
     * to discover that 99.2% of them say nothing about bail.
     *
     * Kept as a NAMED TABLE rather than free-text arguments. A `--methods` and
     * `--prefilter` pair would let a future caller pass a filter that is not a
     * superset of the rule it claims to re-run, and silently re-classify the
     * wrong population — a mistake with no error path, which is the failure
     * shape this repo has hit four times.
     */
    const RULE_METHODS: Record<string, string[]> = {
      bail: ['disposal_nature_merits', 'disposal_nature_merits_short'],
      /* Same population as `bail`: `operative_act_withdrawn` is reached from the
       * same `isMerits` branch, so only rows that branch stamped can move. */
      withdrawn: ['disposal_nature_merits', 'disposal_nature_merits_short'],
    };
    /* Every alternative in the WITHDRAWN patterns contains the literal substring
     * `withdraw` -- `dismissed as withdrawn`, `permitted to withdraw the ...` --
     * so this is a superset of the rule's precondition and can cost work but
     * never correctness. Same argument as the bail prefilter. */
    const RULE_PREFILTER: Record<string, string> = { bail: '%bail%', withdrawn: '%withdraw%' };
    const ruleArgIndex = process.argv.indexOf('--restale-rule');
    const RESTALE_RULE = ruleArgIndex >= 0 ? (process.argv[ruleArgIndex + 1] ?? null) : null;
    if (RESTALE_RULE !== null && RULE_METHODS[RESTALE_RULE] === undefined) {
      console.error(
        `--restale-rule ${RESTALE_RULE} is not a known rule. Known: ${Object.keys(RULE_METHODS).join(', ')}`,
      );
      process.exit(2);
    }
    if (RESTALE_RULE !== null && (RESUME || RESTALE)) {
      console.error('--restale-rule selects a population disjoint from --resume and --restale; pass one.');
      process.exit(2);
    }
    /**
     * The stale METHOD STRINGS, computed once, so the walk reads 123,840 rows
     * instead of 883,796.
     *
     * A first version selected `hc_class_method LIKE 'unclassified_disposal:%'`
     * and was abandoned after 45 minutes without emitting a page. The page query
     * is not the problem — `EXPLAIN ANALYZE` puts it at **1.03 s** on a plain
     * primary-key index scan. The cost is `full_text`: 2,000 documents per page
     * across 442 pages is the whole 883,796-document text volume off disk, on a
     * box already saturated by eight ingest scopes.
     *
     * **Seven eighths of that read cannot change anything.** Replaying the
     * current rules over the recorded vocabulary (`disposal-coverage-cli.ts`)
     * says 755,620 rows are the `DISPOSED*`/`CLOSED` family the module refuses
     * on purpose and 4,336 are refused for want of a rule; re-reading their text
     * produces `unclassified_disposal:` again, identically, at full price. Only
     * the 123,840 whose string today's rules DO claim can move.
     *
     * So the set is narrowed to exactly those method strings and passed as an
     * array. One `GROUP BY` over the column pays for it once.
     *
     * **The one inaccuracy, stated rather than discovered later:**
     * `hc_class_method` stores the disposal truncated to 40 characters
     * (`unclassified_disposal:${disposal.slice(0, 40)}`), so this selects on a
     * PREFIX of what the row actually holds. A disposal whose truncated form
     * fails a rule its full form would pass is therefore skipped. That errs
     * toward doing LESS work and never toward a wrong class — the rows that are
     * selected are re-classified against the real `disposal_nature`, not against
     * the prefix.
     */
    let staleMethods: string[] | null = null;
    if (RESTALE) {
      const vocab = await sql<{ method: string }[]>`
        SELECT DISTINCT hc_class_method AS method
        FROM judgments
        WHERE hc_class_method LIKE 'unclassified_disposal:%'`;
      staleMethods = vocab
        .map((v) => v.method)
        .filter(
          (m) =>
            classifyHcDocument({
              disposalNature: m.slice('unclassified_disposal:'.length),
              caseNumber: null,
              /* Long and inert: this asks the DISPOSAL branches only. The two
               * prose rules are held off deliberately — a row they would claim
               * is classified either way, which is what is being selected for. */
              fullText: 'x'.repeat(5000),
            }).documentClass !== null,
        );
      if (staleMethods.length === 0) {
        console.log('no recorded verdict differs from the current rules — nothing to re-assess.');
        await sql.end({ timeout: 5 });
        return;
      }
      console.log(
        `${staleMethods.length} of ${vocab.length} recorded unclassified strings are claimed by today's rules.`,
      );
    }
    /**
     * `--frame <file>` — classify EXACTLY the rows in a stratified sampling
     * frame, in frame order, and nothing else.
     *
     * Requested by NEW1 (bus 0706). The distinction they drew is the reason this
     * mode exists rather than a `--limit`: `hc_document_class` is not an input to
     * their pilot, it is a SELECTOR, and a selector whose per-class precision is
     * unmeasured cannot be used to choose 13.5 million vectors' worth of
     * embedding work. Measuring that precision needs a sample with known
     * inclusion probabilities, not the first N rows of a cursor walk.
     *
     * A newest-first walk cannot produce it at any volume. The corpus arrives
     * court-by-court and year-by-year, so the first 50,000 rows of a walk are
     * one court in one year — a population you can classify and cannot
     * generalise from. `scripts/migration/new2-stratified-sample.mjs` draws the
     * frame; this reads it.
     */
    const frameAt = process.argv.indexOf('--frame');
    const FRAME_PATH = frameAt === -1 ? null : (process.argv[frameAt + 1] ?? null);
    let frameIds: string[] | null = null;
    if (FRAME_PATH !== null) {
      const frame = JSON.parse(readFileSync(FRAME_PATH, 'utf8')) as {
        strata?: { ids?: string[] }[];
      };
      frameIds = (frame.strata ?? []).flatMap((st) => st.ids ?? []);
      if (frameIds.length === 0) {
        console.error(`${FRAME_PATH} carries no ids — refusing to classify the whole corpus by accident.`);
        process.exit(2);
      }
      console.log(
        `frame ${FRAME_PATH}: ${frameIds.length.toLocaleString()} rows across ` +
          `${(frame.strata ?? []).length} strata. Classifying these and nothing else.`,
      );
    }
    const PAGE = 2_000;
    const byClass = new Map<string, number>();
    const byMethod = new Map<string, number>();
    const chars = new Map<string, number>();
    const samples = new Map<string, Row[]>();
    let total = 0;

    /**
     * STREAMED, because accumulating the corpus no longer fits in memory.
     *
     * The query was paged, but the loop then did `rows.push(...page)` and held
     * every document's `full_text` until the walk finished. That was written for
     * 265,000 documents. At **833,149** it dies: a dry run reached 322,000 —
     * roughly 2 GB of text — and the process vanished with no summary and no
     * error, which is what heap exhaustion looks like from outside.
     *
     * Each page is now classified, written, and dropped. Peak memory is ONE
     * page, so the walk costs the same at 833k as at 80k, and the same again at
     * 17.8M — the only version that survives the corpus we are heading for.
     *
     * Writing per page also makes an interrupted run useful: completed pages
     * are already committed and `--resume` restarts from
     * `hc_class_method IS NULL`.
     */
    /**
     * THE CURSOR IS PERSISTED, AND ONLY FOR `--resume`.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * INTENT: code starts every run at uuid zero; the task is to keep ONE
     * classifier healthy through restarts; the module's own doc says an
     * interrupted run is cheap because `--resume` restarts from
     * `hc_class_method IS NULL`. The predicate is indeed cheap to satisfy — it
     * is cheap to FIND that is the problem, and nothing said so.
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Measured 21 Aug 2026. The walk died at 706,000 rows and was restarted.
     * Seventeen minutes later it had not emitted its first progress line,
     * because starting at zero makes the first page index-scan past the
     * **4.1 million rows already classified below the frontier** before it finds
     * 2,000 that are not. That cost is not constant: it grows with the frontier,
     * so at 50% walked a restart would scan nine million rows, and the job that
     * has to stay ahead of a GPU is at its slowest exactly when it has most to
     * protect.
     *
     * **Why a watermark is safe HERE, when it generally is not.** A NEW2 note
     * records that an id watermark cannot see new rows — random uuids put every
     * later arrival below it and the pass exits clean. Two things make this the
     * exception, and both are checked rather than assumed:
     *
     *   1. historical bulk ingestion is CLOSED, so no row arrives below the
     *      watermark while the walk runs;
     *   2. the predicate is still `hc_class_method IS NULL`. The cursor only
     *      says where to START LOOKING; it never says a row is done. Every row
     *      the walk touches gets a method — including the ones it deliberately
     *      refuses, which are stamped `unclassified_disposal:` — so after a page
     *      commits, nothing below the cursor satisfies the predicate.
     *
     * And because assumption 1 is a fact about today rather than a property of
     * the code, the run ENDS with a sweep from zero (`--no-sweep` to skip). If
     * the sweep finds anything, the watermark was wrong and the walk says so
     * instead of exiting clean.
     *
     * The checkpoint is written AFTER the page's write, never before. A crash
     * between the two must re-do a page, never skip one — the same ordering the
     * damage export uses, and the opposite of what the in-memory cursor did:
     * it advanced before `writeClasses`, so the page that killed the run at
     * 706,000 was already counted as walked.
     */
    const CURSOR_FILE = join(dirname(fileURLToPath(import.meta.url)), '../.checkpoints/hc-classify.cursor');
    const ZERO = '00000000-0000-0000-0000-000000000000';
    const usesCursor = RESUME && confirm && frameIds === null;
    let cursor = ZERO;
    if (usesCursor && existsSync(CURSOR_FILE)) {
      const saved = readFileSync(CURSOR_FILE, 'utf8').trim();
      if (/^[0-9a-f-]{36}$/i.test(saved)) {
        cursor = saved;
        console.log(`resuming from checkpoint ${cursor}`);
      } else {
        console.error(`checkpoint file is not a uuid (${JSON.stringify(saved.slice(0, 40))}); starting from zero`);
      }
    } else if (usesCursor) {
      console.log('no checkpoint — starting from zero; the first page must scan past everything already classified');
    }
    let sweeping = false;
    for (;;) {
      /**
       * The frame restricts the SAME cursor walk rather than replacing it, so
       * paging, `--resume`, the STOP check and the per-page write all behave
       * identically. A separate code path for the sampled run is how the two
       * would drift, and the sampled run is the one whose numbers get published.
       */
      /**
       * The READ is retried too, and it is not a symmetry flourish.
       *
       * The walk was killed twice on 21 Aug by `statement_timeout` [57014]: once
       * in `writeClasses`, and once HERE, ten minutes into the first page after
       * a restart. Guarding only the write would have caught one of the two.
       *
       * The read is trivially safe to repeat — it takes no locks and changes
       * nothing — so unlike the write it needs no idempotence argument.
       */
      const page = await withTransientRetry('page read', () => sql<Row[]>`
        SELECT id, disposal_nature, case_number, full_text, length(full_text) AS len
        FROM judgments
        WHERE court <> 'Supreme Court of India' AND id > ${cursor}::uuid
          ${RESUME ? sql`AND hc_class_method IS NULL` : sql``}
          ${staleMethods === null ? sql`` : sql`AND hc_class_method = ANY(${staleMethods}::text[])`}
          ${frameIds === null ? sql`` : sql`AND id = ANY(${frameIds}::uuid[])`}
          ${
            RESTALE_RULE === null
              ? sql``
              : sql`AND hc_class_method = ANY(${RULE_METHODS[RESTALE_RULE]!}::text[])
                    AND full_text ILIKE ${RULE_PREFILTER[RESTALE_RULE]!}`
          }
        ORDER BY id
        LIMIT ${PAGE}`);
      if (page.length === 0) {
        /* Reached the end. If a checkpoint was used, the walk has only proved
         * the corpus is clean ABOVE where it started, so sweep from zero once
         * before claiming a full pass. */
        if (usesCursor && !sweeping && cursor !== ZERO && !process.argv.includes('--no-sweep')) {
          console.log(`\n  end of walk — sweeping from zero to verify nothing below ${cursor} was skipped`);
          sweeping = true;
          cursor = ZERO;
          continue;
        }
        break;
      }
      if (sweeping) {
        console.error(
          `\n  SWEEP FOUND ${page.length} unclassified rows BELOW the checkpoint. ` +
            `The watermark was not safe and these are being classified now — ` +
            `report this, it means a row arrived below the cursor or a page write was lost.`,
        );
      }
      stopIfRequested();
      const pageEnd = page[page.length - 1]!.id;
      total += page.length;

      const pageUpdates = classifyPage(page, byClass, byMethod, chars, samples, sampleN);
      if (confirm) await writeClasses(sql, pageUpdates);
      /* Only now. The write is what makes the page done; the cursor records
       * that fact and must not anticipate it. */
      cursor = pageEnd;
      if (usesCursor && !sweeping) writeFileSync(CURSOR_FILE, cursor);

      process.stdout.write(`\r  ${confirm ? 'classified + wrote' : 'classified'} ${total.toLocaleString()}`);
      if (page.length < PAGE) break;
    }
    const scopeLabel = RESUME
      ? ' (never assessed)'
      : RESTALE
        ? ' (previously unclassified_disposal, re-assessed against current rules)'
        : RESTALE_RULE !== null
          ? ` (re-assessed for the '${RESTALE_RULE}' rule only)`
          : '';
    console.log(`\n${total} High Court documents${scopeLabel}\n`);
    if (total === 0) {
      console.log('nothing to classify.');
      return;
    }
    console.log('class                    documents      share   mean chars');
    for (const [k, n] of [...byClass.entries()].sort((a, b) => b[1] - a[1])) {
      const pct = ((n / total) * 100).toFixed(1);
      const mean = Math.round((chars.get(k) ?? 0) / n);
      console.log(`  ${k.padEnd(22)} ${String(n).padStart(6)}  ${pct.padStart(6)}%  ${String(mean).padStart(8)}`);
    }
    console.log('\nrule that fired:');
    for (const [k, n] of [...byMethod.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(34)} ${String(n).padStart(6)}`);
    }

    if (sampleN > 0) {
      console.log('\n──────── VALIDATION SAMPLE — read these, do not trust the counts ────────');
      for (const [k, bucket] of samples) {
        console.log(`\n████ ${k}`);
        for (const r of bucket) {
          console.log(`  [${r.len} chars] ${r.disposal_nature ?? '(no disposal)'} · ${r.case_number}`);
          console.log(`     ${r.full_text.replace(/\s+/g, ' ').slice(0, 240)}`);
        }
      }
    }

    if (!confirm) {
      console.log('\nreport only. re-run with --confirm to write.');
      return;
    }

    const [check] = await sql<{ classified: number; unclassified: number; methodless: number }[]>`
      SELECT count(hc_document_class)::int AS classified,
             count(*) FILTER (WHERE hc_document_class IS NULL AND hc_class_method IS NOT NULL)::int AS unclassified,
             count(*) FILTER (WHERE hc_class_method IS NULL)::int AS methodless
      FROM judgments WHERE court <> 'Supreme Court of India'`;
    /**
     * `(must be 0)` IS ONLY TRUE OF A FULL WALK, and printing it after a
     * `--frame` run is a lie about a healthy result.
     *
     * The assertion exists because a full pass touches every High Court row, so
     * a leftover `hc_class_method IS NULL` means the walk missed something. A
     * frame run classifies 53,708 rows out of 14.6M ON PURPOSE, so the same
     * number is correctly ~12.6M — and the first frame run printed
     * `12,624,089 with no method (must be 0)`, which reads as a catastrophic
     * failure of a run that did exactly what it was told.
     *
     * The defect arrived with `--frame`, so it is fixed here rather than left
     * for whoever reads that line next and reasonably panics.
     *
     * **`--restale` and `--resume` inherited the same lie and are fixed with it.**
     * A `--restale` run classifies ONLY rows already stamped
     * `unclassified_disposal:`, so it cannot touch a methodless row by
     * construction — and it duly printed `14,058,456 with no method (must be 0)`
     * after a run that converted 123,491 rows exactly as designed. The assertion
     * belongs to the full walk and to nothing else; every selector that narrows
     * the walk has to say so, or the tool reports its own success as a disaster.
     */
    const scopeNote =
      frameIds !== null
        ? `with no method — EXPECTED: this run classified only the ${frameIds.length.toLocaleString()} rows in the frame`
        : RESTALE
          ? 'with no method — EXPECTED: --restale re-reads only rows a previous rule set refused, and can never reach a methodless row'
          : RESUME
            ? 'with no method — remaining backlog for this selector; --resume walks exactly these, so a non-zero figure is work left, not a defect'
            : RESTALE_RULE !== null
              ? `with no method — EXPECTED: --restale-rule ${RESTALE_RULE} re-reads only rows already stamped by the rule it belongs to, and can never reach a methodless row`
              : 'with no method (must be 0 after a full pass)';
    console.log(
      `\nwritten: ${check?.classified} classified, ${check?.unclassified} deliberately unclassified, ` +
        `${check?.methodless} ${scopeNote}`,
    );
  } finally {
    await sql.end();
  }
}

await main();
