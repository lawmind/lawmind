const base = require('./jest.config');

/**
 * The end-to-end suite, which is NOT part of `pnpm test`.
 *
 * It boots the real API and talks to a real Postgres, so it cannot run on a
 * machine that has neither — and a unit suite that silently depends on a
 * database is a unit suite that fails for reasons unrelated to the change under
 * review. `jest.config.js` ignores `e2e/` for the same reason from the other
 * side.
 *
 * `maxWorkers: 1` is not a performance setting. The two spec files share one
 * server, one fixture matter and one saved authority, and the corpus generation
 * is global state that one of them MOVES.
 */
module.exports = {
  ...base,
  testMatch: ['<rootDir>/e2e/**/*.e2e.test.ts', '<rootDir>/e2e/**/*.e2e.test.tsx'],
  testPathIgnorePatterns: [],
  /** Last, so it wins over the preset's stubbed `fetch`. See `e2e/setup.ts`. */
  setupFilesAfterEnv: [...(base.setupFilesAfterEnv ?? []), '<rootDir>/e2e/setup.ts'],
  globalSetup: '<rootDir>/e2e/globalSetup.ts',
  globalTeardown: '<rootDir>/e2e/globalTeardown.ts',
  maxWorkers: 1,
  /** Dropping and creating two databases happens once, but it happens. */
  testTimeout: 60_000,
};
