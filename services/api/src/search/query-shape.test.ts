/**
 * The dangerous direction is over-claiming. A query wrongly classified as a
 * citation would pin the wrong judgment at rank 1; a citation missed only means
 * the ordinary pipeline runs, which is what happens today. So most of these test
 * what the classifier REFUSES to call a citation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  citationIsTheQuery,
  citationLookupKey,
  classifyQuery,
  looksLikePartyName,
  warrantsExactLookup,
} from './query-shape.ts';

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

/* ------------------------------------------------- the exact-lookup key -- */

test('every typesetting of one citation collapses to the same lookup key', () => {
  const forms = ['(2019) 4 SCC 221', '(2019) 4 S.C.C. 221', '[2019] 4 SCC 221', '(2019)4 SCC  221'];
  const keys = new Set(forms.map((f) => citationLookupKey(f)));
  assert.equal(keys.size, 1, `one citation produced ${keys.size} keys: ${[...keys].join(' | ')}`);
});

test('the lookup key never merges two different cases', () => {
  // The whole point. 221 and 212 must stay apart after any amount of stripping.
  assert.notEqual(citationLookupKey('(2019) 4 SCC 221'), citationLookupKey('(2019) 4 SCC 212'));
  assert.notEqual(citationLookupKey('AIR 1973 SC 1461'), citationLookupKey('AIR 1973 SC 1416'));
});

test('the key is exactly what Postgres computes — same rule, both sides', () => {
  // The SQL runs upper(regexp_replace(x, '[^A-Za-z0-9]', '', 'g')). If this
  // test and that expression ever disagree, exact lookup silently stops
  // matching and every citation query quietly falls back to similarity.
  const pg = (x: string) => x.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  for (const c of ['(2019) 4 S.C.C. 221', '2026 INSC 668', 'AIR 1973 SC 1461', '[1950] SCR 869']) {
    assert.equal(citationLookupKey(c), pg(c), `${c} diverged from the SQL rule`);
  }
});

/* ------------------------------- containing vs BEING a citation -- */

test('A PARAGRAPH THAT MENTIONS A CITATION IS NOT A CITATION LOOKUP', () => {
  /**
   * The defect this rule exists for, measured 9 Aug 2026: 140 of 283 evaluation
   * queries classified as `citation` because a residual citation survived
   * somewhere in 200-900 characters of reasoning. 46 resolved to exactly one
   * judgment and were pinned at rank 1; **37 of those pins were the wrong
   * case** — 13.1% of the set, in both arms of every A/B run.
   */
  const passage =
    'The question that arises is whether the protection granted to an accused ' +
    'stands extinguished upon the expiry of a period fixed by the court below. ' +
    'In (2019) 4 SCC 221 the position was considered at some length, and the ' +
    'reasoning there proceeded on the footing that liberty once granted is not ' +
    'to be withdrawn by efflux of time alone, absent fresh material.';
  const c = classifyQuery(passage);
  assert.equal(c.shape, 'concept', 'a reasoning passage was read as a citation lookup');
  assert.equal(warrantsExactLookup(c), false, 'a paragraph would have pinned a judgment at rank 1');
});

test('a natural wrapper around a citation IS still a lookup', () => {
  // The rule must not over-correct: an advocate rarely types the bare string.
  for (const q of [
    '(2019) 4 SCC 221',
    'what did the court hold in (2019) 4 SCC 221',
    'show me AIR 1963 SC 1295 please',
    'Kesavananda Bharati (1973) 4 SCC 225',
  ]) {
    const c = classifyQuery(q);
    assert.equal(c.shape, 'citation', `stopped being a lookup: ${q}`);
    assert.equal(warrantsExactLookup(c), true);
  }
});

test('the dominance rule is about the REMAINDER, not the ratio', () => {
  // A long citation inside long prose must still fail; a short citation with
  // almost nothing around it must still pass.
  assert.equal(citationIsTheQuery('(2019) 4 SCC 221', '(2019) 4 SCC 221'), true);
  assert.equal(citationIsTheQuery('in (2019) 4 SCC 221', '(2019) 4 SCC 221'), true);
  assert.equal(
    citationIsTheQuery(
      `${'the court considered the matter at length. '.repeat(4)}(2019) 4 SCC 221`,
      '(2019) 4 SCC 221',
    ),
    false,
  );
});

