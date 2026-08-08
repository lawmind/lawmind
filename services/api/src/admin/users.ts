/**
 * `GET /admin/users`, `PATCH /admin/users/:id/enrolment` —
 * `docs/ADMIN_SURFACE.md` §2 Enrolment queue.
 *
 * **PD-2 — enrolment is a credential, not a gate.** `ADMIN_SURFACE.md` states it
 * as a governing rule: *"Rejection must not change access — assert this in a
 * test, not a comment."* This endpoint updates `enrolment_status` and nothing
 * else. There is no code path here, or anywhere in this codebase, that reads
 * `enrolment_status` to permit or deny a request — PD-2 holds because nothing
 * was ever wired to break it, not because this handler defends against it.
 *
 * `ADMIN_SURFACE.md` §2 also names two pieces of this section as missing on
 * purpose: the request-document action and the decision-log read. Not built
 * here either — they need their own storage (a document request has no table
 * yet) and are out of this endpoint's one job.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { writeAudit } from './audit.ts';

export const usersQuery = z.object({
  status: z.enum(['unverified', 'verified', 'rejected']).optional(),
});

export const enrolmentBody = z
  .object({ status: z.enum(['unverified', 'verified', 'rejected']) })
  .strict();

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  bar_enrolment_number: string | null;
  enrolment_status: 'unverified' | 'verified' | 'rejected';
  subscription_tier: string;
  created_at: string;
};

const shape = (r: UserRow) => ({
  id: r.id,
  fullName: r.full_name,
  email: r.email,
  phone: r.phone,
  barEnrolmentNumber: r.bar_enrolment_number,
  enrolmentStatus: r.enrolment_status,
  subscriptionTier: r.subscription_tier,
  createdAt: r.created_at,
});

export async function listUsers(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  query: z.infer<typeof usersQuery>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'the users list is a privileged surface', 401);

  const rows = await sql<UserRow[]>`
    SELECT id, full_name, email, phone, bar_enrolment_number, enrolment_status,
           subscription_tier, ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM users
    WHERE true ${query.status ? sql`AND enrolment_status = ${query.status}` : sql``}
    ORDER BY created_at DESC
  `;

  return ok(c, { users: rows.map(shape) });
}

export async function patchEnrolment(
  c: Context,
  sql: Sql,
  targetUserId: string,
  actingUserId: string | undefined,
  body: z.infer<typeof enrolmentBody>,
): Promise<Response> {
  if (!actingUserId) {
    return fail(c, 'AUTH_REQUIRED', 'changing enrolment status is a privileged action', 401);
  }

  const result = await sql.begin(async (tx) => {
    const [before] = await tx<{ enrolment_status: string }[]>`
      SELECT enrolment_status FROM users WHERE id = ${targetUserId}`;
    if (!before) return null;

    const [row] = await tx<UserRow[]>`
      UPDATE users SET enrolment_status = ${body.status}
      WHERE id = ${targetUserId}
      RETURNING id, full_name, email, phone, bar_enrolment_number, enrolment_status,
                subscription_tier, ${tx.unsafe(isoColumn('created_at'))} AS created_at
    `;

    // `enrolment.approve` / `enrolment.reject` — ADMIN_SURFACE.md §2 names both
    // dotted verbs; a return to `unverified` is recorded as the same
    // `enrolment.status_change` action rather than invented a third verb for a
    // transition the design doc never named.
    const action =
      body.status === 'verified'
        ? 'enrolment.approve'
        : body.status === 'rejected'
          ? 'enrolment.reject'
          : 'enrolment.status_change';

    await writeAudit(tx, {
      actorUserId: actingUserId,
      actorRole: 'admin',
      action,
      targetType: 'user',
      targetId: targetUserId,
      before: { enrolmentStatus: before.enrolment_status },
      after: { enrolmentStatus: row!.enrolment_status },
      reason: null,
    });

    return row!;
  });

  if (!result) return fail(c, 'NOT_FOUND', 'no user with that id', 404);
  return ok(c, { user: shape(result) });
}
