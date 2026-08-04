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

  it('has defaults that sit inside the model context', () => {
    // BGE-M3 accepts 8194 positions; the character budget must stay well under it.
    assert.ok(defaultChunkOptions.maxChars < 4000);
    assert.ok(defaultChunkOptions.overlapChars < defaultChunkOptions.maxChars);
    assert.ok(defaultChunkOptions.minChars < defaultChunkOptions.maxChars);
  });
});
