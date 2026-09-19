/**
 * Saved searches — the feed, and the promise that it stays a feed.
 *
 * PD-5 excluded subject-following from notifications: *"that is discovery, not an
 * alert — it belongs in the app, never in a notification"*. PD-6 gives the reason
 * that makes it load-bearing: a wrong cadence trains advocates to switch
 * notifications off entirely, and they take the hearing reminders with them. A
 * missed hearing is the harm.
 *
 * That decision is enforced by an ABSENCE — no `notified_at`, no delivery state,
 * nothing that emits. Absences rot silently, because adding a column or a call is
 * never blocked by a test that does not know to look for it. So these tests assert
 * the absence directly, and name the decision, so that re-adding it fails here
 * with the reason rather than shipping.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';
import { savedSearchBody } from './saved.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

describe('saved searches', () => {
  let hasTable = false;

  before(async () => {
    const rows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_name = 'saved_searches'`;
    hasTable = (rows[0]?.n ?? 0) > 0;
  });

  after(async () => {
    await sql.end();
  });

  const app = createApp({
    ping: async () => {},
    search: { sql, embedQuery: async () => null },
  });

  it('refuses rather than inventing a user, because a saved search belongs to one', async () => {
    // Auth is S5 and unbuilt. `saved_searches.user_id` is NOT NULL, correctly. The
    // failure mode this guards is a sequencing gap being papered over with an
    // anonymous or shared user, which would make one advocate's feed visible to
    // another the moment auth landed.
    for (const [method, path] of [
      ['GET', '/saved-searches'],
      ['POST', '/saved-searches'],
      ['DELETE', '/saved-searches/00000000-0000-0000-0000-000000000000'],
      ['GET', '/saved-searches/00000000-0000-0000-0000-000000000000/feed'],
    ] as const) {
      // Built conditionally rather than with `body: undefined` — under
      // `exactOptionalPropertyTypes` an explicit undefined is not the same as an
      // absent key, and RequestInit does not accept it.
      const init: RequestInit =
        method === 'POST'
          ? {
              method,
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ query: 'bail', language: 'en' }),
            }
          : { method };
      const res = await app.request(path, init);
      const body = (await res.json()) as { ok: boolean; error?: { code: string } };
      assert.equal(res.status, 401, `${method} ${path} must not answer without a user`);
      assert.equal(body.error?.code, 'AUTH_REQUIRED');
    }
  });

  /**
   * N-7 moved WHERE this is asserted, not WHAT it asserts.
   *
   * This used to post `language: 'fr'` to `/saved-searches` and expect 400. It
   * got one only because body validation ran BEFORE the auth check — the defect
   * Gate C recorded as N-7. The route now refuses first, so an anonymous caller
   * gets 401 whatever the body says.
   *
   * The contract is `savedSearchBody`, so it is asserted on the schema, which
   * also lets it check the accept case — something the route test never could
   * without a session.
   */
  it('rejects a language outside the contract', () => {
    assert.equal(
      savedSearchBody.safeParse({ query: 'anticipatory bail', language: 'fr' }).success,
      false,
      'fr is outside the contract and must not parse',
    );
    for (const language of ['en', 'hi']) {
      assert.equal(
        savedSearchBody.safeParse({ query: 'anticipatory bail', language }).success,
        true,
        `${language} is in the contract and must parse — otherwise the check above is vacuous`,
      );
    }
  });

  it('N-7: an out-of-contract body still gets 401 without a user, never 400', async () => {
    /**
     * The ordering, asserted with a body that would definitely have failed
     * validation. With a VALID body this would pass even if the ordering were
     * reversed, which is exactly why the malformed one is the case worth keeping.
     */
    const res = await app.request('/saved-searches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'anticipatory bail', language: 'fr' }),
    });
    assert.equal(res.status, 401, 'the schema is still walkable without a session');
    const body = (await res.json()) as { error?: { code: string } };
    assert.equal(body.error?.code, 'AUTH_REQUIRED');
  });

  it('carries no delivery state — PD-5, and the column must never come back', async (t) => {
    if (!hasTable) return t.skip('needs the saved_searches table');

    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'saved_searches'`;
    const names = cols.map((c) => c.column_name);

    for (const forbidden of ['notified_at', 'notified', 'push_sent_at', 'delivered_at']) {
      assert.ok(
        !names.includes(forbidden),
        `saved_searches.${forbidden} exists. PD-5 excludes subject-following from ` +
          'notifications entirely — "that is discovery, not an alert; it belongs in the ' +
          'app, never in a notification". A delivery column invites a delivery, and PD-6 ' +
          'is why that matters: advocates who disable notifications lose hearing reminders too.',
      );
    }
    // The columns the feed genuinely needs, so this test fails loudly if the
    // table is reshaped rather than passing on a table that no longer exists.
    for (const required of ['user_id', 'query_text', 'query_language', 'last_seen_at']) {
      assert.ok(names.includes(required), `saved_searches.${required} is missing`);
    }
  });

  it('sends nothing — the module has no notification path at all', () => {
    // A source-level assertion on purpose. The runtime cannot prove a negative
    // about code that was never called, and the decision being protected is
    // "nothing here emits", not "nothing emitted on this request".
    const source = readFileSync(new URL('./saved.ts', import.meta.url), 'utf8');
    for (const forbidden of ['expo-server-sdk', 'sendPush', 'notify(', 'postmark', 'sendMail']) {
      assert.ok(
        !source.includes(forbidden),
        `search/saved.ts references ${forbidden}. This endpoint feeds an in-app list ` +
          'and must never deliver anything (PD-5, PD-6).',
      );
    }
  });
});
