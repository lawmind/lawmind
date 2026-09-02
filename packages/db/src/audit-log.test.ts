/**
 * The append-only proof. This is a gate item, not a nice-to-have: every privileged
 * action in S6 depends on `audit_log` being immutable, and retrofitting the
 * enforcement after data exists is painful.
 *
 * Each case runs inside a transaction that is rolled back, so nothing persists —
 * including the audit row, which by design could not have been deleted.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import type { TransactionSql } from 'postgres';
import postgres from 'postgres';

import { databaseUrl } from './env.ts';

const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} });

/** Postgres maps the `restrict_violation` errcode to SQLSTATE 23001. */
const RESTRICT_VIOLATION = '23001';

const rollback = new Error('rollback');

/** Runs `fn` in a transaction and always rolls it back, returning what `fn` returned. */
async function inRolledBackTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  let result!: T;
  await sql
    .begin(async (tx) => {
      result = await fn(tx);
      throw rollback;
    })
    .catch((error: unknown) => {
      if (error !== rollback) throw error;
    });
  return result;
}

/**
 * This run's own marker, on every row this suite writes.
 *
 * It exists so the cleanup proof below can ask about THIS SUITE's rows instead
 * of about the whole table — see the note on that test. Unique per process, so
 * two runs against the same database cannot read each other's residue as their
 * own.
 */
const TAG = `append-only-test-${process.pid}-${Date.now()}`;

/** Seeds the FK parent and one audit row, returning the row's id. */
async function seedAuditRow(tx: TransactionSql): Promise<string> {
  const [user] = await tx<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email)
    VALUES (${TAG}, 'Test Advocate', '+910000000000',
            'append-only-test@example.invalid')
    RETURNING id
  `;
  assert.ok(user, 'seed user was not inserted');

  const [entry] = await tx<{ id: string }[]>`
    INSERT INTO audit_log (actor_user_id, actor_role, action, target_type, target_id, reason)
    VALUES (${user.id}, 'founder', 'platform.kill_switch.toggle', 'kill_switch', 'search',
            ${TAG})
    RETURNING id
  `;
  assert.ok(entry, 'seed audit row was not inserted');
  return entry.id;
}

/**
 * The statement runs in a savepoint: the RAISE aborts that subtransaction only, so
 * the surrounding transaction stays usable.
 */
async function raisedBy(
  tx: TransactionSql,
  statement: (sp: TransactionSql) => Promise<unknown>,
): Promise<{ code?: string; message?: string }> {
  try {
    await tx.savepoint(statement);
  } catch (error) {
    return error as { code?: string; message?: string };
  }
  throw new assert.AssertionError({ message: 'expected the statement to raise, it succeeded' });
}

describe('audit_log is append-only', () => {
  after(async () => {
    await sql.end();
  });

  it('rejects UPDATE', async () => {
    const error = await inRolledBackTx(async (tx) => {
      const id = await seedAuditRow(tx);
      return raisedBy(tx, (sp) => sp`UPDATE audit_log SET reason = 'tampered' WHERE id = ${id}`);
    });
    assert.equal(error.code, RESTRICT_VIOLATION);
    assert.match(String(error.message), /append-only: UPDATE is not permitted/);
  });

  it('rejects DELETE', async () => {
    const error = await inRolledBackTx(async (tx) => {
      const id = await seedAuditRow(tx);
      return raisedBy(tx, (sp) => sp`DELETE FROM audit_log WHERE id = ${id}`);
    });
    assert.equal(error.code, RESTRICT_VIOLATION);
    assert.match(String(error.message), /append-only: DELETE is not permitted/);
  });

  it('rejects TRUNCATE — row triggers do not fire on it', async () => {
    const error = await inRolledBackTx(async (tx) => {
      await seedAuditRow(tx);
      return raisedBy(tx, (sp) => sp`TRUNCATE audit_log`);
    });
    assert.equal(error.code, RESTRICT_VIOLATION);
    assert.match(String(error.message), /append-only: TRUNCATE is not permitted/);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THIS ASKS ABOUT THIS SUITE'S ROWS, NOT ABOUT THE WHOLE TABLE
   * ───────────────────────────────────────────────────────────────────────────
   *
   * It used to assert `count(*) = 0` over all of `audit_log`, and on any
   * database that has ever served a request that assertion can never pass
   * again: `audit_log` is APPEND-ONLY by design — REVOKE'd UPDATE/DELETE plus a
   * raising trigger (`0002_audit_log_append_only.sql`) — so the first admin
   * action anything performs makes it permanently red. Measured 1 September
   * 2026 on the shared local database: 966 rows, 950 of them predating that
   * session, earliest 9 August 2026.
   *
   * That is a false red, and a false red on a governance test is expensive
   * twice: CI stops carrying information, and the one table whose immutability
   * is a gate item is the one whose suite everybody learns to ignore.
   *
   * The property the file's own header actually claims is narrower and true:
   * *"Each case runs inside a transaction that is rolled back, so nothing
   * persists."* Nothing THIS SUITE wrote. So the assertion is now about
   * identity — `TAG`, unique to this process — and it still fails for the real
   * defect it was written to catch: a case that forgot its rollback, or a
   * rollback the append-only trigger somehow let through, leaves a tagged row
   * and this goes red.
   *
   * Deleting the pre-existing rows to make the old assertion pass was never an
   * option. They are audit history, the table refuses DELETE, and the refusal
   * is the point.
   */
  it('leaves no rows of its own behind', async () => {
    const [entries] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM audit_log WHERE reason = ${TAG}
    `;
    assert.equal(entries?.count, '0', 'a rolled-back case left its audit row behind');

    // The FK parent too: a seeded user surviving would mean the transaction
    // committed, which is the same defect wearing a different table's name.
    const [users] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM users WHERE auth_id = ${TAG}
    `;
    assert.equal(users?.count, '0', 'a rolled-back case left its seed user behind');
  });
});
