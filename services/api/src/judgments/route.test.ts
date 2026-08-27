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
    bodyText: { state: string; grade: string; evidenceWithheld: boolean };
    dateQuality: string | null;
    dateQualityState: string;
    paragraphs: unknown[];
    neutralCitation: string | null;
    reporterCitations: string[];
    verificationState: string;
    verifiedBySource: string;
    overruledStatus: string;
    bench: string | null;
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
    /**
     * NOT a bare `SELECT id FROM judgments LIMIT 1`.
     *
     * An unordered `LIMIT` is not a sample — it returns whatever the executor
     * reaches first, which moves with the physical layout, so this `before` chose
     * a different judgment on every run. On 27 Aug 2026 it chose
     * `c4b09c53-3380-4a08-811b-d63624b72a87`, a Karnataka judgment convicted
     * `script_quality = 'damaged_other'`, and the first test below failed on
     * `fullText.length > 0`.
     *
     * **The reader was right and the fixture was wrong.** R8.3 §8.3 / FIFTH 1322:
     * a body convicted damaged is WITHHELD by refusal, with `bodyText.state =
     * TEXT_DAMAGED` — and the sibling test forty lines down asserts exactly that,
     * and passed in the same run. This block's subject is the happy path of the
     * reading view, so it has to select a row the evidence gate does not refuse.
     * Asking for one is the fix; relaxing the assertion would have deleted the
     * only test that says the reader renders anything at all.
     *
     * `length(full_text) > 200` for the same reason the unconvicted-body test
     * uses it: a judgment whose text is genuinely a stub is not a counterexample
     * to "the reading view renders full text" either.
     */
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM judgments
       WHERE script_quality IS NULL
         AND length(full_text) > 200
       LIMIT 1`;
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

  it('a judgment with no citation of any kind round-trips null/empty — task 002, never fabricated', async (t) => {
    // Deterministic ID lookup, not a ranked search — the property under test is
    // the server's fidelity to the row, and must not depend on whether the
    // judgment happens to rank in a query's top results.
    const [uncitable] = await sql<{ id: string }[]>`
      SELECT id FROM judgments
       WHERE neutral_citation IS NULL AND array_length(reporter_citations, 1) IS NULL
       LIMIT 1`;
    if (!uncitable) return t.skip('no uncitable judgment in this corpus — expected once the HC ingest resumes');

    const { status, body } = await get(`/judgments/${uncitable.id}`);
    assert.equal(status, 200);
    // The whole point of task 002 (`docs/CITATION_HARNESS.md` §The fourth
    // concern): the server never invents a citation and never drops the row
    // for lacking one. `citationRender` (client) derives the fourth render
    // state from exactly these two fields, so they must arrive exactly as
    // stored — null and empty, never a placeholder string.
    assert.equal(body.data?.neutralCitation, null);
    assert.deepEqual(body.data?.reporterCitations, []);
  });

  it('NEVER sends a court code where the coram belongs — migration 0040', async () => {
    // What shipped: `harvest/hc-load.ts` mapped `bench: partitions.bench`, the
    // AWS bucket's S3 path segment (`.../bench=patnahcucisdb94/...`), which
    // names the court ESTABLISHMENT. `judgments.bench` means the JUDGES WHO
    // SAT and this route renders it as the coram. 40,980 rows — 51.3% of the
    // corpus, every High Court judgment we hold — showed a database slug on
    // the judgment screen, and not one of them had a `judgment_judges` row.
    //
    // Asserted over the whole column rather than one fetched row: the defect
    // was uniform across a court, so a single-row check would have passed
    // against 39,445 broken Patna judgments by drawing a Supreme Court one.
    const [bad] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgments WHERE bench ~ '^[a-z0-9_]+$'`;
    assert.equal(bad?.n, 0, 'a lowercase single-token bench is a court code, not a judge');

    // And absence is a real answer, not an error: the plain High Court metadata
    // variant publishes no judge field at all, so NULL is what honesty looks
    // like here. The route must send it rather than substituting anything.
    const [nulled] = await sql<{ id: string }[]>`
      SELECT id FROM judgments WHERE bench IS NULL LIMIT 1`;
    if (nulled) {
      const { status, body } = await get(`/judgments/${nulled.id}`);
      assert.equal(status, 200);
      assert.equal(body.data?.bench, null, 'an absent coram renders as absent, never as a code');
    }
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

  /**
   * FIFTH bus 1322. The reader was the one body-text path in the API that did
   * not obey `body-text-safety.ts`, and it is the path whose entire purpose is
   * to hand an advocate the body.
   *
   * The test is written against the DAMAGED POPULATION rather than one id, and
   * it asserts the SAFE side too. A gate that withholds everything passes a
   * withholding test and destroys the product; a gate that withholds nothing
   * passes a "text is present" test and is the defect. Both halves, or neither
   * is evidence.
   */
  describe('body-text evidence gate — the reader refuses what search refuses', () => {
    it('withholds fullText and paragraphs for a convicted body, and says so', async (t) => {
      const [damaged] = await sql<{ id: string; script_quality: string; len: number }[]>`
        SELECT id, script_quality, length(full_text)::int AS len
          FROM judgments
         WHERE script_quality IS NOT NULL
           AND script_quality <> ALL (ARRAY['clean', 'mixed_script_ok'])
           AND length(full_text) > 0
         LIMIT 1`;
      if (!damaged) return t.skip('no convicted body in this corpus');

      // Non-vacuity: the row really does hold text, so an empty `fullText`
      // below is a refusal and not an empty column.
      assert.ok(damaged.len > 0, 'the fixture must actually have text to withhold');

      const { status, body } = await get(`/judgments/${damaged.id}`);
      assert.equal(status, 200, 'a damaged body must stay REACHABLE — metadata is undamaged');
      assert.equal(body.data?.bodyText.state, 'TEXT_DAMAGED');
      assert.equal(body.data?.bodyText.evidenceWithheld, true);
      assert.equal(body.data?.fullText, '', 'the body is refused, not rendered');
      assert.deepEqual(body.data?.paragraphs, [], 'nothing derived from the body survives either');
      // The metadata half of the split is the point: the advocate must still
      // find and identify the case.
      assert.ok((body.data?.caseTitle.length ?? 0) > 0, 'title is not body-derived');
    });

    it('does NOT withhold an unconvicted body — the gate is not a blanket refusal', async (t) => {
      const [safeRow] = await sql<{ id: string }[]>`
        SELECT id FROM judgments
         WHERE script_quality IS NULL AND length(full_text) > 200
         LIMIT 1`;
      if (!safeRow) return t.skip('no unconvicted body with text in this corpus');

      const { body } = await get(`/judgments/${safeRow.id}`);
      assert.equal(body.data?.bodyText.state, 'TEXT_UNKNOWN');
      assert.equal(body.data?.bodyText.evidenceWithheld, false);
      assert.ok((body.data?.fullText.length ?? 0) > 0, 'an unconvicted body still reads');
    });

    it('names the unchecked date state instead of sending null alone — R8.3 §5.5', async (t) => {
      const [unchecked] = await sql<{ id: string }[]>`
        SELECT j.id FROM judgments j
         WHERE NOT EXISTS (SELECT 1 FROM judgment_date_quality q WHERE q.judgment_id = j.id)
         LIMIT 1`;
      if (!unchecked) return t.skip('every judgment has a date verdict');
      const { body } = await get(`/judgments/${unchecked.id}`);
      assert.equal(body.data?.dateQuality, null, 'the existing four-value field is unchanged');
      assert.equal(
        body.data?.dateQualityState,
        'DATE_UNCHECKED',
        'and the named state says which of the four it is',
      );
    });

    it('keeps DATE_UNKNOWN distinct from DATE_UNCHECKED — nothing is merged', async (t) => {
      const [known] = await sql<{ id: string }[]>`
        SELECT judgment_id AS id FROM judgment_date_quality WHERE state = 'DATE_UNKNOWN' LIMIT 1`;
      if (!known) return t.skip('no DATE_UNKNOWN row in this corpus');
      const { body } = await get(`/judgments/${known.id}`);
      assert.equal(body.data?.dateQualityState, 'DATE_UNKNOWN');
    });
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
