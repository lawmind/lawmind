/**
 * The auth endpoints, to `docs/API_CONTRACTS.md` §Auth.
 *
 * **What each of these must never do, in one place:**
 *
 * `POST /auth/magic-link` **always answers the same way**, whether or not the
 * address belongs to an account. Answering differently turns the endpoint into a
 * membership oracle — anyone could ask it which advocates use Lawmind, and for
 * this customer base that is a client list. It also never reports a send that did
 * not happen: if the provider rejects the message, this fails, because "check
 * your email" for an email that was never sent strands someone in a state they
 * cannot escape or diagnose.
 *
 * `POST /auth/verify` consumes the link. better-auth owns the token lifecycle —
 * single use, 15 minutes — and we mint the token pair once it has proven the
 * address.
 *
 * `POST /auth/refresh` rotates, and a replayed token revokes the whole family.
 *
 * **PD-2 — nothing here reads `enrolment_status`.** Not to grant, not to deny,
 * not to warn. A rejected enrolment has exactly the access a verified one has.
 * `auth.test.ts` asserts it.
 */
import { type Auth, issueTokens, rotateRefreshToken, revokeAllRefreshTokens } from '@lawmind/auth';
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { logger } from '../logger.ts';
import { decideSignup } from './signup-gate.ts';

export const magicLinkRequest = z.object({
  email: z.string().email().max(320),
});

export const verifyRequest = z.object({
  token: z.string().min(1).max(512),
});

export const refreshRequest = z.object({
  refreshToken: z.string().min(1).max(512),
});

export type AuthDeps = {
  auth: Auth;
  /**
   * The USER role, and only ever that.
   *
   * Every table this file and its neighbours touch — `users`, `auth_user`,
   * `auth_session`, `auth_account`, `auth_verification`, `refresh_tokens`,
   * `data_requests` — is user-owned (`ops/db-roles.ts`). It was wired to the
   * CORPUS handle at the composition root until R28, which is invisible on one
   * database and means nobody can sign in on two.
   */
  sql: Sql;
  secret: string;
};

/**
 * The profile, or an honest statement that there is not one yet.
 *
 * An identity with no profile is a real state — somebody verified their email and
 * closed the app during onboarding — and `profileComplete` says so rather than
 * returning a half-populated user that looks like a whole one.
 */
async function profileFor(sql: Sql, authId: string) {
  const [row] = await sql<
    {
      id: string;
      full_name: string;
      phone: string;
      email: string;
      bar_enrolment_number: string | null;
      enrolment_status: string;
      preferred_language: string;
      subscription_tier: string;
      terms_accepted_at: string | null;
      terms_version: string | null;
      expo_push_token: string | null;
    }[]
  >`
    SELECT id, full_name, phone, email, bar_enrolment_number, enrolment_status,
           preferred_language, subscription_tier, expo_push_token,
           ${sql.unsafe(isoColumn('terms_accepted_at'))} AS terms_accepted_at, terms_version
    FROM users WHERE auth_id = ${authId}
  `;
  if (!row) return null;
  return {
    userId: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    barEnrolmentNumber: row.bar_enrolment_number,
    /**
     * Reported so the client can show "verification pending" as a credential
     * note. **It gates nothing** (PD-2) and the client must not treat it as a
     * permission — `rejected` and `verified` grant identical access.
     */
    enrolmentStatus: row.enrolment_status,
    preferredLanguage: row.preferred_language,
    subscriptionTier: row.subscription_tier,
    /** A boolean, never the token — it is a device secret. */
    pushRegistered: row.expo_push_token !== null,
    termsAcceptedAt: row.terms_accepted_at,
    termsVersion: row.terms_version,
  };
}

