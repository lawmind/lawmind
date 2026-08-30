/**
 * THE BUILD MAY NOT GUESS AN API URL — R12 §2.
 *
 * The failure this holds shut is not hypothetical. Until 22 August 2026 a
 * missing `EXPO_PUBLIC_API_URL` fell back to `api-production-1c0b4.up.railway.app`,
 * which has had no active deployment since 11 August — so a `preview` or
 * `production` binary compiled clean, installed clean, and then failed every
 * request forever with nothing in the code saying why. R12 extends the refusal
 * from "not dev" to three NAMED environments, and adds the retired host itself
 * to the things that are refused rather than merely not-defaulted-to.
 *
 * `resolveBaseUrl` and `resolveAppEnvironment` take their inputs as arguments
 * precisely so this can be tested without mutating module-level `process.env`
 * and without re-importing the client for each case.
 */
import { RETIRED_API_HOSTS, resolveAppEnvironment, resolveBaseUrl } from './client';

describe('resolveAppEnvironment', () => {
  it('takes the declared environment when there is one', () => {
    expect(resolveAppEnvironment('staging', false)).toBe('staging');
    expect(resolveAppEnvironment('production', false)).toBe('production');
    expect(resolveAppEnvironment('development', false)).toBe('development');
  });

  it('treats an undeclared non-dev bundle as production, never as development', () => {
    expect(resolveAppEnvironment(undefined, false)).toBe('production');
    // The conservative direction is the strict one: an unrecognised value is
    // not trusted to mean "development" just because it is not one of ours.
    expect(resolveAppEnvironment('preview', false)).toBe('production');
  });

  it('an undeclared dev bundle is development', () => {
    expect(resolveAppEnvironment(undefined, true)).toBe('development');
  });
});

describe('resolveBaseUrl', () => {
  it('development alone gets a loopback default — the only default there is', () => {
    expect(resolveBaseUrl(undefined, 'development')).toBe('http://localhost:3000');
  });

  it('staging with no URL throws rather than guessing', () => {
    expect(() => resolveBaseUrl(undefined, 'staging')).toThrow(/not set for the "staging" build/);
  });

  it('production with no URL throws rather than guessing', () => {
    expect(() => resolveBaseUrl(undefined, 'production')).toThrow(
      /not set for the "production" build/,
    );
  });

  it('an empty string is not a URL', () => {
    expect(() => resolveBaseUrl('', 'production')).toThrow(/not set for the "production" build/);
  });

  it('takes an explicit URL in every environment', () => {
    expect(resolveBaseUrl('https://api.example.test', 'staging')).toBe('https://api.example.test');
    expect(resolveBaseUrl('https://api.example.test', 'production')).toBe(
      'https://api.example.test',
    );
    expect(resolveBaseUrl('http://192.168.1.5:3000', 'development')).toBe('http://192.168.1.5:3000');
  });

  it('refuses a value that is not an absolute http(s) URL', () => {
    expect(() => resolveBaseUrl('api.example.test', 'production')).toThrow(/absolute http/);
    expect(() => resolveBaseUrl('/api', 'production')).toThrow(/absolute http/);
  });

  /**
   * THE ONE THAT MATTERS. A stale `.env`, a copied EAS secret or a resurrected
   * shell profile must fail loudly rather than produce the exact silent-dead
   * build this whole guard exists for.
   */
  it.each(RETIRED_API_HOSTS)('refuses the retired host %s even when explicitly set', (host) => {
    expect(() => resolveBaseUrl(`https://${host}`, 'production')).toThrow(/retired API host/);
    expect(() => resolveBaseUrl(`https://${host}/v1`, 'staging')).toThrow(/retired API host/);
    // Refused in development too: a developer pointed at a dead host debugs the
    // wrong thing for an afternoon.
    expect(() => resolveBaseUrl(`https://${host}`, 'development')).toThrow(/retired API host/);
  });
});
