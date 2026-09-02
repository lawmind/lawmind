/**
 * `identity_only` account deletion — NEW3 R21 section 4, SR-1 to SR-6.
 *
 * The defect RCC reported at bus 1722: an advocate who verified an email and
 * never finished onboarding could create an account but could not ask to have it
 * deleted. `POST /me/data-requests` resolved the caller to a `users.id` and
 * answered `401 AUTH_REQUIRED` when there was none.
 *
 * -----------------------------------------------------------------------------
 * WHAT WOULD MAKE THIS SUITE WORTHLESS
 * -----------------------------------------------------------------------------
 *
 * Asserting the 200 and not the ROW. A create that returns success while writing
 * two durable requests, or none, prints exactly the same JSON. Every assertion
 * here counts `data_requests` rows for the principal.
 *
 * The R16 retry test is the one that matters most, and it is written to fail
 * against the tempting wrong fix. Making `user_id` nullable and leaving the
 * unique index alone LOOKS correct and passes any test that only checks the
 * response: NULLs are distinct in a unique index, so every retry inserts a new
 * row, no constraint complains, and the API still answers 200 with a request
 * object. Counting rows is what tells the two apart.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from './app.ts';
import { IDEMPOTENCY_HEADER } from './idempotency.ts';
import { eraseIdentityOnly } from './auth/erasure.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 6, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';

const app = createApp({
  ping: async () => {},
  auth: { auth: null as never, sql, secret: SECRET },
});

/** Distinctive, so anything this suite creates is identifiable if it escapes. */
const TAG = 'test-identity-only';

type Principal = { authId: string; email: string; token: string; userId: string | null };

/**
 * An `identity_only` account: a verified `auth_user`, a session carrying an IP
 * address and a user-agent, a magic-link artifact keyed by the EMAIL, and
 * deliberately NO `users` row.
 *
 * The session and verification rows are seeded rather than assumed because the
 * point of the round is that this population is NOT "an account with nothing to
 * erase" - it holds an email address, an IP address and a device fingerprint.
 */
async function seedIdentityOnly(label: string): Promise<Principal> {
  const authId = `${TAG}-${label}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Unonboarded', ${email}, true)`;
  await sql`INSERT INTO auth_session (id, user_id, token, expires_at, ip_address, user_agent)
            VALUES (${`${authId}-s`}, ${authId}, ${`${authId}-tok`},
                    now() + interval '1 day', '203.0.113.9', 'LawmindTest/1.0')`;
  await sql`INSERT INTO auth_verification (id, identifier, value, expires_at)
            VALUES (${`${authId}-v`}, ${email}, 'magic', now() + interval '1 day')`;
  return {
    authId,
    email,
    userId: null,
    token: await signAccessToken({ sub: authId, email }, SECRET),
  };
}

/** The same identity, with onboarding completed. */
async function giveProfile(p: Principal): Promise<string> {
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
    VALUES (${p.authId}, 'Onboarded', '+911111111111', ${p.email}, 'unverified')
    RETURNING id`;
  p.userId = u!.id;
  return u!.id;
}

const headers = (token?: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
  ...(key === undefined ? {} : { [IDEMPOTENCY_HEADER]: key }),
});

const askErasure = (token?: string, key?: string) =>
  app.request('/me/data-requests', {
    method: 'POST',
    headers: headers(token, key),
    body: JSON.stringify({ kind: 'erasure' }),
  });

const newKey = () => `k-${crypto.randomUUID()}`;

async function requestRows(authId: string): Promise<{ id: string; user_id: string | null }[]> {
  return sql<{ id: string; user_id: string | null }[]>`
    SELECT id, user_id FROM data_requests WHERE auth_id = ${authId} ORDER BY created_at`;
}

/**
 * THE ONE ROW THIS SUITE CANNOT AND MUST NOT CLEAN UP.
 *
 * `eraseIdentityOnly` writes `audit_log`, and `audit_log` REFUSES DELETE at the
 * database — `audit_log_append_only()` raises 23001, and that refusal is the
 * feature: an erasure that could erase its own record of having happened is not
 * an audit log. `audit_log.actor_user_id` is then a plain foreign key with no
 * ON DELETE action, so the actor's `users` row cannot go either.
 *
 * A random actor per run would therefore leak one `users` row and one audit row
 * EVERY run, for ever. A FIXED auth id leaks one, once — and it is also the
 * truthful shape, because in production the actor is a standing admin, not a
 * fresh account minted for each erasure.
 */
const ACTOR_AUTH_ID = `${TAG}-standing-admin`;

async function standingActor(): Promise<string> {
  const email = `${ACTOR_AUTH_ID}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${ACTOR_AUTH_ID}, 'Admin', ${email}, true)
            ON CONFLICT (id) DO NOTHING`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
    VALUES (${ACTOR_AUTH_ID}, 'Admin', '+911111111112', ${email}, 'unverified')
    ON CONFLICT (auth_id) DO UPDATE SET full_name = excluded.full_name
    RETURNING id`;
  return u!.id;
}

