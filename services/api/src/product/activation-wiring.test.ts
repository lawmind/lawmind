/**
 * The funnel, exercised through the REAL routes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST EXISTS AND WHY IT GOES THROUGH HTTP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `activation.ts` was written, unit-tested and correct, and had **zero call
 * sites** — NEW3 found it by grepping (bus 1077), not by a failing test,
 * because every test there called `recordStep` directly. So `activation_events`
 * was empty in every environment and would have stayed empty while the funnel
 * looked implemented.
 *
 * A unit test on `recordStep` cannot catch that. Only a test that goes through
 * the route an advocate goes through can, which is why this one does.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';
import { CURRENT_TERMS_VERSION } from '../auth/account.ts';
import { ACTIVATION_STEPS } from './activation.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const TAG = 'test-actv';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

let authId = '';
let token = '';
let userId = '';
let matterId = '';
const judgmentIds: string[] = [];

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

/**
 * The writes are fire-and-forget by design — an advocate's request must not wait
 * on a metric — so the assertion has to allow the background write to land.
 * Polling with a deadline rather than a fixed sleep: a fixed sleep is either
 * flaky or slow, and usually both.
 */
async function waitForStep(step: string, ms = 4000): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    const [row] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM activation_events
       WHERE user_id = ${userId}::uuid AND step = ${step}`;
    if (Number(row?.n ?? 0) > 0) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('activation funnel — wired through the real routes', () => {
  before(async () => {
    authId = `${TAG}-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${authId}, 'Adv', ${email}, true)`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
      VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified') RETURNING id`;
    userId = u!.id;
    token = await signAccessToken({ sub: authId, email }, SECRET);

    /* Two synthetic authorities: the activation hypothesis is a SECOND one. */
    for (const n of [1, 2]) {
      const [j] = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                               full_text, language, source_url, overruled_status)
        VALUES (${`SYNTHETIC — Activation Fixture ${n}`}, '{}', 'Test Court', '2001-01-01',
                'x', 'en', ${`test://activation/${crypto.randomUUID()}`}, 'none')
        RETURNING id`;
      judgmentIds.push(j!.id);
    }
  });

  /**
   * Cleanup that survives a FAILED run, which the first version did not.
   *
   * It deleted by the ids this run happened to capture, so an assertion that
   * threw before `matterId` was assigned left the matter, its authorities and
   * both judgments behind — and three failed runs of this file leaked twelve
   * fixtures into the corpus, which is precisely the defect
   * `scripts/lcc-purge-leaked-test-fixtures.mjs` exists to clean up after.
   *
   * So it now deletes by the TAG, not by tracked state, and in dependency
   * order: everything that points at a judgment before the judgment, and
   * everything that points at a user before the user. It also sweeps rows this
   * particular run never created, which drains what earlier failed runs left.
   */
  after(async () => {
    const users = (
      await sql<{ id: string }[]>`SELECT id FROM users WHERE auth_id LIKE ${`${TAG}%`}`
    ).map((r) => r.id);
    const judgments = (
      await sql<{ id: string }[]>`
        SELECT id FROM judgments WHERE source_url LIKE 'test://activation/%'`
    ).map((r) => r.id);

    if (users.length > 0) {
      await sql`DELETE FROM activation_events WHERE user_id = ANY(${users}::uuid[])`;
      const matters = (
        await sql<{ id: string }[]>`SELECT id FROM matters WHERE user_id = ANY(${users}::uuid[])`
      ).map((r) => r.id);
      if (matters.length > 0) {
        await sql`DELETE FROM matter_authorities WHERE matter_id = ANY(${matters}::uuid[])`;
        await sql`DELETE FROM matter_events WHERE matter_id = ANY(${matters}::uuid[])`;
        await sql`DELETE FROM matters WHERE id = ANY(${matters}::uuid[])`;
      }
      await sql`DELETE FROM searches WHERE user_id = ANY(${users}::uuid[])`;
    }

    if (judgments.length > 0) {
      // Anything that points AT a judgment, before the judgment itself.
      await sql`DELETE FROM matter_authorities WHERE judgment_id = ANY(${judgments}::uuid[])`;
      await sql`DELETE FROM judgment_annotations WHERE judgment_id = ANY(${judgments}::uuid[])`;
      await sql`DELETE FROM citation_checks WHERE judgment_id_matched = ANY(${judgments}::uuid[])`;
      await sql`DELETE FROM judgment_citation_keys WHERE judgment_id = ANY(${judgments}::uuid[])`;
      await sql`DELETE FROM judgments WHERE id = ANY(${judgments}::uuid[])`;
    }

    await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}%`}`;
    await sql.end();
  });

  it('records `onboarded` when the advocate accepts the terms', async () => {
    const res = await app.request('/me/accept-terms', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ version: CURRENT_TERMS_VERSION }),
    });
    assert.equal(res.status, 200, JSON.stringify(await res.json()));
    assert.ok(await waitForStep('onboarded'), '`onboarded` was not recorded');
  });

  it('records `opened_primary_authority` when a judgment is read', async () => {
    const res = await app.request(`/judgments/${judgmentIds[0]}`, { headers: auth() });
    assert.equal(res.status, 200);
    assert.ok(
      await waitForStep('opened_primary_authority'),
      '`opened_primary_authority` was not recorded — the judgment reader is unwired',
    );
  });

  it('records `created_matter`, `saved_authority`, and the SECOND save as value', async () => {
    const made = await app.request('/matters', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        caseTitle: 'Activation v State',
        court: 'Delhi High Court',
        caseType: 'criminal',
        parties: {},
        clientName: 'Client',
        ourSide: 'accused',
      }),
    });
    /**
     * The body is read ONCE. `assert.equal(res.status, 201, await res.text())`
     * looks harmless and is not: the message argument is evaluated eagerly, so
     * it consumes the stream even when the assertion passes, and the `.json()`
     * on the next line then throws on an already-read body. That is what made
     * this test fail in 7 ms with no assertion message at all.
     */
    const madeBody = (await made.json()) as { data?: { matter?: { matterId: string } } };
    assert.equal(made.status, 201, JSON.stringify(madeBody));
    /* `matterId`, not `id` — the wire shape names it for the resource it is,
     * and reading `.id` gave `undefined` and a 404 on the next call. */
    matterId = madeBody.data!.matter!.matterId;
    assert.ok(await waitForStep('created_matter'), '`created_matter` was not recorded');

    const first = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ judgmentId: judgmentIds[0] }),
    });
    assert.equal(first.status, 201, JSON.stringify(await first.json()));
    assert.ok(await waitForStep('saved_authority'), '`saved_authority` was not recorded');

    /**
     * The activation HYPOTHESIS, and the assertion that it is the SECOND save.
     * NEW3's `ACTIVATION_FUNNEL_V1.md` proposes `AUTHORITY_SAVED_TO_MATTER`
     * over "two briefings opened" — cheaper, and independent of the briefing
     * feature this round's own evidence says is not trustworthy yet.
     */
    const [beforeSecond] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM activation_events
       WHERE user_id = ${userId}::uuid AND step = 'experienced_matter_value'`;
    assert.equal(
      beforeSecond?.n,
      '0',
      'one saved authority already counted as matter value — the hypothesis is a SECOND one',
    );

    const second = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ judgmentId: judgmentIds[1] }),
    });
    assert.equal(second.status, 201, JSON.stringify(await second.json()));
    assert.ok(
      await waitForStep('experienced_matter_value'),
      'the second saved authority did not record `experienced_matter_value`',
    );
  });

  it('records `first_successful_search` only for a search that FOUND something', async () => {
    /**
     * The adjective is the test. A search that returns nothing is not the
     * moment an advocate found the law, and counting it would make the funnel's
     * widest step the one that measures least.
     */
    const empty = await app.request('/search', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        query: `zzz-no-such-term-${crypto.randomUUID()}`,
        language: 'en',
      }),
    });
    assert.equal(empty.status, 200);
    await new Promise((r) => setTimeout(r, 400));
    const [afterEmpty] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM activation_events
       WHERE user_id = ${userId}::uuid AND step = 'first_successful_search'`;
    assert.equal(afterEmpty?.n, '0', 'a zero-result search counted as a successful one');

    const found = await app.request('/search', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ query: 'bail', language: 'en' }),
    });
    assert.equal(found.status, 200);
    const results = ((await found.json()) as { data?: { results?: unknown[] } }).data?.results ?? [];
    if (results.length === 0) return; // an empty corpus proves nothing either way
    assert.ok(
      await waitForStep('first_successful_search'),
      '`first_successful_search` was not recorded — the search route is unwired',
    );
  });

  it('every step this suite exercised is a REAL member of ACTIVATION_STEPS', async () => {
    /* Guards the typo that would write a step nothing aggregates. */
    const rows = await sql<{ step: string }[]>`
      SELECT DISTINCT step FROM activation_events WHERE user_id = ${userId}::uuid`;
    assert.ok(rows.length > 0, 'nothing was recorded at all');
    for (const r of rows) {
      assert.ok(
        (ACTIVATION_STEPS as readonly string[]).includes(r.step),
        `unknown step written: ${r.step}`,
      );
    }
  });
});
