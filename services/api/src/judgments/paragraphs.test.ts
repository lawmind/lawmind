import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { numberedShare, segmentParagraphs } from './paragraphs.ts';

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
