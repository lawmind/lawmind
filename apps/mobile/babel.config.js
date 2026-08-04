/**
 * Metro does not need this file — SDK 54+ resolves `babel-preset-expo` on its
 * own. JEST DOES: `jest-expo`'s setup is ESM, and without a Babel config here
 * `babel-jest` has no preset to transform it with, so the whole suite fails to
 * parse before a single assertion runs.
 *
 * It exists for the tests, and it must keep matching what Metro applies, or the
 * harness would be asserting against a differently-compiled app than the one
 * that ships.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
