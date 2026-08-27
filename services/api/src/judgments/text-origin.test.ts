/**
 * FIFTH bus 1367 — the reporter-edition boundary, and the two ways a boundary
 * like this goes wrong.
 *
 *   VACUOUS   it classifies nothing as REPORTER_EDITION, so the field is
 *             decorative and the reader still serves a headnote as the court's
 *             own words.
 *   SWEEPING  it classifies everything, so 18.7 million judgments become
 *             ineligible as evidence and the product stops working.
 *
 * Both halves are asserted, against the live corpus, because the population is
 * the claim: this is not one document with a headnote.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';
import { generationEvidenceEligible, textOriginOf } from './text-origin.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

after(async () => {
  await sql.end();
});

describe('text origin — derived from provenance, never from content', () => {
  it("FIFTH's example is REPORTER_EDITION on the live route", async (t) => {
    const id = '38a8739b-718d-412b-926f-bf77b24f937c';
    const [row] = await sql`SELECT id FROM judgments WHERE id = ${id}`;
    if (!row) return t.skip('the sampled judgment is not in this corpus');

    const res = await app.request(`/judgments/${id}`);
    assert.equal(res.status, 200, 'the authority must stay readable');
    const body = (await res.json()) as {
      data: { textOrigin: string; generationEvidenceEligible: boolean; fullText: string };
    };
    assert.equal(body.data.textOrigin, 'REPORTER_EDITION');
    assert.equal(body.data.generationEvidenceEligible, false);
    // Deliberately still served. Withholding 38,342 Supreme Court judgments
    // would be a far larger defect than the one being fixed; what changed is
    // that the wire now says whose edition it is.
    assert.ok(body.data.fullText.length > 0, 'the body is marked, not withheld');
  });

  it('classifies the whole S.C.R. bucket, not one row — the population IS the finding', async (t) => {
    const rows = await sql<{ source_url: string; reporter_citations: string[] }[]>`
      SELECT source_url, reporter_citations FROM judgments
       WHERE court = 'Supreme Court of India'
         AND source_url LIKE '%indian-supreme-court-judgments%'
       LIMIT 400`;
    if (rows.length === 0) return t.skip('no Supreme Court bucket rows in this corpus');
    const reporter = rows.filter((r) => textOriginOf(r) === 'REPORTER_EDITION').length;
    // Not 100% asserted: an object whose name stops matching the volume/page
    // scheme is deliberately UNKNOWN rather than swept in. A large majority is
    // the honest expectation and a tiny number would mean the rule broke.
    assert.ok(
      reporter > rows.length * 0.9,
      `only ${reporter} of ${rows.length} sampled bucket rows classified as reporter edition`,
    );
  });

  it('does NOT sweep the rest of the corpus — the gate is not a blanket', async (t) => {
    const rows = await sql<{ source_url: string; reporter_citations: string[] }[]>`
      SELECT source_url, reporter_citations FROM judgments
       WHERE source_url NOT LIKE '%indian-supreme-court-judgments%'
       LIMIT 300`;
    if (rows.length === 0) return t.skip('no non-bucket rows');
    const swept = rows.filter((r) => textOriginOf(r) === 'REPORTER_EDITION');
    assert.equal(swept.length, 0, 'provenance outside the reporter bucket must not classify');
  });

  it('a reporter CITATION alone is not evidence about the ARTIFACT', () => {
    // A judgment can carry an S.C.C. citation while the text we hold came from
    // the court. Citation is about the case; origin is about the file.
    assert.equal(
      textOriginOf({
        source_url: 'https://someregistry.gov.in/judgment/12345.pdf',
        reporter_citations: ['(1994) 3 SCC 1'],
      }),
      'UNKNOWN',
    );
  });

  it('an unrecognised object name in the same bucket is UNKNOWN, not swept in', () => {
    assert.equal(
      textOriginOf({
        source_url:
          'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year=2026/english/somethingelse.pdf',
        reporter_citations: ['[1996] SUPP. 2 S.C.R. 424'],
      }),
      'UNKNOWN',
    );
  });

  it('UNKNOWN stays generation-eligible, and that is stated rather than hidden', () => {
    // The uncomfortable half. 90% of the corpus is UNKNOWN and refusing it would
    // refuse the product. The caller gets a fact — origin not established —
    // rather than a permission dressed as one.
    assert.equal(generationEvidenceEligible('UNKNOWN'), true);
    assert.equal(generationEvidenceEligible('COURT_SOURCE'), true);
    assert.equal(generationEvidenceEligible('REPORTER_EDITION'), false);
  });
});
