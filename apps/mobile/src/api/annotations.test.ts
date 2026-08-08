import { resolveAnnotationParagraph, toWireAnnotation } from './annotations';
import type { JudgmentParagraph } from './contract';

/**
 * These tests exist to PIN A SEMANTIC, not to exercise a function.
 *
 * `paragraphNumber` is the number printed in the judgment; `paragraphIndex` is
 * the position in the array. If anyone ever collapses the two, or starts
 * deriving the number from the position, these fail loudly — which is the only
 * way this stays caught. An annotation on the wrong paragraph of a judgment is
 * silent, survives review, and ends up quoted into a filing.
 */

/**
 * Deliberately NOT numbered 1,2,3. Real judgments skip numbers, restart per
 * section and carry sub-numbering, so a fixture that numbers sequentially from
 * 1 would pass even if the code returned the index.
 */
const paragraphs: JudgmentParagraph[] = [
  { paragraphNumber: 14, paragraphIndex: 0, text: 'Fourteen.' },
  { paragraphNumber: 15, paragraphIndex: 1, text: 'Fifteen.' },
  { paragraphNumber: 22, paragraphIndex: 2, text: 'Twenty-two — the one an advocate would cite.' },
  { paragraphNumber: 23, paragraphIndex: 3, text: 'Twenty-three.' },
];

describe('toWireAnnotation', () => {
  it('stores the PRINTED number, not the array position', () => {
    const wire = toWireAnnotation({ paragraphs, paragraph: paragraphs[2]! });

    // The whole point: ¶ 22 sits at index 2. These must not be confused.
    expect(wire.paragraphNumber).toBe(22);
    expect(wire.paragraphIndex).toBe(2);
    expect(wire.paragraphNumber).not.toBe(wire.paragraphIndex);
  });

  it('does not renumber a judgment that starts at 14', () => {
    const wire = toWireAnnotation({ paragraphs, paragraph: paragraphs[0]! });

    // Index 0 is ¶ 14. A client that "helpfully" numbered from 1 would say 1.
    expect(wire.paragraphNumber).toBe(14);
    expect(wire.paragraphIndex).toBe(0);
  });

  it('carries the paragraph text as the quote — whole paragraph, not a range', () => {
    const wire = toWireAnnotation({ paragraphs, paragraph: paragraphs[2]! });

    expect(wire.quote).toBe('Twenty-two — the one an advocate would cite.');
  });

  it('omits note and matterId rather than sending undefined', () => {
    const wire = toWireAnnotation({ paragraphs, paragraph: paragraphs[1]! });

    expect('note' in wire).toBe(false);
    expect('matterId' in wire).toBe(false);
  });

  it('carries note and matterId when given', () => {
    const wire = toWireAnnotation({
      paragraphs,
      paragraph: paragraphs[1]!,
      note: 'parity point',
      matterId: 'matter_1',
    });

    expect(wire.note).toBe('parity point');
    expect(wire.matterId).toBe('matter_1');
  });
});

describe('resolveAnnotationParagraph', () => {
  it('prefers the printed number over the index', () => {
    /**
     * The judgment was re-ingested and split differently, so ¶ 22 moved from
     * index 2 to index 1. The stored index is now stale; the number is not.
     */
    const reingested: JudgmentParagraph[] = [
      { paragraphNumber: 14, paragraphIndex: 0, text: 'Fourteen.' },
      { paragraphNumber: 22, paragraphIndex: 1, text: 'Twenty-two — the one an advocate would cite.' },
      { paragraphNumber: 23, paragraphIndex: 2, text: 'Twenty-three.' },
    ];

    const found = resolveAnnotationParagraph(reingested, {
      paragraphNumber: 22,
      paragraphIndex: 2,
    });

    // Index 2 is now ¶ 23. Following it would move the advocate's note.
    expect(found?.paragraphNumber).toBe(22);
  });

  it('falls back to the index when the judgment has no printed numbering', () => {
    const found = resolveAnnotationParagraph(paragraphs, {
      paragraphNumber: null,
      paragraphIndex: 3,
    });

    expect(found?.paragraphNumber).toBe(23);
  });

  it('returns undefined rather than a wrong paragraph when neither resolves', () => {
    const found = resolveAnnotationParagraph(paragraphs, {
      paragraphNumber: 999,
      paragraphIndex: 99,
    });

    expect(found).toBeUndefined();
  });
});
