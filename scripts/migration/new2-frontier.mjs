/**
 * NEW2 — THE CURRENT ACTIONABLE CORPUS FRONTIER.
 *
 * WHY THIS EXISTS, AND WHY `source - held` IS NOT IT
 *
 * Every earlier frontier in this lane was `sourceRecords - acquired`, and that
 * subtraction cannot be defended for three independent reasons, all of them
 * measured rather than suspected:
 *
 *   1. The source side counts parquet ROWS, not documents. NEW3 measured
 *      `year=2023/court=9_13/bench=cisdb_16012018/metadata.parquet` directly:
 *      443,845 rows, 225,366 distinct `pdf_link`, every duplicate exactly 2x,
 *      in a clean two-block split at row 219,480. That is a source-side
 *      re-export appended to the same object. `judgments.source_url` is
 *      uniquely indexed, so the duplication never reached the corpus — it
 *      reaches only the DENOMINATOR (bus 0721).
 *   2. The held side is keyed on the partition year in `source_url`, the source
 *      side on the partition directory. Those agree. But a court-year can hold
 *      MORE than its source count for exactly the reason above, and a negative
 *      remainder read as zero hides it.
 *   3. `pdf_absent` is not `pdf_failed`. 161,735 records are 404 at the bucket
 *      and will never be recovered by ingest at any width; 37,948 are retryable.
 *      Folding them together produces a work queue containing work that does
 *      not exist.
 *
 * WHAT THIS MEASURES INSTEAD: THE CURSOR, NOT THE DIFFERENCE
 *
 * `services/ingest/.checkpoints/<scope>.json` maps every parquet key a scope has
 * touched to `{ offset, size }`, where `offset` is a ROW cursor into that file.
 * It is written after every batch and it is the same number the worker resumes
 * from. So "how many source rows has no worker ever read" is not a subtraction
 * between two differently-defined populations — it is
 *
 *     sourceRows(court, year)  -  SUM(offset) over that court-year's keys
 *
 * Both sides count the same thing (rows of the same parquet files), so the
 * duplication inflates both and cancels in the DIFFERENCE even though it
 * inflates each TOTAL. That is the property `source - held` did not have.
 *
 * A cell whose cursor has reached the end is WALKED: every row was read, and
 * whatever did not become a judgment is in `hc_ingest_ledger` by construction.
 * A WALKED cell has zero remaining actionable work no matter what its held
 * count says, and that is the single most useful fact for scheduling.
 *
 * THE STATES
 *
 *   SOURCE_ZERO          no source partition exists. Not a gap. Requires a
 *                        POSITIVE source measurement, never the absence of one.
 *   WALKED               cursor at or past the row count. No work remains.
 *   REMAINING_ACTIONABLE rows no cursor has reached. This is the work queue.
 *   WALKED_NO_CURSOR     no checkpoint covers the cell, but held plus permanent
 *                        absences already account for every source row. Almost
 *                        always hc-boot-sweep, which writes no checkpoint.
 *   REMAINING_NO_CURSOR  no checkpoint covers the cell AND held does not account
 *                        for its source. An ESTIMATE by the weak subtraction,
 *                        never a cursor fact, and separated for that reason.
 *                        Kept visible because seven courts held ~0 purely
 *                        because no worker was ever configured for them, and
 *                        that read as slowness for weeks.
 *
 * PERMANENT_PDF_ABSENT and RETRYABLE_FAILED are properties of rows already
 * walked, so they are reported as totals beside the states rather than as
 * states: a cell can be WALKED and still owe 15,000 permanent 404s, and
 * collapsing those two facts into one label is what made the old report
 * unusable for scheduling.
 *
 * Usage: node scripts/migration/new2-frontier.mjs [--md <path>] [--top 40]
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SURVEY = join(ROOT, 'docs', 'HC_METADATA_SURVEY.json');
const EXCLUSIONS = join(ROOT, 'docs', 'ops', 'migration', 'new2-source-exclusions.json');
const HELD = join(ROOT, 'docs', 'ops', 'migration', 'new2-held-by-court-year.json');
const LEDGER = join(ROOT, 'docs', 'ops', 'migration', 'new2-ledger-by-court-year.json');
const CKPT = join(ROOT, 'services', 'ingest', '.checkpoints');
const OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-frontier.json');

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : (process.argv[i + 1] ?? d);
};
const TOP = Number(arg('top', '40'));
const MD_OUT = arg('md', null);

const survey = JSON.parse(readFileSync(SURVEY, 'utf8'));

/**
 * SOURCE ROWS THE INGESTER WILL NEVER FETCH, SUBTRACTED FROM THE DENOMINATOR.
 *
 * `HC_METADATA_SURVEY.perCourtPerYear` sums parquet footers per court-year with
 * no bench breakdown. `hc-load` refuses `bench=testcase` outright — it is a
 * published test fixture, the exclusion is deliberate, documented in
 * HC_INGEST_PLAN.md, and covered by a test. So the survey counts rows no worker
 * will ever consume, and every actionable figure derived from it carried a
 * remainder that could not shrink no matter how long the fleet ran.
 *
 * Measured 20 Aug 2026, and it was the ENTIRE remaining frontier: Bombay read
 * 289,502 rows outstanding across 44 years while every one of its scopes had
 * walked its objects to the end and written nothing. 289,502 is the fixture
 * total to the row.
 *
 * The artifact is produced by importing `isTestFixture` from the ingester
 * rather than re-implementing the predicate, so what is subtracted here cannot
 * drift from what is refused there.
 */
