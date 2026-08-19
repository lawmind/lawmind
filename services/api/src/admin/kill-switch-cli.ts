/**
 * `pnpm --filter @lawmind/api kill-switch` — throw a platform kill switch from
 * the command line, with the same transaction and the same audit trail as
 * `POST /admin/platform/kill-switches/:key`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AND WHY IT IS NOT A SHORTCUT AROUND THE ENDPOINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The founder confirmed the eCourts permission and asked for `ecourts_harvest`
 * to be switched ON (bus 0617). The endpoint that does this needs a running API
 * and an authenticated session, and during the Railway exit there is neither.
 *
 * The tempting shortcut is one `UPDATE platform_config`. **That would break the
 * single invariant this surface exists to hold** — `admin/platform.ts`: *"a
 * config change with no audit trail is worse than no change, because it is
 * unaccountable rather than merely absent."* And of the six switches,
 * `ecourts_harvest` is the one where accountability is not an internal nicety:
 * it authorises contacting a court's systems under a registrar's written grant,
 * and if the registrar ever asks who turned it on, "we are not sure" is the
 * answer that loses the grant.
 *
 * So this does exactly what the endpoint does — config row and audit row in ONE
 * transaction, both or neither — and it **requires a real `--actor`**. It will
 * not invent one, and it will not accept one that is not in `users`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SWITCH IS NOT THE PERMISSION, AND THIS PRINTS THE DIFFERENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `guard.ts` checks terms-on-file and expiry BEFORE the switch, precisely so
 * that *"an operator who turns the switch on before the conditions are
 * transcribed has not granted themselves permission, they have only turned a
 * handle."* This prints `decide()`'s verdict after the write, so the operator
 * sees what the switch actually bought rather than assuming.
 *
 *   pnpm --filter @lawmind/api kill-switch ecourts_harvest --on \
 *     --actor <uuid> --reason "founder confirmed the grant, 17 Aug 2026"
 */
import postgres from 'postgres';

import { decide } from '../court/guard.ts';
import { writeAudit } from './audit.ts';

const KILL_SWITCH_KEYS = [
  'search',
  'drafting',
  'briefings',
  'ocr_intake',
  'signups',
  'ecourts_harvest',
] as const;

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

const key = process.argv[2];
const on = process.argv.includes('--on');
const off = process.argv.includes('--off');
const actor = arg('actor');
const reason = arg('reason');
/** Prints what WOULD happen and writes nothing. The default, deliberately. */
const apply = process.argv.includes('--apply');

function usage(message: string): never {
  console.error(`${message}\n`);
  console.error(
    'usage: kill-switch <key> (--on|--off) --actor <uuid> --reason "<why>" [--apply]\n' +
      `  keys: ${KILL_SWITCH_KEYS.join(', ')}\n\n` +
      '  --actor is a users.id and is MANDATORY. audit_log.actor_user_id is NOT NULL,\n' +
      '  and naming an arbitrary user as the person who authorised a change is a false\n' +
      '  audit record, which is worse than no record at all.',
  );
  process.exit(2);
}

if (!key || !(KILL_SWITCH_KEYS as readonly string[]).includes(key)) {
  usage(`unknown kill switch: ${key ?? '(none given)'}`);
}
if (on === off) usage('give exactly one of --on or --off');
if (!actor) usage('--actor is required');
if (!reason) usage('--reason is required (mirrors the database CHECK and the Zod schema)');

const url =
  process.env['LOCAL_DATABASE_URL'] ??
  process.env['CORPUS_DATABASE_URL'] ??
  process.env['DATABASE_URL'];
if (!url) {
  console.error('no database URL is set (LOCAL_DATABASE_URL / CORPUS_DATABASE_URL / DATABASE_URL)');
  process.exit(2);
}

const sql = postgres(url, {
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  max: 1,
});

try {
  const [who] = await sql<{ id: string; email: string | null; full_name: string | null }[]>`
    SELECT id, email, full_name FROM users WHERE id = ${actor}::uuid`;
  if (!who) {
    console.error(
      `no user ${actor}. The audit trail must name a real person; this refuses rather than\n` +
        'writing an unattributable change to a privileged switch.',
    );
    process.exit(1);
  }

  const [before] = await sql<{ enabled: boolean; reason: string | null }[]>`
    SELECT enabled, reason FROM platform_config WHERE key = ${key} AND kind = 'kill_switch'`;

  console.log(`switch   ${key}`);
  console.log(`actor    ${who.id}  ${who.full_name ?? '(no name)'}  ${who.email ?? '(no email)'}`);
  console.log(`before   enabled=${before?.enabled ?? false}${before ? '' : '  (no row — reads as OFF)'}`);
  console.log(`after    enabled=${on}`);
  console.log(`reason   ${reason}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    const [row] = await tx<{ enabled: boolean }[]>`
      INSERT INTO platform_config (key, kind, enabled, reason, updated_by_user_id, updated_at)
      VALUES (${key}, 'kill_switch', ${on}, ${reason}, ${actor}::uuid, now())
      ON CONFLICT (key) DO UPDATE SET
        enabled = excluded.enabled,
        reason = excluded.reason,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now()
      RETURNING enabled`;

    // Same transaction as the write. Both or neither — an unaccountable config
    // change is worse than no change.
    await writeAudit(tx, {
      actorUserId: actor,
      actorRole: 'admin',
      action: 'platform.kill_switch.toggle',
      targetType: 'platform_config',
      targetId: key,
      before: before ? { enabled: before.enabled, reason: before.reason } : null,
      after: { enabled: row?.enabled ?? on, reason },
      reason,
    });
  });

  const [confirmed] = await sql<{ enabled: boolean }[]>`
    SELECT enabled FROM platform_config WHERE key = ${key} AND kind = 'kill_switch'`;
  console.log(`\nWRITTEN — ${key}.enabled is now ${confirmed?.enabled}`);

  /* What the switch actually bought. `guard.ts` checks terms-on-file and expiry
   * BEFORE the switch, so a switch thrown without transcribed conditions changes
   * nothing — the operator has "only turned a handle". Printed rather than
   * assumed. */
  if (key === 'ecourts_harvest') {
    const decision = await decide(sql, 'Supreme Court of India');
    console.log(
      decision.allowed
        ? '\nguard: ALLOWED for a sample court — every lock is now satisfied'
        : `\nguard: still REFUSED (${decision.reason}) — ${decision.detail}`,
    );
    console.log(
      '\nNOTE: nothing harvests on a timer. The only caller of fetchCauseList is\n' +
        'retryCauseList, an attributable admin request. This switch grants permission;\n' +
        'it does not start traffic.',
    );
  }
} finally {
  await sql.end();
}
