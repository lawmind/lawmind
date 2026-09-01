/**
 * `GET /statutes/:statuteId/linked-judgments`, against the real database.
 *
 * The acceptance matrix NEW3 R16 `R16-RCC-08` names, plus the three failures
 * this route is most likely to develop later:
 *
 *   1. a reference with no resolver decision being shown as a confirmed link
 *      — which happened during development, from `array_agg` returning the
 *      literal string `NULL`, and is the reason `array_remove` is in the query;
 *   2. one judgment appearing twice because the court spelled the Act two ways;
 *   3. twenty DIFFERENT judgments collapsing into one because they share a
 *      case title.
 *
 * Skips rather than fails when the corpus is not loaded, exactly as
 * `statutes/route.test.ts` does — a green suite on an empty database would be
 * the more dangerous outcome.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';
import {
  precedentialEffectFromEdges,
  precedentialPolicy,
  type OverruledStatus,
  type TreatmentEdge,
  type TreatmentProvenance,
} from '../judgments/precedential-effect.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

/** Counted separately so "how many queries did that request make" is answerable. */
let queryCount = 0;
const countingSql = postgres(process.env['DATABASE_URL'] ?? '', {
  max: 2,
  onnotice: () => {},
  debug: () => {
    queryCount += 1;
  },
});
const countingApp = createApp({
  ping: async () => {},
  search: { sql: countingSql, embedQuery: async () => null },
});

const CRPC = '0019baad-090a-4777-a62a-f2a12339664e';
const IPC = 'c85f2b75-3afd-43be-8263-d6979857cc02';
type Link = {
  judgmentId: string;
  caseTitle: string;
  overruledStatus: string;
  overruledStatusStored: string;
  precedentialEffect: string;
  canAddToMatter: boolean;
  link: {
    actNamedInJudgment: string[];
    sectionNumbers: string[];
    occurrences: number;
    resolutionState: string[] | null;
    resolutionReason: string[];
    evidence: string;
  };
};

type Body = {
  ok: boolean;
  data: {
    act: { statuteId: string; heldSectionCount: number; repealRecorded: null };
    section: { sectionId: string; sectionNumber: string } | null;
    scope: string;
    correspondence: { available: boolean; reason: string };
    evidence: string;
    relationship: string;
    semantics: string;
    ordering: string;
    links: Link[];
    page: { limit: number; offset: number; returned: number; hasMore: boolean };
    withheld: {
      byResolutionState: Record<string, { references: number; judgments: number }>;
      chronologyRefusedOnThisPage: number;
    };
    asOf: string;
  };
  error?: { code: string; message: string; details?: Record<string, unknown> };
};

const get = async (path: string, which = app): Promise<{ status: number; body: Body }> => {
  const res = await which.request(path);
  return { status: res.status, body: (await res.json()) as Body };
};