const exclusions = existsSync(EXCLUSIONS)
  ? JSON.parse(readFileSync(EXCLUSIONS, 'utf8'))
  : { byCourtCodeByYear: {}, totalRows: 0, takenAt: null };
const excludedMap = exclusions.byCourtCodeByYear ?? {};
const held = JSON.parse(readFileSync(HELD, 'utf8'));
const ledger = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { byCourtCodeByYear: {} };
const codeByName = new Map((survey.perCourt ?? []).map((c) => [c.name, c.code]));
const heldMap = held.heldByCourtCodeBySourceYear ?? {};
const ledgerMap = ledger.byCourtCodeByYear ?? {};

/**
 * Cursor totals per court-year, merged over every checkpoint that mentions the
 * key. Two scopes CAN legitimately touch the same key — a year-scoped worker and
 * a band worker overlap at a boundary year — so this takes the MAX per key
 * rather than the sum. Summing would double-count a resumed scope and produce a
 * cursor beyond the end of the file, which reads as WALKED and would hide real
 * remaining work. Max is the correct merge for a monotonic cursor.
 */
const cursorByKey = new Map();
const scopesByCell = new Map();
let checkpointsRead = 0;
let checkpointsCorrupt = 0;
for (const f of readdirSync(CKPT)) {
  if (!f.endsWith('.json')) continue;
  if (f.startsWith('paragraphs-') || f.startsWith('citation-keys')) continue;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(CKPT, f), 'utf8'));
  } catch {
    checkpointsCorrupt++;
    continue;
  }
  checkpointsRead++;
  const scope = f.replace(/\.json$/, '');
  for (const [key, v] of Object.entries(parsed)) {
    const court = /court=([^/]+)/.exec(key)?.[1];
    const year = /year=(\d+)/.exec(key)?.[1];
    if (!court || !year) continue;
    const off = Number(v?.offset ?? 0);
    cursorByKey.set(key, Math.max(cursorByKey.get(key) ?? 0, off));
    const cell = `${court} ${year}`;
    if (!scopesByCell.has(cell)) scopesByCell.set(cell, new Set());
    scopesByCell.get(cell).add(scope);
  }
}
const cursorByCell = new Map();
for (const [key, off] of cursorByKey) {
  const court = /court=([^/]+)/.exec(key)[1];
  const year = /year=(\d+)/.exec(key)[1];
  const cell = `${court} ${year}`;
  cursorByCell.set(cell, (cursorByCell.get(cell) ?? 0) + off);
}

