/**
 * Who is calling, if anyone.
 *
 * **This middleware never rejects.** It reads the bearer token, and on success
 * puts the identity on the context; on failure it puts nothing there and lets the
 * request continue. Rejection belongs to the route, because the routes disagree
 * about whether they need a user: `POST /search` works signed out, `GET /me` does
 * not, and `POST /auth/logout` succeeds either way.
 *
 * A middleware that 401s centrally would have to carry a list of exempt paths,
 * and a path list is the kind of thing that silently gains an entry. Each route
 * already states its own requirement, in words that say why.
 *
 * **Nothing here reads `enrolment_status` or subscription tier.** Identity is not
 * permission. PD-2: a rejected enrolment has full access, and the way to keep
 * that true is for the authentication layer never to learn what an enrolment is.
 */
import { verifyAccessToken } from '@lawmind/auth';
import type { Context, Next } from 'hono';
import type { Sql } from 'postgres';

import { fail } from '../envelope.ts';

declare module 'hono' {
  interface ContextVariableMap {
    /** `auth_user.id`. Join to a profile through `users.auth_id`. */
    authId: string | undefined;
    authEmail: string | undefined;
  }
}

export function authMiddleware(secret: string) {
  return async (c: Context, next: Next): Promise<void> => {
    const header = c.req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      const claims = await verifyAccessToken(header.slice('Bearer '.length).trim(), secret);
      if (claims) {
        c.set('authId', claims.sub);
        c.set('authEmail', claims.email);
      }
    }
    await next();
  };
}

/**
 * The `users.id` for the caller, or undefined.
 *
 * The rest of the service is written against a **profile** id — annotations,
 * saved searches and Tier 3 confirmations all belong to an advocate, not to an
 * email address. An identity that has not finished onboarding has no profile, and
 * therefore no `users.id`, and those routes correctly answer as though signed
 * out: there is no row to attach the write to, and inventing one would put a
 * user in the database that nobody registered.
 */
export async function profileIdFor(
  sql: Sql,
  authId: string | undefined,
): Promise<string | undefined> {
  if (!authId) return undefined;
  const [row] = await sql<{ id: string }[]>`SELECT id FROM users WHERE auth_id = ${authId}`;
  return row?.id;
}

/**
 * Refuse an unauthenticated caller BEFORE the route's body validator runs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * N-7 — WHAT THIS CLOSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `validate('json', …)` is middleware and the `requireUser` check lives in the
 * handler, so on every protected route the schema ran first. An unauthenticated
 * caller could therefore **walk the request schema one 400 at a time** — learning
 * field names, types, enum members and length bounds — and only receive 401 once
 * the body finally validated.
 *
 * Nothing was disclosed from the database and no write happened, which is why
 * this is a hardening defect and not a breach. But a schema is a map of the
 * product, the walk costs an attacker nothing, and an anonymous caller has no
 * business reaching a validator on a route that will refuse them anyway.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A PER-ROUTE MIDDLEWARE AND NOT A CENTRAL 401
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `authMiddleware` above explains why it never rejects: a central 401 needs a
 * list of exempt paths, and "a path list is the kind of thing that silently
 * gains an entry". That reasoning still holds, so this is **not** a wildcard
 * gate. It is declared at each route that needs it, in `app.ts`, ahead of the
 * validator — so the requirement stays visible where the route is defined and
 * there is no exempt list anywhere.
 *
 * `reason` is per-route on purpose. The handler messages it replaces said why
 * this particular route needs an advocate ("a matter belongs to an advocate"),
 * and collapsing them into one generic string would trade real copy for
 * convenience.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS AUTHENTICATION. IT DOES NOT REPLACE AUTHORIZATION.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The gate is on `authId` — the identity, which exists the moment an email is
 * verified. Every handler's own `requireUser(c, userId)` check is on the
 * **profile**, and it STAYS. The two are different questions and the difference
 * is load-bearing:
 *
 *   - An `identity_only` advocate who never finished onboarding HAS an `authId`
 *     and no profile. They pass this gate, as they must: `POST /me/data-requests`
 *     is deliberately reachable by exactly that caller, because demanding more
 *     personal data as the price of deleting personal data is the defect RCC
 *     reported at bus 1722.
 *   - They then meet the handler's profile check, which answers **403
 *     `PROFILE_INCOMPLETE`** through `resolveAuthFailure` rather than 401,
 *     because a token refresh cannot fix a missing profile.
 *
 * So gating on the profile here would both cost a database round trip before
 * validation and re-break a route that was deliberately opened. Gating on the
 * identity closes the anonymous schema walk — which is the whole of N-7 — and
 * changes nothing else.
 *
 * Nothing here reads `enrolment_status` or tier. PD-2: identity is not
 * permission, and a rejected enrolment keeps full access.
 */
export function requireAuthenticated(reason: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    /**
     * `AUTH_REQUIRED` with no `authId` is the one case `resolveAuthFailure`
     * passes through untouched, so this stays a 401 and does not accidentally
     * become the 403 that means "signed in, onboarding unfinished".
     */
    if (c.get('authId') === undefined) return fail(c, 'AUTH_REQUIRED', reason, 401);
    await next();
  };
}
