/**
 * THE FRESHNESS OBJECT'S ONE RULE, ASSERTED RATHER THAN COMMENTED.
 *
 * Recency and completeness are separate fields and must stay separate. The
 * failure this guards against is not a crash — it is somebody helpfully adding a
 * single `freshnessScore`, or filling `latestUpstreamDecisionDate` with a value
 * that is merely plausible, and both of those ship green.
 *
 * The specific way it goes wrong is recorded: on 2026-08-25 `max(judgment_date)`
 * said eight days behind on a corpus that was fifty-six days behind, because
 * August held 480 judgments against a baseline of 117,332. A month with one
 * document has a perfect newest-date and no coverage. Any number that mixes the
 * two reproduces that.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { buildFreshnessObject, completenessOf, type FreshnessObject } from './freshness-object.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

describe('corpus freshness object', () => {
  let obj: FreshnessObject | null = null;
  let corpusSize = 0;

  before(async () => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgment_coverage`;
    corpusSize = row?.n ?? 0;
    obj = await buildFreshnessObject(sql);
  });

  after(async () => {
    await sql.end();
  });

  /* ── the grading function, in isolation ─────────────────────────────────── */

  it('grades exactly at NEW2 floors — 0.6 and 0.1, inclusive at the boundary', () => {
    // The boundary matters: NEW2 uses `>=`, and a `>` here would silently
    // reclassify every court sitting exactly on its own baseline.
    assert.equal(completenessOf(1.0), 'COMPLETE_ENOUGH');
    assert.equal(completenessOf(0.6), 'COMPLETE_ENOUGH');
    assert.equal(completenessOf(0.5999), 'PARTIAL');
    assert.equal(completenessOf(0.1), 'PARTIAL');
    assert.equal(completenessOf(0.0999), 'EFFECTIVELY_ABSENT');
    assert.equal(completenessOf(0), 'EFFECTIVELY_ABSENT');
    // No baseline is its own answer and never EFFECTIVELY_ABSENT — a court we
    // have never held is not a court that has stopped publishing.
    assert.equal(completenessOf(null), 'NO_BASELINE');
  });

  /* ── the rule ───────────────────────────────────────────────────────────── */

  it('carries recency and completeness as separate fields and offers no combined score', () => {
    assert.ok(obj);
    // Recency is a DATE field; completeness is a RATIO field. Both present.
    assert.ok('latestLocalDecisionDate' in obj);
    assert.ok('upstreamLocalCompleteness' in obj);

    // And nothing that reads as one number for both.
    const banned = /^(freshness|currency|health)(Score|Percent|Pct|Index|Rating)$/i;
    const offenders = Object.keys(obj).filter((k) => banned.test(k));
    assert.deepEqual(
      offenders,
      [],
      'a single freshness score reproduces the 8-days-vs-56-days error by construction',
    );
  });

  it('never reports a lag without saying which side of it is known', () => {
    assert.ok(obj);
    if (obj.sourceLagDays === null) {
      assert.notEqual(
        obj.sourceLagState,
        'MEASURED',
        'a null lag may not be labelled MEASURED — null and zero render the same in most ' +
          'clients, and "we are perfectly current" is the most dangerous thing this can say',
      );
    } else {
      assert.equal(obj.sourceLagState, 'MEASURED');
      assert.ok(obj.latestUpstreamDecisionDate, 'a measured lag needs both endpoints');
      assert.ok(obj.latestLocalDecisionDate);
    }
  });

  it('an unmeasured upstream date is stated, never substituted', () => {
    assert.ok(obj);
    if (obj.latestUpstreamDecisionDate === null) {
      assert.equal(obj.latestUpstreamDecisionState, 'NOT_MEASURED');
      // The three tempting substitutions all produce a plausible date that is
      // not this field. The most dangerous is our own maximum, which would make
      // sourceLagDays a confident zero.
      assert.notEqual(
        obj.latestUpstreamDecisionDate,
        obj.latestLocalDecisionDate,
        'upstream must never be filled from our own maximum',
      );
    } else {
      assert.equal(obj.latestUpstreamDecisionState, 'MEASURED');
    }
  });

  it('the completeness denominator always says what it actually counts', () => {
    assert.ok(obj);
    const u = obj.upstreamLocalCompleteness;
    assert.ok(
      ['PARQUET_ROWS_NOT_DEDUPED', 'UPSTREAM_UNIQUE_RECORDS', 'NOT_MEASURED'].includes(
        u.denominatorState,
      ),
    );
    if (u.ratio !== null) {
      assert.notEqual(
        u.denominatorState,
        'NOT_MEASURED',
        'a ratio computed from an unmeasured denominator is a number with no meaning',
      );
      assert.ok(u.upstreamRecords && u.upstreamRecords > 0);
      assert.ok(
        u.denominatorNote.length > 40,
        'the denominator needs a stated provenance, not a label',
      );
      // A ratio whose denominator is parquet rows can legitimately exceed or
      // fall short of 1; what it must never do is claim to be deduped.
      if (u.denominatorState === 'PARQUET_ROWS_NOT_DEDUPED') {
        assert.match(u.denominatorNote, /PARQUET ROWS|not unique records/i);
      }
    }
    assert.ok(
      u.upstreamMeasuredAt === null || !Number.isNaN(Date.parse(u.upstreamMeasuredAt)),
      'an upstream figure carries the timestamp of the measurement it came from',
    );
  });

  it('counts every source whose current position cannot be stated', () => {
    assert.ok(obj);
    assert.equal(
      obj.unavailableSourceCount,
      obj.unavailableSources.length,
      'the count is the field that gets rendered; it must equal the list',
    );
    for (const s of obj.unavailableSources) {
      assert.ok(s.reason.length > 20, `${s.source} needs a stated reason, not a flag`);
    }
    // Non-vacuous: today no adapter can state its newest item at source, so a
    // zero here would mean the check stopped looking rather than that the
    // sources became knowable.
    assert.ok(
      obj.unavailableSourceCount > 0,
      'zero unavailable sources would claim we know where every source stands',
    );
  });

  /* ── court x month, computed identically to NEW2's ──────────────────────── */

  it('court x month uses each court own baseline, not a corpus-wide one', async (t) => {
    assert.ok(obj);
    if (corpusSize === 0 || obj.courtMonthDetail.length < 2) {
      return t.skip('needs a populated multi-court corpus');
    }
    const baselines = obj.courtMonthDetail.map((c) => c.baselinePerMonth);
    const distinct = new Set(baselines);
    assert.ok(
      distinct.size > 1,
      'every court sharing one baseline means a corpus-wide mean crept back in, which calls ' +
        'every small High Court incomplete for being small',
    );
    for (const court of obj.courtMonthDetail) {
      for (const m of court.months) {
        if (court.baselinePerMonth > 0 && m.ratioToOwnBaseline !== null) {
          assert.equal(
            m.state,
            completenessOf(m.ratioToOwnBaseline),
            `${court.court} ${m.month}: state and ratio disagree`,
          );
        }
      }
    }
  });

  it('every court reports the same months, so a missing month reads as zero and not as absent', async (t) => {
    assert.ok(obj);
    if (obj.courtMonthDetail.length < 2) return t.skip('needs at least two courts');
    const shape = obj.courtMonthDetail[0]!.months.map((m) => m.month).join(',');
    for (const court of obj.courtMonthDetail) {
      assert.equal(
        court.months.map((m) => m.month).join(','),
        shape,
        `${court.court} has a different month set — a court missing from a month must appear ` +
          'with 0 documents, because "no rows" and "not asked" are different facts',
      );
    }
  });

  it('the naive reading is carried and labelled as the one not to act on', () => {
    assert.ok(obj);
    assert.ok('naive' in obj);
    assert.match(
      obj.naive.reading,
      /max\(judgment_date\)/,
      'the naive field must name the query it is, so a reader can see it losing',
    );
    assert.match(obj.naive.reading, /never quote/i);
  });

  it('states its caveats, and the unmeasured upstream date is one of them', () => {
    assert.ok(obj);
    assert.ok(obj.caveats.length >= 4);
    assert.ok(
      obj.caveats.some((c) => /latestUpstreamDecisionDate is NOT_MEASURED/.test(c)),
      'the largest unknown must be in the caveats, not only in a field',
    );
    assert.ok(
      obj.caveats.some((c) => /must stay separate|no single freshness score/i.test(c)),
      'the non-collapse rule travels with the payload',
    );
  });
});
