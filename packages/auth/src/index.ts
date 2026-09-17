/**
 * Authentication. better-auth self-hosted, magic link by email, JWT access token
 * plus a rotating refresh — `sprints/SPRINT_5.md`, `TRD.md` §Auth.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDENTITY AND PROFILE ARE TWO DIFFERENT THINGS, AND THAT IS WHY `auth_id` EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `users.full_name` and `users.phone` are NOT NULL. A magic link carries an email
 * address and nothing else. Those two facts cannot both be satisfied at the
 * moment a link is verified, and the temptation is to loosen the columns or
 * invent a placeholder name — both of which put a row in the database that
 * asserts something nobody said.
 *
 * They are not in conflict. They describe two stages:
 *
 *   `auth_user` is IDENTITY  — this email address was proven to be reachable.
 *   `users`     is PROFILE   — this is an advocate, with a name, a phone number
 *                              and possibly an enrolment number.
 *
 * Verification creates the first. Onboarding creates the second, which is exactly
 * where `SPRINT_5.md` §RCC puts identity and enrolment capture. `GET /me` reports
 * `profileComplete: false` in between, and that state is **visible rather than
 * papered over**: an account with an identity and no profile is a real thing that
 * happens whenever someone abandons onboarding halfway.
 *
 * `users.auth_id` is the join. It was in the schema from S0 for this reason.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PD-2 — ENROLMENT NEVER GATES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing in this package reads `enrolment_status`. Not to grant, not to deny,
 * not to warn. A **rejected** enrolment has exactly the access a verified one
 * does, and `auth.test.ts` asserts it rather than trusting this comment — the
 * sprint requires a test because a comment is not enforcement, and "verified
 * users only" is the single most likely well-meaning change to quietly invert it.
 *
 * The one thing consent gates is draft generation (PD-8), and that is checked
 * where drafts are generated, not here.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

import type { Mailer } from './mail.ts';
import { authAccount, authSession, authUser, authVerification } from './schema.ts';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiry,
  signAccessToken,
} from './tokens.ts';

export * from './mail.ts';
export * from './schema.ts';
export * from './tokens.ts';

/** How long a magic link stays usable. Stated in the email, not implied. */
export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE A SIGN-IN LINK LANDS — AND WHY IT IS NOT better-auth'S OWN PATH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The magic link is the ONLY credential in this product. Until 18 Sep 2026 the
 * emailed link was whatever better-auth's magicLink plugin minted by default —
 * `<baseURL><basePath>/magic-link/verify`, which for a bare origin is
 * `/api/auth/magic-link/verify`. This API mounts no better-auth HTTP handler, so
 * every emailed link resolved to our own 404 and nobody could sign in at all
 * (observed on a physical device, `docs/ai/rcc-r31/ROUND.md`).
 *
 * **The repair is NOT to mount better-auth's handler at that path.** Its
 * `magicLinkVerify` endpoint CONSUMES the verification value and sets a browser
 * session cookie (`node_modules/better-auth/dist/plugins/magic-link/index.mjs` —
 * `consumeVerificationValue` then `setSessionCookie`). A cookie in the mail
 * app's browser is not a session in the Expo client, and the token is single-use,
 * so letting the browser reach that endpoint would spend the credential on a
 * surface that cannot hold it. The link would stop 404ing and sign-in would still
 * be impossible — a worse failure, because it would look fixed.
 *
 * The contract that DOES work, and has since S5, is the one the client already
 * implements (`apps/mobile/app/auth/verify.tsx`): the raw token reaches the app,
 * the app posts it to `POST /auth/verify`, and THAT calls
 * `auth.api.magicLinkVerify` — canonical better-auth validation, one use,
 * fifteen minutes, on the server where the session actually lives.
 *
 * So the email carries an `https` URL on this API — it must be `https`, because
 * a mail client will not linkify `lawmind://` — and that URL's only job is to
 * hand the token, UNSPENT, to the app's deep link.
 *
 * **Both ends of that handoff are these three exports.** The path is minted here
 * and mounted from here (`services/api/src/app.ts`), so the email and the route
 * cannot drift apart again — drifting apart is exactly what happened, and it was
 * invisible until a real advocate tapped a real link.
 */
export const MAGIC_LINK_LANDING_PATH = '/auth/magic-link/open';

/**
 * The app route that consumes the token. A CONSTANT, never derived from the
 * request: a landing route that redirects wherever a query parameter says is an
 * open redirect carrying a live credential. better-auth's own `callbackURL` is
 * deliberately not honoured here for that reason — there is one destination.
 */
export const MAGIC_LINK_APP_URL = 'lawmind://auth/verify';

