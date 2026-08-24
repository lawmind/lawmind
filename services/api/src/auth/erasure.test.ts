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

import { issueTokens, rotateRefreshToken, signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';
import { eraseUser } from './erasure.ts';

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

/**
 * Everything a signed-in advocate actually holds, created the way the real
 * sign-in path creates it.
 *
 * `issueTokens` is the production minting function, not a hand-built row: the
 * refresh token is opaque and stored only as a SHA-256 hash, so a test that
 * INSERTed its own would be exercising a shape the product never produces.
 */
async function signIn(authId: string, email: string) {
  const pair = await issueTokens(sql, { id: authId, email }, SECRET);
  await sql`INSERT INTO auth_session (id, expires_at, token, user_id)
            VALUES (${`sess-${crypto.randomUUID()}`}, now() + interval '30 days',
                    ${`tok-${crypto.randomUUID()}`}, ${authId})`;
  await sql`INSERT INTO auth_account (id, account_id, provider_id, user_id)
            VALUES (${`acct-${crypto.randomUUID()}`}, ${email}, 'magic-link', ${authId})`;
  return pair;
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

  /**
   * ---------------------------------------------------------------------------
   * LCC-2 - ERASURE MUST END THE IDENTITY, NOT ONLY THE CONTENT
   * ---------------------------------------------------------------------------
   *
   * The suite above proved the product rows go and the profile is anonymised.
   * It never asked whether the advocate could still SIGN IN, and they could:
   *
   *   * `refresh_tokens` was not touched at all. It keys on `auth_user.id`, not
   *     on `users.id`, so nothing in an erasure that walks `users` reaches it.
   *   * `auth_user` was not touched, so `rotateRefreshToken`'s existence check
   *     passed and minted a NEW access token for the original email - after
   *     erasure, indefinitely, on a 30-day sliding window.
   *   * the `auth_session` delete could not match: it resolved the auth id via
   *     `(SELECT auth_id FROM users ...)` in a statement that ran AFTER the same
   *     transaction had rewritten that column to `erased-<uuid>`. It deleted
   *     zero rows every time and reported `0` as though there had been none.
   *
   * "Account deletion" returning 200 is not the property. These are.
   */
  it('a refresh token minted before erasure cannot be rotated after it', async () => {
    const doomed = await seed('token-victim');
    const pair = await signIn(doomed.authId, doomed.email);

    // Precondition: it works BEFORE erasure. Without this the test could pass
    // because the token was never valid in the first place.
    const before = await rotateRefreshToken(sql, pair.refreshToken, SECRET);
    assert.equal(before.ok, true, 'precondition: the refresh token must work before erasure');
    const live = before.ok ? before.tokens.refreshToken : '';

    await eraseUser(sql, doomed.userId, { userId: admin.userId, role: 'admin' }, 'lcc-2 assertion');

    const rotated = await rotateRefreshToken(sql, live, SECRET);
    assert.equal(
      rotated.ok,
      false,
      'a pre-erasure refresh token still rotated - the account is deleted and still signs in',
    );

    const [rows] = await sql<{ live: string; total: string }[]>`
      SELECT count(*) FILTER (WHERE revoked_at IS NULL)::text AS live,
             count(*)::text AS total
        FROM refresh_tokens WHERE user_id = ${doomed.authId}`;
    assert.equal(rows!.live, '0', 'a live refresh token survived erasure');
  });

  it('destroys the better-auth identity, its sessions and its provider rows', async () => {
    const doomed = await seed('identity-victim');
    await signIn(doomed.authId, doomed.email);

    const [pre] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM auth_session WHERE user_id = ${doomed.authId}`;
    assert.equal(pre!.n, '1', 'precondition: there is a session to destroy');

    const result = await eraseUser(
      sql,
      doomed.userId,
      { userId: admin.userId, role: 'admin' },
      'lcc-2 assertion',
    );

    // Counted honestly. The old code reported auth_session: 0 for a user who
    // had one, which is worse than reporting nothing at all.
    assert.equal(result.deleted['auth_session'], 1);

    const [post] = await sql<{ sessions: string; accounts: string; identity: string }[]>`
      SELECT (SELECT count(*) FROM auth_session WHERE user_id = ${doomed.authId})::text AS sessions,
             (SELECT count(*) FROM auth_account WHERE user_id = ${doomed.authId})::text AS accounts,
             (SELECT count(*) FROM auth_user    WHERE id      = ${doomed.authId})::text AS identity`;
    assert.equal(post!.sessions, '0');
    assert.equal(post!.accounts, '0');
    assert.equal(post!.identity, '0', 'auth_user retained the real name and email');
  });

  it('a pending magic link cannot be redeemed into the erased account', async () => {
    const doomed = await seed('link-victim');
    await sql`INSERT INTO auth_verification (id, identifier, value, expires_at)
              VALUES (${`ver-${crypto.randomUUID()}`}, ${doomed.email},
                      ${`value-${crypto.randomUUID()}`}, now() + interval '10 minutes')`;

    await eraseUser(sql, doomed.userId, { userId: admin.userId, role: 'admin' }, 'lcc-2 assertion');

    const [row] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM auth_verification WHERE identifier = ${doomed.email}`;
    assert.equal(
      row!.n,
      '0',
      'a magic link already sitting in the inbox outlived the account it opens',
    );
  });

  it('an access token that has not yet expired cannot recover the identity', async () => {
    const doomed = await seed('me-victim');
    await signIn(doomed.authId, doomed.email);
    await eraseUser(sql, doomed.userId, { userId: admin.userId, role: 'admin' }, 'lcc-2 assertion');

    /**
     * A signed JWT cannot be un-signed, so this one stays cryptographically
     * valid until it expires. What must NOT survive is the identity behind it:
     * no profile, and nothing that lets the bearer act as the advocate.
     *
     * Asserted on the RESPONSE rather than on the token, because the token's
     * validity is not the product's promise - what it can reach is.
     */
    const res = await app.request('/me', { headers: auth(doomed.token) });
    const body = (await res.json()) as {
      data?: { user: { profileComplete: boolean; profile: unknown } };
    };
    assert.equal(body.data?.user.profileComplete, false, 'the erased profile was recovered');
    assert.equal(body.data?.user.profile, null);
  });

  it('revokes a share this advocate granted on a matter, in both directions', async () => {
    const doomed = await seed('share-victim');
    const colleague = await seed('share-colleague');

    const [m] = await sql<{ id: string }[]>`
      INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                           our_side, status, source)
      VALUES (${doomed.userId}::uuid, 'Shared v State', 'Delhi High Court', 'criminal',
              '{}'::jsonb, 'Client', 'petitioner', 'active', 'manual')
      RETURNING id`;
    // Granted OUTWARD: another advocate's live access to this caseload.
    await sql`INSERT INTO matter_shares (matter_id, granted_by_user_id, invited_identifier,
                                         invited_user_id)
              VALUES (${m!.id}::uuid, ${doomed.userId}::uuid, ${colleague.email},
                      ${colleague.userId}::uuid)`;

    const [other] = await sql<{ id: string }[]>`
      INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                           our_side, status, source)
      VALUES (${colleague.userId}::uuid, 'Other v State', 'Delhi High Court', 'criminal',
              '{}'::jsonb, 'Client', 'petitioner', 'active', 'manual')
      RETURNING id`;
    /**
     * Granted INWARD: an invitation this advocate RECEIVED, which sits on
     * somebody else's matter. Deleting the victim's matters cascades the first
     * share and never touches this one, so the two directions are separate
     * facts and both are asserted.
     */
    await sql`INSERT INTO matter_shares (matter_id, granted_by_user_id, invited_identifier,
                                         invited_user_id)
              VALUES (${other!.id}::uuid, ${colleague.userId}::uuid, ${doomed.email},
                      ${doomed.userId}::uuid)`;

    await eraseUser(sql, doomed.userId, { userId: admin.userId, role: 'admin' }, 'lcc-2 assertion');

    const [n] = await sql<{ granted: string; received: string }[]>`
      SELECT (SELECT count(*) FROM matter_shares
               WHERE granted_by_user_id = ${doomed.userId}::uuid)::text AS granted,
             (SELECT count(*) FROM matter_shares
               WHERE invited_user_id = ${doomed.userId}::uuid)::text AS received`;
    assert.equal(n!.granted, '0', 'a colleague still has access to the erased caseload');
    assert.equal(n!.received, '0', 'an invitation on another advocate’s matter survived');

    await sql`DELETE FROM matters WHERE user_id = ${colleague.userId}::uuid`;
  });

  it('hands back the data-export artefact key, not only document keys', async () => {
    const doomed = await seed('artefact-victim');
    const key = `exports/${crypto.randomUUID()}.zip`;
    await sql`INSERT INTO data_requests (user_id, kind, status, due_at, artefact_storage_key)
              VALUES (${doomed.userId}::uuid, 'export', 'completed',
                      now() + interval '30 days', ${key})`;

    const result = await eraseUser(
      sql,
      doomed.userId,
      { userId: admin.userId, role: 'admin' },
      'lcc-2 assertion',
    );

    /**
     * The export is a single R2 object containing everything we held about this
     * advocate. `data_requests` rows survive erasure by design — they are the
     * record that it was asked for and carried out — so if the key is not
     * returned here the object is fetchable forever and nothing says so.
     */
    assert.ok(
      result.erasedStorageKeys.includes(key),
      'the data-export artefact outlived the erasure and nothing reported it',
    );

    await sql`DELETE FROM data_requests WHERE user_id = ${doomed.userId}::uuid`;
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
