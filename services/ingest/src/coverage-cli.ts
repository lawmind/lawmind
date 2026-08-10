/**
 * `pnpm --filter @lawmind/ingest coverage` — load per-court, per-year coverage
 * into `judgment_coverage` from the survey `hc:count` produced.
 *
 * `docs/CURRENT_PLAN.md` §Q1.1. **Dry by default; needs `--apply`** — the same
 * rule as `concordance-cli`, `citator-cli` and `sections-cli`. This one writes
 * no citation field, but it does decide what the product tells an advocate about
 * a gap, and a wrong coverage claim is its own kind of wrong answer.
 *
 * **It reads the survey file rather than re-enumerating the bucket.** The count
 * is 1,493 parquet footers and belongs to `hc:count`, which records
 * `generatedAt`; re-counting here would produce a second number with a second
 * timestamp and no way to tell which the product rendered.
 */
import { readFile } from 'node:fs/promises';

import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const SOURCE = 'aws_high_court';
const SURVEY = new URL('../../../docs/HC_METADATA_SURVEY.json', import.meta.url);

type Survey = {
  generatedAt: string;
  perCourt: Array<{ code: string; name: string }>;
  perCourtPerYear: Record<string, Record<string, number>>;
};

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set — coverage is written to the corpus database.');
  process.exit(2);
}

const survey = JSON.parse(await readFile(SURVEY, 'utf8')) as Survey;
const codeFor = new Map(survey.perCourt.map((c) => [c.name, c.code]));

type Row = { courtCode: string; courtName: string; year: number; documents: number };
const rows: Row[] = [];
for (const [courtName, years] of Object.entries(survey.perCourtPerYear)) {
  const courtCode = codeFor.get(courtName);
  if (!courtCode) {
    // Refused rather than defaulted. A court whose code cannot be resolved would
    // still render a coverage claim, and an unattributable claim is the thing
    // `corpus_coverage` was built to avoid.
    console.error(`no court code for ${JSON.stringify(courtName)} — SKIPPED, not defaulted`);
    continue;
  }
  for (const [year, documents] of Object.entries(years)) {
    rows.push({ courtCode, courtName, year: Number(year), documents });
  }
}

console.log(`survey generated ${survey.generatedAt}`);
console.log(`${rows.length} court-year rows across ${new Set(rows.map((r) => r.courtCode)).size} courts`);
console.log(`total documents ${rows.reduce((s, r) => s + r.documents, 0).toLocaleString()}`);

if (!APPLY) {
  console.log('');
  console.log('DRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
}

const sql = postgres(dbUrl, { ssl: dbUrl.includes('localhost') ? false : 'require', max: 3 });
try {
  // One statement, not 275. `CONTINUATION_PROMPT.md` §8: 4,097 single-row inserts
  // over the proxy took 34 minutes and timed out at ten. The work was never the
  // database's; it was asking it 4,097 times.
  //
  // Four parallel typed arrays through `unnest`, not a JSON document. postgres.js
  // maps a JS array straight onto a Postgres array, whereas a JSON.stringify'd
  // payload arrives as a *scalar* json value and `json_to_recordset` rejects it
  // — which is exactly how the first attempt failed. Arrays also keep every
  // value bound rather than interpolated.
  await sql`
    INSERT INTO judgment_coverage
      (source, court_code, court_name, year, source_documents, enumerated_at)
    SELECT ${SOURCE}, t.court_code, t.court_name, t.year, t.source_documents,
           ${survey.generatedAt}::timestamptz
    FROM unnest(
      ${rows.map((r) => r.courtCode)}::text[],
      ${rows.map((r) => r.courtName)}::text[],
      ${rows.map((r) => r.year)}::int[],
      ${rows.map((r) => r.documents)}::int[]
    ) AS t(court_code, court_name, year, source_documents)
    ON CONFLICT (source, court_code, year) DO UPDATE
      SET source_documents = EXCLUDED.source_documents,
          court_name       = EXCLUDED.court_name,
          enumerated_at    = EXCLUDED.enumerated_at,
          updated_at       = now()
  `;

  const [check] = await sql<{ courts: number; years: number; docs: string }[]>`
    SELECT count(DISTINCT court_code)::int AS courts,
           count(*)::int                   AS years,
           sum(source_documents)::text     AS docs
    FROM judgment_coverage WHERE source = ${SOURCE}
  `;
  console.log('');
  console.log(`WRITTEN: ${check?.years} rows · ${check?.courts} courts · ${Number(check?.docs).toLocaleString()} documents`);
} finally {
  await sql.end();
}
