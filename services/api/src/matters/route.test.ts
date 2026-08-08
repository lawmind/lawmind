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

    // A judgment this suite owns. Previously it grabbed a real one and mutated
    // it, which made these tests skip on a fresh database — so the single
    // refusal in the product was proved only by hand — and left genuine law one
    // crashed process away from being marked set_aside.
    const [j] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                             full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Set Aside Fixture', '{}', 'Test Court', '2000-01-01',
              'synthetic fixture owned by matters/route.test.ts', 'en',
              ${`test://matters/${crypto.randomUUID()}`}, 'none')
      RETURNING id`;
    judgmentId = j!.id;
  });

  after(async () => {
    if (judgmentId) {
      await sql`DELETE FROM judgment_annotations WHERE judgment_id = ${judgmentId}`;
      await sql`DELETE FROM judgments WHERE id = ${judgmentId}`;
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

  it('refuses to attach a set-aside authority to a matter, and names it', async () => {
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

  it('still allows saving the passage on its own', async () => {
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

  it('allows add-to-matter for a judgment that is merely doubted', async () => {
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

/**
 * **PD-3 was half-built and RCC found it during their audit.** `matter_shares`
 * rows were written correctly by the owner-side endpoints and **no read path
 * ever consulted them**, so an invited advocate could never open the matter
 * they had been invited to. A file handed over that the recipient cannot open
 * has not been handed over.
 *
 * The naive fix — `OR EXISTS (share)` on the WHERE clause — is worse than the
 * bug, because it hands the sharee the owner's PRIVATE notes. PD-4: a note
 * about fees or a client's circumstances must never travel with a file by
 * accident. These tests exist to keep that boundary, not merely to prove
 * access works.
 */
describe('matter sharing — the sharee side, and what it must not see', () => {
  /**
   * Its OWN connection, deliberately. The `set_aside` suite above ends the
   * shared pool in its `after()` — correct for it, since it was the last
   * suite when it was written — and a block appended afterwards inherits a
   * closed connection and fails with CONNECTION_ENDED before its first
   * assertion. Owning the connection here is the fix that does not require
   * every future suite to know it must be appended in a particular place.
   */
  const shareSql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

  /**
   * And its own `app`. The module-level one is wired to the module-level pool,
   * so a suite that merely opens a second connection still routes every
   * `app.request` through the closed one — which hangs rather than failing
   * cleanly, because the request never settles.
   */
  const shareApp = createApp({
    ping: async () => {},
    search: { sql: shareSql, embedQuery: async () => null },
    auth: { auth: null as never, sql: shareSql, secret: SECRET },
  });

  /** Same as the module-level helper, on this suite's own pool. */
  async function seedOnOwnPool(tag: string) {
    const authId = `test-mat-${tag}-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await shareSql`INSERT INTO auth_user (id, name, email, email_verified)
                   VALUES (${authId}, 'Adv', ${email}, true)`;
    await shareSql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
                   VALUES (${authId}, 'Adv', ${`+9199${Math.floor(Math.random() * 100000000)}`},
                           ${email}, 'unverified')`;
    return { authId, token: await signAccessToken({ sub: authId, email }, SECRET) };
  }

  let owner: Awaited<ReturnType<typeof seedOnOwnPool>>;
  let sharee: Awaited<ReturnType<typeof seedOnOwnPool>>;
  let stranger: Awaited<ReturnType<typeof seedOnOwnPool>>;
  let shareeUserId = '';
  let matterId = '';

  before(async () => {
    owner = await seedOnOwnPool('own');
    sharee = await seedOnOwnPool('shr');
    stranger = await seedOnOwnPool('str');

    const [u] = await shareSql<{ id: string }[]>`
      SELECT id FROM users WHERE auth_id = ${sharee.authId}`;
    shareeUserId = u!.id;

    const created = await shareApp.request('/matters', {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify(body),
    });
    matterId = ((await created.json()) as { data: { matter: { matterId: string } } }).data.matter
      .matterId;

    // Two events: one shared, one private. The private one is the whole point.
    await shareApp.request(`/matters/${matterId}/events`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({
        eventDate: '2026-09-01',
        eventType: 'hearing',
        orderText: 'Adjourned to 1 October. Costs reserved.',
        notes: 'Junior to attend; client cannot travel.',
        noteVisibility: 'shared',
      }),
    });
    await shareApp.request(`/matters/${matterId}/events`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({
        eventDate: '2026-09-02',
        eventType: 'note',
        orderText: null,
        notes: 'Client has not paid the second tranche. Do not file until cleared.',
      }),
    });

    // Share it. The invitee already has an account, so createShare resolves
    // invited_user_id at insert time.
    const [me] = await shareSql<{ phone: string }[]>`
      SELECT phone FROM users WHERE id = ${shareeUserId}`;
    await shareSql`
      INSERT INTO matter_shares (matter_id, invited_user_id, invited_identifier, granted_by_user_id)
      SELECT ${matterId}, ${shareeUserId}, ${me!.phone}, id FROM users WHERE auth_id = ${owner.authId}`;
  });

  after(async () => {
    await shareSql`DELETE FROM matter_shares WHERE matter_id = ${matterId}`;
    await shareSql`DELETE FROM matter_events WHERE matter_id = ${matterId}`;
    await shareSql`DELETE FROM matters WHERE id = ${matterId}`;
    for (const a of [owner, sharee, stranger]) {
      await shareSql`DELETE FROM users WHERE auth_id = ${a.authId}`;
      await shareSql`DELETE FROM auth_user WHERE id = ${a.authId}`;
    }
    await shareSql.end();
  });

  it('the sharee can open the matter at all — this was the bug', async () => {
    const res = await shareApp.request(`/matters/${matterId}`, { headers: auth(sharee.token) });
    assert.equal(res.status, 200, 'an invited advocate must be able to open the matter');
    const b = (await res.json()) as { data: { access: string } };
    assert.equal(b.data.access, 'shared', 'and must be told it is shared, not their own');
  });

  it("the matter appears in the sharee's list, marked shared", async () => {
    const res = await shareApp.request('/matters', { headers: auth(sharee.token) });
    const b = (await res.json()) as { data: { matters: { matterId: string; access: string }[] } };
    const found = b.data.matters.find((m) => m.matterId === matterId);
    assert.ok(found, 'a shared matter belongs in the list — otherwise the invite is invisible');
    assert.equal(found!.access, 'shared');
  });

  it('PD-4 — the sharee sees the COURT RECORD but NEVER the private note', async () => {
    const res = await shareApp.request(`/matters/${matterId}`, { headers: auth(sharee.token) });
    const b = (await res.json()) as {
      data: { events: { eventType: string; orderText: string | null; notes: string | null }[] };
    };

    const hearing = b.data.events.find((e) => e.eventType === 'hearing')!;
    assert.equal(
      hearing.orderText,
      'Adjourned to 1 October. Costs reserved.',
      'order_text is the court record and always travels with a share',
    );
    assert.equal(hearing.notes, 'Junior to attend; client cannot travel.', 'a SHARED note travels');

    const privateNote = b.data.events.find((e) => e.eventType === 'note')!;
    assert.equal(
      privateNote.notes,
      null,
      'a PRIVATE note must never travel — this is a confidentiality breach between two advocates',
    );
    // The event itself is still visible; it is the note text that is withheld.
    assert.ok(privateNote, 'the event is not hidden, only its private note redacted');
  });

  it('the OWNER still sees their own private note', async () => {
    const res = await shareApp.request(`/matters/${matterId}`, { headers: auth(owner.token) });
    const b = (await res.json()) as {
      data: { access: string; events: { eventType: string; notes: string | null }[] };
    };
    assert.equal(b.data.access, 'owner');
    const privateNote = b.data.events.find((e) => e.eventType === 'note')!;
    assert.match(privateNote.notes ?? '', /second tranche/, 'redaction must not affect the owner');
  });

  it('a stranger still gets 404 — sharing did not open the door to everyone', async () => {
    const res = await shareApp.request(`/matters/${matterId}`, { headers: auth(stranger.token) });
    assert.equal(res.status, 404);
  });

  it('a REVOKED share closes access, because revocation is a timestamp not a delete', async () => {
    await shareSql`
      UPDATE matter_shares SET revoked_at = now(), revoked_by_user_id = invited_user_id
      WHERE matter_id = ${matterId}`;

    const res = await shareApp.request(`/matters/${matterId}`, { headers: auth(sharee.token) });
    assert.equal(res.status, 404, 'a revoked share that still granted access would be decorative');

    const list = await shareApp.request('/matters', { headers: auth(sharee.token) });
    const b = (await list.json()) as { data: { matters: { matterId: string }[] } };
    assert.equal(
      b.data.matters.some((m) => m.matterId === matterId),
      false,
    );

    // Restore for any later test.
    await shareSql`UPDATE matter_shares SET revoked_at = NULL, revoked_by_user_id = NULL
              WHERE matter_id = ${matterId}`;
  });
});
