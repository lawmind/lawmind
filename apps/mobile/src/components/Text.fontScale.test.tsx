import { PixelRatio } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { Text } from './Text';

/**
 * THE LEADING RATIO MUST SURVIVE THE OS TEXT SIZE.
 *
 * React Native scales `fontSize` when a reader raises their system text size,
 * and DOES NOT scale `lineHeight`. Every row of the scale computes its leading
 * as `fontSize x ratio` at the UNSCALED size, so without a correction the ratio
 * collapses as the setting rises — at 2.0 it falls from 1.72 to 0.86 and the
 * line box becomes SHORTER than the type it holds.
 *
 * For Devanagari that is not a cosmetic problem. The matra sits above the line;
 * clip it and the vowel changes, which changes the word. This app is read by
 * people who will quote what they see into a filing.
 *
 * `scripts/check-sunlight.mjs` prints the same arithmetic. THIS asserts the
 * component's real output, which is the part that can regress.
 */

const styleOf = (text: string) => {
  const node = screen.getByText(text);
  const flat = ([] as unknown[]).concat(node.props.style).filter(Boolean) as {
    fontSize?: number;
    lineHeight?: number;
  }[];
  const fontSize = flat.map((s) => s?.fontSize).filter((v) => v !== undefined).at(-1);
  const lineHeight = flat.map((s) => s?.lineHeight).filter((v) => v !== undefined).at(-1);
  return { fontSize: fontSize as number, lineHeight: lineHeight as number };
};

const atScale = (scale: number) =>
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(scale);

afterEach(() => jest.restoreAllMocks());

describe.each([1, 1.3, 2])('at an OS text scale of %sx', (scale) => {
  it('keeps Devanagari leading at 1.72 of the rendered type', async () => {
    atScale(scale);
    await render(
      <Text lang="hi" variant="legal">
        उच्च न्यायालय ने अभियुक्त की जमानत याचिका स्वीकार की।
      </Text>
    );
    const { fontSize, lineHeight } = styleOf(
      'उच्च न्यायालय ने अभियुक्त की जमानत याचिका स्वीकार की।'
    );
    // `fontSize` is what we hand RN; RN multiplies BOTH it and our corrected
    // lineHeight by the same scale, so the ratio is what must hold.
    expect(lineHeight / (fontSize * scale)).toBeCloseTo(1.72, 2);
  });

  it('keeps Latin holding leading at 1.68 of the rendered type', async () => {
    atScale(scale);
    await render(<Text variant="legal">Bail is the rule where the accused cooperated.</Text>);
    const { fontSize, lineHeight } = styleOf('Bail is the rule where the accused cooperated.');
    expect(lineHeight / (fontSize * scale)).toBeCloseTo(1.68, 2);
  });

  /** The line box must never be shorter than the type it holds. */
  it('never renders a line box shorter than the rendered font size', async () => {
    atScale(scale);
    await render(
      <Text lang="hi" variant="legal">
        भारतीय न्याय संहिता
      </Text>
    );
    const { fontSize, lineHeight } = styleOf('भारतीय न्याय संहिता');
    expect(lineHeight).toBeGreaterThan(fontSize * scale);
  });
});

/** The regression this exists to catch, stated as the failure it used to be. */
it('would have clipped before the fix — the uncorrected ratio at 2x is below 1', () => {
  const uncorrected = (17 * 1.72) / (17 * 2);
  expect(uncorrected).toBeLessThan(1);
});
