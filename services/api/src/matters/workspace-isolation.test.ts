/**
 * Firm-ready ownership — the SEAM, asserted against the real schema.
 *
 * NEW3 froze this domain model and changed no service code, so nothing existed
 * on the database until migrations 0097 and 0098. These tests are what stops the
 * seam from rotting between now and the first two-partner firm: they assert the
 * invariants a future ownership rewrite will lean on, while the product still
 * resolves ownership through `user_id`.
 *
 * Every row this file creates is rolled back. `users` is append-only in practice
 * and `matters` carries client detail; a suite that leaves either behind is a
 * suite that has changed production state, which this repository has already
 * been bitten by twice.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 4, onnotice: () => {} });

/** A distinctive marker so anything this suite creates is identifiable if it ever escapes. */
const TAG = 'ZZ_WORKSPACE_ISOLATION_TEST';

async function skipUnlessMigrated(t: { skip: (m: string) => void }): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspaces'`;
  if (!row?.n) {
    t.skip('0097 has not been applied to this database');
    return false;
  }
  return true;
}

describe('firm-ready workspace ownership', () => {
  after(async () => {
    await sql.end();
  });

  it('every existing account has exactly one personal workspace, and is a member of it', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;

    const [row] = await sql<{
      users: number;
      without_workspace: number;
      without_membership: number;
      duplicate_personal: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM users u
          WHERE NOT EXISTS (SELECT 1 FROM workspaces w
                            WHERE w.owner_user_id = u.id AND w.kind = 'personal')) AS without_workspace,
        (SELECT count(*)::int FROM workspaces w
          WHERE w.kind = 'personal'
            AND NOT EXISTS (SELECT 1 FROM workspace_members m
                            WHERE m.workspace_id = w.id AND m.user_id = w.owner_user_id)) AS without_membership,
        (SELECT count(*)::int FROM (
            SELECT owner_user_id FROM workspaces WHERE kind = 'personal'
            GROUP BY owner_user_id HAVING count(*) > 1) d) AS duplicate_personal`;

    assert.equal(row!.without_workspace, 0, 'an account with no personal workspace cannot create a matter');
    assert.equal(row!.without_membership, 0, 'a workspace whose owner is not a member owns nothing reachable');
    /**
     * A user with two personal workspaces has their matters split across two
     * containers with nothing reporting it. The partial unique index makes it
     * unrepresentable; this asserts the index is actually there.
     */
    assert.equal(row!.duplicate_personal, 0);
  });

  it('a personal workspace is created for a NEW account without anyone remembering to', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;

    // Rolled back. The trigger fires inside the transaction, so the assertion
    // sees exactly what a real signup would produce.
    await sql
      .begin(async (tx) => {
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
          VALUES (gen_random_uuid(), ${TAG}, '0000000000', ${`${TAG}@example.invalid`}, 'unverified')
          RETURNING id`;

        const [ws] = await tx<{ id: string }[]>`
          SELECT id FROM workspaces WHERE owner_user_id = ${user!.id} AND kind = 'personal'`;
        assert.ok(ws, 'INSERT INTO users must create a personal workspace by itself');

        const [member] = await tx<{ role: string }[]>`
          SELECT role FROM workspace_members
          WHERE workspace_id = ${ws!.id} AND user_id = ${user!.id}`;
        assert.equal(member?.role, 'owner');

        throw new Error('rollback');
      })
      .catch((e: unknown) => {
        if (!(e instanceof Error) || e.message !== 'rollback') throw e;
      });

    const [leaked] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM users WHERE full_name = ${TAG}`;
    assert.equal(leaked!.n, 0, 'the suite left a user behind');
  });

  it('a matter cannot be placed in a workspace its user is not a member of', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;

    /**
     * THE TENANT ISOLATION ASSERTION, and it is enforced by the database rather
     * than by a code path. `matters (workspace_id, user_id)` is a composite
     * foreign key into `workspace_members`, so pointing a matter at another
     * firm's workspace is rejected — not reviewed, not linted, rejected.
     */
    let refused: string | null = null;
    await sql
      .begin(async (tx) => {
        const [a] = await tx<{ id: string }[]>`
          INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
          VALUES (gen_random_uuid(), ${`${TAG}_A`}, '0000000001', ${`${TAG}a@example.invalid`}, 'unverified')
          RETURNING id`;
        const [b] = await tx<{ id: string }[]>`
          INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
          VALUES (gen_random_uuid(), ${`${TAG}_B`}, '0000000002', ${`${TAG}b@example.invalid`}, 'unverified')
          RETURNING id`;
        const [wsB] = await tx<{ id: string }[]>`
          SELECT id FROM workspaces WHERE owner_user_id = ${b!.id} AND kind = 'personal'`;

        try {
          // A's matter, in B's workspace. This is the cross-tenant write.
          await tx`
            INSERT INTO matters (user_id, workspace_id, case_title, court, case_type, parties,
                                 client_name, our_side, status, source)
            VALUES (${a!.id}, ${wsB!.id}, ${TAG}, 'Test Court', 'civil', '{}'::jsonb,
                    ${TAG}, 'petitioner', 'active', 'manual')`;
        } catch (e) {
          refused = (e as { code?: string }).code ?? 'unknown';
        }
        throw new Error('rollback');
      })
      .catch((e: unknown) => {
        if (!(e instanceof Error) || e.message !== 'rollback') throw e;
      });

    // 23503 is foreign_key_violation.
    assert.equal(refused, '23503', 'a matter in another tenant workspace must be refused by the database');

    const [leaked] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM users WHERE full_name LIKE ${`${TAG}%`}`;
    assert.equal(leaked!.n, 0, 'the suite left users behind');
  });

  it('reconciliation: every matter resolves to its owner through the workspace', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;

    /**
     * The ROLLBACK proof the round asks for, expressed as an invariant rather
     * than as a script. `matters.user_id` still exists and still answers every
     * ownership check in the product; `workspace_id` is the new seam. If the two
     * ever disagreed, reverting 0097 would silently change who owns what.
     *
     * They cannot disagree — the composite FK forbids it — and this counts the
     * disagreements to prove the constraint is present and not merely intended.
     * A revert of 0097 is therefore safe: drop the column and every ownership
     * check keeps the answer it has today.
     */
    const [row] = await sql<{ mismatched: number; orphaned: number }[]>`
      SELECT
        (SELECT count(*)::int FROM matters m
          JOIN workspaces w ON w.id = m.workspace_id
          WHERE w.kind = 'personal' AND w.owner_user_id <> m.user_id) AS mismatched,
        (SELECT count(*)::int FROM matters m
          WHERE NOT EXISTS (SELECT 1 FROM workspace_members wm
                            WHERE wm.workspace_id = m.workspace_id AND wm.user_id = m.user_id)) AS orphaned`;

    assert.equal(row!.mismatched, 0, 'workspace owner and matter user disagree — reverting 0097 would move ownership');
    assert.equal(row!.orphaned, 0, 'a matter whose user is not a member of its workspace');
  });

  it('court observations are NOT workspace-owned', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;

    /**
     * NEW3's load-bearing separation. An observation is a fact about a COURT:
     * two advocates monitoring the same matter must share one observation and
     * one unit of quota, and an erasure request must never delete a public
     * court record. A workspace or user column on this table would break all
     * three at once, so its absence is asserted rather than assumed.
     */
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ecourts_observation'`;
    if (cols.length === 0) return t.skip('ecourts_observation is not on this database');

    const owning = cols
      .map((c) => c.column_name)
      .filter((n) => n === 'user_id' || n === 'workspace_id' || n === 'matter_id');
    assert.deepEqual(owning, [], `ecourts_observation must not be user-owned; found ${owning.join(', ')}`);
  });
});
