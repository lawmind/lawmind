/**
 * The incremental cursor, driven against a real Postgres over a table whose ids
 * are deliberately in the wrong order.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST NEEDS A DATABASE AND CANNOT BE FAKED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The thing under test is not our arithmetic, it is Postgres's row-comparison
 * and sort semantics: whether `(created_at, id) > (a, b)` is TOTAL across rows
 * that share a timestamp, and whether `ORDER BY created_at, id` agrees with it.
 * A hand-rolled in-memory comparator would test the comparator, agree with
 * itself, and prove nothing about the query that actually runs.
 *
 * Skipped, not failed, when `DATABASE_URL` is absent — CI without a database
 * should not report a red test for a check it was never able to make. The skip
 * prints its reason so a silent skip cannot be mistaken for a pass.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIXTURE IS BUILT TO BREAK THE OLD DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Rows are inserted so that:
 *
 *   * the LATEST-arriving rows carry the LOWEST uuids (`00000000-…`), which is
 *     exactly the production shape — 740,993 of 740,993 rows created after the
 *     19 Aug pass sorted below its final watermark;
 *   * six rows share a single `created_at`, so a cursor that compares the two
 *     columns by hand either loses them or re-reads them for ever;
 *   * one row sits below the `--since` floor and must never be returned.
 *
 * An id-keyset walk over this fixture reaches the high uuids, records one of
 * them, and is then permanently blind to the four rows below it. The composite
 * walk sees every row exactly once. The test asserts both, because asserting
 * only the good behaviour would still pass if the query silently degraded to
 * ordering by id.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { sslFor } from './db-ssl.ts';
import { pageAll, pageSince } from './script-quality-page.ts';

const URL = process.env['DATABASE_URL'];
const TABLE = 'new2_keyset_fixture';

/** Two timestamps, and six rows share the second one on purpose. */
const T1 = '2026-08-01T00:00:00.000Z';
const T2 = '2026-08-02T12:00:00.000Z';
const FLOOR = '2026-07-15T00:00:00.000Z';
const BELOW_FLOOR = '2026-07-01T00:00:00.000Z';

/**
 * id, created_at. The ORDER OF THIS ARRAY is insertion order — i.e. arrival
 * order — and it is the reverse of uuid order for the later half.
 */
const FIXTURE: readonly [string, string][] = [
  /* The "already walked" population: high uuids, earliest timestamp. */
  ['ffffff40-0000-0000-0000-000000000001', T1],
  ['ffffff40-0000-0000-0000-000000000002', T1],
  ['e0000000-0000-0000-0000-000000000003', T1],
  /* Arrived LATER, sorts BELOW everything above it. This is the whole defect. */
  ['00000000-0000-0000-0000-00000000000a', T2],
  ['00000000-0000-0000-0000-00000000000b', T2],
  ['00000000-0000-0000-0000-00000000000c', T2],
  ['10000000-0000-0000-0000-00000000000d', T2],
  ['20000000-0000-0000-0000-00000000000e', T2],
  ['3fffffff-0000-0000-0000-00000000000f', T2],
  /* Below the --since floor. Must never appear. */
  ['00000000-0000-0000-0000-0000000000ff', BELOW_FLOOR],
];

const ABOVE_FLOOR = FIXTURE.filter(([, at]) => at !== BELOW_FLOOR).length;
const EPOCH = '1970-01-01T00:00:00.000Z';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

