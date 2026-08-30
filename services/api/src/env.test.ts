/**
 * `AUTH_BASE_URL` — the one environment variable whose wrong value is invisible
 * until it is already in an advocate's inbox.
 *
 * Nothing at startup dereferences the origin a magic link is built from, so a
 * retired host produces links that are well-formed, delivered, logged as sent,
 * and dead. Until 30 August 2026 `env.ts` supplied exactly that as a default.
 * These tests hold the fix: **production configures it or the API refuses to
 * start**, and no retired host can return as an implicit default.
 *
 * The resolver is pure and takes its environment as an argument — the same shape
 * as `mailerFrom` — so production behaviour is provable without a module reset,
 * a real `NODE_ENV`, or a network.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveAuthBaseUrl } from './env.ts';

/** The dead deployment. Named here so a reintroduction fails a test, not a user. */
const RETIRED = 'https://api-production-1c0b4.up.railway.app';

test('production with no AUTH_BASE_URL refuses to start', () => {
  assert.throws(
    () => resolveAuthBaseUrl({ authBaseUrl: undefined, nodeEnv: 'production', port: 3000 }),
    (error: Error) => {
      // The message has to name the variable and the condition: a boot failure
      // that says only "misconfigured" costs an hour at the worst moment.
      assert.match(error.message, /AUTH_BASE_URL/);
      assert.match(error.message, /production/);
      return true;
    },
  );
});

test('an empty AUTH_BASE_URL is a misconfiguration, not a value', () => {
  // `''` is what a deployment sets when a variable is declared and never filled.
  // Treating it as configured would build links against `undefined` origins.
  assert.throws(
    () => resolveAuthBaseUrl({ authBaseUrl: '', nodeEnv: 'production', port: 3000 }),
    /AUTH_BASE_URL/,
  );
});

test('an explicit AUTH_BASE_URL is used exactly, in production', () => {
  const url = resolveAuthBaseUrl({
    authBaseUrl: 'https://api.lawmind.in',
    nodeEnv: 'production',
    port: 3000,
  });
  assert.equal(url, 'https://api.lawmind.in');
});

test('an explicit AUTH_BASE_URL wins outside production too', () => {
  // A developer pointing at a staging origin must not be silently overridden by
  // the local default.
  const url = resolveAuthBaseUrl({
    authBaseUrl: 'https://staging.lawmind.in',
    nodeEnv: 'development',
    port: 3000,
  });
  assert.equal(url, 'https://staging.lawmind.in');
});

test('local development defaults to this process own origin', () => {
  assert.equal(
    resolveAuthBaseUrl({ authBaseUrl: undefined, nodeEnv: 'development', port: 3000 }),
    'http://localhost:3000',
  );
  // The port is read, not assumed: a second local API on 3001 gets 3001.
  assert.equal(
    resolveAuthBaseUrl({ authBaseUrl: undefined, nodeEnv: 'test', port: 3001 }),
    'http://localhost:3001',
  );
});

test('the retired Railway host can never become an implicit default', () => {
  // Every unconfigured combination: none may produce the dead origin, and the
  // production arm may not produce a value at all.
  for (const nodeEnv of ['production', 'development', 'test', 'staging', '']) {
    for (const port of [3000, 8080]) {
      let resolved: string | undefined;
      try {
        resolved = resolveAuthBaseUrl({ authBaseUrl: undefined, nodeEnv, port });
      } catch {
        assert.equal(nodeEnv, 'production', `only production may refuse, not ${nodeEnv}`);
        continue;
      }
      assert.notEqual(resolved, RETIRED);
      assert.ok(
        !resolved.includes('railway.app'),
        `${nodeEnv}:${port} resolved to a Railway host without being configured: ${resolved}`,
      );
    }
  }
});

test('the retired host is reachable only by someone typing it in', () => {
  // Not a defect — it proves the value is now deployment configuration rather
  // than a baked-in default. If this host is ever wanted again, someone sets it.
  assert.equal(
    resolveAuthBaseUrl({ authBaseUrl: RETIRED, nodeEnv: 'production', port: 3000 }),
    RETIRED,
  );
});
