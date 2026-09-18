/**
 * Quota admission is a mutex or it is decoration.
 *
 * The limits — 2,000 ms apart, 100 an hour, 1,000 a day — are the binding
 * constraint on the premium business AND a condition of the registrar's grant.
 * With one caller and no scheduler, `decide`-then-request was safe by accident.
 * Master Roadmap v5 §3.4's adaptive planner introduces several callers, and then
 * read-then-act is the classic race: both read "one slot left", both proceed,
 * and the ledger records two permitted requests where the grant allowed one.
 *
 * These tests make no network request and never turn the harvest switch on for
 * anything that could reach a host — `reserve` is pure database work. They do
 * set `ECOURTS_GRANT_ATTRIBUTION` and enable the kill switch, because the guard
 * refuses at both of those before it ever reaches the quota arithmetic, and a
 * concurrency test that stops at `attribution_not_on_file` proves nothing at
 * all.
 *
 * -----------------------------------------------------------------------------
 * TWO THINGS THIS SUITE USED TO BORROW FROM PRODUCTION, AND NO LONGER CAN
 * -----------------------------------------------------------------------------
 *
 * 1. **The kill switch.** The race needs COMMITTED rows visible across eight
 *    independent connections, so it cannot hide the flip inside a rolled-back
 *    transaction the way `raw-capture.test.ts` does. It used to flip the
 *    production row and restore it in a `finally` - correct on every path except
 *    the one that actually happened: a run killed mid-body left eCourts
 *    harvesting ENABLED on this database. `platform_config` is now an isolated
 *    schema (`testing/isolated-schema.ts`) and the production row is
 *    unreachable from here.
 *
 * 2. **The registrar's quota.** Reservations commit ledger rows with outcome
 *    `error`, and those COUNT - that is the point of the design. An abandoned
 *    run therefore used to spend real slots out of the grant's 1,000/day, and
 *    filled the ledger that answers "did we stay inside the grant" with traffic
 *    that never left this machine.
 *
 *    The obvious fix is the wrong one, and was tried: pointing these at the
 *    `test://` endpoint makes `guard.decide` exclude them from the interval,
 *    hourly and daily counts - so all eight racing callers succeed and the test
 *    measures nothing at all. The rows have to be genuine quota rows. So
 *    `ecourts_fetch_ledger` is isolated alongside the switch, and the race runs
 *    against a ledger that starts empty and is dropped afterwards.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createIsolatedSchema } from '../testing/isolated-schema.ts';
import { AUTHORISATION } from './authorisation.ts';
import { ECOURTS_CAUSE_LIST_ENDPOINT } from './ecourts.ts';
import { ECOURTS_KILL_SWITCH_KEY, ECOURTS_QUOTA_LOCK_KEY, reserve, settle } from './guard.ts';

const isolation = await createIsolatedSchema(process.env['DATABASE_URL'] ?? '', [
  'ecourts_fetch_ledger',
]);
const sql = isolation.connect({ max: 8 });

/** A court name no grant condition or real harvest will ever use. */
const TEST_COURT = 'ZZ_QUOTA_RESERVATION_TEST';
/**
 * The REAL endpoint, deliberately. These rows must be counted by the limiter or
 * the race proves nothing - see the header. They are safe because the ledger
 * they land in is the fixture's, not the registrar's.
 */
const TEST_ENDPOINT = `${ECOURTS_CAUSE_LIST_ENDPOINT}#quota-reservation-test`;

let priorAttribution: string | undefined;

async function ledgerRows() {
  return sql<
    {
      id: string;
      outcome: string;
      refusal_reason: string | null;
      observation_strategy: string | null;
    }[]
  >`
    SELECT id, outcome, refusal_reason, observation_strategy
      FROM ecourts_fetch_ledger
     WHERE court = ${TEST_COURT}
     ORDER BY requested_at
  `;
}

