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
import { alertKindEnum } from '@lawmind/db/schema';
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
  /** The CORPUS role; defaults to `sql` so single-database use is unchanged. */
  corpusSql: Sql = sql,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'alerts belong to an advocate', 401);
  }

  /**
   * The alerts are the advocate's and come from the USER database; the current
   * overruled status is the corpus's and is read LIVE beside them — the same
   * rule everywhere else, now expressed as two reads because the two rows live
   * in two databases (NEW3 R20, `SOFT_CORPUS_REFERENCE`).
   *
   * The `LEFT JOIN` this replaces was already tolerant of a missing judgment,
   * and so is this: an alert whose target the active corpus generation does not
   * carry keeps `current_overruled_status: null`, exactly as before, and is
   * never dropped from the list.
   */
  const rows = await sql<Omit<AlertRow, 'current_overruled_status'>[]>`
    SELECT a.id, a.kind, a.severity, a.judgment_id, a.matter_id, a.payload,
           ${sql.unsafe(isoColumn('a.created_at'))} AS created_at,
           ${sql.unsafe(isoColumn('a.read_at'))} AS read_at
    FROM alerts a
    WHERE a.user_id = ${userId}
      ${query.since ? sql`AND a.created_at > (${query.since}::text)::timestamptz` : sql``}
    ORDER BY a.created_at DESC
  `;

  const ids = [
    ...new Set(rows.map((r) => r.judgment_id).filter((id): id is string => id !== null)),
  ];
  const status = new Map<string, string>();
  if (ids.length > 0) {
    for (const j of await corpusSql<{ id: string; overruled_status: string }[]>`
      SELECT j.id, j.overruled_status::text AS overruled_status
        FROM judgments j WHERE j.id = ANY(${ids}::uuid[])`) {
      status.set(j.id, j.overruled_status);
    }
  }

  const hydrated: AlertRow[] = rows.map((r) => ({
    ...r,
    current_overruled_status: r.judgment_id === null ? null : (status.get(r.judgment_id) ?? null),
  }));

  const unreadCount = hydrated.filter((r) => r.read_at === null).length;

  return ok(c, { alerts: hydrated.map(shapeAlert), unreadCount });
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

/**
 * Which `alert_kind` each toggle would produce.
 *
 * Two of these values **do not exist in the enum**, and that is the point. The
 * columns exist, `PATCH /me/alerts` persists them, and the app shows a switch —
 * so today an advocate can turn on *"tell me when a matter is listed on a date
 * I did not know about"*, see it save, and be told nothing, ever. **They find
 * out by missing a hearing.**
 *
 * `scripts/check-alert-coverage.mjs` has reported this since it was written:
 * 2 of 4 PD-5 triggers can fire. What was missing was any way for the product
 * to say so.
 */
const KIND_FOR_SETTING = {
  savedAuthorityMoved: 'saved_authority_moved',
  ownMatterJudgment: 'own_matter_judgment',
  unknownListing: 'unknown_listing',
} as const;

/**
 * Settings whose alert can never be produced, **derived from the enum rather
 * than listed**.
 *
 * A hard-coded list would be correct today and wrong the moment a producer
 * ships, and the failure would be silent in the worst direction: a working
 * alert still announcing itself as unavailable, or — after someone "tidied" the
 * list — a broken one announcing itself as working. Deriving it means adding
 * the enum value is the *only* thing anyone has to remember.
 */
export function unavailableSettings(kinds: readonly string[]): string[] {
  return Object.entries(KIND_FOR_SETTING)
    .filter(([, kind]) => !kinds.includes(kind))
    .map(([setting]) => setting);
}

const shapeSettings = (r: SettingsRow, unavailable: string[]) => ({
  savedAuthorityMoved: r.alert_saved_authority_moved,
  ownMatterJudgment: r.alert_own_matter_judgment,
  unknownListing: r.alert_unknown_listing,
  /**
   * **Additive and provisional**, per `CLAUDE.md` §6b: a client that ignores it
   * behaves exactly as before. A client that reads it can stop presenting a
   * switch that does nothing. `docs/API_CONTRACTS.md` records the shape.
   */
  unavailable,
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

  return ok(c, { settings: shapeSettings(row, unavailableSettings(alertKindEnum.enumValues)) });
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

  return ok(c, { settings: shapeSettings(row, unavailableSettings(alertKindEnum.enumValues)) });
}
