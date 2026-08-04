import { render, screen } from '@testing-library/react-native';

import { CitationMark } from './CitationMark';

/**
 * THE GREYSCALE TEST.
 *
 * `sprints/SPRINT_2.md` §RCC DONE: "The two marks are distinguishable IN
 * GREYSCALE — dashed edge vs filled block."
 *
 * Colour is the first thing to go: sunlight washout, a cheap Android panel, a
 * dirty screen, colour-vision deficiency. If the marks differ only by hue then
 * in any of those conditions an advocate cannot tell "we could not confirm
 * this" from "the law has moved" — two facts with different remedies.
 *
 * So the assertion is on BORDER STYLE, not on colour: dashed means us, solid
 * means the law.
 */

const styleOf = (testId: string) => {
  const node = screen.getByTestId(testId);
  return ([] as unknown[]).concat(node.props.style).filter(Boolean) as {
    borderStyle?: string;
    borderWidth?: number;
  }[];
};

const borderStyle = (testId: string) =>
  styleOf(testId).map((s) => s?.borderStyle).find(Boolean) ?? 'solid';

it('draws our uncertainty dashed and the law solid, so they differ without colour', async () => {
  await render(
    <>
      <CitationMark label="Not confirmed" testID="mark-unconfirmed" tone="unconfirmed" />
      <CitationMark label="Doubted · referred" testID="mark-quiet" tone="moved-quiet" />
      <CitationMark label="Paras 19–20 set aside" testID="mark-moved" tone="moved" />
      <CitationMark label="Overruled" testID="mark-danger" tone="moved-danger" />
    </>
  );

  expect(borderStyle('mark-unconfirmed')).toBe('dashed');
  expect(borderStyle('mark-quiet')).toBe('solid');
  expect(borderStyle('mark-moved')).toBe('solid');
  expect(borderStyle('mark-danger')).toBe('solid');
});

it('gives every mark the same 1.5px geometry, so only the edge differs', async () => {
  await render(
    <>
      <CitationMark label="Not confirmed" testID="a" tone="unconfirmed" />
      <CitationMark label="Overruled" testID="b" tone="moved-danger" />
    </>
  );
  for (const id of ['a', 'b']) {
    expect(styleOf(id).some((s) => s?.borderWidth === 1.5)).toBe(true);
  }
});
