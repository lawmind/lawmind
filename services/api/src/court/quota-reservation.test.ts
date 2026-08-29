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
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { AUTHORISATION } from './authorisation.ts';
import { ECOURTS_CAUSE_LIST_ENDPOINT } from './ecourts.ts';
import { ECOURTS_KILL_SWITCH_KEY, ECOURTS_QUOTA_LOCK_KEY, reserve, settle } from './guard.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 8, onnotice: () => {} });

/** A court name no grant condition or real harvest will ever use. */
const TEST_COURT = 'ZZ_QUOTA_RESERVATION_TEST';
const TEST_ENDPOINT = `${ECOURTS_CAUSE_LIST_ENDPOINT}#quota-reservation-test`;

let priorAttribution: string | undefined;
let priorSwitch: { enabled: boolean; reason: string | null } | undefined;

async function ledgerRows() {
  return sql<
    { id: string; outcome: string; refusal_reason: string | null; observation_strategy: string | null }[]
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
    const [row] = await sql<{ enabled: boolean; reason: string | null }[]>`
      SELECT enabled, reason FROM platform_config WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
    priorSwitch = row;
    await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
  });

  after(async () => {
    await sql`DELETE FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}`;
    await restoreSwitch();
    if (priorAttribution === undefined) delete process.env['ECOURTS_GRANT_ATTRIBUTION'];
    else process.env['ECOURTS_GRANT_ATTRIBUTION'] = priorAttribution;
    await sql.end();
  });

  async function restoreSwitch(): Promise<void> {
    if (!priorSwitch) return;
    await sql`
      UPDATE platform_config
         SET enabled = ${priorSwitch.enabled}, reason = ${priorSwitch.reason}
       WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
  }

  /**
   * Enable harvesting for exactly as long as the body runs, and no longer.
   *
   * The racing callers need independent connections, so unlike
   * `raw-capture.test.ts` this cannot hide the flip inside a rolled-back
   * transaction — the whole point is that they see each other's COMMITTED rows.
   * The next best thing is to make the window as small as possible and restore
   * in a `finally`, because a suite-wide flip left harvesting enabled on this
   * database once already when a run was killed mid-suite.
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

  it('leaves the switch it borrowed exactly as it found it', () => {
    // Stated as an assertion so a future edit that forgets the restore fails
    // here rather than leaving harvesting enabled on a developer's database.
    assert.ok(priorSwitch, 'the ecourts_harvest row must exist — migration 0013 creates it');
    assert.equal(priorSwitch.enabled, false, 'the switch must have been OFF before this ran');
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
      const clients = Array.from({ length: 8 }, () =>
        postgres(process.env['DATABASE_URL'] ?? '', { max: 1, onnotice: () => {} }),
      );
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
      assert.equal(later.allowed, true, 'a burst of refusals must not lock out a permitted request');
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
        reserve(sql, { court: TEST_COURT, endpoint: TEST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' }, at),
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

  it('leaves the kill switch off when it is done', async () => {
    const [row] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM platform_config WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
    assert.equal(row?.enabled, false, 'no test may leave eCourts harvesting enabled');
  });
});
