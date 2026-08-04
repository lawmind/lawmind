/**
 * Icons, stubbed for tests.
 *
 * `lucide-react-native` ships ESM only and resolves under a pnpm path that
 * contains `/node_modules/` twice, so the preset's negative-lookahead
 * `transformIgnorePatterns` does not reach it. Rather than keep bending the
 * regex, the package is replaced: transforming 2,000 icon modules on every run
 * to render glyphs no assertion looks at is work for nothing.
 *
 * What the harness asserts is TEXT and STYLE — "Do not file this without
 * checking it", a struck-through title, the absence of a mark. An icon that
 * renders nothing cannot make any of those pass when they should fail.
 */
const React = require('react');

module.exports = new Proxy(
  {},
  {
    get: (_target, name) => {
      if (name === '__esModule') return true;
      const Icon = () => React.createElement('Icon', { testID: `icon-${String(name)}` });
      Icon.displayName = String(name);
      return Icon;
    },
  }
);
