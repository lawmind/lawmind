/**
 * NEW2 — THE LEDGER SIDE OF `remaining`, AS A FILE THE PLANNER CAN READ.
 *
 *   node scripts/migration/new2-ledger-snapshot.mjs
 *   node scripts/migration/new2-ledger-snapshot.mjs --out other.json
 *
 * ---------------------------------------------------------------------------
 * WHY A FILE AND NOT A QUERY
 * ---------------------------------------------------------------------------
 * `new2-yearscope-plan.mjs` opens NO database connection, deliberately: the plan
 * for the first post-cutover run had to exist before the database did. Making it
 * query `hc_ingest_ledger` directly would trade that away for one number. So the
 * ledger is snapshotted here, the same way `held` is, and the planner joins two
 * files instead of a file and a connection.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CHANGES ABOUT THE WORD "REMAINING"
 * ---------------------------------------------------------------------------
 * The scheduler ranks work by `source documents - held rows`. That subtraction
 * has no term for **a document that exists in the parquet metadata and does not
 * exist in the bucket**, so those documents are counted as work forever and the
 * scope that contains them is ranked as though they were fetchable.
 *
 * Measured, not hypothesised: `hc-boot-23_23-y2024` was scheduled against 15,890
 * remaining and finished having recorded 15,869 absences. Its real recoverable
 * population was about 21. A scheduler that cannot see that ranks a 21-document
 * scope above real gaps of thousands, every boot, forever.
 *
 * ---------------------------------------------------------------------------
 * THE FIVE STATES, KEPT SEPARATE ON PURPOSE
 * ---------------------------------------------------------------------------
 * Coverage reporting has to distinguish these, and collapsing any two of them
 * loses the distinction that makes the number actionable:
 *
 *   SOURCE RECORD EXISTS    the parquet footer count (survey, not this file)
 *   DOCUMENT ACQUIRED       rows in `judgments` (held snapshot, not this file)
 *   SOURCE DOCUMENT MISSING `pdf_absent` — a 404/403/410 was actually observed.
 *                           Confirmed absent. Never coming.
 *   RETRY PENDING           `pdf_unavailable`, `pdf_timeout`, `pdf_failed`,
 *                           `no_text`, and legacy `pdf_missing`: still owed an
 *                           attempt, still counted as reachable work.
 *   OTHER FAILURE           permanent metadata defects — `no_title`,
 *                           `no_decision_date`, `unparseable_date`,
 *                           `no_pdf_link`, `test_fixture_bench`. The row is in
 *                           the bucket and will never become a judgment.
 *
 * `unreachable = SOURCE DOCUMENT MISSING + OTHER FAILURE`, and that is the only
 * quantity the planner subtracts. **Legacy `pdf_missing` is deliberately counted
 * as RETRY PENDING even though sampling says 520/520 of them are 404s.** The
 * sample is strong evidence about the population and is not evidence about any
 * individual row, and this file is what decides whether a document is ever
 * fetched again. `new2-ledger-absence-probe.mjs` converts them one at a time by
 * asking the bucket; until it has, they stay counted as work. Under-claiming
 * costs a wasted HEAD. Over-claiming abandons a judgment.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-ledger-by-court-year.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = arg('out', DEFAULT_OUT);

/**
 * State classification. Sourced from `services/ingest/src/harvest/ingest-ledger.ts`
 * — its `PERMANENT_ON_SIGHT` set plus the `pdf_absent` split — and duplicated
 * here rather than imported because that module is TypeScript inside the ingest
 * service and this is a plain-node ops tool. If the two ever disagree, the
 * module wins; `unclassifiedOutcomes` below exists so the disagreement is
 * visible instead of silently bucketed.
 */
const SOURCE_DOCUMENT_MISSING = new Set(['pdf_absent']);
const OTHER_FAILURE = new Set([
  'no_title',
  'no_decision_date',
  'unparseable_date',
  'no_pdf_link',
  'test_fixture_bench',
]);
const RETRY_PENDING = new Set([
  'pdf_missing',
  'pdf_unavailable',
  'pdf_timeout',
  'pdf_failed',
  'no_text',
]);

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found in environment or .env');
}

