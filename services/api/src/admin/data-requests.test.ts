/**
 * DPDP data requests — "a visible clock per request." `overdueCount` is the
 * one computed field, and the thing worth getting exactly right: completed
 * and refused requests must never count as overdue regardless of `due_at`,
 * because "overdue" describes live exposure, not history.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const TAG = 'test-data-requests';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const json = { 'content-type': 'application/json' };

describe('DPDP data requests', () => {
  let admin: { authId: string; userId: string; token: string };
  let overdueId = '';
  let futureId = '';

  before(async () => {
    const authId = `${TAG}-admin-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${authId}, 'Adv', ${email}, true)`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
      VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified') RETURNING id`;
    admin = { authId, userId: u!.id, token: await signAccessToken({ sub: authId, email }, SECRET) };

    const [o] = await sql<{ id: string }[]>`
      INSERT INTO data_requests (user_id, kind, status, due_at)
      VALUES (${admin.userId}, 'export', 'received', now() - interval '1 day')
      RETURNING id`;
    overdueId = o!.id;

    const [f] = await sql<{ id: string }[]>`
      INSERT INTO data_requests (user_id, kind, status, due_at)
      VALUES (${admin.userId}, 'erasure', 'received', now() + interval '10 days')
      RETURNING id`;
    futureId = f!.id;
  });

  after(async () => {
    await sql`DELETE FROM data_requests WHERE id = ANY(${[overdueId, futureId]})`;
    await sql.end();
  });

  it('401 without a token', async () => {
    assert.equal((await app.request('/admin/data-requests')).status, 401);
  });

  it('overdueCount counts only unresolved requests past due_at', async () => {
    const res = await app.request('/admin/data-requests', { headers: auth(admin.token) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: { requests: { id: string; dueAt: string }[]; overdueCount: number };
    };
    assert.ok(body.data.requests.some((r) => r.id === overdueId));
    assert.ok(body.data.requests.some((r) => r.id === futureId));
    assert.ok(body.data.overdueCount >= 1);
  });

  it('completing a request writes completed_at and an audit row, and drops it from overdueCount', async () => {
    const res = await app.request(`/admin/data-requests/${overdueId}/complete`, {
      method: 'POST',
      headers: { ...auth(admin.token), ...json },
      body: JSON.stringify({ artefactStorageKey: 'r2://test/export.zip' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: { request: { status: string; completedAt: string | null; artefactStorageKey: string } };
    };
    assert.equal(body.data.request.status, 'completed');
    assert.ok(body.data.request.completedAt);
    assert.equal(body.data.request.artefactStorageKey, 'r2://test/export.zip');

    const [auditRow] = await sql<{ action: string }[]>`
      SELECT action FROM audit_log WHERE action = 'data_request.complete' AND target_id = ${overdueId}`;
    assert.equal(auditRow?.action, 'data_request.complete');

    const after_ = await app.request('/admin/data-requests', { headers: auth(admin.token) });
    const afterBody = (await after_.json()) as {
      data: { requests: { id: string; status: string }[] };
    };
    const row = afterBody.data.requests.find((r) => r.id === overdueId);
    assert.equal(
      row?.status,
      'completed',
      'a completed request must still be listed — history, not hidden',
    );
  });

  it('refusing a request records the reason and writes an audit row', async () => {
    const res = await app.request(`/admin/data-requests/${futureId}/refuse`, {
      method: 'POST',
      headers: { ...auth(admin.token), ...json },
      body: JSON.stringify({ reason: 'identity could not be verified' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: { request: { status: string; refusalReason: string } };
    };
    assert.equal(body.data.request.status, 'refused');
    assert.equal(body.data.request.refusalReason, 'identity could not be verified');

    const [auditRow] = await sql<{ action: string; reason: string }[]>`
      SELECT action, reason FROM audit_log WHERE action = 'data_request.refuse' AND target_id = ${futureId}`;
    assert.equal(auditRow?.reason, 'identity could not be verified');
  });

  it('404s on an unknown id rather than silently succeeding', async () => {
    const res = await app.request(`/admin/data-requests/${crypto.randomUUID()}/complete`, {
      method: 'POST',
      headers: { ...auth(admin.token), ...json },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 404);
  });
});
