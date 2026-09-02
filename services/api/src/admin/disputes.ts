/**
 * Disputed citations — "the trust feedback loop. Outranks everything else in
 * the admin." `docs/SCHEMA_TRUTH.md#citation_disputes`,
 * `docs/API_CONTRACTS.md` §Disputed citations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UPHOLD IS A FAN-OUT WRITE, NOT A STATUS CHANGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Upholding a dispute calls the SAME `applyOverruledChange` the nightly
 * re-check calls (`citations/fanout.ts`) — `ADMIN_SURFACE.md` §15: *"an admin
 * upholding a dispute and the nightly re-check noticing the same flip require
 * identical work... two implementations would drift, and the one that drifts
 * is the one that stops notifying."* This module does not touch `judgments`,
 * `citation_checks`, `alerts` or `citation_fanouts` directly — it resolves the
 * dispute's own row and delegates everything downstream.
 *
 * `falseVerifiedRate` — disputes upheld where the citation was `verified` at
 * the time it was shown, divided by total verified citations shown. Target
 * zero. Computed here, not stored: the only durable fact is which disputes
 * were upheld and what `citation_checks.verification_state` said at the time,
 * both already on disk.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `reverificationJobId` IS THE FAN-OUT ID, BECAUSE THERE IS NO JOB QUEUE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Same substitution `POST /admin/overruled-rechecks/run` already makes:
 * *"the manual trigger returns its own result synchronously rather than a job
 * id to poll."* `applyOverruledChange` runs inside this request, not on a
 * queue. The contract's field name survives; what it points at is honest.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { applyOverruledChange } from '../citations/fanout.ts';
import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { writeAudit } from './audit.ts';

export const disputesQuery = z.object({
  status: z.enum(['open', 'upheld', 'rejected']).optional(),
});

export const upholdBody = z
  .object({
    correction: z.object({
      toStatus: z.enum(['none', 'set_aside', 'partly_set_aside', 'doubted']),
      overruledParas: z.array(z.number().int()).optional(),
      overruledByJudgmentId: z.string().uuid().optional(),
      overruledNote: z.string().max(2000).optional(),
    }),
    reason: z.string().min(1).max(1000),
  })
  .strict();

export const rejectBody = z.object({ reason: z.string().min(1).max(1000) }).strict();

type DisputeRow = {
  id: string;
  reported_by_user_id: string;
  citation_check_id: string | null;
  judgment_id: string | null;
  claim: string;
  status: 'open' | 'upheld' | 'rejected';
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  correction: Record<string, unknown> | null;
  fanout_id: string | null;
  created_at: string;
};

const shape = (r: DisputeRow) => ({
  id: r.id,
  reportedBy: r.reported_by_user_id,
  citationCheckId: r.citation_check_id,
  judgmentId: r.judgment_id,
  claim: r.claim,
  status: r.status,
  resolvedBy: r.resolved_by_user_id,
  resolvedAt: r.resolved_at,
  correction: r.correction,
  fanoutId: r.fanout_id,
  createdAt: r.created_at,
});

/**
 * Upheld-where-verified ÷ total verified shown — target zero. Shared with
 * `admin/citations.ts`'s monitor: identical formula, one query, so the two
 * surfaces cannot silently drift onto two different definitions of the same
 * number.
 */
export async function falseVerifiedRate(sql: Sql): Promise<number | null> {
  const [rate] = await sql<{ upheld_verified: number; total_verified: number }[]>`
    SELECT
      (SELECT count(*)::int FROM citation_disputes d
        JOIN citation_checks cc ON cc.id = d.citation_check_id
        WHERE d.status = 'upheld' AND cc.verification_state = 'verified') AS upheld_verified,
      (SELECT count(*)::int FROM citation_checks
        WHERE verification_state = 'verified' AND shown_to_user = true) AS total_verified
  `;
  return rate && rate.total_verified > 0 ? rate.upheld_verified / rate.total_verified : null;
}

