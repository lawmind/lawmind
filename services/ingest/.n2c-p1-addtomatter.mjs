import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:300000,onnotice:()=>{}});
const COURT=['COURT_REASONING_EXPLICIT','COURT_ORDER_DISPOSITIVE','OFFICIAL_REGISTRY_STATUS'];
try{
 const r=await sql`
  WITH badged AS (SELECT id, overruled_status, case_title, court FROM judgments
                   WHERE overruled_status IS NOT NULL AND overruled_status <> 'none')
  SELECT b.overruled_status,
         count(*)::int AS judgments,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM judgment_citations c
            WHERE c.cited_judgment_id=b.id AND c.relationship IN ('overruled','overruled_in_part','doubted')
              AND c.treatment_provenance = ANY(${COURT})))::int AS court_backed,
         count(*) FILTER (WHERE b.case_title LIKE 'SYNTHETIC %')::int AS synthetic_fixtures
    FROM badged b GROUP BY 1 ORDER BY 2 DESC`;
 console.log(JSON.stringify(r,null,1));
 const [a]=await sql`
  SELECT count(*)::int AS add_to_matter_blocked_today,
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM judgment_citations c
            WHERE c.cited_judgment_id=j.id AND c.relationship IN ('overruled','overruled_in_part','doubted')
              AND c.treatment_provenance = ANY(${COURT})))::int AS blocked_on_reporter_evidence_alone
    FROM judgments j WHERE j.overruled_status = 'set_aside'`;
 console.log('add-to-matter:',JSON.stringify(a));
} finally { await sql.end({timeout:5}); }
