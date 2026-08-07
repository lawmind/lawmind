/**
 * PD-2, and the two things authentication must never quietly become.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PD-2 — A REJECTED ENROLMENT HAS FULL ACCESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `sprints/SPRINT_5.md` requires this **as a test, because a comment is not
 * enforcement**. The rule is easy to state and easy to invert by accident: a
 * well-meaning "verified advocates only" change reads like a safety improvement
 * and is the single most likely way this gets broken.
 *
 * The product reason it must not be: enrolment verification is manual, and a Bar
 * Council roll carries stale contact details. An advocate whose enrolment we
 * could not match is still an advocate — locking them out means the person who
 * paid us is blocked by our own back-office queue, and they will not wait.
 *
 * The test is written as a **source-level assertion as well as a behavioural
 * one**, because the guarantee is an ABSENCE — no code path branches on
 * `enrolment_status` — and absences rot silently. That has already happened twice
 * in this repository in one week.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import {
  issueTokens,
  revokeAllRefreshTokens,
  rotateRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';
import { CURRENT_TERMS_VERSION } from './account.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';

/** A signed-in advocate, at whatever enrolment status the caller names. */
async function seedAdvocate(enrolment: 'unverified' | 'verified' | 'rejected') {
  const authId = `test-auth-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`
    INSERT INTO auth_user (id, name, email, email_verified)
    VALUES (${authId}, 'Test Advocate', ${email}, true)
  `;
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, bar_enrolment_number, enrolment_status)
    VALUES (${authId}, 'Test Advocate', '+911234567890', ${email}, 'D/1234/2019', ${enrolment})
    RETURNING id
  `;
  const token = await signAccessToken({ sub: authId, email }, SECRET);
  return { authId, email, token, userId: user!.id };
}