export async function listDisputes(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  query: z.infer<typeof disputesQuery>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'disputes are a privileged surface', 401);

  const rows = await sql<DisputeRow[]>`
    SELECT id, reported_by_user_id, citation_check_id, judgment_id, claim, status,
           resolved_by_user_id, ${sql.unsafe(isoColumn('resolved_at'))} AS resolved_at,
           correction, fanout_id, ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM citation_disputes
    WHERE true ${query.status ? sql`AND status = ${query.status}` : sql``}
    ORDER BY created_at DESC
  `;

  return ok(c, { disputes: rows.map(shape), falseVerifiedRate: await falseVerifiedRate(sql) });
}

/**
 * `sql` is the USER role: a dispute, the citation check behind it and the
 * copies that carried it are all an advocate's. `corpusSql` is the ONE corpus
 * read — the judgment the dispute is about. Defaults to `sql`.
 */
export async function getDispute(
  c: Context,
  sql: Sql,
  id: string,
  userId: string | undefined,
  corpusSql: Sql = sql,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'disputes are a privileged surface', 401);

  const [dispute] = await sql<DisputeRow[]>`
    SELECT id, reported_by_user_id, citation_check_id, judgment_id, claim, status,
           resolved_by_user_id, ${sql.unsafe(isoColumn('resolved_at'))} AS resolved_at,
           correction, fanout_id, ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM citation_disputes WHERE id = ${id}`;
  if (!dispute) return fail(c, 'NOT_FOUND', 'no dispute with that id', 404);

  const [citationCheck] = dispute.citation_check_id
    ? await sql`SELECT * FROM citation_checks WHERE id = ${dispute.citation_check_id}`
    : [null];
  const [judgment] = dispute.judgment_id
    ? await corpusSql`SELECT * FROM judgments WHERE id = ${dispute.judgment_id}`
    : [null];

  // A PREVIEW, not a write — same population `applyOverruledChange` would
  // resolve, computed read-only so an admin can see the blast radius before
  // deciding. copiedCount is included here too, for the same reason the
  // fan-out itself counts it: the copy-out audience is real risk, visible.
  let impact = { savedCount: 0, filedCount: 0, copiedCount: 0 };
  if (dispute.judgment_id) {
    const [saved] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM citation_checks
      WHERE judgment_id_matched = ${dispute.judgment_id} AND shown_to_user = true`;
    const [filed] = await sql<{ n: number }[]>`
      SELECT count(DISTINCT d.user_id)::int AS n FROM citation_checks cc
      JOIN documents d ON d.id = cc.document_id
      WHERE cc.judgment_id_matched = ${dispute.judgment_id} AND cc.document_id IS NOT NULL`;
    const [copied] = await sql<{ n: number }[]>`
      SELECT count(DISTINCT user_id)::int AS n FROM citation_copies
      WHERE judgment_id = ${dispute.judgment_id}`;
    impact = { savedCount: saved?.n ?? 0, filedCount: filed?.n ?? 0, copiedCount: copied?.n ?? 0 };
  }

  return ok(c, { dispute: shape(dispute), citationCheck, judgment, impact });
}

export async function uphold(
  c: Context,
  sql: Sql,
  id: string,
  userId: string | undefined,
  body: z.infer<typeof upholdBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'disputes are a privileged surface', 401);

  const [dispute] = await sql<DisputeRow[]>`SELECT * FROM citation_disputes WHERE id = ${id}`;
  if (!dispute) return fail(c, 'NOT_FOUND', 'no dispute with that id', 404);
  if (dispute.status !== 'open') {
    return fail(c, 'ALREADY_RESOLVED', `this dispute is already ${dispute.status}`, 409);
  }
  if (!dispute.judgment_id) {
    // The dispute schema allows a null judgment_id (a claim about the check
    // itself, not a specific authority) — upholding THAT is not a fan-out and
    // is out of scope for this endpoint's one job.
    return fail(
      c,
      'NO_JUDGMENT',
      'this dispute has no judgment_id — nothing for the fan-out to act on',
      422,
    );
  }

  // The fan-out is its OWN transaction (fanout.ts claims the idempotency key
  // before anything else moves). Resolving the dispute row happens AFTER it
  // succeeds, in a second transaction — if the dispute-row write failed while
  // still inside the fan-out's transaction, a retry would find the fan-out
  // already claimed (idempotent) and never get a second chance to resolve the
  // dispute, leaving it open forever against a corpus that already moved.
  const fanoutResult = await applyOverruledChange(sql, {
    judgmentId: dispute.judgment_id,
    toStatus: body.correction.toStatus,
    trigger: 'dispute_upheld',
    triggerRef: id,
    overruledParas: body.correction.overruledParas,
    overruledByJudgmentId: body.correction.overruledByJudgmentId,
    overruledNote: body.correction.overruledNote,
  });

  const resolved = await sql.begin(async (tx) => {
    const [row] = await tx<DisputeRow[]>`
      UPDATE citation_disputes SET
        status = 'upheld', resolved_by_user_id = ${userId}, resolved_at = now(),
        correction = ${tx.json(body.correction)}, fanout_id = ${fanoutResult.fanoutId}
      WHERE id = ${id}
      RETURNING id, reported_by_user_id, citation_check_id, judgment_id, claim, status,
                resolved_by_user_id, ${tx.unsafe(isoColumn('resolved_at'))} AS resolved_at,
                correction, fanout_id, ${tx.unsafe(isoColumn('created_at'))} AS created_at
    `;
    await writeAudit(tx, {
      actorUserId: userId,
      actorRole: 'admin',
      action: 'dispute.uphold',
      targetType: 'citation_dispute',
      targetId: id,
      before: { status: 'open' },
      after: { status: 'upheld', correction: body.correction },
      reason: body.reason,
    });
    return row!;
  });
  void resolved;

  return ok(c, {
    corrected: true,
    // See module note: synchronous, not a queued job. The name survives from
    // the contract; the id it points at is honest about what actually ran.
    reverificationJobId: fanoutResult.fanoutId,
    affectedSaved: fanoutResult.savedCount,
    affectedFiled: fanoutResult.filedCount,
    notified: fanoutResult.notifiedCount,
  });
}

export async function reject(
  c: Context,
  sql: Sql,
  id: string,
  userId: string | undefined,
  body: z.infer<typeof rejectBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'disputes are a privileged surface', 401);

  const [dispute] = await sql<DisputeRow[]>`SELECT * FROM citation_disputes WHERE id = ${id}`;
  if (!dispute) return fail(c, 'NOT_FOUND', 'no dispute with that id', 404);
  if (dispute.status !== 'open') {
    return fail(c, 'ALREADY_RESOLVED', `this dispute is already ${dispute.status}`, 409);
  }

  const row = await sql.begin(async (tx) => {
    const [updated] = await tx<DisputeRow[]>`
      UPDATE citation_disputes SET
        status = 'rejected', resolved_by_user_id = ${userId}, resolved_at = now()
      WHERE id = ${id}
      RETURNING id, reported_by_user_id, citation_check_id, judgment_id, claim, status,
                resolved_by_user_id, ${tx.unsafe(isoColumn('resolved_at'))} AS resolved_at,
                correction, fanout_id, ${tx.unsafe(isoColumn('created_at'))} AS created_at
    `;
    await writeAudit(tx, {
      actorUserId: userId,
      actorRole: 'admin',
      action: 'dispute.reject',
      targetType: 'citation_dispute',
      targetId: id,
      before: { status: 'open' },
      after: { status: 'rejected' },
      reason: body.reason,
    });
    return updated!;
  });

  return ok(c, { dispute: shape(row) });
}