/**
 * THE HELD SNAPSHOT MUST NOT BE OLDER THAN THE CURSORS, and this guard exists
 * because the artefact was wrong before it existed.
 *
 * The first full run of this file emitted thirteen cells reading `WALKED` with a
 * held count under 50% of source — `18_6 2016 source 12,997 held 0 0.0% WALKED`
 * among them — which reads exactly like "the worker walked every row and wrote
 * nothing", i.e. a serious acquisition defect. Checked live against `judgments`:
 * that cell holds **12,997 of 12,997**. The held snapshot had been taken WHILE
 * `hc-boot-mid-18_6` was mid-run, so the cursor was current and the held column
 * was not.
 *
 * A stale held column does not fail loudly; it produces a plausible coverage gap
 * in a file another lane is meant to build a coverage contract on. So the check
 * is mechanical: if any checkpoint file was modified after the held snapshot was
 * taken, say so at the top of the report and in the artefact, every time.
 */
let newestCursorMtime = 0;
for (const f of readdirSync(CKPT)) {
  if (!f.endsWith('.json')) continue;
  try {
    newestCursorMtime = Math.max(newestCursorMtime, statSync(join(CKPT, f)).mtimeMs);
  } catch {
    /* a file that vanished between readdir and stat is a live fleet writing, which
     * is itself the condition this guard is about — ignore it and keep going. */
  }
}
const heldTakenAt = Date.parse(held.takenAt ?? '') || 0;
const heldIsStale = newestCursorMtime > heldTakenAt;
const staleBySeconds = heldIsStale ? Math.round((newestCursorMtime - heldTakenAt) / 1000) : 0;

const rows = [];
for (const [courtName, byYear] of Object.entries(survey.perCourtPerYear ?? {})) {
  const code = codeByName.get(courtName);
  if (!code) continue;
  for (const [y, srcRaw] of Object.entries(byYear)) {
    const year = Number(y);
    const sourceRowsRaw = Number(srcRaw);
    /* Fixture rows come off the top. A cell whose whole source is fixture falls
     * to zero here and is reported as SOURCE_EXCLUDED rather than as work. */
    const excludedRows = Number(excludedMap[code]?.[y] ?? 0);
    const sourceRows = Math.max(0, sourceRowsRaw - excludedRows);
    const cell = `${code} ${y}`;
    const walked = cursorByCell.get(cell) ?? 0;
    const hasScope = scopesByCell.has(cell);
    const acquired = Number(heldMap[code]?.[y] ?? 0);
    const l = ledgerMap[code]?.[y] ?? {};
    const permanentAbsent = Number(l.sourceDocumentMissing ?? 0);
    const retryable = Number(l.retryPending ?? 0);
    const otherFailure = Number(l.otherFailure ?? 0);
    /**
     * ABSENCE OF A CURSOR IS NOT ABSENCE OF WORK DONE, and the first version of
     * this file got that wrong in a way its own output exposed: it printed
     * `36_29 2023 source 66,857 | held 65,782` under the heading NEVER SCOPED.
     *
     * The fleet's general sweep is launched as
     * `Start-Worker 'hc-boot-sweep' (HcArgs -FromYear '2016' -Concurrency '16')`
     * with the comment "No --court, so no checkpoint, by design"
     * (`scripts/start-ingest-fleet.ps1`). The checkpoint PATH is a function of
     * --court/--year, so a court-less worker writes none. Every cell the sweep
     * covered therefore has a cursor of zero and a held count in the tens of
     * thousands, and reading that as 66,857 rows of remaining work would put
     * ~400k rows of already-finished work at the top of a fleet plan.
     *
     * So the remaining estimate has TWO methods and each cell says which it
     * used. Where a cursor exists it is authoritative — it is the number the
     * worker itself resumes from. Where none exists, fall back to
     * `source - held - permanentAbsent`, which is the weak subtraction this
     * whole file exists to avoid, and which is therefore labelled `held_fallback`
     * everywhere it appears rather than being silently mixed into the total.
     */
    const cursorRemaining = Math.max(0, sourceRows - walked);
    const fallbackRemaining = Math.max(0, sourceRows - acquired - permanentAbsent);
    const method = hasScope ? 'cursor' : 'held_fallback';
    const remaining = hasScope ? cursorRemaining : fallbackRemaining;
    let state;
    if (sourceRows === 0 && excludedRows > 0) state = 'SOURCE_EXCLUDED';
    else if (sourceRows === 0) state = 'SOURCE_ZERO';
    else if (remaining === 0) state = hasScope ? 'WALKED' : 'WALKED_NO_CURSOR';
    else if (!hasScope) state = 'REMAINING_NO_CURSOR';
    else state = 'REMAINING_ACTIONABLE';
    rows.push({
      court: code,
      courtName,
      year,
      sourceRows,
      sourceRowsRaw,
      excludedRows,
      rowsWalked: walked,
      remainingRows: remaining,
      acquired,
      permanentAbsent,
      retryable,
      otherFailure,
      hasScope,
      remainingMethod: method,
      scopes: hasScope ? [...scopesByCell.get(cell)].sort() : [],
      state,
    });
  }
}
rows.sort(
  (a, b) => b.remainingRows - a.remainingRows || a.court.localeCompare(b.court) || a.year - b.year,
);

