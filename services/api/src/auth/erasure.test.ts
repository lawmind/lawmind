/**
 * Account deletion, end to end, against the real database.
 *
 * The assertion that matters is not "the endpoint returned 200". It is that
 * **the rows are gone**, that the identity is destroyed, and that the ledger
 * still holds the record of an admin who acted — three properties that pull
 * against each other, which is why this is tested rather than reasoned about.
 *
 * `PRIVACY_PII.md` §Retention: *"A soft delete flag is not deletion."*
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';

const url = process.env['DATABASE_URL'] ?? '';
const sql = postgres(url, { max: 3, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const TAG = 'test-erasure';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

async function seed(tag: string, role: 'advocate' | 'admin' = 'advocate') {
  const authId = `${TAG}-${tag}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Adv', ${email}, true)`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status, role)
    VALUES (${authId}, 'Priya Sharma', '+919999999999', ${email}, 'unverified', ${role})
    RETURNING id`;
  return { authId, email, userId: u!.id, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const json = { 'content-type': 'application/json' };

describe('account deletion', () => {
  let victim: Awaited<ReturnType<typeof seed>>;
  let admin: Awaited<ReturnType<typeof seed>>;
  let matterId: string;

  before(async () => {
    victim = await seed('victim');
    admin = await seed('admin', 'admin');

    // Content that carries a real client's identity — the thing erasure is for.
    const [m] = await sql<{ id: string }[]>`
      INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                           our_side, status, source)
      VALUES (${victim.userId}::uuid, 'Ramesh Kumar v State', 'High Court of Punjab and Haryana',
              'criminal', ${sql.json({ petitioner: 'Ramesh Kumar', respondent: 'State of Punjab' })}, 'Ramesh Kumar',
              'petitioner', 'active', 'manual')
      RETURNING id`;
    matterId = m!.id;
    await sql`INSERT INTO saved_searches (user_id, query_text, query_language)
              VALUES (${victim.userId}::uuid, 'anticipatory bail 498A', 'en')`;
  });

  after(async () => {
    // The victim row survives erasure by design (audit referential integrity),
    // so it is cleaned up here explicitly. The admin row cannot be deleted at
    // all — it has written audit_log, which is append-only.
    await sql`DELETE FROM saved_searches WHERE user_id = ${victim.userId}::uuid`;
    await sql`DELETE FROM matters WHERE user_id = ${victim.userId}::uuid`;
    await sql`DELETE FROM data_requests WHERE user_id = ${victim.userId}::uuid`;
    await sql.end();
  });

  it('an advocate can raise an erasure request for their own account', async () => {
    const res = await app.request('/me/data-requests', {
      method: 'POST',
      headers: { ...auth(victim.token), ...json },
      body: JSON.stringify({ kind: 'erasure' }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { data: { request: { id: string; status: string } } };
    assert.equal(body.data.request.status, 'received');
  });

  it('a second tap returns the SAME open request rather than a second clock', async () => {
    const res = await app.request('/me/data-requests', {
      method: 'POST',
      headers: { ...auth(victim.token), ...json },
      body: JSON.stringify({ kind: 'erasure' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { alreadyOpen: boolean } };
    assert.equal(body.data.alreadyOpen, true);
    const [row] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM data_requests
       WHERE user_id = ${victim.userId}::uuid AND kind = 'erasure'`;
    assert.equal(row!.n, '1');
  });

  it('an ordinary advocate cannot execute the erasure', async () => {
    const [req] = await sql<{ id: string }[]>`
      SELECT id FROM data_requests WHERE user_id = ${victim.userId}::uuid AND kind = 'erasure'`;
    const res = await app.request(`/admin/data-requests/${req!.id}/erase`, {
      method: 'POST',
      headers: { ...auth(victim.token), ...json },
      body: JSON.stringify({ reason: 'trying to delete myself the fast way' }),
    });
    assert.equal(res.status, 403);
  });

  it('an admin executing it destroys the content and anonymises the identity', async () => {
    const [req] = await sql<{ id: string }[]>`
      SELECT id FROM data_requests WHERE user_id = ${victim.userId}::uuid AND kind = 'erasure'`;
    const res = await app.request(`/admin/data-requests/${req!.id}/erase`, {
      method: 'POST',
      headers: { ...auth(admin.token), ...json },
      body: JSON.stringify({ reason: 'DPDP erasure request, verified by email' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: { deleted: Record<string, number>; storageKeysStillToDelete: string[] };
    };
    assert.equal(body.data.deleted['matters'], 1);
    assert.equal(body.data.deleted['saved_searches'], 1);
    // Present and empty is the honest answer for a user with no uploads; the
    // field must exist either way so a caller cannot mistake absence for "none".
    assert.deepEqual(body.data.storageKeysStillToDelete, []);

    const matters = await sql`SELECT id FROM matters WHERE id = ${matterId}::uuid`;
    assert.equal(matters.length, 0, 'the matter survived — a soft delete is not deletion');
    const saved = await sql`SELECT id FROM saved_searches WHERE user_id = ${victim.userId}::uuid`;
    assert.equal(saved.length, 0);

    const [row] = await sql<
      { full_name: string; email: string; phone: string; auth_id: string; role: string }[]
    >`SELECT full_name, email, phone, auth_id, role FROM users WHERE id = ${victim.userId}::uuid`;
    assert.ok(row, 'the users row must SURVIVE — audit_log references it and cannot be edited');
    assert.equal(row.full_name, 'Deleted account');
    assert.equal(row.phone, '');
    assert.ok(!row.email.includes(victim.email.split('@')[0]!), 'the old address is still readable');
    assert.ok(row.auth_id.startsWith('erased-'), 'the identity could still sign in');
  });

  it('the ledger records who did it, and cannot be edited afterwards', async () => {
    const [entry] = await sql<{ actor_user_id: string; reason: string; after: unknown }[]>`
      SELECT actor_user_id, reason, after FROM audit_log
       WHERE action = 'user.erase' AND target_id = ${victim.userId}
       ORDER BY created_at DESC LIMIT 1`;
    assert.ok(entry, 'an erasure with no audit row is an erasure nobody can account for');
    assert.equal(entry.actor_user_id, admin.userId);
    assert.match(entry.reason, /DPDP erasure request/);

    // The append-only guarantee, exercised rather than assumed.
    await assert.rejects(
      () => sql`UPDATE audit_log SET reason = 'rewritten' WHERE target_id = ${victim.userId}`,
      'audit_log accepted an UPDATE — the append-only guarantee is gone',
    );
  });

  it('the request cannot be executed twice', async () => {
    const [req] = await sql<{ id: string }[]>`
      SELECT id FROM data_requests WHERE user_id = ${victim.userId}::uuid AND kind = 'erasure'`;
    const res = await app.request(`/admin/data-requests/${req!.id}/erase`, {
      method: 'POST',
      headers: { ...auth(admin.token), ...json },
      body: JSON.stringify({ reason: 'again' }),
    });
    assert.equal(res.status, 409);
  });
});
