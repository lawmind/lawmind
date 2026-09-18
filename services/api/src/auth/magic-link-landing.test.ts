/**
 * THE SIGN-IN LINK, END TO END — the row that was false on the deployed alpha.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WOULD HAVE FAILED HERE, AND DID NOT EXIST TO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * On 17 Sep 2026 a real advocate's phone opened a real sign-in email from the
 * DigitalOcean alpha and got our own 404: better-auth minted
 * `/api/auth/magic-link/verify` against `AUTH_BASE_URL` and the API served no
 * such route (`docs/ai/rcc-r31/ROUND.md`). Every unit test passed. The suite had
 * plenty of coverage of `POST /auth/verify` and none at all of the question that
 * mattered — **does the URL we put in the email reach anything we serve?**
 *
 * So the first test below asks exactly that, of the URL the MAILER was handed,
 * not of a path anyone typed into a test. Against the R32B topology it fails
 * with 404; that is the point of it.
 *
 * The rest walk the whole lifecycle on a real database, because the failure was
 * a JOIN between two correct halves and only the join could see it:
 *
 *   POST /auth/magic-link  →  the emailed URL  →  GET the landing route  →
 *   the deep link the app registers  →  POST /auth/verify  →  a session that
 *   can call an authenticated route.
 *
 * Requires `DATABASE_URL`, as its neighbours in this directory do.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import {
  MAGIC_LINK_APP_URL,
  MAGIC_LINK_LANDING_PATH,
  createAuth,
  magicLinkLandingUrl,
  type Mailer,
} from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
/** Deliberately a bare origin, which is the shape the alpha actually runs. */
const BASE_URL = 'https://alpha-api.lawmind.test';
/** Every row this file creates carries it, so cleanup is exact. */
const MARK = 'lcc-r33';

/** Captures what would have been emailed. Nothing leaves the process. */
let emailed: string | null = null;
const capturingMailer: Mailer = {
  name: 'test (captures, sends nothing)',
  async send(email) {
    emailed = email.url;
  },
};

const auth = createAuth({ sql, secret: SECRET, baseUrl: BASE_URL, mailer: capturingMailer });
const app = createApp({
  ping: async () => {},
  auth: { auth, sql, secret: SECRET },
});

/** Ask for a link as the app does, and return the URL that would be emailed. */
async function requestLink(email: string): Promise<string> {
  emailed = null;
  const res = await app.request('/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL },
    body: JSON.stringify({ email }),
  });
  assert.equal(res.status, 200, await res.text());
  assert.ok(emailed, 'a link was reported sent but the mailer was never called');
  return emailed;
}

/** The token as the APP receives it — out of the redirect, never out of the DB. */
function tokenFromDeepLink(location: string): string {
  const parsed = new URL(location.replace('lawmind://', 'https://'));
  const token = parsed.searchParams.get('token');
  assert.ok(token, 'the deep link carried no token');
  return token;
}

function freshAddress(): string {
  return `${MARK}-${crypto.randomUUID()}@lawmind.test`;
}

