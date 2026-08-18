/**
 * NEW2 — COVERAGE IN FIVE STATES, PER COURT PER YEAR.
 *
 *   node scripts/migration/new2-coverage-report.mjs
 *   node scripts/migration/new2-coverage-report.mjs --court 19_16
 *   node scripts/migration/new2-coverage-report.mjs --md docs/ops/migration/COVERAGE.md
 *
 * Opens no database connection. Joins three snapshots on disk, for the same
 * reason `new2-yearscope-plan.mjs` does: a coverage number that cannot be
 * produced during a freeze is a number nobody checks when it matters.
 *
 * ---------------------------------------------------------------------------
 * WHY "COVERAGE" NEEDED FIVE STATES RATHER THAN A PERCENTAGE
 * ---------------------------------------------------------------------------
 * A single percentage answers "how much of the source do we hold" and hides
 * every question anyone actually asks of it. Three separate defects this month
 * all reduce to the same cause — one number carrying several meanings:
 *
 *   - 63,322 documents were counted as outstanding work for weeks. They return
 *     404. They are not missing from our corpus; they are missing from the
 *     bucket, and no amount of fetching changes that.
 *   - `hc-boot-9_13-y2023` was ranked FIRST in the fleet at 220,443 remaining,
 *     ran to completion and wrote zero. Its remainder was duplicate parquet
 *     listings, not documents.
 *   - Calcutta reads as a well-covered court on any court-level aggregate and
 *     holds ZERO documents for 2016-2022.
 *
 * So the report prints the states separately and never sums them into a verdict:
 *
 *   SOURCE RECORD EXISTS      parquet rows in the partition (HC_METADATA_SURVEY).
 *                             ROWS, not documents — a bench publishing both
 *                             metadata.parquet and metadata-mobile.parquet lists
 *                             the same document twice. Every figure derived from
 *                             it is therefore an UPPER bound.
 *   DOCUMENT ACQUIRED         distinct rows in `judgments`, keyed by the PARTITION
 *                             year from source_url so it is commensurable with
 *                             the line above. The decision-year map answers a
 *                             different question and must not be subtracted here.
 *   SOURCE DOCUMENT MISSING   404/403/410 observed. Confirmed absent.
 *   RETRY PENDING             still owed an attempt.
 *   OTHER FAILURE             metadata defect, or given up at MAX_ATTEMPTS.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT REFUSES TO PRINT
 * ---------------------------------------------------------------------------
 * A single corpus-wide "we hold X%". The source denominator over-counts by an
 * unmeasured amount (the duplicate listings above), so any such figure is
 * understated by an unknown margin, and a number with an unknown error bar
 * printed next to four exact ones will be quoted as though it were exact. The
 * per-court-year table is what can be defended; the summary reports the states,
 * not a verdict.
 *
 * `MIN(date)` is never used as coverage, and raw records are never mixed with
 * reasoned decisions — this counts DOCUMENTS. Roznama and order-sheet records
 * are documents too; `hc_document_class` is the field that separates them and it
 * is only 8.9% populated, which is stated rather than papered over.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SURVEY = join(ROOT, 'docs', 'HC_METADATA_SURVEY.json');
const HELD = join(ROOT, 'docs', 'ops', 'migration', 'new2-held-by-court-year.json');
const LEDGER = join(ROOT, 'docs', 'ops', 'migration', 'new2-ledger-by-court-year.json');
const OUT_JSON = join(ROOT, 'docs', 'ops', 'migration', 'new2-coverage.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ONE_COURT = arg('court', null);
const MD_OUT = arg('md', null);

for (const [label, path] of [
  ['survey', SURVEY],
  ['held snapshot', HELD],
]) {
  if (!existsSync(path)) {
    console.error(`missing ${label}: ${path}`);
    console.error('this tool refuses to report coverage from a partial input.');
    process.exit(2);
  }
}
const survey = JSON.parse(readFileSync(SURVEY, 'utf8'));
const held = JSON.parse(readFileSync(HELD, 'utf8'));
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : null;

/**
 * The partition-year map or nothing. Falling back to decision years would
 * silently answer a different question — see the header — and a coverage table
 * that mixes the two is exactly the artefact that hid Calcutta's seven-year hole.
 */
