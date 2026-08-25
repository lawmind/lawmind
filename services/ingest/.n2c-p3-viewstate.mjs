/**
 * NEW2 §8/NEW2-3 — capture the LIVE view before proposing a migration against it.
 *
 * LCC's 0081 is the precedent and the warning: they rewrote this family of view
 * from a migration FILE and PostgreSQL refused with 42P16 because the file was
 * ten columns behind the deployed object. Had CREATE OR REPLACE VIEW accepted
 * it, ten columns would have vanished silently.
 *
 * So: the body of 0083 is `pg_get_viewdef` of the LIVE view with ONE column
 * APPENDED. Nothing typed by hand. This script captures the before-state, its
 * sha256 identity, and the column count that must not fall.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:120000,onnotice:()=>{}});
try{
  const [v]=await sql`SELECT pg_get_viewdef('judgment_quality_contract'::regclass, true) AS def`;
  const [h]=await sql`SELECT substr(encode(sha256(pg_get_viewdef('judgment_quality_contract', true)::bytea),'hex'),1,16) AS sha`;
  const cols=await sql`
    SELECT attnum, attname, format_type(atttypid, atttypmod) AS type
      FROM pg_attribute WHERE attrelid='judgment_quality_contract'::regclass AND attnum>0 AND NOT attisdropped
     ORDER BY attnum`;
  const [t]=await sql`SELECT to_regclass('quality_screen_runs')::text AS exists`;
  const out={generated_at:new Date().toISOString(),view:'judgment_quality_contract',sha256_prefix:h.sha,
             column_count:cols.length,columns:cols.map(c=>`${c.attnum}. ${c.attname} ${c.type}`),
             quality_screen_runs_exists:t.exists,viewdef:v.def};
  writeFileSync('docs/ai/new2/quality-contract-view-before.json',JSON.stringify(out,null,2));
  console.log('sha256 prefix   ',h.sha);
  console.log('columns         ',cols.length);
  console.log('quality_screen_runs exists:',t.exists);
  console.log(cols.map(c=>c.attname).join(', '));
} finally { await sql.end({timeout:5}); }
