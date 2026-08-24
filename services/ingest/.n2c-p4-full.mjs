import postgres from 'postgres';
import { readFileSync } from 'node:fs';
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:300000,onnotice:()=>{}});
const seqs = process.argv.slice(2).map(Number);
const d = JSON.parse(readFileSync('docs/ai/new2/uncited-authority-frame-v2.json','utf8'));
const want = d.documents.filter(x=>seqs.includes(x.seq));
const rows = await sql`SELECT id, full_text FROM judgments WHERE id = ANY(${want.map(w=>w.id)}::uuid[])`;
const byId = new Map(rows.map(r=>[r.id, r.full_text]));
for (const w of want) {
  console.log('===== #'+w.seq+' ['+w.chars+'ch] '+(w.court||'')+' '+w.judgment_date+' disp='+(w.disposal_nature||'-'));
  console.log(String(byId.get(w.id)||'').replace(/\s+/g,' ').trim());
  console.log('');
}
await sql.end();