const heldMap = held.heldByCourtCodeBySourceYear ?? null;
if (heldMap === null) {
  console.error('held snapshot predates the partition-year split — it has no heldByCourtCodeBySourceYear.');
  console.error('Refusing to report coverage against decision years: the survey counts partition years,');
  console.error('and subtracting one from the other is the defect this report exists to expose.');
  console.error('Rerun: node scripts/migration/new2-held-refresh.mjs');
  process.exit(2);
}

const codeByName = new Map((survey.perCourt ?? []).map((c) => [c.name, c.code]));
const ledgerMap = ledger?.byCourtCodeByYear ?? {};

const rows = [];
for (const [courtName, years] of Object.entries(survey.perCourtPerYear ?? {})) {
  const code = codeByName.get(courtName);
  if (!code) continue;
  if (ONE_COURT && code !== ONE_COURT) continue;
  for (const [y, srcRaw] of Object.entries(years)) {
    const year = Number(y);
    const sourceRecords = Number(srcRaw);
    const acquired = Number(heldMap[code]?.[String(year)] ?? 0);
    const l = ledgerMap[code]?.[String(year)] ?? {};
    const missing = Number(l.sourceDocumentMissing ?? 0);
    const retry = Number(l.retryPending ?? 0);
    const other = Number(l.otherFailure ?? 0);
    rows.push({
      court: code,
      courtName,
      year,
      sourceRecords,
      acquired,
      sourceDocumentMissing: missing,
      retryPending: retry,
      otherFailure: other,
      /** Upper bound: `sourceRecords` over-counts by the duplicate listings. */
      unaccountedUpperBound: Math.max(0, sourceRecords - acquired - missing - other),
    });
  }
}
rows.sort((a, b) => a.court.localeCompare(b.court) || a.year - b.year);

const totals = rows.reduce(
  (t, r) => ({
    sourceRecords: t.sourceRecords + r.sourceRecords,
    acquired: t.acquired + r.acquired,
    sourceDocumentMissing: t.sourceDocumentMissing + r.sourceDocumentMissing,
    retryPending: t.retryPending + r.retryPending,
    otherFailure: t.otherFailure + r.otherFailure,
  }),
  { sourceRecords: 0, acquired: 0, sourceDocumentMissing: 0, retryPending: 0, otherFailure: 0 },
);

/**
 * BLACKOUTS — a contiguous run of years holding nothing, in a court that holds
 * something elsewhere. This is the shape no percentage shows: the court is
 * present in every search result and answers for other years, so the hole is
 * invisible from inside a result rather than merely unreported.
 */
const blackouts = [];
for (const code of new Set(rows.map((r) => r.court))) {
  const mine = rows.filter((r) => r.court === code).sort((a, b) => a.year - b.year);
  const totalHeld = mine.reduce((a, r) => a + r.acquired, 0);
  if (totalHeld === 0) continue; // a court we hold nothing of is a different, visible problem
  let run = null;
  const close = () => {
    if (run && run.years.length >= 3 && run.sourceRecords >= 1000) blackouts.push(run);
    run = null;
  };
  for (const r of mine) {
    if (r.acquired === 0 && r.sourceRecords > 0) {
      run ??= { court: code, courtName: r.courtName, years: [], sourceRecords: 0, courtHeldElsewhere: totalHeld };
      run.years.push(r.year);
      run.sourceRecords += r.sourceRecords;
    } else close();
  }
  close();
}
blackouts.sort((a, b) => b.sourceRecords - a.sourceRecords);