describe('the emailed sign-in link', () => {
  after(async () => {
    await sql`DELETE FROM refresh_tokens WHERE user_id IN (
                SELECT id FROM auth_user WHERE email LIKE ${`${MARK}-%`})`;
    await sql`DELETE FROM auth_session WHERE user_id IN (
                SELECT id FROM auth_user WHERE email LIKE ${`${MARK}-%`})`;
    await sql`DELETE FROM auth_account WHERE user_id IN (
                SELECT id FROM auth_user WHERE email LIKE ${`${MARK}-%`})`;
    await sql`DELETE FROM auth_verification WHERE value LIKE ${`%${MARK}-%`}`;
    await sql`DELETE FROM auth_user WHERE email LIKE ${`${MARK}-%`}`;
    await sql.end();
  });

  /**
   * THE ONE THAT WOULD HAVE CAUGHT R32B. It asserts against the URL the mailer
   * was handed, so it cannot be satisfied by a path that only a test knows.
   */
  it('points at a path this API actually serves', async () => {
    const url = new URL(await requestLink(freshAddress()));

    assert.equal(url.origin, BASE_URL, 'the link must be on this deployment');
    assert.equal(
      MAGIC_LINK_LANDING_PATH,
      '/auth/magic-link/open',
      'app.ts writes this path out as a literal so the contract guard can read it — ' +
        'change one and you must change both',
    );
    assert.equal(
      url.pathname,
      MAGIC_LINK_LANDING_PATH,
      'the emailed path and the mounted path are one constant',
    );
    assert.notEqual(
      url.pathname,
      '/api/auth/magic-link/verify',
      "better-auth's own handler path is NOT what we email — it would consume the token",
    );

    const res = await app.request(url.pathname + url.search);
    assert.notEqual(res.status, 404, 'this is the exact 404 an advocate saw on the alpha');
    assert.equal(res.status, 302);
  });

  it('hands the token to the deep link the app registers', async () => {
    const url = new URL(await requestLink(freshAddress()));
    const res = await app.request(url.pathname + url.search);

    const location = res.headers.get('location');
    assert.ok(location, 'a redirect with no destination');
    assert.ok(
      location.startsWith(`${MAGIC_LINK_APP_URL}?token=`),
      `expected the app deep link, got ${location}`,
    );
    assert.equal(tokenFromDeepLink(location), url.searchParams.get('token'));
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(await res.text(), '', 'no body, so the token lands in no document');
  });

  /**
   * NOT AN OPEN REDIRECT. better-auth's minted `callbackURL` is not honoured
   * here, and neither is anything else a stranger can put in the query string —
   * this URL carries a live credential, and a redirect it controls would hand it
   * over.
   */
  it('redirects to the one destination whatever the query string asks for', async () => {
    const hostile = new URLSearchParams({
      token: 'a-token-shaped-string',
      callbackURL: 'https://evil.example/steal',
      redirect: 'https://evil.example/steal',
      newUserCallbackURL: 'https://evil.example/steal',
    });
    const res = await app.request(`${MAGIC_LINK_LANDING_PATH}?${hostile.toString()}`);

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), `${MAGIC_LINK_APP_URL}?token=a-token-shaped-string`);
  });

  it('refuses a link that carries no token, rather than launching the app', async () => {
    const res = await app.request(MAGIC_LINK_LANDING_PATH);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'LINK_INVALID');
  });

  /**
   * THE WHOLE LOOP. Request → email → landing → deep link → exchange → a
   * session that can call an authenticated route. Every step is the production
   * one; nothing is reached into the database for.
   */
  it('completes the advocate loop from the emailed URL to an authenticated call', async () => {
    const address = freshAddress();
    const url = new URL(await requestLink(address));

    const landed = await app.request(url.pathname + url.search);
    const token = tokenFromDeepLink(landed.headers.get('location') ?? '');

    const verified = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    // Read ONCE: a failing assertion that consumed the body to build its message
    // would leave the next line reporting an unusable body instead of the fault.
    const verifiedBody = await verified.text();
    assert.equal(verified.status, 200, verifiedBody);
    const session = JSON.parse(verifiedBody) as {
      data: { accessToken: string; refreshToken: string; user: { email: string } };
    };
    assert.equal(session.data.user.email, address);
    assert.ok(session.data.accessToken);

    const me = await app.request('/me', {
      headers: { authorization: `Bearer ${session.data.accessToken}` },
    });
    assert.equal(me.status, 200, 'the session the emailed link produced must work');
    const profile = (await me.json()) as { data: { user: { email: string } } };
    assert.equal(profile.data.user.email, address);
  });

  /**
   * ONE USE, AND THE LANDING ROUTE DOES NOT SPEND IT.
   *
   * The second half matters as much as the first: the reason we do NOT mount
   * better-auth's own `magic-link/verify` is that it consumes the token into a
   * browser cookie session. Visiting the landing route twice and THEN exchanging
   * proves this route leaves the credential alone.
   */
  it('leaves the token unspent, then lets better-auth spend it exactly once', async () => {
    const url = new URL(await requestLink(freshAddress()));

    await app.request(url.pathname + url.search);
    const second = await app.request(url.pathname + url.search);
    const token = tokenFromDeepLink(second.headers.get('location') ?? '');

    const first = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assert.equal(first.status, 200, 'two landings must not have consumed the token');

    const replay = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assert.equal(replay.status, 401, 'a link is single use');
    const body = (await replay.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'LINK_INVALID');
  });

  it('refuses a token that was never issued', async () => {
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-token-anybody-minted' }),
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'LINK_INVALID');
  });

  it('refuses a token that has expired', async () => {
    const address = freshAddress();
    const url = new URL(await requestLink(address));

    // Age it in place. The alternative is waiting fifteen minutes.
    const aged = await sql`
      UPDATE auth_verification
         SET expires_at = now() - interval '1 minute'
       WHERE value LIKE ${`%${address}%`}
    `;
    assert.ok(aged.count > 0, 'no verification row to expire — the fixture is wrong');

    const landed = await app.request(url.pathname + url.search);
    assert.equal(landed.status, 302, 'the landing route does not judge tokens');

    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenFromDeepLink(landed.headers.get('location') ?? '') }),
    });
    assert.equal(res.status, 401);
  });

  /**
   * The mail-cannon limiters are mounted on `/auth/magic-link` EXACTLY. If Hono
   * ever treated that as a prefix, every landing would draw on the per-email
   * bucket keyed `unparseable` and an advocate's own link would start answering
   * 429. Cheap to assert, silent and product-fatal if it changes.
   */
  it('does not consume the magic-link email rate limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await app.request(`${MAGIC_LINK_LANDING_PATH}?token=t${i}`);
      statuses.push(res.status);
    }
    assert.deepEqual(new Set(statuses), new Set([302]), `saw ${statuses.join(',')}`);
  });

  /** A base URL that carries a path prefix must keep it. */
  it('mints the landing URL beneath a base path rather than discarding it', () => {
    assert.equal(
      magicLinkLandingUrl('https://example.test/api', 'abc'),
      `https://example.test/api${MAGIC_LINK_LANDING_PATH}?token=abc`,
    );
    assert.equal(
      magicLinkLandingUrl('https://example.test/', 'abc'),
      `https://example.test${MAGIC_LINK_LANDING_PATH}?token=abc`,
    );
  });

  /**
   * THE BLAST RADIUS. This round added ONE public GET to an API whose surface is
   * otherwise behind a bearer token. These say it stayed one.
   */
  it('leaves protected routes protected', async () => {
    for (const route of ['/me', '/me/data-requests']) {
      const res = await app.request(route);
      assert.equal(res.status, 401, `${route} answered ${res.status}`);
    }
  });

  it('leaves health, ready and version answering as they did', async () => {
    const version = await app.request('/version');
    assert.equal(version.status, 200);
    const body = (await version.json()) as { ok: boolean; data: { contract: number } };
    assert.equal(body.ok, true);
    assert.equal(typeof body.data.contract, 'number');

    const health = await app.request('/health');
    assert.equal(health.status, 200);

    const ready = await app.request('/ready');
    assert.ok([200, 503].includes(ready.status), `/ready answered ${ready.status}`);
  });
});
