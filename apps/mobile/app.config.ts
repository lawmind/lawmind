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
/**
 * FAIL THE BUILD, NOT THE FIRST REQUEST. `EAS_BUILD_PROFILE` is set by EAS
 * Build itself for every cloud build (`preview`, `production`) and absent
 * under local `expo start` — so this only fires for a real release artefact,
 * never for a developer's dev server. `src/api/client.ts` carries the same
 * refusal at import time as a second line of defence (a local `eas build
 * --local` or a differently-invoked bundler), but failing here means a
 * misconfigured build never leaves the EAS queue at all. FQ-HOSTING
 * (docs/FOUNDER_QUEUE.md) owns the real per-channel URL; this only refuses to
 * guess one.
 */
if (process.env.EAS_BUILD_PROFILE && !process.env.EXPO_PUBLIC_API_URL) {
  throw new Error(
    `EXPO_PUBLIC_API_URL is not set for the "${process.env.EAS_BUILD_PROFILE}" EAS build ` +
      'profile. Set it in eas.json (build.<profile>.env) or as an EAS secret before building — ' +
      'see docs/FOUNDER_QUEUE.md FQ-HOSTING. Refusing to build a binary that would silently ' +
      'call a guessed API URL.'
  );
}

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
    /**
     * No icon/color override — same reasoning as the splash screen note
     * above: a copied hex here is a second palette. Android gets the
     * platform-default small icon until a real one is designed.
     */
    'expo-notifications',
  ],
  experiments: { typedRoutes: true },
};

export default config;