const report = {
  tool: 'scripts/migration/new2-coverage-report.mjs',
  takenAt: new Date().toISOString(),
  derivedFrom: {
    source: `docs/HC_METADATA_SURVEY.json perCourtPerYear (${survey.generatedAt ?? '?'})`,
    held: `new2-held-by-court-year.json heldByCourtCodeBySourceYear (${held.takenAt ?? '?'})`,
    ledger: ledger ? `new2-ledger-by-court-year.json (${ledger.takenAt})` : 'ABSENT — failure states read 0',
  },
  caveats: [
    'SOURCE RECORD EXISTS counts parquet ROWS, not distinct documents: a bench publishing both metadata.parquet and metadata-mobile.parquet lists the same document twice, so every source figure is an UPPER bound and every coverage figure derived from it is UNDERSTATED by an unmeasured amount.',
    'No corpus-wide percentage is printed, deliberately. A number with an unknown error bar beside four exact ones gets quoted as though it were exact.',
    'This counts DOCUMENTS, not reasoned decisions. Maharashtra RERA was 49,167 raw records and ~7,376 reasoned decisions; hc_document_class is the field that separates them and was 8.9% populated when last measured.',
    'DOCUMENT ACQUIRED is keyed by the PARTITION year in source_url so it is commensurable with the source count. The decision-year map answers a different question and is not used here.',
  ],
  totals,
  blackouts,
  rows,
};
writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 1)}\n`);

const n = (x) => x.toLocaleString();
console.log(`COVERAGE — five states, per court per year${ONE_COURT ? ` · court ${ONE_COURT}` : ''}`);
console.log(`  source ${survey.generatedAt ?? '?'} · held ${held.takenAt ?? '?'} · ledger ${ledger?.takenAt ?? 'ABSENT'}\n`);
console.log(`  SOURCE RECORD EXISTS      ${n(totals.sourceRecords).padStart(12)}   parquet ROWS — upper bound, see caveats`);
console.log(`  DOCUMENT ACQUIRED         ${n(totals.acquired).padStart(12)}`);
console.log(`  SOURCE DOCUMENT MISSING   ${n(totals.sourceDocumentMissing).padStart(12)}   404/403/410 observed`);
console.log(`  RETRY PENDING             ${n(totals.retryPending).padStart(12)}`);
console.log(`  OTHER FAILURE             ${n(totals.otherFailure).padStart(12)}`);
console.log(`\n  No corpus-wide percentage is printed. The source denominator over-counts by an`);
console.log(`  unmeasured amount, so any such figure would be understated by an unknown margin.`);

if (blackouts.length > 0) {
  console.log(`\n  BLACKOUTS — ${blackouts.length} contiguous run(s) of 3+ years holding ZERO, in courts held elsewhere:`);
  for (const b of blackouts.slice(0, 10)) {
    const yrs = `${b.years[0]}-${b.years[b.years.length - 1]}`;
    console.log(
      `    ${(b.courtName ?? b.court).padEnd(30)} ${yrs.padEnd(10)} ${n(b.sourceRecords).padStart(9)} at source · ${n(b.courtHeldElsewhere)} held in other years`,
    );
  }
  console.log('    A court present in every search result that answers for some years and not others');
  console.log('    hides its gap from inside the result. No court-level percentage shows this.');
}

if (MD_OUT) {
  const lines = [
    '# High Court coverage — five states',
    '',
    `Generated ${report.takenAt} by \`${report.tool}\`.`,
    '',
    '| state | documents |',
    '| --- | ---: |',
    `| SOURCE RECORD EXISTS (parquet rows, upper bound) | ${n(totals.sourceRecords)} |`,
    `| DOCUMENT ACQUIRED | ${n(totals.acquired)} |`,
    `| SOURCE DOCUMENT MISSING (404/403/410 observed) | ${n(totals.sourceDocumentMissing)} |`,
    `| RETRY PENDING | ${n(totals.retryPending)} |`,
    `| OTHER FAILURE | ${n(totals.otherFailure)} |`,
    '',
    ...report.caveats.map((c) => `- ${c}`),
    '',
    '## Blackouts — contiguous years holding zero, in courts held elsewhere',
    '',
    '| court | years | source records | held in other years |',
    '| --- | --- | ---: | ---: |',
    ...blackouts.map(
      (b) =>
        `| ${b.courtName ?? b.court} | ${b.years[0]}-${b.years[b.years.length - 1]} | ${n(b.sourceRecords)} | ${n(b.courtHeldElsewhere)} |`,
    ),
    '',
  ];
  writeFileSync(join(ROOT, MD_OUT), `${lines.join('\n')}\n`);
  console.log(`\n  markdown: ${MD_OUT}`);
}
console.log(`\n  json: ${OUT_JSON}`);
