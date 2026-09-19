/**
 * ─────────────────────────────────────────────────────────────────────────────
 * N-7 — AUTHENTICATION BEFORE BODY VALIDATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The defect: `validate('json', …)` is middleware and `requireUser` lived in the
 * handler, so an unauthenticated caller could walk a protected route's request
 * schema one 400 at a time and only meet 401 once the body finally validated.
 *
 * Two halves, because either alone is a guard that stops guarding:
 *
 *   BEHAVIOUR  an anonymous request with a DELIBERATELY INVALID body must get
 *              401 AUTH_REQUIRED and never 400. Asserting the valid-body case
 *              would pass even with the ordering reversed — the whole point is
 *              what happens when validation WOULD have failed.
 *
 *   WIRING     read `app.ts` and assert that every route registering a body
 *              validator either gates first or is on an explicitly reasoned
 *              exempt list. `validate` is the thing being protected, so
 *              enumerating validators — rather than enumerating the routes we
 *              happened to fix — is what makes a NEW protected route unable to
 *              miss the gate silently.
 *
 * The exempt list is deliberately in the test and not in production code.
 * `auth/middleware.ts` explains why a central gate with a path list was refused:
 * "a path list is the kind of thing that silently gains an entry". A list that
 * lives in a test cannot gain an entry silently — adding one is a diff a
 * reviewer sees, and each entry below carries the reason it is exempt.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createApp } from '../app.ts';

const APP_SOURCE = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');

/**
 * Routes that register a validator and must NOT be gated, each with the reason.
 *
 * Every entry is a positive product decision, not an oversight being tolerated.
 */
const EXEMPT: Record<string, string> = {
  // Pre-authentication by definition: these are how a caller BECOMES authenticated.
  '/auth/magic-link': 'issues the link; the caller has no token yet by definition',
  '/auth/verify': 'exchanges the link for a token; no token yet',
  '/auth/refresh': 'refresh token only, deliberately not the access token',

  // Works signed out. `auth/middleware.ts`: "`POST /search` works signed out".
  '/search': 'research is readable without an account — the product depends on it',
  /**
   * The other half of research, and it is exempt for the same reason rather than
   * by analogy: it takes no `userId` at all, it carries no `AUTH_REQUIRED`, and
   * `app.ts` registers it under the SAME `researchPerIdentity` rate limit as
   * `/search`. Counter-arguments are grounded in retrieved corpus authorities,
   * which are public.
   */
  '/arguments/counter': 'research, signed out, exactly as /search — takes no user id',

  // Hands back a URL and paste text. Reads nothing owned by anyone, writes nothing.
  '/verify/ecourts': 'returns the eCourts door and the text to paste; no user data either way',

  // Court metadata lookup. `court/lookup.ts` contains no AUTH_REQUIRED.
  '/court/lookup': 'public court reference data',

  /**
   * `/admin/*` is gated by `requireAdmin`, registered with `app.use` BEFORE any
   * admin route, so it already runs ahead of every admin validator. Gating twice
   * would be noise; NOT asserting it is covered would be a hole, so the wiring
   * test below proves the `app.use('/admin/*', requireAdmin(...))` line exists.
   */
};

/** Every `app.<method>('<path>', …validate(…)…)` registration in `app.ts`. */
function routesWithValidators(): { path: string; gatedFirst: boolean }[] {
  const out: { path: string; gatedFirst: boolean }[] = [];
  // Non-greedy to the first `(c` or `async (c`, which is where the handler starts.
  const re = /app\.(get|post|patch|put|delete)\(\s*'([^']+)',([\s\S]*?)(?=\n {4}\S|\n {2}\})/g;
  for (const m of APP_SOURCE.matchAll(re)) {
    const path = m[2]!;
    const args = m[3]!;
    if (!args.includes("validate('json'")) continue;
    const gate = args.indexOf('requireAuthenticated(');
    const val = args.indexOf("validate('json'");
    out.push({ path, gatedFirst: gate !== -1 && gate < val });
  }
  return out;
}