const url = databaseUrl();
const sql = postgres(url, { max: 1, idle_timeout: 30, connect_timeout: 30 });

let rows;
try {
  rows = await sql`
    SELECT court_code, year, outcome, permanent, count(*)::bigint AS n
      FROM hc_ingest_ledger
     GROUP BY 1, 2, 3, 4
  `;
} finally {
  await sql.end({ timeout: 10 });
}

const byCourtYear = {};
const totals = { sourceDocumentMissing: 0, retryPending: 0, otherFailure: 0, unclassified: 0 };
const outcomeTotals = {};
const unclassifiedOutcomes = new Set();

for (const r of rows) {
  const n = Number(r.n);
  const year = r.year === null ? 'null' : String(r.year);
  const bucket = ((byCourtYear[r.court_code] ??= {})[year] ??= {
    sourceDocumentMissing: 0,
    retryPending: 0,
    otherFailure: 0,
    unclassified: 0,
  });
  outcomeTotals[r.outcome] = (outcomeTotals[r.outcome] ?? 0) + n;

  let state;
  if (SOURCE_DOCUMENT_MISSING.has(r.outcome)) state = 'sourceDocumentMissing';
  else if (OTHER_FAILURE.has(r.outcome)) state = 'otherFailure';
  else if (RETRY_PENDING.has(r.outcome)) state = 'retryPending';
  else {
    state = 'unclassified';
    unclassifiedOutcomes.add(r.outcome);
  }

  /**
   * `permanent` OVERRIDES a retryable label. The database promotes a row at
   * MAX_ATTEMPTS regardless of what the outcome string says, so a `pdf_timeout`
   * that has burned its three attempts is no longer pending anything — and a
   * planner that kept counting it as work would re-rank a scope on documents
   * the loop has already stopped fetching.
   */
  if (r.permanent && state === 'retryPending') state = 'otherFailure';

  bucket[state] += n;
  totals[state] += n;
}

for (const years of Object.values(byCourtYear)) {
  for (const b of Object.values(years)) {
    b.unreachable = b.sourceDocumentMissing + b.otherFailure;
  }
}

const snapshot = {
  tool: 'scripts/migration/new2-ledger-snapshot.mjs',
  takenAt: new Date().toISOString(),
  database: url.replace(/:\/\/[^@]*@/, '://***@'),
  states: {
    sourceDocumentMissing: 'pdf_absent — a 404/403/410 was observed. Confirmed absent at source.',
    retryPending:
      'still owed an attempt; counted as reachable work. Includes legacy pdf_missing, which sampling says is overwhelmingly 404 but which is not individually confirmed.',
    otherFailure:
      'permanent metadata defects, plus any row the database has promoted at MAX_ATTEMPTS. The record exists; a judgment will not.',
    unreachable: 'sourceDocumentMissing + otherFailure — the only quantity the planner subtracts.',
  },
  totals: { ...totals, unreachable: totals.sourceDocumentMissing + totals.otherFailure },
  ledgerRows: rows.reduce((a, r) => a + Number(r.n), 0),
  outcomeTotals,
  unclassifiedOutcomes: [...unclassifiedOutcomes],
  byCourtCodeByYear: byCourtYear,
};
writeFileSync(OUT, `${JSON.stringify(snapshot, null, 1)}\n`);

const n = (x) => x.toLocaleString();
console.log(`ledger rows ${n(snapshot.ledgerRows)}`);
console.log(`  SOURCE DOCUMENT MISSING  ${n(totals.sourceDocumentMissing)}`);
console.log(`  RETRY PENDING            ${n(totals.retryPending)}`);
console.log(`  OTHER FAILURE            ${n(totals.otherFailure)}`);
if (totals.unclassified > 0)
  console.log(
    `  UNCLASSIFIED             ${n(totals.unclassified)}  outcomes: ${[...unclassifiedOutcomes].join(', ')}`,
  );
console.log(`  unreachable (subtracted) ${n(snapshot.totals.unreachable)}`);
console.log(`wrote ${OUT}`);
