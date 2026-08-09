/**
 * Every fixture here is a real shape read off the corpus, not an invented one.
 *
 * The tests that matter are the refusals. A pairing that is merely *missing*
 * costs an advocate a search that returns nothing — annoying, and visibly
 * wrong. A pairing that is *incorrect* hands them a different judgment under the
 * citation they typed, and they may cite it. Those two failures are not
 * comparable, and everything below is arranged around the second.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type ParallelPair, aliasKey, findParallel, reconcile } from './concordance.ts';

/* ─────────────────────────────────────────── real shapes, accepted ── */

test('the ordinary form — AIR then a colon then SCR', () => {
  const p = findParallel('AIR 1980 SC 791', 'AIR 1980 SC 791 : [1980] 2 SCR 1067 – referred to.');
  assert.ok(p, 'the pairing the courts print most often was missed');
  assert.equal(p.alias, 'AIR 1980 SC 791');
  assert.equal(p.aliasReporter, 'AIR');
  assert.match(p.scr, /1980.*2 S\.?C\.?R\.? 1067/i);
});

test('OCR damage does not lose a real pairing', () => {
  // `[1975) 1 SCR 890` — mismatched brackets, straight from the scan. Refusing
  // it would discard a real pairing for a defect in the scanner, not in the law.
  const p = findParallel('AIR 1974 SC 2069', 'AIR 1974 SC 2069: [1975) 1 SCR 890; Lakshmi Narayan');
  assert.ok(p, 'a scanning artefact was allowed to hide a real pairing');
  assert.equal(p.aliasReporter, 'AIR');
});

test('a Supplement volume still pairs', () => {
  const p = findParallel(
    'AIR 1999 SC 3734',
    'AIR 1999 SC 3734: 1999 (2) Suppl.. SCR 490; State Bank of India',
  );
  assert.ok(p);
});

test('SCC aliases pair on the same rule', () => {
  const p = findParallel('(1997) 6 SCC 241', '(1997) 6 SCC 241 : [1997] 3 SCR 404 - relied on.');
  assert.ok(p);
  assert.equal(p.aliasReporter, 'SCC');
});

test('DELIVERED ONE YEAR, REPORTED THE NEXT — a real pairing that must survive', () => {
  // AIR 1965 SC 430 == (1964) 6 SCR 727, read off the corpus. A strict
  // same-year rule would throw away thousands of correct pairings.
  const p = findParallel('AIR 1965 SC 430', 'AIR 1965 SC 430 = (1964) 6 SCR 727, followed.');
  assert.ok(p, 'a one-year gap is normal and must not be rejected');
});

/* ──────────────────────────────────────────── the refusals ── */

test('THE YEAR GUARD — a 43-year gap is two different cases side by side', () => {
  /**
   * The bug that the first measurement's own samples exposed: `AIR 1955 SC 807`
   * paired with `[1998] 3 SCR 280`. A 1955 judgment is not reported in the 1998
   * SCR; the window had run into the next authority in a list.
   */
  assert.equal(
    findParallel('AIR 1955 SC 807', 'AIR 1955 SC 807; Kumar v. State [1998] 3 SCR 280'),
    null,
  );
  assert.equal(
    findParallel('AIR 2010 SC 1212', 'AIR 2010 SC 1212, [1958] 1 SCR 1495'),
    null,
    'a 52-year gap was accepted',
  );
});

test('even a TWO-year gap is refused — the rule is strict on purpose', () => {
  assert.equal(findParallel('AIR 1993 SC 1126', 'AIR 1993 SC 1126, [1995] 1 SCR 897'), null);
});

test('a semicolon ends the authority, so the next case cannot be borrowed', () => {
  assert.equal(
    findParallel('AIR 1966 SC 302', 'AIR 1966 SC 302; Another Case, [1966] 2 SCR 100'),
    null,
    'the search ran past a semicolon into the next authority',
  );
});

test('a following case NAME ends the authority too', () => {
  assert.equal(
    findParallel('AIR 1968 SC 349', 'AIR 1968 SC 349 Sharma v. State [1968] 1 SCR 407'),
    null,
  );
});

test('a citation printed alone pairs with nothing', () => {
  // The common case — roughly two thirds. Inventing a pairing here is the whole
  // failure mode.
  assert.equal(findParallel('AIR 1966 SC 302', 'AIR 1966 SC 302 ... ": 18. Undoubtedly'), null);
});

test('a parallel citation too far away is not a parallel citation', () => {
  const far = `AIR 1970 SC 100 ${'padding text '.repeat(12)} [1970] 2 SCR 55`;
  assert.equal(findParallel('AIR 1970 SC 100', far), null);
});

test('text with no citation at all returns null rather than throwing', () => {
  assert.equal(findParallel('not a citation', 'nor is this'), null);
  assert.equal(findParallel('', ''), null);
});

/* ──────────────────────────────────── reconciliation ── */

const pair = (alias: string, scr: string): ParallelPair => ({
  alias,
  aliasReporter: 'AIR',
  scr,
  evidence: `${alias} : ${scr}`,
});

test('agreeing sightings are counted, and the count is kept', () => {
  const out = reconcile([
    pair('AIR 1952 SC 343', '[1952] 1 SCR 284'),
    pair('AIR 1952 SC 343', '(1952) 1 S.C.R. 284'),
    pair('AIR 1952 SC 343', '[1952] 1 SCR 284'),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.corroborations, 3, 'every typesetting collapses to one target');
  assert.equal(out[0]!.aliasKey, 'AIR1952SC343');
});

test('AN ALIAS SEEN POINTING AT TWO JUDGMENTS IS DROPPED ENTIRELY', () => {
  /**
   * The most important rule here. One citation string means one judgment; if
   * extraction produced two targets, at least one is wrong and we cannot tell
   * which. Recording the more frequent one would be guessing, and a wrong alias
   * hands an advocate a different case under the citation they typed.
   */
  const out = reconcile([
    pair('AIR 1960 SC 1', '[1960] 1 SCR 100'),
    pair('AIR 1960 SC 1', '[1960] 1 SCR 100'),
    pair('AIR 1960 SC 1', '[1960] 2 SCR 999'),
  ]);
  assert.deepEqual(out, [], 'a contradicted alias was recorded anyway');
});

test('a contradiction in one alias does not poison the others', () => {
  const out = reconcile([
    pair('AIR 1960 SC 1', '[1960] 1 SCR 100'),
    pair('AIR 1960 SC 1', '[1960] 2 SCR 999'),
    pair('AIR 1961 SC 2', '[1961] 1 SCR 200'),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.aliasKey, 'AIR1961SC2');
});

test('the key strips punctuation, on both sides, exactly as the SQL does', () => {
  assert.equal(aliasKey('(2019) 4 S.C.C. 221'), '20194SCC221');
  assert.equal(aliasKey('[2019] 4 SCC 221'), '20194SCC221');
  assert.equal(aliasKey('AIR 1973 SC 1461'), 'AIR1973SC1461');
  // Digits are untouched — 221 and 212 must stay different cases.
  assert.notEqual(aliasKey('(2019) 4 SCC 221'), aliasKey('(2019) 4 SCC 212'));
});

test('no sightings produces no candidates, not a crash', () => {
  assert.deepEqual(reconcile([]), []);
});
