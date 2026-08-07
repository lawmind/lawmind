/**
 * Matter sharing — PD-3 and PD-4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PER MATTER, BY INVITATION. THERE IS NO CHAMBER-WIDE ENDPOINT AND THERE MUST
 * NEVER BE ONE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A chamber of two to five is a list of names, not an org chart. Indian chambers
 * work case-by-case — a junior is briefed on a matter, not given the run of the
 * chamber — and chamber-wide default sharing is a **conflicts hazard**: two
 * advocates in one chamber can be on opposing sides of related matters.
 *
 * If a future request arrives for "share all my matters with X", it is not a
 * convenience feature. It is the thing PD-3 exists to prevent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A SHARE ACTUALLY GRANTS — PD-4
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The **court record** and notes explicitly marked `shared`. Private notes never
 * travel. `order_text` is the court's words and is always visible; `notes` are
 * what the advocate thinks and obey `note_visibility`, which defaults to private
 * **in the column**.
 *
 * A note about fees, or about a client's circumstances, must never move with a
 * file by accident. That is the whole rule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REVOCATION IS A TIMESTAMP, NEVER A DELETE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * "Who had sight of this matter, and when" is exactly what a conflicts challenge
 * asks, possibly years later. A deleted row cannot answer it.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

export const shareBody = z.object({
  /**
   * An enrolment number or a phone number, as the owner types it.
   *
   * Deliberately not an email or a user id: the owner knows their colleague by
   * the identifier the profession uses, and may be inviting somebody who has no
   * account yet. Stored verbatim — it is what they believed they were sharing
   * with, and that is the fact a conflicts question needs.
   */
  identifier: z.string().min(3).max(120),
});

export const eventVisibilityBody = z.object({
  noteVisibility: z.enum(['private', 'shared']),
});

type ShareRow = {
  id: string;
  invited_identifier: string;
  invited_user_id: string | null;
  granted_by_user_id: string;
  granted_at: string;
  revoked_at: string | null;
};

const shape = (r: ShareRow) => ({
  shareId: r.id,
  invitedIdentifier: r.invited_identifier,
  /** Null until they have an account. Not an error — a share can precede signup. */
  invitedUserId: r.invited_user_id,
  grantedBy: r.granted_by_user_id,
  grantedAt: r.granted_at,
  /** Non-null means revoked. The row is kept deliberately; see the module note. */
  revokedAt: r.revoked_at,
});

/** Only the OWNER administers shares. A sharee cannot re-share a matter. */
async function ownedMatter(sql: Sql, matterId: string, userId: string) {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM matters WHERE id = ${matterId} AND user_id = ${userId}`;
  return row;
}

export async function listShares(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedMatter(sql, matterId, userId))) {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  // Revoked shares are RETURNED, not filtered out. The owner needs to see who
  // has ever had sight of this matter, not only who has it now.
  const rows = await sql<ShareRow[]>`
    SELECT id, invited_identifier, invited_user_id, granted_by_user_id,
           ${sql.unsafe(isoColumn('granted_at'))} AS granted_at,
           ${sql.unsafe(isoColumn('revoked_at'))} AS revoked_at
    FROM matter_shares WHERE matter_id = ${matterId}
    ORDER BY granted_at DESC`;

  return ok(c, {
    shares: rows.map(shape),
    asOf: new Date().toISOString(),
  });
}

export async function createShare(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
  body: z.infer<typeof shareBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedMatter(sql, matterId, userId))) {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  const identifier = body.identifier.trim();

  /**
   * Resolve the identifier to an account if one exists — by enrolment number or
   * phone, which is how advocates know each other.
   *
   * A miss is **not** an error: inviting somebody who has not signed up yet is a
   * normal and useful thing to do, and the share binds when they arrive.
   */
  const [invitee] = await sql<{ id: string }[]>`
    SELECT id FROM users
    WHERE bar_enrolment_number = ${identifier} OR phone = ${identifier}
    LIMIT 1`;

  if (invitee?.id === userId) {
    return fail(c, 'CANNOT_SHARE_WITH_SELF', 'this matter is already yours', 409);
  }

  const [row] = await sql<ShareRow[]>`
    INSERT INTO matter_shares
      (matter_id, invited_user_id, invited_identifier, granted_by_user_id)
    VALUES (${matterId}, ${invitee?.id ?? null}, ${identifier}, ${userId})
    -- The partial unique index covers LIVE shares only, so re-inviting somebody
    -- previously revoked is allowed — advocates are brought back onto cases.
    ON CONFLICT DO NOTHING
    RETURNING id, invited_identifier, invited_user_id, granted_by_user_id,
              ${sql.unsafe(isoColumn('granted_at'))} AS granted_at,
              ${sql.unsafe(isoColumn('revoked_at'))} AS revoked_at
  `;

  if (!row) {
    // Already shared and live. Idempotent rather than an error: the owner's
    // intent is satisfied, and a 409 would make a retrying client look broken.
    const [existing] = await sql<ShareRow[]>`
      SELECT id, invited_identifier, invited_user_id, granted_by_user_id,
             ${sql.unsafe(isoColumn('granted_at'))} AS granted_at,
             ${sql.unsafe(isoColumn('revoked_at'))} AS revoked_at
      FROM matter_shares
      WHERE matter_id = ${matterId} AND invited_identifier = ${identifier}
        AND revoked_at IS NULL`;
    return ok(c, { share: shape(existing!), created: false });
  }

  return ok(c, { share: shape(row), created: true }, 201);
}

export async function revokeShare(
  c: Context,
  sql: Sql,
  matterId: string,
  shareId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedMatter(sql, matterId, userId))) {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  const [row] = await sql<{ revoked_at: string }[]>`
    UPDATE matter_shares
       -- Never a DELETE. Who had sight of this matter, and when, is the question
       -- a conflicts challenge asks years later.
       SET revoked_at = now(), revoked_by_user_id = ${userId}
     WHERE id = ${shareId} AND matter_id = ${matterId} AND revoked_at IS NULL
    RETURNING ${sql.unsafe(isoColumn('revoked_at'))} AS revoked_at
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no live share with that id', 404);

  return ok(c, { revokedAt: row.revoked_at });
}

/**
 * PD-4 — flip one note between private and shared, reversibly.
 *
 * Per note, not per matter: the advocate decides which of their own thoughts
 * travel with the file. `order_text` is unaffected — the court record is always
 * visible to a share.
 */
export async function setEventVisibility(
  c: Context,
  sql: Sql,
  matterId: string,
  eventId: string,
  userId: string | undefined,
  body: z.infer<typeof eventVisibilityBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  // The OWNER decides what their notes do. A sharee cannot publish somebody
  // else's private note by flipping a switch.
  if (!(await ownedMatter(sql, matterId, userId))) {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  const [row] = await sql<{ id: string; note_visibility: string; notes: string | null }[]>`
    UPDATE matter_events SET note_visibility = ${body.noteVisibility}
    WHERE id = ${eventId} AND matter_id = ${matterId}
    RETURNING id, note_visibility, notes
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no event with that id', 404);

  return ok(c, {
    event: {
      eventId: row.id,
      noteVisibility: row.note_visibility,
      /**
       * Stated back so the client can show what is now travelling. An advocate
       * marking a note shared should see the words that will reach the sharee.
       */
      notes: row.notes,
    },
  });
}
