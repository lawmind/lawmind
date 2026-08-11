/**
 * The envelope, and the one place it is not a pure passthrough.
 *
 * `fail()` upgrades `AUTH_REQUIRED` to `PROFILE_INCOMPLETE` when the caller is
 * signed in — RCC bus 0058. That is deliberate behaviour at a funnel, so it is
 * asserted in BOTH directions here: a change that quietly stopped upgrading
 * would put "sign in to continue" back in front of someone who just did, and a
 * change that upgraded too eagerly would tell a genuinely signed-out caller
 * that their onboarding is incomplete.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Hono } from 'hono';

import { fail, ok } from './envelope.ts';

type Body = { ok: boolean; error?: { code: string; message: string; details?: unknown } };

/** A route that fails the way all 48 real `AUTH_REQUIRED` sites do. */
function appWith(authId: string | undefined) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (authId !== undefined) c.set('authId', authId);
    await next();
  });
  app.get('/needs-profile', (c) => fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401));
  app.get('/other-error', (c) => fail(c, 'NOT_FOUND', 'no matter with that id', 404));
  app.get('/with-details', (c) =>
    fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401, { offset: 3 }),
  );
  app.get('/fine', (c) => ok(c, { hello: 'world' }));
  return app;
}

describe('fail() — the signed-in-but-not-onboarded distinction', () => {
  it('a genuinely signed-out caller still gets AUTH_REQUIRED and 401', async () => {
    const res = await appWith(undefined).request('/needs-profile');
    assert.equal(res.status, 401);
    const body = (await res.json()) as Body;
    assert.equal(body.error?.code, 'AUTH_REQUIRED');
    assert.equal(body.error?.message, 'sign in to continue');
  });

  it('a SIGNED-IN caller with no profile gets PROFILE_INCOMPLETE and 403', async () => {
    // The exact production case: magic link → verify → a valid access token →
    // every user-scoped route answering "sign in to continue".
    const res = await appWith('auth-user-123').request('/needs-profile');
    assert.equal(res.status, 403, '403 says authenticated-but-not-permitted; 401 invites a token refresh that cannot help');
    const body = (await res.json()) as Body;
    assert.equal(body.error?.code, 'PROFILE_INCOMPLETE');
    assert.match(body.error?.message ?? '', /onboarding/i);
    assert.doesNotMatch(
      body.error?.message ?? '',
      /sign in/i,
      'telling someone who just signed in to sign in is the whole defect',
    );
  });

  it('does NOT touch any other error code, signed in or not', async () => {
    for (const authId of [undefined, 'auth-user-123']) {
      const res = await appWith(authId).request('/other-error');
      assert.equal(res.status, 404);
      assert.equal(((await res.json()) as Body).error?.code, 'NOT_FOUND');
    }
  });

  it('keeps structured details through the upgrade', async () => {
    // `details` is how the query language reports a parse offset. An upgrade
    // that dropped it would silently remove something a client acts on.
    const res = await appWith('auth-user-123').request('/with-details');
    const body = (await res.json()) as Body;
    assert.equal(body.error?.code, 'PROFILE_INCOMPLETE');
    assert.deepEqual(body.error?.details, { offset: 3 });
  });

  it('leaves success responses alone', async () => {
    const res = await appWith('auth-user-123').request('/fine');
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true);
  });
});
