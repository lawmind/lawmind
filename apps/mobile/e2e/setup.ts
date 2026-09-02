/**
 * GIVE THE E2E RUN A REAL `fetch` BACK.
 *
 * `jest-expo/src/preset/setup.js` installs `expo/src/winter`, which replaces the
 * global `fetch` with a stub built on a mocked `ExpoFetchModule` — its
 * `NativeResponse.text()` returns nothing, so every response comes back with
 * `status: undefined` and an undefined body. That is correct for a unit suite:
 * a component test must not reach the network by accident.
 *
 * It is fatal for this one. The whole point of `e2e/` is that
 * `src/api/client.ts` runs UNMODIFIED and its `fetch` reaches the real server,
 * so the stub is swapped for undici's — the same implementation Node's own
 * global `fetch` is built on — and only inside this project's config.
 *
 * The failure it caused was silent rather than loud: `res.ok` was `false` with
 * `code: 'network'`, which reads exactly like a server that is not running.
 *
 * ── WHY `require`, AND NOT AN `import` ──────────────────────────────────────
 *
 * `undici`'s type declarations augment the global scope with their own `fetch`,
 * `Response` and `Headers`. A static import pulls that augmentation into the
 * whole project's type graph, and the app's own `@ts-expect-error` directives on
 * `fetch` mocks then stop being errors — six of them turned into
 * "Unused '@ts-expect-error' directive" in files this round never touched. The
 * runtime need is a value; taking it as one keeps the types where they belong.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const undici = require('undici') as {
  fetch: unknown;
  Headers: unknown;
  Request: unknown;
  Response: unknown;
};

const globals = globalThis as unknown as Record<string, unknown>;
globals.fetch = undici.fetch;
globals.Headers = undici.Headers;
globals.Request = undici.Request;
globals.Response = undici.Response;
