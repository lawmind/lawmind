/**
 * S6 admin — platform controls, disputes, the audit ledger, the citation
 * monitor, users/enrolment. One file because they share fixtures and the
 * story is the same throughout: **every privileged write is an audit write
 * first**, and PD-2 / the fan-out's single-implementation rule hold here too.
 *
 * `admin/audit.ts`'s module note is the standing caveat for every 401 assert
 * below: these gate on authentication only, because there is no role column
 * yet (`ADMIN_SURFACE.md` §15, "Role writes are still missing... by design").
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';

import { createApp } from '../app.ts';
import { createIsolatedSchema } from '../testing/isolated-schema.ts';

/**
 * `platform_config` is ISOLATED for this suite - `testing/isolated-schema.ts`.
 *
 * The kill-switch case below toggles `signups` through the real endpoint, which
 * is the point of it: the property under test is that the config row and the
 * audit row move together. It used to toggle the PRODUCTION row and put it back
 * afterwards, and the live database still carries the evidence that this is not
 * a promise a test can keep - `platform_config.signups.reason` is literally
 * "test cleanup", written by a fixture user.
 *
 * The app is constructed with this client, so `admin/platform.ts` resolves
 * `platform_config` into the throwaway schema without knowing the fixture
 * exists. The founder's real `signups` state is not restored correctly here; it
 * is unreachable.
 */
const isolation = await createIsolatedSchema(process.env['DATABASE_URL'] ?? '');
const sql = isolation.connect({ max: 3 });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const TAG = 'test-admin';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

/**
 * `role` defaults to `advocate` — migration `0074` — so a fixture that wants the
 * admin surface must ASK for it. That default is the deny-by-default property
 * under test, not a convenience: seeding an admin has to be a deliberate act
 * here for the same reason it is a deliberate act in production.
 */
