/**
 * NEW2 P3b — what `body_text_evidence` reads BEFORE and AFTER importing the
 * completed screen, and the one falsifier that decides whether the import is
 * honest: did the screen actually evaluate text for every row it counted?
 *
 * `textVerdict` returns NO_EXTRACTABLE_TEXT for empty text -- a verdict, not a
 * skip -- and the checkpoint's byState has no such bucket. Either no row was
 * empty, or the count is inflated by rows nothing looked at. That is the
 * "unclassified is two populations" failure and it is tested, not assumed.
 *
 * READ ONLY. Nothing is written; this measures what a migration WOULD produce.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:1800000,idle_timeout:0,onnotice:()=>{}});
const STARTED='2026-08-21T17:54:09.987Z';
const steps=[];
const step=async(name,fn)=>{const [{active}]=await sql`SELECT count(*) FILTER (WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()`;
 const t=Date.now();const rows=await fn();const ms=Date.now()-t;steps.push({name,ms,pg_active_before:active,rows});
 console.log(`\n== ${name}  ${ms}ms  pg_active_before ${active}`);console.log(JSON.stringify(rows,null,1).slice(0,2500));return rows;};
try{
  // `length(full_text)` over 18.7M rows detoasts every value and does not
  // finish inside a sane window -- measured, it ran past 10 minutes. NULL is
  // free (it is in the tuple header), and the empty-string case is answered on
  // a bounded window instead, with its bound stated rather than implied.
  await step('null_text_exact', ()=>sql`
    SELECT count(*)::int AS corpus,
           count(*) FILTER (WHERE full_text IS NULL)::int AS null_text
      FROM judgments`);
  await step('empty_text_bounded_sample', ()=>sql`
    WITH s AS (SELECT full_text FROM judgments TABLESAMPLE SYSTEM (0.5) REPEATABLE (11))
    SELECT count(*)::int AS sampled,
           count(*) FILTER (WHERE full_text IS NOT NULL AND length(full_text) = 0)::int AS empty_text
      FROM s`);
  await step('body_text_evidence_today_and_after_import', ()=>sql`
    SELECT
      count(*) FILTER (WHERE script_quality_method = 'text-damage-v2.0')::int                        AS proven_damaged,
      count(*) FILTER (WHERE script_quality IS NOT NULL
                         AND script_quality_method <> 'text-damage-v2.0')::int                       AS screened_damaged,
      count(*) FILTER (WHERE script_quality IS NULL)::int                                            AS unconvicted_today_never_screened,
      count(*) FILTER (WHERE script_quality IS NULL
                         AND created_at <  ${STARTED}::timestamptz)::int                             AS after_import_screened_no_damage_found,
      count(*) FILTER (WHERE script_quality IS NULL
                         AND created_at >= ${STARTED}::timestamptz)::int                             AS after_import_never_screened
      FROM judgments`);
  writeFileSync('docs/ai/new2/body-text-evidence-states.json', JSON.stringify({generated_at:new Date().toISOString(),watermark:STARTED,steps},null,2));
  console.log('\nwrote docs/ai/new2/body-text-evidence-states.json');
} finally { await sql.end({timeout:10}); }
