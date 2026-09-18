import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chunkJudgment, defaultChunkOptions, type ChunkOptions } from './chunk.ts';

const opts: ChunkOptions = { maxChars: 200, minChars: 40, overlapChars: 20 };
const para = (n: number, len: number) => `P${n} ` + 'x'.repeat(Math.max(0, len - 3));

describe('chunkJudgment', () => {
  it('returns nothing for empty or whitespace-only text', () => {
    assert.deepEqual(chunkJudgment(''), []);
    assert.deepEqual(chunkJudgment('   \n\n  \t '), []);
  });

  it('keeps a single short judgment as one chunk', () => {
    const chunks = chunkJudgment('A short order of the Court.', opts);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.text, 'A short order of the Court.');
    assert.equal(chunks[0]?.index, 0);
    assert.equal(chunks[0]?.offset, 0);
  });

  it('never exceeds maxChars in the body it packs', () => {
    const text = [para(1, 150), para(2, 150), para(3, 150), para(4, 150)].join('\n\n');
    for (const c of chunkJudgment(text, opts)) {
      // Body budget is maxChars; the carried overlap sits on top of it.
      assert.ok(
        c.text.length <= opts.maxChars + opts.overlapChars + 2,
        `chunk ${c.index} is ${c.text.length} chars`,
      );
    }
  });

  it('splits a paragraph that is longer than maxChars on its own', () => {
    const chunks = chunkJudgment(para(1, 900), opts);
    assert.ok(chunks.length > 1, 'expected an oversized paragraph to split');
  });

  it('carries overlap from the previous chunk so a split holding stays findable', () => {
    const text = [para(1, 180), para(2, 180)].join('\n\n');
    const chunks = chunkJudgment(text, opts);
    assert.ok(chunks.length >= 2);
    const tail = chunks[0]!.text.slice(-opts.overlapChars);
    assert.ok(chunks[1]!.text.startsWith(tail), 'second chunk should begin with the previous tail');
  });

  it('indexes chunks contiguously from zero', () => {
    const text = Array.from({ length: 6 }, (_, i) => para(i, 150)).join('\n\n');
    const chunks = chunkJudgment(text, opts);
    assert.deepEqual(
      chunks.map((c) => c.index),
      chunks.map((_, i) => i),
    );
  });

  it('points offsets at real positions in the ORIGINAL text, not the overlapped text', () => {
    const text = [para(1, 150), para(2, 150), para(3, 150)].join('\n\n');
    for (const c of chunkJudgment(text, opts)) {
      assert.ok(c.offset >= 0 && c.offset < text.length, `offset ${c.offset} out of range`);
    }
  });

  it('bodyLength recovers the exact body -- verbatim, never approximated', () => {
    const text = [para(1, 180), para(2, 180), para(3, 180)].join('\n\n');
    for (const c of chunkJudgment(text, opts)) {
      const span = text.slice(c.offset, c.offset + c.bodyLength);
      // The body is a real substring of the source, and (for every chunk but
      // the first) it is exactly the SUFFIX of `text` once the overlap prefix
      // this chunk carries is stripped off.
      assert.ok(c.text.endsWith(span), `chunk ${c.index}'s recovered span is not its own suffix`);
      assert.equal(span.length, c.bodyLength);
    }
  });

  it('bodyLength is shorter than text.length exactly when a chunk carries overlap', () => {
    const text = [para(1, 180), para(2, 180)].join('\n\n');
    const chunks = chunkJudgment(text, opts);
    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0]!.bodyLength, chunks[0]!.text.length, 'first chunk carries no overlap');
    assert.ok(
      chunks[1]!.bodyLength < chunks[1]!.text.length,
      'second chunk carries overlap, so its body is shorter than its embedded text',
    );
  });

  it('the recovered span for a single-chunk judgment is the whole judgment', () => {
    const text = 'A short order of the Court.';
    const [c] = chunkJudgment(text, opts);
    assert.equal(text.slice(c!.offset, c!.offset + c!.bodyLength), text);
  });

  it('does not leave a sub-minimum fragment as its own chunk', () => {
    const text = [para(1, 190), 'tiny tail.'].join('\n\n');
    const chunks = chunkJudgment(text, opts);
    const last = chunks[chunks.length - 1]!;
    assert.ok(
      chunks.length === 1 || last.text.length >= opts.minChars,
      'a short tail should merge into the previous chunk',
    );
  });

  it('chunks OCR-style text that has no blank lines at all', () => {
    // Older scanned judgments lose paragraph breaks entirely.
    const text = 'x'.repeat(1000);
    const chunks = chunkJudgment(text, opts);
    assert.ok(chunks.length > 1, 'expected a long unbroken run to still chunk');
    assert.ok(chunks.every((c) => c.text.length > 0));
  });

  it('never falls back to offset 0 for a later chunk when paragraphs are separated irregularly', () => {
    // The bug this guards: paragraphs used to be reassembled with a canonical
    // "\n\n" and relocated via `text.indexOf`. A separator that was not exactly
    // two newlines -- three+ newlines, or a blank line carrying trailing
    // spaces -- made the reconstructed body impossible to find, and the code
    // silently reported offset 0 instead of the chunk's real position.
    const text = [
      para(1, 180),
      '\n', // an extra blank line: three newlines between paragraphs 1 and 2
      para(2, 180),
      '   \n', // a "blank" line that is not actually empty
      para(3, 180),
      '\n\n',
      para(4, 180),
    ].join('\n\n');
    const chunks = chunkJudgment(text, opts);
    for (const c of chunks) {
      if (c.index === 0) continue; // offset 0 is the genuine, correct answer here
      assert.notEqual(c.offset, 0, `chunk ${c.index} fell back to offset 0`);
      const span = text.slice(c.offset, c.offset + c.bodyLength);
      assert.ok(c.text.endsWith(span), `chunk ${c.index}'s span is not its own suffix`);
    }
  });

  it('reports offset 0 only for a chunk that genuinely starts at 0', () => {
    const text = [para(1, 180), para(2, 180)].join('\n\n');
    const chunks = chunkJudgment(text, opts);
    assert.equal(chunks[0]!.offset, 0);
    if (chunks.length > 1) assert.notEqual(chunks[1]!.offset, 0);
  });

  it('reports offset -1 rather than an unverified overshoot when a short tail merges across a non-canonical gap', () => {
    // Reproduces the production failure exactly: a paragraph long enough to
    // be split by splitLongParagraph, cut at a single space, leaving a
    // trailing piece short enough to trigger the "short tail merges into the
    // previous chunk" path. The real gap between the two pieces is ONE
    // character (the space); the merge synthesises "\n\n" (two characters)
    // between them. The resulting bodyLength is 1 character longer than the
    // real span -- caught here by the self-verification, not silently wrong.
    const text = 'A'.repeat(190) + ' ' + 'B'.repeat(35); // 226 chars total
    const chunks = chunkJudgment(text, opts); // maxChars 200, minChars 40
    assert.equal(chunks.length, 1, 'the short tail should have merged into one chunk');
    assert.equal(
      chunks[0]!.offset,
      -1,
      'an unverifiable position must not be reported as offset 0 or as a guess',
    );
  });

  it('accounts for leading whitespace in fullText when computing offset', () => {
    const inner = [para(1, 180), para(2, 180)].join('\n\n');
    const withLeadingWs = `   \n\n${inner}`;
    const chunks = chunkJudgment(withLeadingWs, opts);
    for (const c of chunks) {
      const span = withLeadingWs.slice(c.offset, c.offset + c.bodyLength);
      assert.ok(
        c.text.endsWith(span),
        `chunk ${c.index} span not recovered against the untrimmed text`,
      );
    }
    // The first chunk's body must not start at 0 -- that would be the leading
    // whitespace, not real text.
    assert.ok(chunks[0]!.offset > 0);
  });

  it('has defaults that sit inside the model context', () => {
    // BGE-M3 accepts 8194 positions; the character budget must stay well under it.
    assert.ok(defaultChunkOptions.maxChars < 4000);
    assert.ok(defaultChunkOptions.overlapChars < defaultChunkOptions.maxChars);
    assert.ok(defaultChunkOptions.minChars < defaultChunkOptions.maxChars);
  });
});