describe('PD-2 — enrolment never gates', () => {
  const app = createApp({
    ping: async () => {},
    search: { sql, embedQuery: async () => null },
    auth: {
      // The endpoints under test here do not reach better-auth: they read the
      // bearer token and the database. Constructing a real instance would drag a
      // mail transport into a unit test for no added coverage.
      auth: null as never,
      sql,
      secret: SECRET,
    },
  });

  after(async () => {
    await sql`DELETE FROM users WHERE auth_id LIKE 'test-auth-%'`;
    await sql`DELETE FROM auth_user WHERE id LIKE 'test-auth-%'`;
    await sql.end();
  });

  it('gives a REJECTED enrolment exactly the access a verified one has', async () => {
    const rejected = await seedAdvocate('rejected');
    const verified = await seedAdvocate('verified');

    const call = (token: string) =>
      app.request('/me', { headers: { authorization: `Bearer ${token}` } });

    const [a, b] = await Promise.all([call(rejected.token), call(verified.token)]);

    assert.equal(a.status, 200, 'a rejected enrolment must not be refused');
    assert.equal(b.status, a.status, 'the two statuses must be identical');

    const rejectedBody = (await a.json()) as {
      data: { user: { profileComplete: boolean; profile: { enrolmentStatus: string } } };
    };
    // Reported, so the client can show "verification pending" as a credential
    // note — and gating nothing.
    assert.equal(rejectedBody.data.user.profile.enrolmentStatus, 'rejected');
    assert.equal(rejectedBody.data.user.profileComplete, true);
  });

  it('lets a REJECTED enrolment reach every user-scoped surface', async () => {
    const rejected = await seedAdvocate('rejected');
    const headers = { authorization: `Bearer ${rejected.token}` };

    // Saved searches and annotations both 401 for an anonymous caller, so a 200
    // here is a real access assertion rather than an endpoint that ignores auth.
    const saved = await app.request('/saved-searches', { headers });
    assert.equal(saved.status, 200, 'a rejected enrolment must reach saved searches');

    const anonymous = await app.request('/saved-searches');
    assert.equal(anonymous.status, 401, 'the same route must refuse an anonymous caller');
  });

  it('branches on enrolment_status nowhere in the service', () => {
    // The behavioural tests above prove today's paths. This proves nobody added
    // a new one — the guarantee is an absence, and an absence needs an assertion.
    const root = fileURLToPath(new URL('../', import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = `${dir}/${entry}`;
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    const offenders: string[] = [];
    for (const file of walk(root)) {
      if (!file.endsWith('.ts')) continue;
      const rel = file.slice(root.length).replace(/\\/g, '/').replace(/^\/+/, '');
      if (rel === 'auth/auth.test.ts') continue;
      for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
        // Reading the column to REPORT it is fine and is what `profileFor` does.
        // Comparing it is the thing PD-2 forbids.
        if (
          /enrolment_status\s*(===|!==|==|!=|=\s*')/.test(line) ||
          /enrolmentStatus\s*(===|!==)/.test(line)
        ) {
          offenders.push(`${rel}:${i + 1}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these compare enrolment_status, which PD-2 forbids: ${offenders.join(', ')}. ` +
        'Enrolment is captured and displayed. It never decides access.',
    );
  });
});

describe('access tokens', () => {
  it('round-trips a signed token', async () => {
    const token = await signAccessToken({ sub: 'u1', email: 'a@b.test' }, SECRET);
    const claims = await verifyAccessToken(token, SECRET);
    assert.equal(claims?.sub, 'u1');
    assert.equal(claims?.email, 'a@b.test');
  });

  it('returns null for a token signed with a different secret', async () => {
    const token = await signAccessToken({ sub: 'u1', email: 'a@b.test' }, SECRET);
    assert.equal(await verifyAccessToken(token, `${SECRET}-different`), null);
  });

  it('returns null rather than saying why', async () => {
    // Every failure looks the same to the caller. Telling an unauthenticated
    // client whether a token was expired or forged helps an attacker more than
    // it helps the client, whose next action is identical either way.
    for (const bad of ['', 'not.a.token', 'a.b.c']) {
      assert.equal(await verifyAccessToken(bad, SECRET), null);
    }
  });
});

/**
 * The refresh lifecycle, against a real database.
 *
 * **This suite existed and did not catch a 500 on production.** `issueTokens`
 * passed a `Date` straight into a postgres template and the driver refused to
 * bind it — `TypeError: The "string" argument must be ... Received an instance of
 * Date`. Typecheck was green, the PD-2 tests were green, and the first real
 * sign-in returned INTERNAL.
 *
 * The gap was that nothing exercised the token path against Postgres: every test
 * above either signs a JWT in memory or reads rows somebody else wrote. **A
 * database call that is never made in a test is a database call that is verified
 * only by an advocate**, and this one would have been verified by the first one
 * to try to sign in.
 */
describe('refresh tokens — round trip', () => {
  const sqlLocal = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

  after(async () => {
    await sqlLocal`DELETE FROM refresh_tokens WHERE user_id LIKE 'test-rt-%'`;
    await sqlLocal`DELETE FROM auth_user WHERE id LIKE 'test-rt-%'`;
    await sqlLocal.end();
  });

  async function seedIdentity() {
    const id = `test-rt-${crypto.randomUUID()}`;
    await sqlLocal`
      INSERT INTO auth_user (id, name, email, email_verified)
      VALUES (${id}, 'RT', ${`${id}@example.test`}, true)`;
    return { id, email: `${id}@example.test` };
  }

  it('writes a token pair to the database', async () => {
    const user = await seedIdentity();
    const pair = await issueTokens(sqlLocal, user, SECRET);
    assert.ok(pair.accessToken.length > 0);
    assert.ok(pair.refreshToken.length > 0);

    const [row] = await sqlLocal<{ token_hash: string }[]>`
      SELECT token_hash FROM refresh_tokens WHERE user_id = ${user.id}`;
    assert.ok(row, 'the refresh token must be persisted');
    // Stored as a hash, never as the token. A readable table is a table whose
    // leak is a working login for everyone in it.
    assert.notEqual(row.token_hash, pair.refreshToken);
  });

  it('rotates, and refuses the same token a second time', async () => {
    const user = await seedIdentity();
    const first = await issueTokens(sqlLocal, user, SECRET);

    const rotated = await rotateRefreshToken(sqlLocal, first.refreshToken, SECRET);
    assert.equal(rotated.ok, true);
    if (!rotated.ok) return;
    assert.notEqual(
      rotated.tokens.refreshToken,
      first.refreshToken,
      'rotation must issue a new one',
    );

    // Replay. The whole family goes — the attacker's copy and the real client's
    // copy are indistinguishable from here.
    const replayed = await rotateRefreshToken(sqlLocal, first.refreshToken, SECRET);
    assert.equal(replayed.ok, false);
    if (replayed.ok) return;
    assert.equal(replayed.reason, 'reused');

    const successorAfterReplay = await rotateRefreshToken(
      sqlLocal,
      rotated.tokens.refreshToken,
      SECRET,
    );
    assert.equal(
      successorAfterReplay.ok,
      false,
      'a replay must revoke the successor too, not only the token that was replayed',
    );
  });

  it('refuses an unknown token', async () => {
    const outcome = await rotateRefreshToken(sqlLocal, 'never-issued', SECRET);
    assert.equal(outcome.ok, false);
  });

  it('refuses an EXPIRED token', async () => {
    // The branch that shipped broken. The first version compared
    // `row.expires_at.getTime()` against the clock, which assumes the driver
    // returns a Date — it does not always, and production answered
    // "row.expires_at.getTime is not a function" on the first real refresh.
    //
    // Nothing exercised this path, because every other test used a token that
    // was still live and therefore never reached the comparison. An untaken
    // branch is an unverified branch.
    const user = await seedIdentity();
    const pair = await issueTokens(sqlLocal, user, SECRET);
    await sqlLocal`
      UPDATE refresh_tokens SET expires_at = now() - interval '1 day'
      WHERE user_id = ${user.id}`;

    const outcome = await rotateRefreshToken(sqlLocal, pair.refreshToken, SECRET);
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.reason, 'expired', 'an expired token is expired, not unknown');
  });

  it('revokes every live token on logout', async () => {
    const user = await seedIdentity();
    await issueTokens(sqlLocal, user, SECRET);
    await issueTokens(sqlLocal, user, SECRET);

    const revoked = await revokeAllRefreshTokens(sqlLocal, user.id);
    assert.equal(revoked, 2, '"log me out" on a lost phone must mean every session');

    const [live] = await sqlLocal<{ n: number }[]>`
      SELECT count(*)::int AS n FROM refresh_tokens
      WHERE user_id = ${user.id} AND revoked_at IS NULL`;
    assert.equal(live?.n, 0);
  });
});

describe('PD-8 — consent is recorded, never inferred', () => {
  it('publishes a version alongside the text', async () => {
    const app = createApp({
      ping: async () => {},
      auth: { auth: null as never, sql, secret: SECRET },
    });
    const res = await app.request('/terms/current');
    assert.equal(res.status, 200);
    const { data } = (await res.json()) as { data: { version: string; body: string } };
    assert.equal(data.version, CURRENT_TERMS_VERSION);
    assert.ok(data.body.length > 0, 'terms with no text cannot be meaningfully accepted');
    // The duty that makes the whole product defensible has to be IN the text the
    // advocate accepts, not only in our documentation about it.
    assert.match(data.body, /verify/i);
  });
});
