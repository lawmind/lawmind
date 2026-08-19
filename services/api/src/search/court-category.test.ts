/**
 * Court categories, against the real column — RCC bus 0046.
 *
 * The classifier's whole job is that a court in the corpus never falls through
 * it, because a court that falls through is invisible to every filtered search
 * and looks exactly like "your query matched nothing". So these tests run
 * against the distinct values production actually holds, not a fixture list.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import {
  categoryOf,
  COURT_CATEGORIES,
  expandCategories,
  unclassifiedCourts,
  unpopulatedCategories,
} from './court-category.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

after(async () => {
  await sql.end();
});

describe('court categories', () => {
  it('classifies every printed form the corpus actually holds', () => {
    // All five shapes, read off production 11 Aug 2026 — name-first, name-last,
    // a double space, and a capitalised "Of". Spacing and case in this corpus
    // are unreliable, which is why matching is neither exact nor case-sensitive.
    assert.equal(categoryOf('Supreme Court of India'), 'sc');
    assert.equal(categoryOf('Patna High Court'), 'hc');
    assert.equal(categoryOf('High Court of Gujarat'), 'hc');
    assert.equal(categoryOf('High Court  for State of Telangana'), 'hc');
    assert.equal(categoryOf('High Court Of Chhattisgarh'), 'hc');
  });

  it('recognises district and tribunal names before we hold any', () => {
    // Written from how these courts print their own names, so the category
    // works the day rows land rather than needing this file edited then.
    assert.equal(categoryOf('District and Sessions Court, Pune'), 'district');
    assert.equal(categoryOf('Chief Judicial Magistrate, Patna'), 'district');
    assert.equal(categoryOf('National Company Law Appellate Tribunal'), 'tribunal');
    assert.equal(categoryOf('Income Tax Appellate Tribunal'), 'tribunal');
  });

  it('returns null for a court no rule claims, rather than guessing one', () => {
    // Guessing would file a judgment behind a filter it does not belong to, and
    // the advocate cannot see what was wrongly included. Less is safer.
    assert.equal(categoryOf('Court of the Lord High Executioner'), null);
    assert.equal(categoryOf(''), null);
  });

  it('NO court in the corpus is unclassified', async () => {
    // The silent failure this module exists to prevent: an ingest lands a court
    // whose name none of the rules recognise and its judgments disappear from
    // every filtered search, with no error anywhere.
    const orphans = await unclassifiedCourts(sql);
    assert.deepEqual(orphans, [], `these courts match no category: ${orphans.join(' · ')}`);
  });

  it('expands sc to exactly one name and hc to many', async (t) => {
    const scNames = await expandCategories(sql, ['sc']);
    if (scNames.length === 0) return t.skip('no corpus loaded');
    assert.deepEqual(scNames, ['Supreme Court of India']);

    const hcNames = await expandCategories(sql, ['hc']);
    assert.ok(hcNames.length > 1, 'the corpus holds many High Courts');
    assert.ok(!hcNames.includes('Supreme Court of India'), 'sc must not leak into hc');
  });

  it('an empty request expands to nothing, and nothing is not everything', async () => {
    assert.deepEqual(await expandCategories(sql, []), []);
  });

  /**
   * The enumeration is a loose index scan, not `SELECT DISTINCT` — see
   * `distinctCourts`. Two things have to hold for that substitution to be safe,
   * and neither is provable by reading the code.
   *
   * FIRST, it must return the SAME VALUES `pg_stats` knows about. Those come
   * from ANALYZE, an independent sample of the heap rather than a walk of the
   * index, so they cannot fail the same way the scan would.
   *
   * **Superset, not equality — and the first version of this test asserted
   * equality and was wrong.** It reasoned that with 26 distinct values and a
   * statistics target of 100, the MCV list must hold all of them. It does not:
   * ANALYZE samples, so a court rarer than the sampling rate is invisible to it.
   * Measured 19 Aug 2026 — the enumeration returns 26 courts, `pg_stats` reports
   * `n_distinct = 25` with a 25-entry MCV, and the missing one is
   * `High Court of Sikkim`, which demonstrably has rows. The two statistics
   * agreed with each other and were both wrong about the table, so a guard
   * comparing them to each other could not notice.
   *
   * The DIRECTION is what carries the meaning:
   *   · in MCV, absent from the enumeration → a real defect, the scan lost a
   *     value that a heap sample independently found;
   *   · enumerated, absent from MCV → ANALYZE has not sampled a rare court.
   *     Expected, and not something this test should ever fail on.
   *
   * SECOND, it must be bounded. The defect this replaces was not wrong, it was
   * slow: `>8m56s` on the `POST /search` path (NEW1 bus 0679), on a query whose
   * own comment called it cheap. A wall-clock assertion is the only shape that
   * catches a plan regression, and the margin here is five orders of magnitude,
   * so the bound is generous enough to survive a loaded box and still red on any
   * return to a full scan.
   */
  it('enumerates the same courts pg_stats saw, and does it bounded', async (t) => {
    const [stat] = await sql<{ mcv: string[] | null; nDistinct: number }[]>`
      SELECT most_common_vals::text::text[] AS mcv, n_distinct AS "nDistinct"
        FROM pg_stats WHERE tablename = 'judgments' AND attname = 'court'
    `;
    if (!stat?.mcv) return t.skip('no column statistics — run ANALYZE judgments');

    const started = Date.now();
    const enumerated = [
      ...(await expandCategories(sql, COURT_CATEGORIES)),
      ...(await unclassifiedCourts(sql)),
    ];
    const elapsed = Date.now() - started;

    const found = new Set(enumerated);
    const lost = stat.mcv.filter((court) => !found.has(court));
    assert.deepEqual(
      lost,
      [],
      'ANALYZE sampled these courts from the heap and the enumeration did not return them: ' +
        lost.join(' · '),
    );
    assert.ok(
      enumerated.length >= stat.mcv.length,
      'enumerated ' + enumerated.length + ' courts against ' + stat.mcv.length + ' in the MCV list',
    );
    assert.ok(
      elapsed < 30_000,
      `court enumeration took ${elapsed}ms — a full index scan is back (was 79.9ms cold, 1ms warm)`,
    );
  });

  it('reports the categories the corpus cannot answer', async (t) => {
    // `count(*)` here would be the same defect in miniature — it took 11s on
    // this corpus and the question is only "is anything loaded". EXISTS stops
    // at the first row.
    const [any] = await sql<{ loaded: boolean }[]>`SELECT EXISTS (SELECT 1 FROM judgments) AS loaded`;
    if (!any?.loaded) return t.skip('no corpus loaded');

    const unpopulated = await unpopulatedCategories(sql);
    // Not asserted as an exact list — an ingest landing tribunal judgments must
    // not turn this test red. What must hold is that the two we DO have are
    // never reported as unanswerable.
    assert.ok(!unpopulated.includes('sc'), 'we hold Supreme Court judgments');
    assert.ok(!unpopulated.includes('hc'), 'we hold High Court judgments');
    for (const c of unpopulated) assert.ok(COURT_CATEGORIES.includes(c));
  });
});