/** The exact URL that goes in the email. */
export function magicLinkLandingUrl(baseUrl: string, token: string): string {
  // Appended rather than resolved: `new URL(path, base)` would discard a base
  // that carries a path prefix, and this must survive one.
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${MAGIC_LINK_LANDING_PATH}`);
  url.searchParams.set('token', token);
  return url.toString();
}

/** The deep link the landing route redirects to. */
export function magicLinkAppUrl(token: string): string {
  return `${MAGIC_LINK_APP_URL}?token=${encodeURIComponent(token)}`;
}

export type AuthConfig = {
  sql: Sql;
  /** Signs access tokens and better-auth's own state. Never in the repo. */
  secret: string;
  /**
   * The public `https` origin of THIS API — the host that appears in the sign-in
   * email and serves `MAGIC_LINK_LANDING_PATH`. It is not the app, and it is not
   * a screen: it is the one origin that can hand a token to the deep link.
   */
  baseUrl: string;
  mailer: Mailer;
};

export function createAuth(config: AuthConfig) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseUrl,
    database: drizzleAdapter(drizzle(config.sql), {
      provider: 'pg',
      // better-auth keeps its model names; the database gets names that say
      // where the tables came from. See schema.ts.
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    // No password anywhere in this product. The only credential is a link sent
    // to an address the advocate already controls — which also means there is no
    // password to reuse, leak, or reset.
    emailAndPassword: { enabled: false },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        // PD-1: the identifier is whatever the advocate enters. Signup is not
        // gated on matching a Bar Council roll — rolls carry stale contact
        // details, and gating here blocks legitimate users before they have seen
        // any value at all.
        disableSignUp: false,
        // `url` is also offered and is deliberately NOT used: it is
        // better-auth's own `/api/auth/magic-link/verify`, which this API does
        // not serve and must not. See MAGIC_LINK_LANDING_PATH above.
        sendMagicLink: async ({ email, token }) => {
          await config.mailer.send({
            to: email,
            url: magicLinkLandingUrl(config.baseUrl, token),
            expiresInMinutes: MAGIC_LINK_TTL_SECONDS / 60,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

/**
 * Mint a fresh pair for a proven identity.
 *
 * The refresh token is returned to the caller once, here, and never again —
 * only its hash is stored.
 */
export async function issueTokens(
  sql: Sql,
  user: { id: string; email: string },
  secret: string,
  now: Date = new Date(),
): Promise<TokenPair> {
  const accessToken = await signAccessToken({ sub: user.id, email: user.email }, secret, now);
  const refreshToken = generateRefreshToken();

  await sql`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, ${hashRefreshToken(refreshToken)},
            ${refreshExpiry(now).toISOString()}::timestamptz)
  `;

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export type RefreshOutcome =
  { ok: true; tokens: TokenPair } | { ok: false; reason: 'unknown' | 'expired' | 'reused' };

/**
 * Rotate a refresh token.
 *
 * **A token presented twice revokes the whole family.** Once a token has been
 * rotated it is dead; seeing it again means it was captured and replayed, or the
 * client is buggy. Both are answered by ending every session for that advocate
 * and making them sign in — the alternative is letting whoever holds the stolen
 * token keep renewing it indefinitely, silently, alongside the real user.
 *
 * `unknown` and `expired` are kept apart internally because they mean different
 * things to us. The caller collapses both to one message, because they mean the
 * same thing to the advocate: sign in again.
 */
export async function rotateRefreshToken(
  sql: Sql,
  presented: string,
  secret: string,
  now: Date = new Date(),
): Promise<RefreshOutcome> {
  const hash = hashRefreshToken(presented);

  /**
   * **Expiry and revocation are decided in SQL, not in JavaScript.**
   *
   * The obvious version of this read `expires_at` and called `.getTime()` on it,
   * which assumes the driver hands back a `Date`. It does not always, and
   * production answered `row.expires_at.getTime is not a function` on the first
   * real refresh — while the same code passed against the same driver locally.
   *
   * That is the second time in one day that assuming a timestamp's runtime
   * representation has cost a production failure. Postgres knows whether a
   * timestamp is in the past; asking it removes the assumption rather than
   * handling it. Nothing here needs the value, only the answer.
   */
  const [row] = await sql<{ id: string; user_id: string; expired: boolean; revoked: boolean }[]>`
    SELECT id, user_id,
           (expires_at <= now())   AS expired,
           (revoked_at IS NOT NULL) AS revoked
    FROM refresh_tokens WHERE token_hash = ${hash}
  `;
  if (!row) return { ok: false, reason: 'unknown' };

  if (row.revoked) {
    // Replay. Everything this advocate holds goes, not just this token — the
    // attacker's copy and the real client's copy are indistinguishable from here.
    await sql`
      UPDATE refresh_tokens SET revoked_at = ${now.toISOString()}::timestamptz
      WHERE user_id = ${row.user_id} AND revoked_at IS NULL
    `;
    return { ok: false, reason: 'reused' };
  }

  if (row.expired) return { ok: false, reason: 'expired' };

  const [user] = await sql<{ id: string; email: string }[]>`
    SELECT id, email FROM auth_user WHERE id = ${row.user_id}
  `;
  if (!user) return { ok: false, reason: 'unknown' };

  const tokens = await issueTokens(sql, { id: user.id, email: user.email }, secret, now);

  // Revoke the parent only after the successor exists. The other order leaves a
  // client that crashes mid-refresh holding nothing at all.
  await sql`
    UPDATE refresh_tokens
       SET revoked_at = ${now.toISOString()}::timestamptz, replaced_by = ${hashRefreshToken(tokens.refreshToken)}
     WHERE id = ${row.id}
  `;

  return { ok: true, tokens };
}

/**
 * Sign out. Revokes every live refresh token for the advocate.
 *
 * Deliberately not just the presented one: "log me out" on a lost phone must mean
 * every session, or the control does not do what its name says.
 */
export async function revokeAllRefreshTokens(
  sql: Sql,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const revoked = await sql<{ id: string }[]>`
    UPDATE refresh_tokens SET revoked_at = ${now.toISOString()}::timestamptz
    WHERE user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  return revoked.length;
}
