/**
 * Search against a real database, with a stub embedder.
 *
 * The stub is deliberate: these assert the contract shape, the citation-field
 * rules and the `citation_checks` write. Retrieval quality is measured
 * separately, against real vectors, by the harness in S2.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** No embedding: exercises the lexical-only degradation path too. */
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

type Result = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string | null;
  reporterCitations: string[];
  court: string;
  judgmentDate: string;
  holding: string;
  operativeParagraph: string;
  verificationState: string;
  verifiedBySource: string;
  overruledStatus: string;
};
type Body = {
  ok: boolean;
  data?: { results: Result[]; unverifiedReferences: unknown[]; searchId: string | null };
  error?: { code: string; message: string };
};

const post = async (payload: unknown): Promise<{ status: number; body: Body }> => {
  const res = await app.request('/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as Body };
};

describe('POST /search', () => {
  let corpusSize = 0;

  before(async () => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgments`;
    corpusSize = row?.n ?? 0;
  });

  after(async () => {
    await sql.end();
  });

  it('returns the contract shape with all three citation fields per result', async (t) => {
    if (corpusSize === 0) return t.skip('no corpus loaded');
    const { status, body } = await post({ query: 'appeal', language: 'en' });
    assert.equal(status, 200);
    assert.equal(body.ok, true);

    const data = body.data;
    assert.ok(data, 'expected a data envelope');
    assert.ok(Array.isArray(data.results));
    // Never empty-by-omission — the key is always present.
    assert.ok(Array.isArray(data.unverifiedReferences));
    // Present on every response; null until auth can attribute it (see below).
    assert.ok('searchId' in data, 'searchId key must always be present');

    for (const r of data.results) {
      assert.ok(r.judgmentId && r.caseTitle && r.court && r.judgmentDate);
      // The three independent fields, on every citation-bearing result.
      assert.ok(['verified', 'unverified', 'failed'].includes(r.verificationState));
      assert.ok(
        ['corpus', 'indiankanoon', 'aws_s3', 'public_x2', 'ecourts', 'none'].includes(
          r.verifiedBySource,
        ),
      );
      assert.ok(['none', 'set_aside', 'partly_set_aside', 'doubted'].includes(r.overruledStatus));
    }
  });

  it('returns at most five results', async (t) => {
    if (corpusSize === 0) return t.skip('no corpus loaded');
    const { body } = await post({ query: 'the', language: 'en' });
    assert.ok((body.data?.results.length ?? 0) <= 5);
  });

  it('writes one citation_checks row per result, marked shown_to_user', async (t) => {
    if (corpusSize === 0) return t.skip('no corpus loaded');
    const { body } = await post({ query: 'appeal', language: 'en' });
    // Unauthenticated, so these rows carry a null search_id — the citation
    // record still has to exist, because silent-drop rate is computed from it.
    const rows = await sql<
      {
        verification_state: string;
        verified_by_source: string;
        shown_to_user: boolean;
        surface: string;
      }[]
    >`SELECT verification_state, verified_by_source, shown_to_user, surface
      FROM citation_checks WHERE search_id IS NULL AND surface = 'search'
      ORDER BY created_at DESC LIMIT ${body.data?.results.length ?? 0}`;

    // Silent-drop rate is computed from these rows; one per rendered citation.
    assert.equal(rows.length, body.data?.results.length);
    for (const row of rows) {
      assert.equal(row.shown_to_user, true);
      assert.equal(row.surface, 'search');
      assert.equal(row.verification_state, 'verified');
      assert.equal(row.verified_by_source, 'corpus');
    }
  });

  it('returns a null searchId while unauthenticated rather than inventing a user', async (t) => {
    if (corpusSize === 0) return t.skip('no corpus loaded');
    const { body } = await post({ query: 'bail', language: 'en' });
    // searches.user_id is NOT NULL and auth is S5, so no search row can honestly
    // be attributed yet. The field is present and null, never fabricated.
    assert.equal(body.data?.searchId, null);
  });

  it('refuses caseType rather than ignoring it', async () => {
    const { status, body } = await post({
      query: 'bail',
      language: 'en',
      filters: { caseType: 'criminal' },
    });
    // Silently returning unfiltered results for a filter the client believes was
    // applied is the failure this guards.
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, 'FILTER_UNSUPPORTED');
  });

  it('rejects a malformed body through the shared validator', async () => {
    const { status, body } = await post({ query: '', language: 'en' });
    assert.equal(status, 400);
    assert.equal(body.error?.code, 'INVALID_REQUEST');
  });

  it('rejects an unknown language', async () => {
    const { status, body } = await post({ query: 'bail', language: 'th' });
    assert.equal(status, 400);
    assert.equal(body.error?.code, 'INVALID_REQUEST');
  });
});
