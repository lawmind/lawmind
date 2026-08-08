/**
 * Platform controls — maintenance, kill switches, feature flags.
 *
 * `docs/API_CONTRACTS.md` §Platform controls. One row per key in
 * `platform_config`; current state only, history lives in `audit_log`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIX KILL SWITCHES, NOT FIVE — `SCHEMA_TRUTH.md` IS THE AUTHORITY THAT WON
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `API_CONTRACTS.md`'s own prose still says "five kill switches... search ·
 * drafting · briefings · ocr_intake · signups." `SCHEMA_TRUTH.md` — the file
 * this project designates the only authority on data shapes — says six:
 * `ecourts_harvest` joined the set 7 Aug 2026, and the database's own CHECK
 * constraint (`platform_config_kill_switch_keys`,
 * `0013_ecourts_and_cause_lists.sql`) already enforces six. Built against the
 * constraint that is actually live, not the paragraph that has not caught up to
 * it — the stale prose is corrected in the same commit as this file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY WRITE HERE IS AN AUDIT WRITE FIRST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * "A kill switch changes what every advocate can do, and 'who turned off
 * drafting, and when' must be answerable months later." Every POST here opens
 * one transaction, writes the config row AND the audit row, and rolls back
 * both if either fails — a config change with no audit trail is worse than no
 * change, because it is unaccountable rather than merely absent.
 *
 * `reason` is mandatory on kill switches at the API layer (Zod) AND at the
 * database layer (`platform_config_kill_switch_reason`) — belt and suspenders,
 * because a switch thrown with no reason is unreconstructable by whoever has
 * to decide at 4am whether to throw it back.
 *
 * `ecourts_harvest` specifically: turning this ON here does NOT bring the
 * eCourts adapter into service by itself. `services/api/src/court/
 * authorisation.ts` must independently hold the grant's transcribed terms —
 * "if the authorisation's terms are not in the repo, the switch stays off,"
 * enforced in `guard.ts`, not here. This endpoint only ever flips the stored
 * bit and records why.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { writeAudit } from './audit.ts';

/** Fixed set, matching the database CHECK constraint exactly. */
const KILL_SWITCH_KEYS = [
  'search',
  'drafting',
  'briefings',
  'ocr_intake',
  'signups',
  'ecourts_harvest',
] as const;
export type KillSwitchKey = (typeof KILL_SWITCH_KEYS)[number];

export const maintenanceBody = z
  .object({ enabled: z.boolean(), message: z.string().max(500).optional() })
  .strict();

export const killSwitchBody = z
  .object({
    enabled: z.boolean(),
    // Mandatory at this layer too, mirroring the database CHECK — a caller
    // gets a clean 400 naming the field, not a raw constraint-violation 500.
    reason: z.string().min(1).max(1000),
  })
  .strict();

export const flagBody = z
  .object({
    enabled: z.boolean(),
    rolloutPercent: z.number().int().min(0).max(100).optional(),
  })
  .strict();

type ConfigRow = {
  key: string;
  kind: 'maintenance' | 'kill_switch' | 'flag';
  enabled: boolean;
  rollout_percent: number | null;
  message: string | null;
  reason: string | null;
  updated_by_user_id: string | null;
  updated_at: string;
};

function shapeConfig(r: ConfigRow) {
  return {
    key: r.key,
    enabled: r.enabled,
    rolloutPercent: r.rollout_percent,
    message: r.message,
    reason: r.reason,
    updatedBy: r.updated_by_user_id,
    updatedAt: r.updated_at,
  };
}

export async function getPlatform(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  // See admin/audit.ts's module note: this gates on authentication, which is
  // the only check available today — not yet a real admin-role check.
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'platform controls are a privileged surface', 401);
  }

  const rows = await sql<ConfigRow[]>`
    SELECT key, kind, enabled, rollout_percent, message, reason,
           updated_by_user_id, ${sql.unsafe(isoColumn('updated_at'))} AS updated_at
    FROM platform_config
    ORDER BY kind, key
  `;

  const maintenance = rows.find((r) => r.kind === 'maintenance');
  const byKillSwitchKey = new Map(
    rows.filter((r) => r.kind === 'kill_switch').map((r) => [r.key, r]),
  );

  return ok(c, {
    // A missing maintenance row reads as "off, never configured" — the same
    // absent-is-not-negative rule as everywhere else in this codebase.
    maintenance: maintenance ? shapeConfig(maintenance) : { enabled: false, message: null },
    // ALL SIX keys, always — only `ecourts_harvest` is seeded by a migration
    // (0013), so the other five have no row until someone toggles them for the
    // first time. Silently listing only the rows that happen to exist would
    // read to an admin as "these five switches are not tracked", when the
    // truth is "off, never configured" — same distinction the maintenance
    // fallback already makes, applied consistently across the fixed set.
    killSwitches: KILL_SWITCH_KEYS.map((key) => {
      const row = byKillSwitchKey.get(key);
      return row
        ? shapeConfig(row)
        : {
            key,
            enabled: false,
            rolloutPercent: null,
            message: null,
            reason: null,
            updatedBy: null,
            updatedAt: null,
          };
    }),
    flags: rows.filter((r) => r.kind === 'flag').map(shapeConfig),
  });
}

