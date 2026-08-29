/**
 * Correct the eCourts kill-switch audit history by APPENDING to it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS BEING CORRECTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `audit_log` row `b9a96a5c-4981-44c8-b0c2-5a1024dc746f` turned `ecourts_harvest`
 * OFF on 29 Aug 2026 at 13:55:47.221Z and gave this reason:
 *
 *   "R10 hygiene closure 29 Aug 2026: switch OFF; an interrupted LCC no-network
 *    raw-capture test temporarily enabled it; ..."
 *
 * That explanation is wrong about WHY the switch was on. The immediately
 * preceding row (`56d3a886`, 13:28:03.913Z) is the founder's deliberate
 * activation under `CLAUDE.md` §6a, taken through the audited kill-switch path
 * by the designated founder actor. An interrupted test HAD left the switch on
 * earlier in the day — that is the row before it, at 13:28's `before.reason`
 * ("restored after an aborted LCC raw-capture test left it on") — and the two
 * were conflated. The effect was that a founder decision was reversed and
 * recorded as tidying up after a test.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS APPENDS AND WILL NEVER UPDATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `audit_log` is append-only by REVOKE and by a raising trigger
 * (`0002_audit_log_append_only.sql`), and that is the property the table exists
 * for. A record that can be corrected in place is not a record. So the wrong
 * reason stays exactly where it is, permanently, and this adds a row that says
 * what was wrong about it — the same shape as the `account.identity_correction`
 * precedent already in the table.
 *
 * Idempotent: it refuses to append a second copy of itself.
 *
 *   node --import tsx scripts/ecourts-audit-correction.mts            # dry run
 *   node --import tsx scripts/ecourts-audit-correction.mts --apply
 */
import { readFileSync } from 'node:fs';

import postgres from 'postgres';

/** The row whose stated reason is being corrected. */
const CORRECTED_AUDIT_ID = 'b9a96a5c-4981-44c8-b0c2-5a1024dc746f';
/** The founder's deliberate activation that the corrected row mis-described. */
const FOUNDER_ENABLE_AUDIT_ID = '56d3a886-4cab-43b1-be46-2cf908cbaddc';
const ACTION = 'platform.kill_switch.record_correction';

function envValue(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

const url = envValue('DATABASE_URL');
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}
const apply = process.argv.includes('--apply');

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const [corrected] = await sql<
    { id: string; actor_user_id: string; reason: string | null; created_at: Date }[]
  >`SELECT id, actor_user_id, reason, created_at FROM audit_log WHERE id = ${CORRECTED_AUDIT_ID}`;
  if (!corrected) {
    console.error(`audit row ${CORRECTED_AUDIT_ID} does not exist on this database`);
    process.exit(1);
  }
  const [founderEnable] = await sql<
    { id: string; actor_user_id: string; reason: string | null; created_at: Date }[]
  >`SELECT id, actor_user_id, reason, created_at FROM audit_log WHERE id = ${FOUNDER_ENABLE_AUDIT_ID}`;
  if (!founderEnable) {
    console.error(`audit row ${FOUNDER_ENABLE_AUDIT_ID} does not exist on this database`);
    process.exit(1);
  }

  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM audit_log
     WHERE action = ${ACTION} AND target_type = 'audit_log' AND target_id = ${CORRECTED_AUDIT_ID}
     LIMIT 1
  `;
  if (existing) {
    console.log(`already recorded — audit_log ${existing.id}. Nothing to do.`);
    process.exit(0);
  }

  /**
   * Counted, not asserted. The correction states that no eCourts request was
   * made while the switch was on, and that claim is only worth writing into an
   * audit record if it is read off the ledger at the moment of writing.
   */
  const [traffic] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ecourts_fetch_ledger
     WHERE requested_at >= ${founderEnable.created_at}
       AND requested_at <= ${corrected.created_at}
       AND outcome <> 'refused'
       AND endpoint NOT LIKE 'test://%'
  `;

  const correction = {
    correctsAuditId: CORRECTED_AUDIT_ID,
    correctsStatedReason: corrected.reason,
    finding:
      'the eCourts harvest switch was ON at the time of the corrected row because the founder ' +
      `deliberately enabled it (audit_log ${FOUNDER_ENABLE_AUDIT_ID}, ${founderEnable.created_at.toISOString()}) ` +
      'under CLAUDE.md §6a, through the audited kill-switch path and by the designated founder actor. ' +
      'It was NOT left on by an interrupted test. An interrupted test had left it on EARLIER the ' +
      "same day, and the corrected row's explanation conflated the two, so a founder decision was " +
      'reversed and recorded as test cleanup.',
    networkRequestsWhileOn: traffic?.n ?? 0,
    networkRequestsWhileOnNote:
      'counted from ecourts_fetch_ledger over the interval between the two rows, excluding ' +
      'refusals (which never reached a host) and test:// rows (which are non-network by identity)',
    historyIsUnchanged:
      'no audit row was rewritten or deleted; audit_log is append-only by REVOKE and trigger ' +
      '(0002_audit_log_append_only.sql) and the incorrect reason remains in the record permanently',
  };

  console.log(JSON.stringify(correction, null, 2));
  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  const [written] = await sql<{ id: string }[]>`
    INSERT INTO audit_log (actor_user_id, actor_role, action, target_type, target_id, before, after, reason)
    VALUES (
      -- The actor of the row being corrected. Naming anyone else would put a
      -- person's name on a statement they did not make.
      ${corrected.actor_user_id}::uuid, 'admin', ${ACTION}, 'audit_log', ${CORRECTED_AUDIT_ID},
      ${sql.json({ statedReason: corrected.reason })},
      ${sql.json(correction)},
      ${'correcting the recorded explanation for the 29 Aug 2026 eCourts kill-switch OFF: the prior ON state was the founder’s deliberate activation, not an interrupted test'}
    )
    RETURNING id
  `;
  console.log(`\nWRITTEN — audit_log ${written!.id}`);
} finally {
  await sql.end({ timeout: 5 });
}
