/**
 * AN EMPTY SCREEN MUST NOT SAY "THERE IS NO LAW ON THIS" WHEN WE DID NOT LOOK.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS MEASURED, 25 AUGUST 2026, THROUGH THE REAL ROUTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *     "bail"                                    0 results, sparse_unbounded
 *     "anticipatory bail"                       0 results, sparse_unbounded
 *     "anticipatory bail in economic offences"  5 results, not degraded
 *
 * `bail` covers 0.2577 of the sampled corpus against a
 * `SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY` of 0.05, so the sparse arm refuses
 * before ranking. That refusal is CORRECT — ranking a five-million-row match set
 * is the shape that took the database down. The dense arm is meant to answer
 * instead, and when it cannot (embedder cold, past its 2s budget, or past
 * `EMBEDDER_FAILURE_LIMIT`) the advocate gets a blank page for one of the
 * commonest searches in Indian criminal practice.
 *
 * The bug was never the refusal. It was that the refusal and a genuine "the
 * corpus holds nothing" produced the SAME response, and on screen the advocate
 * reads the second.
 *
 * `CITATION_HARNESS.md` sets the silent-drop threshold at zero, and
 * `unpopulatedCourtCategories` already applies the identical rule to a filter:
 * absence has to state itself.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 4, onnotice: () => {} });

/**
 * `embedQuery` returns null on purpose. That is not an artificial handicap — it
 * is exactly what production does when the embedder is cold, over budget, or has
 * failed its limit, and it is the only condition under which this field can
 * appear at all.
 */
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

type SearchBody = {
  data?: {
    results?: unknown[];
    degraded?: string[];
    emptyBecause?: { reason: string; remedy: string };
  };
};

async function search(query: string): Promise<SearchBody['data']> {
  const res = await app.request('/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, language: 'en' }),
  });
  assert.equal(res.status, 200, `${query} should be a 200, not a refusal at the edge`);
  return ((await res.json()) as SearchBody).data;
}

after(async () => {
  await sql.end({ timeout: 5 });
});

describe('an empty result says WHY it is empty', () => {
  it('a query too broad to rank says so, and offers a remedy that works', async () => {
    const d = await search('bail');
    assert.equal(d?.results?.length, 0);
    assert.ok(d?.degraded?.includes('sparse_unbounded'));
    assert.deepEqual(d?.emptyBecause, {
      reason: 'query_too_broad_to_rank',
      remedy: 'add_more_terms',
    });
  });

  it('the remedy is TRUE, not an apology — more terms actually returns law', async () => {
    /**
     * The half that makes the field worth shipping. Telling an advocate to add
     * terms is only honest if adding terms works, so the test proves the remedy
     * rather than asserting the string.
     */
    const narrow = await search('anticipatory bail in economic offences');
    assert.ok(
      (narrow?.results?.length ?? 0) > 0,
      'adding terms must actually produce results, or the remedy is a lie',
    );
    assert.equal(narrow?.emptyBecause, undefined);
  });

  it('a genuine miss stays a genuine miss — the field is ABSENT, not empty', async () => {
    /**
     * The most important negative. If this field appeared on every zero-result
     * page it would tell an advocate to add terms to a query that already ran
     * perfectly and found nothing — which is worse than saying nothing, because
     * it implies law exists where none does.
     */
    const d = await search('zzzznotarealterm qqqqnotarealterm');
    assert.equal(d?.results?.length, 0);
    assert.equal(
      d?.emptyBecause,
      undefined,
      'the corpus genuinely holding nothing must NOT be dressed up as a refusal',
    );
  });

  it('is absent whenever results exist, so the ordinary response is unchanged', async () => {
    const d = await search('anticipatory bail in economic offences');
    assert.ok((d?.results?.length ?? 0) > 0);
    assert.equal(d?.emptyBecause, undefined);
  });
});
