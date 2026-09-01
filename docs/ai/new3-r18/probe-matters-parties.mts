/** NEW3 R18 probe — the runtime shape of `parties` on POST /matters and GET /matters/:id. */
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
const TAG = 'probe-new3-parties';
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
const [u] = await sql<{ id: string }[]>`
  INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
  VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified') RETURNING id`;
const token = await signAccessToken({ sub: authId, email }, SECRET);
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

// EXACTLY what apps/mobile/src/screens/matter/NewMatterScreen.tsx sends.
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
const created = (await post.json()) as any;
const matter = created.data.matter;
console.log('POST status              =', post.status);
console.log('POST parties typeof      =', typeof matter.parties);
console.log('POST parties raw         =', JSON.stringify(matter.parties));
console.log('POST parties.description =', JSON.stringify(matter.parties?.description));

const get = await app.request(`/matters/${matter.matterId}`, { headers });
const read = (await get.json()) as any;
const rm = read.data.matter ?? read.data;
console.log('GET  status              =', get.status);
console.log('GET  parties typeof      =', typeof rm.parties);
console.log('GET  parties raw         =', JSON.stringify(rm.parties));
console.log('GET  parties.description =', JSON.stringify(rm.parties?.description));

const [row] = await sql<{ t: string }[]>`SELECT jsonb_typeof(parties) t FROM matters WHERE id = ${matter.matterId}::uuid`;
console.log('STORED jsonb_typeof      =', row?.t);

const list = await app.request('/matters', { headers });
const lj = (await list.json()) as any;
const first = (lj.data.matters ?? [])[0];
console.log('LIST parties typeof      =', typeof first?.parties);

await cleanup();
await sql.end();