const byState = {};
for (const r of rows) {
  const s = (byState[r.state] ??= { cells: 0, sourceRows: 0, remainingRows: 0, acquired: 0 });
  s.cells++;
  s.sourceRows += r.sourceRows;
  s.remainingRows += r.remainingRows;
  s.acquired += r.acquired;
}

const totals = {
  sourceRows: rows.reduce((a, r) => a + r.sourceRows, 0),
  rowsWalked: rows.reduce((a, r) => a + r.rowsWalked, 0),
  remainingRows: rows.reduce((a, r) => a + r.remainingRows, 0),
  acquired: rows.reduce((a, r) => a + r.acquired, 0),
  permanentAbsent: rows.reduce((a, r) => a + r.permanentAbsent, 0),
  retryable: rows.reduce((a, r) => a + r.retryable, 0),
  otherFailure: rows.reduce((a, r) => a + r.otherFailure, 0),
};

/**
 * Per-court remaining, which is what a fleet plan is actually built from. A
 * court-year is too fine to schedule and the corpus total is too coarse to act
 * on; the unit a worker takes is a court and a band.
 */
const perCourt = new Map();
for (const r of rows) {
  const c = perCourt.get(r.court) ?? {
    court: r.court,
    courtName: r.courtName,
    sourceRows: 0,
    rowsWalked: 0,
    remainingRows: 0,
    acquired: 0,
    permanentAbsent: 0,
    retryable: 0,
    cellsRemaining: 0,
    cellsNoScope: 0,
    yearsRemaining: [],
  };
  c.sourceRows += r.sourceRows;
  c.rowsWalked += r.rowsWalked;
  c.remainingRows += r.remainingRows;
  c.acquired += r.acquired;
  c.permanentAbsent += r.permanentAbsent;
  c.retryable += r.retryable;
  if (r.state === 'REMAINING_ACTIONABLE' || r.state === 'REMAINING_NO_CURSOR') {
    c.cellsRemaining++;
    if (r.state === 'REMAINING_NO_CURSOR') c.cellsNoScope++;
    c.yearsRemaining.push(r.year);
  }
  perCourt.set(r.court, c);
}
const courts = [...perCourt.values()].sort((a, b) => b.remainingRows - a.remainingRows);
for (const c of courts) c.yearsRemaining.sort((a, b) => a - b);

