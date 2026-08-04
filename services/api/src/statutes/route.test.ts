/**
 * Bare acts, against the real database.
 *
 * These assert the surface an advocate actually uses: list the codes, read one in
 * order, and jump to a section by number. Section text is government-published,
 * so the tests check it is served intact rather than checking a summary.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

type Statute = {
  statuteId: string;
  shortTitle: string;
  actNumber: string;
  actYear: number;
  enforcementDate: string | null;
  sectionCount: number;
};
type Section = {
  sectionId: string;
  shortTitle: string;
  sectionNumber: string;
  heading: string | null;
  sectionText: string;
  orderIndex: number;
  sourceUrl: string;
};

const get = async (path: string): Promise<{ status: number; body: Record<string, never> }> => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

describe('bare acts', () => {
  let loaded = 0;

  before(async () => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM statutes`;
    loaded = row?.n ?? 0;
  });

  after(async () => {
    await sql.end();
  });

  it('lists the acts with their enforcement dates', async (t) => {
    if (loaded === 0) return t.skip('no statutes loaded');
    const { status, body } = await get('/statutes');
    assert.equal(status, 200);

    const data = body as unknown as { ok: boolean; data: { statutes: Statute[] } };
    assert.equal(data.ok, true);
    assert.ok(data.data.statutes.length >= 1);

    for (const s of data.data.statutes) {
      assert.ok(s.shortTitle.length > 0);
      assert.ok(s.sectionCount > 0, `${s.shortTitle} has no sections`);
      // A calendar date, not a midnight timestamp.
      if (s.enforcementDate !== null) assert.match(s.enforcementDate, /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('jumps to a section by number and serves the published text', async (t) => {
    if (loaded === 0) return t.skip('no statutes loaded');
    const { body } = await get('/statutes/sections?sectionNumber=103');

    const data = body as unknown as { data: { sections: Section[]; total: number } };
    const bns = data.data.sections.find((s) => s.shortTitle.includes('Nyaya Sanhita'));
    if (!bns) return t.skip('BNS not loaded');

    // Read back from the database, not asserted from memory: this is the section
    // that replaced IPC 302, and it is the single most looked-up provision in
    // Indian criminal practice.
    assert.equal(bns.heading, 'Punishment for murder');
    assert.match(bns.sectionText, /murder/i);
    assert.ok(bns.sourceUrl.startsWith('https://www.indiacode.nic.in'));
  });

  it('reads one act in its own order, not lexical order', async (t) => {
    if (loaded === 0) return t.skip('no statutes loaded');
    const [act] = await sql<{ id: string }[]>`
      SELECT s.id FROM statutes s WHERE s.short_title LIKE '%Nyaya Sanhita%' LIMIT 1
    `;
    if (!act) return t.skip('BNS not loaded');

    const { body } = await get(`/statutes/sections?actId=${act.id}&limit=400`);
    const data = body as unknown as { data: { sections: Section[]; total: number } };
    const sections = data.data.sections;

    assert.ok(sections.length > 300, `expected the whole act, got ${sections.length}`);
    // Section 2 must follow section 1 and precede section 10 — which lexical
    // ordering on a text column would get wrong.
    const order = sections.map((s) => s.orderIndex);
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    assert.equal(sections[0]?.sectionNumber, '1');
  });

  it('searches across the codes by term', async (t) => {
    if (loaded === 0) return t.skip('no statutes loaded');
    const { body } = await get('/statutes/sections?q=organised%20crime&limit=5');
    const data = body as unknown as { data: { sections: Section[]; total: number } };
    assert.ok(data.data.total > 0, 'expected a match for a term the BNS introduced');
    assert.ok(
      data.data.sections.some((s) =>
        /organised crime/i.test(`${s.heading ?? ''} ${s.sectionText}`),
      ),
    );
  });

  it('rejects a malformed query through the shared validator', async () => {
    const { status, body } = await get('/statutes/sections?limit=99999');
    assert.equal(status, 400);
    assert.equal((body as unknown as { error: { code: string } }).error.code, 'INVALID_REQUEST');
  });
});