async function cleanup(): Promise<void> {
  await sql`DELETE FROM api_idempotency_records WHERE auth_id LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM data_requests WHERE auth_id LIKE ${`${TAG}-%`}`;
  /**
   * Everything this suite made EXCEPT anything `audit_log` points at. The
   * standing actor above is the only such row, and leaving it is deliberate —
   * see the note there. `NOT EXISTS` rather than a name match, so a future test
   * that writes audit as somebody else is protected too.
   */
  await sql`
    DELETE FROM users u
     WHERE u.auth_id LIKE ${`${TAG}-%`}
       AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.actor_user_id = u.id)`;
  await sql`DELETE FROM auth_verification WHERE identifier LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM auth_session WHERE user_id LIKE ${`${TAG}-%`}`;
  await sql`
    DELETE FROM auth_user au
     WHERE au.id LIKE ${`${TAG}-%`}
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.auth_id = au.id)`;
}

/**
 * 0103 is what makes any of this representable. Without it the suite would fail
 * for a reason that has nothing to do with the behaviour under test.
 */
async function skipUnlessMigrated(t: { skip: (m: string) => void }): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'data_requests' AND column_name = 'auth_id'`;
  if (!row?.n) {
    t.skip('0103 has not been applied to this database');
    return false;
  }
  return true;
}

before(cleanup);
after(async () => {
  await cleanup();
  await sql.end();
});

describe('identity_only account deletion', () => {
  it('SR-1 - an authenticated account with no profile can initiate erasure', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const p = await seedIdentityOnly('sr1');

    const res = await askErasure(p.token);
    assert.equal(res.status, 201, 'an identity_only advocate must be able to ask');

    const rows = await requestRows(p.authId);
    assert.equal(rows.length, 1, 'exactly one durable request');
    assert.equal(rows[0]!.user_id, null, 'and NO profile was created to hold it');

    const [profiles] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM users WHERE auth_id = ${p.authId}`;
    assert.equal(profiles!.n, 0, 'PROFILE_CREATION_REQUIRED must be NO, including silently');
  });

  it('needs no onboarding and asks for no new personal information', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const p = await seedIdentityOnly('nobody');
    // The body carries `kind` and nothing else. A backend that demanded a name
    // or a phone number as the price of deletion would reject this.
    const res = await askErasure(p.token);
    assert.equal(res.status, 201);
    const body = (await res.json()) as { data: { request: { kind: string; dueAt: string } } };
    assert.equal(body.data.request.kind, 'erasure');
    assert.ok(body.data.request.dueAt, 'the 30-day clock applies to this population too');
  });

  it('SR-3 - the same R16 key retried is the same logical request, not a second one', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const p = await seedIdentityOnly('r16-retry');
    const key = newKey();

    const first = await askErasure(p.token, key);
    const second = await askErasure(p.token, key);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201, 'a replay returns the original status');

    const a = (await first.json()) as { data: { request: { id: string } } };
    const b = (await second.json()) as { data: { request: { id: string } } };
    assert.equal(b.data.request.id, a.data.request.id, 'the original resource id');

    // THE ASSERTION THAT CATCHES THE NULL-SCOPE BYPASS. A nullable scope column
    // would let both inserts through and still print the JSON above.
    const rows = await requestRows(p.authId);
    assert.equal(rows.length, 1, 'one durable request, not two');

    const [ledger] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM api_idempotency_records WHERE auth_id = ${p.authId}`;
    assert.equal(ledger!.n, 1, 'and exactly ONE ledger row - R16 was not bypassed');
  });

  it('a DIFFERENT key is still one open request per kind - SR-6', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const p = await seedIdentityOnly('sr6');

    const first = await askErasure(p.token, newKey());
    const second = await askErasure(p.token, newKey());
    assert.equal(first.status, 201);
    assert.equal(second.status, 200, 'the already-open request is returned, not created again');

    const body = (await second.json()) as { data: { alreadyOpen: boolean } };
    assert.equal(body.data.alreadyOpen, true);
    assert.equal((await requestRows(p.authId)).length, 1, 'still one clock');

    // Two intentional requests DID happen, so two ledger rows are correct: the
    // second is a recorded refusal-to-duplicate, not a lost write.
    const [ledger] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM api_idempotency_records WHERE auth_id = ${p.authId}`;
    assert.equal(ledger!.n, 2);
  });
});

