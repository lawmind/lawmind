/**
 * The outbox loses events only in ways it COUNTS.
 *
 * R4 hidden risk #17: *"Activation writes can be lost on process exit."* The
 * risk was never that writes fail — it is that they failed SILENTLY, and a
 * funnel with unmeasured loss cannot carry a paywall experiment. "This variant
 * converts worse" and "this variant's writes were dropped during a deploy" look
 * identical in the numbers.
 *
 * So every test here is about the accounting, not about happy-path delivery.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Sql } from 'postgres';

import { ActivationOutbox, MAX_ATTEMPTS } from './activation-outbox.ts';

/**
 * A fake `sql` tag. `recordStep` calls it as a template tag and awaits it, so a
 * function returning a promise is the whole contract — no database, so these
 * run in milliseconds and can simulate an outage on demand.
 */
function fakeSql(behaviour: { failTimes?: number; failForever?: boolean } = {}) {
  let calls = 0;
  let failsLeft = behaviour.failTimes ?? 0;
  const tag = (async () => {
    calls += 1;
    if (behaviour.failForever || failsLeft > 0) {
      failsLeft -= 1;
      throw new Error('connection terminated unexpectedly');
    }
    return [];
  }) as unknown as Sql;
  return {
    sql: tag,
    get calls() {
      return calls;
    },
  };
}

describe('activation outbox', () => {
  it('delivers what it queues, and says so', async () => {
    const db = fakeSql();
    const box = new ActivationOutbox(db.sql);
    box.enqueue('u1', 'onboarded');
    box.enqueue('u2', 'created_matter');
    await box.drain();

    const s = box.stats();
    assert.equal(s.delivered, 2);
    assert.equal(s.queued, 0);
    assert.equal(s.lost, 0);
  });

  it('retries a transient failure instead of discarding it', async () => {
    // Two failures then success — a connection blip during a deploy.
    const db = fakeSql({ failTimes: 2 });
    const box = new ActivationOutbox(db.sql);
    box.enqueue('u1', 'onboarded');

    await box.drain();
    await box.drain();
    await box.drain();

    const s = box.stats();
    assert.equal(s.delivered, 1, 'the event survived the blip');
    assert.equal(s.lost, 0);
  });

  it('gives up after a bounded number of attempts, and COUNTS the loss', async () => {
    const db = fakeSql({ failForever: true });
    const box = new ActivationOutbox(db.sql);
    box.enqueue('u1', 'onboarded');

    for (let i = 0; i < MAX_ATTEMPTS + 2; i += 1) await box.drain();

    const s = box.stats();
    assert.equal(s.delivered, 0);
    assert.equal(s.droppedAfterRetries, 1);
    assert.equal(s.lost, 1, 'a lost event must be a NUMBER, never a silence');
    assert.ok(s.lastError, 'and the reason must be readable');
  });

  it('drops the OLDEST when full, and never grows without bound', async () => {
    /**
     * The trade this makes, on purpose: an unbounded queue behind a dead
     * database grows until the process dies of memory exhaustion, taking down
     * the API to protect a funnel metric. A dropped activation event costs a
     * data point; an OOM costs every advocate mid-request.
     *
     * Oldest-first because if the database has been unreachable for a while the
     * head is the stalest data and the tail is what is happening now — and the
     * present is the window anyone is actually looking at.
     */
    const db = fakeSql({ failForever: true });
    const box = new ActivationOutbox(db.sql, 3);
    for (const u of ['u1', 'u2', 'u3', 'u4', 'u5']) box.enqueue(u, 'onboarded');

    const s = box.stats();
    assert.equal(s.queued, 3, 'the cap holds');
    assert.equal(s.droppedForCapacity, 2);
    assert.equal(s.lost, 2);
  });

  it('separates the two kinds of loss, because they mean different things', async () => {
    // Capacity loss says the queue filled — the database was probably fine and
    // traffic was high. Retry loss says the writes kept failing — the database
    // was probably not fine. Collapsing them would hide which.
    const db = fakeSql({ failForever: true });
    const box = new ActivationOutbox(db.sql, 2);
    box.enqueue('u1', 'onboarded');
    box.enqueue('u2', 'onboarded');
    box.enqueue('u3', 'onboarded');
    for (let i = 0; i < MAX_ATTEMPTS + 2; i += 1) await box.drain();

    const s = box.stats();
    assert.equal(s.droppedForCapacity, 1);
    assert.ok(s.droppedAfterRetries >= 1);
    assert.equal(s.lost, s.droppedForCapacity + s.droppedAfterRetries);
  });

  it('flush drains the ordinary deploy losslessly', async () => {
    const db = fakeSql();
    const box = new ActivationOutbox(db.sql);
    box.enqueue('u1', 'onboarded');
    box.enqueue('u2', 'saved_authority');

    const s = await box.flush(1_000);
    assert.equal(s.delivered, 2);
    assert.equal(s.lost, 0, 'a clean shutdown must lose nothing');
  });

  it('flush counts what it could NOT write rather than waiting forever', async () => {
    /**
     * A shutdown that waits indefinitely for a database that is already gone
     * turns a clean deploy into a hung one. The deadline is the right call and
     * the cost is stated as a number rather than swallowed.
     */
    const db = fakeSql({ failForever: true });
    const box = new ActivationOutbox(db.sql);
    box.enqueue('u1', 'onboarded');

    const s = await box.flush(50);
    assert.equal(s.delivered, 0);
    assert.ok(s.lost >= 1, 'unflushed events are counted as lost, not forgotten');
    assert.equal(s.queued, 0);
  });

  it('carries no query text, matter text or client content — only an id and a step', () => {
    /**
     * The privacy assertion, made structurally rather than by reading the code.
     *
     * `activation_events` is (user_id, step, occurred_at) and the outbox holds
     * the same three things. There is nowhere for a query string or a matter
     * title to be smuggled through, and this test fails the day somebody adds a
     * `context` or `metadata` field to the entry shape.
     */
    const db = fakeSql();
    const box = new ActivationOutbox(db.sql);
    box.enqueue('user-uuid', 'first_successful_search');
    const keys = Object.keys(box.stats()).sort();
    assert.deepEqual(
      keys,
      [
        'draining',
        'droppedAfterRetries',
        'droppedForCapacity',
        'delivered',
        'lastError',
        'lost',
        'queued',
      ].sort(),
    );
  });
});
