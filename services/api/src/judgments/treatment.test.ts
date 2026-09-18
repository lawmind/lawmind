/**
 * Treatment analysis and the precedent graph, against the real corpus.
 *
 * These assert the properties that make the endpoints safe to render, not just
 * their shape: counts computed over the whole set rather than the page,
 * `truncated` telling the truth, and every row carrying all three citation
 * fields so a client never has to assume a verification the server did not
 * assert.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

type Body = { ok: boolean; data?: Record<string, unknown>; error?: { code: string } };

const get = async (path: string): Promise<{ status: number; body: Body }> => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as Body };
};

describe('treatment and graph', () => {
  /** A judgment that something actually cites — otherwise the assertions are vacuous. */
  let citedId: string | null = null;

  before(async () => {
    const [row] = await sql<{ id: string }[]>`
      SELECT cited_judgment_id AS id FROM judgment_citations
      WHERE cited_judgment_id IS NOT NULL
      GROUP BY cited_judgment_id ORDER BY count(*) DESC LIMIT 1`;
    citedId = row?.id ?? null;
  });

  after(async () => {
    await sql.end();
  });

  it('returns counts and treatments for a cited authority', async (t) => {
    if (!citedId) return t.skip('no citation edges extracted yet');
    const { status, body } = await get(`/judgments/${citedId}/treatment`);
    assert.equal(status, 200);
    const counts = body.data?.['counts'] as Record<string, number>;
    assert.ok(counts, 'counts must be present');
    // All SIX real values of judgment_citations.relationship (schema.ts:711) —
    // a fifth was missing here until 11 Aug 2026 (RCC bus 0035): overruledInPart
    // was silently uncounted while `total` (below) already included it.
    for (const k of [
      'followed',
      'distinguished',
      'doubted',
      'overruled',
      'overruledInPart',
      'cites',
    ]) {
      assert.equal(typeof counts[k], 'number', `${k} must be a number, not absent`);
    }
  });

  describe('overruled_in_part — the sixth value, found missing from counts 11 Aug 2026', () => {
    /** A real judgment with a real overruled_in_part edge — 23 such rows in production. */
    let partlyOverruledId: string | null = null;

    before(async () => {
      const [row] = await sql<{ id: string }[]>`
        SELECT cited_judgment_id AS id FROM judgment_citations
        WHERE relationship = 'overruled_in_part' AND cited_judgment_id IS NOT NULL
        LIMIT 1`;
      partlyOverruledId = row?.id ?? null;
    });

    it('counts.overruledInPart is non-zero for an authority actually overruled in part', async (t) => {
      if (!partlyOverruledId) return t.skip('no overruled_in_part edge in this corpus');
      const { body } = await get(`/judgments/${partlyOverruledId}/treatment`);
      const counts = body.data?.['counts'] as Record<string, number>;
      assert.ok(counts['overruledInPart']! > 0, 'a real overruled_in_part edge must be counted');
    });

    it('an overruled_in_part row ranks with overruled/doubted, not with ordinary cites', async (t) => {
      if (!partlyOverruledId) return t.skip('no overruled_in_part edge in this corpus');
      const { body } = await get(`/judgments/${partlyOverruledId}/treatment?limit=200`);
      const rows = (body.data?.['treatments'] ?? []) as { relationship: string }[];
      const relationships = rows.map((r) => r.relationship);
      const firstPlainCite = relationships.indexOf('cites');
      const firstPartial = relationships.indexOf('overruled_in_part');
      if (firstPlainCite === -1 || firstPartial === -1)
        return t.skip('page did not carry both relationships');
      // A partial overruling is the law moving — it must not be buried behind
      // ordinary citing references in the same page.
      assert.ok(firstPartial < firstPlainCite, 'overruled_in_part must rank ahead of a bare cites');
    });
  });

  it('computes counts over the WHOLE set, not the returned page', async (t) => {
    if (!citedId) return t.skip('no citation edges extracted yet');
    const { body } = await get(`/judgments/${citedId}/treatment?limit=1`);
    const counts = body.data?.['counts'] as Record<string, number>;
    const summed = Object.values(counts).reduce((a, b) => a + b, 0);
    // A count that shrank with pagination would misstate how the law has moved.
    assert.equal(summed, body.data?.['total']);
    assert.ok(summed >= ((body.data?.['returned'] as number) ?? 0));
  });

  it('carries all three citation fields and asOf on every treatment row', async (t) => {
    if (!citedId) return t.skip('no citation edges extracted yet');
    const { body } = await get(`/judgments/${citedId}/treatment`);
    const rows = (body.data?.['treatments'] ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return t.skip('no treatments for this authority');
    for (const r of rows) {
      assert.ok(['verified', 'unverified', 'failed'].includes(r['verificationState'] as string));
      assert.ok(
        ['corpus', 'indiankanoon', 'aws_s3', 'public_x2', 'ecourts', 'none'].includes(
          r['verifiedBySource'] as string,
        ),
      );
      assert.ok(
        ['none', 'set_aside', 'partly_set_aside', 'doubted'].includes(
          r['overruledStatus'] as string,
        ),
      );
      assert.ok(r['asOf'], 'asOf required wherever overruledStatus appears');
    }
  });

  it('never returns a prediction, score or probability', async (t) => {
    if (!citedId) return t.skip('no citation edges extracted yet');
    const { body } = await get(`/judgments/${citedId}/treatment`);
    const serialised = JSON.stringify(body);
    // FEATURE_PARITY.md §4: outcome prediction is the one competitor feature we
    // decline. It cannot be sourced to a primary record or verified by any tier.
    for (const forbidden of ['probability', 'likelihood', 'prediction', 'confidence', 'winRate']) {
      assert.ok(!serialised.includes(forbidden), `${forbidden} must never appear`);
    }
  });

  it('reports truncation honestly', async (t) => {
    if (!citedId) return t.skip('no citation edges extracted yet');
    const { body } = await get(`/judgments/${citedId}/treatment?limit=1`);
    const total = body.data?.['total'] as number;
    const returned = body.data?.['returned'] as number;
    // "Showing 1 of N", never a silent 1.
    if (total > returned) {
      assert.equal(body.data?.['truncated'], true);
      assert.ok(body.data?.['nextCursor'], 'a truncated page must offer a cursor');
    }
  });

  it('returns a graph with nodes, edges and an honest totalNodes', async (t) => {
    if (!citedId) return t.skip('no citation edges extracted yet');
    const { status, body } = await get(`/judgments/${citedId}/graph?limit=5`);
    assert.equal(status, 200);
    const nodes = (body.data?.['nodes'] ?? []) as Record<string, unknown>[];
    const totalNodes = body.data?.['totalNodes'] as number;
    assert.equal(typeof totalNodes, 'number');
    assert.ok(nodes.length <= 5, 'limit must be honoured');
    if (totalNodes > nodes.length) assert.equal(body.data?.['truncated'], true);
    for (const n of nodes) {
      assert.ok(n['overruledStatus'], 'a graph node without overruled status is a trap');
      assert.ok(n['asOf']);
    }
  });

  it('404s an unknown judgment on both routes', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    assert.equal((await get(`/judgments/${missing}/treatment`)).status, 404);
    assert.equal((await get(`/judgments/${missing}/graph`)).status, 404);
  });
});
