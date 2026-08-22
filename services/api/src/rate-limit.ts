/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RATE LIMITING — WHAT IT PROTECTS, AND WHAT IT HONESTLY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three abuses this closes, in the order they cost us something real:
 *
 *   1. **Magic-link flooding.** `POST /auth/magic-link` sends an email through
 *      Resend to any address a stranger types. Unlimited, that is a free mail
 *      cannon pointed at third parties, our sending reputation, and our bill —
 *      and the endpoint deliberately answers identically for known and unknown
 *      addresses, so there is nothing else slowing it down.
 *   2. **Credential grinding** on `/auth/verify` and `/auth/refresh`.
 *   3. **Research load.** `search/admission.ts` already caps CONCURRENCY, which
 *      protects the database. It does nothing about one client issuing a
 *      thousand cheap-but-serial searches, which is what a scraper looks like.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IN-PROCESS, AND SAYING SO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The counters live in this process's memory. That is exactly right for the
 * current deployment — one API process against a local Postgres — and it is
 * WRONG the moment a second instance exists, because each would enforce its own
 * copy of the limit and the effective limit would be N times what this file
 * says.
 *
 * Recorded here rather than discovered later: **if this API is ever run with
 * more than one instance, these limits must move to a shared store** (Postgres
 * is sufficient at this volume — a table keyed by bucket with an atomic
 * upsert). Nothing else in the file needs to change; `hit()` is the only place
 * that touches state.
 *
 * A database-backed limiter was not built today because it would add a write to
 * every authentication request in order to solve a problem this deployment does
 * not have, and the ponytail ladder is explicit about that trade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SLIDING WINDOW AND NOT A FIXED ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A fixed window lets a caller spend the whole allowance at 11:59:59 and the
 * whole next allowance at 12:00:00 — twice the limit in one second, which for
 * magic-link mail is the entire abuse. Timestamps are kept per bucket and aged
 * out; at these limits (single digits to tens) the array is tiny.
 */
import type { Context, Next } from 'hono';

import { fail } from './envelope.ts';
import { logger } from './logger.ts';

export type RateLimitRule = {
  /** Human name, used in logs and in the 429 body. */
  name: string;
  limit: number;
  windowMs: number;
  /**
   * What counts as "one caller" for this rule. **Null means the rule does not
   * apply to this request** — see {@link callerIdentity} for why that is a
   * deliberate outcome and not a failure to compute a key.
   */
  key: (c: Context) => string | null | Promise<string | null>;
};

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

/**
 * Buckets are dropped once they are empty, so memory is bounded by the number
 * of DISTINCT callers seen within one window rather than by all callers ever.
 * Swept opportunistically on write rather than on a timer — a timer would keep
 * the process alive during shutdown for no benefit.
 */
let lastSweep = 0;
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.hits.length === 0 || b.hits[b.hits.length - 1]! < now - 3_600_000) buckets.delete(k);
  }
}

export function hit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  sweep(now);
  const bucket = buckets.get(key) ?? { hits: [] };
  const cutoff = now - windowMs;
  // Hits are appended in time order, so dropping the expired prefix is a splice
  // rather than a filter.
  let drop = 0;
  while (drop < bucket.hits.length && bucket.hits[drop]! <= cutoff) drop++;
  if (drop > 0) bucket.hits.splice(0, drop);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + windowMs - now) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterMs: 0 };
}

/**
 * The caller's address, as well as it can be known.
 *
 * `x-forwarded-for` is client-supplied and trivially spoofed, which matters for
 * an IP-keyed limit: a determined abuser rotates the header and gets a fresh
 * bucket every request. It is used anyway, because the alternative — no key at
 * all — makes every caller share one bucket and turns the limiter into a
 * self-inflicted outage. The limits that actually protect something expensive
 * are keyed on the EMAIL or on the authenticated identity, neither of which can
 * be rotated freely.
 *
 * Behind a proxy that overwrites the header (which is the correct configuration
 * and the one production should have), the first value is trustworthy.
 */
