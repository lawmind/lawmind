/**
 * NEW2 P2e — WHAT DOES CLOSING THE BACKLOG ACTUALLY FIX?
 *
 * 33,013 shared-neutral groups collapse to a false UNIQUE because the key table
 * holds one member. If the missing members are the ones above the builder's
 * cursor, re-running the builder converts those collapses into correct
 * AMBIGUOUS and no code changes at all. That is a PREDICTION, stated here with
 * its number so LCC can falsify it by re-running the builder and re-counting.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:1800000,idle_timeout:0,onnotice:()=>{}});
const CURSOR_AT='2026-08-17 16:46:01.15+00', CURSOR_ID='f9b55b00-8872-46ed-93d9-7ca38198ce1e';
const steps=[];
const step=async(name,fn)=>{const [{active}]=await sql`SELECT count(*) FILTER (WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()`;
 const t=Date.now();const rows=await fn();const ms=Date.now()-t;steps.push({name,ms,pg_active_before:active,rows});
 console.log(`\n== ${name}  ${ms}ms  pg_active_before ${active}`);console.log(JSON.stringify(rows,null,1).slice(0,2500));return rows;};
try{
  await step('collapse_repairable_by_backfill', ()=>sql`
    WITH collapsed AS (
      SELECT g.k, g.n AS true_size, g.distinct_content_hashes AS hashes, g.distinct_case_numbers AS cases
        FROM new2_neutral_dupe_groups g
       WHERE (SELECT count(DISTINCT k2.judgment_id)::int
                FROM judgment_citation_keys k2 WHERE k2.citation_key = g.k) = 1
    ), members AS (
      SELECT c.k, c.hashes, c.cases,
             count(*) FILTER (WHERE (j.created_at, j.id) > (${CURSOR_AT}::timestamptz, ${CURSOR_ID}::uuid))::int AS above_cursor
        FROM collapsed c
        JOIN judgments j
          ON upper(regexp_replace(coalesce(j.neutral_citation,''), '[^A-Za-z0-9]', '', 'g')) = c.k
       GROUP BY c.k, c.hashes, c.cases
    )
    SELECT count(*)::int AS collapsed_groups,
           count(*) FILTER (WHERE above_cursor >= 1)::int AS repaired_by_backfill,
           count(*) FILTER (WHERE above_cursor = 0)::int AS remaining_after_backfill,
           count(*) FILTER (WHERE above_cursor = 0 AND hashes > 1 AND cases > 1)::int AS remaining_different_documents
      FROM members`);
  writeFileSync('docs/ai/new2/resolver-backfill-prediction.json', JSON.stringify({generated_at:new Date().toISOString(),cursor:{CURSOR_AT,CURSOR_ID},steps},null,2));
  console.log('\nwrote docs/ai/new2/resolver-backfill-prediction.json');
} finally { await sql.end({timeout:10}); }
