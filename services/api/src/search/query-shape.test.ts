/**
 * The dangerous direction is over-claiming. A query wrongly classified as a
 * citation would pin the wrong judgment at rank 1; a citation missed only means
 * the ordinary pipeline runs, which is what happens today. So most of these test
 * what the classifier REFUSES to call a citation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyQuery, warrantsExactLookup } from './query-shape.ts';

/* ------------------------------------------------------------- citations -- */

test('the reporter forms an advocate actually types', () => {
  for (const q of [
    '(2019) 4 SCC 221',
    '(2019) 4 S.C.C. 221',
    'AIR 1973 SC 1461',
    '2026 INSC 668',
    '(1950) SCR 869',
  ]) {
    assert.equal(classifyQuery(q).shape, 'citation', `${q} was not read as a citation`);
  }
});

test('the citation is returned NORMALISED, not as typed', () => {
  // Typesetting varies; the column we would look it up against does not.
  const a = classifyQuery('(2019) 4 S.C.C. 221').citation;
  const b = classifyQuery('(2019) 4 SCC 221').citation;
  assert.equal(a, b, 'two typesettings of one citation normalised differently');
  assert.ok(a && !a.includes('.'), 'reporter punctuation survived normalisation');
});

test('digits are never touched — two near-identical citations stay different', () => {
  // The exact failure an embedding model makes. 221 and 212 are different cases.
  assert.notEqual(
    classifyQuery('(2019) 4 SCC 221').citation,
    classifyQuery('(2019) 4 SCC 212').citation,
  );
});

test('a citation inside a longer question still routes as a citation', () => {
  const q = classifyQuery('what did the court hold in (2019) 4 SCC 221 about maintenance');
  assert.equal(q.shape, 'citation');
  assert.equal(q.citation, '(2019) 4 SCC 221');
});

test('a case name PLUS a citation is a citation query, not a case-name query', () => {
  // The most specific thing in the query wins. It has one right answer.
  const q = classifyQuery('Kesavananda Bharati v State of Kerala (1973) 4 SCC 225');
  assert.equal(q.shape, 'citation');
});

test('the FIRST citation is taken when a query carries two', () => {
  const q = classifyQuery('compare (2019) 4 SCC 221 with (2018) 3 SCC 343');
  assert.equal(q.citation, '(2019) 4 SCC 221');
});

/* ---------------------------------------------------------------- refusals -- */

test('a bare year is NOT a citation', () => {
  assert.equal(classifyQuery('judgments from 2019').shape, 'concept');
  assert.equal(classifyQuery('2019').shape, 'concept');
});

test('a bare number is not a citation and not a section', () => {
  // "302" alone is a year, a page, a paragraph or a section depending on
  // context. Guessing is how a page number returns a murder provision.
  const q = classifyQuery('302');
  assert.equal(q.shape, 'concept');
  assert.equal(q.section, null);
});

test('ordinary legal prose is a concept query, which is not a failure', () => {
  for (const q of [
    'can anticipatory bail continue indefinitely',
    'what is the limitation period for a suit for possession',
    'दहेज निषेध अधिनियम के तहत सजा',
  ]) {
    assert.equal(classifyQuery(q).shape, 'concept', `${q} was misrouted`);
  }
});

test('an empty or whitespace query is concept, never a crash', () => {
  assert.equal(classifyQuery('').shape, 'concept');
  assert.equal(classifyQuery('   ').shape, 'concept');
});

/* ----------------------------------------------------------------- sections -- */

test('a statutory provision, with and without the Act', () => {
  assert.deepEqual(
    { s: classifyQuery('section 138 NI Act').section, a: classifyQuery('section 138 NI Act').act },
    { s: '138', a: 'NI ACT' },
  );
  assert.equal(classifyQuery('Section 138').shape, 'section');
  assert.equal(classifyQuery('s. 302 IPC').section, '302');
  assert.equal(classifyQuery('sec 103 BNS').act, 'BNS');
});

test('a suffixed section number survives — 304A is not 304', () => {
  assert.equal(classifyQuery('section 304A IPC').section, '304A');
});

test('the new codes are recognised, not just the repealed ones', () => {
  // BNS/BNSS/BSA replaced IPC/CrPC/Evidence in July 2024. A classifier that
  // only knows the old names is already out of date.
  //
  // BNSS must not collapse to BNS. JS alternation takes the leftmost match,
  // not the longest, so `BNS|BNSS` silently reported the wrong code — a
  // procedure statute answered for an offences statute. This test found it.
  for (const act of ['BNS', 'BNSS', 'BSA', 'IPC', 'CrPC']) {
    assert.equal(classifyQuery(`section 103 ${act}`).act, act.toUpperCase(), `${act} was misread`);
  }
});

test('"section" inside ordinary prose does not manufacture a section query', () => {
  assert.equal(classifyQuery('the section of the bar association').shape, 'concept');
});

/* --------------------------------------------------------------- case names -- */

test('case names in the forms advocates write them', () => {
  for (const q of ['Danamma v Amar', 'Vineeta Sharma vs Rakesh Sharma', 'State versus Kumar']) {
    assert.equal(classifyQuery(q).shape, 'case_name', `${q} was not read as a case name`);
  }
});

test('a stray "v" is not a case name', () => {
  assert.equal(classifyQuery('v').shape, 'concept');
  assert.equal(classifyQuery('appeal v').shape, 'concept');
});

/* ------------------------------------------------------------ the gate -- */

test('only a citation warrants an exact lookup', () => {
  assert.equal(warrantsExactLookup(classifyQuery('(2019) 4 SCC 221')), true);
  assert.equal(warrantsExactLookup(classifyQuery('section 138')), false);
  assert.equal(warrantsExactLookup(classifyQuery('Danamma v Amar')), false);
  assert.equal(warrantsExactLookup(classifyQuery('anticipatory bail')), false);
});

test('the classifier is pure — same input, same answer, no state carried', () => {
  // The extractCitations regexes are module-level and /g. A shared lastIndex
  // would make the second call on the same string behave differently, which is
  // exactly the bug that file warns about.
  const q = '(2019) 4 SCC 221';
  assert.deepEqual(classifyQuery(q), classifyQuery(q));
  assert.deepEqual(classifyQuery(q), classifyQuery(q));
});
