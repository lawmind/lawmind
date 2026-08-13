/**
 * The one failure that matters: **a footnote must never become an Article.**
 * `1. Subs. by the Constitution (Forty-second Amendment) Act, 1976` and
 * `1. Name and territory of the Union.—` are the same shape at a line start,
 * and the real file contains 389 of the former against 361 of the latter.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { articleSortKey, parseArticles } from './constitution.ts';

/** Trimmed from the real Ministry of Law and Justice edition. */
const REAL = `THE CONSTITUTION OF INDIA
CONTENTS
1. Name and territory of the Union.
2. Admission or establishment of new States.
21A. Right to education.

PART I
THE UNION AND ITS TERRITORY
1. Subs. by the Constitution (Forty-second Amendment) Act, 1976, s.2, for "SOVEREIGN".
2. Subs. by s. 2, ibid., for "Unity of the Nation" (w.e.f. 3-1-1977).
1. Name and territory of the Union.—(1) India, that is Bharat, shall be a Union of States.
(2) The States and the territories thereof shall be as specified in the First Schedule.
2. Admission or establishment of new States.—Parliament may by law admit into the Union new States.
3. Ins. by the Constitution (Seventh Amendment) Act, 1956, s. 2.
21. Protection of life and personal liberty.—No person shall be deprived of his life or personal liberty except according to procedure established by law.
21A. Right to education.—The State shall provide free and compulsory education to all children of the age of six to fourteen years.
368. 1[Power of Parliament to amend the Constitution and procedure therefor].— 2[(1) Notwithstanding anything in this Constitution, Parliament may amend this Constitution.`;

/* ---------------------------------------------- footnotes are not articles -- */

test('A FOOTNOTE IS NEVER READ AS AN ARTICLE — the whole point of the parser', () => {
  const articles = parseArticles(REAL);
  const texts = articles.map((a) => a.text).join('\n');
  assert.ok(!/^1\. Subs\. by/m.test(texts.split('\n')[0] ?? ''), 'a footnote opened an article');
  for (const a of articles) {
    assert.ok(!/^Subs\. by|^Ins\. by/.test(a.title), `footnote became article title: ${a.title}`);
  }
});

test('the contents pages are skipped, not emitted as articles', () => {
  const articles = parseArticles(REAL);
  // The TOC lists `1.`, `2.` and `21A.` with no `.—`; only the real ones count.
  assert.equal(articles.filter((a) => a.number === '1').length, 1);
  assert.match(articles[0]!.text, /India, that is Bharat/);
});

/* ------------------------------------------------------------ real shapes -- */

test('article numbers keep their printed form, including letter suffixes', () => {
  const nums = parseArticles(REAL).map((a) => a.number);
  assert.deepEqual(nums, ['1', '2', '21', '21A', '368']);
});

test('titles are captured, and amendment markers stripped from them', () => {
  const byNumber = new Map(parseArticles(REAL).map((a) => [a.number, a]));
  assert.equal(byNumber.get('21')!.title, 'Protection of life and personal liberty');
  assert.equal(byNumber.get('21A')!.title, 'Right to education');
  // `368. 1[Power of Parliament to amend…].—` — the `1[` and `]` are footnote
  // machinery, not part of the Article's name.
  assert.equal(
    byNumber.get('368')!.title,
    'Power of Parliament to amend the Constitution and procedure therefor',
  );
});

test('an article carries its continuation lines, not just its opener', () => {
  const one = parseArticles(REAL).find((a) => a.number === '1')!;
  assert.match(one.text, /First Schedule/, 'clause (2) was dropped');
});

test('every article resolves to its own offset in the source', () => {
  for (const a of parseArticles(REAL)) {
    assert.ok(REAL.slice(a.charOffset).startsWith(a.text.split('\n')[0]!), `bad offset for ${a.number}`);
  }
});

/* ------------------------------------------------------------------ edges -- */

test('a document without the anchor yields NOTHING rather than the contents page', () => {
  // Refusing is correct: emitting headings as Articles would fill the table
  // with titles that have no text under them.
  assert.deepEqual(parseArticles('CONTENTS\n1. Name and territory.\n2. Admission of States.'), []);
  assert.deepEqual(parseArticles(''), []);
});

test('a repeated number does not truncate the real article', () => {
  const text = `1. Name and territory of the Union.—(1) India, that is Bharat, shall be a Union.
Some continuation of the first article that must not be lost to a running header.
1. Name and territory of the Union.
More text belonging to article one.
2. Admission or establishment of new States.—Parliament may admit new States.`;
  const articles = parseArticles(text);
  assert.equal(articles.filter((a) => a.number === '1').length, 1);
  assert.match(articles[0]!.text, /More text belonging to article one/);
});

test('sorting is by printed order, so 21 precedes 21A precedes 22', () => {
  const order = ['22', '21A', '21'].sort((a, b) => {
    const [an, as] = articleSortKey(a);
    const [bn, bs] = articleSortKey(b);
    return an - bn || as.localeCompare(bs);
  });
  assert.deepEqual(order, ['21', '21A', '22']);
});
