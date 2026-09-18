/**
 * The deployed probes' TARGET, not their assertions.
 *
 * Until 18 Sep 2026 both probe CLIs carried
 * `const DEFAULT_BASE_URL = 'https://api-production-1c0b4.up.railway.app'` — a
 * retired production origin. An unconfigured `pnpm citation-safety-probe`
 * therefore produced a verdict about a host nobody had deployed to, and it read
 * exactly like a verdict about LawMind. These tests exist so the default cannot
 * come back: three of the four read the CLI SOURCE, because the defect was a
 * constant, and a behavioural test of a refusal does not notice a constant
 * reappearing beside it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { NO_DEPLOYED_TARGET, RETIRED_PROBE_ORIGINS, resolveProbeBaseUrl } from './probe-target.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIS = ['deployed-safety-cli.ts', 'deployed-judgment-safety-cli.ts'] as const;
const source = (f: string) => readFileSync(join(HERE, f), 'utf8');

/** 1 — no default deployment target exists in either CLI. */
test('neither deployed probe CLI carries a default base URL', () => {
  for (const f of CLIS) {
    const s = source(f);
    assert.equal(
      /DEFAULT_BASE_URL/.test(s),
      false,
      `${f} declares a DEFAULT_BASE_URL; a deployed probe may not invent a target`,
    );
    assert.equal(
      /PROBE_BASE_URL'\]\s*\?\?/.test(s),
      false,
      `${f} falls back from PROBE_BASE_URL with ??; absence must refuse, not default`,
    );
  }
});

/** 2 — a missing PROBE_BASE_URL refuses, with the machine-readable reason. */
test('missing PROBE_BASE_URL refuses with NO_DEPLOYED_TARGET', () => {
  const r = resolveProbeBaseUrl({});
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, NO_DEPLOYED_TARGET);
  assert.match(r.ok === false ? r.message : '', /PROBE_BASE_URL is not set/);
});

test('an empty or whitespace PROBE_BASE_URL is absent, not a target', () => {
  for (const v of ['', '   ']) {
    const r = resolveProbeBaseUrl({ PROBE_BASE_URL: v });
    assert.equal(r.ok, false, `${JSON.stringify(v)} was accepted as a target`);
  }
});

/** 3 — an explicit URL runs, and is the URL that was given. */
test('an explicit PROBE_BASE_URL resolves', () => {
  const r = resolveProbeBaseUrl({ PROBE_BASE_URL: 'http://localhost:3999' });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.baseUrl, 'http://localhost:3999');
});

test('a trailing slash is trimmed rather than doubling the path separator', () => {
  const r = resolveProbeBaseUrl({ PROBE_BASE_URL: 'https://api.example.com/' });
  assert.equal(r.ok === true && r.baseUrl, 'https://api.example.com');
});

test('a value that is not an absolute http(s) URL refuses', () => {
  for (const v of ['api.example.com', 'ftp://api.example.com', 'not a url']) {
    const r = resolveProbeBaseUrl({ PROBE_BASE_URL: v });
    assert.equal(r.ok, false, `${v} was accepted as a target`);
  }
});

/** 4 — the retired Railway origin is not an active default, anywhere. */
test('the retired Railway origin is not embedded as an active default', () => {
  for (const f of CLIS) {
    const s = source(f);
    for (const host of RETIRED_PROBE_ORIGINS) {
      assert.equal(
        s.includes(host),
        false,
        `${f} still names ${host}; it may appear only in the denylist and in history`,
      );
    }
  }
});

test('an explicit retired origin is refused rather than probed', () => {
  const r = resolveProbeBaseUrl({
    PROBE_BASE_URL: 'https://api-production-1c0b4.up.railway.app',
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.message : '', /RETIRED/);
});

/**
 * The probe must not INFER a target either. `AUTH_BASE_URL` is the auth
 * surface, not the API under test, and localhost is this workstation rather
 * than a deployment.
 */
test('no neighbouring variable is treated as a deployment target', () => {
  const r = resolveProbeBaseUrl({
    AUTH_BASE_URL: 'https://auth.example.com',
    API_BASE_URL: 'https://api.example.com',
    DATABASE_URL: 'postgresql://localhost/lawmind',
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, NO_DEPLOYED_TARGET);
});

test('neither CLI reads AUTH_BASE_URL', () => {
  for (const f of CLIS) {
    assert.equal(source(f).includes('AUTH_BASE_URL'), false, `${f} reads AUTH_BASE_URL`);
  }
});
