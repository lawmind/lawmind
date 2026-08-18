/**
 * NEW2 — REGENERATE `new2-held-by-court-year.json` FROM THE HEAP.
 *
 *   node scripts/migration/new2-held-refresh.mjs
 *   node scripts/migration/new2-held-refresh.mjs --out other.json --dry
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE HAD TO EXIST
 * ---------------------------------------------------------------------------
 * The snapshot the year-scope scheduler plans against was produced by a
 * `psql \copy` recorded in its own `tool` field. **There is no psql on this
 * machine.** So the one input that decides where every worker goes could be
 * read but never refreshed, and it was 7,296,068 rows old — roughly 1.9M rows
 * behind the heap — while being treated as current by
 * `new2-yearscope-plan.mjs`, `new2-rung-plan.mjs` and `cx1-corpus-census.mjs`.
 *
 * A stale `held` does not fail loudly. It inflates `remaining` on exactly the
 * bands the fleet has been draining hardest, which is the same starvation shape
 * the year-scope scheduler was written to end: work is sent where the numbers
 * are oldest rather than where it is largest.
 *
 * ---------------------------------------------------------------------------
 * EXACT COUNTS, NEVER `reltuples`
 * ---------------------------------------------------------------------------
 * `count(*)` from the heap, deliberately, and the `method` field says so. The
 * 16 Aug crash reset `pg_stat` on this database and several estimates still
 * read 0; a planner fed an estimate of 0 would schedule a finished court and
 * starve a real gap. One sequential scan per refresh is the correct price.
 *
 * ---------------------------------------------------------------------------
 * TWO DEFINITIONS OF "YEAR", AND THE SCHEDULER WAS SUBTRACTING ACROSS THEM
 * ---------------------------------------------------------------------------
 * `HC_METADATA_SURVEY.json` counts source documents by the bucket's PARTITION
 * year -- the `year=2023` in the object key. This file used to count held rows
 * only by `year(judgment_date)`. Those are not the same year, and the planner
 * was subtracting one from the other.
 *
 * Measured 18 Aug 2026, exactly, not approximately:
 *
 *     Allahabad 2023   source partition        534,053
 *                      held by judgment_date   313,610   -> "220,443 remaining"
 *                      what the worker found   532,089 already held
 *                                              + 1,964 absent = 534,053
 *
 * `hc-boot-9_13-y2023` was ranked FIRST in the whole fleet on that 220,443, ran
 * to completion, wrote ZERO documents and finished cleanly. The year=2023
 * partition holds judgments dated 2020, 2021, 2024 and so on -- the partition
 * records when the court PUBLISHED the object, not when it decided the case --
 * so a quarter of a million documents were being counted as outstanding because
 * their `judgment_date` fell in a different bucket from their object key.
 *
 * This is not a rounding error and it does not self-correct: the scope is
 * re-ranked first on every boot, walks 534,053 objects, writes nothing, and the
 * numbers come out identical for the next run to repeat.
 *
 * So the snapshot now carries BOTH, and says which is which:
 *
 *   heldByCourtCodeByYear            year(judgment_date) -- what the corpus
 *                                    means by a judgment's year. Kept unchanged:
 *                                    `cx1-corpus-census.mjs` and every coverage
 *                                    report are asking a legal question.
 *   heldByCourtCodeBySourceYear      the `year=` in `source_url` -- the ONLY one
 *                                    commensurable with the survey, and the only
 *                                    one a scheduler may subtract.
 *
 * Rows whose `source_url` carries no `year=` segment are counted under
 * `sourceYearUnattributable` rather than being silently dropped or guessed into
 * a bucket: they are held, they came from somewhere that is not the AWS layout,
 * and a scheduler must not treat them as coverage of a partition they may not
 * belong to.
 *
 * ---------------------------------------------------------------------------
 * A COURT THAT DOES NOT JOIN IS REPORTED, NEVER DROPPED
 * ---------------------------------------------------------------------------
 * `judgments.court` holds a court NAME; the snapshot is keyed by CODE, joined
 * through the survey's own `perCourt` table. Supreme Court of India has rows
 * and no survey code, and it is the court that binds every other one. Names
 * that fail to join go to `courtNamesWithNoSurveyCode` — visible, with their
 * row counts — because a holding that vanishes from the denominator is worse
 * than one that is merely unscheduled.
 *
 * Rows with a NULL `judgment_date` are counted under year `null` for the same
 * reason: they are held, they are not attributable to a band, and silently
 * discarding them would make `held` disagree with `count(*)` with nothing to
 * show for it.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SURVEY = join(ROOT, 'docs', 'HC_METADATA_SURVEY.json');
const DEFAULT_OUT = join(ROOT, 'docs', 'ops', 'migration', 'new2-held-by-court-year.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = arg('out', DEFAULT_OUT);
const DRY = process.argv.includes('--dry');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found in environment or .env');
}

if (!existsSync(SURVEY)) {
  console.error(`missing survey: ${SURVEY}`);
  console.error('this tool refuses to key a snapshot by code it cannot join.');
  process.exit(2);
}
const survey = JSON.parse(readFileSync(SURVEY, 'utf8'));
const codeByName = new Map((survey.perCourt ?? []).map((c) => [c.name, c.code]));

const url = databaseUrl();
const sql = postgres(url, { max: 1, idle_timeout: 30, connect_timeout: 30 });

console.log('counting judgments by court and year — exact count(*), one sequential scan.');
const started = Date.now();
let rows;
try {
  rows = await sql`
    SELECT court,
           EXTRACT(YEAR FROM judgment_date)::int AS year,
           -- The partition year out of the object key, e.g. a source_url of
           -- .../data/pdf/year=2023/court=9_13/bench=cishclko/orders_x.pdf
           -- yields 2023. NULL for any source not laid out this way, which is
           -- then reported rather than bucketed. See the header.
           substring(source_url from 'year=([0-9]{4})')::int AS source_year,
           count(*)::bigint AS n
      FROM judgments
     GROUP BY 1, 2, 3
  `;
} finally {
  await sql.end({ timeout: 10 });
}
const elapsedMs = Date.now() - started;

const heldByCourtCodeByYear = {};
const heldByCourtCodeBySourceYear = {};
const unjoined = new Map();
let total = 0;
let nullDateRows = 0;
let sourceYearUnattributable = 0;
for (const r of rows) {
  const n = Number(r.n);
  total += n;
  if (r.year === null) nullDateRows += n;
  if (r.source_year === null) sourceYearUnattributable += n;
  const code = codeByName.get(r.court);
  if (!code) {
    unjoined.set(r.court, (unjoined.get(r.court) ?? 0) + n);
    continue;
  }
  /** Accumulated, not assigned: the grouping is now three-way, so several rows
   *  land in the same (court, judgment year) cell with different source years. */
  const byDate = (heldByCourtCodeByYear[code] ??= {});
  const dk = r.year === null ? 'null' : String(r.year);
  byDate[dk] = (byDate[dk] ?? 0) + n;

  if (r.source_year !== null) {
    const bySrc = (heldByCourtCodeBySourceYear[code] ??= {});
    const sk = String(r.source_year);
    bySrc[sk] = (bySrc[sk] ?? 0) + n;
  }
}

