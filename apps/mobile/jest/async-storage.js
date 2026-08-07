/**
 * AsyncStorage IS A NATIVE MODULE, and under Jest there is no native side — it
 * resolves to null and throws on first use, which surfaces as a suite that
 * fails to even load.
 *
 * The package ships its own in-memory mock for exactly this, and it behaves
 * like the real store rather than returning undefined for everything. That
 * matters here: `src/state/outbox.ts` asserts that a queued copy SURVIVES A
 * RESTART, which is only a real assertion if `setItem` and `getItem` actually
 * round-trip. A no-op stub would make that test pass by accident and hide the
 * failure it exists to catch — a copy record lost with the process, and an
 * advocate the overruled fan-out can never reach.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
