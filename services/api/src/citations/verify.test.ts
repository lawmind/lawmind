/**
 * Tier 3 — and the two things it must never do.
 *
 * `CITATION_HARNESS.md` step 6 defines this as the human-vouched route. Licensed
 * automation is allowed through the separate court adapter, but may write only
 * `ecourts_bulk`. The human boundary here is enforced by an ABSENCE — this
 * module makes no request to eCourts at all — and absences rot silently, so it
 * is asserted directly here.
 *
 * The second is subtler. A Tier 3 confirmation is **cached permanently, for
 * everyone**. An anonymous caller able to assert one is a way to poison the
 * harness, and the harness is the one thing in this product that cannot be
 * allowed to lie.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';
import { confirmRequest, ECOURTS_JUDGMENT_SEARCH, prefilledQuery } from './verify.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

describe('Tier 3 — eCourts', () => {
  let judgmentId: string | null = null;
  const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

  before(async () => {
    const rows = await sql<{ id: string }[]>`SELECT id FROM judgments LIMIT 1`;
    judgmentId = rows[0]?.id ?? null;
  });

  after(async () => {
    await sql.end();
  });

  it('keeps the human Tier 3 route manual; licensed bulk eCourts acquisition is a separate guarded path', () => {
    // A source-level assertion on purpose: the runtime cannot prove a negative
    // about a request that was never made, and the rule being protected is
    // "this module never calls eCourts", not "it did not call it this time".
    const source = readFileSync(new URL('./verify.ts', import.meta.url), 'utf8');
    for (const forbidden of ['fetch(', 'axios', 'got(', 'request(', 'puppeteer', 'playwright']) {
      assert.ok(
        !source.includes(forbidden),
        `citations/verify.ts references ${forbidden}. Tier 3 hands the advocate a ` +
          'door; it must never walk through it because this route records a human-vouched state.',
      );
    }
  });

  it('says the CAPTCHA is the advocate to solve, in the payload', async () => {
    const res = await app.request('/verify/ecourts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citationText: '(2019) 4 SCC 221' }),
    });
    assert.equal(res.status, 200);
    const { data } = (await res.json()) as {
      data: { ecourtsUrl: string; prefilledQuery: string; captchaRequired: boolean };
    };
    assert.equal(data.ecourtsUrl, ECOURTS_JUDGMENT_SEARCH);
    assert.equal(data.captchaRequired, true, 'the client must not have to infer this');
  });

  it('never reorders the digits of a citation', () => {
    // (2019) 4 SCC 221 and (2019) 4 SCC 212 are different cases. A search string
    // that quietly transposes them sends the advocate to the wrong judgment.
    for (const raw of ['(2019) 4 SCC 221', 'AIR 1973 SC 1461', '[1950] 1 S.C.R. 869']) {
      const digitsIn = raw.match(/\d/g)!.join('');
      const digitsOut = prefilledQuery(raw).match(/\d/g)!.join('');
      assert.equal(digitsOut, digitsIn, `digits changed for ${raw}`);
    }
  });

  it('refuses an unattributed confirmation, because it is cached forever', async (t) => {
    if (!judgmentId) return t.skip('needs a corpus');

    const res = await app.request('/verify/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citationText: '(2019) 4 SCC 221', judgmentId }),
    });
    const body = (await res.json()) as { error?: { code: string } };
    assert.equal(
      res.status,
      401,
      'an anonymous caller able to assert a permanent Tier 3 verification can poison the harness',
    );
    assert.equal(body.error?.code, 'AUTH_REQUIRED');
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * N-7 CHANGED WHERE THIS IS ASSERTED, AND DELIBERATELY NOT WHAT IT ASSERTS
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This used to post malformed bodies to `/verify/confirm` and expect 400. It
   * got one only because body validation ran BEFORE the auth check — the defect
   * Gate C recorded as N-7, where an unauthenticated caller could walk a
   * protected route's schema one 400 at a time.
   *
   * Now the route refuses first, so an anonymous caller gets 401 for every body,
   * valid or not. That is the fix working, and the test above is the security
   * property it protects.
   *
   * **The validator coverage is not dropped, it is moved to the schema itself** —
   * and this is strictly more coverage than before, because the schema can be
   * exercised for every rejected shape without needing a session for each. The
   * contract is `confirmRequest`; asserting it directly tests the thing that
   * defines the contract rather than one route's plumbing.
   */
  it('the shared validator still rejects every malformed body — asserted on the schema', () => {
    for (const body of [
      {},
      { citationText: '' },
      { citationText: 'x', judgmentId: 'not-a-uuid' },
    ]) {
      assert.equal(
        confirmRequest.safeParse(body).success,
        false,
        `confirmRequest should have rejected ${JSON.stringify(body)}`,
      );
    }
    // And it still accepts a well-formed one, so the check above is not vacuous.
    assert.equal(
      confirmRequest.safeParse({
        citationText: '2022 INSC 690',
        judgmentId: '00000000-0000-0000-0000-000000000000',
      }).success,
      true,
    );
  });

  it('N-7: an anonymous caller gets 401 for a MALFORMED body too, never 400', async () => {
    /**
     * The ordering itself, asserted with a body that would definitely have
     * failed validation. A test using a VALID body would pass even with the
     * ordering reversed, which is what makes this the one worth keeping.
     */
    const res = await app.request('/verify/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citationText: 'x', judgmentId: 'not-a-uuid' }),
    });
    assert.equal(res.status, 401, 'the schema is still walkable without a session');
    const body = (await res.json()) as { error?: { code: string } };
    assert.equal(body.error?.code, 'AUTH_REQUIRED');
  });
});
