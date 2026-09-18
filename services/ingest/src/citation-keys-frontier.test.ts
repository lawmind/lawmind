/**
 * The safe-frontier property, tested against a real PostgreSQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TESTS THE PROPERTY AND NOT THE SYMPTOM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The failure it guards against lost 293 real citations and was invisible for a
 * week: nine ingest batches whose transactions committed *after* the citation-key
 * walk had already passed their `created_at`, and a monotonic cursor can never
 * come back for them. `docs/ai/new2-r7/CITATION_BATCH_GAP_RCA.md`.
 *
 * A test that asserted "the nine batches now have keys" would pass forever
 * without proving anything — they were repaired by hand and would stay repaired
 * whatever the code did next. So this asserts the INVARIANT that makes the class
 * impossible:
 *
 *   **no row can be committed with a `created_at` at or below the frontier the
 *   walk is allowed to consume.**
 *
 * Which is exactly the thing a fixed `now() - interval` cannot promise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT NEEDS A DATABASE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The invariant is a statement about PostgreSQL's transaction visibility. It
 * cannot be tested against a mock, because a mock would be asserting our own
 * belief about `now()` back at us — and our belief about `now()` is precisely
 * what was wrong. Skipped, loudly, when no database is reachable.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import postgres from 'postgres';

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];

/** The frontier query, kept character-identical to `citation-keys-cli.ts`. */
const FRONTIER_SQL = `
  WITH others AS (
    SELECT min(xact_start) AS oldest
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND datname = current_database()
      AND xact_start IS NOT NULL
  ),
  visible AS (
    SELECT count(*) FILTER (WHERE pid <> pg_backend_pid() AND datname = current_database()) AS peers,
           count(*) FILTER (WHERE pid <> pg_backend_pid() AND datname = current_database()
                              AND (xact_start IS NOT NULL OR state IS NOT NULL)) AS readable
    FROM pg_stat_activity
  )
  SELECT CASE
           WHEN v.peers > 0 AND v.readable = 0
             THEN (now() - make_interval(secs => 300))::text
           ELSE coalesce(o.oldest, now())::text
         END AS bound,
         NOT (v.peers > 0 AND v.readable = 0) AS exact
  FROM others o, visible v`;

