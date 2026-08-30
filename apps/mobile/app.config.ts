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
 * FAIL THE BUILD, NOT THE FIRST REQUEST — for all three environments.
 *
 * A release-shaped bundle is one of three things, and none of them may guess an
 * API URL:
 *
 *   1. an EAS cloud build (`EAS_BUILD_PROFILE` is set by EAS itself);
 *   2. an explicit `staging`/`production` bundle (`EXPO_PUBLIC_APP_ENV`);
 *   3. a production Metro export (`NODE_ENV=production`, which is what
 *      `expo export` sets and what an EAS build runs under).
 *
 * Only (1) was checked until R12, so `expo export` and a locally-invoked
 * bundler both produced a binary whose first request went nowhere. All three
 * are checked now, and the check is on the RELEASE SHAPE rather than on the
 * absence of `__DEV__`, so a developer running `expo start` is never blocked.
 *
 * `src/api/client.ts` carries the same refusal at import time as a second line
 * of defence. Failing here means a misconfigured build never leaves the queue
 * at all. FQ-HOSTING (docs/FOUNDER_QUEUE.md) owns the real per-channel URL;
 * this only refuses to guess one.
 */
const declaredEnv = process.env.EXPO_PUBLIC_APP_ENV;
const releaseShaped =
  Boolean(process.env.EAS_BUILD_PROFILE) ||
  declaredEnv === 'staging' ||
  declaredEnv === 'production' ||
  process.env.NODE_ENV === 'production';

if (releaseShaped && !process.env.EXPO_PUBLIC_API_URL) {
  const which =
    process.env.EAS_BUILD_PROFILE ?? declaredEnv ?? 'production (NODE_ENV=production)';
  throw new Error(
    `EXPO_PUBLIC_API_URL is not set for the "${which}" build. Set it in eas.json ` +
      '(build.<profile>.env) or as an EAS secret before building — see ' +
      'docs/FOUNDER_QUEUE.md FQ-HOSTING. Refusing to build a binary that would silently ' +
      'call a guessed API URL.'
  );
}

/**
 * A build that declares no environment is a build nobody chose one for.
 * `development` is never assumed for a release-shaped bundle.
 */
if (releaseShaped && declaredEnv !== 'staging' && declaredEnv !== 'production') {
  throw new Error(
    'EXPO_PUBLIC_APP_ENV must be "staging" or "production" for a release build. ' +
      'Set it in the eas.json build profile alongside EXPO_PUBLIC_API_URL.'
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
