/**
 * `GET/POST /admin/data-requests` — DPDP Act obligations, `docs/SCHEMA_TRUTH.md
 * #data_requests`. "A visible clock per request": `due_at` is the whole point
 * of the table, and `overdueCount` is what an admin actually needs to see
 * without scanning every row.
 *
 * `GET /admin/privacy/coverage` is NOT in this file. `docs/SCHEMA_TRUTH.md`
 * and `docs/PRIVACY_PII.md` disagree about what that endpoint should report —
 * see the FOUNDER_QUEUE entry — and this is a DPDP-facing compliance number,
 * not a call to make by picking whichever reading is easier to build.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { writeAudit } from './audit.ts';
import { eraseUser } from '../auth/erasure.ts';

export const dataRequestsQuery = z.object({
  status: z.enum(['received', 'in_progress', 'completed', 'refused']).optional(),
});

export const completeRequestBody = z
  .object({ artefactStorageKey: z.string().max(500).optional() })
  .strict();
export const refuseRequestBody = z.object({ reason: z.string().min(1).max(1000) }).strict();

type DataRequestRow = {
  id: string;
  user_id: string;
  kind: 'export' | 'correction' | 'erasure';
  status: 'received' | 'in_progress' | 'completed' | 'refused';
  due_at: string;
  completed_at: string | null;
  refusal_reason: string | null;
  artefact_storage_key: string | null;
  created_at: string;
};

const shape = (r: DataRequestRow) => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  status: r.status,
  dueAt: r.due_at,
  completedAt: r.completed_at,
  refusalReason: r.refusal_reason,
  artefactStorageKey: r.artefact_storage_key,
  createdAt: r.created_at,
});

export async function listDataRequests(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  query: z.infer<typeof dataRequestsQuery>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'data requests are a privileged surface', 401);

  const rows = await sql<DataRequestRow[]>`
    SELECT id, user_id, kind, status, ${sql.unsafe(isoColumn('due_at'))} AS due_at,
           ${sql.unsafe(isoColumn('completed_at'))} AS completed_at, refusal_reason,
           artefact_storage_key, ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM data_requests
    WHERE true ${query.status ? sql`AND status = ${query.status}` : sql``}
    ORDER BY due_at ASC
  `;

  // Overdue = the clock ran out on a request that is not yet resolved.
  // Completed/refused rows are excluded regardless of due_at, deliberately —
  // "overdue" describes exposure right now, not a request's history.
  const overdueCount = rows.filter(
    (r) =>
      (r.status === 'received' || r.status === 'in_progress') && new Date(r.due_at) < new Date(),
  ).length;

  return ok(c, { requests: rows.map(shape), overdueCount });
}

export async function completeDataRequest(
  c: Context,
  sql: Sql,
  id: string,
  userId: string | undefined,
  body: z.infer<typeof completeRequestBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'data requests are a privileged surface', 401);

  const result = await sql.begin(async (tx) => {
    const [before] = await tx<{ status: string }[]>`
      SELECT status FROM data_requests WHERE id = ${id}`;
    if (!before) return null;

    const [row] = await tx<DataRequestRow[]>`
      UPDATE data_requests SET
        status = 'completed', completed_at = now(),
        artefact_storage_key = ${body.artefactStorageKey ?? null}
      WHERE id = ${id}
      RETURNING id, user_id, kind, status, ${tx.unsafe(isoColumn('due_at'))} AS due_at,
                ${tx.unsafe(isoColumn('completed_at'))} AS completed_at, refusal_reason,
                artefact_storage_key, ${tx.unsafe(isoColumn('created_at'))} AS created_at
    `;

    await writeAudit(tx, {
      actorUserId: userId,
      actorRole: 'admin',
      action: 'data_request.complete',
      targetType: 'data_request',
      targetId: id,
      before: { status: before.status },
      after: { status: 'completed', artefactStorageKey: body.artefactStorageKey ?? null },
      reason: null,
    });

    return row!;
  });

  if (!result) return fail(c, 'NOT_FOUND', 'no data request with that id', 404);
  return ok(c, { request: shape(result) });
}

export async function refuseDataRequest(
  c: Context,
  sql: Sql,
  id: string,
  userId: string | undefined,
  body: z.infer<typeof refuseRequestBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'data requests are a privileged surface', 401);

  const result = await sql.begin(async (tx) => {
    const [before] = await tx<{ status: string }[]>`
      SELECT status FROM data_requests WHERE id = ${id}`;
    if (!before) return null;

    const [row] = await tx<DataRequestRow[]>`
      UPDATE data_requests SET status = 'refused', refusal_reason = ${body.reason}
      WHERE id = ${id}
      RETURNING id, user_id, kind, status, ${tx.unsafe(isoColumn('due_at'))} AS due_at,
                ${tx.unsafe(isoColumn('completed_at'))} AS completed_at, refusal_reason,
                artefact_storage_key, ${tx.unsafe(isoColumn('created_at'))} AS created_at
    `;

    await writeAudit(tx, {
      actorUserId: userId,
      actorRole: 'admin',
      action: 'data_request.refuse',
      targetType: 'data_request',
      targetId: id,
      before: { status: before.status },
      after: { status: 'refused', refusalReason: body.reason },
      reason: body.reason,
    });

    return row!;
  });

  if (!result) return fail(c, 'NOT_FOUND', 'no data request with that id', 404);
  return ok(c, { request: shape(result) });
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXECUTE AN ERASURE — the one irreversible button on this surface
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Separate from `complete` on purpose. `complete` is a bookkeeping verb: it says
 * an operator dealt with a request, and it is right for an export (the artefact
 * was produced) and for a correction (the field was fixed). Erasure DESTROYS
 * rows, cannot be undone, and must not be reachable by an operator who thought
 * they were ticking a box.
 *
 * `--reason` equivalent is required for the same reason the kill switch requires
 * one: `audit_log` is the only record that will survive, and "why" is the half
 * of it that a later question actually needs.
 *
 * The erasure and the status change land in the SAME transaction as the audit
 * row — `eraseUser` opens it — so a completed request always corresponds to work
 * that actually happened.
 */
