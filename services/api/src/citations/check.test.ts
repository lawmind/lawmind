/**
 * Per-tier verification results — and the distinction the whole endpoint exists for.
 *
 * `not_implemented` and `miss` are different facts. `miss` says we looked at an
 * independent source and found nothing. `not_implemented` says we have not looked
 * yet, because Tiers 2 and 3 ship in S2.
 *
 * Collapsing them would tell an advocate a citation failed independent
 * verification when none was ever attempted — and it would make the harness agree
 * with itself, reporting a confirmation rate computed against checks that never
 * ran. That is the same failure mode as a corpus that never learned an overruling
 * and therefore reads 0.0% stale.
 *
 * So these tests assert the shape AND the honesty of the shape.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

type Tier = { tier: number; source: string; status: string; detail: string; at: string | null };
type Body = {
  data: {
    citationCheckId: string;
    verificationState: string;
    verifiedBySource: string;
    overruledStatus: string | null;
    shownToUser: boolean;
    judgment: { judgmentId: string; caseTitle: string } | null;
    tiers: Tier[];
    coverage: { tiersImplemented: number; tiersDefined: number; note: string };
  };
};

describe('citation check', () => {
  let checkId: string | null = null;
  const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

  before(async () => {
    const rows = await sql<{ id: string }[]>`SELECT id FROM citation_checks LIMIT 1`;
    checkId = rows[0]?.id ?? null;
  });

  after(async () => {
    await sql.end();
  });

  it('404s an unknown id rather than inventing a check', async () => {
    const res = await app.request('/citations/00000000-0000-0000-0000-000000000000');
    assert.equal(res.status, 404);
  });

  it('reports every defined tier, not only the ones that ran', async (t) => {
    if (!checkId) return t.skip('needs at least one citation_checks row');

    const res = await app.request(`/citations/${checkId}`);
    assert.equal(res.status, 200);
    const { data } = (await res.json()) as Body;

    assert.deepEqual(
      data.tiers.map((x) => x.tier),
      [1, 2, 3],
      'a tier missing from the response is a tier the client cannot show as unrun',
    );
  });

  it('never reports an unbuilt tier as a miss', async (t) => {
    if (!checkId) return t.skip('needs at least one citation_checks row');

    const { data } = (await (await app.request(`/citations/${checkId}`)).json()) as Body;
    for (const tier of data.tiers.filter((x) => x.tier > 1)) {
      assert.equal(
        tier.status,
        'not_implemented',
        `tier ${tier.source} reports "${tier.status}". Tiers 2 and 3 ship in S2 — ` +
          'reporting an unrun check as a miss tells an advocate a citation failed ' +
          'independent verification that was never attempted.',
      );
      assert.equal(tier.at, null, 'an unrun tier cannot carry a timestamp');
    }
  });

  it('timestamps the tier that did run', async (t) => {
    if (!checkId) return t.skip('needs at least one citation_checks row');

    const { data } = (await (await app.request(`/citations/${checkId}`)).json()) as Body;
    const one = data.tiers.find((x) => x.tier === 1)!;
    assert.ok(['confirmed', 'miss'].includes(one.status), `tier 1 status was ${one.status}`);
    assert.ok(one.at, 'the tier that ran must say when — that is what the sheet renders');
    assert.ok(!Number.isNaN(Date.parse(one.at!)), `tier 1 timestamp unparseable: ${one.at}`);
  });

  it('states its own coverage rather than making the client infer it', async (t) => {
    if (!checkId) return t.skip('needs at least one citation_checks row');

    const { data } = (await (await app.request(`/citations/${checkId}`)).json()) as Body;
    assert.equal(data.coverage.tiersImplemented, 1);
    assert.equal(data.coverage.tiersDefined, 3);
    assert.match(data.coverage.note, /has not been checked|not.*failed/i);
  });

  it('carries the three independent fields, never one enum', async (t) => {
    if (!checkId) return t.skip('needs at least one citation_checks row');

    const { data } = (await (await app.request(`/citations/${checkId}`)).json()) as Body;
    // A judgment can be verified AND overruled — different questions, different
    // sources. Any response carrying a citation must include all three.
    assert.ok('verificationState' in data);
    assert.ok('verifiedBySource' in data);
    assert.ok('overruledStatus' in data);
  });

  it('renders judgment fields from the row, never from a claimed citation', async (t) => {
    if (!checkId) return t.skip('needs at least one citation_checks row');

    const { data } = (await (await app.request(`/citations/${checkId}`)).json()) as Body;
    if (data.judgment) {
      // CITATION_HARNESS step 8, the one most often skipped: a model can
      // reference a real id and still mistype the case name beside it.
      assert.ok(data.judgment.caseTitle, 'a resolved citation must carry the row title');
      assert.equal(typeof data.judgment.judgmentId, 'string');
    } else {
      assert.equal(
        data.verifiedBySource !== 'corpus',
        true,
        'corpus source implies a resolved row',
      );
    }
  });
});
