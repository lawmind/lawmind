/**
 * Matters — the three rules that are not about CRUD.
 *
 * 1. **Ownership.** A matter carries client names, party detail and privileged
 *    notes. One advocate must never see another's, and "not found" and "not
 *    yours" must be indistinguishable — a matter id that resolves is itself a
 *    fact about somebody else's caseload.
 * 2. **PD-4.** `note_visibility` defaults to `private` IN THE COLUMN. The test
 *    asserts the database default, not the handler's behaviour, because a handler
 *    that happens to pass today can be changed by someone who never reads PD-4.
 * 3. **`set_aside` disables add-to-matter** — the one case where this product
 *    refuses to let an authority be used. The client's disabled button is
 *    presentation; this is the enforcement.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';
import { ISO_8601 } from '../iso-time.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

async function seedAdvocate(tag: string) {
  const authId = `test-mat-${tag}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Adv', ${email}, true)`;
  await sql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
            VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified')`;
  return { authId, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

const body = {
  caseTitle: 'State v. Kumar',
  court: 'Delhi High Court',
  caseType: 'criminal' as const,
  parties: { petitioner: 'State', respondent: 'Kumar' },
  clientName: 'Kumar',
  ourSide: 'accused' as const,
  nextHearingDate: '2026-09-01',
};

const auth = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

describe('matters', () => {
  let alice: { authId: string; token: string };
  let bob: { authId: string; token: string };

  before(async () => {
    alice = await seedAdvocate('a');
    bob = await seedAdvocate('b');
  });

  after(async () => {
    await sql`DELETE FROM matter_events WHERE matter_id IN
              (SELECT m.id FROM matters m JOIN users u ON u.id = m.user_id
               WHERE u.auth_id LIKE 'test-mat-%')`;
    await sql`DELETE FROM matters WHERE user_id IN
              (SELECT id FROM users WHERE auth_id LIKE 'test-mat-%')`;
    await sql`DELETE FROM users WHERE auth_id LIKE 'test-mat-%'`;
    await sql`DELETE FROM auth_user WHERE id LIKE 'test-mat-%'`;
    // Deliberately NOT sql.end() — the connection is shared with the suite below,
    // and closing it here cancelled every test in it with CONNECTION_ENDED. The
    // last teardown in the file owns the close.
  });

  it('refuses an anonymous caller', async () => {
    assert.equal((await app.request('/matters')).status, 401);
  });

  it('creates a matter and lists it back', async () => {
    const created = await app.request('/matters', {
      method: 'POST',
      headers: auth(alice.token),
      body: JSON.stringify(body),
    });
    assert.equal(created.status, 201);
    const m = ((await created.json()) as { data: { matter: Record<string, string> } }).data.matter;
    assert.equal(m['caseTitle'], 'State v. Kumar');
    assert.equal(m['status'], 'active');
    // A date the advocate typed is first-class provenance (PD-12), not a fallback.
    assert.equal(m['source'], 'manual');
    assert.match(m['createdAt']!, ISO_8601, 'timestamps must be ES-spec ISO — Hermes is strict');

    const list = await app.request('/matters', { headers: auth(alice.token) });
    const listed = ((await list.json()) as { data: { matters: { matterId: string }[] } }).data
      .matters;
    assert.ok(listed.some((x) => x.matterId === m['matterId']));
  });

  it("never shows one advocate another's matter", async () => {
    const created = await app.request('/matters', {
      method: 'POST',
      headers: auth(alice.token),
      body: JSON.stringify(body),
    });
    const id = ((await created.json()) as { data: { matter: { matterId: string } } }).data.matter
      .matterId;

    // Bob is a real, signed-in advocate — this is an authorisation test, not an
    // authentication one.
    const asBob = await app.request(`/matters/${id}`, { headers: auth(bob.token) });
    assert.equal(asBob.status, 404, "another advocate's matter must not resolve");

    const missing = await app.request(`/matters/${crypto.randomUUID()}`, {
      headers: auth(bob.token),
    });
    assert.equal(
      asBob.status,
      missing.status,
      'not-yours and does-not-exist must be indistinguishable, or matter ids are enumerable',
    );

    const patch = await app.request(`/matters/${id}`, {
      method: 'PATCH',
      headers: auth(bob.token),
      body: JSON.stringify({ caseTitle: 'hijacked' }),
    });
    assert.equal(patch.status, 404, 'a write must be scoped the same way as a read');

    const event = await app.request(`/matters/${id}/events`, {
      method: 'POST',
      headers: auth(bob.token),
      body: JSON.stringify({ eventDate: '2026-09-01', eventType: 'note', notes: 'x' }),
    });
    assert.equal(event.status, 404);

    const [still] = await sql<{ case_title: string }[]>`
      SELECT case_title FROM matters WHERE id = ${id}`;
    assert.equal(still?.case_title, 'State v. Kumar', 'nothing may have been written');
  });

  it('PD-4 — a note with no stated visibility is PRIVATE, and the column says so', async () => {
    const [col] = await sql<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'matter_events' AND column_name = 'note_visibility'`;
    // The database default is the assertion that matters. Application code that
    // happens to send 'private' today can be changed by somebody who never reads
    // PD-4; a column default cannot be missed by a branch.
    assert.match(
      col?.column_default ?? '',
      /private/,
      'note_visibility must default to private IN THE COLUMN',
    );

    const created = await app.request('/matters', {
      method: 'POST',
      headers: auth(alice.token),
      body: JSON.stringify(body),
    });
    const id = ((await created.json()) as { data: { matter: { matterId: string } } }).data.matter
      .matterId;

    const res = await app.request(`/matters/${id}/events`, {
      method: 'POST',
      headers: auth(alice.token),
      body: JSON.stringify({
        eventDate: '2026-09-01',
        eventType: 'hearing',
        orderText: 'Bail granted.',
        notes: 'Client cannot pay the balance until next month.',
      }),
    });
    assert.equal(res.status, 201);
    const ev = ((await res.json()) as { data: { event: Record<string, string> } }).data.event;
    assert.equal(
      ev['noteVisibility'],
      'private',
      'a note about a client’s finances must never default to shared',
    );
  });

  it('PD-4 — shared is possible, but only when asked for explicitly', async () => {
    const created = await app.request('/matters', {
      method: 'POST',
      headers: auth(alice.token),
      body: JSON.stringify(body),
    });
    const id = ((await created.json()) as { data: { matter: { matterId: string } } }).data.matter
      .matterId;

    const res = await app.request(`/matters/${id}/events`, {
      method: 'POST',
      headers: auth(alice.token),
      body: JSON.stringify({
        eventDate: '2026-09-02',
        eventType: 'order',
        orderText: 'Matter adjourned.',
        noteVisibility: 'shared',
      }),
    });
    const ev = ((await res.json()) as { data: { event: Record<string, string> } }).data.event;
    assert.equal(ev['noteVisibility'], 'shared');
  });

  it('clears a next hearing date on explicit null, and leaves it alone when omitted', async () => {
    const created = await app.request('/matters', {
      method: 'POST',
      headers: auth(alice.token),
      body: JSON.stringify(body),
    });
    const id = ((await created.json()) as { data: { matter: { matterId: string } } }).data.matter
      .matterId;

    const untouched = await app.request(`/matters/${id}`, {
      method: 'PATCH',
      headers: auth(alice.token),
      body: JSON.stringify({ caseTitle: 'State v. Kumar (renamed)' }),
    });
    const a = ((await untouched.json()) as { data: { matter: Record<string, string> } }).data
      .matter;
    assert.equal(a['nextHearingDate'], '2026-09-01', 'an omitted field must not clear a date');

    const cleared = await app.request(`/matters/${id}`, {
      method: 'PATCH',
      headers: auth(alice.token),
      body: JSON.stringify({ nextHearingDate: null }),
    });
    const b = ((await cleared.json()) as { data: { matter: Record<string, string | null> } }).data
      .matter;
    // "The next date is no longer known" is a thing an advocate must be able to
    // say. Explicit null means it, undefined does not.
    assert.equal(b['nextHearingDate'], null);
  });
});

describe('set_aside disables add-to-matter', () => {
  let advocate: { authId: string; token: string };
  let judgmentId: string | null = null;
  let matterId: string | null = null;

  before(async () => {
    advocate = await seedAdvocate('sa');
    const created = await app.request('/matters', {
      method: 'POST',
      headers: auth(advocate.token),
      body: JSON.stringify(body),
    });
    matterId = ((await created.json()) as { data: { matter: { matterId: string } } }).data.matter
      .matterId;

    const rows = await sql<{ id: string }[]>`SELECT id FROM judgments LIMIT 1`;
    judgmentId = rows[0]?.id ?? null;
  });

  after(async () => {
    if (judgmentId) {
      // Put the corpus back. A test that leaves a real judgment marked set_aside
      // would make every later run — and every later reader — believe the law
      // moved when it did not.
      await sql`UPDATE judgments SET overruled_status = 'none' WHERE id = ${judgmentId}`;
      await sql`DELETE FROM judgment_annotations WHERE judgment_id = ${judgmentId}
                AND user_id IN (SELECT id FROM users WHERE auth_id LIKE 'test-mat-%')`;
    }
    await sql`DELETE FROM matter_events WHERE matter_id IN
              (SELECT m.id FROM matters m JOIN users u ON u.id = m.user_id
               WHERE u.auth_id LIKE 'test-mat-%')`;
    await sql`DELETE FROM matters WHERE user_id IN
              (SELECT id FROM users WHERE auth_id LIKE 'test-mat-%')`;
    await sql`DELETE FROM users WHERE auth_id LIKE 'test-mat-%'`;
    await sql`DELETE FROM auth_user WHERE id LIKE 'test-mat-%'`;
    await sql.end();
  });

  it('refuses to attach a set-aside authority to a matter, and names it', async (t) => {
    // Needs a corpus. Skips on a fresh database exactly as the other
    // corpus-dependent tests do, rather than passing vacuously.
    if (!judgmentId) return t.skip('no judgments in this database');

    await sql`UPDATE judgments SET overruled_status = 'set_aside' WHERE id = ${judgmentId}`;

    const res = await app.request(`/judgments/${judgmentId}/annotations`, {
      method: 'POST',
      headers: auth(advocate.token),
      body: JSON.stringify({
        matterId,
        paragraphNumber: 12,
        paragraphIndex: 11,
        quote: 'The appeal is allowed.',
      }),
    });
    assert.equal(res.status, 409, 'set_aside must refuse add-to-matter on the SERVER');
    const err = ((await res.json()) as { error: { code: string; message: string } }).error;
    assert.equal(err.code, 'AUTHORITY_SET_ASIDE');
    // "You cannot add this" with no reason sends the advocate to check by hand,
    // which is the work this product exists to save.
    assert.match(err.message, /set aside/i);

    const [count] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgment_annotations WHERE judgment_id = ${judgmentId}`;
    assert.equal(count?.n, 0, 'nothing may have been written');
  });

  it('still allows saving the passage on its own', async (t) => {
    if (!judgmentId) return t.skip('no judgments in this database');
    await sql`UPDATE judgments SET overruled_status = 'set_aside' WHERE id = ${judgmentId}`;

    // The refusal is about USING it as an authority, not about reading it. An
    // advocate has every reason to highlight the paragraph that was set aside,
    // and blocking that teaches them the product is broken rather than careful.
    const res = await app.request(`/judgments/${judgmentId}/annotations`, {
      method: 'POST',
      headers: auth(advocate.token),
      body: JSON.stringify({
        paragraphNumber: 12,
        paragraphIndex: 11,
        quote: 'The appeal is allowed.',
      }),
    });
    assert.equal(res.status, 200, 'a highlight with no matter must still be allowed');
  });

  it('allows add-to-matter for a judgment that is merely doubted', async (t) => {
    if (!judgmentId) return t.skip('no judgments in this database');
    // Three overruled states and only ONE of them refuses. `doubted` shows no
    // banner at all; treating it like set_aside would quietly withdraw authority
    // the courts have not withdrawn.
    await sql`UPDATE judgments SET overruled_status = 'doubted' WHERE id = ${judgmentId}`;

    const res = await app.request(`/judgments/${judgmentId}/annotations`, {
      method: 'POST',
      headers: auth(advocate.token),
      body: JSON.stringify({
        matterId,
        paragraphNumber: 14,
        paragraphIndex: 13,
        quote: 'Doubted, not overruled.',
      }),
    });
    assert.equal(res.status, 200, 'only set_aside disables add-to-matter');
  });
});
