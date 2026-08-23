import postgres from 'postgres';
import { writeFileSync } from 'node:fs';
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000 });
const q = async (l,t)=>{const s=Date.now();try{const r=await sql.unsafe(t);console.log('##',l,JSON.stringify(r),(Date.now()-s)+'ms');return r;}catch(e){console.log('##',l,'ERR',e.message);return null;}};
const vals = await q('script_quality values', `select coalesce(script_quality,'<NULL>') v, coalesce(script_quality_method,'<NULL>') m, count(*)::text n
  from judgments group by 1,2 order by 3 desc limit 15`);
const rec = await q('recovery states', `select coalesce(state,'<NULL>') s, count(*)::text n from judgment_recovery_queue group by 1 order by 2 desc`);
writeFileSync('docs/ai/new2/body-text-evidence-census.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  question: 'does any writer emit a CLEAN verdict, or does TEXT_UNKNOWN mean two different things?',
  script_quality_by_method: vals, recovery_queue_states: rec,
}, null, 1));
await sql.end();
