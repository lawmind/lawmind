import {
  ATTEMPT_KEY_PATTERN,
  DEFAULT_RETRY_AFTER_MS,
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_REUSE_MISMATCH,
  INVALID_IDEMPOTENCY_KEY,
  MAX_IN_PROGRESS_RETRIES,
  MAX_RETRY_AFTER_MS,
  attemptKeySecurityClass,
  newAttemptKey,
  retryAfterMs,
  runAttempt,
} from './attempt';
import type { ApiResponse } from './contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ATTEMPT HELPER — the three rules, and the two 409s that must never merge.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R16 §1 gives the grammar, §4 the outcome table, §6 the client requirement.
 * What is asserted here is the mechanism in isolation; the six routes and the
 * five screens are asserted where they live.
 */

const ok = <T>(data: T): ApiResponse<T> => ({ ok: true, data });
const failure = (code: string, retryAfterSeconds?: number): ApiResponse<never> => ({
  ok: false,
  error: {
    code,
    message: code,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  },
});

describe('the key satisfies the grammar the server enforces', () => {
  /**
   * The server's own rule, quoted from `RCC_V1_API_CONTRACT_R16_AMENDMENT.md`
   * §1: "an opaque, case-sensitive value of 8–128 visible ASCII characters".
   * `services/api/src/idempotency.ts` implements it as `[\x21-\x2b\x2d-\x7e]`,
   * which is the visible range minus the comma. Space is outside it because
   * `\x20` is below `\x21`.
   */
  it('is 8–128 visible ASCII with no space and no comma', () => {
    const key = newAttemptKey();
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(128);
    expect(key).not.toContain(' ');
    expect(key).not.toContain(',');
    expect(ATTEMPT_KEY_PATTERN.test(key)).toBe(true);
  });

  /**
   * THE PATTERN ITSELF IS TESTED, not only the keys it happens to pass. A
   * generator change that started emitting spaces would be caught by the case
   * above; a pattern change that started ACCEPTING them would not.
   */
  it('the pattern refuses what the server refuses', () => {
    expect(ATTEMPT_KEY_PATTERN.test('short')).toBe(false); // 5 characters
    expect(ATTEMPT_KEY_PATTERN.test('has space')).toBe(false);
    expect(ATTEMPT_KEY_PATTERN.test('has,comma')).toBe(false);
    expect(ATTEMPT_KEY_PATTERN.test('x'.repeat(129))).toBe(false);
    expect(ATTEMPT_KEY_PATTERN.test('x'.repeat(128))).toBe(true);
    expect(ATTEMPT_KEY_PATTERN.test('12345678')).toBe(true);
  });

  /**
   * TEN THOUSAND KEYS, AND THE LENGTH IS FIXED.
   *
   * The volume matters because the fallback generator is `Math.random()`, and
   * the length matters because `Math.random()` can return a value whose base-36
   * form is short — `0` gives `"0"` and the old `slice(2, 10)` would have been
   * empty. A key that shortened below 8 would be a `400 INVALID_IDEMPOTENCY_KEY`
   * in an advocate's hand, and it would happen once in a very long while, which
   * is the worst possible failure rate for a bug.
   */
  it('mints 10,000 distinct keys, every one inside the grammar', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const key = newAttemptKey();
      expect(ATTEMPT_KEY_PATTERN.test(key)).toBe(true);
      keys.add(key);
    }
    expect(keys.size).toBe(10_000);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE TEST RUNTIME IS NOT THE DEVICE RUNTIME FOR THIS QUESTION, and finding
   * that out is why this is asserted on both branches rather than pinned to a
   * value.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Jest runs on Node, and Node ≥19 exposes a WebCrypto `globalThis.crypto`, so
   * `attemptKeySecurityClass()` reads `secure` HERE. On the phone it does not:
   * React Native 0.86 installs no `crypto` global, Expo 57's winter runtime
   * (`node_modules/expo/src/winter/`) ships `TextDecoder`, `URL`, `FormData`
   * and `AbortSignal` and no crypto at all, Hermes implements no WebCrypto, and
   * `expo-crypto` is not a dependency of this app.
   *
   * So a green run of this file is NOT evidence that a shipped binary gets
   * cryptographic randomness. It gets the `Math.random()` fallback, and the
   * generator is written so that either branch produces a key inside the
   * grammar. The honest label exists so that "idempotency key" is never read as
   * "unguessable token": it is a uniqueness device, and the server's
   * `user + method + route + key` scope is the actual collision boundary.
   */
  it('reports what the runtime actually gives, on both branches', () => {
    const g = globalThis as { crypto?: unknown };
    const real = g.crypto;

    try {
      g.crypto = undefined;
      expect(attemptKeySecurityClass()).toBe('uniqueness');
      // The device branch, exercised: still a legal key with no crypto at all.
      for (let i = 0; i < 500; i += 1) {
        expect(ATTEMPT_KEY_PATTERN.test(newAttemptKey())).toBe(true);
      }

      g.crypto = { getRandomValues: (a: Uint8Array) => a.fill(7) };
      expect(attemptKeySecurityClass()).toBe('secure');
      expect(ATTEMPT_KEY_PATTERN.test(newAttemptKey())).toBe(true);
    } finally {
      g.crypto = real;
    }
  });

  /**
   * THE FALLBACK IS WHAT SHIPS, so its uniqueness is measured separately from
   * the 10,000-key sweep above — that sweep runs on Node's WebCrypto and would
   * say nothing about the branch an advocate's phone takes.
   */
  it('mints 10,000 distinct keys on the Math.random branch the device uses', () => {
    const g = globalThis as { crypto?: unknown };
    const real = g.crypto;
    try {
      g.crypto = undefined;
      const keys = new Set<string>();
      for (let i = 0; i < 10_000; i += 1) keys.add(newAttemptKey());
      expect(keys.size).toBe(10_000);
    } finally {
      g.crypto = real;
    }
  });

  it('a key is never derived from the content of the request', () => {
    // Two identical intentional mutations. Two keys. R16 §3, and the reason two
    // identical annotations under two keys are two rows by design.
    expect(newAttemptKey()).not.toBe(newAttemptKey());
  });
});

