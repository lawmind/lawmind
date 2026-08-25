import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,onnotice:()=>{}});
try{
  const [o]=await sql`
    SELECT to_regclass('citation_key_frontier')::text AS citation_key_frontier,
           to_regclass('resolver_risk_replay')::text  AS resolver_risk_replay,
           to_regclass('erasure_objects')::text       AS erasure_objects,
           to_regclass('ops_job_observations')::text  AS ops_job_observations,
           to_regclass('ops_job_current')::text       AS ops_job_current,
           to_regclass('quality_screen_runs')::text   AS quality_screen_runs`;
  for(const [k,v] of Object.entries(o)) console.log(`  ${v?'PRESENT':'ABSENT '}  ${k}`);
} finally { await sql.end({timeout:5}); }
