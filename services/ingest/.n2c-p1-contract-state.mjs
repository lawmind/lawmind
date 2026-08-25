/**
 * NEW2 §8/NEW2-1 — the live state the consumer contract must describe.
 *
 * The contract is written against numbers read TODAY, not against the 23 Aug
 * artefact, because 0082 has since been populated and LCC has deleted six
 * leaked test fixtures. A contract quoting a stale denominator is a contract
 * that will be audited against the wrong number.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:600000,idle_timeout:0,onnotice:()=>{}});
const out={generated_at:new Date().toISOString(),steps:{}};
const step=async(n,f)=>{const t=Date.now();const rows=await f();out.steps[n]={ms:Date.now()-t,rows};
  console.log(`\n== ${n}  ${Date.now()-t}ms`);console.log(JSON.stringify(rows,null,1).slice(0,2200));return rows;};
try{
  await step('provenance_distribution', ()=>sql`
    SELECT coalesce(treatment_provenance,'(NULL = NOT CLASSIFIED)') AS provenance,
           count(*)::int AS edges
      FROM judgment_citations
     WHERE relationship IS NOT NULL AND relationship <> 'cites'
     GROUP BY 1 ORDER BY 2 DESC`);

  await step('badge_population', ()=>sql`
    SELECT overruled_status, count(*)::int AS judgments
      FROM judgments WHERE overruled_status IS NOT NULL AND overruled_status <> 'none'
     GROUP BY 1 ORDER BY 2 DESC`);

  await step('driving_edges_by_provenance', ()=>sql`
    SELECT coalesce(c.treatment_provenance,'(NULL)') AS provenance,
           c.relationship,
           count(*)::int AS driving_edges,
           count(DISTINCT c.cited_judgment_id)::int AS judgments_affected
      FROM judgment_citations c
      JOIN judgments j ON j.id = c.cited_judgment_id
     WHERE c.relationship IN ('overruled','overruled_in_part','doubted')
       AND j.overruled_status IS NOT NULL AND j.overruled_status <> 'none'
     GROUP BY 1,2 ORDER BY 3 DESC`);

  await step('badges_surviving_a_court_only_gate', ()=>sql`
    WITH badged AS (
      SELECT j.id, j.overruled_status FROM judgments j
       WHERE j.overruled_status IS NOT NULL AND j.overruled_status <> 'none')
    SELECT count(*)::int AS badged_judgments,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM judgment_citations c
              WHERE c.cited_judgment_id = b.id
                AND c.relationship IN ('overruled','overruled_in_part','doubted')
                AND c.treatment_provenance IN ('COURT_REASONING_EXPLICIT','COURT_ORDER_DISPOSITIVE','OFFICIAL_REGISTRY_STATUS')))::int
             AS survive_court_only_gate,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM judgment_citations c
              WHERE c.cited_judgment_id = b.id
                AND c.relationship IN ('overruled','overruled_in_part','doubted')
                AND c.treatment_provenance IN ('COURT_REASONING_EXPLICIT','COURT_ORDER_DISPOSITIVE','OFFICIAL_REGISTRY_STATUS')))::int
             AS lose_badge_under_court_only_gate
      FROM badged b`);

  writeFileSync('docs/ai/new2/treatment-contract-state.json',JSON.stringify(out,null,2));
  console.log('\nwrote docs/ai/new2/treatment-contract-state.json');
} finally { await sql.end({timeout:10}); }
