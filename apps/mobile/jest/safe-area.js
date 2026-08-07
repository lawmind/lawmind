/**
 * `useSafeAreaInsets` THROWS WITHOUT A PROVIDER — it does not return zeroes.
 *
 * In production the provider is supplied by `expo-router`'s `ExpoRoot`, above
 * `app/_layout.tsx`, so every screen has one. Under Jest there is no ExpoRoot,
 * so the first test to render a component calling the hook would fail with
 * "No safe area value available" — a config error wearing the costume of a
 * component bug, and one that arrives for whoever writes the next screen test
 * rather than for whoever introduced the hook.
 *
 * The library ships its own mock for exactly this. It defaults to zero insets
 * but still reads a real `SafeAreaProvider` above it, so a test that cares
 * about the value wraps its subject in one with explicit `initialMetrics` —
 * see `Screen.topInset.test.tsx`. A test asserting against the zero default
 * could not tell a padded screen from an unpadded one.
 */
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});
