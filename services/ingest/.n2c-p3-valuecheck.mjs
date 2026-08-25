/**
 * NEW2 §8/NEW2-3 — the design doc's CASE is abbreviated and would be WRONG.
 *
 * BODY_TEXT_EVIDENCE_STATE_V1 §4.1 sketches
 *   WHEN j.script_quality IS NOT NULL THEN 'SCREENED_DAMAGED'
 * but `script_quality` also holds NON-convictions -- 0072's own view treats
 * 'clean' and 'mixed_script_ok' as TEXT_UNKNOWN, i.e. not damaged. Shipping the
 * sketch verbatim would relabel every unconvicted screened row as DAMAGED.
 *
 * So: enumerate the actual value vocabulary and its cross with the method,
 * before writing a CASE against it.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:900000,onnotice:()=>{}});
try{
  const v=await sql`
    SELECT coalesce(script_quality,'(NULL)') AS script_quality,
           coalesce(script_quality_method,'(NULL)') AS method,
           count(*)::int AS rows
      FROM judgments TABLESAMPLE SYSTEM (0.3) REPEATABLE (5)
     GROUP BY 1,2 ORDER BY 3 DESC`;
  console.log('script_quality x method, TABLESAMPLE SYSTEM (0.3) REPEATABLE (5):');
  for(const r of v) console.log(' ',String(r.rows).padStart(7),r.script_quality.padEnd(20),r.method);
  writeFileSync('docs/ai/new2/body-text-value-vocabulary.json',JSON.stringify({generated_at:new Date().toISOString(),sample:'TABLESAMPLE SYSTEM (0.3) REPEATABLE (5)',rows:v},null,2));
} finally { await sql.end({timeout:5}); }
