/* Falsifier: does INSERT ... ON CONFLICT DO NOTHING block on a concurrent
   uncommitted duplicate, and does it insert if that duplicate rolls back? */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const env = readFileSync('.env', 'utf8');
const url = (/^LOCAL_DATABASE_URL=(.+)$/m.exec(env) ?? [])[1].trim();
const sql = postgres(url, { max: 5, onnotice: () => {} });

const T = `probe_idem_${Date.now().toString(36)}`;
await sql.unsafe(`CREATE TABLE ${T}(k text primary key, v text)`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

// A: executor holds an uncommitted insert for 800ms then COMMITS.
const a = sql.begin(async (tx) => {
  const r = await tx.unsafe(`INSERT INTO ${T}(k,v) VALUES ('k1','A') ON CONFLICT (k) DO NOTHING RETURNING k`);
  log.push(`A inserted=${r.length}`);
  await sleep(800);
  return 'committed';
});

await sleep(150);

// B: follower attempts the same key. Does it block?
const t0 = Date.now();
const b = sql.begin(async (tx) => {
  const r = await tx.unsafe(`INSERT INTO ${T}(k,v) VALUES ('k1','B') ON CONFLICT (k) DO NOTHING RETURNING k`);
  const waited = Date.now() - t0;
  const seen = await tx.unsafe(`SELECT v FROM ${T} WHERE k='k1'`);
  log.push(`B inserted=${r.length} waitedMs=${waited} sees=${JSON.stringify(seen.map((x) => x.v))}`);
});

await Promise.all([a, b]);

// C: executor holds an uncommitted insert then ROLLS BACK — follower must win.
const c = sql.begin(async (tx) => {
  await tx.unsafe(`INSERT INTO ${T}(k,v) VALUES ('k2','C') ON CONFLICT (k) DO NOTHING RETURNING k`);
  await sleep(600);
  throw new Error('deliberate rollback');
}).catch(() => log.push('C rolled back'));

await sleep(150);
const t1 = Date.now();
const d = sql.begin(async (tx) => {
  const r = await tx.unsafe(`INSERT INTO ${T}(k,v) VALUES ('k2','D') ON CONFLICT (k) DO NOTHING RETURNING k`);
  log.push(`D inserted=${r.length} waitedMs=${Date.now() - t1}`);
});
await Promise.all([c, d]);

// E: lock_timeout must convert the wait into an error we can catch.
const e = sql.begin(async (tx) => {
  await tx.unsafe(`INSERT INTO ${T}(k,v) VALUES ('k3','E') ON CONFLICT (k) DO NOTHING`);
  await sleep(900);
});
await sleep(150);
const f = sql.begin(async (tx) => {
  await tx.unsafe(`SET LOCAL lock_timeout = '200ms'`);
  try {
    await tx.unsafe(`INSERT INTO ${T}(k,v) VALUES ('k3','F') ON CONFLICT (k) DO NOTHING`);
    log.push('F: no timeout fired');
  } catch (err) {
    log.push(`F: caught code=${err.code} msg=${String(err.message).slice(0, 60)}`);
    throw err;
  }
}).catch(() => {});
await Promise.all([e, f]);

const final = await sql.unsafe(`SELECT k,v FROM ${T} ORDER BY k`);
log.push(`final=${JSON.stringify(final.map((r) => [r.k, r.v]))}`);
await sql.unsafe(`DROP TABLE ${T}`);
console.log(log.join('\n'));
await sql.end();
