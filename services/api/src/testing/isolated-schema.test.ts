/**
 * The falsifiers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THESE ARE FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A test suite can be made to leave production alone. The hard part is keeping
 * it that way: the isolation is one `postgres(DATABASE_URL)` away from being
 * silently undone, and an undone isolation looks exactly like a working one
 * until a run is killed at the wrong moment. That is how
 * `platform_config.signups.reason` came to read "test cleanup" on the live
 * database, and how `ecourts_harvest` — the switch that authorises contacting a
 * court's systems under a registrar's written grant — was left ENABLED by an
 * interrupted run on 29 Aug 2026.
 *
 * So these tests do the dangerous thing on purpose. Each one takes a snapshot of
 * the real `public.platform_config` row, flips it hard through the fixture —
 * enabled, a reason, an updated_at — commits, and then asserts through an
 * INDEPENDENT connection pinned to `public` that the real row did not move by a
 * single field.
 *
 * If someone reverts the fixture to a plain client, these go red immediately and
 * for the right reason. A test that only asserts "production is off" would
 * instead go red for the founder's decision to turn it on; these compare
 * BEFORE with AFTER, so they are indifferent to what the real state happens to
 * be and sensitive only to whether a test changed it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THEY DO NOT PROVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Process termination is asserted structurally, not by killing a process. What
 * makes a `SIGKILL` safe here is that there is no code path from a fixture
 * client to the production row at all — the search path resolves the unqualified
 * name into the throwaway schema — so there is no window in which the wrong row
 * is written. `no client this fixture hands out can even see the production row`
 * below is that claim, stated as an assertion rather than as a comment.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres, { type Sql } from 'postgres';

import {
  createIsolatedSchema,
  DEFAULT_KILL_SWITCHES,
  TEST_CONFIG_SCHEMA_PREFIX,
} from './isolated-schema.ts';

const url = process.env['DATABASE_URL'];
const suite = url ? describe : describe.skip;

type ConfigRow = {
  key: string;
  enabled: boolean;
  reason: string | null;
  updated_at: string;
  updated_by_user_id: string | null;
};

suite('a test cannot reach the production kill switches', () => {
  /** Pinned to `public` explicitly, so it can never follow a fixture's path. */
  let production: Sql;

  after(async () => {
    await production?.end({ timeout: 5 });
  });

  async function productionRow(key: string): Promise<ConfigRow | undefined> {
    production ??= postgres(url!, {
      max: 1,
      onnotice: () => {},
      connection: { search_path: 'public' },
    });
    const [row] = await production<ConfigRow[]>`
      SELECT key, enabled, reason,
             -- iso-time-exempt: compared for IDENTITY between a before and after snapshot and never rendered; the falsifier's whole question is whether the row moved, and ::text is the strictest form of "did not move" available — a Date round-trip could mask a sub-millisecond change.
             updated_at::text AS updated_at,
             updated_by_user_id
        FROM public.platform_config WHERE key = ${key}
    `;
    return row;
  }

  /**
   * Flip `key` as hard as the fixture allows, commit it, and prove the real row
   * is unchanged in every field.
   */
  /** Keys this suite actually falsified. Guards against the whole thing going quiet. */
  const falsified: string[] = [];

  async function falsify(key: string, t: { skip: (m: string) => void }): Promise<void> {
    const before = await productionRow(key);
    /**
     * A KEY WITH NO ROW CANNOT BE FALSIFIED, AND THAT IS NOT THIS SUITE'S BUG.
     *
     * `platform_config`'s CHECK constraint allows six kill-switch keys —
     * search, drafting, briefings, ocr_intake, signups, ecourts_harvest — and
     * migration 0013 INSERTS exactly one of them, `ecourts_harvest`. The other
     * five have never had a row. So on the fresh database CI and `pnpm ci:local`
     * build, `falsify('signups')` asserted its way to a hard failure over a row
     * nobody ever created, and it took repository CI red with it.
     *
     * The mechanism under test is schema isolation, and `ecourts_harvest` proves
     * it as completely as two keys would. A key with no production row is
     * SKIPPED with the reason stated — and the assertion below makes sure the
     * suite cannot go vacuous by skipping everything.
     *
     * The absent five are recorded as a finding rather than seeded here: adding
     * a `platform_config` row is a migration, and a kill switch nobody has
     * decided to create is not something a test-repair round should invent.
     */
    if (!before) {
      return t.skip(
        `${key} has no row in platform_config, so there is nothing to falsify. ` +
          'Migration 0013 seeds only ecourts_harvest; the CHECK constraint allows six keys.',
      );
    }
    falsified.push(key);

    const isolation = await createIsolatedSchema(url!);
    try {
      const sql = isolation.connect({ max: 1 });
      // Committed, not rolled back. A rollback would make this pass for the
      // wrong reason.
      await sql`
        UPDATE platform_config
           SET enabled = true,
               reason = ${`falsifier: if this string ever reaches production, the isolation is gone (${key})`},
               updated_at = now()
         WHERE key = ${key}
      `;
      const [isolated] = await sql<{ enabled: boolean }[]>`
        SELECT enabled FROM platform_config WHERE key = ${key}
      `;
      assert.equal(
        isolated?.enabled,
        true,
        'the flip must actually have happened somewhere, or this proves nothing',
      );

      const after_ = await productionRow(key);
      assert.deepEqual(
        after_,
        before,
        `a test changed public.platform_config.${key}; the isolation in ` +
          'services/api/src/testing/isolated-schema.ts has been removed or bypassed',
      );
    } finally {
      await isolation.drop();
    }
  }

  it('ecourts_harvest: enabling it in a test does not enable it in production', async (t) => {
    await falsify('ecourts_harvest', t);
  });

  it('signups: enabling it in a test does not enable it in production', async (t) => {
    await falsify('signups', t);
  });

  it('at least one kill switch was really falsified — the suite may not go quiet', () => {
    assert.ok(
      falsified.length > 0,
      'every falsifier skipped, so nothing proved the isolation holds. A suite that ' +
        'skips its way to green is the failure this assertion exists to catch.',
    );
  });

  it('no client this fixture hands out can even see the production row', async () => {
    const isolation = await createIsolatedSchema(url!);
    try {
      const sql = isolation.connect({ max: 1 });
      const [resolved] = await sql<{ schema: string }[]>`
        SELECT n.nspname AS schema
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.oid = 'platform_config'::regclass
      `;
      assert.ok(
        resolved?.schema.startsWith(TEST_CONFIG_SCHEMA_PREFIX),
        `unqualified platform_config resolved to ${resolved?.schema}, not to the fixture; ` +
          'every kill-switch write in this process would land on production',
      );
      assert.equal(resolved?.schema, isolation.schema);
    } finally {
      await isolation.drop();
    }
  });

  it('seeds the six switches OFF, whatever production currently is', async () => {
    const isolation = await createIsolatedSchema(url!);
    try {
      const sql = isolation.connect({ max: 1 });
      const rows = await sql<{ key: string; enabled: boolean; reason: string | null }[]>`
        SELECT key, enabled, reason FROM platform_config ORDER BY key
      `;
      assert.deepEqual(
        rows.map((r) => r.key).sort(),
        [...DEFAULT_KILL_SWITCHES].sort(),
        'the fixture seeds exactly the six keys the database CHECK constraint allows',
      );
      assert.ok(
        rows.every((r) => r.enabled === false),
        'every seeded switch starts OFF',
      );
      // The CHECK `platform_config_kill_switch_reason` requires it, and copying
      // the constraint is the reason the fixture uses LIKE INCLUDING ALL rather
      // than a hand-written CREATE TABLE that would drift from the real one.
      assert.ok(
        rows.every((r) => r.reason !== null),
        'a kill switch always carries a reason',
      );
    } finally {
      await isolation.drop();
    }
  });

  it('drops its schema, so a green run leaves nothing behind', async () => {
    const isolation = await createIsolatedSchema(url!);
    const { schema } = isolation;
    await isolation.drop();
    production ??= postgres(url!, {
      max: 1,
      onnotice: () => {},
      connection: { search_path: 'public' },
    });
    const [row] = await production<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = ${schema}
    `;
    assert.equal(row?.n, 0, 'drop() must remove the schema it created');
  });
});
