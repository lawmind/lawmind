import postgres from 'postgres';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).map(l=>l.replace(/^\uFEFF/,'').trim()).filter(l=>/^[A-Za-z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const sql = postgres(env.DATABASE_URL, { max: 2, idle_timeout: 5 });
const ids = (await sql`SELECT id FROM users WHERE email LIKE 'new3-acceptance-%@example.test'`).map(r=>r.id);
let ma=0, me=0, mt=0;
for (const uid of ids) {
  const mids = (await sql`SELECT id FROM matters WHERE user_id = ${uid}`).map(r=>r.id);
  for (const m of mids) {
    ma += (await sql`DELETE FROM matter_authorities WHERE matter_id = ${m}`).count;
    me += (await sql`DELETE FROM matter_events WHERE matter_id = ${m}`).count;
    await sql`DELETE FROM matter_shares WHERE matter_id = ${m}`;
    mt += (await sql`DELETE FROM matters WHERE id = ${m}`).count;
  }
  await sql`DELETE FROM refresh_tokens WHERE user_id = ${uid}`;
  await sql`DELETE FROM search_events WHERE user_id = ${uid}`.catch(()=>{});
  await sql`DELETE FROM searches WHERE user_id = ${uid}`.catch(()=>{});
  await sql`DELETE FROM activation_events WHERE user_id = ${uid}`.catch(()=>{});
}
const u = await sql`DELETE FROM users WHERE email LIKE 'new3-acceptance-%@example.test'`;
const a = await sql`DELETE FROM auth_user WHERE email LIKE 'new3-acceptance-%@example.test'`;
console.log('matter_authorities',ma,'matter_events',me,'matters',mt,'users',u.count,'auth_user',a.count);
console.log('matters total now', (await sql`select count(*)::int c from matters`)[0].c);
await sql.end();