const report = {
  tool: 'scripts/migration/new2-frontier.mjs',
  takenAt: new Date().toISOString(),
  derivedFrom: {
    source: `docs/HC_METADATA_SURVEY.json perCourtPerYear (${survey.generatedAt})`,
    sourceExclusions: `docs/ops/migration/new2-source-exclusions.json (${exclusions.takenAt ?? 'ABSENT — denominator NOT corrected'}) — ${Number(exclusions.totalRows ?? 0).toLocaleString()} fixture rows subtracted before any arithmetic`,
    held: `new2-held-by-court-year.json (${held.takenAt})`,
    ledger: `new2-ledger-by-court-year.json (${ledger.takenAt ?? 'absent'})`,
    cursors: `services/ingest/.checkpoints - ${checkpointsRead} read, ${checkpointsCorrupt} unparseable`,
  },
  heldFreshness: {
    heldTakenAt: held.takenAt ?? null,
    newestCursorWrite: newestCursorMtime ? new Date(newestCursorMtime).toISOString() : null,
    heldIsStale,
    staleBySeconds,
    meaning:
      'When heldIsStale is true a worker wrote after the held snapshot was taken, so every `acquired` and `heldShare` below is a LOWER bound and a cell can read as an acquisition gap that has since been filled. Cursors and remaining are unaffected — they come from the checkpoints.',
  },
  caveats: [
    'REMAINING is measured in source parquet ROWS, not documents. Rows over-count documents by an unmeasured amount (bus 0721: one Allahabad file is 443,845 rows for 225,366 documents), so remaining rows is an UPPER bound on remaining documents and the true work is smaller.',
    'The cursor and the source count read the SAME parquet rows, so duplication inflates both and largely cancels in the difference. It does NOT cancel in either total, which is why no percentage of corpus is printed here either.',
    'A WALKED cell claims only that every source row was READ. Rows that failed are in hc_ingest_ledger and are reported separately as permanentAbsent and retryable - they are not silently folded into "done".',
    'SOURCE_ZERO here means the survey found no partition. The survey is a footer read of 1,493 objects and is a positive measurement, not an inference from our own emptiness.',
    'Cursors merge by MAX per parquet key, not by sum: a year-scoped worker and a band worker legitimately share a boundary key, and summing them would report a cursor past the end of the file and hide real work as WALKED.',
    'A cell can read WALKED and still hold far fewer documents than its source rows - that is the duplication, the permanent 404s, and the failure ledger, in that order of size. WALKED is a statement about the WORK QUEUE, never about coverage.',
    'Two remaining methods are mixed and every cell says which: `cursor` where a checkpoint exists (authoritative - it is the offset the worker resumes from) and `held_fallback` where none does (source minus held minus permanent absences, the weak subtraction this file exists to avoid). hc-boot-sweep runs court-less and writes no checkpoint by design, so a 2016+ cell with no cursor may be finished work rather than a gap.',
    'The survey is dated 11 Aug 2026. A partition the bucket has added since is invisible here and would read as a cell that does not exist rather than as remaining work.',
  ],
  totals,
  byState,
  courts,
  topCells: rows.slice(0, TOP),
  /**
   * EVERY cell, not just the top forty, because NEW1's coverage-state contract
   * (bus 0724/0725) needs a per-court-year table that "does not exist" and cannot
   * be computed per request — one grouped count over `judgments` measured 86.5
   * seconds on this box, and 738 of 1,219 slow statements there are already the
   * retrieval path.
   *
   * `heldShare` is emitted and NO PARTIAL THRESHOLD IS APPLIED. Where "materially
   * less than the source" begins is a product judgement about when a result set
   * stops being an answer — NEW1 said so explicitly and is right; it belongs in
   * PRODUCT_DECISIONS.md, not in this file and not decided by one lane. What this
   * gives the contract is the two numbers the judgement needs, per cell, already
   * computed.
   *
   * `heldShare` can EXCEED 1.0 and that is not a bug: source counts parquet rows,
   * held counts distinct documents, and a court-year whose source object was
   * re-exported and appended lists many documents twice. A consumer that clamps
   * it silently will read duplication as completeness.
   */
  cells: rows.map((r) => ({
    court: r.court,
    year: r.year,
    sourceRows: r.sourceRows,
    acquired: r.acquired,
    heldShare: r.sourceRows === 0 ? null : r.acquired / r.sourceRows,
    rowsWalked: r.rowsWalked,
    remainingRows: r.remainingRows,
    remainingMethod: r.remainingMethod,
    permanentAbsent: r.permanentAbsent,
    retryable: r.retryable,
    state: r.state,
  })),
};
writeFileSync(OUT, JSON.stringify(report, null, 1));

