import { excerptOf, isSendableQuote, needsExcerpt, QUOTE_MAX } from './excerpt';

/**
 * THE EXCERPT INVARIANT — NEW3 R24 `EXACT_USER_SELECTED_EXCERPT`.
 *
 * The quote is `source.slice(start, end)` and nothing else. Every case below is
 * a way a well-meaning helper could have changed the advocate's evidence.
 */

const long = 'a'.repeat(5458);

describe('excerptOf', () => {
  it('slices exactly at start/end', () => {
    expect(excerptOf('The appeal is allowed.', 4, 10)).toEqual({ ok: true, excerpt: 'appeal' });
  });

  it('accepts one character', () => {
    expect(excerptOf(long, 0, 1)).toEqual({ ok: true, excerpt: 'a' });
  });

  it('accepts exactly 4,000 characters', () => {
    const r = excerptOf(long, 100, 100 + QUOTE_MAX);
    expect(r.ok && r.excerpt.length).toBe(QUOTE_MAX);
  });

  it('refuses 4,001 characters rather than shortening them', () => {
    expect(excerptOf(long, 0, QUOTE_MAX + 1)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('refuses an empty selection', () => {
    expect(excerptOf(long, 12, 12)).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses offsets outside the source, reversed or fractional', () => {
    expect(excerptOf('abc', -1, 2).ok).toBe(false);
    expect(excerptOf('abc', 0, 4).ok).toBe(false);
    expect(excerptOf('abc', 2, 1).ok).toBe(false);
    expect(excerptOf('abc', 0.5, 2).ok).toBe(false);
  });

  it('preserves Devanagari byte-for-byte, combining marks included', () => {
    const source = 'न्यायालय ने कहा कि अपील स्वीकार की जाती है।';
    const start = source.indexOf('अपील');
    const end = source.length;
    const r = excerptOf(source, start, end);
    expect(r).toEqual({ ok: true, excerpt: 'अपील स्वीकार की जाती है।' });
    expect(r.ok && [...r.excerpt].map((c) => c.codePointAt(0))).toEqual(
      [...source.slice(start)].map((c) => c.codePointAt(0)),
    );
  });

  it('does not normalise: a decomposed character stays decomposed', () => {
    const source = 'Café order';
    const r = excerptOf(source, 0, 5);
    expect(r.ok && r.excerpt).toBe('Café');
    expect(r.ok && r.excerpt).not.toBe('Café');
  });

  it('keeps newlines and surrounding whitespace — no trim', () => {
    const source = 'Para one.\n\n  held that  \nend';
    const r = excerptOf(source, 9, 24);
    expect(r.ok && r.excerpt).toBe('\n\n  held that  ');
  });

  it('refuses a boundary that splits a surrogate pair', () => {
    const source = 'x\u{1F4DC}y';
    expect(excerptOf(source, 0, 2).ok).toBe(false);
    expect(excerptOf(source, 0, 3)).toEqual({ ok: true, excerpt: 'x\u{1F4DC}' });
  });
});

describe('the fast-path boundary', () => {
  it('3,999 and 4,000 save whole; 4,001 needs a selection', () => {
    expect(needsExcerpt('a'.repeat(3999))).toBe(false);
    expect(needsExcerpt('a'.repeat(4000))).toBe(false);
    expect(needsExcerpt('a'.repeat(4001))).toBe(true);
  });

  it('the send guard mirrors the server: 1..4000', () => {
    expect(isSendableQuote('')).toBe(false);
    expect(isSendableQuote('a')).toBe(true);
    expect(isSendableQuote('a'.repeat(4000))).toBe(true);
    expect(isSendableQuote('a'.repeat(4001))).toBe(false);
  });
});
