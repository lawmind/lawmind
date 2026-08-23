/**
 * NEW2 P2d — IS THE RESOLVER'S BLIND SPOT A RULE OR A BACKLOG?
 *
 * The key builder's selection has no exclusion: every judgment with a non-empty
 * neutral_citation gets a row. It walks a (created_at, id) cursor, and that
 * cursor last moved 17 August. So the hypothesis is BACKLOG, not rule — and the
 * two have opposite fixes, so it is tested rather than assumed.
 *
 * Falsifier: if judgments BELOW the cursor also lack key rows, a second cause
 * exists and re-running the builder will not close the gap.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:900000,idle_timeout:0,onnotice:()=>{}});
const CURSOR_AT='2026-08-17 16:46:01.15+00', CURSOR_ID='f9b55b00-8872-46ed-93d9-7ca38198ce1e';
const steps=[];
const step=async(name,fn)=>{const [{active}]=await sql`SELECT count(*) FILTER (WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()`;
 const t=Date.now();const rows=await fn();const ms=Date.now()-t;steps.push({name,ms,pg_active_before:active,rows});
 console.log(`\n== ${name}  ${ms}ms  pg_active_before ${active}`);console.log(JSON.stringify(rows,null,1).slice(0,2500));return rows;};
try{
  await step('above_cursor_with_neutral', ()=>sql`
    SELECT count(*)::int AS judgments_above_cursor,
           count(*) FILTER (WHERE neutral_citation IS NOT NULL AND neutral_citation <> '')::int AS with_neutral
      FROM judgments WHERE (created_at, id) > (${CURSOR_AT}::timestamptz, ${CURSOR_ID}::uuid)`);
  // The falsifier. A bounded window BELOW the cursor, ordered the same way the
  // builder walks, so a rule-shaped gap would show as missing keys down here too.
  await step('below_cursor_sample_missing_keys', ()=>sql`
    WITH s AS (
      SELECT id FROM judgments
       WHERE (created_at, id) <= (${CURSOR_AT}::timestamptz, ${CURSOR_ID}::uuid)
         AND neutral_citation IS NOT NULL AND neutral_citation <> ''
       ORDER BY created_at DESC, id DESC LIMIT 20000)
    SELECT count(*)::int AS sampled,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM judgment_citation_keys k
              WHERE k.judgment_id = s.id AND k.source='neutral'))::int AS missing_key_row
      FROM s`);
  writeFileSync('docs/ai/new2/resolver-keygap.json', JSON.stringify({generated_at:new Date().toISOString(),cursor:{CURSOR_AT,CURSOR_ID},steps},null,2));
  console.log('\nwrote docs/ai/new2/resolver-keygap.json');
} finally { await sql.end({timeout:10}); }
