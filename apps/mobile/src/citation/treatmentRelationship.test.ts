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

  it.each([undefined, 'review_required', 'future_unknown_value'])(
    'keeps the later judgment visible without inferring a relationship for %s',
    (effect) => {
      const copy = treatmentRelationshipCopy(title, effect);

      expect(copy).toBe(`Later judgment: ${title}`);
      expect(copy).not.toMatch(/set aside|overruled|doubted/i);
    },
  );
});
