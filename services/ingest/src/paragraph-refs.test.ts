/**
 * A wrong paragraph number is worse than none — it tells an advocate a specific
 * passage is dead when it is not, and they will rely on that. So most of these
 * tests are about what the extractor REFUSES to find.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractParagraphRefs, isTrustworthy } from './paragraph-refs.ts';

/** Puts the citation at a known offset with realistic prose either side. */
function passage(text: string): { text: string; offset: number } {
  const before = 'The learned counsel for the appellant relied upon the decision in ';
  const after = ' and submitted that the point is concluded.';
  return { text: before + text + after, offset: before.length + Math.floor(text.length / 2) };
}

test('a single paragraph reference', () => {
  const p = passage('this Court in paragraph 22 held otherwise');
  const f = extractParagraphRefs(p.text, p.offset)!;
  assert.deepEqual(f.paragraphs, [22]);
  assert.match(f.evidence, /paragraph 22/);
});

test('an abbreviated form with a full stop', () => {
  const p = passage('as explained in para. 7 of that judgment');
  assert.deepEqual(extractParagraphRefs(p.text, p.offset)!.paragraphs, [7]);
});

test('a range expands, inclusive of both ends', () => {
  const p = passage('paragraphs 12 to 15 stand overruled');
  assert.deepEqual(extractParagraphRefs(p.text, p.offset)!.paragraphs, [12, 13, 14, 15]);
});

test('an en-dash range, which is how judgments actually print it', () => {
  const p = passage('paras 45–48 are no longer good law');
  assert.deepEqual(extractParagraphRefs(p.text, p.offset)!.paragraphs, [45, 46, 47, 48]);
});

test('a list, comma and "and" separated', () => {
  const p = passage('paragraphs 12, 14 and 19 are set aside');
  assert.deepEqual(extractParagraphRefs(p.text, p.offset)!.paragraphs, [12, 14, 19]);
});

test('a bare number is NEVER a paragraph reference', () => {
  // "1973" and "45" occur constantly in legal prose. A rule that matched them
  // would produce confident nonsense at scale.
  const p = passage('the 1973 decision at page 45 of the report');
  assert.equal(extractParagraphRefs(p.text, p.offset), null);
});

test('page numbers are not paragraph numbers', () => {
  const p = passage('at page 221 of the report, the Court observed');
  assert.equal(extractParagraphRefs(p.text, p.offset), null);
});

test('a reversed range is a misparse and is skipped, not swapped', () => {
  // We do not know which of the two numbers was wrong, so we cannot "fix" it.
  const p = passage('paragraphs 40 to 12 of the judgment');
  assert.equal(extractParagraphRefs(p.text, p.offset), null);
});

test('an absurdly wide range is refused', () => {
  // Somebody overruling a judgment and describing it loosely, not a citation to
  // specific paragraphs. Fifty numbers in a banner mean nothing.
  const p = passage('paragraphs 1 to 400 of the said decision');
  assert.equal(extractParagraphRefs(p.text, p.offset), null);
});

test('a four-digit "paragraph" is a year that landed next to the word', () => {
  const p = passage('paragraph 1973 of the compilation');
  assert.equal(extractParagraphRefs(p.text, p.offset), null);
});

test('paragraph zero does not exist', () => {
  const p = passage('paragraph 0 of the order');
  assert.equal(extractParagraphRefs(p.text, p.offset), null);
});

test('the most specific rule wins — a range is not also read as singles', () => {
  // Both the range and the single-number rule match "paragraphs 12 to 15".
  // Taking both would let a looser rule widen a precise finding.
  const p = passage('paragraphs 12 to 15 were disapproved');
  const f = extractParagraphRefs(p.text, p.offset)!;
  assert.deepEqual(f.paragraphs, [12, 13, 14, 15]);
  assert.equal(f.paragraphs.length, 4, 'a looser rule widened a precise finding');
});

test('it reads only near the citation, not the whole judgment', () => {
  // A judgment mentions paragraph numbers constantly. Reading the whole text
  // would attribute somebody else's paragraph to this overruling.
  const far = `${'x'.repeat(5000)} paragraph 99 ${'y'.repeat(5000)}`;
  assert.equal(extractParagraphRefs(far, 0), null);
});

test('duplicates collapse and the result is sorted', () => {
  const p = passage('paragraphs 19, 12 and 19 of the judgment');
  assert.deepEqual(extractParagraphRefs(p.text, p.offset)!.paragraphs, [12, 19]);
});

test('the evidence is the court’s own words, so a human can check the machine', () => {
  const p = passage('paragraphs 12 to 15 stand overruled');
  const f = extractParagraphRefs(p.text, p.offset)!;
  assert.match(f.evidence, /paragraphs 12 to 15/);
});

test('nothing found is null — the caller must leave the judgment alone', () => {
  // Null must never be read as "overrule all of it". It is the expected answer
  // most of the time.
  const p = passage('the said decision is no longer good law');
  assert.equal(extractParagraphRefs(p.text, p.offset), null);
});

test('isTrustworthy is a separate judgement from extraction', () => {
  assert.equal(isTrustworthy(null), false);
  assert.equal(isTrustworthy({ paragraphs: [12, 13], evidence: 'paras 12-13' }), true);
  assert.equal(
    isTrustworthy({ paragraphs: Array.from({ length: 40 }, (_, i) => i + 1), evidence: 'x' }),
    false,
    'a "partial" overruling naming forty paragraphs is not actionable',
  );
});

test('a reporter pinpoint in square brackets is NOT the overruled paragraphs', () => {
  // The false positive that nearly reached the corpus. `[Para 129]` is the SCR
  // headnote's pinpoint into the CITING judgment; the overruling appears
  // separately as a bare list entry with no paragraph attribution at all.
  const real =
    'A plea of partition based on oral evidence alone cannot be accepted. ' +
    '[Para 129][235-H; 236-E-F] Prakash & Ors. v. Phulavati & Ors. (2016) 2 SCC 36 – overruled. ' +
    'Danamma @ Suman Surpur & Anr. v. Amar & Ors., (2018) 3 SCC 343 – partly overruled.';
  assert.equal(extractParagraphRefs(real, Math.floor(real.length / 2)), null);
});

test('a citation-list region attributes nothing to anybody', () => {
  const real =
    'LIST OF CITATIONS AND OTHER REFERENCES In the judgment of Dr D.Y. Chandrachud, CJI ' +
    'N N Global Mercantile (P) Ltd. v. Indo Unique Flame Ltd. (2023) 7 SCC 1 – overruled. ' +
    'Garware Wall Ropes Ltd. v. Coastal Marine (2019) 9 SCC 209 – overruled to an extent. ' +
    'paragraph 44 and paragraph 189 appear elsewhere on this page.';
  assert.equal(extractParagraphRefs(real, Math.floor(real.length / 2)), null);
});

test('the prose form still works — that is what we are actually looking for', () => {
  // The refusals above must not have made the extractor useless. A court saying
  // so in its own reasoning is exactly what we want to catch.
  const prose =
    'We are of the view that the observations in paragraphs 12 to 15 of that judgment ' +
    'do not lay down the correct law and are accordingly overruled to that extent.';
  const f = extractParagraphRefs(prose, Math.floor(prose.length / 2))!;
  assert.deepEqual(f.paragraphs, [12, 13, 14, 15]);
});