const n = (x) => x.toLocaleString();
const out = [];
out.push(
  'CURRENT ACTIONABLE CORPUS FRONTIER - measured from ingest cursors, not from source minus held',
);
out.push(
  `  source ${survey.generatedAt} | held ${held.takenAt} | ledger ${ledger.takenAt ?? 'absent'} | ${checkpointsRead} checkpoints`,
);
out.push('');
if (heldIsStale) {
  out.push(
    `  *** HELD SNAPSHOT IS ${staleBySeconds.toLocaleString()}s OLDER THAN THE NEWEST CURSOR WRITE ***`,
  );
  out.push(
    '  A worker wrote after this snapshot. Every acquired/heldShare figure is a LOWER bound,',
  );
  out.push('  and a cell may read as an acquisition gap that is already filled. Re-run');
  out.push('  new2-held-refresh.mjs before quoting any coverage number from this run.');
  out.push('');
}
out.push(`  SOURCE ROWS (upper bound)   ${n(totals.sourceRows).padStart(12)}   fixture rows already removed`);
out.push(
  `  SOURCE ROWS EXCLUDED       ${n(exclusions.totalRows ?? 0).padStart(12)}   bench=testcase, refused by hc-load, never fetchable`,
);
out.push(`  ROWS WALKED BY A CURSOR     ${n(totals.rowsWalked).padStart(12)}`);
out.push(`  REMAINING ACTIONABLE ROWS   ${n(totals.remainingRows).padStart(12)}   the work queue`);
out.push(`  DOCUMENTS ACQUIRED          ${n(totals.acquired).padStart(12)}`);
out.push(
  `  PERMANENT PDF ABSENT        ${n(totals.permanentAbsent).padStart(12)}   provider recovery only, never ingest`,
);
out.push(`  RETRYABLE FAILED            ${n(totals.retryable).padStart(12)}   free to retry`);
out.push(`  OTHER FAILURE               ${n(totals.otherFailure).padStart(12)}`);
out.push('');
out.push('  BY STATE (court-year cells):');
for (const [s, v] of Object.entries(byState).sort(
  (a, b) => b[1].remainingRows - a[1].remainingRows,
)) {
  out.push(
    `    ${s.padEnd(22)} ${String(v.cells).padStart(5)} cells | source ${n(v.sourceRows).padStart(11)} | remaining ${n(v.remainingRows).padStart(11)}`,
  );
}
out.push('');
out.push(
  '  COURTS WITH WORK REMAINING, ranked by unwalked rows (cursor where one exists, held_fallback where not):',
);
for (const c of courts.filter((x) => x.remainingRows > 0).slice(0, 20)) {
  const ys = c.yearsRemaining;
  const span =
    ys.length === 0
      ? ''
      : ys.length === 1
        ? String(ys[0])
        : `${ys[0]}-${ys[ys.length - 1]} (${ys.length}y)`;
  out.push(
    `    ${c.court.padEnd(7)} ${String(c.courtName).slice(0, 32).padEnd(33)} remaining ${n(c.remainingRows).padStart(10)} | ${span}${c.cellsNoScope > 0 ? ` | ${c.cellsNoScope} cell(s) with NO CURSOR` : ''}`,
  );
}
const noCursor = rows.filter((r) => r.state === 'REMAINING_NO_CURSOR');
out.push('');
if (noCursor.length === 0) {
  out.push('  NO CURSOR AND WORK REMAINING: none.');
} else {
  out.push(
    `  NO CURSOR, WORK REMAINING - ${noCursor.length} cell(s), ${n(noCursor.reduce((a, r) => a + r.remainingRows, 0))} rows by held_fallback.`,
  );
  out.push('  No checkpointed scope covers these. A 2016+ cell may still have been walked by');
  out.push('  hc-boot-sweep, which writes no checkpoint by design, so these are ESTIMATES.');
  for (const r of noCursor.slice(0, 25)) {
    out.push(
      `    ${r.court.padEnd(7)} ${r.year}  source ${n(r.sourceRows).padStart(9)} | held ${n(r.acquired).padStart(9)} | est. remaining ${n(r.remainingRows).padStart(9)}`,
    );
  }
}
const text = out.join('\n');
console.log(text);
if (MD_OUT) writeFileSync(join(ROOT, MD_OUT), text + '\n');
console.log('');
console.log(`  json: ${OUT}`);
