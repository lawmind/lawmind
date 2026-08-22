/**
 * P1's proof: expensive research cannot starve the core paths.
 *
 * The claim being tested is not "two pools exist" — that is visible in
 * `pools.ts` and proves nothing. It is the behavioural one:
 *
 *   **while every research connection is occupied by a deliberately slow
 *   statement, a core statement still completes promptly.**
 *
 * Before the split, the same assertion run against a single `max: 10` pool
 * fails by construction: the 11th caller waits for a slot with no timeout, and
 * "core" and "research" are the same eleven callers.
 *
 * The slow statement is `pg_sleep`, chosen because it holds a connection for a
 * known duration without loading the box — a real concept query would take 15 s
 * of I/O against a 16 GB index and make the measurement about the corpus rather
 * than about the queue.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAdmission } from './admission.ts';
import { createPools, RESEARCH_POOL_MAX } from '../pools.ts';

const url = process.env['DATABASE_URL'];

/** Milliseconds, rounded, so the assertion messages carry the real number. */
async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - started), value };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0;
}

describe('research work cannot starve the core pool', () => {
  it('core statements stay fast while every research connection is held', async (t) => {
    if (!url) return t.skip('DATABASE_URL not set — skipped, not passed');
    const pools = createPools(url, 30_000);
    try {
      // Occupy EVERY research connection, and one more than every research
      // connection, so the research pool's own queue is non-empty too.
      const hold = 3;
      const slow = Array.from({ length: RESEARCH_POOL_MAX + 2 }, () =>
        pools.research`SELECT pg_sleep(${hold})`.catch(() => null),
      );

      // Give them a moment to actually claim their connections; without this the
      // core queries can win the race and the test would pass vacuously.
      await new Promise((r) => setTimeout(r, 300));

      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        const { ms } = await timed(() => pools.core`SELECT 1 AS ok`);
        samples.push(ms);
      }

      const p95 = percentile(samples, 95);
      const max = Math.max(...samples);
      await Promise.all(slow);

      // The bound is deliberately generous. This box is LOCAL_CONTENDED — an
      // ingest fleet and a GPU sidecar are running — so the assertion is about
      // ORDERS OF MAGNITUDE, not about a tuned number: without the split these
      // same 20 statements wait behind a 3-second sleep and land near 3,000 ms.
      assert.ok(
        p95 < 1_000,
        `core p95 was ${p95} ms (max ${max} ms) while research was saturated — the pools are not isolated`,
      );
    } finally {
      await pools.end();
    }
  });

  it('the admission gate refuses rather than queueing without bound', async (t) => {
    // No database needed: the gate is in-process and its contract is timing.
    const admission = createAdmission(2, 150);
    const a = await admission.acquire();
    const b = await admission.acquire();
    assert.ok(a && b, 'the first two requests must be admitted');

    const { ms, value: third } = await timed(() => admission.acquire());
    assert.equal(third, null, 'the third request must be refused, not queued forever');
    assert.ok(ms >= 140 && ms < 1_000, `refusal took ${ms} ms — expected roughly the wait budget`);
    assert.equal(admission.stats().refused, 1);

    // A released slot is handed to the next waiter rather than raced for.
    a.release();
    const fourth = await admission.acquire();
    assert.ok(fourth, 'a released slot must be reusable');
    fourth.release();
    b.release();
    assert.equal(admission.stats().inFlight, 0, 'every slot must return');
    void t;
  });
});
