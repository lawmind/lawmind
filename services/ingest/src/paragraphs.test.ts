/**
 * The two properties that matter: **no text is ever lost**, and **no paragraph
 * number is ever invented**. Everything else is convenience.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_NUMBER_GAP, splitParagraphs, spansAreContiguous } from './paragraphs.ts';

const JUDGMENT = `IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD
Criminal Appeal No. 1234 of 2019
RAM KUMAR versus STATE OF U.P.
CORAM: HON'BLE MR. JUSTICE A.K. SHARMA

1. This appeal arises out of the judgment dated 12.03.2019 passed by the
Additional Sessions Judge convicting the appellant under Section 302 IPC.

2. Learned counsel for the appellant submitted that the prosecution failed to
establish the chain of circumstances beyond reasonable doubt.

3. In Sharad Birdhichand Sarda v. State of Maharashtra (1984) 4 SCC 116 this
Court laid down the five golden principles governing circumstantial evidence.

4. Having considered the material on record, we are of the view that the
conviction cannot be sustained. The appeal is allowed.`;

/* ------------------------------------------------------------ no text lost -- */

test('EVERY CHARACTER BELONGS TO EXACTLY ONE PARAGRAPH', () => {
  const paras = splitParagraphs(JUDGMENT);
  assert.ok(spansAreContiguous(paras, JUDGMENT), 'spans are not contiguous');
  assert.equal(paras.map((p) => p.text).join(''), JUDGMENT, 'concatenation lost text');
});

test('spans resolve byte-exactly against the source', () => {
  const paras = splitParagraphs(JUDGMENT);
  for (const p of paras) {
    assert.equal(JUDGMENT.slice(p.charOffset, p.charOffset + p.charLength), p.text);
  }
});

/* ------------------------------------------------- no number is invented -- */

test('the preamble has NO paragraph number, and that is the correct answer', () => {
  const paras = splitParagraphs(JUDGMENT);
  assert.equal(paras[0]!.number, null, 'a cause title was given a paragraph number');
  assert.match(paras[0]!.text, /IN THE HIGH COURT/);
});

test('the court’s own numbers are used, in order', () => {
  const numbered = splitParagraphs(JUDGMENT).filter((p) => p.number !== null);
  assert.deepEqual(numbered.map((p) => p.number), [1, 2, 3, 4]);
});

test('A YEAR AT THE START OF A SENTENCE IS NOT PARAGRAPH 2019', () => {
  // The failure this parser exists to avoid: a sequence check, not date parsing.
  const text = `1. The facts are these.\n2019. was the year the suit was filed and it matters here.\n2. The second point is different and rather longer than the minimum.`;
  const nums = splitParagraphs(text).map((p) => p.number);
  assert.ok(!nums.includes(2019), `2019 was read as a paragraph number: ${JSON.stringify(nums)}`);
  assert.deepEqual(nums.filter((n) => n !== null), [1, 2]);
});

test('a number that goes BACKWARDS does not open a paragraph', () => {
  // `(1984) 4 SCC 116` mid-judgment must not restart the numbering.
  const text = `12. The principle was settled long ago and needs no restatement here.\n1984. is when it was decided, which is not a new paragraph at all.\n13. The next point follows on from the previous one directly.`;
  assert.deepEqual(
    splitParagraphs(text).map((p) => p.number).filter((n) => n !== null),
    [12, 13],
  );
});

test('a forward LEAP beyond the tolerated gap is refused', () => {
  const text = `1. The first point, stated at sufficient length to survive the merge.\n900. is an amount in rupees, not the nine hundredth paragraph of anything.\n2. The second point, also stated at sufficient length to survive.`;
  const nums = splitParagraphs(text).map((p) => p.number).filter((n) => n !== null);
  assert.ok(!nums.includes(900), 'a leap of 899 was accepted as a paragraph');
});

test('a small gap IS tolerated — extraction drops lines', () => {
  const text = `1. The first point, stated at sufficient length to survive the merge.\n${'3'}. The third point, because paragraph two was lost in extraction somewhere.`;
  const nums = splitParagraphs(text).map((p) => p.number).filter((n) => n !== null);
  assert.deepEqual(nums, [1, 3]);
  assert.ok(MAX_NUMBER_GAP >= 2);
});

/* ------------------------------------------------------------ bracket forms -- */

test('(14) and 14) open paragraphs as well as 14.', () => {
  const text = `(1) The first point here is long enough to be kept as its own paragraph.\n(2) The second point is likewise long enough to survive the minimum length.`;
  assert.deepEqual(splitParagraphs(text).map((p) => p.number), [1, 2]);
});

/* ------------------------------------------------------------------ edges -- */

test('an unnumbered judgment yields one paragraph, not zero', () => {
  const text = 'This short order carries no numbering at all but is still real text worth keeping.';
  const paras = splitParagraphs(text);
  assert.equal(paras.length, 1);
  assert.equal(paras[0]!.number, null);
  assert.ok(spansAreContiguous(paras, text));
});

test('empty input yields no paragraphs rather than an empty one', () => {
  assert.deepEqual(splitParagraphs(''), []);
  assert.deepEqual(splitParagraphs('   \n  '), []);
});

test('a stray short line is merged, never stored as evidence on its own', () => {
  const text = `1. A real paragraph of sufficient length to stand on its own two feet here.\n2\n2. Another real paragraph of sufficient length to stand on its own here.`;
  const paras = splitParagraphs(text);
  assert.ok(paras.every((p) => p.charLength >= 40 || p.index === paras.length - 1));
  assert.ok(spansAreContiguous(paras, text), 'merging a stray line lost text');
});

test('Devanagari text splits and loses nothing', () => {
  const text = `1. यह एक वास्तविक अनुच्छेद है जो पर्याप्त रूप से लंबा है और रहना चाहिए।\n2. यह दूसरा अनुच्छेद है जो पर्याप्त रूप से लंबा है और इसे रखा जाना चाहिए।`;
  const paras = splitParagraphs(text);
  assert.deepEqual(paras.map((p) => p.number), [1, 2]);
  assert.ok(spansAreContiguous(paras, text));
});
