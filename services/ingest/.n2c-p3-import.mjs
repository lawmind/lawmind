/**
 * NEW2 P3 — CAN COMPLETED SCREENING EVIDENCE BE IMPORTED WITHOUT A RESCAN?
 *
 * The checkpoint says 18,698,968 documents were screened and names NONE of them.
 * Its `cursor` is a UUID and the walk is ordered by id, so "id <= cursor means
 * screened" is unsafe in the one direction that matters: judgment ids are random
 * uuids, so a row inserted AFTER the run lands below the cursor with near
 * certainty and would be certified as screened having never been looked at.
 * That is the id-watermark failure this repository has already paid for.
 *
 * The safe watermark is TIME, not id: a row created before the run started was
 * necessarily in the table the run walked. Rows created during or after it are
 * uncertain and must read NEVER_SCREENED.
 *
 * This tests whether that watermark actually reconciles with the count. If it
 * does, the import is arithmetic. If it does not, the import is a guess.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:1800000,idle_timeout:0,onnotice:()=>{}});
const STARTED='2026-08-21T17:54:09.987Z', UPDATED='2026-08-22T05:55:26.326Z';
const CURSOR='ffffff40-1694-46f8-8dc7-f9532537609d';
const CLAIMED=18698968;
const steps=[];
const step=async(name,fn)=>{const [{active}]=await sql`SELECT count(*) FILTER (WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()`;
 const t=Date.now();const rows=await fn();const ms=Date.now()-t;steps.push({name,ms,pg_active_before:active,rows});
 console.log(`\n== ${name}  ${ms}ms  pg_active_before ${active}`);console.log(JSON.stringify(rows,null,1).slice(0,2500));return rows;};
try{
  await step('time_watermark_reconciliation', ()=>sql`
    SELECT count(*)::int AS corpus_now,
           count(*) FILTER (WHERE created_at <  ${STARTED}::timestamptz)::int AS created_before_run_started,
           count(*) FILTER (WHERE created_at >= ${STARTED}::timestamptz
                             AND created_at <= ${UPDATED}::timestamptz)::int AS created_during_run,
           count(*) FILTER (WHERE created_at >  ${UPDATED}::timestamptz)::int AS created_after_run
      FROM judgments`);
  // The falsifier for the id watermark: rows created AFTER the run that sit
  // BELOW the cursor. Every one of these would be falsely certified.
  await step('id_watermark_falsifier', ()=>sql`
    SELECT count(*)::int AS created_after_the_run,
           count(*) FILTER (WHERE id <= ${CURSOR}::uuid)::int AS would_be_falsely_certified_as_screened
      FROM judgments WHERE created_at > ${UPDATED}::timestamptz`);
  await step('current_quality_columns', ()=>sql`
    SELECT script_quality, script_quality_method, count(*)::int AS rows
      FROM judgments GROUP BY 1,2 ORDER BY 3 DESC`);
  writeFileSync('docs/ai/new2/body-text-import-feasibility.json', JSON.stringify({generated_at:new Date().toISOString(),checkpoint:{STARTED,UPDATED,CURSOR,CLAIMED},steps},null,2));
  console.log('\nwrote docs/ai/new2/body-text-import-feasibility.json');
} finally { await sql.end({timeout:10}); }
