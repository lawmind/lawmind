const expoPreset = require('jest-expo/jest-preset');

/**
 * The client half of the citation harness runs here.
 *
 * `docs/CITATION_HARNESS.md` §stale-overruled names three assertions the CLIENT
 * must carry, and one of them can only be written as a test:
 *
 *   "every `verified` fixture with `overruled_status = none` renders NO MARK AT
 *    ALL — assert the absence, so a regression that reintroduces badges is
 *    caught."
 *
 * An absence cannot be caught by looking at a screenshot six months from now.
 * It is caught by a test that fails the moment someone adds a reassuring badge
 * because a screen "looked empty".
 */
module.exports = {
  ...expoPreset,
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  /**
   * The preset's `transformIgnorePatterns` is used AS IS — replacing it drops
   * `@react-native/js-polyfills` and the suite fails to parse before a single
   * assertion runs. Icons are handled by replacement instead; see
   * `jest/lucide-stub.js` for why the regex route was abandoned.
   */
  transformIgnorePatterns: expoPreset.transformIgnorePatterns,
  /**
   * ORDER MATTERS, AND OURS MUST COME FIRST.
   *
   * Jest applies `moduleNameMapper` in insertion order and takes the first
   * match, and the preset's `^react-native($|/.*)` matches every package whose
   * name merely STARTS with `react-native` — including this one. Spreading the
   * preset first swallows it silently, which reads as a mysterious module
   * failure rather than a config ordering bug.
   *
   * REANIMATED IS NOT MAPPED. It loads for real; `jest/setup.js` supplies the
   * one thing it needs that Node cannot.
   */
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/jest/lucide-stub.js',
    '^react-native-reanimated$': '<rootDir>/jest/reanimated-stub.js',
    ...expoPreset.moduleNameMapper,
  },
};