describe('eCourts quota reservation is globally atomic', () => {
  before(async () => {
    priorAttribution = process.env['ECOURTS_GRANT_ATTRIBUTION'];
    process.env['ECOURTS_GRANT_ATTRIBUTION'] = 'LawMind quota-reservation test (no network)';
    await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
  });

  after(async () => {
    await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
    if (priorAttribution === undefined) delete process.env['ECOURTS_GRANT_ATTRIBUTION'];
    else process.env['ECOURTS_GRANT_ATTRIBUTION'] = priorAttribution;
    await isolation.drop();
  });

  /** Back to the fixture's seeded state. Never production's - see the header. */
  async function restoreSwitch(): Promise<void> {
    await sql`
      UPDATE platform_config
         SET enabled = false, reason = 'isolated test fixture - restored OFF'
       WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
  }

  /**
   * Enable harvesting for exactly as long as the body runs, and no longer.
   *
   * The racing callers need independent connections, so unlike
   * `raw-capture.test.ts` this cannot hide the flip inside a rolled-back
   * transaction — the whole point is that they see each other's COMMITTED rows.
   * The window is still kept small and still restored in a `finally`, but the
   * row being flipped is the ISOLATED one; a run killed inside the body leaves a
   * throwaway schema enabled, not the switch that authorises contacting a court.
   */
  async function withHarvestEnabled(body: () => Promise<void>): Promise<void> {
    await sql`
      UPDATE platform_config SET enabled = true,
             reason = 'quota reservation test — no network path is exercised'
       WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
    try {
      await body();
    } finally {
      await restoreSwitch();
    }
  }

  it('runs against an isolated switch and an isolated ledger, both starting clean', async () => {
    // Stated as assertions because every case below is only meaningful if the
    // switch being flipped and the ledger being counted are both the fixture's.
    const [row] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM platform_config WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
    assert.ok(row, 'the isolated fixture seeds all six kill switches');
    assert.equal(row.enabled, false, 'the isolated switch must start OFF');

    const [resolved] = await sql<{ schema: string }[]>`
      SELECT n.nspname AS schema
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.oid = 'ecourts_fetch_ledger'::regclass
    `;
    assert.equal(
      resolved?.schema,
      isolation.schema,
      "the reservations below spend quota, and they must not spend the registrar's",
    );
  });

  it('two concurrent callers cannot both take the same remaining slot', async () => {
    await withHarvestEnabled(async () => {
      await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
      const at = new Date();

      /**
       * EIGHT INDEPENDENT CLIENTS, not eight checkouts from one pool.
       *
       * A shared pool is itself a partial serialiser: the first reservation
       * commits while the others are still being dispatched, the race never
       * materialises, and the test stays green with the advisory lock removed.
       * That was measured, not assumed — it is why these are separate
       * connections, each warmed before the burst.
       */
      // Built through the fixture, so each racing backend resolves
      // `platform_config` to the isolated schema and sees the flip made above.
      const clients = Array.from({ length: 8 }, () => isolation.connect({ max: 1 }));
      let results;
      try {
        await Promise.all(clients.map((client) => client`SELECT 1`));
        // Same instant, same court, launched together. Without the lock they each
        // read an empty ledger, each see zero requests in the hour, and each are
        // told yes.
        results = await Promise.all(
          clients.map((client) =>
            reserve(
              client,
              { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
              at,
            ),
          ),
        );
      } finally {
        await Promise.all(clients.map((client) => client.end()));
      }

      const allowed = results.filter((r) => r.allowed);
      assert.equal(
        allowed.length,
        1,
        `${allowed.length} callers were allowed to spend the same slot; exactly one may be`,
      );
      for (const refused of results.filter((r) => !r.allowed)) {
        assert.equal(
          refused.allowed === false && refused.reason,
          'min_interval',
          'the losers must be refused by the limiter, not by an error',
        );
      }

      // Every decision is durable, allowed and refused alike.
      const rows = await ledgerRows();
      assert.equal(rows.length, 8, 'all eight decisions must be ledgered');
      assert.equal(rows.filter((r) => r.outcome !== 'refused').length, 1);
      assert.equal(rows.filter((r) => r.outcome === 'refused').length, 7);
      assert.ok(rows.every((r) => r.observation_strategy === 'CAUSE_LIST_BATCH'));
    });
  });

  it('refusals do not consume the quota they just protected', async () => {
    await withHarvestEnabled(async () => {
      await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
      const base = Date.now();
      // One reservation, then a burst of refusals, then a caller far enough past
      // the minimum interval. If refusals counted, this last one would be denied.
      await reserve(
        sql,
        { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
        new Date(base),
      );
      for (let i = 0; i < 5; i += 1) {
        const refused = await reserve(
          sql,
          { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
          new Date(base + 10 * i),
        );
        assert.equal(refused.allowed, false);
      }
      const later = await reserve(
        sql,
        { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
        new Date(base + (AUTHORISATION?.minIntervalMs ?? 2000) + 50),
      );
      assert.equal(
        later.allowed,
        true,
        'a burst of refusals must not lock out a permitted request',
      );
    });
  });

  it('a reservation is durable before the network, so a crash cannot double-spend it', async () => {
    await withHarvestEnabled(async () => {
      await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
      const at = new Date();
      const reservation = await reserve(
        sql,
        { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
        at,
      );
      assert.equal(reservation.allowed, true);

      // The row exists and counts BEFORE any settlement — this is the state a
      // process killed mid-request leaves behind.
      const [committed] = await ledgerRows();
      assert.ok(committed);
      assert.equal(
        committed.outcome,
        'error',
        'an attempt whose result is unknown is not a success, and must still count',
      );

      const retry = await reserve(
        sql,
        { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
        new Date(at.getTime() + 100),
      );
      assert.equal(retry.allowed, false, 'a crashed attempt must not hand back its slot');

      // Settling corrects the outcome in place; it never inserts a second row,
      // because the count of rows is the count of requests.
      await settle(sql, reservation.allowed ? reservation.ledgerId : '', {
        outcome: 'ok',
        httpStatus: 200,
        durationMs: 12,
      });
      const rows = await ledgerRows();
      assert.equal(rows.length, 2, 'settlement must not add a row');
      assert.equal(rows[0]!.outcome, 'ok');
    });
  });

  it('a refusal can never be settled into a success', async () => {
    await withHarvestEnabled(async () => {
      await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
      const at = new Date();
      await reserve(
        sql,
        { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
        at,
      );
      const refused = await reserve(
        sql,
        { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
        new Date(at.getTime() + 1),
      );
      assert.equal(refused.allowed, false);

      await settle(sql, refused.ledgerId, { outcome: 'ok', httpStatus: 200 });
      const [, second] = await ledgerRows();
      assert.equal(
        second!.outcome,
        'refused',
        'a refusal is evidence that the locks held and must survive any later write',
      );
    });
  });

  it('serialises on ONE lock for the whole grant, not one per court', async () => {
    await withHarvestEnabled(async () => {
      // A per-court lock would let 26 courts each spend the same 100/hour. The
      // key is asserted rather than assumed, because it is the difference between
      // one budget and twenty-six.
      assert.equal(typeof ECOURTS_QUOTA_LOCK_KEY, 'number');
      await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
      const at = new Date();
      const [a, b] = await Promise.all([
        reserve(
          sql,
          { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
          at,
        ),
        reserve(
          sql,
          { court: `${TEST_COURT}`, endpoint: TEST_ENDPOINT, strategy: 'CASE_STATUS' },
          at,
        ),
      ]);
      assert.equal(
        [a, b].filter((r) => r.allowed).length,
        1,
        'two strategies share one budget and must contend for it',
      );
    });
  });

  it('releases the quota lock at transaction exit, so nothing can leak it', async () => {
    /**
     * `pg_advisory_xact_lock` is transaction-scoped, which is the reason it was
     * chosen over `pg_advisory_lock`: there is no unlock to forget, and a
     * crashed backend releases on rollback. That is a property of the FUNCTION,
     * and a future edit could swap it for the session-scoped one without a
     * single existing test noticing - the race test would still pass, and the
     * lock would simply never be given back until the pooled connection was
     * recycled.
     *
     * So it is measured. `ECOURTS_QUOTA_LOCK_KEY` fits in 32 bits, so Postgres
     * reports it as classid 0, objid <key>, objsubid 1.
     */
    await withHarvestEnabled(async () => {
      await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
      const held = async () => {
        const [row] = await sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_locks
           WHERE locktype = 'advisory' AND objid = ${ECOURTS_QUOTA_LOCK_KEY}::bigint
        `;
        return row?.n ?? 0;
      };
      assert.equal(await held(), 0, 'nothing may hold the quota lock before a reservation');
      const reservation = await reserve(
        sql,
        { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
        new Date(),
      );
      assert.equal(reservation.allowed, true);
      assert.equal(
        await held(),
        0,
        'the quota lock is still held after reserve() returned; a session-scoped lock would ' +
          'serialise every later reservation on this pooled connection until it was recycled',
      );
    });
  });

  it('leaves the isolated kill switch off when it is done', async () => {
    const [row] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM platform_config WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
    assert.equal(row?.enabled, false, 'no test may leave eCourts harvesting enabled');
  });
});