describe(
  'script-quality incremental cursor',
  { skip: URL ? false : 'DATABASE_URL not set' },
  () => {
    let sql: Sql;

    before(async () => {
      sql = postgres(URL!, {
        ssl: sslFor(URL!),
        max: 1,
        idle_timeout: 5,
        connect_timeout: 30,
        prepare: false,
      });
      /* A real table, not a TEMP one: postgres.js may hand a later statement a
       * different session, and a temp table would vanish underneath it. Dropped in
       * `after`, and the name is prefixed so it cannot collide with anything the
       * migrations own. */
      await sql.unsafe(`DROP TABLE IF EXISTS ${TABLE}`);
      await sql.unsafe(
        `CREATE TABLE ${TABLE} (
         id uuid PRIMARY KEY,
         court text,
         source_url text,
         full_text text,
         created_at timestamptz NOT NULL)`,
      );
      for (const [id, at] of FIXTURE) {
        await sql.unsafe(
          `INSERT INTO ${TABLE} (id, court, source_url, full_text, created_at) VALUES ($1,$2,$3,$4,$5)`,
          [id, 'Test High Court', `s3://bench/court=8_9/${id}.pdf`, 'text', at],
        );
      }
    });

    after(async () => {
      if (!URL) return;
      await sql.unsafe(`DROP TABLE IF EXISTS ${TABLE}`);
      await sql.end({ timeout: 5 });
    });

    /**
     * Walk to exhaustion in pages of two. A page size smaller than the
     * duplicate-timestamp run is deliberate: it forces the cursor to stop INSIDE
     * a group of rows sharing one `created_at`, which is the partial-batch case.
     */
    async function walkSince(pageSize: number): Promise<string[]> {
      let cursor = ZERO_UUID;
      let cursorAt = EPOCH;
      const seen: string[] = [];
      for (;;) {
        const rows = await pageSince({
          sql,
          since: FLOOR,
          cursorAt,
          cursor,
          courts: [],
          limit: pageSize,
          table: TABLE,
        });
        if (rows.length === 0) break;
        for (const r of rows) seen.push(r.id);
        const last = rows[rows.length - 1]!;
        cursor = last.id;
        cursorAt = new Date(last.created_at as string).toISOString();
        if (rows.length < pageSize) break;
        assert.ok(
          seen.length <= FIXTURE.length * 2,
          'walk is not terminating — the cursor is going backwards',
        );
      }
      return seen;
    }

    it('visits every row above the floor exactly once, across duplicate timestamps', async () => {
      const seen = await walkSince(2);
      assert.equal(seen.length, ABOVE_FLOOR);
      assert.equal(new Set(seen).size, ABOVE_FLOOR, 'a row was returned twice');
    });

    it('reaches low uuids that arrived after high ones — the defect this replaces', async () => {
      const seen = await walkSince(2);
      for (const late of [
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000c',
      ]) {
        assert.ok(seen.includes(late), `${late} was skipped — the cursor is ordering by id`);
      }
    });

    it('never returns a row below the --since floor', async () => {
      const seen = await walkSince(3);
      assert.ok(!seen.includes('00000000-0000-0000-0000-0000000000ff'));
    });

    it('gives the same set whatever the page size, including a size of one', async () => {
      const a = await walkSince(1);
      const b = await walkSince(5);
      const c = await walkSince(100);
      assert.deepEqual(new Set(a), new Set(b));
      assert.deepEqual(new Set(a), new Set(c));
    });

    /**
     * The negative control. An id-keyset walk resumed from the high watermark the
     * full pass would have recorded returns NOTHING, while five rows created after
     * it sit unscreened below. If this test ever starts failing because `pageAll`
     * found them, the uuid generation has changed and the incremental pass may no
     * longer be needed — which is a finding, not a broken test.
     */
    it('an id cursor at the high watermark is blind to all of them', async () => {
      const rows = await pageAll({
        sql,
        cursor: 'ffffff40-0000-0000-0000-000000000002',
        courts: [],
        limit: 100,
        table: TABLE,
      });
      assert.equal(
        rows.length,
        0,
        'nothing sorts above the watermark, so the pass exits clean and screens nobody',
      );
    });

    it('the --courts filter composes without disturbing the order', async () => {
      const rows = await pageSince({
        sql,
        since: FLOOR,
        cursorAt: EPOCH,
        cursor: ZERO_UUID,
        courts: ['8_9'],
        limit: 100,
        table: TABLE,
      });
      assert.equal(rows.length, ABOVE_FLOOR);
      const none = await pageSince({
        sql,
        since: FLOOR,
        cursorAt: EPOCH,
        cursor: ZERO_UUID,
        courts: ['99_99'],
        limit: 100,
        table: TABLE,
      });
      assert.equal(none.length, 0);
    });
  },
);
