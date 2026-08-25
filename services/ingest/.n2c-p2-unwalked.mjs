/**
 * NEW2 §8/NEW2-2 — SEPARATE THE TWO CAUSES INSIDE THE 734.
 *
 * A batch whose only neutral citations were Madras despatch stamps reads
 * "never walked" after LCC's purge, because purging its key rows leaves keyed=0.
 * That is a CORRECT zero. A batch holding real neutral citations and keyed=0 is
 * an UNWALKED batch, which is a walker defect and does not close itself.
 *
 * Pooling those two would report a healthy purge as a backlog -- the same error
 * as pooling a correct refusal with a miss.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:900000,idle_timeout:0,onnotice:()=>{}});
const MONTHS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER',
              'JAN','FEB','MAR','APR','JUN','JUL','AUG','SEP','SEPT','OCT','NOV','DEC','JANURARY','ARPIL','SEPTEMEBER'];
const RE=`^[0-9]{4}:?(${MONTHS.join('|')}):?[0-9]{1,2}$`;
const out={generated_at:new Date().toISOString(),steps:{}};
const step=async(n,f)=>{const t=Date.now();const rows=await f();out.steps[n]={ms:Date.now()-t,rows};
  console.log(`\n== ${n}  ${Date.now()-t}ms`);console.log(JSON.stringify(rows,null,1).slice(0,2500));return rows;};
try{
  await step('batch_causes_split', ()=>sql`
    WITH b AS (
      SELECT j.created_at,
             count(*) FILTER (WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
                                AND upper(replace(j.neutral_citation,' ','')) !~ ${RE})::int AS real_citations,
             count(*) FILTER (WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
                                AND upper(replace(j.neutral_citation,' ','')) ~ ${RE})::int  AS stamp_citations,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM judgment_citation_keys k
                                             WHERE k.judgment_id=j.id AND k.source='neutral'))::int AS keyed
        FROM judgments j WHERE j.created_at >= '2026-08-17'::timestamptz
       GROUP BY 1)
    SELECT count(*) FILTER (WHERE keyed=0 AND real_citations>0)::int              AS unwalked_batches,
           coalesce(sum(real_citations) FILTER (WHERE keyed=0 AND real_citations>0),0)::int AS real_citations_stranded,
           count(*) FILTER (WHERE keyed=0 AND real_citations=0 AND stamp_citations>0)::int  AS stamp_only_batches_correctly_zero,
           coalesce(sum(stamp_citations) FILTER (WHERE keyed=0 AND real_citations=0),0)::int AS stamps_correctly_unkeyed
      FROM b`);

  await step('the_one_indexed_misspelling', ()=>sql`
    SELECT j.id, j.neutral_citation, j.court, j.judgment_date::text AS decided,
           k.citation_key, k.source_text,
           (SELECT count(DISTINCT judgment_id)::int FROM judgment_citation_keys k2
             WHERE k2.citation_key = k.citation_key) AS judgments_holding_that_key
      FROM judgments j JOIN judgment_citation_keys k ON k.judgment_id=j.id AND k.source='neutral'
     WHERE upper(replace(j.neutral_citation,' ','')) ~ '^[0-9]{4}:?(JANURARY|ARPIL|SEPTEMEBER):?[0-9]{1,2}$'`);

  writeFileSync('docs/ai/new2/resolver-unwalked-batches.json',JSON.stringify(out,null,2));
  console.log('\nwrote docs/ai/new2/resolver-unwalked-batches.json');
} finally { await sql.end({timeout:10}); }
