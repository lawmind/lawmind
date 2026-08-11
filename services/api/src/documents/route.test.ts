/**
 * PD-7 — citations are locked, and the SERVER is the lock.
 *
 * A hand-edited citation breaks the verification chain while the badge goes on
 * asserting something nobody checked. That is **the hallucination failure
 * arriving through a different door**, and it is harder to catch than a fabricated
 * citation because this one was genuinely verified once.
 *
 * The client's lock glyph is presentation. A second client, a stale build, or a
 * `curl` has no glyph. These tests are the enforcement.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';
import { extractCitationSpans } from './route.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const TAG = 'test-doc';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

let token = '';
let userId = '';
let documentId = '';
let judgmentId = '';
let setAsideId = '';

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

describe('citation extraction', () => {
  it('finds every citation form an Indian judgment actually uses', () => {
    const found = extractCitationSpans(
      'Relying on (2019) 4 SCC 221 and AIR 1973 SC 1461, and on 2024 INSC 123, ' +
        'together with [1950] 1 S.C.R. 869, the applicant submits.',
    );
    // A regex that knows one format is a lock with one key missing.
    assert.ok(found.some((f) => f.includes('SCC')));
    assert.ok(found.some((f) => f.includes('AIR')));
    assert.ok(found.some((f) => f.includes('INSC')));
    assert.equal(found.length >= 3, true);
  });

  it('is greedy rather than clever', () => {
    // Better to flag an innocent span than to miss an edited citation: a false
    // positive costs one rejected save, a false negative ships an unverified
    // authority wearing a verified badge.
    assert.ok(extractCitationSpans('see (2019) 4 SCC 221').length === 1);
  });

  it('sees the year-first form the reports actually print', () => {
    // Found 11 Aug 2026: the ingest extractor was blind to `1976 (1) SCR 906`
    // and so was this one. Here the consequence is sharper than a missing edge —
    // this function IS the PD-7 lock. A citation it cannot see is a citation an
    // advocate can edit or delete without the server ever raising a 422, which
    // is the false negative the module note calls the dangerous direction.
    assert.equal(extractCitationSpans('as held in 1976 (1) SCR 906, the rule is').length, 1);
    assert.equal(extractCitationSpans('U.P. SRTC v. Trilok Chandra 1996 (4) SCC 362').length, 1);
  });

  it('does not read a bare year and bracket as a citation', () => {
    // The anchor is the reporter abbreviation. Greedy is not indiscriminate:
    // this function rejecting a save is a real cost to the advocate.
    assert.deepEqual(extractCitationSpans('under section 5 (2) of the 1996 Act, at 362'), []);
    assert.deepEqual(extractCitationSpans('the award of 1996 (4) was set aside'), []);
  });
});

describe('PD-7 — the document is the lock', () => {
  before(async () => {
    const authId = `${TAG}-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${authId}, 'Adv', ${email}, true)`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
      VALUES (${authId}, 'Adv', '+911', ${email}, 'unverified') RETURNING id`;
    userId = u!.id;
    token = await signAccessToken({ sub: authId, email }, SECRET);

    const mk = async (title: string, cite: string, status: string) => {
      const [j] = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                               judgment_date, full_text, language, source_url, overruled_status)
        VALUES (${title}, ${cite}, '{}', 'Test Court', '2001-01-01', 'x', 'en',
                ${`test://${TAG}/${crypto.randomUUID()}`}, ${status}) RETURNING id`;
      return j!.id;
    };
    judgmentId = await mk('SYNTHETIC — Good Authority', '(2019) 4 SCC 221', 'none');
    setAsideId = await mk('SYNTHETIC — Displaced Authority', '(2015) 2 SCC 100', 'set_aside');

    const [d] = await sql<{ id: string }[]>`
      INSERT INTO documents (user_id, document_type, input_params, generated_content, language)
      VALUES (${userId}, 'bail', '{}'::jsonb,
              'The applicant relies on (2019) 4 SCC 221.', 'en') RETURNING id`;
    documentId = d!.id;

    await sql`INSERT INTO citation_checks
                (document_id, citation_claimed, judgment_id_matched, verification_state,
                 verified_by_source, shown_to_user, overruled_status_shown, surface)
              VALUES (${documentId}, '(2019) 4 SCC 221', ${judgmentId}, 'verified', 'corpus',
                      true, 'none', 'draft')`;
  });

  after(async () => {
    await sql`DELETE FROM citation_checks WHERE document_id = ${documentId}
              OR judgment_id_matched IN (${judgmentId}, ${setAsideId})`;
    await sql`DELETE FROM documents WHERE user_id = ${userId}`;
    await sql`DELETE FROM judgments WHERE id IN (${judgmentId}, ${setAsideId})`;
    await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}%`}`;
    await sql.end();
  });

  it('accepts prose that leaves the citation alone', async () => {
    const res = await app.request(`/documents/${documentId}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({
        paragraphs: [{ index: 0, text: 'The applicant humbly relies on (2019) 4 SCC 221.' }],
      }),
    });
    assert.equal(res.status, 200);
  });

  it('REJECTS 422 when a citation is edited by hand, and saves nothing', async () => {
    const before = await sql<{ c: string }[]>`
      SELECT generated_content AS c FROM documents WHERE id = ${documentId}`;

    const res = await app.request(`/documents/${documentId}`, {
      method: 'PATCH',
      headers: auth(),
      // One digit changed. (2019) 4 SCC 221 and 212 are different cases.
      body: JSON.stringify({
        paragraphs: [{ index: 0, text: 'The applicant relies on (2019) 4 SCC 212.' }],
      }),
    });
    assert.equal(res.status, 422);
    const err = ((await res.json()) as { error: { code: string; message: string } }).error;
    assert.equal(err.code, 'CITATION_LOCKED');
    // Naming the span matters: "rejected" alone sends the advocate hunting.
    assert.match(err.message, /SCC 212/);

    const after = await sql<{ c: string }[]>`
      SELECT generated_content AS c FROM documents WHERE id = ${documentId}`;
    assert.equal(after[0]?.c, before[0]?.c, 'a rejected PATCH must not partially save');
  });

  it('rejects a body carrying the retired watermarkRemoved field', async () => {
    const res = await app.request(`/documents/${documentId}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({
        paragraphs: [{ index: 0, text: 'Plain prose.' }],
        watermarkRemoved: true,
      }),
    });
    // Rejected, not ignored. Silently dropping a retired field lets a client
    // believe it cleared a mark that no longer exists (PD-8).
    assert.equal(res.status, 400);
  });

  it('rejects a whole-content blob', async () => {
    const res = await app.request(`/documents/${documentId}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ content: 'the entire document, rewritten' }),
    });
    assert.equal(res.status, 400);
  });

  it('adds an authority by ID and never by string', async () => {
    const res = await app.request(`/documents/${documentId}/citations`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ judgmentId }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { data: { citationCheck: { verificationState: string } } };
    assert.equal(body.data.citationCheck.verificationState, 'verified');
  });

  it('refuses to cite a set-aside authority in a draft', async () => {
    const res = await app.request(`/documents/${documentId}/citations`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ judgmentId: setAsideId }),
    });
    // Stronger than add-to-matter, for the same reason: a document is FILED.
    assert.equal(res.status, 409);
    const err = ((await res.json()) as { error: { code: string } }).error;
    assert.equal(err.code, 'AUTHORITY_SET_ASIDE');
  });

  it('refuses another advocate, indistinguishably from a missing document', async () => {
    const otherAuth = `${TAG}-other-${crypto.randomUUID()}`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${otherAuth}, 'B', ${`${otherAuth}@example.test`}, true)`;
    await sql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
              VALUES (${otherAuth}, 'B', '+912', ${`${otherAuth}@example.test`}, 'unverified')`;
    const otherToken = await signAccessToken(
      { sub: otherAuth, email: `${otherAuth}@example.test` },
      SECRET,
    );

    const mine = await app.request(`/documents/${documentId}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${otherToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ paragraphs: [{ index: 0, text: 'hijacked' }] }),
    });
    assert.equal(mine.status, 404);
  });
});
