/**
 * `GET /judgments/:id` against a real database.
 *
 * This route did not exist until 6 Aug 2026, so a judgment found by search could
 * not be opened and the reading view could only be exercised against fixtures.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

type Body = {
  ok: boolean;
  data?: {
    judgmentId: string;
    caseTitle: string;
    fullText: string;
    verificationState: string;
    verifiedBySource: string;
    overruledStatus: string;
    asOf: string;
  };
  error?: { code: string };
};

const get = async (path: string): Promise<{ status: number; body: Body }> => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as Body };
};

describe('GET /judgments/:id', () => {
  let id: string | null = null;

  before(async () => {
    const [row] = await sql<{ id: string }[]>`SELECT id FROM judgments LIMIT 1`;
    id = row?.id ?? null;
  });

  after(async () => {
    await sql.end();
  });

  it('returns the judgment with its full text', async (t) => {
    if (!id) return t.skip('no corpus loaded');
    const { status, body } = await get(`/judgments/${id}`);
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.data?.judgmentId, id);
    assert.ok((body.data?.caseTitle.length ?? 0) > 0);
    assert.ok((body.data?.fullText.length ?? 0) > 0, 'full text is what the reading view renders');
  });

  it('carries all three citation fields and asOf', async (t) => {
    if (!id) return t.skip('no corpus loaded');
    const { body } = await get(`/judgments/${id}`);
    assert.ok(['verified', 'unverified', 'failed'].includes(body.data?.verificationState ?? ''));
    assert.ok(
      ['corpus', 'indiankanoon', 'aws_s3', 'public_x2', 'ecourts', 'none'].includes(
        body.data?.verifiedBySource ?? '',
      ),
    );
    assert.ok(
      ['none', 'set_aside', 'partly_set_aside', 'doubted'].includes(
        body.data?.overruledStatus ?? '',
      ),
    );
    // Without asOf an offline surface cannot honour the harness rule that a
    // cached overruled status renders with its as-of date.
    assert.ok(body.data?.asOf, 'asOf must be present on any payload carrying overruledStatus');
    assert.ok(!Number.isNaN(Date.parse(body.data.asOf)), 'asOf must be a parsable timestamp');
  });

  it('writes a citation_checks row for the judgment_detail surface', async (t) => {
    if (!id) return t.skip('no corpus loaded');
    await get(`/judgments/${id}`);
    const [row] = await sql<{ surface: string; shown_to_user: boolean }[]>`
      SELECT surface, shown_to_user FROM citation_checks
      WHERE judgment_id_matched = ${id} AND surface = 'judgment_detail'
      ORDER BY created_at DESC LIMIT 1`;
    // Silent-drop and stale-overruled are computed from these rows; a surface
    // that renders a citation without recording it is invisible to both.
    assert.ok(row, 'rendering a judgment must record a citation_check');
    assert.equal(row.shown_to_user, true);
  });

  it('404s an id that is not in the corpus', async () => {
    const { status, body } = await get('/judgments/00000000-0000-4000-8000-000000000000');
    assert.equal(status, 404);
    assert.equal(body.error?.code, 'NOT_FOUND');
  });

  it('rejects a malformed id through the shared validator', async () => {
    const { status, body } = await get('/judgments/not-a-uuid');
    assert.equal(status, 400);
    assert.equal(body.error?.code, 'INVALID_REQUEST');
  });
});
