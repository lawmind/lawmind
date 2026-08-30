import { treatmentRelationshipCopy } from './treatmentRelationship';

describe('treatmentRelationshipCopy', () => {
  const title = 'Later Bench v. State';

  it('names a genuine set-aside relationship positively', () => {
    expect(treatmentRelationshipCopy(title, 'set_aside')).toBe(`Set aside in ${title}`);
  });

  it('never relabels overruling as set-aside', () => {
    const copy = treatmentRelationshipCopy(title, 'overruled');

    expect(copy).toBe(`Overruled by ${title}`);
    expect(copy).not.toMatch(/set aside/i);
  });

  /**
   * R14 A5's eighth value, and the direction it must move in. `evidence_defect`
   * is a fact about our parser and not about the law — the live instance is a
   * 1975 authority whose only adverse edge is a DISSENT's subjunctive, "is
   * sought to be overruled". Rendering any verb for it would state a change in
   * the law that never happened.
   */
  it('states nothing about the law for an evidence defect', () => {
    const copy = treatmentRelationshipCopy(title, 'evidence_defect');

    expect(copy).toBe(`Later judgment: ${title}`);
    expect(copy).not.toMatch(/set aside|overruled|doubted|review/i);
  });

  it.each([undefined, 'review_required', 'evidence_defect', 'future_unknown_value'])(
    'keeps the later judgment visible without inferring a relationship for %s',
    (effect) => {
      const copy = treatmentRelationshipCopy(title, effect);

      expect(copy).toBe(`Later judgment: ${title}`);
      expect(copy).not.toMatch(/set aside|overruled|doubted/i);
    },
  );
});