describe('N-7 · authentication runs before body validation', () => {
  it('every json-validating route is gated first, or is exempt for a stated reason', () => {
    const routes = routesWithValidators();

    // If this is 0 the regex stopped matching and every assertion below is vacuous.
    assert.ok(routes.length >= 20, `expected to find the validated routes, found ${routes.length}`);

    const ungated = routes
      .filter((r) => !r.gatedFirst)
      .filter((r) => !r.path.startsWith('/admin/'))
      .filter((r) => EXEMPT[r.path] === undefined)
      .map((r) => r.path);

    assert.deepEqual(
      ungated,
      [],
      `these routes validate a body before checking authentication (N-7). Gate them with ` +
        `requireAuthenticated(...) ahead of validate(...), or add an EXEMPT entry saying why ` +
        `an anonymous caller may reach the validator: ${ungated.join(', ')}`,
    );
  });

  it('admin routes are covered by requireAdmin, registered before they are', () => {
    const use = APP_SOURCE.indexOf("app.use('/admin/*', requireAdmin(");
    assert.notEqual(use, -1, 'the /admin/* guard registration has moved or gone');
    const firstAdminRoute = APP_SOURCE.search(/app\.(get|post|patch|put|delete)\(\s*'\/admin\//);
    assert.ok(
      use < firstAdminRoute,
      'requireAdmin must be registered before the first /admin route so it runs first',
    );
  });

  it('every exempt path still exists, so the list cannot rot into a lie', () => {
    const paths = new Set(routesWithValidators().map((r) => r.path));
    for (const path of Object.keys(EXEMPT)) {
      assert.ok(paths.has(path), `EXEMPT names ${path}, which no longer validates a json body`);
    }
  });
});

describe('N-7 · the anonymous schema walk is closed', () => {
  /**
   * `auth` is supplied so `authMiddleware` is mounted and `authId` is genuinely
   * `undefined` rather than absent because the middleware never ran. No database
   * handle is given: the assertion is that the request STOPS before anything
   * that would need one, so a test that needed a database would be testing the
   * wrong thing.
   */
  const app = createApp({
    ping: async () => {},
    auth: {
      secret: 'test-secret-not-a-real-key',
      sql: null as never,
    } as never,
  });

  /**
   * The bodies below are invalid ON PURPOSE. Under the defect each returned 400
   * with field-level detail; the fix must make them all 401 before the schema is
   * ever consulted.
   */
  const cases: { method: string; path: string; body: unknown }[] = [
    { method: 'PATCH', path: '/me', body: { fullName: 12345 } },
    { method: 'POST', path: '/me/data-requests', body: { kind: 'not-a-kind' } },
    { method: 'POST', path: '/me/accept-terms', body: {} },
  ];

  for (const { method, path, body } of cases) {
    it(`${method} ${path} · invalid body, no token → 401 AUTH_REQUIRED, not 400`, async () => {
      const res = await app.request(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      assert.equal(res.status, 401, `${method} ${path} leaked the schema with a ${res.status}`);
      const json = (await res.json()) as { ok: boolean; error: { code: string } };
      assert.equal(json.ok, false);
      assert.equal(json.error.code, 'AUTH_REQUIRED');
    });
  }

  it('a malformed body is also refused before the JSON parser reports on it', async () => {
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{ this is not json',
    });
    assert.equal(res.status, 401);
  });

  it('and the refusal stays 401, never the 403 that means onboarding is unfinished', async () => {
    /**
     * `resolveAuthFailure` rewrites `AUTH_REQUIRED` to 403 `PROFILE_INCOMPLETE`
     * when `authId` IS set. An anonymous caller must not get that: 403 tells a
     * client "finish onboarding", which is wrong advice for someone who is not
     * signed in at all, and it would send them to a screen they cannot use.
     */
    const res = await app.request('/me/accept-terms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
    const json = (await res.json()) as { error: { code: string } };
    assert.equal(json.error.code, 'AUTH_REQUIRED');
    assert.notEqual(json.error.code, 'PROFILE_INCOMPLETE');
  });
});