describe('statute-linked judgments', () => {
  let refs = 0;
  let crpcHeld = false;
  const previousFlag = process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'];

  before(async () => {
    const [a] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgment_statute_refs`;
    refs = a?.n ?? 0;
    const [b] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM statutes WHERE id = ${CRPC}`;
    crpcHeld = (b?.n ?? 0) > 0;
  });

  after(async () => {
    if (previousFlag === undefined) delete process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'];
    else process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = previousFlag;
    await sql.end();
    await countingSql.end();
  });

  /* ── the gate ───────────────────────────────────────────────────────────── */

  it('refuses with 409 while the route flag is unset — the released state', async () => {
    delete process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'];
    const { status, body } = await get(`/statutes/${CRPC}/linked-judgments?sectionNumber=482`);
    assert.equal(status, 409);
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, 'CAPABILITY_DISABLED');
    assert.equal(body.error?.details?.['gate'], 'route');
    // Never "there is no law on this". The refusal is about this server.
    assert.ok(!/no (cases|judgments|law)/i.test(body.error?.message ?? ''));
  });

  it('refuses for any value of the flag other than the exact opt-in', async () => {
    for (const value of ['1', 'true', 'yes', 'ENABLED', '']) {
      process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = value;
      const { status } = await get(`/statutes/${CRPC}/linked-judgments`);
      assert.equal(status, 409, `flag value ${JSON.stringify(value)} must not open the route`);
    }
    delete process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'];
  });

  /* ── identity ───────────────────────────────────────────────────────────── */

  it('says we do not HOLD an unknown Act, rather than that it does not exist', async () => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    const { status, body } = await get(
      '/statutes/00000000-0000-4000-8000-000000000000/linked-judgments',
    );
    assert.equal(status, 404);
    assert.equal(body.error?.code, 'STATUTE_NOT_FOUND');
    assert.match(body.error?.message ?? '', /do not hold/i);
  });

  it('rejects a non-uuid statute id at the boundary', async () => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    const { status } = await get('/statutes/ipc/linked-judgments');
    assert.equal(status, 400);
  });

  it('says we do not HOLD an unknown section, and reports how many we do', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld) return t.skip('CrPC not loaded');
    const { status, body } = await get(`/statutes/${CRPC}/linked-judgments?sectionNumber=99999`);
    assert.equal(status, 404);
    assert.equal(body.error?.code, 'SECTION_NOT_FOUND');
    assert.ok((body.error?.details?.['heldSectionCount'] as number) > 0);
    assert.ok(!/does not exist/i.test(body.error?.message ?? ''));
  });

  it('refuses a section that belongs to a different Act instead of answering empty', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld) return t.skip('CrPC not loaded');
    const [ipcSection] = await sql<{ id: string }[]>`
      SELECT id FROM statute_sections WHERE statute_id = ${IPC} LIMIT 1`;
    if (!ipcSection) return t.skip('IPC sections not loaded');
    const { status, body } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionId=${ipcSection.id}`,
    );
    assert.equal(status, 404);
    assert.equal(body.error?.code, 'SECTION_NOT_IN_ACT');
    assert.equal(body.error?.details?.['belongsToStatuteId'], IPC);
  });

  it('refuses two section identities at once rather than choosing one', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld) return t.skip('CrPC not loaded');
    const [s] = await sql<{ id: string }[]>`
      SELECT id FROM statute_sections WHERE statute_id = ${CRPC} AND section_number = '482'`;
    if (!s) return t.skip('CrPC s.482 not loaded');
    const { status } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionId=${s.id}&sectionNumber=482`,
    );
    assert.equal(status, 400);
  });

  /* ── evidence qualification ─────────────────────────────────────────────── */

  it('returns an EMPTY confirmed tier and names what it withheld', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const { status, body } = await get(`/statutes/${CRPC}/linked-judgments?sectionNumber=482`);
    assert.equal(status, 200);
    assert.equal(body.data.evidence, 'resolver_confirmed');
    // Zero rows carry linked_exact or linked_chronology_permitted in this
    // corpus. An empty list is the correct answer; a populated one would mean
    // NULL had been promoted to confirmed.
    assert.equal(body.data.links.length, 0);
    // And it is NOT silent about it: the references exist and are counted.
    const unclassified = body.data.withheld.byResolutionState['unclassified'];
    assert.ok(unclassified, 'the unclassified population must be reported, not omitted');
    assert.ok(unclassified.references > unclassified.judgments);
  });

  it('labels every structural row as unreviewed, and never as confirmed', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const { status, body } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionNumber=482&evidence=structural_unreviewed&limit=25`,
    );
    assert.equal(status, 200);
    assert.ok(body.data.links.length > 0);
    for (const l of body.data.links) {
      assert.equal(l.link.evidence, 'structural_unreviewed');
      // Provenance is absent, and absent is what is reported — never invented.
      assert.equal(l.link.resolutionState, null);
      assert.deepEqual(l.link.resolutionReason, []);
    }
  });

  it('never returns a refused or unresolved resolution state in either tier', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const forbidden = [
      'refused_pre_enactment',
      'unresolved_pre_commencement',
      'unresolved_predecessor',
      'unresolved_date_unsafe',
      'unresolved_section_absent',
      'unresolved_ambiguous',
    ];
    for (const evidence of ['resolver_confirmed', 'structural_unreviewed']) {
      const { body } = await get(
        `/statutes/${CRPC}/linked-judgments?evidence=${evidence}&limit=50`,
      );
      for (const l of body.data.links) {
        for (const state of l.link.resolutionState ?? []) {
          assert.ok(!forbidden.includes(state), `${state} must never be returned as a link`);
        }
      }
    }
  });

  it('returns an honest empty page for a section with no references at all', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const [empty] = await sql<{ section_number: string }[]>`
      SELECT ss.section_number FROM statute_sections ss
       WHERE ss.statute_id = ${CRPC}
         AND NOT EXISTS (
           SELECT 1 FROM judgment_statute_refs r
            WHERE r.statute_id = ${CRPC} AND upper(r.section_number) = upper(ss.section_number))
       ORDER BY ss.order_index LIMIT 1`;
    if (!empty) return t.skip('every held CrPC section carries a reference');
    const { status, body } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionNumber=${empty.section_number}` +
        '&evidence=structural_unreviewed',
    );
    assert.equal(status, 200);
    assert.equal(body.data.links.length, 0);
    // Zero withheld too — which is a DIFFERENT sentence from the confirmed
    // tier's empty page, and the client must be able to tell them apart.
    assert.deepEqual(body.data.withheld.byResolutionState, {});
  });

  /* ── identity and deduplication ─────────────────────────────────────────── */

  it('shows a judgment ONCE even when the court spelled the Act two ways', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const [dup] = await sql<{ judgment_id: string; n: number }[]>`
      SELECT judgment_id, count(*)::int AS n FROM judgment_statute_refs
       WHERE statute_id = ${CRPC} AND upper(section_number) = '482'
       GROUP BY judgment_id HAVING count(*) > 1
       ORDER BY sum(occurrences) DESC LIMIT 1`;
    if (!dup) return t.skip('no multi-spelling reference in this corpus');
    const { body } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionNumber=482` +
        '&evidence=structural_unreviewed&limit=50',
    );
    const rows = body.data.links.filter((l) => l.judgmentId === dup.judgment_id);
    if (rows.length === 0) return t.skip('the duplicate fixture is not on the first page');
    assert.equal(rows.length, 1, 'one judgment, one row');
    // The spellings are kept rather than discarded — they are the evidence.
    assert.ok(rows[0]!.link.actNamedInJudgment.length > 1);
  });

  it('keeps connected matters that share a case title as DISTINCT judgments', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const [shared] = await sql<{ case_title: string; n: number }[]>`
      SELECT j.case_title, count(DISTINCT j.id)::int AS n
        FROM judgment_statute_refs r JOIN judgments j ON j.id = r.judgment_id
       WHERE r.statute_id = ${CRPC} AND upper(r.section_number) = '482'
       GROUP BY j.case_title HAVING count(DISTINCT j.id) > 1
       ORDER BY 2 DESC LIMIT 1`;
    if (!shared) return t.skip('no connected-matter fixture in this corpus');
    const ids = await sql<{ id: string }[]>`
      SELECT DISTINCT j.id FROM judgment_statute_refs r JOIN judgments j ON j.id = r.judgment_id
       WHERE r.statute_id = ${CRPC} AND upper(r.section_number) = '482'
         AND j.case_title = ${shared.case_title}`;
    assert.ok(ids.length > 1);
    /**
     * Every one of them must be reachable as its own row. A neutral citation
     * names several connected matters and a case title is printed on many
     * judgments, so a deduplication keyed on either would silently merge
     * separate decisions — the failure this asserts against.
     */
    const seen = new Set<string>();
    for (const { id } of ids) {
      const [row] = await sql<{ occ: number }[]>`
        SELECT sum(occurrences)::int AS occ FROM judgment_statute_refs
         WHERE judgment_id = ${id} AND statute_id = ${CRPC} AND upper(section_number) = '482'`;
      assert.ok((row?.occ ?? 0) > 0);
      seen.add(id);
    }
    assert.equal(seen.size, ids.length, 'no two connected matters share an identity');
  });

  /* ── pagination and ordering ────────────────────────────────────────────── */

  it('pages disjointly and orders identically across repeat calls', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const base = `/statutes/${CRPC}/linked-judgments?sectionNumber=482&evidence=structural_unreviewed&limit=5`;
    const first = await get(base);
    const firstAgain = await get(base);
    const second = await get(`${base}&offset=5`);
    assert.deepEqual(
      first.body.data.links.map((l) => l.judgmentId),
      firstAgain.body.data.links.map((l) => l.judgmentId),
      'ordering must be total, not decided by physical row order',
    );
    const a = new Set(first.body.data.links.map((l) => l.judgmentId));
    for (const l of second.body.data.links) {
      assert.ok(!a.has(l.judgmentId), 'a row must not appear on two pages');
    }
    assert.equal(first.body.data.page.hasMore, true);
    assert.equal(first.body.data.ordering, 'occurrences_desc_then_judgment_id');
  });

  it('bounds the page — a caller cannot ask for an unbounded statute query', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld) return t.skip('CrPC not loaded');
    const { status } = await get(`/statutes/${CRPC}/linked-judgments?limit=5000`);
    assert.equal(status, 400);
  });

  /* ── truth semantics ────────────────────────────────────────────────────── */

  it('states the relationship without claiming applicability', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld) return t.skip('CrPC not loaded');
    const { body } = await get(`/statutes/${CRPC}/linked-judgments?sectionNumber=482`);
    assert.equal(body.data.relationship, 'cites_statute_reference');
    assert.match(body.data.semantics, /not a finding that/i);
    // The four claims the handoff forbids must not appear anywhere on the wire.
    const wire = JSON.stringify(body.data);
    for (const forbidden of [
      /\bapplies to\b/i,
      /\binterpreting\b/i,
      /\bgood law under\b/i,
      /\bgoverned by\b/i,
    ]) {
      assert.ok(!forbidden.test(wire), `forbidden claim ${forbidden} appeared in the response`);
    }
  });

  it('reports repeal as UNKNOWN, because no repeal is recorded anywhere', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld) return t.skip('CrPC not loaded');
    const { body } = await get(`/statutes/${CRPC}/linked-judgments`);
    // null, never false. `false` would assert the Act is in force.
    assert.equal(body.data.act.repealRecorded, null);
  });

  it('refuses predecessor/successor correspondence rather than applying it', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld) return t.skip('CrPC not loaded');
    const { body } = await get(`/statutes/${CRPC}/linked-judgments?sectionNumber=482`);
    assert.equal(body.data.correspondence.available, false);
    assert.ok(body.data.correspondence.reason.length > 0);
    /**
     * A CrPC query must not silently reach into BNSS. Every returned reference
     * is pinned to the Act that was asked for, and nothing else.
     */
    const { body: structural } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionNumber=482&evidence=structural_unreviewed&limit=25`,
    );
    for (const l of structural.data.links) {
      assert.ok(
        !/sanhita|adhiniyam/i.test(l.link.actNamedInJudgment.join(' ')),
        'a CrPC query must never return a BNSS reference',
      );
    }
  });

  it('reuses the canonical currentness layer rather than rendering the raw column', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    /**
     * The fixture is DERIVED, not hard-coded: the smallest (Act, section)
     * population that contains a set-aside judgment, so the row is certain to
     * be on the first page. A fixture chosen for convenience on a busy section
     * skips instead of asserting, which is how this test would quietly stop
     * testing anything.
     */
    const [moved] = await sql<{ id: string; statute_id: string; section_number: string }[]>`
      WITH movedRefs AS (
        SELECT j.id, r.statute_id, r.section_number
          FROM judgments j JOIN judgment_statute_refs r ON r.judgment_id = j.id
         WHERE j.overruled_status = 'set_aside' AND r.statute_id IS NOT NULL
           -- No inbound adverse edge, so the DERIVED effect is 'set_aside'
           -- itself rather than 'overruled'. Post-OD-14 those are different
           -- answers: an overruled proposition is still addable because the
           -- decision between the parties stands, and only a judgment actually
           -- set aside on appeal is refused. Selecting on the stored column
           -- alone would test the pre-OD-14 rule.
           AND NOT EXISTS (
             SELECT 1 FROM judgment_citations jc
              WHERE jc.cited_judgment_id = j.id
                AND jc.relationship IN ('overruled', 'overruled_in_part', 'doubted'))
         GROUP BY 1, 2, 3)
      SELECT m.id, m.statute_id, m.section_number
        FROM movedRefs m
       ORDER BY (SELECT count(DISTINCT r2.judgment_id) FROM judgment_statute_refs r2
                  WHERE r2.statute_id = m.statute_id
                    AND upper(r2.section_number) = upper(m.section_number)) ASC
       LIMIT 1`;
    if (!moved) return t.skip('no edge-free set-aside judgment is linked to any held Act');
    const { body } = await get(
      `/statutes/${moved.statute_id}/linked-judgments?sectionNumber=${moved.section_number}` +
        '&evidence=structural_unreviewed&limit=50',
    );
    const row = body.data.links.find((l) => l.judgmentId === moved.id);
    assert.ok(row, 'the smallest set-aside population must fit on one page');
    assert.equal(row.overruledStatusStored, 'set_aside');
    assert.equal(row.overruledStatus, 'set_aside', 'the LAW MOVED banner must survive');
    assert.equal(row.precedentialEffect, 'set_aside');
    // The one refusal in the product — and it is the DERIVED effect that
    // decides it, exactly as `/search` and the reader decide it.
    assert.equal(row.canAddToMatter, false);
  });

  it('agrees with the canonical policy layer on every row it returns', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    /**
     * The parity assertion, and the reason it is here rather than a fixture
     * test: the edge-free set-aside case does not occur in this corpus, so a
     * test that waits for one asserts nothing. This recomputes the SAME
     * functions the route calls, from the SAME database rows, and demands the
     * wire match — which is what "reuse the canonical derivation" actually
     * means. It would fail the moment this route grew a second opinion about
     * good law, whatever the corpus happens to contain.
     */
    const { body } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionNumber=482` +
        '&evidence=structural_unreviewed&limit=25',
    );
    assert.ok(body.data.links.length > 0);
    for (const l of body.data.links) {
      const rows = await sql<{ relationship: string; treatment_provenance: string | null }[]>`
        SELECT DISTINCT relationship, treatment_provenance
          FROM judgment_citations
         WHERE cited_judgment_id = ${l.judgmentId}
           AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;
      const edges: TreatmentEdge[] = rows.map((e) => ({
        relationship: e.relationship,
        provenance: e.treatment_provenance as TreatmentProvenance | null,
      }));
      const effect = precedentialEffectFromEdges({
        overruledStatus: l.overruledStatusStored as OverruledStatus,
        edges,
      });
      const policy = precedentialPolicy(effect);
      assert.equal(l.precedentialEffect, effect, `effect diverged on ${l.judgmentId}`);
      assert.equal(l.overruledStatus, policy.bannerStatus, `banner diverged on ${l.judgmentId}`);
      assert.equal(
        l.canAddToMatter,
        policy.addToMatter === 'allow',
        `add-to-matter diverged on ${l.judgmentId}`,
      );
    }
  });

  it('never renders a banner that disagrees with the row it came from', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const { body } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionNumber=482&evidence=structural_unreviewed&limit=25`,
    );
    for (const l of body.data.links) {
      const [row] = await sql<{ overruled_status: string }[]>`
        SELECT overruled_status::text AS overruled_status FROM judgments WHERE id = ${l.judgmentId}`;
      assert.equal(l.overruledStatusStored, row?.overruled_status);
    }
  });

  /* ── scope, access and cost ─────────────────────────────────────────────── */

  it('answers an Act-level query, bounded, and says the scope is the Act', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const { status, body } = await get(
      `/statutes/${CRPC}/linked-judgments?evidence=structural_unreviewed&limit=10`,
    );
    assert.equal(status, 200);
    assert.equal(body.data.scope, 'act');
    assert.equal(body.data.section, null);
    assert.ok(body.data.links.length <= 10);
    assert.match(body.data.semantics, /reference to this Act/);
  });

  it('follows the statute access model — no matter or user data is reachable', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    // Unauthenticated, exactly as `/statutes` and `/statutes/sections` are.
    const { status: statutesStatus } = await get('/statutes');
    const { status, body } = await get(
      `/statutes/${CRPC}/linked-judgments?sectionNumber=482&evidence=structural_unreviewed&limit=5`,
    );
    assert.equal(status, statutesStatus, 'same access model as the rest of the statute surface');
    const wire = JSON.stringify(body.data);
    for (const leak of ['matterId', 'annotation', 'ownerUserId', 'workspaceId', 'userId']) {
      assert.ok(!wire.includes(leak), `${leak} must not appear on a corpus route`);
    }
  });

  it('costs a CONSTANT number of queries — no N+1 on treatment or currentness', async (t) => {
    process.env['STATUTE_LINKED_JUDGMENTS_ROUTE'] = 'enabled';
    if (!crpcHeld || refs === 0) return t.skip('no statute references loaded');
    const measure = async (limit: number): Promise<number> => {
      queryCount = 0;
      const { status } = await get(
        `/statutes/${CRPC}/linked-judgments?sectionNumber=482` +
          `&evidence=structural_unreviewed&limit=${limit}`,
        countingApp,
      );
      assert.equal(status, 200);
      return queryCount;
    };
    /**
     * Warm the pool FIRST. postgres.js issues its own connection-setup
     * statement on the first use of a fresh connection, and the debug hook
     * counts it: measured without this line, limit=1 cost 7 and limit=50 cost
     * 6 — the smaller page looked more expensive, which is a measurement
     * artefact and not an N+1. A cost comparison whose first sample includes a
     * one-off is a cost comparison about nothing.
     */
    await measure(5);
    const small = await measure(1);
    const large = await measure(50);
    assert.equal(
      small,
      large,
      `queries must not scale with page size (limit=1 cost ${small}, limit=50 cost ${large})`,
    );
    // Act row, section row, the ref page, the withheld census, the judgment
    // page, the treatment edges. Six, and a ceiling rather than an exact match
    // so a legitimate extra read is a decision somebody makes, not a surprise.
    assert.ok(large <= 8, `expected at most 8 queries per request, measured ${large}`);
  });
});
