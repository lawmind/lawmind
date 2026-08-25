/**
 * NEW2 §8/NEW2-5 — the sampling frame for the passage role/safety study.
 *
 * Deliberately built on NEW1's own TRANCHE_100K_DESIGN frame so the two studies
 * describe the same population: sampled from `judgments`, NOT from
 * `new1_doc_vector_stage` -- sampling from the stage would guarantee every
 * document is already reachable and silently delete the stratum that matters.
 *
 * The tranche BUILD has not started (NEW1 is waiting on a GPU quiet window), so
 * this study does not need it: passage ROLE and passage DAMAGE are properties of
 * the TEXT, not of the vectors. Measuring them now is what makes the study a
 * precondition rather than a post-mortem.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:1800000,idle_timeout:0,onnotice:()=>{}});
const out={generated_at:new Date().toISOString(),steps:{}};
const step=async(n,f)=>{const t=Date.now();const rows=await f();out.steps[n]={ms:Date.now()-t,rows};
  console.log(`\n== ${n}  ${Date.now()-t}ms`);console.log(JSON.stringify(rows,null,1).slice(0,2500));return rows;};
try{
  await step('stage_exists', ()=>sql`SELECT to_regclass('new1_doc_vector_stage')::text AS stage, to_regclass('judgment_chunks')::text AS chunks`);
  await step('frame_shape', ()=>sql`
    SELECT count(*)::int AS sampled,
           count(*) FILTER (WHERE full_text IS NOT NULL AND length(full_text) >= 2000)::int AS above_gate,
           count(DISTINCT court)::int AS courts,
           count(*) FILTER (WHERE judgment_date < '2010-01-01')::int AS pre_2010
      FROM judgments TABLESAMPLE SYSTEM (0.05) REPEATABLE (17)`);
  writeFileSync('docs/ai/new2/passage-frame-probe.json',JSON.stringify(out,null,2));
} finally { await sql.end({timeout:10}); }
