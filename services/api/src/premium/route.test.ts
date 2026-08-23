/**
 * The premium routes, tested for the two things that matter before launch:
 * they are OFF unless somebody turned them on, and they do not become a second
 * way to reach another advocate's matter.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';
import { grantEntitlement } from '../entitlements/entitlements.ts';
import { PREMIUM_FLAGS } from './gate.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 4, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const TAG = 'test-prem-';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

const hdr = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

async function seedAdvocate(tag: string) {
  const authId = `${TAG}${tag}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Adv', ${email}, true)`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
    VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified') RETURNING id`;
  return { authId, userId: u!.id, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

async function setFlag(key: string, enabled: boolean) {
  await sql`
    INSERT INTO platform_config (key, kind, enabled) VALUES (${key}, 'flag', ${enabled})
    ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled`;
}

describe('premium routes', () => {
  let A: Awaited<ReturnType<typeof seedAdvocate>>;
  let B: Awaited<ReturnType<typeof seedAdvocate>>;
  let matterId: string;

  before(async () => {
    A = await seedAdvocate('a');
    B = await seedAdvocate('b');
    const m = await app.request('/matters', {
      method: 'POST',
      headers: hdr(A.token),
      body: JSON.stringify({
        caseTitle: 'A v. B',
        court: 'Delhi High Court',
        caseType: 'criminal',
        parties: { petitioner: 'A', respondent: 'B' },
        clientName: 'A client',
        ourSide: 'accused',
        nextHearingDate: '2026-09-01',
      }),
    });
    assert.equal(m.status, 201);
    const body = (await m.json()) as { data: { matter: { matterId: string } } };
    matterId = body.data.matter.matterId;
  });

  after(async () => {
    const like = `${TAG}%`;
    const users = sql`SELECT id FROM users WHERE auth_id LIKE ${like}`;
    await sql`DELETE FROM premium_jobs WHERE user_id IN (${users})`;
    await sql`DELETE FROM entitlements WHERE user_id IN (${sql`SELECT id FROM users WHERE auth_id LIKE ${like}`})`;
    await sql`DELETE FROM matter_events WHERE matter_id = ${matterId}`;
    await sql`DELETE FROM matters WHERE user_id IN (${sql`SELECT id FROM users WHERE auth_id LIKE ${like}`})`;
    await sql`DELETE FROM users WHERE auth_id LIKE ${like}`;
    await sql`DELETE FROM auth_user WHERE id LIKE ${like}`;
    for (const key of Object.values(PREMIUM_FLAGS)) {
      await sql`DELETE FROM platform_config WHERE key = ${key} AND kind = 'flag'`;
    }
    await sql.end({ timeout: 5 });
  });

  it('every premium surface is OFF with no flag row at all', async () => {
    for (const key of Object.values(PREMIUM_FLAGS)) {
      await sql`DELETE FROM platform_config WHERE key = ${key} AND kind = 'flag'`;
    }
    assert.equal((await app.request('/me/entitlements', { headers: hdr(A.token) })).status, 404);
    assert.equal(
      (await app.request(`/matters/${matterId}/premium-preview`, { headers: hdr(A.token) })).status,
      404,
    );
    const job = await app.request('/premium/jobs', {
      method: 'POST',
      headers: hdr(A.token),
      body: JSON.stringify({
        capability: 'hearing_pack',
        idempotencyKey: 'k'.repeat(12),
        params: {},
      }),
    });
    assert.equal(job.status, 404, 'generation was reachable with no flag set');
  });

  it('an anonymous caller reaches none of them', async () => {
    await setFlag(PREMIUM_FLAGS.premium_entitlements, true);
    assert.equal((await app.request('/me/entitlements')).status, 401);
    assert.equal((await app.request(`/premium/jobs/${crypto.randomUUID()}`)).status, 401);
  });

  it('entitlements answer with an empty capability set, never a PRO boolean', async () => {
    await setFlag(PREMIUM_FLAGS.premium_entitlements, true);
    const r = await app.request('/me/entitlements', { headers: hdr(A.token) });
    assert.equal(r.status, 200);
    const body = (await r.json()) as {
      data: { capabilities: unknown[]; catalogue: { name: string; status: string }[] };
    };
    assert.deepEqual(body.data.capabilities, []);
    // The catalogue is advertised as PROVISIONAL so nobody mistakes it for spec.
    assert.ok(body.data.catalogue.some((c) => c.status === 'PROVISIONAL'));
    assert.ok(!JSON.stringify(body.data).includes('"pro"'));
  });

  it('the preview is refused on ANOTHER advocate’s matter, as 404', async () => {
    await setFlag(PREMIUM_FLAGS.premium_preview, true);
    const r = await app.request(`/matters/${matterId}/premium-preview`, { headers: hdr(B.token) });
    assert.equal(r.status, 404, 'the preview became a second way into a foreign matter');
  });

  it('the preview returns stored counts and NAMES what it did not compute', async () => {
    await setFlag(PREMIUM_FLAGS.premium_preview, true);
    const r = await app.request(`/matters/${matterId}/premium-preview`, { headers: hdr(A.token) });
    assert.equal(r.status, 200);
    const body = (await r.json()) as {
      data: {
        costClass: string;
        authorityCount: number;
        adverseAuthorities: number;
        nextHearingDate: string | null;
        unresolvedFilings: number;
        stanceNotComputed: boolean;
        notComputed: string[];
      };
    };
    // SPEC_V1 section 6: a free-user preview may never be an expensive computation.
    assert.equal(body.data.costClass, 'cheap');
    assert.equal(body.data.authorityCount, 0);
    assert.equal(body.data.adverseAuthorities, 0);
    assert.equal(body.data.unresolvedFilings, 0);
    // Already shown free elsewhere in the product, so it is free here too.
    assert.equal(body.data.nextHearingDate, '2026-09-01');
    // The spec calls supporting/contrary counts cheap; no stance column exists,
    // so the honest answer is to say so rather than invent a split.
    assert.equal(body.data.stanceNotComputed, true);
    assert.ok(body.data.notComputed.length >= 4, 'the preview implied it was a summary');
  });

  it('the preview makes NO model call — the cost rule is structural, not a promise', async () => {
    await setFlag(PREMIUM_FLAGS.premium_preview, true);
    const [before] = await sql`SELECT count(*)::text AS n FROM llm_calls`;
    await app.request(`/matters/${matterId}/premium-preview`, { headers: hdr(A.token) });
    const [after] = await sql`SELECT count(*)::text AS n FROM llm_calls`;
    assert.equal(after!['n'], before!['n'], 'a free-user preview wrote an llm_calls row');
  });

  it('generation is refused with 402 when the capability is not held', async () => {
    await setFlag(PREMIUM_FLAGS.premium_generation_jobs, true);
    const r = await app.request('/premium/jobs', {
      method: 'POST',
      headers: hdr(A.token),
      body: JSON.stringify({
        capability: 'hearing_pack',
        idempotencyKey: `no-ent-${crypto.randomUUID()}`,
        params: { matterId },
      }),
    });
    assert.equal(r.status, 402);
    const [n] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM premium_jobs WHERE user_id = ${A.userId}`;
    assert.equal(n!.n, '0', 'a refused request still created a job row');
  });

  it('an entitled user creates ONE job, and a second tap returns it with 200', async () => {
    await setFlag(PREMIUM_FLAGS.premium_generation_jobs, true);
    await grantEntitlement(sql, {
      userId: A.userId,
      capability: 'hearing_pack',
      source: 'founder_grant',
    });
    const key = `tap-${crypto.randomUUID()}`;
    const body = JSON.stringify({
      capability: 'hearing_pack',
      idempotencyKey: key,
      matterId,
      params: { hearing: '2026-09-01' },
    });
    const first = await app.request('/premium/jobs', { method: 'POST', headers: hdr(A.token), body });
    const second = await app.request('/premium/jobs', { method: 'POST', headers: hdr(A.token), body });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200, 'a second tap looked like a new job');
    const f = (await first.json()) as { data: { job: { id: string }; created: boolean } };
    const s = (await second.json()) as { data: { job: { id: string }; created: boolean } };
    assert.equal(f.data.created, true);
    assert.equal(s.data.created, false);
    assert.equal(f.data.job.id, s.data.job.id);
  });

  it('a job is not readable or cancellable by another advocate', async () => {
    await setFlag(PREMIUM_FLAGS.premium_generation_jobs, true);
    const [job] = await sql<{ id: string }[]>`
      SELECT id FROM premium_jobs WHERE user_id = ${A.userId} LIMIT 1`;
    assert.ok(job, 'no job to test with');
    assert.equal(
      (await app.request(`/premium/jobs/${job!.id}`, { headers: hdr(B.token) })).status,
      404,
    );
    assert.equal(
      (
        await app.request(`/premium/jobs/${job!.id}/cancel`, {
          method: 'POST',
          headers: hdr(B.token),
        })
      ).status,
      404,
    );
  });

  it('an unknown capability is a 400, never a job', async () => {
    await setFlag(PREMIUM_FLAGS.premium_generation_jobs, true);
    const r = await app.request('/premium/jobs', {
      method: 'POST',
      headers: hdr(A.token),
      body: JSON.stringify({
        capability: 'unlimited_everything',
        idempotencyKey: `bad-${crypto.randomUUID()}`,
        params: {},
      }),
    });
    assert.equal(r.status, 400);
  });
});
