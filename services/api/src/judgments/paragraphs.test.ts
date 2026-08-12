import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  locateParagraphByOffset,
  numberedShare,
  resolveExactSpan,
  segmentParagraphs,
} from './paragraphs.ts';

describe('segmentParagraphs', () => {
  it('splits on printed paragraph numbers and keeps them', () => {
    const text = [
      '1. The appeal arises from a conviction.',
      '2. The prosecution case is this.',
    ].join('\n');
    const paras = segmentParagraphs(text);
    assert.equal(paras.length, 2);
    assert.equal(paras[0]?.paragraphNumber, 1);
    assert.equal(paras[1]?.paragraphNumber, 2);
    assert.match(paras[0]?.text ?? '', /^The appeal arises/);
  });

  it('strips reporter margin letters and page numbers', () => {
    // "A B C D E F G H" runs down the page edge of a reported judgment for
    // pinpoint referencing. It is not text and must not become a paragraph.
    const text = ['A B C D E F G H', '1155', '1. The appeal is allowed.'].join('\n');
    const paras = segmentParagraphs(text);
    assert.equal(paras.length, 1);
    assert.equal(paras[0]?.paragraphNumber, 1);
  });

  it('keeps the unnumbered headnote as a paragraph with a NULL number', () => {
    // Real content, never numbered. Dropping it loses the case title and bench;
    // numbering it invents a citation that does not exist.
    const text = [
      'STATE OF NCT OF DELHI',
      'v.',
      'SHIV CHARAN BANSAL & ORS.',
      '1. The appeal.',
    ].join('\n');
    const paras = segmentParagraphs(text);
    assert.equal(paras[0]?.paragraphNumber, null);
    assert.match(paras[0]?.text ?? '', /STATE OF NCT OF DELHI/);
    assert.equal(paras[1]?.paragraphNumber, 1);
  });

  it('does NOT split on a section number inside a paragraph', () => {
    // The commonest corruption: "103." here is BNS s.103, not paragraph 103.
    // Numbering runs forward, so a number far ahead of the sequence is rejected.
    const text = [
      '1. The appellant was charged.',
      '103. is the provision relied upon by the prosecution.',
      '2. The trial court convicted.',
    ].join('\n');
    const paras = segmentParagraphs(text);
    assert.equal(paras.length, 2);
    assert.equal(paras[0]?.paragraphNumber, 1);
    assert.equal(paras[1]?.paragraphNumber, 2);
    assert.match(paras[0]?.text ?? '', /103\./, 'the section number stays inside its paragraph');
  });

  it('does NOT split on a year that begins a line', () => {
    const text = ['1. The agreement was executed.', '1999. That year is disputed.'].join('\n');
    const paras = segmentParagraphs(text);
    assert.equal(paras.length, 1);
  });

  it('does not treat a backwards number as the next paragraph', () => {
    // A quoted sub-clause numbered "1." sitting inside paragraph 2. Numbering
    // runs forward, so a number behind the sequence is quoted material, not the
    // next paragraph — following it would fragment the judgment and misnumber
    // everything after.
    const text = [
      '1. The appellant relies on the agreement.',
      '2. The clause reads as follows.',
      '1. Any party may terminate on notice.',
    ].join('\n');
    const paras = segmentParagraphs(text);
    assert.equal(paras.length, 2);
    assert.equal(paras[1]?.paragraphNumber, 2);
    assert.match(
      paras[1]?.text ?? '',
      /Any party may terminate/,
      'the quoted clause stays inside paragraph 2',
    );
  });

  it('accepts bracketed and parenthesised openers', () => {
    const text = ['(1) The first point.', '(2) The second point.'].join('\n');
    const paras = segmentParagraphs(text);
    assert.equal(paras.length, 2);
    assert.equal(paras[1]?.paragraphNumber, 2);
  });

  it('allows a small gap in numbering', () => {
    // Reported text legitimately skips — a paragraph wholly inside a quoted
    // extract, or a restart after a separate opinion.
    const text = ['1. First.', '4. Fourth.'].join('\n');
    const paras = segmentParagraphs(text);
    assert.equal(paras.length, 2);
    assert.equal(paras[1]?.paragraphNumber, 4);
  });

  it('returns NULL numbers throughout for an unnumbered OCR scan', () => {
    // Pre-1990s judgments arrive as scans whose numbering did not survive. The
    // reading view can display these; it cannot anchor them. Fabricating 1..N
    // would make every citation into them wrong.
    const text = ['The appeal came on for hearing.', 'The court considered the evidence.'].join(
      '\n',
    );
    const paras = segmentParagraphs(text);
    assert.ok(paras.length >= 1);
    for (const p of paras) assert.equal(p.paragraphNumber, null);
  });

  it('indexes contiguously from zero regardless of the printed numbers', () => {
    const text = ['1. First.', '4. Fourth.', '5. Fifth.'].join('\n');
    const paras = segmentParagraphs(text);
    paras.forEach((p, i) => assert.equal(p.paragraphIndex, i));
  });

  it('never emits an empty paragraph', () => {
    const text = ['1. First.', '', '   ', '2. Second.'].join('\n');
    for (const p of segmentParagraphs(text)) assert.ok(p.text.trim().length > 0);
  });

  it('survives an empty judgment', () => {
    assert.deepEqual(segmentParagraphs(''), []);
  });
});

