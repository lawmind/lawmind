/**
 * Re-applies `caseTypeFrom` (`hc-load.ts`) to already-ingested HC judgments
 * whose `case_type` is still NULL.
 *
 * Found 12 Aug 2026: classification fell from 86% to 46% the moment six more
 * courts joined the ingest, because their case-number shapes (`CRLMB`,
 * `CRLMP`, `CRLW`, `CRLRP`, …) predate the `CRL`-substring rule just added to
 * `caseTypeFrom`. That fix only reaches NEW writes; this backfill reaches the
 * rows already sitting in `judgments` with the old, narrower function's
 * answer of `null`.
 *
 * Pure and additive: reads `case_number` already stored (no re-fetch), never
 * touches a row whose `case_type` is already set, and only writes when the
 * function now returns non-null. Resumable by construction — a repeat run
 * finds nothing left to do.
 */
import postgres from 'postgres';

import { caseTypeFrom } from './harvest/hc-load.ts';
import { sslFor } from './db-ssl';

const APPLY = process.argv.includes('--apply');
const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(url, { max: 2, ssl: sslFor(url) });

console.log(`CASE_TYPE BACKFILL${APPLY ? '' : ' — DRY RUN'}`);
console.log('='.repeat(74));

const rows = await sql<{ id: string; case_number: string }[]>`
  SELECT id, case_number FROM judgments
  WHERE court <> 'Supreme Court of India' AND case_type IS NULL AND case_number IS NOT NULL`;

console.log(`${rows.length.toLocaleString()} unclassified rows with a case_number`);

let willUpdate = 0;
const tally = new Map<string, number>();
const updates: { id: string; caseType: 'criminal' | 'civil' }[] = [];
for (const r of rows) {
  const t = caseTypeFrom(r.case_number);
  if (t === null) continue;
  willUpdate++;
  tally.set(t, (tally.get(t) ?? 0) + 1);
  updates.push({ id: r.id, caseType: t });
}

console.log(`would newly classify: ${willUpdate.toLocaleString()}`);
for (const [k, v] of tally) console.log(`  ${k.padEnd(10)} ${v.toLocaleString()}`);

if (APPLY && updates.length > 0) {
  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await sql`
      UPDATE judgments AS j SET case_type = t.case_type::case_type
      FROM (
        SELECT * FROM unnest(
          ${batch.map((b) => b.id)}::uuid[],
          ${batch.map((b) => b.caseType)}::text[]
        ) AS t(id, case_type)
      ) AS t
      WHERE j.id = t.id`;
    written += batch.length;
    console.log(`  written ${written.toLocaleString()} / ${updates.length.toLocaleString()}`);
  }
  console.log(`\nDONE — ${written.toLocaleString()} rows updated.`);
} else if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
}

await sql.end();
