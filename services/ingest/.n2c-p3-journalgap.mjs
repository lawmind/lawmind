/**
 * NEW2 — A RESTORE WOULD COME UP MISSING THE LAST FOUR MIGRATIONS.
 *
 * `packages/db/src/migrate.ts` calls drizzle's `migrate()`, which applies what
 * `drizzle/meta/_journal.json` LISTS -- not what the folder contains. The
 * journal stops at idx 82.
 *
 * Four migration FILES exist past it and are applied to the live database,
 * because LCC and I each executed our own SQL directly:
 *   0083_ops_job_observations   (LCC)
 *   0083_quality_screen_runs    (NEW2, mine -- and a NUMBER COLLISION with the above)
 *   0084_erasure_objects        (LCC)
 *   0085_citation_key_freshness (LCC)
 *
 * So a fresh restore has the objects on the live box and NOT in the schema it
 * would rebuild. That lands directly on LCC-7 (release rehearsal: restore, then
 * prove equivalence) and it is exactly the class of failure that rehearsal
 * exists to catch -- found before the rehearsal rather than during it.
 *
 * READ ONLY.
 */
import { readdirSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,statement_timeout:120000,onnotice:()=>{}});
try{
  const journal=JSON.parse(readFileSync('packages/db/drizzle/meta/_journal.json','utf8'));
  const listed=new Set(journal.entries.map(e=>e.tag));
  const files=readdirSync('packages/db/drizzle').filter(f=>f.endsWith('.sql')).map(f=>f.replace(/\.sql$/,'')).sort();
  const orphans=files.filter(f=>!listed.has(f));
  console.log(`journal entries ${journal.entries.length}, max idx ${Math.max(...journal.entries.map(e=>e.idx))}`);
  console.log(`sql files ${files.length}`);
  console.log(`\nFILES NOT IN THE JOURNAL (a fresh restore would skip these): ${orphans.length}`);
  for(const o of orphans) console.log('  ',o);

  // Number collisions -- two files claiming one ordinal is ambiguous even once journalled.
  const byNum={}; for(const f of files){const n=f.slice(0,4); (byNum[n]??=[]).push(f);}
  const dupes=Object.entries(byNum).filter(([,v])=>v.length>1);
  console.log(`\nNUMBER COLLISIONS: ${dupes.length}`);
  for(const [n,v] of dupes) console.log('  ',n,'->',v.join('  AND  '));

  // What the live database thinks it has applied.
  const applied=await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`.catch(()=>[{n:null}]);
  console.log(`\ndrizzle.__drizzle_migrations rows on the LIVE db: ${applied[0]?.n}`);

  // And whether the orphan objects actually exist live -- the asymmetry itself.
  const objs=await sql`
    SELECT to_regclass('quality_screen_runs')::text        AS quality_screen_runs,
           to_regclass('judgment_body_text_evidence')::text AS judgment_body_text_evidence,
           to_regclass('ops_job_observations')::text        AS ops_job_observations,
           to_regclass('erasure_objects')::text             AS erasure_objects,
           to_regclass('citation_key_freshness')::text      AS citation_key_freshness`;
  console.log('\nobjects present on the LIVE db but absent from a journal-driven restore:');
  for(const [k,v] of Object.entries(objs[0])) console.log(`   ${v?'PRESENT':'absent '}  ${k}`);
} finally { await sql.end({timeout:5}); }
