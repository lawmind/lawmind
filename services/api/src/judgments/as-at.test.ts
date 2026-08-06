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

describe('GET /judgments/:id/authorities', () => {
  let citingId: string | null = null;

  before(async () => {
    const [row] = await sql<{ id: string }[]>`
      SELECT citing_judgment_id AS id FROM judgment_citations
      WHERE cited_judgment_id IS NOT NULL
      GROUP BY citing_judgment_id ORDER BY count(*) DESC LIMIT 1`;
    citingId = row?.id ?? null;
  });

  after(async () => {
    await sql.end();
  });

  it('classifies every resolved authority into one of four standings', async (t) => {
    if (!citingId) return t.skip('no citation edges extracted yet');
    const { status, body } = await get(`/judgments/${citingId}/authorities`);
    assert.equal(status, 200);
    const authorities = (body.data?.['authorities'] ?? []) as Record<string, unknown>[];
    for (const a of authorities) {
      assert.ok(
        ['good_law_then', 'already_moved', 'moved_since', 'unknown'].includes(
          a['standingWhenRelied'] as string,
        ),
        `unexpected standing: ${String(a['standingWhenRelied'])}`,
      );
    }
  });

  it('counts sum to the number of resolved authorities', async (t) => {
    if (!citingId) return t.skip('no citation edges extracted yet');
    const { body } = await get(`/judgments/${citingId}/authorities`);
    const counts = body.data?.['counts'] as Record<string, number>;
    const summed = Object.values(counts).reduce((a, b) => a + b, 0);
    // An authority that fell out of the tally would understate exposure.
    assert.equal(summed, body.data?.['resolvedAuthorities']);
  });

  it('never emits a soundness rating, score or verdict', async (t) => {
    if (!citingId) return t.skip('no citation edges extracted yet');
    const { body } = await get(`/judgments/${citingId}/authorities`);
    const serialised = JSON.stringify(body).toLowerCase();
    // FEATURE_PARITY.md §4. Rating a court's reasoning cannot be sourced to a
    // primary record. This endpoint states facts with judgment ids behind them.
    for (const forbidden of [
      'vulnerable',
      'soundness',
      'verdict',
      'rating',
      'score',
      'confidence',
    ]) {
      assert.ok(!serialised.includes(forbidden), `${forbidden} must never appear`);
    }
  });

  it('reports daysAlreadyMoved only for an authority that had already fallen', async (t) => {
    if (!citingId) return t.skip('no citation edges extracted yet');
    const { body } = await get(`/judgments/${citingId}/authorities`);
    const authorities = (body.data?.['authorities'] ?? []) as Record<string, unknown>[];
    for (const a of authorities) {
      if (a['standingWhenRelied'] === 'already_moved') {
        assert.equal(typeof a['daysAlreadyMoved'], 'number');
        assert.ok((a['daysAlreadyMoved'] as number) >= 0, 'a gap cannot be negative');
      } else {
        // Claiming a gap where none exists would invent a finding.
        assert.equal(a['daysAlreadyMoved'], null);
      }
    }
  });

  it('says unknown rather than guessing when a status carries no date', async (t) => {
    if (!citingId) return t.skip('no citation edges extracted yet');
    const { body } = await get(`/judgments/${citingId}/authorities`);
    const authorities = (body.data?.['authorities'] ?? []) as Record<string, unknown>[];
    for (const a of authorities) {
      if (a['overruledStatus'] !== 'none' && a['statusChangedAt'] === null) {
        assert.equal(
          a['standingWhenRelied'],
          'unknown',
          'a moved status with no date cannot be placed in time',
        );
      }
    }
  });

  it('404s an unknown judgment', async () => {
    const { status } = await get('/judgments/00000000-0000-4000-8000-000000000000/authorities');
    assert.equal(status, 404);
  });
});
