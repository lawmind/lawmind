/**
 * The audit ledger — write helper and the read endpoint.
 *
 * `ADMIN_SURFACE.md` §Governing rules: **"Every privileged action writes
 * `audit_log`... in the SAME transaction as the action. An action cannot
 * succeed while its audit row fails."** `writeAudit` therefore takes the
 * transaction handle a caller is already inside, never opens its own — a
 * privileged write that calls this OUTSIDE its own transaction has broken the
 * one rule that makes the ledger trustworthy.
 *
 * Append-only is enforced in Postgres (`0002_audit_log_append_only.sql`:
 * REVOKE + a raising trigger, both a table-owner and a naive UPDATE would
 * otherwise bypass respectively). Nothing here needs to re-enforce that; the
 * database refuses on its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHO IS ALLOWED TO READ OR WRITE THIS SURFACE — A NAMED, NOT A HIDDEN, GAP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ADMIN_SURFACE.md` §15 states plainly: *"Role writes are still missing... by
 * design."* There is no `role` column on `users` and no way, today, to tell an
 * admin from any other authenticated advocate. Every admin endpoint in this
 * file and its siblings therefore gates on the SAME thing `admin/cause-lists.ts`
 * already gates its write endpoints on — `userId !== undefined` — because that
 * is the only check the codebase can currently make honestly. This is not a new
 * decision; it is the existing, named gap, applied consistently rather than
 * invented per-endpoint. It is not a claim that these endpoints are safe from a
 * malicious authenticated advocate — they are not, yet — and closing that is
 * §15's own scope, sequenced after the surfaces that need it exist to protect.
 */
import type { Context } from 'hono';
import type { JSONValue, Sql, TransactionSql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

export type AuditEntry = {
  actorUserId: string;
  /** Free text, per SCHEMA_TRUTH — not yet backed by a real role column. */
  actorRole: string;
  /** Dotted verb, e.g. `platform.kill_switch.toggle`, `dispute.uphold`. */
  action: string;
  targetType: string;
  targetId: string | null;
  /** Changed fields only, never a whole row. */
  before: Record<string, JSONValue> | null;
  after: Record<string, JSONValue> | null;
  reason: string | null;
};

/** Must be called with the SAME transaction as the privileged write it records. */
export async function writeAudit(tx: TransactionSql, entry: AuditEntry): Promise<void> {
  await tx`
    INSERT INTO audit_log
      (actor_user_id, actor_role, action, target_type, target_id, before, after, reason)
    VALUES (${entry.actorUserId}, ${entry.actorRole}, ${entry.action}, ${entry.targetType},
            ${entry.targetId}, ${entry.before ? tx.json(entry.before) : null},
            ${entry.after ? tx.json(entry.after) : null}, ${entry.reason})
  `;
}

export const auditQuery = z.object({
  actor: z.string().uuid().optional(),
  action: z.string().max(200).optional(),
  targetType: z.string().max(100).optional(),
  targetId: z.string().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().datetime().optional(),
});

type AuditRow = {
  id: string;
  actor_user_id: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

export async function listAudit(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  query: z.infer<typeof auditQuery>,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'the audit ledger is a privileged surface', 401);
  }

  // 50 rows, cursor on created_at — the ledger only grows, and an unbounded
  // read against an append-only table is the one query here guaranteed to get
  // slower every day this product is used.
  const PAGE = 50;
  const rows = await sql<AuditRow[]>`
    SELECT id, actor_user_id, actor_role, action, target_type, target_id,
           before, after, reason, ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM audit_log
    WHERE true
      ${query.actor ? sql`AND actor_user_id = ${query.actor}` : sql``}
      ${query.action ? sql`AND action = ${query.action}` : sql``}
      ${query.targetType ? sql`AND target_type = ${query.targetType}` : sql``}
      ${query.targetId ? sql`AND target_id = ${query.targetId}` : sql``}
      ${query.from ? sql`AND created_at >= (${query.from}::text)::timestamptz` : sql``}
      ${query.to ? sql`AND created_at <= (${query.to}::text)::timestamptz` : sql``}
      ${query.cursor ? sql`AND created_at < (${query.cursor}::text)::timestamptz` : sql``}
    ORDER BY created_at DESC
    LIMIT ${PAGE}
  `;

  const entries = rows.map((r) => ({
    id: r.id,
    actorUserId: r.actor_user_id,
    actorRole: r.actor_role,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    before: r.before,
    after: r.after,
    reason: r.reason,
    createdAt: r.created_at,
  }));

  // Null, not the last row's timestamp repeated — a page short of PAGE is
  // proof there is nothing more, and a cursor implying otherwise would send
  // the client back for an empty page forever.
  const nextCursor = rows.length === PAGE ? entries[entries.length - 1]!.createdAt : null;

  return ok(c, { entries, nextCursor });
}
