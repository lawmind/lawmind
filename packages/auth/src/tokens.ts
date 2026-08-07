/**
 * The token pair. `SPRINT_5.md`: JWT plus a rotating refresh, 30-day sliding
 * window.
 *
 * **Two different kinds of token on purpose.**
 *
 * The access token is a short-lived signed JWT, so the common case — an advocate
 * scrolling a judgment — costs no database round trip. Fifteen minutes is short
 * enough that a leaked one is nearly worthless and long enough that nobody
 * notices the refresh.
 *
 * The refresh token is **opaque and stored only as a SHA-256 hash**. It is not a
 * JWT because it must be revocable, and a stateless token cannot be withdrawn. A
 * table of readable refresh tokens is a table whose leak is a working login for
 * every advocate in it; a table of hashes is not.
 *
 * **Rotation with reuse detection.** Every refresh mints a successor and revokes
 * its parent. Presenting an already-used token means one of two things — it was
 * stolen and replayed, or the client is buggy — and both get the same answer:
 * revoke the entire family and make them sign in again. Signing in again is a
 * small cost; an attacker holding a refresh token indefinitely is not.
 *
 * HS256 rather than RS256 because one service signs and the same service
 * verifies. Asymmetric keys buy nothing until something else needs to verify
 * without being able to sign.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const ISSUER = 'lawmind';

/** What rides inside the access token. Identity only — never a permission. */
export type AccessClaims = {
  /** The `auth_user.id`. `users.auth_id` joins the profile to it. */
  sub: string;
  email: string;
};

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: AccessClaims,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key(secret));
}

/**
 * Verify, or return null.
 *
 * **Null for every failure, with no detail about which.** Expired, forged,
 * wrong issuer and malformed all look identical to the caller, because telling an
 * unauthenticated caller *why* their token failed helps an attacker far more than
 * it helps a client — the client's answer is the same in every case: refresh.
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER });
    if (typeof payload.sub !== 'string' || typeof payload['email'] !== 'string') return null;
    return { sub: payload.sub, email: payload['email'] };
  } catch {
    return null;
  }
}

/** 256 bits from the CSPRNG. Never `Math.random`, never a uuid. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of two hashes.
 *
 * The lookup is by hash so this is belt and braces, but a token comparison that
 * short-circuits on the first differing byte is the textbook timing oracle and it
 * costs nothing to not write one.
 */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function refreshExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