describe('citation-key walk: the safe frontier', { skip: url ? false : 'no DATABASE_URL' }, () => {
  let reader: postgres.Sql;
  let writer: postgres.Sql;

  before(() => {
    const opts = { ssl: false as const, max: 1, idle_timeout: 5, connect_timeout: 15 };
    reader = postgres(url!, opts);
    writer = postgres(url!, opts);
  });

  after(async () => {
    await reader?.end({ timeout: 5 });
    await writer?.end({ timeout: 5 });
  });

  it('with no other transaction open, the bound is exact and is not in the future', async () => {
    const [row] = await reader.unsafe(FRONTIER_SQL);
    assert.ok(row, 'the frontier query must always return exactly one row');
    assert.equal(row['exact'], true, 'this role can read other backends xact_start');
    const bound = new Date(String(row['bound'])).getTime();
    assert.ok(Number.isFinite(bound), `bound must parse as a timestamp, got ${row['bound']}`);
    // Generous: the assertion is about direction, not about clock precision.
    assert.ok(bound <= Date.now() + 60_000, 'the bound must never be in the future');
  });

  it('an OPEN transaction holds the bound STRICTLY BEHIND the present, by its own age', async () => {
    /* This is the whole failure, reproduced — and it is written so that the
     * behaviour it replaced would FAIL it.
     *
     * The naive frontier is `now()`, and a test that merely asserted
     * `bound <= transaction start` would pass against `now()` too, because a
     * transaction opened microseconds ago starts at approximately now. So the
     * transaction is deliberately AGED before the frontier is read, and the
     * assertion is on the GAP. Against `now()` the gap is ~0 and this fails;
     * against the real bound the gap is the transaction's age.
     *
     * The ageing sleep runs on the READER, whose own backend the frontier query
     * excludes by `pid <> pg_backend_pid()`, so it cannot become the minimum
     * itself and mask the writer. */
    const AGE_MS = 1_000;
    await writer.unsafe('BEGIN');
    try {
      const [started] = await writer.unsafe('SELECT now()::text AS t');
      const txStart = new Date(String(started!['t'])).getTime();

      await reader.unsafe(`SELECT pg_sleep(${AGE_MS / 1000})`);

      const [row] = await reader.unsafe(FRONTIER_SQL);
      const [nowRow] = await reader.unsafe('SELECT now()::text AS t');
      const bound = new Date(String(row!['bound'])).getTime();
      const readAt = new Date(String(nowRow!['t'])).getTime();

      assert.ok(
        bound <= txStart + 200,
        `frontier ${new Date(bound).toISOString()} must not be after the open transaction's ` +
          `start ${new Date(txStart).toISOString()} — a row this transaction inserts would ` +
          `carry that timestamp and be invisible until commit`,
      );
      /* The non-vacuity assertion. An unbounded walk reads `now()` and this
       * gap is zero. 899 judgments were lost to a gap of about 220 ms. */
      assert.ok(
        readAt - bound >= AGE_MS * 0.8,
        `the frontier must lag the present by the open transaction's age: read at ` +
          `${new Date(readAt).toISOString()}, bound ${new Date(bound).toISOString()}, ` +
          `gap ${readAt - bound}ms, expected at least ${AGE_MS * 0.8}ms. A gap near zero ` +
          `means the walk is consuming the live edge, which is the 17 Aug failure exactly.`,
      );
    } finally {
      await writer.unsafe('ROLLBACK');
    }
  });

  it('the bound advances again once the transaction ends', async () => {
    const [before_] = await reader.unsafe(FRONTIER_SQL);
    await writer.unsafe('BEGIN');
    await writer.unsafe('SELECT 1');
    const [during] = await reader.unsafe(FRONTIER_SQL);
    await writer.unsafe('ROLLBACK');
    const [after_] = await reader.unsafe(FRONTIER_SQL);

    const t = (r: unknown) => new Date(String((r as Record<string, unknown>)['bound'])).getTime();
    assert.ok(
      t(during) <= t(before_) + 1_000,
      'holding a transaction must not push the bound forward',
    );
    assert.ok(
      t(after_) >= t(during),
      'releasing the transaction must let the bound advance — otherwise the walk stalls permanently',
    );
  });

  it('a row inserted inside an open transaction is never below the frontier', async () => {
    /* The invariant stated directly, on a scratch table this test owns, with the
     * transaction aged for the same non-vacuity reason as above: an unbounded
     * frontier puts the bound at `now()`, which is AFTER the row's created_at,
     * and this assertion fails. */
    await writer.unsafe(
      'CREATE TEMP TABLE n2_frontier_probe (id serial primary key, created_at timestamptz NOT NULL DEFAULT now())',
    );
    await writer.unsafe('BEGIN');
    try {
      await writer.unsafe('INSERT INTO n2_frontier_probe DEFAULT VALUES');
      const [inserted] = await writer.unsafe(
        'SELECT created_at::text AS t FROM n2_frontier_probe ORDER BY id DESC LIMIT 1',
      );
      const rowAt = new Date(String(inserted!['t'])).getTime();

      await reader.unsafe('SELECT pg_sleep(1)');

      const [f] = await reader.unsafe(FRONTIER_SQL);
      const bound = new Date(String(f!['bound'])).getTime();

      assert.ok(
        rowAt >= bound - 200,
        `a row written inside an uncommitted transaction (created_at ${new Date(rowAt).toISOString()}) ` +
          `must not sit below the frontier ${new Date(bound).toISOString()} — that is exactly how ` +
          `899 judgments became permanently unwalkable on 17 Aug 2026`,
      );
    } finally {
      await writer.unsafe('ROLLBACK');
    }
  });
});