const snapshot = {
  tool: 'scripts/migration/new2-held-refresh.mjs',
  takenAt: new Date().toISOString(),
  database: url.replace(/:\/\/[^@]*@/, '://***@'),
  method:
    'exact count(*) from the heap, GROUP BY court, year(judgment_date), partition year from source_url -- NOT reltuples. ' +
    'Rows with a NULL judgment_date are counted under year "null" rather than dropped.',
  yearDefinitions: {
    heldByCourtCodeByYear:
      'year(judgment_date) -- when the case was DECIDED. What every coverage report means by a year.',
    heldByCourtCodeBySourceYear:
      'the year= segment of source_url -- when the object was PUBLISHED to the bucket. The only one commensurable with HC_METADATA_SURVEY.json, and the only one a scheduler may subtract from source.',
  },
  elapsedMs,
  totalRowsCounted: total,
  nullJudgmentDateRows: nullDateRows,
  sourceYearUnattributable,
  courtNamesWithNoSurveyCode: [...unjoined.keys()],
  heldRowsByCourtNameWithNoSurveyCode: Object.fromEntries(unjoined),
  heldByCourtCodeByYear,
  heldByCourtCodeBySourceYear,
};

console.log(
  `total ${total.toLocaleString()} rows · ${Object.keys(heldByCourtCodeByYear).length} joined courts · ` +
    `${unjoined.size} unjoined · null-date ${nullDateRows.toLocaleString()} · ` +
    `no source year ${sourceYearUnattributable.toLocaleString()} · ${(elapsedMs / 1000).toFixed(1)}s`,
);
for (const [name, n] of unjoined) console.log(`  unjoined: ${name} — ${n.toLocaleString()} rows`);

if (DRY) {
  console.log('--dry: not written.');
} else {
  if (existsSync(OUT)) {
    const prev = JSON.parse(readFileSync(OUT, 'utf8'));
    renameSync(OUT, `${OUT}.prev-${String(prev.totalRowsCounted ?? 'unknown')}`);
    const delta = total - Number(prev.totalRowsCounted ?? 0);
    console.log(
      `previous snapshot ${Number(prev.totalRowsCounted ?? 0).toLocaleString()} (${prev.takenAt}) ` +
        `kept alongside; delta ${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`,
    );
  }
  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 1)}\n`);
  console.log(`wrote ${OUT}`);
}
