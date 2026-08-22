/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `/admin/*` REFUSES UNLESS THE DATABASE SAYS OTHERWISE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What this replaces, in the words of the file that documented it:
 *
 *   > *"There is no `role` column on `users` and no way, today, to tell an admin
 *   > from any other authenticated advocate. Every admin endpoint in this file
 *   > and its siblings therefore gates on the SAME thing — `userId !== undefined`
 *   > — because that is the only check the codebase can currently make
 *   > honestly."* — `admin/audit.ts`, until today
 *
 * Concretely: any advocate who completed sign-up could read the audit ledger,
 * list every user with their phone number, uphold or reject a disputed citation,
 * and flip the eCourts kill switch. Migration `0074` adds the column; this adds
 * the refusal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A PREFIX MIDDLEWARE, WHEN `middleware.ts` ARGUES AGAINST CENTRAL GATES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `authMiddleware`'s own note says a central 401 would need "a list of exempt
 * paths, and a path list is the kind of thing that silently gains an entry".
 * That reasoning is right and it points the OPPOSITE way here, because this list
 * has no exemptions: it is one prefix, it denies, and a new admin route added
 * next month is protected the moment it is mounted rather than the moment
 * somebody remembers.
 *
 * The per-route `userFor(c)` checks stay exactly where they are. They answer a
 * different question — WHICH admin acted, for the audit row — and a route that
 * needs an actor id must still fail without one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 401 vs 403 — DIFFERENT FACTS, DIFFERENT ANSWERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No token at all is 401: the caller may simply not have signed in, and telling
 * them so is not a leak. A signed-in advocate who is not an admin gets 403 —
 * they are authenticated, the answer will not change by retrying, and pretending
 * the route does not exist would send an operator whose grant was revoked into
 * debugging their password.
 *
 * Neither response says whether the resource exists, and neither names another
 * user. There is nothing here to enumerate.
 */
import type { Context, Next } from 'hono';
import type { Sql } from 'postgres';

import { fail } from '../envelope.ts';
import { logger } from '../logger.ts';

export type AdminRole = 'advocate' | 'admin';

/**
 * The caller's role, or null when the caller has no profile at all.
 *
 * One indexed read on `users.auth_id`, on the CORE pool, on a path that already
 * resolves a profile id for every admin route. Not cached: a revoked grant that
 * keeps working until a process restarts is not a revoked grant.
 */
export async function roleFor(sql: Sql, authId: string | undefined): Promise<AdminRole | null> {
  if (!authId) return null;
  const [row] = await sql<{ role: string }[]>`
    SELECT role FROM users WHERE auth_id = ${authId}`;
  if (!row) return null;
  // Anything the CHECK constraint has not seen is treated as the least
  // privileged value. A new role added to the database and not to this file must
  // fail closed.
  return row.role === 'admin' ? 'admin' : 'advocate';
}

export function requireAdmin(sql: Sql) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const authId = c.get('authId');
    if (!authId) {
      return fail(c, 'UNAUTHENTICATED', 'This endpoint requires an administrator sign-in.', 401);
    }
    const role = await roleFor(sql, authId);
    if (role !== 'admin') {
      // Logged as a warning, with the request id, because a genuine attempt by a
      // non-admin is a security event worth seeing in aggregate. The identity is
      // the auth id, never the email — this line goes to the ordinary log.
      logger.warn(
        { request_id: c.get('requestId'), path: c.req.path, auth_id: authId },
        'admin route refused — caller is not an administrator',
      );
      return fail(c, 'FORBIDDEN', 'This endpoint requires an administrator.', 403);
    }
    await next();
  };
}
