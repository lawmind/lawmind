/**
 * Citator alerts endpoints — PD-5/PD-6.
 *
 * 1. **Ownership.** An alert belongs to one advocate; another advocate must not
 *    be able to read it or mark it read — same "not found = not yours" rule as
 *    matters.
 * 2. **`overruled_status` is re-read live, never taken from the payload.** An
 *    alert written when a judgment was `set_aside` must reflect a LATER reversal
 *    to `none` in `currentOverruledStatus`, even though `toStatus` in the
 *    historical payload still says `set_aside`.
 * 3. **Trigger 2 cannot be disabled.** Sending `filedCitationMoved` (or any
 *    unrecognised key) to `PATCH /me/alert-settings` is a 400, not a silent
 *    no-op — a silently-ignored field reads to the client as "saved".
 * 4. **Settings persist and are read back correctly**, including the default
 *    (all three true) for an advocate who has never touched them.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';
import { applyOverruledChange } from '../citations/fanout.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const TAG = 'test-alerts';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

async function seedAdvocate(tag: string) {
  const authId = `${TAG}-${tag}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Adv', ${email}, true)`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
    VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified') RETURNING id`;
  return { authId, userId: u!.id, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('citator alerts', () => {
  let alice: Awaited<ReturnType<typeof seedAdvocate>>;
  let bob: Awaited<ReturnType<typeof seedAdvocate>>;
  let judgmentId = '';
  let documentId = '';
  let alertId = '';

  before(async () => {
    alice = await seedAdvocate('alice');
    bob = await seedAdvocate('bob');

    const [j] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                             full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Alerts Route Fixture', '{}', 'Test Court', '2001-01-01',
              'x', 'en', ${`test://${TAG}/${crypto.randomUUID()}`}, 'none')
      RETURNING id`;
    judgmentId = j!.id;

    const [d] = await sql<{ id: string }[]>`
      INSERT INTO documents (user_id, document_type, input_params, generated_content, language)
      VALUES (${alice.userId}, 'bail', '{}'::jsonb, 'cites the fixture judgment', 'en')
      RETURNING id`;
    documentId = d!.id;
    await sql`
      INSERT INTO citation_checks
        (document_id, citation_claimed, judgment_id_matched, verification_state,
         verified_by_source, shown_to_user, overruled_status_shown, surface)
      VALUES (${documentId}, 'test citation', ${judgmentId}, 'verified', 'corpus',
              true, 'none', 'draft')`;

    // Alice filed it, so this produces exactly one `filed_citation_moved` alert
    // for Alice — trigger 2, immediate, and the one this whole suite reads back.
    const r = await applyOverruledChange(sql, {
      judgmentId,
      toStatus: 'set_aside',
      trigger: 'recheck',
    });
    assert.equal(r.applied, true, 'fixture setup: the fan-out must have actually run');

    const [a] = await sql<
      { id: string }[]
    >`SELECT id FROM alerts WHERE user_id = ${alice.userId} AND judgment_id = ${judgmentId}`;
    alertId = a!.id;
  });

  after(async () => {
    await sql`DELETE FROM alerts WHERE judgment_id = ${judgmentId}`;
    await sql`DELETE FROM citation_fanouts WHERE judgment_id = ${judgmentId}`;
    await sql`DELETE FROM citation_checks WHERE judgment_id_matched = ${judgmentId}`;
    await sql`DELETE FROM documents WHERE id = ${documentId}`;
    await sql`DELETE FROM judgments WHERE id = ${judgmentId}`;
    await sql`DELETE FROM users WHERE id = ANY(${[alice.userId, bob.userId]})`;
    await sql`DELETE FROM auth_user WHERE id = ANY(${[alice.authId, bob.authId]})`;
    await sql.end();
  });

  it('refuses rather than inventing a user', async () => {
    assert.equal((await app.request('/alerts')).status, 401);
    assert.equal((await app.request('/me/alert-settings')).status, 401);
  });

  it('lists the alert with the historical payload AND the live overruled_status', async () => {
    const res = await app.request('/alerts', { headers: auth(alice.token) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: {
        alerts: {
          id: string;
          kind: string;
          severity: string;
          toStatus: string;
          currentOverruledStatus: string;
          readAt: string | null;
        }[];
        unreadCount: number;
      };
    };
    const found = body.data.alerts.find((a) => a.id === alertId);
    assert.ok(found, 'the alert written by the fan-out must be listed');
    assert.equal(found!.kind, 'filed_citation_moved');
    assert.equal(found!.severity, 'immediate');
    assert.equal(found!.toStatus, 'set_aside');
    assert.equal(found!.currentOverruledStatus, 'set_aside');
    assert.equal(found!.readAt, null);
    assert.ok(body.data.unreadCount >= 1);
  });

  it("a different advocate's alerts are invisible — bob sees none of alice's", async () => {
    const res = await app.request('/alerts', { headers: auth(bob.token) });
    const body = (await res.json()) as { data: { alerts: { id: string }[] } };
    assert.equal(
      body.data.alerts.some((a) => a.id === alertId),
      false,
    );
  });

  it('bob cannot mark alice\'s alert read — not found, not "not yours"', async () => {
    const res = await app.request(`/alerts/${alertId}/read`, {
      method: 'POST',
      headers: auth(bob.token),
    });
    assert.equal(res.status, 404);
  });

  it('overruled_status is RE-READ LIVE — a later reversal shows even though the payload still says set_aside', async () => {
    // The world moves after the alert was written: an admin correction reverses
    // the flip. currentOverruledStatus must track that; toStatus must not.
    const r = await applyOverruledChange(sql, {
      judgmentId,
      toStatus: 'none',
      trigger: 'admin_correction',
    });
    assert.equal(r.applied, true);

    const res = await app.request('/alerts', { headers: auth(alice.token) });
    const body = (await res.json()) as {
      data: { alerts: { id: string; toStatus: string; currentOverruledStatus: string }[] };
    };
    const found = body.data.alerts.find((a) => a.id === alertId)!;
    assert.equal(
      found.toStatus,
      'set_aside',
      'the historical fact of what happened does not change',
    );
    assert.equal(
      found.currentOverruledStatus,
      'none',
      'the live corpus status DOES change — never cached',
    );
  });

  it('alice marks her own alert read, idempotently', async () => {
    const first = await app.request(`/alerts/${alertId}/read`, {
      method: 'POST',
      headers: auth(alice.token),
    });
    assert.equal(first.status, 200);
    // `isoColumn`, via the /alerts response, not a raw SELECT: postgres.js
    // returns an un-cast timestamptz as a `Date` object, and two separate
    // queries produce two DISTINCT Date instances with the same value —
    // `assert.equal` compares objects by reference, so that comparison would
    // "fail" over a difference that was never real. This is the same driver-
    // representation hazard `iso-time.ts` exists to prevent everywhere else.
    const readAt1 = (
      (await (await app.request('/alerts', { headers: auth(alice.token) })).json()) as {
        data: { alerts: { id: string; readAt: string | null }[] };
      }
    ).data.alerts.find((a) => a.id === alertId)?.readAt;
    assert.ok(readAt1);

    const second = await app.request(`/alerts/${alertId}/read`, {
      method: 'POST',
      headers: auth(alice.token),
    });
    assert.equal(second.status, 200, 're-marking an already-read alert must succeed, not error');
    const readAt2 = (
      (await (await app.request('/alerts', { headers: auth(alice.token) })).json()) as {
        data: { alerts: { id: string; readAt: string | null }[] };
      }
    ).data.alerts.find((a) => a.id === alertId)?.readAt;
    assert.equal(readAt2, readAt1, 'the timestamp must not move on a second read');
  });

  it('settings default to all true for an advocate who has never touched them', async () => {
    const res = await app.request('/me/alert-settings', { headers: auth(bob.token) });
    const body = (await res.json()) as {
      data: {
        settings: {
          savedAuthorityMoved: boolean;
          ownMatterJudgment: boolean;
          unknownListing: boolean;
        };
      };
    };
    assert.deepEqual(body.data.settings, {
      savedAuthorityMoved: true,
      ownMatterJudgment: true,
      unknownListing: true,
    });
  });

  it('PATCH updates only the sent keys, and persists', async () => {
    const res = await app.request('/me/alert-settings', {
      method: 'PATCH',
      headers: { ...auth(bob.token), 'content-type': 'application/json' },
      body: JSON.stringify({ savedAuthorityMoved: false }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: { settings: { savedAuthorityMoved: boolean; ownMatterJudgment: boolean } };
    };
    assert.equal(body.data.settings.savedAuthorityMoved, false);
    assert.equal(
      body.data.settings.ownMatterJudgment,
      true,
      'an omitted key must be untouched, not reset',
    );

    const [row] = await sql<
      { v: boolean }[]
    >`SELECT alert_saved_authority_moved AS v FROM users WHERE id = ${bob.userId}`;
    assert.equal(row?.v, false);
  });

  it('TRIGGER 2 CANNOT BE DISABLED — sending its key is a 400, not a silent no-op', async () => {
    const res = await app.request('/me/alert-settings', {
      method: 'PATCH',
      headers: { ...auth(bob.token), 'content-type': 'application/json' },
      body: JSON.stringify({ filedCitationMoved: false }),
    });
    assert.equal(
      res.status,
      400,
      'an unrecognised key — especially this one — must be rejected, not ignored',
    );
  });

  it('a disabled saved-authority setting means no NEW saved_authority_moved alert is written', async () => {
    // Bob has never seen this judgment via a search or a filed document, so he
    // is not in any audience for it — this asserts the SETTING is honoured by
    // checking that flipping it produces zero rows for bob specifically, using
    // a second judgment so the earlier fixture's alerts do not confound the count.
    const [j2] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                             full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Alerts Settings Fixture', '{}', 'Test Court', '2001-01-01',
              'x', 'en', ${`test://${TAG}/${crypto.randomUUID()}`}, 'none')
      RETURNING id`;
    const [s] = await sql<{ id: string }[]>`
      INSERT INTO searches (user_id, query_text, query_language, results_returned, model_used)
      VALUES (${bob.userId}, 'q', 'en', 1, 'test-model') RETURNING id`;
    await sql`
      INSERT INTO citation_checks
        (search_id, citation_claimed, judgment_id_matched, verification_state,
         verified_by_source, shown_to_user, overruled_status_shown, surface)
      VALUES (${s!.id}, 'c', ${j2!.id}, 'verified', 'corpus', true, 'none', 'search')`;

    const r = await applyOverruledChange(sql, {
      judgmentId: j2!.id,
      toStatus: 'doubted',
      trigger: 'recheck',
    });
    assert.equal(r.applied, true);

    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM alerts WHERE user_id = ${bob.userId} AND judgment_id = ${j2!.id}`;
    assert.equal(
      row?.n,
      0,
      'alert_saved_authority_moved = false must suppress the write, not just the read',
    );

    await sql`DELETE FROM citation_fanouts WHERE judgment_id = ${j2!.id}`;
    await sql`DELETE FROM citation_checks WHERE judgment_id_matched = ${j2!.id}`;
    await sql`DELETE FROM searches WHERE id = ${s!.id}`;
    await sql`DELETE FROM judgments WHERE id = ${j2!.id}`;
  });
});
