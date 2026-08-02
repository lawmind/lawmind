import type { ExpoConfig } from 'expo/config';

/**
 * NO COLOUR IN THIS FILE, AND NO IMPORT OF ONE.
 *
 * Expo's config loader transpiles this file but not its imports, so a relative
 * `import { color } from './src/theme/tokens'` cannot resolve at build time.
 * That leaves two options: copy a hex here, or carry no colour at all. A copied
 * hex is a second palette, so this file carries none.
 *
 * Consequences, both deliberate:
 *
 * · The Android adaptive icon uses `backgroundImage` rather than
 *   `backgroundColor`. Same result, expressed as an asset.
 *
 * · `expo-splash-screen` gets an image and no background colour, so the launch
 *   background is the platform default until the real splash is built. Screen 1
 *   of the inventory is a SEAL PRESSING ON AN OXBLOOD FIELD
 *   (`design/screens/renders/44-splash-signin@2x.png`) — a designed moment, not
 *   a config value. Setting a flat colour here now would be improvising half of
 *   it and then having to unpick it.
 *
 * `userInterfaceStyle` is locked to light. Dark mode is a v2 decision —
 * advocates work in daylight — and a dark default would be a design decision
 * taken by a config file.
 */
const config: ExpoConfig = {
  name: 'Lawmind',
  slug: 'lawmind',
  scheme: 'lawmind',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'co.lawmind.app',
    supportsTablet: true,
  },
  android: {
    package: 'co.lawmind.app',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-splash-screen', { image: './assets/splash-icon.png' }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
