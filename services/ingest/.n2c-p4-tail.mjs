import postgres from 'postgres';
import { readFileSync } from 'node:fs';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:300000,onnotice:()=>{}});
const [a,b] = [Number(process.argv[2]), Number(process.argv[3])];
const d = JSON.parse(readFileSync('docs/ai/new2/uncited-authority-frame-v2.json','utf8'));
const want = d.documents.filter(x=>x.seq>=a && x.seq<=b);
const rows = await sql`SELECT id, full_text FROM judgments WHERE id = ANY(${want.map(w=>w.id)}::uuid[])`;
const byId = new Map(rows.map(r=>[r.id, String(r.full_text||'').replace(/\s+/g,' ').trim()]));
for (const w of want) {
  const t = byId.get(w.id)||'';
  console.log('#'+w.seq+' ['+w.chars+'ch] '+(w.court||'').slice(0,20)+' '+w.judgment_date+' cls='+(w.hc_document_class||'-'));
  console.log('…'+t.slice(-1000));
  console.log('');
}
await sql.end();
