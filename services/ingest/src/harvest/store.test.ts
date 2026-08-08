/**
 * The de-duplication guarantee is the one that costs money when it breaks, and
 * the ledger's completeness is the one that costs a licence.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import {
  alreadyFetched,
  claimNext,
  complete,
  enqueue,
  fail,
  progress,
  recordFetch,
  releaseStaleClaims,
  sha256,
} from './store.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** Unique per run, so repeated runs against one database never collide. */
const SOURCE = `test_${crypto.randomUUID().slice(0, 8)}`;

describe('harvest store', () => {
  before(async () => {
    await sql`SELECT 1`;
  });

  after(async () => {
    await sql`DELETE FROM harvest_fetches WHERE source = ${SOURCE}`;
    await sql`DELETE FROM harvest_queue WHERE source = ${SOURCE}`;
    await sql.end();
  });

  it('enqueueing the same worklist twice adds nothing the second time', async () => {
    // The guarantee the unique index exists for. A duplicate fetch is money
    // spent on nothing.
    const items = [
      { source: SOURCE, itemKey: 'j-1', citation: '(2019) 4 SCC 221' },
      { source: SOURCE, itemKey: 'j-2', citation: 'AIR 1973 SC 1461' },
    ];
    assert.equal(await enqueue(sql, items), 2);
    assert.equal(await enqueue(sql, items), 0, 're-enqueueing added rows');
  });

  it('claims are atomic and never hand the same item to two workers', async () => {
    const a = await claimNext(sql, SOURCE);
    const b = await claimNext(sql, SOURCE);
    assert.ok(a && b);
    assert.notEqual(a.itemKey, b.itemKey, 'the same item was claimed twice');

    const none = await claimNext(sql, SOURCE);
    assert.equal(none, null, 'claimed an item that was already in flight');
  });

  it('a crashed worker’s items come back', async () => {
    // A claim is a timestamp rather than a boolean precisely so this is
    // possible. Without it the queue slowly bleeds items to dead processes.
    await sql`
      UPDATE harvest_queue SET claimed_at = now() - interval '2 hours'
       WHERE source = ${SOURCE} AND state = 'in_flight'`;
    const released = await releaseStaleClaims(sql, SOURCE, 30);
    assert.equal(released, 2);

    const again = await claimNext(sql, SOURCE);
    assert.ok(again, 'released items were not claimable');
    await complete(sql, again.id);
  });

  it('a failure must carry a reason — the constraint enforces it', async () => {
    const item = await claimNext(sql, SOURCE);
    assert.ok(item);
    await fail(sql, item.id, 'parser found no headnote block');

    const [row] = await sql<{ state: string; last_error: string }[]>`
      SELECT state, last_error FROM harvest_queue WHERE id = ${item.id}`;
    assert.equal(row!.state, 'failed');
    assert.match(row!.last_error, /headnote/);

    // And the database refuses a failure with no reason at all.
    await assert.rejects(
      sql`UPDATE harvest_queue SET state = 'failed', last_error = NULL WHERE id = ${item.id}`,
      /harvest_queue_failure_has_reason/,
    );
  });

  it('the body is hashed and sized by the store, not by the caller', async () => {
    // A caller must not be able to record a body it did not actually store.
    const body = '<html>judgment</html>';
    await recordFetch(sql, {
      source: SOURCE,
      url: 'https://example.test/j/1',
      outcome: 'ok',
      httpStatus: 200,
      body,
      workItemKey: 'j-1',
      costPaise: 20,
    });

    const [row] = await sql<{ body_sha256: string; bytes: number }[]>`
      SELECT body_sha256, bytes FROM harvest_fetches
       WHERE source = ${SOURCE} AND work_item_key = 'j-1'`;
    assert.equal(row!.body_sha256, sha256(body));
    assert.equal(row!.bytes, Buffer.byteLength(body, 'utf8'));
  });

  it('a refusal is recorded, with a reason and no body', async () => {
    // A ledger with gaps proves nothing about the gaps. The refusals are
    // exactly the rows an auditor would ask about.
    await recordFetch(sql, {
      source: SOURCE,
      url: 'https://example.test/j/2',
      outcome: 'refused',
      refusalReason: 'daily ceiling reached',
      httpStatus: 200,
      body: 'this must not be stored',
      workItemKey: 'j-2',
    });

    const [row] = await sql<{ http_status: number | null; body: string | null }[]>`
      SELECT http_status, body FROM harvest_fetches
       WHERE source = ${SOURCE} AND work_item_key = 'j-2'`;
    assert.equal(row!.body, null, 'a refusal that never left recorded a body');
    assert.equal(row!.http_status, null, 'a refusal recorded an HTTP status');
  });

  it('the database refuses a refusal with no reason', async () => {
    await assert.rejects(
      sql`INSERT INTO harvest_fetches (source, url, outcome)
          VALUES (${SOURCE}, 'https://example.test/x', 'refused')`,
      /harvest_fetches_refusal_has_reason/,
    );
  });

  it('alreadyFetched is keyed on the work item, not the URL', async () => {
    // The same judgment is reachable by several routes; paying twice because we
    // asked in two different ways is the failure this prevents.
    assert.equal(await alreadyFetched(sql, SOURCE, 'j-1'), true);
    assert.equal(await alreadyFetched(sql, SOURCE, 'j-2'), false, 'a refusal counted as fetched');
    assert.equal(await alreadyFetched(sql, SOURCE, 'never-seen'), false);
  });

  it('spend is read from the ledger, so it survives a restart', async () => {
    // The number that decides how many months of licence to commit to should be
    // a SELECT, not a variable that dies with the process.
    const p = await progress(sql, SOURCE);
    assert.equal(p.spentPaise, 20);
    assert.equal(p.fetches, 2, 'the refusal was not counted as a request');
    assert.ok(p.done + p.failed + p.pending + p.inFlight > 0);
  });
});
