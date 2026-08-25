/**
 * M09 — a request that times out must not poison the next legal-truth request.
 *
 * R7 §8 LCC-P0 states the PASS condition in one line:
 *
 *     "one request timing out cannot poison the next legal-truth request."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS REPORTED, AND WHAT IS ACTUALLY TRUE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The R5 dossier recorded M09 as: `GET /judgments/:id` took ~40 s and returned
 * 500 (`57014`), and "subsequent treatment route also returned 500", with a
 * treatment-path `TypeError`. Its stated hypothesis was that "request/session
 * cleanup is not isolated enough".
 *
 * Two of those three claims do not survive measurement, and this file is where
 * that is checked rather than argued:
 *
 *   1. THE 40 SECONDS IS NOT THE QUERY. On the exact row (M07,
 *      `0f4788ed-5399-4891-bc2b-327a71fcf47b`) the judgment SELECT plans at cost
 *      2.78 — `Index Scan using judgments_pkey` — and runs in 41 ms cold, 1 ms
 *      warm. The treatment query plans at 5.76 and runs in 3 ms. The document is
 *      42,046 characters, 24 kB stored. `CORE_STATEMENT_TIMEOUT_MS` is 10 s, so
 *      40,024 ms cannot be one slow statement; it is queue wait plus a
 *      statement, on a box NEW3 recorded as `LOCAL_CONTENDED` with the ingest
 *      fleet and a GPU walk live. `pools.ts` names the mechanism in its own
 *      opening comment: *"postgres.js then makes every other caller WAIT. Not
 *      fail: wait, with no timeout of its own."*
 *
 *   2. SESSION CLEANUP IS NOT THE PROBLEM. Directly tested below, on both the
 *      shape that cannot poison and the shape that can.
 *
 *   3. The `TypeError` is NOT reproducible on current HEAD. The ten-matter
 *      artifact of 25 Aug shows `judgment: 500 in 40,024 ms` followed by
 *      `treatment: 200 in 17 ms` — the cascade did not happen. The harness's
 *      `data()` helper returns `{}` for a failed step and takes the treatment id
 *      from the SEARCH result rather than from the judgment body, so there is no
 *      dereference to throw. Whether the older harness did the same cannot be
 *      established from here, and is not asserted.
 *
 * What IS a real defect, and is fixed in `app.ts`: a `57014` surfaced as
 * `INTERNAL / "something went wrong" / 500`, indistinguishable from a bug in the
 * reader. The server was busy, and it told the advocate it was broken.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres, { type Sql } from 'postgres';

import { createApp } from './app.ts';

const url = process.env['DATABASE_URL'];

/**
 * Skipped rather than failed without a database, exactly as the other
 * integration suites here do. A suite that cannot reach Postgres has not proven
 * the cascade is absent — it has proven nothing, and saying so is the point.
 */
const suite = url ? describe : describe.skip;

suite('M09 — a timeout must not poison the next legal-truth request', () => {
  let sql: Sql;

  before(() => {
    // A CORE-shaped pool: small, with a short statement budget. `max: 1` is
    // deliberate and is what makes this test meaningful — every query is forced
    // onto the SAME physical connection, so a session left dirty by the timeout
    // has no way to hide behind a fresh one.
    sql = postgres(url!, { max: 1, onnotice: () => {}, connection: { statement_timeout: '800' } });
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  /** A real legal-truth read: the currentness edges behind a LAW MOVED badge. */
  const legalTruth = () =>
    sql`SELECT DISTINCT relationship, treatment_provenance
          FROM judgment_citations
         WHERE cited_judgment_id = ${'0f4788ed-5399-4891-bc2b-327a71fcf47b'}
           AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;

  it('a bare statement timeout leaves the connection usable', async () => {
    await legalTruth();

    await assert.rejects(
      () => sql`select pg_sleep(5)`,
      (e: { code?: string }) => e.code === '57014',
      'the fixture must actually time out, or this test proves nothing',
    );

    // The next request on the same connection, immediately.
    const rows = await legalTruth();
    assert.ok(Array.isArray(rows), 'the legal-truth read must succeed after a timeout');
    // And again, so a one-shot recovery cannot pass for isolation.
    assert.ok(Array.isArray(await legalTruth()));
  });

  it('a timeout INSIDE a transaction leaves the connection usable', async () => {
    // The shape that genuinely can poison: a statement cancelled mid-transaction
    // leaves the backend `idle in transaction (aborted)`, where every later
    // statement fails with 25P02 until someone rolls back. If the driver did not
    // roll back for us, this is where it would show.
    await assert.rejects(
      () =>
        sql.begin(async (tx) => {
          await tx`select 1`;
          await tx`select pg_sleep(5)`;
        }),
      (e: { code?: string }) => e.code === '57014',
    );

    const rows = await legalTruth();
    assert.ok(Array.isArray(rows), 'the transaction must have been rolled back for us');
  });

  it('the session is not left in an aborted transaction', async () => {
    await assert.rejects(
      () =>
        sql.begin(async (tx) => {
          await tx`select 1`;
          await tx`select pg_sleep(5)`;
        }),
      (e: { code?: string }) => e.code === '57014',
    );
    const [state] = await sql<{ state: string }[]>`
      SELECT state FROM pg_stat_activity WHERE pid = pg_backend_pid()`;
    assert.notEqual(
      state?.state,
      'idle in transaction (aborted)',
      'a connection returned to the pool in an aborted transaction poisons every later request on it',
    );
  });

  it('reports a timeout as BUSY with a Retry-After, never as an opaque 500', async () => {
    /**
     * The defect that was real. A 500 tells a client to give up and an operator
     * to hunt a bug; a 503 with `Retry-After` tells both the truth, and keeps a
     * capacity incident visible as a capacity incident instead of buried in the
     * 5xx rate. `/search` already answered this way (`SEARCH_BUSY`, 503); every
     * other route returned `INTERNAL`.
     */
    const app = createApp({
      ping: async () => {},
    });
    app.get('/m09-fixture', () => {
      throw Object.assign(new Error('canceling statement due to statement timeout'), {
        code: '57014',
      });
    });

    const res = await app.request('/m09-fixture');
    assert.equal(res.status, 503, 'a statement timeout is a capacity answer, not a fault');
    assert.equal(res.headers.get('Retry-After'), '2');
    const body = (await res.json()) as { ok: boolean; error: { code: string; message: string } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'TIMEOUT');
    assert.notEqual(body.error.code, 'INTERNAL');
    // Copy is licence protection: it must not imply the record is wrong.
    assert.ok(
      /busy/i.test(body.error.message),
      'the message must say the server is busy, not that something is wrong with the law',
    );
  });

  it('finds a timeout wrapped in a cause chain, as a transaction re-throw produces', async () => {
    const app = createApp({ ping: async () => {} });
    app.get('/m09-wrapped', () => {
      const inner = Object.assign(new Error('canceling statement'), { code: '57014' });
      throw new Error('transaction failed', { cause: inner });
    });
    const res = await app.request('/m09-wrapped');
    assert.equal(res.status, 503, 'a wrapped 57014 is still a timeout');
  });

  it('a genuine fault is still a 500 — the timeout path must not swallow bugs', async () => {
    const app = createApp({ ping: async () => {} });
    app.get('/m09-real-bug', () => {
      throw new TypeError("Cannot read properties of undefined (reading 'judgmentId')");
    });
    const res = await app.request('/m09-real-bug');
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'INTERNAL');
  });
});