export async function setMaintenance(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  body: z.infer<typeof maintenanceBody>,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'platform controls are a privileged surface', 401);
  }

  const result = await sql.begin(async (tx) => {
    const [before] = await tx<ConfigRow[]>`
      SELECT key, kind, enabled, rollout_percent, message, reason,
             updated_by_user_id, ${tx.unsafe(isoColumn('updated_at'))} AS updated_at
      FROM platform_config WHERE key = 'maintenance' AND kind = 'maintenance'`;

    const [row] = await tx<ConfigRow[]>`
      INSERT INTO platform_config (key, kind, enabled, message, updated_by_user_id, updated_at)
      VALUES ('maintenance', 'maintenance', ${body.enabled}, ${body.message ?? null}, ${userId}, now())
      ON CONFLICT (key) DO UPDATE SET
        enabled = excluded.enabled, message = excluded.message,
        updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at
      RETURNING key, kind, enabled, rollout_percent, message, reason,
                updated_by_user_id, ${tx.unsafe(isoColumn('updated_at'))} AS updated_at
    `;

    await writeAudit(tx, {
      actorUserId: userId,
      actorRole: 'admin',
      action: 'platform.maintenance.toggle',
      targetType: 'platform_config',
      targetId: 'maintenance',
      before: before ? { enabled: before.enabled, message: before.message } : null,
      after: { enabled: row!.enabled, message: row!.message },
      reason: body.message ?? null,
    });

    return row!;
  });

  return ok(c, { maintenance: shapeConfig(result) });
}

export async function setKillSwitch(
  c: Context,
  sql: Sql,
  key: string,
  userId: string | undefined,
  body: z.infer<typeof killSwitchBody>,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'platform controls are a privileged surface', 401);
  }
  // Rejected here with the full set named, before the database's own CHECK
  // constraint would refuse it anonymously — "an unknown key is a 400, never
  // an implicit create."
  if (!KILL_SWITCH_KEYS.includes(key as KillSwitchKey)) {
    return fail(
      c,
      'UNKNOWN_KILL_SWITCH',
      `"${key}" is not a kill switch. The fixed set is: ${KILL_SWITCH_KEYS.join(', ')}`,
      400,
    );
  }

  const result = await sql.begin(async (tx) => {
    const [before] = await tx<ConfigRow[]>`
      SELECT key, kind, enabled, rollout_percent, message, reason,
             updated_by_user_id, ${tx.unsafe(isoColumn('updated_at'))} AS updated_at
      FROM platform_config WHERE key = ${key} AND kind = 'kill_switch'`;

    const [row] = await tx<ConfigRow[]>`
      INSERT INTO platform_config (key, kind, enabled, reason, updated_by_user_id, updated_at)
      VALUES (${key}, 'kill_switch', ${body.enabled}, ${body.reason}, ${userId}, now())
      ON CONFLICT (key) DO UPDATE SET
        enabled = excluded.enabled, reason = excluded.reason,
        updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at
      RETURNING key, kind, enabled, rollout_percent, message, reason,
                updated_by_user_id, ${tx.unsafe(isoColumn('updated_at'))} AS updated_at
    `;

    await writeAudit(tx, {
      actorUserId: userId,
      actorRole: 'admin',
      action: 'platform.kill_switch.toggle',
      targetType: 'platform_config',
      targetId: key,
      before: before ? { enabled: before.enabled } : null,
      after: { enabled: row!.enabled },
      reason: body.reason,
    });

    return row!;
  });

  return ok(c, { killSwitch: shapeConfig(result) });
}

export async function setFlag(
  c: Context,
  sql: Sql,
  key: string,
  userId: string | undefined,
  body: z.infer<typeof flagBody>,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'platform controls are a privileged surface', 401);
  }

  const result = await sql.begin(async (tx) => {
    const [before] = await tx<ConfigRow[]>`
      SELECT key, kind, enabled, rollout_percent, message, reason,
             updated_by_user_id, ${tx.unsafe(isoColumn('updated_at'))} AS updated_at
      FROM platform_config WHERE key = ${key} AND kind = 'flag'`;

    const [row] = await tx<ConfigRow[]>`
      INSERT INTO platform_config (key, kind, enabled, rollout_percent, updated_by_user_id, updated_at)
      VALUES (${key}, 'flag', ${body.enabled}, ${body.rolloutPercent ?? null}, ${userId}, now())
      ON CONFLICT (key) DO UPDATE SET
        enabled = excluded.enabled, rollout_percent = excluded.rollout_percent,
        updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at
      RETURNING key, kind, enabled, rollout_percent, message, reason,
                updated_by_user_id, ${tx.unsafe(isoColumn('updated_at'))} AS updated_at
    `;

    await writeAudit(tx, {
      actorUserId: userId,
      actorRole: 'admin',
      action: 'platform.flag.set',
      targetType: 'platform_config',
      targetId: key,
      before: before ? { enabled: before.enabled, rolloutPercent: before.rollout_percent } : null,
      after: { enabled: row!.enabled, rolloutPercent: row!.rollout_percent },
      reason: null,
    });

    return row!;
  });

  return ok(c, { flag: shapeConfig(result) });
}
