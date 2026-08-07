/**
 * Tier 3 — and the two things it must never do.
 *
 * `CLAUDE.md` §6 and `CITATION_HARNESS.md` step 6 both say it outright: never
 * bypass the eCourts CAPTCHA. It is a government system and circumventing it is
 * fragile and legally reckless. That rule is enforced by an ABSENCE — this module
 * makes no request to eCourts at all — and absences rot silently, so it is
 * asserted directly here.
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
import { ECOURTS_JUDGMENT_SEARCH, prefilledQuery } from './verify.ts';

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

  it('never solves the CAPTCHA, and never fetches from eCourts', () => {
    // A source-level assertion on purpose: the runtime cannot prove a negative
    // about a request that was never made, and the rule being protected is
    // "this module never calls eCourts", not "it did not call it this time".
    const source = readFileSync(new URL('./verify.ts', import.meta.url), 'utf8');
    for (const forbidden of ['fetch(', 'axios', 'got(', 'request(', 'puppeteer', 'playwright']) {
      assert.ok(
        !source.includes(forbidden),
        `citations/verify.ts references ${forbidden}. Tier 3 hands the advocate a ` +
          'door; it must never walk through it. CLAUDE.md §6: never bypass the eCourts CAPTCHA.',
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

  it('rejects a malformed body through the shared validator', async () => {
    for (const body of [
      {},
      { citationText: '' },
      { citationText: 'x', judgmentId: 'not-a-uuid' },
    ]) {
      const res = await app.request('/verify/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 400, `should have rejected ${JSON.stringify(body)}`);
    }
  });
});
