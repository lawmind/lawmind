/**
 * Citator alerts — PD-5/PD-6, `docs/API_CONTRACTS.md` §Citator alerts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE APP DOES NOT GROW A NOTIFICATIONS TAB
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * "A wrong cadence trains advocates to disable notifications permanently, and
 * they do not come back." Alerts written here are `batched` (surface in the
 * evening briefing's "since yesterday" block, this endpoint is their only other
 * home) or `immediate` (also pushed — `citations/fanout.ts`). Neither kind is a
 * push feed you poll; `GET /alerts` exists for the briefing UI and for the rare
 * case an advocate wants the raw list.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAYLOAD FACTS ARE HISTORICAL. `overruled_status` IS RE-READ LIVE, EVERY TIME
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An alert's `payload` records what happened at the moment the fan-out ran —
 * `fromStatus`/`toStatus` — and that never changes; it is what makes the alert
 * meaningful history. But `overruled_status` on `judgments` is never cached
 * (`CITATION_HARNESS.md`), so this endpoint additionally re-reads it live and
 * returns it alongside the payload as `currentOverruledStatus`. If a later
 * `admin_correction` reverses a wrongly-upheld dispute, an old alert must not
 * go on asserting a status the corpus no longer holds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRIGGER 2 CANNOT BE DISABLED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * There is no settings column for `filed_citation_moved`. `PATCH
 * /me/alert-settings` uses `.strict()` — sending that key, or any key that is
 * not one of the three real settings, is a 400, not a silently-ignored no-op.
 * "An advocate who has filed a document citing law that has since moved does
 * not get to opt out of being told."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRIGGERS 3 AND 4: THE SETTING IS REAL, THE TRIGGER IS NOT — YET
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ownMatterJudgment` and `unknownListing` are stored and returned honestly.
 * Nothing in the codebase writes an `alerts` row of either kind today — trigger
 * 3 awaits the OCR pipeline (`POST /ocr/jobs`, still SPECCED), trigger 4 awaits
 * a cause-list-to-matter matcher that does not exist yet (see
 * `docs/FOUNDER_QUEUE.md` §The advocate-facing cause-list endpoint). Toggling
 * either setting today changes nothing observable, honestly, rather than
 * pretending a producer exists.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

export const alertsQuery = z.object({ since: z.string().datetime().optional() });

export const alertSettingsBody = z
  .object({
    savedAuthorityMoved: z.boolean().optional(),
    ownMatterJudgment: z.boolean().optional(),
    unknownListing: z.boolean().optional(),
  })
  // Any OTHER key — most importantly an attempt to send a key for trigger 2 —
  // is rejected outright rather than silently dropped. A silently-ignored
  // field reads to the client as "saved", which is the one thing it must not.
  .strict();

type AlertRow = {
  id: string;
  kind: 'saved_authority_moved' | 'filed_citation_moved';
  severity: 'immediate' | 'batched';
  judgment_id: string | null;
  matter_id: string | null;
  payload: {
    fromStatus: string;
    toStatus: string;
    judgmentTitle: string;
    overruledParas: number[] | null;
  };
  created_at: string;
  read_at: string | null;
  /** Live — never taken from the payload. Null only if the judgment was deleted. */
  current_overruled_status: string | null;
};

const shapeAlert = (r: AlertRow) => ({
  id: r.id,
  kind: r.kind,
  severity: r.severity,
  judgmentId: r.judgment_id,
  matterId: r.matter_id,
  fromStatus: r.payload.fromStatus,
  toStatus: r.payload.toStatus,
  judgmentTitle: r.payload.judgmentTitle,
  overruledParas: r.payload.overruledParas,
  /** What the corpus says RIGHT NOW — may differ from `toStatus` above. */
  currentOverruledStatus: r.current_overruled_status,
  createdAt: r.created_at,
  readAt: r.read_at,
});

export async function listAlerts(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  query: z.infer<typeof alertsQuery>,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'alerts belong to an advocate', 401);
  }

  const rows = await sql<AlertRow[]>`
    SELECT a.id, a.kind, a.severity, a.judgment_id, a.matter_id, a.payload,
           ${sql.unsafe(isoColumn('a.created_at'))} AS created_at,
           ${sql.unsafe(isoColumn('a.read_at'))} AS read_at,
           j.overruled_status::text AS current_overruled_status
    FROM alerts a
    LEFT JOIN judgments j ON j.id = a.judgment_id
    WHERE a.user_id = ${userId}
      ${query.since ? sql`AND a.created_at > ${query.since}::timestamptz` : sql``}
    ORDER BY a.created_at DESC
  `;

  const unreadCount = rows.filter((r) => r.read_at === null).length;

  return ok(c, { alerts: rows.map(shapeAlert), unreadCount });
}

export async function markAlertRead(
  c: Context,
  sql: Sql,
  alertId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'alerts belong to an advocate', 401);
  }

  // Scoped by user_id in the same WHERE, not a separate ownership lookup —
  // "does not exist" and "is not yours" answer identically, matching every
  // other per-user resource in this service.
  const [row] = await sql<{ id: string }[]>`
    UPDATE alerts SET read_at = coalesce(read_at, now())
    WHERE id = ${alertId} AND user_id = ${userId}
    RETURNING id
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no alert with that id', 404);

  return ok(c, { ok: true });
}

type SettingsRow = {
  alert_saved_authority_moved: boolean;
  alert_own_matter_judgment: boolean;
  alert_unknown_listing: boolean;
};

const shapeSettings = (r: SettingsRow) => ({
  savedAuthorityMoved: r.alert_saved_authority_moved,
  ownMatterJudgment: r.alert_own_matter_judgment,
  unknownListing: r.alert_unknown_listing,
});

export async function getAlertSettings(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'alert settings belong to an advocate', 401);
  }
  const [row] = await sql<SettingsRow[]>`
    SELECT alert_saved_authority_moved, alert_own_matter_judgment, alert_unknown_listing
    FROM users WHERE id = ${userId}`;
  if (!row) return fail(c, 'NOT_FOUND', 'no user with that id', 404);

  return ok(c, { settings: shapeSettings(row) });
}

export async function patchAlertSettings(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  body: z.infer<typeof alertSettingsBody>,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'alert settings belong to an advocate', 401);
  }

  // Each field is COALESCE'd against the existing value rather than assembled
  // conditionally in application code — an omitted key must leave the column
  // untouched, and building the SET list in JS is exactly the kind of missed
  // branch that made PD-4's note_visibility default a column-level rule
  // instead of an application one.
  const [row] = await sql<SettingsRow[]>`
    UPDATE users SET
      alert_saved_authority_moved = coalesce(${body.savedAuthorityMoved ?? null}, alert_saved_authority_moved),
      alert_own_matter_judgment   = coalesce(${body.ownMatterJudgment ?? null}, alert_own_matter_judgment),
      alert_unknown_listing       = coalesce(${body.unknownListing ?? null}, alert_unknown_listing)
    WHERE id = ${userId}
    RETURNING alert_saved_authority_moved, alert_own_matter_judgment, alert_unknown_listing
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no user with that id', 404);

  return ok(c, { settings: shapeSettings(row) });
}