describe('resolveExactSpan', () => {
  const text = '1. The appellant was charged.\n2. The trial court convicted.';

  it('recovers the exact substring verbatim', () => {
    const expected = 'The appellant was charged.';
    const span = resolveExactSpan(text, 3, expected.length);
    assert.deepEqual(span, { text: expected, charOffset: 3 });
  });

  it('returns null when the span runs past the end of the text', () => {
    assert.equal(resolveExactSpan(text, text.length - 5, 50), null);
  });

  it('returns null for a negative offset', () => {
    assert.equal(resolveExactSpan(text, -1, 5), null);
  });

  it('returns null for a zero or negative length', () => {
    assert.equal(resolveExactSpan(text, 0, 0), null);
    assert.equal(resolveExactSpan(text, 0, -3), null);
  });

  it('returns null for a non-integer offset or length', () => {
    assert.equal(resolveExactSpan(text, 1.5, 5), null);
    assert.equal(resolveExactSpan(text, 0, 5.5), null);
  });

  it('accepts a span that exactly reaches the end of the text', () => {
    const span = resolveExactSpan(text, text.length - 10, 10);
    assert.equal(span?.text, text.slice(text.length - 10));
  });
});

describe('locateParagraphByOffset', () => {
  const text = [
    '1. The appellant was charged.',
    '2. The trial court convicted, and the appellant now appeals.',
  ].join('\n');

  it('finds the exact paragraph containing the offset, never fuzzy-matching', () => {
    const secondParaOffset = text.indexOf('The trial court convicted');
    const located = locateParagraphByOffset(text, secondParaOffset, 10);
    assert.equal(located?.paragraphNumber, 2);
  });

  it('returns null when the span itself is invalid', () => {
    assert.equal(locateParagraphByOffset(text, -1, 10), null);
    assert.equal(locateParagraphByOffset(text, 0, text.length + 100), null);
  });

  it('resolves to a paragraph other than fuzzy substring probing would find', () => {
    // Two paragraphs sharing an identical phrase. A fuzzy probe over the
    // repeated phrase cannot tell them apart; the exact offset must.
    const repeated = [
      '1. The court considered the matter and the matter was disposed of.',
      '2. The court considered the matter and the matter was disposed of.',
    ].join('\n');
    const secondOffset = repeated.lastIndexOf('The court considered');
    const located = locateParagraphByOffset(repeated, secondOffset, 20);
    assert.equal(located?.paragraphNumber, 2);
  });

  it('returns null for an offset sitting inside furniture before any real paragraph', () => {
    const withFurniture = ['A B C D E F G H', '1155', '1. The appeal is allowed.'].join('\n');
    // Offset 0 sits on the margin-letter line, before the paragraph block starts.
    const located = locateParagraphByOffset(withFurniture, 0, 5);
    assert.equal(located, null);
  });

  it('returns null when the containing block exceeds MAX_PARAGRAPH_CHARS', () => {
    const huge = 'x'.repeat(3_500);
    const located = locateParagraphByOffset(huge, 10, 5);
    assert.equal(located, null);
  });
});

describe('numberedShare', () => {
  it('reports 1 when every paragraph is numbered', () => {
    assert.equal(numberedShare(segmentParagraphs('1. A.\n2. B.')), 1);
  });

  it('reports 0 for an unnumbered scan, so the client can hide anchors', () => {
    assert.equal(numberedShare(segmentParagraphs('The appeal came on for hearing.')), 0);
  });

  it('reports 0 for an empty judgment rather than dividing by zero', () => {
    assert.equal(numberedShare([]), 0);
  });
});
