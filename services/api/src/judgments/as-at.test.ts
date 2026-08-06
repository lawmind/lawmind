/**
 * Point-in-time good law — and the bug that made it say the opposite of the truth.
 *
 * `already_moved` read 0 corpus-wide because the comparison used
 * `overruled_status_changed_at`, which is when OUR row was written, not when the
 * law moved. The back-fill stamps it `now()`, so every authority looked as though
 * it fell after every judgment that cited it.
 *
 * The case that exposed it, found by the client lane on production:
 *
 *   Balwinder Singh (Binda) v. NCB   delivered 2023-09-22
 *     relied on Kanhaiyalal v. UOI   set aside by Tofan Singh, 2020-10-29
 *   -> already_moved, by 1,058 days. The endpoint said `moved_since`.
 *
 * These are not shades of one thing. `moved_since` says the law changed under a
 * bench that could not have known — unremarkable. `already_moved` says the bench
 * relied on an authority that had been dead for three years.
 *
 * So these tests assert against DATES FROM COURT RECORDS, and one of them asserts
 * the negative directly: the response must not date a legal event by our write
 * time, whatever else it carries.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

type Authority = {
  caseTitle: string;
  overruledByJudgmentId: string | null;
  standingWhenRelied: string;
  daysAlreadyMoved: number | null;
  overruledOn: string | null;
  overruledStatus: string;
  judgmentDate: string;
};

describe('authorities as at delivery', () => {
  let subjectId: string | null = null;

  const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

  before(async () => {
    // Any judgment that relied on an authority already overruled ON THE DAY it
    // was delivered. Found by dates, not by hard-coded ids, so this survives a
    // re-ingest that changes uuids.
    const [row] = await sql<{ id: string; judgment_date: string }[]>`
      SELECT citing.id, citing.judgment_date::text AS judgment_date
      FROM judgment_citations c
      JOIN judgments citing   ON citing.id = c.citing_judgment_id
      JOIN judgments cited    ON cited.id  = c.cited_judgment_id
      JOIN judgments overruler ON overruler.id = cited.overruled_by_judgment_id
      WHERE cited.overruled_status <> 'none'
        AND overruler.judgment_date < citing.judgment_date
      LIMIT 1`;
    subjectId = row?.id ?? null;
  });

  after(async () => {
    await sql.end();
  });

  it('classifies from two court dates, never from our write time', async (t) => {
    if (!subjectId) return t.skip('needs a corpus with a back-filled citation graph');

    const res = await app.request(`/judgments/${subjectId}/authorities`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: { deliveredOn: string; counts: Record<string, number>; authorities: Authority[] };
    };

    const moved = body.data.authorities.filter(
      (a) =>
        a.overruledOn && a.overruledStatus !== 'none' && a.standingWhenRelied !== 'overruled_here',
    );
    assert.ok(moved.length > 0, 'the fixture judgment must have at least one moved authority');

    for (const a of moved) {
      const expected = a.overruledOn! <= body.data.deliveredOn ? 'already_moved' : 'moved_since';
      assert.equal(
        a.standingWhenRelied,
        expected,
        `${a.caseTitle}: overruled on ${a.overruledOn}, relied on ${body.data.deliveredOn}. ` +
          `Expected ${expected}, got ${a.standingWhenRelied}. Both dates are court records — ` +
          'if this fails, the comparison has drifted back onto a database timestamp.',
      );
    }

    // The whole point: this count was structurally 0 before the fix.
    assert.ok(
      body.data.counts['alreadyMoved']! > 0,
      'alreadyMoved is 0 on a judgment selected precisely because it relied on an ' +
        'authority already overruled. That is the original bug.',
    );
  });

  it('reports the gap in days between two judgments, not between now and one', async (t) => {
    if (!subjectId) return t.skip('needs a corpus with a back-filled citation graph');

    const res = await app.request(`/judgments/${subjectId}/authorities`);
    const body = (await res.json()) as { data: { deliveredOn: string; authorities: Authority[] } };

    for (const a of body.data.authorities.filter((x) => x.standingWhenRelied === 'already_moved')) {
      const expected = Math.floor(
        (new Date(body.data.deliveredOn).getTime() - new Date(a.overruledOn!).getTime()) /
          86_400_000,
      );
      assert.equal(
        a.daysAlreadyMoved,
        expected,
        `${a.caseTitle}: gap must be between the overruling judgment and this one`,
      );
      // A gap measured against `now()` would be enormous and grow every day.
      assert.ok(
        a.daysAlreadyMoved! < 40_000,
        'gap looks like it was measured against the present, not against a judgment date',
      );
    }
  });

  it('says unknown rather than dating the law by our own write', async (t) => {
    if (!subjectId) return t.skip('needs a corpus with a back-filled citation graph');

    const res = await app.request(`/judgments/${subjectId}/authorities`);
    const body = (await res.json()) as { data: { authorities: Authority[] } };

    for (const a of body.data.authorities) {
      if (a.overruledStatus !== 'none' && !a.overruledOn) {
        assert.equal(
          a.standingWhenRelied,
          'unknown',
          'an authority whose status moved but whose overruling judgment we do not ' +
            'hold must be unknown — never dated from overruled_status_changed_at',
        );
      }
    }
  });

  it('states facts and never rates a judgment', async (t) => {
    if (!subjectId) return t.skip('needs a corpus');

    const res = await app.request(`/judgments/${subjectId}/authorities`);
    const text = await res.text();
    // FEATURE_PARITY.md §4 — we decline outcome prediction and soundness rating.
    for (const word of ['soundness', 'score', 'probability', 'likelihood', 'weak', 'vulnerable']) {
      assert.ok(
        !new RegExp(`"[^"]*${word}[^"]*"\\s*:`, 'i').test(text),
        `response carries a "${word}" field. This endpoint states what courts did; ` +
          'it does not grade reasoning.',
      );
    }
  });

  it('never calls the overruling bench a bench that relied on dead law', async (t) => {
    // Measured across the corpus: 22 of the 48 edges that DATE as already-moved
    // are the overruling judgment citing the authority it overrules. Tofan Singh
    // reciting Kanhaiyalal. Navtej Singh Johar reciting Suresh Kumar Koushal.
    // Vidya Drolia, Sita Soren, Joseph Shine, Vineeta Sharma, Puttaswamy.
    //
    // Their dates are necessarily equal, so a pure date comparison lands them in
    // `already_moved` — which says the bench relied on law that had already
    // fallen, about the bench that made it fall. On the landmarks.
    const rows = await sql<{ id: string }[]>`
      SELECT DISTINCT citing.id
      FROM judgment_citations c
      JOIN judgments citing ON citing.id = c.citing_judgment_id
      JOIN judgments cited  ON cited.id  = c.cited_judgment_id
      WHERE cited.overruled_by_judgment_id = citing.id
      LIMIT 5`;
    if (rows.length === 0) return t.skip('needs a judgment that overrules something it cites');

    for (const row of rows) {
      const res = await app.request(`/judgments/${row.id}/authorities`);
      const body = (await res.json()) as { data: { authorities: Authority[] } };
      const self = body.data.authorities.filter((a) => a.overruledByJudgmentId === row.id);
      for (const a of self) {
        assert.equal(
          a.standingWhenRelied,
          'overruled_here',
          `${a.caseTitle}: this judgment IS the one that overruled it. ` +
            'Calling that already_moved says the bench relied on dead law it killed itself.',
        );
        assert.equal(a.daysAlreadyMoved, null, 'a gap of zero days is not a gap');
      }
    }
  });
});
