import { openDb } from './db-host.ts';
import { classifyCorruption } from './text-corruption.ts';
const sql = await openDb(process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL']!);
const byCourt = new Map<string,{n:number;corrupt:number}>();
let cursor='00000000-0000-0000-0000-000000000000';
for(;;){
  const rows = await sql<any[]>`
    SELECT id, court, full_text FROM judgments
    WHERE id > ${cursor}::uuid AND full_text IS NOT NULL
      AND court IN ('High Court of Gujarat','High Court  for State of Telangana','Bombay High Court','Allahabad High Court')
    ORDER BY id LIMIT 2000`;
  if(rows.length===0) break;
  cursor = rows[rows.length-1]!.id;
  for(const r of rows){
    const v = classifyCorruption(r.full_text); if(!v) continue;
    const e = byCourt.get(r.court) ?? {n:0,corrupt:0};
    e.n++; if(v.corrupt) e.corrupt++;
    byCourt.set(r.court,e);
  }
  if(rows.length<2000) break;
}
console.log('corruption after the new signal (courts already repaired + the two NEW2 flagged):');
for(const [c,e] of [...byCourt].sort((a,b)=>b[1].corrupt-a[1].corrupt))
  console.log(`  ${c.slice(0,34).padEnd(34)} ${String(e.corrupt).padStart(5)} / ${String(e.n).padStart(6)} = ${(100*e.corrupt/e.n).toFixed(2)}%`);
await sql.end();
