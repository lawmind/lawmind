/**
 * The pool-selection rule, extracted as pure arithmetic.
 *
 * It exists because the obvious implementation — "rerank the top N" — would
 * silently delete the only thing the citation graph contributes to success@5.
 * Graph suggestions sit at ranks 16-20, and graph alone moved success@5 by
 * **exactly zero** with **zero discordant pairs**; the +4.6 came only from the
 * cross-encoder promoting those suggestions. Cut the pool from the bottom and
 * the reranker never sees them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

/** Mirrors `retrieval.ts`. Both ends of the list, never a prefix. */
function selectPool<T>(results: readonly T[], pool: number, graphSlots: number): T[] {
  if (pool >= results.length) return [...results];
  // `slice(-0)` returns the whole array — `-0 === 0`. This guard is the bug the
  // test below found before the experiment ran.
  const tail = graphSlots > 0 ? results.slice(-graphSlots) : [];
  return [...results.slice(0, Math.max(0, pool - graphSlots)), ...tail];
}

const ranks = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test('the default pool of 20 changes nothing — this is inert until measured', () => {
  assert.deepEqual(selectPool(ranks(20), 20, 5), ranks(20));
});

test('EVERY GRAPH SLOT SURVIVES A CUT TO 12', () => {
  // Ranks 16-20 are the graph's. If any is missing the measured +4.6 evaporates
  // and the run would report it as a latency win.
  const pool = selectPool(ranks(20), 12, 5);
  for (const graphRank of [16, 17, 18, 19, 20]) {
    assert.ok(pool.includes(graphRank), `graph slot ${graphRank} was cut`);
  }
});

test('the pool is exactly the size asked for', () => {
  for (const n of [12, 15, 8]) {
    assert.equal(selectPool(ranks(20), n, 5).length, n);
  }
});

test('what is dropped is the WEAK MIDDLE, not the top and not the graph', () => {
  const pool = selectPool(ranks(20), 12, 5);
  assert.deepEqual(pool, [1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20]);
  // Ranks 8-15 are the text matches least likely to belong in a top five.
  for (const dropped of [8, 9, 10, 11, 12, 13, 14, 15]) {
    assert.ok(!pool.includes(dropped));
  }
});

test('with the graph off the pool is a plain prefix — there is nothing to protect', () => {
  assert.deepEqual(selectPool(ranks(20), 12, 0), ranks(12));
});

test('a pool larger than the result list is not an error', () => {
  // A filtered search can return fewer than 20.
  assert.deepEqual(selectPool(ranks(6), 12, 5), ranks(6));
});

test('a pool SMALLER than the graph reservation still returns that many', () => {
  // Degenerate but reachable by a bad env var; it must not return 8 items when
  // asked for 3, and it must not throw.
  const pool = selectPool(ranks(20), 3, 5);
  assert.equal(pool.length, 5, 'the graph reservation set the floor');
  assert.deepEqual(pool, [16, 17, 18, 19, 20]);
});
