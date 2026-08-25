/**
 * NEW2 §8/NEW2-3 — apply 0083 and PROVE it altered nothing.
 *
 * The proof is the point. LCC's 0081 nearly destroyed ten columns of a view they
 * were only trying to fix one branch of, and the symptom would have been a
 * missing column in someone else's query rather than a wrong answer.
 *
 * So: capture judgment_quality_contract's column count and sha256 BEFORE and
 * AFTER, and refuse to report success if either moved.
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:600000,onnotice:()=>{}});
const identity=async()=>{
  const [h]=await sql`SELECT substr(encode(sha256(pg_get_viewdef('judgment_quality_contract', true)::bytea),'hex'),1,16) AS sha`;
  const [c]=await sql`SELECT count(*)::int AS n FROM pg_attribute
                       WHERE attrelid='judgment_quality_contract'::regclass AND attnum>0 AND NOT attisdropped`;
  return { sha: h.sha, columns: c.n };
};
try{
  const before = await identity();
  console.log('BEFORE judgment_quality_contract:', JSON.stringify(before));

  const ddl = readFileSync('packages/db/drizzle/0083_quality_screen_runs.sql','utf8');
  await sql.unsafe(ddl);
  console.log('0083 applied');

  const after = await identity();
  console.log('AFTER  judgment_quality_contract:', JSON.stringify(after));
  if (before.sha !== after.sha || before.columns !== after.columns) {
    console.error('REFUSING TO REPORT SUCCESS -- 0083 altered a view it must not touch.');
    process.exit(1);
  }
  console.log('unchanged: sha and column count both identical');

  const [t]=await sql`SELECT to_regclass('quality_screen_runs')::text AS tbl, to_regclass('judgment_body_text_evidence')::text AS vw`;
  console.log('created:', JSON.stringify(t));
  const [r]=await sql`SELECT count(*)::int AS run_rows FROM quality_screen_runs`;
  console.log('quality_screen_runs rows:', r.run_rows, '(expected 0 -- the view ships before the import)');

  /* The safety property, asserted rather than asserted-about: with the table
   * empty, no document may read SCREENED_NO_DAMAGE_FOUND. */
  const s=await sql`
    SELECT body_text_evidence, count(*)::int AS rows
      FROM judgment_body_text_evidence TABLESAMPLE SYSTEM (0.2) REPEATABLE (5)
     GROUP BY 1 ORDER BY 2 DESC`;
  console.log('states on TABLESAMPLE SYSTEM (0.2) REPEATABLE (5):', JSON.stringify(s));
  if (s.some(x=>x.body_text_evidence==='SCREENED_NO_DAMAGE_FOUND')) {
    console.error('REFUSING -- an empty run table produced SCREENED_NO_DAMAGE_FOUND.');
    process.exit(1);
  }
  console.log('empty-table safety property holds: 0 rows read SCREENED_NO_DAMAGE_FOUND');
} finally { await sql.end({timeout:10}); }
