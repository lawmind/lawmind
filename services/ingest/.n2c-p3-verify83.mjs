/**
 * NEW2 §8/NEW2-3 — verify 0083's safety property.
 *
 * TABLESAMPLE cannot be applied to a view (0A000), so sample `judgments` and
 * join the view by id -- the sample stays on the base table where the sampling
 * is defined, and the state comes from the view rather than from a copy of its
 * CASE, so this tests the shipped object rather than a restatement of it.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:900000,onnotice:()=>{}});
try{
  const s=await sql`
    WITH s AS (SELECT id FROM judgments TABLESAMPLE SYSTEM (0.2) REPEATABLE (5))
    SELECT e.body_text_evidence, count(*)::int AS rows
      FROM s JOIN judgment_body_text_evidence e ON e.id = s.id
     GROUP BY 1 ORDER BY 2 DESC`;
  console.log('states, TABLESAMPLE SYSTEM (0.2) REPEATABLE (5):');
  for(const r of s) console.log(' ',String(r.rows).padStart(7),r.body_text_evidence);
  const bad = s.find(x=>x.body_text_evidence==='SCREENED_NO_DAMAGE_FOUND');
  if (bad) { console.error('REFUSED -- an EMPTY run table produced SCREENED_NO_DAMAGE_FOUND.'); process.exit(1); }
  console.log('\nempty-table safety property HOLDS: 0 rows read SCREENED_NO_DAMAGE_FOUND');
  writeFileSync('docs/ai/new2/body-text-evidence-0083-preimport.json',
    JSON.stringify({generated_at:new Date().toISOString(),sample:'TABLESAMPLE SYSTEM (0.2) REPEATABLE (5)',run_rows:0,states:s},null,2));
} finally { await sql.end({timeout:10}); }
