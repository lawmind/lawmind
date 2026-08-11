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
  overruledByJudgmentId: string | null;
  overruledParas: number[] | null;
  overruledNote: string | null;
};
type Body = {
  ok: boolean;
  data?: {
    results: Result[];
    unverifiedReferences: unknown[];
    searchId: string | null;
    unpopulatedCourtCategories?: string[];
  };
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

  it('applies caseType, returning only judgments of that side', async (t) => {
    if (corpusSize === 0) return t.skip('no corpus loaded');
    const { status, body } = await post({
      query: 'appeal',
      language: 'en',
      filters: { caseType: 'criminal' },
    });
    assert.equal(status, 200);

    const ids = (body.data?.results ?? []).map((r) => r.judgmentId);
    if (ids.length === 0) return t.skip('no criminal judgments matched');

    // Verified against the column, not the response: a filter that silently
    // mis-sorts a matter is worse than one that returns less.
    const rows = await sql<{ case_type: string | null }[]>`
      SELECT case_type FROM judgments WHERE id = ANY(${ids})
    `;
    for (const row of rows) assert.equal(row.case_type, 'criminal');
  });

  it('applies the courts category filter for real — RCC bus 0046', async (t) => {
    if (corpusSize === 0) return t.skip('no corpus loaded');
    // The defect: `filters.court` was an exact match on a court NAME and the
    // client's chips are CATEGORIES, so `sc`/`hc` narrowed nothing against the
    // real API while `api/mock.ts` narrowed against fixtures — development
    // filtered and production did not.
    const { status, body } = await post({
      query: 'appeal',
      language: 'en',
      filters: { courts: ['sc'] },
    });
    assert.equal(status, 200);

    const ids = (body.data?.results ?? []).map((r) => r.judgmentId);
    if (ids.length === 0) return t.skip('no Supreme Court judgment matched');

    // Verified against the column, not the response — the same standard the
    // caseType test holds.
    const rows = await sql<{ court: string }[]>`
      SELECT court FROM judgments WHERE id = ANY(${ids})`;
    for (const row of rows) assert.equal(row.court, 'Supreme Court of India');
  });

  it('a category the corpus holds nothing in returns nothing, and SAYS SO', async (t) => {
    if (corpusSize === 0) return t.skip('no corpus loaded');
    // The failure this prevents: an empty list from a category we hold none of
    // is indistinguishable on screen from "your query matched nothing", and the
    // advocate concludes we have no case on their point when we were never
    // asked. Returning the unfiltered corpus instead would be worse still —
    // silently ignoring a filter they can see is applied.
    const { status, body } = await post({
      query: 'appeal',
      language: 'en',
      filters: { courts: ['district'] },
    });
    assert.equal(status, 200);
    assert.deepEqual(body.data?.results, [], 'no district court judgment exists to return');
    assert.ok(
      body.data?.unpopulatedCourtCategories?.includes('district'),
      'the response must state that this category is unanswerable, not just answer empty',
    );
  });

  it('refuses a court name where a category code belongs, rather than matching nothing', async () => {
    // A raw name in `courts` would have passed zod as a string and matched no
    // category, returning zero results with no error — exactly the silent
    // failure RCC refused to build client-side. It is a 400 instead.
    const { status, body } = await post({
      query: 'appeal',
      language: 'en',
      filters: { courts: ['Supreme Court of India'] },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, 'INVALID_REQUEST');
  });

  it('a duplicated document CANNOT occupy more than one result slot', async () => {
    // 1,476 High Court rows sit in content-hash duplicate groups, 925 of them
    // redundant copies. Retrieval read that fact nowhere, so the same judgment
    // could take several of the five slots an advocate reads and push distinct
    // authorities off the page entirely.
    //
    // Three byte-identical rows, one distinctive phrase, asserted through the
    // real route rather than against the collapse function — the defect was that
    // nothing in the REQUEST PATH consulted the duplicate fact.
    const text =
      'SYNTHETIC duplicate authority concerning quixotic riparian easements ' +
      'and the doctrine of perspicacious estoppel. '.repeat(12);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                               judgment_date, full_text, language, source_url, overruled_status)
        VALUES (${`SYNTHETIC — Duplicate Copy ${i}`}, ${`FIX 2024 DUP ${i}`}, '{}',
                'Test Court', '2024-01-01', ${text}, 'en',
                ${`test://dup/${crypto.randomUUID()}`}, 'none')
        RETURNING id`;
      ids.push(row!.id);
    }
    // The same sha256 on all three — what makes them one DOCUMENT, not three.
    await sql`UPDATE judgments SET content_hash = 'synthetic-duplicate-hash-0001'
              WHERE id = ANY(${ids})`;

    try {
      const { status, body } = await post({
        query: 'quixotic riparian easements perspicacious estoppel',
        language: 'en',
      });
      assert.equal(status, 200);
      const returned = (body.data?.results ?? []).filter((r) => ids.includes(r.judgmentId));
      assert.equal(
        returned.length,
        1,
        `a document with three identical copies took ${returned.length} slots`,
      );
    } finally {
      await sql`DELETE FROM citation_checks WHERE judgment_id_matched = ANY(${ids})`;
      await sql`DELETE FROM judgments WHERE id = ANY(${ids})`;
    }
  });

  it('does NOT collapse two different judgments that both lack a content hash', async () => {
    // Absent is not equal. A null content_hash means "not yet computed", never
    // "no duplicate", so nulls must never collapse into each other — that would
    // be a real silent drop of distinct authorities.
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                               judgment_date, full_text, language, source_url, overruled_status)
        VALUES (${`SYNTHETIC — Unhashed Distinct ${i}`}, ${`FIX 2024 UNH ${i}`}, '{}',
                'Test Court', '2024-01-01',
                ${`Distinct synthetic judgment ${i} on zygomorphic covenants and sublunary waivers. `.repeat(14)},
                'en', ${`test://unhashed/${crypto.randomUUID()}`}, 'none')
        RETURNING id`;
      ids.push(row!.id);
    }
    await sql`UPDATE judgments SET content_hash = NULL WHERE id = ANY(${ids})`;

    try {
      const { body } = await post({
        query: 'zygomorphic covenants sublunary waivers',
        language: 'en',
      });
      const returned = (body.data?.results ?? []).filter((r) => ids.includes(r.judgmentId));
      assert.equal(returned.length, 2, 'two distinct unhashed judgments must both survive');
    } finally {
      await sql`DELETE FROM citation_checks WHERE judgment_id_matched = ANY(${ids})`;
      await sql`DELETE FROM judgments WHERE id = ANY(${ids})`;
    }
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

  /**
   * Contract §4 P0's third outcome, over the WIRE — the unit-level proof lives
   * in `structured.test.ts`; this proves the HTTP response actually carries
   * `ambiguous: true` end to end. A synthetic fixture, not the real
   * `2020 INSC 189` collision this was found from: real data can be corrected
   * or re-ingested, and a permanent regression test must not depend on a
   * source-data anomaly staying broken forever.
   */
  describe('a bare citation matching more than one judgment — ambiguous', () => {
    const fakeCitation = `TEST AMBIGUOUS ${crypto.randomUUID().slice(0, 8)}`;
    let idA: string;
    let idB: string;

    before(async () => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                               judgment_date, full_text, language, source_url)
        VALUES
          ('SYNTHETIC — Ambiguous Fixture A', ${fakeCitation}, '{}', 'Test Court',
           '2024-01-01', 'synthetic fixture owned by route.test.ts', 'en',
           ${`test://ambiguous/${crypto.randomUUID()}`}),
          ('SYNTHETIC — Ambiguous Fixture B', ${fakeCitation}, '{}', 'Test Court',
           '2024-01-01', 'synthetic fixture owned by route.test.ts', 'en',
           ${`test://ambiguous/${crypto.randomUUID()}`})
        RETURNING id`;
      idA = rows[0]!.id;
      idB = rows[1]!.id;
    });

    after(async () => {
      await sql`DELETE FROM judgments WHERE id = ${idA} OR id = ${idB}`;
    });

    it('returns ambiguous: true with every real match, never a plain result list', async () => {
      const { status, body } = await post({ query: `cite:"${fakeCitation}"`, language: 'en' });
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      const data = body.data as unknown as {
        ambiguous?: boolean;
        total: number;
        results: { judgmentId: string }[];
        parsed: string;
      };
      assert.equal(data.ambiguous, true, 'the wire must carry an explicit ambiguity flag');
      assert.equal(data.total, 2);
      const ids = data.results.map((r) => r.judgmentId).sort();
      assert.deepEqual(ids, [idA, idB].sort(), 'both real judgments, nothing invented, nothing dropped');
      assert.match(data.parsed, new RegExp(fakeCitation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('a query for one of the two by title (not the shared citation) is unaffected', async () => {
      // Ambiguity is scoped to the bare cite: term. A different query that
      // happens to also match one of these rows through ordinary text search
      // must not be caught up in the citation-specific branch.
      const { body } = await post({ query: 'SYNTHETIC — Ambiguous Fixture A', language: 'en' });
      const data = body.data as unknown as { ambiguous?: boolean };
      assert.notEqual(data.ambiguous, true);
    });
  });

  /**
   * Found 11 Aug 2026: `runStructured` never selected `overruled_by_judgment_id`
   * / `overruled_paras` / `overruled_note`, so `route.ts` hardcoded them to
   * null for every structured-search result — a `partly_set_aside` hit via
   * `cite:`/`judge:`/etc. could show the LAW MOVED status but never which
   * paragraphs fell, unlike hybrid search. Synthetic fixture, not real data:
   * a permanent regression test must not depend on a real judgment's
   * overruled status staying put.
   */
  describe('a structured-search hit that is partly_set_aside — REB, hybrid parity', () => {
    const fakeCitation = `TEST OVERRULED-PARTS ${crypto.randomUUID().slice(0, 8)}`;
    let replacementId: string;
    let targetId: string;

    before(async () => {
      const [replacement] = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                               full_text, language, source_url)
        VALUES ('SYNTHETIC — Replacement Fixture', '{}', 'Test Court', '2025-01-01',
                'synthetic fixture owned by route.test.ts', 'en',
                ${`test://overruled-parts/replacement/${crypto.randomUUID()}`})
        RETURNING id`;
      replacementId = replacement!.id;

      const [target] = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                               judgment_date, full_text, language, source_url,
                               overruled_status, overruled_by_judgment_id, overruled_paras,
                               overruled_note, overruled_status_changed_at)
        VALUES ('SYNTHETIC — Overruled-In-Part Fixture', ${fakeCitation}, '{}', 'Test Court',
                '2020-01-01', 'synthetic fixture owned by route.test.ts', 'en',
                ${`test://overruled-parts/target/${crypto.randomUUID()}`},
                'partly_set_aside', ${replacementId}, ARRAY[5, 6],
                'test fixture note — paragraphs 5 and 6 set aside', now())
        RETURNING id`;
      targetId = target!.id;
    });

    after(async () => {
      await sql`DELETE FROM judgments WHERE id = ${targetId} OR id = ${replacementId}`;
    });

    it('carries overruledByJudgmentId, overruledParas and overruledNote, not null', async () => {
      const { status, body } = await post({ query: `cite:"${fakeCitation}"`, language: 'en' });
      assert.equal(status, 200);
      const data = body.data as unknown as { results: Result[] };
      const hit = data.results.find((r) => r.judgmentId === targetId);
      assert.ok(hit, 'the fixture must be found by its own citation');
      assert.equal(hit.overruledStatus, 'partly_set_aside');
      assert.equal(hit.overruledByJudgmentId, replacementId);
      assert.deepEqual(hit.overruledParas, [5, 6]);
      assert.equal(hit.overruledNote, 'test fixture note — paragraphs 5 and 6 set aside');
    });
  });
});
