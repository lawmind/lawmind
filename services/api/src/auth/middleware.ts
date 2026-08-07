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
