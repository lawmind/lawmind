/**
 * ATTRIBUTION IS ON EVERY PERMITTED REQUEST, AND IT IS NOT THE USER-AGENT.
 *
 * The grant requires attribution on every request. It does NOT, on any record in
 * this repository, require a particular HTTP header — `CLAUDE.md` §6a says the
 * attribution string is *"an internal audited attribution ... not a phrase the
 * grant requires us to quote verbatim"*, and nothing names a channel.
 *
 * So the two concepts were separated: `User-Agent` identifies the client
 * software, `x-lawmind-attribution` carries the compliance value. This test is
 * what stops that separation from quietly becoming a REMOVAL.
 *
 * It asserts at the transport, with a `fetchImpl` spy, because the guarantee is
 * about bytes on the wire and not about a constant being defined.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import {
  ECOURTS_ATTRIBUTION_HEADER,
  ECOURTS_CLIENT_USER_AGENT,
  fetchCauseList,
} from './ecourts.ts';
import { attributionForWire } from './authorisation.ts';
import { NON_NETWORK_TEST_ENDPOINT_PREFIX } from './guard.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

type Seen = { url: string; headers: Record<string, string> };

/**
 * A fetch that records what it was asked to send and answers plausibly, so the
 * session can proceed far enough to make more than one request. **No socket is
 * opened.**
 */
function recordingFetch(seen: Seen[]): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    seen.push({ url: String(input), headers });
    return new Response('<html><body>recorded, not served</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html', 'set-cookie': 'SERVICES_SESSID=test; Path=/' },
    });
  }) as unknown as typeof fetch;
}

describe('eCourts attribution transport', () => {
  after(async () => {
    await sql.end();
  });

  it('the attribution header is a dedicated header, not User-Agent', () => {
    assert.equal(ECOURTS_ATTRIBUTION_HEADER, 'x-lawmind-attribution');
    /**
     * A `User-Agent` is the most-logged header on the internet — proxies, CDNs
     * and analytics keep it by default. A compliance value identifying our
     * authorised access does not belong in the field most likely to be written
     * to somebody else's disk.
     */
    assert.notEqual(ECOURTS_ATTRIBUTION_HEADER, 'user-agent');
  });

  it('the User-Agent identifies the client and does NOT impersonate a browser', () => {
    assert.match(ECOURTS_CLIENT_USER_AGENT, /^LawMind\//);
    /**
     * Claiming to be Chrome would be a misrepresentation to the party that
     * authorised us — a bad trade for a header nobody is checking.
     */
    for (const lie of ['Mozilla', 'Chrome', 'Safari', 'Gecko', 'AppleWebKit']) {
      assert.ok(
        !ECOURTS_CLIENT_USER_AGENT.includes(lie),
        `the client identity must not impersonate a browser; found ${lie}`,
      );
    }
  });

  it('the User-Agent no longer carries the attribution value', () => {
    const attribution = attributionForWire();
    if (!attribution) return; // Unconfigured here; guard.decide refuses anyway.
    assert.notEqual(
      ECOURTS_CLIENT_USER_AGENT,
      attribution,
      'the attribution must not be the User-Agent — that is the change this test protects',
    );
  });

  it('EVERY request the session makes carries the attribution header', async (t) => {
    const attribution = attributionForWire();
    if (!attribution) {
      return t.skip('ECOURTS_GRANT_ATTRIBUTION is not configured in this environment');
    }

    const seen: Seen[] = [];
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * A `test://` ENDPOINT, BECAUSE THE FIRST VERSION OF THIS TEST SPENT REAL
     * QUOTA
     * ─────────────────────────────────────────────────────────────────────────
     *
     * It originally called `openCauseListSession` against the real base URL.
     * No socket opened — `fetchImpl` is a spy — but `reserve()` runs BEFORE the
     * transport, by design, so the run still burned one of the grant's 1,000
     * daily slots and left a permanent row in an append-only ledger. Measured:
     * `ecourts_fetch_ledger` 162 -> 163, `official_source_artifact` 37 -> 38.
     * On CI that is a slot per run to check a header.
     *
     * `NON_NETWORK_TEST_ENDPOINT_PREFIX` is the seam R11 built for exactly this:
     * these rows are excluded from the quota arithmetic by identity rather than
     * by a flag somebody has to remember. The header construction under test is
     * the same `guardedRequest` code either way — that is the whole point of
     * there being ONE network path.
     */
    await fetchCauseList(
      sql,
      { tier: 'interface_probe', probe: 'attribution_transport_test', listDate: '2026-08-30' },
      {
        endpoint: `${NON_NETWORK_TEST_ENDPOINT_PREFIX}attribution-probe`,
        fetchImpl: recordingFetch(seen),
      },
    );

    if (seen.length === 0) {
      return t.skip('the guard refused before any request was made — nothing to attribute');
    }

    /**
     * Compared as DIGESTS, never as values. `assert.equal` prints both sides on
     * failure, and the registrar asked that their identifiers stay out of the
     * application — a failing test that dumps the grant string into CI output is
     * the leak this whole module is careful about everywhere else.
     */
    const expected = createHash('sha256').update(attribution).digest('hex');
    for (const request of seen) {
      const sent = request.headers[ECOURTS_ATTRIBUTION_HEADER];
      assert.ok(sent, `unattributed request to ${request.url}`);
      assert.equal(
        createHash('sha256').update(sent).digest('hex'),
        expected,
        `attribution digest mismatch on ${request.url}`,
      );
      assert.equal(request.headers['user-agent'], ECOURTS_CLIENT_USER_AGENT);
    }
  });
});
