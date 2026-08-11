/**
 * Exercises the envelope, the health check and the validation middleware through
 * `app.request()` — real routing and real middleware, no listening socket and no
 * database.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { z } from 'zod';

import { createApp } from './app.ts';
import { ok } from './envelope.ts';
import { validate } from './validate.ts';

type Body = {
  ok: boolean;
  data?: {
    status?: string;
    sha?: string;
    database?: { reachable?: boolean; latencyMs?: number };
    accepted?: boolean;
    gitSha?: string;
    deployedAt?: string | null;
    environment?: string;
    imageDigest?: string | null;
  };
  error?: { code: string; message: string };
};

const readBody = async (res: Response): Promise<Body> => (await res.json()) as Body;

const reachable = { ping: async () => {} };
const unreachable = {
  ping: async () => {
    throw new Error('connection refused');
  },
};

/**
 * Mounted only in the test: S0 ships no endpoint that takes input, and the
 * validation middleware must not reach the gate unexercised.
 */
function appWithProbe() {
  const app = createApp(reachable);
  app.post('/probe', validate('json', z.object({ language: z.enum(['en', 'hi']) })), (c) =>
    ok(c, { accepted: true }),
  );
  return app;
}

describe('GET /health', () => {
  it('returns 200 with a real SHA and a real database check', async () => {
    const res = await createApp(reachable).request('/health');
    assert.equal(res.status, 200);

    const body = await readBody(res);
    assert.equal(body.ok, true);
    assert.equal(body.data?.status, 'ok');
    assert.equal(body.data?.database?.reachable, true);
    assert.equal(typeof body.data?.database?.latencyMs, 'number');
    // A placeholder would defeat the point of the field — assert a real commit id.
    assert.match(String(body.data?.sha), /^[0-9a-f]{40}$/);
  });

  it('returns 503 in the envelope when the database is unreachable', async () => {
    const res = await createApp(unreachable).request('/health');
    assert.equal(res.status, 503);

    const body = await readBody(res);
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, 'DATABASE_UNREACHABLE');
    assert.equal(body.data, undefined);
  });
});

describe('GET /version', () => {
  it('exposes gitSha, deployedAt, environment and imageDigest — REB §1.3', async () => {
    const res = await createApp(reachable).request('/version');
    assert.equal(res.status, 200);

    const body = await readBody(res);
    assert.equal(body.ok, true);
    // The same value /health reports — build-info.ts is the single source,
    // never a second resolution that could disagree with the first.
    assert.match(String(body.data?.gitSha), /^[0-9a-f]{40}$/);
    assert.equal(typeof body.data?.environment, 'string');
    // Honest gaps, not guessed values: locally (no DEPLOYED_AT set) this is
    // null, and imageDigest is always null — nothing here computes one.
    assert.ok(body.data?.deployedAt === null || typeof body.data?.deployedAt === 'string');
    assert.equal(body.data?.imageDigest, null);
  });

  it('answers even when the database is unreachable — deploy identity is not a database question', async () => {
    const res = await createApp(unreachable).request('/version');
    assert.equal(res.status, 200);
  });
});

describe('the envelope', () => {
  it('shapes an unknown route as { ok: false, error }', async () => {
    const res = await createApp(reachable).request('/no-such-route');
    assert.equal(res.status, 404);

    const body = await readBody(res);
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, 'NOT_FOUND');
    assert.ok(body.error?.message.includes('/no-such-route'));
  });

  it('shapes a failed Zod validation as { ok: false, error } with a code', async () => {
    const res = await appWithProbe().request('/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'th' }),
    });
    assert.equal(res.status, 400);

    const body = await readBody(res);
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, 'INVALID_REQUEST');
    assert.ok(body.error?.message.includes('language'));
  });

  it('accepts a valid body through the same middleware', async () => {
    const res = await appWithProbe().request('/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'hi' }),
    });
    assert.equal(res.status, 200);

    const body = await readBody(res);
    assert.equal(body.ok, true);
    assert.equal(body.data?.accepted, true);
  });
});
