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
import { ISO_8601 } from '../iso-time.ts';
import { CORPUS_SKIP, hasCorpus } from '../testing/corpus-required.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** Measured ONCE, before any suite is defined - see testing/corpus-required.ts. */
const corpus = await hasCorpus(sql);
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
  it('reports every High Court the survey enumerated', async (t) => {
    if (!corpus) return t.skip(CORPUS_SKIP);
    const cov = await fetchCoverage();
    // 25 High Courts counted in docs/HC_CORPUS_SURVEY.md.
    assert.equal(cov.highCourts.length, 25);
    for (const court of cov.highCourts) {
      assert.ok(court.sourceDocuments > 0, `${court.courtName} has no source documents`);
      assert.ok(court.courtCode.length > 0);
      assert.ok(court.firstYear <= court.lastYear);
    }
  });

  /**
   * THE PREMISE THIS TEST PINNED HAS MOVED, AND THE SURVEY IT POINTED AT WAS NOT WRONG.
   *
   * The assertion here was `heldShare < 0.001` — "we hold effectively none of
   * Allahabad" — with a message saying `docs/HC_CORPUS_SURVEY.md` would need
   * rewriting before it was relaxed. On 27 Aug 2026 it reads **65.143%
   * (2,276,087 of 3,493,991)**. NEW2's High Court ingest did that, on purpose,
   * over three weeks.
   *
   * **The survey does not need rewriting.** It counts the SOURCE — 20,529,202
   * documents in the AWS bucket, from parquet footers — and that number has not
   * moved. What moved is what we HOLD. The old assertion read a snapshot of our
   * holdings as if it were a property of the source, and those are the two sides
   * of the very ratio this endpoint exists to publish. Pinning either one pins
   * the wrong half.
   *
   * So what replaces it is the claim that cannot go stale and is the one that
   * would actually hurt an advocate if it broke: **the number is derived live
   * from `judgments`, and it is the same number a direct count gives.** A
   * coverage figure that is stale in the reassuring direction is worse than no
   * figure at all — `coverage.ts` says so in its own comment — and a cached or
   * optimistic `held` is the only way this endpoint can lie.
   *
   * Two more assertions ride along, both about shape rather than snapshot: the
   * ratio must be reportable (a zero denominator would make every share NaN and
   * render as nothing), and `held` must not exceed `sourceDocuments`, which would
   * mean the denominator is measuring a different population from the numerator.
   *
   * The three-week-old failure this replaces was NOT a defect and was not stale
   * prose either: it was a data fact outrunning its test, and the pin worked.
   */
  it('THE GAP IS VISIBLE — the largest court reports a live, checkable share', async (t) => {
    if (!corpus) return t.skip(CORPUS_SKIP);
    const cov = await fetchCoverage();
    const allahabad = cov.highCourts.find((x) => x.courtName === 'Allahabad High Court');
    assert.ok(allahabad, 'Allahabad missing from coverage');
    // 3,493,695 in the last decade alone; this is all years. A SOURCE count, and
    // the half of the ratio that a survey of the bucket is entitled to pin.
    assert.ok(allahabad.sourceDocuments > 3_000_000);

    // DERIVED LIVE, NOT STORED. The one failure this endpoint can have that an
    // advocate would never see: a held count that is behind the corpus, or ahead
    // of it. Same query the route runs, asked independently.
    const [direct] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgments WHERE court = 'Allahabad High Court'`;
    assert.ok(direct, 'the direct count returned no row');
    // An ingest can commit between the two reads, so the bound is drift, not
    // equality — but it is a tight bound, because the route must not be reading a
    // cache. 5,000 rows is under four minutes of the fleet's measured best rate.
    assert.ok(
      Math.abs(allahabad.held - direct.n) < 5_000,
      `the endpoint reported ${allahabad.held} held and a direct count says ${direct.n} — ` +
        'this figure is supposed to be derived live, never cached',
    );

    // Reportable, and the two sides measure the same population.
    assert.ok(allahabad.sourceDocuments > 0, 'a zero denominator renders as nothing at all');
    const heldShare = allahabad.held / allahabad.sourceDocuments;
    assert.ok(
      heldShare >= 0 && heldShare <= 1,
      `held share is ${heldShare} (${allahabad.held} of ${allahabad.sourceDocuments}) — ` +
        'held cannot exceed the source count unless the two are counting different things',
    );
  });

  it('sorts worst-gap-first, so the biggest hole is what a client shows', async () => {
    const cov = await fetchCoverage();
    const totals = cov.highCourts.map((x) => x.sourceDocuments);
    assert.deepEqual(
      totals,
      [...totals].sort((a, b) => b - a),
    );
  });

  it('the Supreme Court is reported SEPARATELY, and its source total is NULL not 0', async (t) => {
    if (!corpus) return t.skip(CORPUS_SKIP);
    const cov = await fetchCoverage();
    assert.equal(cov.supremeCourt.courtName, 'Supreme Court of India');
    // A floor, not a snapshot — same reasoning as the Allahabad assertion above.
    // This test's subject is that the Supreme Court is reported on its own and
    // that its denominator is NULL; the exact held count is incidental to it,
    // and pinning it made an ordinary ingest (38,341 → 38,342) read as a defect.
    // A floor still catches the failure that matters: the corpus emptying out.
    assert.ok(
      cov.supremeCourt.held > 38_000,
      `Supreme Court held count fell to ${cov.supremeCourt.held}`,
    );
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

  it('carries the date the SOURCE was counted — a coverage claim with no date is not checkable', async (t) => {
    if (!corpus) return t.skip(CORPUS_SKIP);
    const cov = await fetchCoverage();
    assert.ok(cov.enumeratedAt !== null);
    // ISO_8601, not `Date.parse` — this test asserted only that Node could parse
    // it, and Node parses the Postgres text form that Hermes refuses. It WAS the
    // Postgres form: `max(enumerated_at)::text` reached the client here until
    // 27 Aug 2026, and the assertion below is what would have caught it.
    assert.match(cov.enumeratedAt!, ISO_8601);
  });
});