describe('identity_only deletion - isolation, survival and the erasure itself', () => {
  it('two different auth principals are isolated from each other', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const a = await seedIdentityOnly('iso-a');
    const b = await seedIdentityOnly('iso-b');
    // The SAME key value, from two different identities. It must not collide.
    const key = newKey();

    assert.equal((await askErasure(a.token, key)).status, 201);
    assert.equal((await askErasure(b.token, key)).status, 201);

    const ra = await requestRows(a.authId);
    const rb = await requestRows(b.authId);
    assert.equal(ra.length, 1);
    assert.equal(rb.length, 1);
    assert.notEqual(ra[0]!.id, rb[0]!.id, 'one advocate must not replay another request');
  });

  it('an unauthenticated caller is still refused', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const res = await askErasure(undefined);
    assert.equal(res.status, 401, 'AUTH_REQUIRED stays correct for no identity at all');
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'AUTH_REQUIRED');
  });

  it('SR-4 - the request survives the same identity later completing onboarding', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const p = await seedIdentityOnly('sr4');
    assert.equal((await askErasure(p.token)).status, 201);
    const before = await requestRows(p.authId);
    assert.equal(before.length, 1);
    assert.equal(before[0]!.user_id, null);

    // Onboarding happens AFTER the erasure was asked for.
    const userId = await giveProfile(p);

    const after = await requestRows(p.authId);
    assert.equal(after.length, 1, 'still exactly one request');
    assert.equal(after[0]!.id, before[0]!.id, 'and it is the SAME request');

    // Asking again now that a profile exists must not open a second clock: the
    // guard is scoped to the identity, which did not change.
    const again = await askErasure(p.token);
    assert.equal(again.status, 200);
    assert.equal((await requestRows(p.authId)).length, 1);

    // ERASURE_WORKER_PRINCIPAL_RESOLUTION: the executor resolves the profile
    // from the auth id at execution time, so this request now covers both
    // layers even though it was stored with a NULL user_id.
    const [resolved] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE auth_id = ${p.authId}`;
    assert.equal(resolved!.id, userId, 'the profile is reachable from the stored principal');
  });
});

describe('identity_only erasure execution', () => {
  it('the identity layer is what eraseIdentityOnly destroys', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const p = await seedIdentityOnly('erase');
    await askErasure(p.token, newKey());
    const actorUserId = await standingActor();

    const result = await eraseIdentityOnly(
      sql,
      p.authId,
      { userId: actorUserId, role: 'admin' },
      'test',
    );

    // Counted, not cascaded: a cascade reports nothing, and an erasure whose own
    // result cannot show what it terminated is one nobody can audit.
    assert.equal(result.deleted['auth_user'], 1);
    assert.equal(result.deleted['auth_session'], 1, 'the IP address and user-agent are gone');
    assert.equal(
      result.deleted['auth_verification'],
      1,
      'the magic link is keyed by EMAIL and cascades from nothing',
    );
    assert.equal(result.deleted['api_idempotency_records'], 1);

    for (const [table, column] of [
      ['auth_user', 'id'],
      ['auth_session', 'user_id'],
      ['refresh_tokens', 'user_id'],
    ] as const) {
      const [row] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ${sql.unsafe(table)}
         WHERE ${sql.unsafe(column)} = ${p.authId}`;
      assert.equal(row!.n, 0, `${table} still holds a row for the erased identity`);
    }

    // The request itself SURVIVES. It is the record that the erasure was asked
    // for and carried out, and it is the one row that must outlive the identity.
    assert.equal((await requestRows(p.authId)).length, 1);
  });

  it('erasing an already-absent identity is zero counts, not a throw', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const actorUserId = await standingActor();
    const result = await eraseIdentityOnly(
      sql,
      `${TAG}-never-existed`,
      { userId: actorUserId, role: 'admin' },
      'test',
    );
    assert.equal(result.deleted['auth_user'], 0, 'a stuck request is worse than a zero');
  });

  it('profile-backed erasure initiation is unchanged', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const p = await seedIdentityOnly('profiled');
    const userId = await giveProfile(p);

    const res = await askErasure(p.token, newKey());
    assert.equal(res.status, 201);

    const rows = await requestRows(p.authId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.user_id, userId, 'a profiled caller still records the profile');

    const [ledger] = await sql<{ n: number; user_id: string | null }[]>`
      SELECT count(*)::int AS n, max(user_id::text) AS user_id
        FROM api_idempotency_records WHERE auth_id = ${p.authId}`;
    assert.equal(ledger!.n, 1);
    assert.equal(ledger!.user_id, userId, 'and the ledger still carries it for the admin surface');
  });
});