describe('Retry-After is consumed, bounded, and never invented', () => {
  it('uses the seconds the server sent', () => {
    expect(retryAfterMs(1)).toBe(1_000);
    expect(retryAfterMs(3)).toBe(3_000);
  });

  /**
   * NOT HARDCODED TO 1. Today's server sends `Retry-After: 1`; a client that
   * assumed it would be wrong the day that constant moves, and the contract
   * never promised the value.
   */
  it('honours a value other than the one the current server happens to send', () => {
    expect(retryAfterMs(4)).toBe(4_000);
  });

  it('falls back when the header is missing or unusable', () => {
    expect(retryAfterMs(undefined)).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(retryAfterMs(Number.NaN)).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(retryAfterMs(0)).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(retryAfterMs(-5)).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(retryAfterMs(Number.POSITIVE_INFINITY)).toBe(DEFAULT_RETRY_AFTER_MS);
  });

  /** A wrong header must not be able to freeze a submit button for an hour. */
  it('caps an absurd value', () => {
    expect(retryAfterMs(3_600)).toBe(MAX_RETRY_AFTER_MS);
  });
});

describe('IDEMPOTENCY_IN_PROGRESS retries with the SAME key, and is bounded', () => {
  it('reuses the key and returns the real result', async () => {
    const seen: string[] = [];
    const sleep = jest.fn(async () => {});
    const call = jest
      .fn(async (key: string) => {
        seen.push(key);
        return seen.length === 1 ? failure(IDEMPOTENCY_IN_PROGRESS, 1) : ok({ matterId: 'm1' });
      })
      .mockName('call');

    const res = await runAttempt('key-aaaaaaaa', call, { sleep });

    expect(res).toEqual(ok({ matterId: 'm1' }));
    expect(seen).toEqual(['key-aaaaaaaa', 'key-aaaaaaaa']);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('waits the bounded fallback when no Retry-After came back', async () => {
    const sleep = jest.fn(async () => {});
    let n = 0;
    await runAttempt(
      'key-bbbbbbbb',
      async () => {
        n += 1;
        return n === 1 ? failure(IDEMPOTENCY_IN_PROGRESS) : ok(null);
      },
      { sleep },
    );
    expect(sleep).toHaveBeenCalledWith(DEFAULT_RETRY_AFTER_MS);
  });

  /**
   * BOUNDED. A server stuck answering `IN_PROGRESS` must cost the advocate a
   * bounded wait and then an honest failure, never a loop — and the failure they
   * are shown is the server's own, not one this helper invented.
   */
  it('gives up after MAX_IN_PROGRESS_RETRIES and returns the last failure', async () => {
    const call = jest.fn(async () => failure(IDEMPOTENCY_IN_PROGRESS, 1));
    const res = await runAttempt('key-cccccccc', call, { sleep: async () => {} });

    expect(call).toHaveBeenCalledTimes(MAX_IN_PROGRESS_RETRIES + 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(IDEMPOTENCY_IN_PROGRESS);
  });
});

describe('the two 409s are not the same failure and are never collapsed', () => {
  /**
   * MISMATCH IS TERMINAL. It means this key was already spent on a DIFFERENT
   * request, which is a bug on this side — an attempt key reused across two
   * intentional mutations. Minting a fresh key and resubmitting would turn the
   * evidence of the bug into a duplicate write; reinterpreting it as a network
   * failure would hide it entirely.
   */
  it('MISMATCH sends exactly one request and does not retry', async () => {
    const call = jest.fn(async () => failure(IDEMPOTENCY_KEY_REUSE_MISMATCH));
    const sleep = jest.fn(async () => {});

    const res = await runAttempt('key-dddddddd', call, { sleep });

    expect(call).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(IDEMPOTENCY_KEY_REUSE_MISMATCH);
  });

  it('a malformed key is terminal too — the server did not consume it', async () => {
    const call = jest.fn(async () => failure(INVALID_IDEMPOTENCY_KEY));
    const res = await runAttempt('key-eeeeeeee', call, { sleep: async () => {} });

    expect(call).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(INVALID_IDEMPOTENCY_KEY);
  });

  /**
   * A VALIDATION FAILURE DOES NOT CONSUME THE KEY (R16 §5), so it is returned
   * unchanged and the caller may correct the request and reuse the same key.
   * Nothing here retries it: the server would reject the same bytes again.
   */
  it('an ordinary validation failure is returned once, unchanged', async () => {
    const call = jest.fn(async () => failure('INVALID_REQUEST'));
    const res = await runAttempt('key-ffffffff', call, { sleep: async () => {} });

    expect(call).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INVALID_REQUEST');
  });

  it('a transport failure is not retried here either — that is the caller’s choice', async () => {
    const call = jest.fn(async () => failure('network'));
    await runAttempt('key-gggggggg', call, { sleep: async () => {} });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('a legacy call with no key remains representable', () => {
  it('an undefined key means no header, which is the R15 path', async () => {
    // The helper is never in that path: `runAttempt` requires a key by type.
    // What is asserted is the API surface — see `client.idempotency.test.ts`.
    expect(newAttemptKey()).toBeTruthy();
  });
});
