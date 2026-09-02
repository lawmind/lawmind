import type { ApiResponse } from './contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE INTENTIONAL MUTATION, ONE KEY. THE ATTEMPT IS WHAT IS NAMED, NOT THE ROW.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Contract R16, `docs/product/RCC_V1_API_CONTRACT_R16_AMENDMENT.md`. NEW3 bus
 * 1703 authorises this client to implement and test it; `R16_RELEASED = NO`
 * still holds, so nothing in the product may PROMISE duplicate-safe writes. A
 * build may carry the code and may not carry the claim.
 *
 * THE BUG THIS ANSWERS is not "the same note twice". An advocate saves an
 * annotation in a court basement, the row commits, the response never gets back,
 * and the app retries — correctly, because from where it is standing nothing
 * happened. Two permanent rows. Six current-v1 creates have that shape.
 *
 * THREE RULES, AND THEY ARE THE WHOLE DESIGN:
 *
 *   one intentional mutation   →  ONE key
 *   the same logical retry     →  the SAME key
 *   a new intentional mutation →  a NEW key, even when every field is identical
 *
 * A KEY IS NEVER DERIVED FROM CONTENT. R16 §3 forbids it by name and the reason
 * is a product one: two identical annotations under two keys are two intentional
 * writes, and the same citation copied a week apart is two events an advocate
 * may need warning about twice. Content deduplication would silently destroy the
 * second one.
 *
 * THE KEY IS OWNED BY THE CALLER, NOT BY THIS MODULE AND NOT BY `client.ts`.
 * Minting inside the API helper would give every call its own key, which is the
 * one arrangement that makes the mechanism useless: a retry would present a new
 * key and execute a second mutation. The logical attempt is the only thing that
 * knows when it began and when it ended, so the logical attempt holds the key.
 */

/**
 * The server's grammar, mirrored: 8–128 visible ASCII, no space, no comma.
 *
 * Copied deliberately rather than imported — `services/api/src/idempotency.ts`
 * is another lane's file and this app does not compile against it. It is
 * asserted against the server's own stated rule in `attempt.test.ts`, so a
 * divergence is a failing test rather than a `400 INVALID_IDEMPOTENCY_KEY` in an
 * advocate's hand.
 *
 * `\x21-\x2b` then `\x2d-\x7e` is the visible range with the comma (`\x2c`)
 * removed: `Headers.get()` joins repeated headers with `", "`, so a value
 * carrying one is either two keys or a character that cannot survive the round
 * trip, and the server refuses both.
 */
export const ATTEMPT_KEY_PATTERN = /^[\x21-\x2b\x2d-\x7e]{8,128}$/;

/** The header, spelled once on this side too. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Someone else is executing this exact attempt. Retryable, with the SAME key. */
export const IDEMPOTENCY_IN_PROGRESS = 'IDEMPOTENCY_IN_PROGRESS';
/** This key was already spent on a DIFFERENT request. A client bug. Terminal. */
export const IDEMPOTENCY_KEY_REUSE_MISMATCH = 'IDEMPOTENCY_KEY_REUSE_MISMATCH';
/** The key itself was malformed. Terminal, and the key is NOT consumed. */
export const INVALID_IDEMPOTENCY_KEY = 'INVALID_IDEMPOTENCY_KEY';

/**
 * WHAT THE RANDOMNESS ACTUALLY IS, REPORTED RATHER THAN ASSERTED.
 *
 * `secure` means the runtime handed us `crypto.getRandomValues`. `uniqueness`
 * means it did not, and the key is a timestamp plus `Math.random()` — enough to
 * make two taps distinct, and NOT a cryptographic guarantee. Measured on this
 * workspace 2 September 2026: React Native 0.86 installs no `crypto` global and
 * Expo 57's winter runtime (`node_modules/expo/src/winter/`) ships
 * `TextDecoder`, `URL`, `FormData` and `AbortSignal` and no crypto at all;
 * `expo-crypto` is not a dependency of this app. So this reads `uniqueness`
 * here, today.
 *
 * IT IS NOT WORTH A NEW DEPENDENCY. The collision boundary is the server's, not
 * ours: a record is scoped by `user id + method + route + key`, so a key would
 * have to collide with ANOTHER KEY OF THE SAME ADVOCATE ON THE SAME ROUTE to do
 * damage, and the millisecond component makes that impossible outside a single
 * millisecond. The honest label is here so that nobody later reads "idempotency
 * key" and infers an unguessable token — it is not one, and it does not need to
 * be.
 */
export type AttemptKeySecurityClass = 'secure' | 'uniqueness';

type RandomSource = { getRandomValues?: (a: Uint8Array) => Uint8Array };

