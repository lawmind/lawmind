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
   * name merely STARTS with `react-native` — `react-native-reanimated`,
   * `react-native-worklets`, and this one. Spreading the preset first swallows
   * them silently, which reads as a mysterious module failure rather than a
   * config ordering bug.
   */
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/jest/lucide-stub.js',
    /**
     * BOTH of these, and worklets is the one that actually throws. Mapping only
     * `react-native-reanimated` leaves the runtime it depends on to load for
     * real, which is what failed four times before.
     */
    '^react-native-reanimated$': '<rootDir>/node_modules/react-native-reanimated/mock.js',
    /**
     * `package.json` is deliberately NOT stubbed. Reanimated reads the worklets
     * version from it at load and throws "Invalid version. Must be a string"
     * when the stub answers instead — the runtime is what we are replacing, not
     * the package's identity.
     */
    '^react-native-worklets$': '<rootDir>/jest/worklets-stub.js',
    '^react-native-worklets/(?!package\\.json).*$': '<rootDir>/jest/worklets-stub.js',
    ...expoPreset.moduleNameMapper,
  },
};
