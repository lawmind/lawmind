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

/** Seeds the FK parent and one audit row, returning the row's id. */
async function seedAuditRow(tx: TransactionSql): Promise<string> {
  const [user] = await tx<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email)
    VALUES (${`append-only-test-${Date.now()}`}, 'Test Advocate', '+910000000000',
            'append-only-test@example.invalid')
    RETURNING id
  `;
  assert.ok(user, 'seed user was not inserted');

  const [entry] = await tx<{ id: string }[]>`
    INSERT INTO audit_log (actor_user_id, actor_role, action, target_type, target_id, reason)
    VALUES (${user.id}, 'founder', 'platform.kill_switch.toggle', 'kill_switch', 'search',
            'append-only proof')
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

  it('leaves no rows behind', async () => {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM audit_log
    `;
    assert.equal(row?.count, '0');
  });
});