function randomSource(): RandomSource | undefined {
  const g = globalThis as { crypto?: RandomSource };
  return typeof g.crypto?.getRandomValues === 'function' ? g.crypto : undefined;
}

/** What the CURRENT runtime gives. A function, not a constant: Jest and a device may differ. */
export function attemptKeySecurityClass(): AttemptKeySecurityClass {
  return randomSource() ? 'secure' : 'uniqueness';
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 8 characters of base-36, padded so the key's LENGTH never depends on the draw. */
function randomRun(): string {
  const secure = randomSource();
  if (secure) {
    const bytes = secure.getRandomValues!(new Uint8Array(8));
    let out = '';
    for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
    return out;
  }
  /*
    `Math.random().toString(36).slice(2, 10)` is `newClientKey`'s mechanism and
    it is padded here rather than copied verbatim: `Math.random()` can return a
    value whose base-36 form is short (0 gives `"0"`, and the slice is then
    empty), which would shorten the key. Two draws and a pad make the length
    fixed, so the 8–128 grammar can never be violated by an unlucky number.
  */
  const draw = () => Math.random().toString(36).slice(2);
  return `${draw()}${draw()}`.padEnd(8, '0').slice(0, 8);
}

/**
 * A key for ONE intentional mutation.
 *
 * `<base36 millisecond>-<8 random>-<8 random>`: 26 characters, well inside the
 * grammar, and two keys minted in the same millisecond still differ in 16
 * random characters. The timestamp is not for the server — it never parses this
 * — it is so a key found in a persisted record can be aged by eye.
 */
export function newAttemptKey(): string {
  return `${Date.now().toString(36)}-${randomRun()}-${randomRun()}`;
}

/**
 * THE BOUNDED IN-PROGRESS RETRY.
 *
 * `409 IDEMPOTENCY_IN_PROGRESS` means a follower could not wait for the executor
 * inside the server's own budget (`IDEMPOTENCY_WAIT_BUDGET_MS`, 2 s). It created
 * nothing, and the retry collects the real result — so it is retried, WITH THE
 * SAME KEY, because a new key would execute a second mutation and that is
 * precisely the outcome the mechanism exists to prevent.
 *
 * `409 IDEMPOTENCY_KEY_REUSE_MISMATCH` is the opposite and must never be
 * collapsed into it: the key was already spent on a different request, nothing
 * mutated, and no retry can make it succeed. It is evidence of a bug on THIS
 * side — an attempt key reused across two different intentional mutations — and
 * it is returned to the caller as the terminal failure it is.
 */
export const MAX_IN_PROGRESS_RETRIES = 2;

/**
 * The wait when the server's `Retry-After` is absent or unusable.
 *
 * Bounded at both ends and deliberately not "whatever the header said": the
 * current server emits `1`, but hardcoding 1 would bake today's server constant
 * into a shipped binary, and trusting an arbitrary value would let a wrong
 * header freeze a submit button for an hour. One second is the floor the server
 * itself asks for; five is the ceiling this client will honour.
 */
export const DEFAULT_RETRY_AFTER_MS = 1_000;
export const MAX_RETRY_AFTER_MS = 5_000;

/**
 * `Retry-After` as MILLISECONDS, bounded.
 *
 * The delay-seconds form only. HTTP also permits an HTTP-date, which this server
 * does not send and which would need a clock this client cannot trust against a
 * device whose time may be days out; an unparseable value falls back rather than
 * being guessed at.
 */
export function retryAfterMs(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_RETRY_AFTER_MS;
  }
  return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs one logical attempt, retrying ONLY `IDEMPOTENCY_IN_PROGRESS`, only with
 * the same key, and only a bounded number of times.
 *
 * `call` RECEIVES the key rather than closing over it, so that reuse is the only
 * thing the signature lets it do — a retry cannot accidentally present a
 * different key.
 *
 * `sleep` is injected for the tests. Nothing in the app supplies it.
 */
export async function runAttempt<T>(
  key: string,
  call: (attemptKey: string) => Promise<ApiResponse<T>>,
  options?: { sleep?: (ms: number) => Promise<void>; maxRetries?: number },
): Promise<ApiResponse<T>> {
  const sleep = options?.sleep ?? wait;
  const maxRetries = options?.maxRetries ?? MAX_IN_PROGRESS_RETRIES;

  let retries = 0;
  for (;;) {
    const res = await call(key);
    if (res.ok) return res;
    if (res.error.code !== IDEMPOTENCY_IN_PROGRESS) return res;
    if (retries >= maxRetries) return res;
    retries += 1;
    await sleep(retryAfterMs(res.error.retryAfterSeconds));
  }
}