async function seedAdvocate(tag: string, role: 'advocate' | 'admin' = 'advocate') {
  const authId = `${TAG}-${tag}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Adv', ${email}, true)`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status, role)
    VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified', ${role}) RETURNING id`;
  return { authId, userId: u!.id, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const json = { 'content-type': 'application/json' };

describe('S6 admin', () => {
  let admin: Awaited<ReturnType<typeof seedAdvocate>>;
  let ordinary: Awaited<ReturnType<typeof seedAdvocate>>;

  before(async () => {
    admin = await seedAdvocate('admin', 'admin');
    ordinary = await seedAdvocate('ordinary');
  });

  after(async () => {
    await sql`DELETE FROM platform_config WHERE key = ANY(${['test_flag_' + TAG]})`;
    // The schema goes with it, so even this delete is belt-and-braces.
    // `admin` is left in place, deliberately. Every test above writes an
    // audit_log row with actor_user_id = admin.userId, and audit_log is
    // APPEND-ONLY — REVOKE'd UPDATE/DELETE plus a raising trigger
    // (0002_audit_log_append_only.sql). That is not a test inconvenience to
    // work around; it is the governance property the table exists to
    // guarantee, so a user who has ever performed an audited action genuinely
    // cannot be deleted, in a test or in production. `TAG` keeps this fixture
    // identifiable as synthetic, the same convention `SYNTHETIC —` judgment
    // titles use elsewhere for rows other suites cannot clean up either.
    await isolation.drop();
  });

  describe('401 without a token — every route in this section', () => {
    const routes: [string, string][] = [
      ['GET', '/admin/platform'],
      ['GET', '/admin/disputes'],
      ['GET', '/admin/audit'],
      ['GET', '/admin/citations'],
      ['GET', '/admin/llm-costs'],
      ['GET', '/admin/ocr-queue'],
      ['GET', '/admin/users'],
    ];
    for (const [method, path] of routes) {
      it(`${method} ${path}`, async () => {
        const res = await app.request(path, { method });
        assert.equal(res.status, 401);
      });
    }
  });

  /**
   * The hole this closes, stated as a test rather than as a comment.
   *
   * Until migration `0074` every route below gated on "is anyone signed in",
   * which the module note in `admin/audit.ts` recorded honestly as a known gap.
   * An ordinary advocate — the overwhelming majority of this product's users —
   * could read the audit ledger, list every user with their phone number, and
   * flip the eCourts kill switch. `ordinary` is seeded with the DEFAULT role, so
   * this suite fails the moment somebody makes admin the default or removes the
   * prefix middleware.
   */
  describe('403 for an authenticated advocate who is not an admin', () => {
    const routes: [string, string][] = [
      ['GET', '/admin/platform'],
      ['GET', '/admin/disputes'],
      ['GET', '/admin/audit'],
      ['GET', '/admin/citations'],
      ['GET', '/admin/llm-costs'],
      ['GET', '/admin/ocr-queue'],
      ['GET', '/admin/users'],
      ['GET', '/admin/data-requests'],
      ['GET', '/admin/cause-lists'],
    ];
    for (const [method, path] of routes) {
      it(`${method} ${path}`, async () => {
        const res = await app.request(path, { method, headers: auth(ordinary.token) });
        assert.equal(res.status, 403, `${path} let a non-admin through`);
      });
    }

    it('a privileged WRITE is refused too, and writes nothing', async () => {
      const before = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM audit_log`;
      const res = await app.request('/admin/platform/kill-switches/signups', {
        method: 'POST',
        headers: { ...auth(ordinary.token), ...json },
        body: JSON.stringify({ enabled: true, reason: 'should never apply' }),
      });
      assert.equal(res.status, 403);
      const after2 = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM audit_log`;
      assert.equal(after2[0]!.n, before[0]!.n, 'a refused admin write still touched the ledger');
    });
  });

  describe('platform controls', () => {
    it('GET /admin/platform lists all SIX kill switches, not five', async () => {
      const res = await app.request('/admin/platform', { headers: auth(admin.token) });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { killSwitches: { key: string }[] } };
      const keys = body.data.killSwitches.map((k) => k.key).sort();
      assert.deepEqual(keys, [
        'briefings',
        'drafting',
        'ecourts_harvest',
        'ocr_intake',
        'search',
        'signups',
      ]);
    });

    it('rejects a kill-switch key outside the fixed set with a 400, before the database ever sees it', async () => {
      const res = await app.request('/admin/platform/kill-switches/not_a_real_switch', {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ enabled: true, reason: 'test' }),
      });
      assert.equal(res.status, 400);
    });

    it('rejects a kill-switch toggle with no reason', async () => {
      const res = await app.request('/admin/platform/kill-switches/signups', {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ enabled: true }),
      });
      assert.equal(res.status, 400);
    });

    it('toggling a kill switch writes platform_config AND audit_log in the same transaction', async () => {
      const reason = `test toggle ${crypto.randomUUID()}`;
      const res = await app.request('/admin/platform/kill-switches/signups', {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ enabled: true, reason }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { killSwitch: { key: string; enabled: boolean } };
      };
      assert.equal(body.data.killSwitch.enabled, true);

      const [row] = await sql<{ enabled: boolean; reason: string }[]>`
        SELECT enabled, reason FROM platform_config WHERE key = 'signups'`;
      assert.equal(row?.enabled, true);
      assert.equal(row?.reason, reason);

      const [audit] = await sql<{ action: string; reason: string }[]>`
        SELECT action, reason FROM audit_log
        WHERE action = 'platform.kill_switch.toggle' AND target_id = 'signups'
        ORDER BY created_at DESC LIMIT 1`;
      assert.equal(audit?.reason, reason);

      // Leave it as found - false, the fixture's created-OFF default - so this
      // test is not order-dependent on the other cases in this file. It is no
      // longer load-bearing for production safety: the row lives in a throwaway
      // schema, and a killed run cannot leave signups in the wrong state.
      await app.request('/admin/platform/kill-switches/signups', {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ enabled: false, reason: 'test cleanup' }),
      });
    });

    it('a flag accepts a rolloutPercent and writes platform.flag.set', async () => {
      const key = `test_flag_${TAG}`;
      const res = await app.request(`/admin/platform/flags/${key}`, {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ enabled: true, rolloutPercent: 25 }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { flag: { rolloutPercent: number } } };
      assert.equal(body.data.flag.rolloutPercent, 25);

      const [audit] = await sql<{ action: string }[]>`
        SELECT action FROM audit_log WHERE action = 'platform.flag.set' AND target_id = ${key}
        ORDER BY created_at DESC LIMIT 1`;
      assert.equal(audit?.action, 'platform.flag.set');
    });
  });

  describe('disputes — the fan-out, called through the admin door', () => {
    let judgmentId = '';
    let citationCheckId = '';
    let disputeId = '';
    let noJudgmentDisputeId = '';

    before(async () => {
      const [j] = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                               full_text, language, source_url, overruled_status)
        VALUES ('SYNTHETIC — Admin Dispute Fixture', '{}', 'Test Court', '2001-01-01',
                'x', 'en', ${`test://${TAG}/${crypto.randomUUID()}`}, 'none')
        RETURNING id`;
      judgmentId = j!.id;

      const [cc] = await sql<{ id: string }[]>`
        INSERT INTO citation_checks
          (citation_claimed, judgment_id_matched, verification_state,
           verified_by_source, shown_to_user, overruled_status_shown, surface)
        VALUES ('test citation', ${judgmentId}, 'verified', 'corpus', true, 'none', 'search')
        RETURNING id`;
      citationCheckId = cc!.id;

      const [d] = await sql<{ id: string }[]>`
        INSERT INTO citation_disputes (reported_by_user_id, citation_check_id, judgment_id, claim)
        VALUES (${admin.userId}, ${citationCheckId}, ${judgmentId}, 'this authority was set aside')
        RETURNING id`;
      disputeId = d!.id;

      const [d2] = await sql<{ id: string }[]>`
        INSERT INTO citation_disputes (reported_by_user_id, claim)
        VALUES (${admin.userId}, 'a claim about the check itself, no judgment')
        RETURNING id`;
      noJudgmentDisputeId = d2!.id;
    });

    after(async () => {
      await sql`DELETE FROM alerts WHERE judgment_id = ${judgmentId}`;
      await sql`DELETE FROM citation_disputes WHERE id = ANY(${[disputeId, noJudgmentDisputeId]})`;
      await sql`DELETE FROM citation_fanouts WHERE judgment_id = ${judgmentId}`;
      await sql`DELETE FROM citation_checks WHERE id = ${citationCheckId}`;
      await sql`DELETE FROM judgments WHERE id = ${judgmentId}`;
    });

    it('GET /admin/disputes/:id previews the blast radius without writing anything', async () => {
      const res = await app.request(`/admin/disputes/${disputeId}`, { headers: auth(admin.token) });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { impact: { savedCount: number; filedCount: number; copiedCount: number } };
      };
      assert.equal(body.data.impact.savedCount, 1);

      const [j] = await sql<
        { s: string }[]
      >`SELECT overruled_status AS s FROM judgments WHERE id = ${judgmentId}`;
      assert.equal(j?.s, 'none', 'a GET must not have moved the corpus');
    });

    it('uphold with no judgment_id refuses 422 rather than a fan-out with nothing to act on', async () => {
      const res = await app.request(`/admin/disputes/${noJudgmentDisputeId}/uphold`, {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ correction: { toStatus: 'set_aside' }, reason: 'x' }),
      });
      assert.equal(res.status, 422);
    });

    it('uphold moves the corpus, resolves the dispute, and audits both in one call', async () => {
      const res = await app.request(`/admin/disputes/${disputeId}/uphold`, {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({
          correction: { toStatus: 'set_aside' },
          reason: 'confirmed against the reported judgment',
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { corrected: boolean; reverificationJobId: string; affectedSaved: number };
      };
      assert.equal(body.data.corrected, true);
      assert.ok(
        body.data.reverificationJobId,
        'stands in for a job id — see the module note on why',
      );
      assert.equal(body.data.affectedSaved, 1);

      const [j] = await sql<
        { s: string }[]
      >`SELECT overruled_status AS s FROM judgments WHERE id = ${judgmentId}`;
      assert.equal(j?.s, 'set_aside', 'the SAME fan-out the re-check uses must have run');

      const [d] = await sql<{ status: string; resolved_by_user_id: string }[]>`
        SELECT status, resolved_by_user_id FROM citation_disputes WHERE id = ${disputeId}`;
      assert.equal(d?.status, 'upheld');
      assert.equal(d?.resolved_by_user_id, admin.userId);

      const [audit] = await sql<{ action: string }[]>`
        SELECT action FROM audit_log WHERE action = 'dispute.uphold' AND target_id = ${disputeId}`;
      assert.equal(audit?.action, 'dispute.uphold');
    });

    it('an already-resolved dispute refuses a second uphold with 409', async () => {
      const res = await app.request(`/admin/disputes/${disputeId}/uphold`, {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ correction: { toStatus: 'doubted' }, reason: 'retry' }),
      });
      assert.equal(res.status, 409);
    });

    it('reject leaves the corpus untouched and writes no fan-out', async () => {
      const [d3] = await sql<{ id: string }[]>`
        INSERT INTO citation_disputes (reported_by_user_id, citation_check_id, judgment_id, claim)
        VALUES (${admin.userId}, ${citationCheckId}, ${judgmentId}, 'a second, meritless claim')
        RETURNING id`;
      const res = await app.request(`/admin/disputes/${d3!.id}/reject`, {
        method: 'POST',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ reason: 'the citation is correct as shown' }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { dispute: { status: string } } };
      assert.equal(body.data.dispute.status, 'rejected');

      const [audit] = await sql<{ action: string }[]>`
        SELECT action FROM audit_log WHERE action = 'dispute.reject' AND target_id = ${d3!.id}`;
      assert.equal(audit?.action, 'dispute.reject');
      await sql`DELETE FROM citation_disputes WHERE id = ${d3!.id}`;
    });
  });

  describe('audit ledger', () => {
    it('lists newest first and filters by targetType', async () => {
      const res = await app.request('/admin/audit?targetType=platform_config', {
        headers: auth(admin.token),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { entries: { targetType: string; createdAt: string }[] };
      };
      assert.ok(body.data.entries.length > 0);
      assert.ok(body.data.entries.every((e) => e.targetType === 'platform_config'));
      const dates = body.data.entries.map((e) => new Date(e.createdAt).getTime());
      assert.deepEqual(
        dates,
        [...dates].sort((a, b) => b - a),
      );
    });
  });

  describe('users / enrolment — PD-2', () => {
    it('PATCH moves enrolment_status only, and writes enrolment.approve', async () => {
      const other = await seedAdvocate('enrol-target');
      const res = await app.request(`/admin/users/${other.userId}/enrolment`, {
        method: 'PATCH',
        headers: { ...auth(admin.token), ...json },
        body: JSON.stringify({ status: 'verified' }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { user: { enrolmentStatus: string } } };
      assert.equal(body.data.user.enrolmentStatus, 'verified');

      const [audit] = await sql<{ action: string }[]>`
        SELECT action FROM audit_log WHERE action = 'enrolment.approve' AND target_id = ${other.userId}`;
      assert.equal(audit?.action, 'enrolment.approve');

      await sql`DELETE FROM users WHERE id = ${other.userId}`;
      await sql`DELETE FROM auth_user WHERE id = ${other.authId}`;
    });
  });

  describe('read-only surfaces that are honestly empty today', () => {
    it('llm-costs reports zero, not an error — no LLM has ever been called', async () => {
      const res = await app.request('/admin/llm-costs', { headers: auth(admin.token) });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { total: { calls: number } } };
      assert.equal(typeof body.data.total.calls, 'number');
    });

    it('ocr-queue responds 200 with a jobs array', async () => {
      const res = await app.request('/admin/ocr-queue', { headers: auth(admin.token) });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { jobs: unknown[] } };
      assert.ok(Array.isArray(body.data.jobs));
    });
  });
});