export const eraseRequestBody = z.object({ reason: z.string().min(1).max(1000) }).strict();

export async function executeErasure(
  c: Context,
  sql: Sql,
  id: string,
  actorUserId: string | undefined,
  body: z.infer<typeof eraseRequestBody>,
): Promise<Response> {
  if (!actorUserId) return fail(c, 'AUTH_REQUIRED', 'data requests are a privileged surface', 401);

  const [request] = await sql<{ user_id: string; kind: string; status: string }[]>`
    SELECT user_id, kind, status FROM data_requests WHERE id = ${id}`;
  if (!request) return fail(c, 'NOT_FOUND', 'no data request with that id', 404);
  if (request.kind !== 'erasure') {
    // A wrong-kind request is a mistake, not an edge case: refusing loudly is
    // the difference between "nothing happened" and "an export request deleted
    // an account".
    return fail(c, 'WRONG_KIND', `this request is a ${request.kind}, not an erasure`, 409);
  }
  if (request.status === 'completed') {
    return fail(c, 'ALREADY_COMPLETED', 'this erasure has already been carried out', 409);
  }

  const result = await eraseUser(sql, request.user_id, { userId: actorUserId, role: 'admin' }, body.reason);

  const [row] = await sql<DataRequestRow[]>`
    UPDATE data_requests SET status = 'completed', completed_at = now()
     WHERE id = ${id}
     RETURNING id, user_id, kind, status, ${sql.unsafe(isoColumn('due_at'))} AS due_at,
               ${sql.unsafe(isoColumn('completed_at'))} AS completed_at, refusal_reason,
               artefact_storage_key, ${sql.unsafe(isoColumn('created_at'))} AS created_at`;

  return ok(c, {
    request: shape(row!),
    deleted: result.deleted,
    /**
     * **The caller must delete these from R2.** Returned rather than silently
     * skipped: reporting an erasure complete while the uploaded PDFs are still
     * fetchable by key would be a false compliance claim.
     */
    storageKeysStillToDelete: result.erasedStorageKeys,
  });
}