export async function handleMagicLink(
  c: Context,
  deps: AuthDeps,
  body: z.infer<typeof magicLinkRequest>,
): Promise<Response> {
  /**
   * THE `signups` KILL SWITCH, WHICH UNTIL NOW CONTROLLED NOTHING.
   *
   * `auth/signup-gate.ts` holds the reasoning. In short: closed means no NEW
   * identity, never "nobody may sign in" — an address that already exists always
   * gets its link, so closing signups after Wave 2 cannot lock out the cohort
   * that joined during it.
   *
   * The refusal is SILENT and returns below through the same
   * `ok(c, { sent: true })` a successful send does. That is not sloppiness: the
   * uniform response is already this endpoint's contract for known versus unknown
   * addresses, and a refusal that announced itself would let anyone enumerate a
   * list of named practising advocates one address at a time.
   *
   * Placed before `signInMagicLink`, so a refused signup sends no mail and mints
   * no verification row — rather than letting better-auth create the identity and
   * then regretting it.
   */
  const decision = await decideSignup(deps.sql, body.email);
  if (!decision.allow) {
    logger.info(
      { request_id: c.get('requestId'), event: 'signup_refused', reason: decision.reason },
      'magic link withheld: signups are closed to new identities',
    );
    return ok(c, { sent: true });
  }

  try {
    await deps.auth.api.signInMagicLink({
      body: { email: body.email },
      // better-auth requires them; it reads IP and user-agent for its own rate
      // limiting, which is a control we want rather than one to stub out.
      headers: c.req.raw.headers,
    });
  } catch (error) {
    // A provider failure is OUR failure and is reported as one. The uniform
    // response above protects account existence; it must not also hide an outage,
    // or every advocate waits for an email nobody knows was never sent.
    logger.error({ request_id: c.get('requestId'), err: error }, 'magic link could not be sent');
    return fail(
      c,
      'MAIL_UNAVAILABLE',
      'we could not send the sign-in link just now. Please try again in a moment.',
      503,
    );
  }

  // Identical for a known and an unknown address, deliberately. See the header.
  return ok(c, { sent: true });
}

export async function handleVerify(
  c: Context,
  deps: AuthDeps,
  body: z.infer<typeof verifyRequest>,
): Promise<Response> {
  let email: string;
  let authId: string;
  try {
    const result = await deps.auth.api.magicLinkVerify({
      query: { token: body.token },
      headers: c.req.raw.headers,
      asResponse: false,
    });
    const user = (result as { user?: { id?: unknown; email?: unknown } } | null)?.user;
    if (typeof user?.id !== 'string' || typeof user.email !== 'string') {
      return fail(c, 'LINK_INVALID', 'this sign-in link is no longer valid', 401);
    }
    authId = user.id;
    email = user.email;
  } catch {
    // Expired, already used, and never issued are one message on purpose: the
    // advocate's next action is the same in all three, and distinguishing them
    // tells an attacker which tokens existed.
    return fail(c, 'LINK_INVALID', 'this sign-in link is no longer valid', 401);
  }

  const tokens = await issueTokens(deps.sql, { id: authId, email }, deps.secret);
  const profile = await profileFor(deps.sql, authId);

  return ok(c, {
    ...tokens,
    user: { authId, email, profileComplete: profile !== null, profile },
  });
}

export async function handleRefresh(
  c: Context,
  deps: AuthDeps,
  body: z.infer<typeof refreshRequest>,
): Promise<Response> {
  const outcome = await rotateRefreshToken(deps.sql, body.refreshToken, deps.secret);
  if (!outcome.ok) {
    if (outcome.reason === 'reused') {
      logger.warn(
        { request_id: c.get('requestId') },
        'refresh token replayed — every session for that account was revoked',
      );
    }
    // One message for all three reasons. The advocate's action is identical.
    return fail(c, 'REFRESH_INVALID', 'please sign in again', 401);
  }
  return ok(c, outcome.tokens);
}

export async function handleLogout(
  c: Context,
  deps: AuthDeps,
  authId: string | undefined,
): Promise<Response> {
  // Logging out without being logged in is not an error — it is the state the
  // caller asked for, and returning 401 here makes clients retry something that
  // already succeeded.
  if (!authId) return ok(c, { ok: true, sessionsRevoked: 0 });
  const revoked = await revokeAllRefreshTokens(deps.sql, authId);
  return ok(c, { ok: true, sessionsRevoked: revoked });
}

export async function handleMe(
  c: Context,
  deps: AuthDeps,
  authId: string | undefined,
  email: string | undefined,
): Promise<Response> {
  if (!authId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  const profile = await profileFor(deps.sql, authId);
  return ok(c, {
    user: { authId, email: email ?? null, profileComplete: profile !== null, profile },
  });
}