export function callerAddress(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return c.req.header('x-real-ip') ?? 'unknown';
}

/**
 * Authenticated identity, or the address, or NULL when there is neither.
 *
 * **Null is the important case and it returns null on purpose.** The first
 * version of this fell back to the literal string `ip:unknown`, which put every
 * unidentifiable caller into ONE shared bucket — so 60 requests from anybody
 * locked out everybody else who was signed out, on a route that deliberately
 * works signed out. That is a self-inflicted outage, and it showed up
 * immediately: the round measurement's own sixth query class came back 429
 * because the previous five had spent the shared allowance.
 *
 * A shared bucket is also poor protection. `x-forwarded-for` is client-supplied,
 * so an abuser rotates it and gets a fresh bucket per request while the honest
 * anonymous users queue behind each other in the one bucket nobody can escape.
 *
 * So when we cannot tell callers apart, per-caller limiting is SKIPPED and the
 * protection falls to the mechanisms that do not need identity: the admission
 * gate's concurrency cap and `statement_timeout`. In production the API sits
 * behind a proxy that sets `x-forwarded-for`, so this path is a deployment
 * property to check rather than the normal case — recorded in `DEPLOYMENT.md`
 * rather than assumed.
 */
export function callerIdentity(c: Context): string | null {
  const authId = c.get('authId');
  if (authId) return authId;
  const address = callerAddress(c);
  return address === 'unknown' ? null : `ip:${address}`;
}

export function rateLimit(rule: RateLimitRule) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const subject = await rule.key(c);
    if (subject === null) {
      // No way to tell this caller from any other. Limiting them together is
      // worse than not limiting them at all — see `callerIdentity`.
      await next();
      return;
    }
    const key = `${rule.name}:${subject}`;
    const result = hit(key, rule.limit, rule.windowMs);
    if (!result.allowed) {
      const retryAfter = Math.ceil(result.retryAfterMs / 1000);
      logger.warn(
        { request_id: c.get('requestId'), rule: rule.name, path: c.req.path, retry_after: retryAfter },
        'rate limit exceeded',
      );
      c.header('Retry-After', String(Math.max(1, retryAfter)));
      return fail(
        c,
        'RATE_LIMITED',
        'Too many requests. Please wait a moment and try again.',
        429,
      );
    }
    await next();
  };
}

/**
 * The limits, in one place so they can be read as a policy rather than hunted
 * for across the router.
 *
 * Numbers chosen against real use, not against a benchmark: an advocate signing
 * in asks for at most two or three links (the first goes to spam, the second is
 * opened on the wrong device); an advocate researching runs a search every few
 * seconds at most while reading results.
 */
export const RATE_LIMITS = {
  /** Per EMAIL — the address the mail would be sent to, which is what is abused. */
  magicLinkPerEmail: { limit: 5, windowMs: 15 * 60_000 },
  /** Per address — stops one client enumerating many addresses. */
  magicLinkPerAddress: { limit: 20, windowMs: 60 * 60_000 },
  /** Token exchange and refresh: generous for humans, hostile to grinding. */
  authPerAddress: { limit: 60, windowMs: 5 * 60_000 },
  /** Research. Concurrency is capped separately in `search/admission.ts`. */
  researchPerIdentity: { limit: 60, windowMs: 60_000 },
} as const;

/** Exposed for tests only — never called by the server. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}

/**
 * The caller's address, or null when nothing has told us one.
 *
 * The address-keyed rules use this rather than {@link callerAddress} for the
 * same reason {@link callerIdentity} returns null: one bucket shared by every
 * unidentifiable caller is an outage for honest users and no obstacle to an
 * abuser.
 */
export function knownAddress(c: Context): string | null {
  const address = callerAddress(c);
  return address === 'unknown' ? null : address;
}