test('a mentioned citation falls through to the shape it really is', () => {
  // Falling out of `citation` must not fall out of classification entirely.
  const withSection =
    'The appellant contends that the ingredients of section 138 were not made out on these ' +
    'facts, and relies on the discussion in (2019) 4 SCC 221 to support that reading of it.';
  assert.equal(classifyQuery(withSection).shape, 'section');
  assert.equal(classifyQuery(withSection).section, '138');
});

/* ----------------------------------------------------------- party names -- */

/**
 * AB-1. `SATENDER KUMAR ANTIL` — an authority we hold, and the most-cited node
 * in the sampled citation graph — was answered by the body-text ranker because
 * `CASE_NAME_RE` requires a literal `v`. The trigram title probe it should have
 * reached had existed since R8 and was never broken; the request never arrived.
 *
 * The direction of error here is the opposite of the citation rules above. A
 * wrongly-claimed CITATION pins the wrong judgment at rank 1. A wrongly-claimed
 * party name pins NOTHING — the probe's `word_similarity` floor of 0.65 sees to
 * that — and costs a bounded budget before falling through. So these tests are
 * about the two things that would actually hurt: a concept query paying the
 * probe, and an identifier losing its route.
 */
test('a bare run of party names is recognised', () => {
  for (const q of [
    'SATENDER KUMAR ANTIL',
    'SANJAY KUMAR MISHRA @ SANJAY MISHRA',
    'KARTICK CHANDRA BISWAS',
    'Bellamkonda Anjaneya',
    // Common personal names are the CASE, not the exception: an advocate
    // searching for a client's matter types exactly this.
    'Ram Kumar',
    'Mohammed Khan',
  ]) {
    assert.equal(classifyQuery(q).shape, 'party_name', `not recognised: ${q}`);
  }
});

test('a concept query never reaches the party-name path', () => {
  for (const q of [
    'bail',
    'anticipatory bail',
    'quashing FIR',
    'interim injunction',
    'res judicata',
    'natural justice',
    'burden of proof',
    'specific performance of contract',
    'limitation period for filing appeal',
    'when may a court grant anticipatory bail',
    'whether a second bail application is maintainable',
    // A single token is a term, not a name — and `Antil` alone is also a
    // surname, a village and a company.
    'Antil',
    // Institutional, and the corpus holds it in a very large share of titles.
    'State of Maharashtra',
  ]) {
    assert.notEqual(classifyQuery(q).shape, 'party_name', `wrongly routed to the party path: ${q}`);
  }
});

/**
 * **Document frequency measures the OPPOSITE of what it appears to here, and
 * the first version of this gate used it.** Measured on this corpus,
 * 30 August 2026: `kumar` 0.44229, `ram` 0.09759, `anticipatori` 0.06902,
 * `injunct` 0.01685. Indian personal names are among the most frequent tokens
 * precisely BECAUSE they are party names, so a "common token means concept
 * query" rule sends `Ram Kumar` to the ranker and `interim injunction` to the
 * title probe. This test is the regression guard on that reasoning.
 */
test('the party-name gate is structural, not frequency-based', () => {
  assert.equal(looksLikePartyName('Ram Kumar'), true, 'a frequent name is still a name');
  assert.equal(
    looksLikePartyName('interim injunction'),
    false,
    'a rare concept is still a concept',
  );
});

test('an identifier still wins over a party-shaped reading', () => {
  // Every identifier route is tried BEFORE the party gate is consulted, so a
  // party name can only ever take a query away from `concept`.
  assert.equal(classifyQuery('2019 INSC 227').shape, 'citation');
  assert.equal(classifyQuery('(2019) 4 SCC 221').shape, 'citation');
  assert.equal(classifyQuery('section 302 IPC').shape, 'section');
  assert.equal(classifyQuery('Garware Nylons v Pimpri Chinchwad').shape, 'case_name');
  assert.equal(classifyQuery('KARTICK CHANDRA BISWAS Vs STATE OF WEST BENGAL').shape, 'case_name');
});

test('a digit anywhere disqualifies a party name', () => {
  // A case number, a year and a section number are all digit-bearing and all
  // have their own route. Guessing a name from one is how a page number
  // returns a murder provision.
  assert.equal(looksLikePartyName('MUNSHI ALI HASAN AND 2 OTHERS'), false);
  assert.equal(looksLikePartyName('Ram Kumar 2019'), false);
});
