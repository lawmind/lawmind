/**
 * LCC R23 — reproduce the matters.parties defect through the REAL write path.
 *
 * Creates one disposable matter with the exact body NewMatterScreen.tsx sends,
 * then reads the stored jsonb_typeof and all three response shapes. Cleans up
 * after itself the way the erasure fixtures do (services/api/src/auth/erasure-fixture.test.ts).
 */
import { signAccessToken } from '../../../packages/auth/src/tokens.ts';
import postgres from 'postgres';
import { createApp } from '../../../services/api/src/app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});
const TAG = 'probe-lcc-r23-parties';
const authId = `${TAG}-${crypto.randomUUID()}`;
const email = `${authId}@example.test`;

async function cleanup() {
  const users = sql`SELECT id FROM users WHERE auth_id LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM activation_events WHERE user_id IN (${users})`;
  await sql`DELETE FROM matters WHERE user_id IN (${users})`;
  await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}-%`}`;
}

await cleanup();
await sql`INSERT INTO auth_user (id, name, email, email_verified) VALUES (${authId}, 'Adv', ${email}, true)`;
await sql`
  INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
  VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified')`;
const token = await signAccessToken({ sub: authId, email }, SECRET);
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const body = {
  caseTitle: 'Probe v. State',
  cnrNumber: null,
  court: 'Delhi High Court',
  caseType: 'criminal',
  parties: { description: 'Ramesh Kumar v. State of NCT of Delhi' },
  clientName: 'Probe Client',
  ourSide: 'accused',
  nextHearingDate: null,
};
const post = await app.request('/matters', { method: 'POST', headers, body: JSON.stringify(body) });
const matter = ((await post.json()) as any).data.matter;
console.log('POST status              =', post.status);
console.log('POST parties typeof      =', typeof matter.parties);
console.log('POST parties.description =', JSON.stringify(matter.parties?.description));

const get = await app.request(`/matters/${matter.matterId}`, { headers });
const rm = ((await get.json()) as any).data.matter;
console.log('GET  parties typeof      =', typeof rm.parties);
console.log('GET  parties.description =', JSON.stringify(rm.parties?.description));

const list = await app.request('/matters', { headers });
const first = (((await list.json()) as any).data.matters ?? [])[0];
console.log('LIST parties typeof      =', typeof first?.parties);

const [row] = await sql<{ t: string }[]>`
  SELECT jsonb_typeof(parties) t FROM matters WHERE id = ${matter.matterId}::uuid`;
console.log('STORED jsonb_typeof      =', row?.t);

await cleanup();

console.log('--- corpus-wide census (after cleanup) ---');
const census = await sql<{ t: string | null; n: string }[]>`
  SELECT jsonb_typeof(parties) t, count(*)::text n FROM matters GROUP BY 1 ORDER BY 1`;
console.table(census);

await sql.end();
