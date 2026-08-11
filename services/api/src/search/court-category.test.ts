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

  it('reports the categories the corpus cannot answer', async (t) => {
    const [any] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgments`;
    if (!any?.n) return t.skip('no corpus loaded');

    const unpopulated = await unpopulatedCategories(sql);
    // Not asserted as an exact list — an ingest landing tribunal judgments must
    // not turn this test red. What must hold is that the two we DO have are
    // never reported as unanswerable.
    assert.ok(!unpopulated.includes('sc'), 'we hold Supreme Court judgments');
    assert.ok(!unpopulated.includes('hc'), 'we hold High Court judgments');
    for (const c of unpopulated) assert.ok(COURT_CATEGORIES.includes(c));
  });
});
