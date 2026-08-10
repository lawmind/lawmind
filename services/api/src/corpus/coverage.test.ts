/**
 * Coverage, against the real database.
 *
 * The point of this surface is that a gap is **visible**, so these tests assert
 * the gap is reported and that the wording cannot be read as a judgment count.
 * A test that only checked the endpoint returns 200 would pass over a response
 * claiming we hold every judgment in India.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

type Coverage = {
  supremeCourt: { courtName: string; held: number; sourceDocuments: number | null };
  highCourts: Array<{
    courtName: string;
    courtCode: string;
    sourceDocuments: number;
    held: number;
    firstYear: number;
    lastYear: number;
  }>;
  judgmentShareUnknown: boolean;
  judgmentShareRange: [number, number];
  enumeratedAt: string | null;
};

const fetchCoverage = async (): Promise<Coverage> => {
  const res = await app.request('/corpus/coverage');
  assert.equal(res.status, 200);
  return ((await res.json()) as { data: Coverage }).data;
};

after(async () => {
  await sql.end();
});

describe('corpus coverage', () => {
  it('reports every High Court the survey enumerated', async () => {
    const cov = await fetchCoverage();
    // 25 High Courts counted in docs/HC_CORPUS_SURVEY.md.
    assert.equal(cov.highCourts.length, 25);
    for (const court of cov.highCourts) {
      assert.ok(court.sourceDocuments > 0, `${court.courtName} has no source documents`);
      assert.ok(court.courtCode.length > 0);
      assert.ok(court.firstYear <= court.lastYear);
    }
  });

  it('THE GAP IS VISIBLE — Allahabad is the largest and we hold none of it', async () => {
    const cov = await fetchCoverage();
    const allahabad = cov.highCourts.find((x) => x.courtName === 'Allahabad High Court');
    assert.ok(allahabad, 'Allahabad missing from coverage');
    // 3,493,695 in the last decade alone; this is all years.
    assert.ok(allahabad.sourceDocuments > 3_000_000);
    // The whole reason this endpoint exists. If an ingest ever lands, this
    // number moves and the assertion below is what should be updated —
    // deliberately, not silently.
    assert.equal(allahabad.held, 0);
  });

  it('sorts worst-gap-first, so the biggest hole is what a client shows', async () => {
    const cov = await fetchCoverage();
    const totals = cov.highCourts.map((x) => x.sourceDocuments);
    assert.deepEqual(totals, [...totals].sort((a, b) => b - a));
  });

  it('the Supreme Court is reported SEPARATELY, and its source total is NULL not 0', async () => {
    const cov = await fetchCoverage();
    assert.equal(cov.supremeCourt.courtName, 'Supreme Court of India');
    assert.equal(cov.supremeCourt.held, 38_341);
    // Unknown is a state, not zero. We never enumerated that bucket per year,
    // and reporting 0 would say the source is empty — the opposite of the truth.
    assert.equal(cov.supremeCourt.sourceDocuments, null);
  });

  it('SAYS OUT LOUD that the denominator is not a judgment count', async () => {
    const cov = await fetchCoverage();
    // docs/HC_CORPUS_SURVEY.md §2: the share is a measured range because
    // `View Judgement/Order` covers 17.89% of rows and distinguishes neither.
    assert.equal(cov.judgmentShareUnknown, true);
    assert.deepEqual(cov.judgmentShareRange, [0.0075, 0.1864]);
  });

  it('NEGATIVE CONTROL — no field anywhere calls the source count "judgments"', async () => {
    const res = await app.request('/corpus/coverage');
    const body = await res.text();
    // A field named sourceJudgments would be a number nobody measured. This is
    // the assertion that stops a future rename from quietly reintroducing it.
    assert.ok(!/sourceJudgments/i.test(body), 'a field claims to count judgments');
    assert.ok(/sourceDocuments/.test(body), 'the documents field is missing');
  });

  it('carries the date the SOURCE was counted — a coverage claim with no date is not checkable', async () => {
    const cov = await fetchCoverage();
    assert.ok(cov.enumeratedAt !== null);
    assert.ok(!Number.isNaN(Date.parse(cov.enumeratedAt!)));
  });
});
