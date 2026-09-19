/**
 * ─────────────────────────────────────────────────────────────────────────────
 * N-4 — THE MECHANISM, AND THE THREE WAYS IT COULD HAVE BEEN USELESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An automated prewarm is easy to write and easy to write uselessly. These tests
 * hold the three properties that make it a fix:
 *
 *   1. READINESS ACTUALLY WAITS. A warm pass that does not gate `/ready` still
 *      lets a load balancer send the first advocate into the cold corpus, which is
 *      the whole defect. Tested through `/ready`, not on the module.
 *   2. A FAILED PASS DOES NOT BECOME AN OUTAGE. Refusing to serve because the
 *      corpus is slow would convert a latency defect into downtime.
 *   3. IT CANNOT RUN TWICE AT ONCE. A restart storm must not put six concurrent
 *      warm passes onto one cold database.
 *
 * No database is used. `Sql` is faked, because what is under test is the state
 * machine and the gate — not whether Postgres can run a SELECT.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Sql } from 'postgres';

import { createPrewarm } from './prewarm.ts';
import { createApp, type ReadinessReport } from '../app.ts';

/**
 * A tagged-template stand-in for `postgres.js`.
 *
 * `onQuery` is called once per step, so a test can count steps, fail a chosen one,
 * or hang forever — the three behaviours the real thing exhibits.
 */
function fakeSql(onQuery: (n: number) => Promise<unknown>): { sql: Sql; count: () => number } {
  let n = 0;
  const sql = ((..._args: unknown[]) => {
    n += 1;
    return onQuery(n);
  }) as unknown as Sql;
  return { sql, count: () => n };
}

const readinessWith =
  (corpusWarm: ReadinessReport['corpusWarm']) => async (): Promise<ReadinessReport> => ({
    corpusReachable: true,
    userReachable: true,
    splitMode: 'single',
    rolesDistinct: null,
    servingEnv: 'staging',
    corpusWarm,
  });

async function readyStatus(corpusWarm: ReadinessReport['corpusWarm']): Promise<number> {
  const app = createApp({ ping: async () => {}, readiness: readinessWith(corpusWarm) });
  return (await app.request('/ready')).status;
}

describe('N-4 · the prewarm state machine', () => {
  it('starts cold, reports warming during the pass, and ends warm', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { sql, count } = fakeSql(async (n) => {
      if (n === 1) await gate;
      return [];
    });
    const prewarm = createPrewarm(sql);

    assert.equal(prewarm.status().state, 'cold');
    const running = prewarm.run();
    assert.equal(prewarm.status().state, 'warming');

    release!();
    const final = await running;
    assert.equal(final.state, 'warm');
    assert.equal(prewarm.status().state, 'warm');
    assert.ok(count() >= 4, `expected every step to run, ran ${count()}`);
    assert.ok((final.durationMs ?? -1) >= 0, 'a completed pass records its duration');
    assert.equal(final.detail, null, 'a successful pass leaves no failure detail');
  });

  it('exercises the full-text path LAST, so it is the most recently cached', async () => {
    const seen: string[] = [];
    const sql = ((strings: TemplateStringsArray, ..._v: unknown[]) => {
      seen.push(Array.isArray(strings) ? strings.join('?') : String(strings));
      return Promise.resolve([]);
    }) as unknown as Sql;

    await createPrewarm(sql).run();

    const fullTextAt = seen.findIndex((q) => q.includes('full_text_tsv'));
    assert.notEqual(fullTextAt, -1, 'nothing touched the full-text index — the 17.71 GB GIN');
    assert.equal(
      fullTextAt,
      seen.length - 1,
      'the full-text step must be last; it is the biggest win and must be the last evicted',
    );
  });

  it('records a failure with the step that caused it, and does not throw', async () => {
    const { sql } = fakeSql(async (n) => {
      if (n === 2) throw new Error('relation "judgments" does not exist');
      return [];
    });

    const final = await createPrewarm(sql).run();
    assert.equal(final.state, 'failed');
    assert.ok(
      final.detail?.includes('judgments-btree'),
      `the failure must name its step, got: ${final.detail}`,
    );
    assert.ok(final.detail?.includes('does not exist'), 'and must carry the underlying reason');
  });

  it('a second run joins the pass in flight rather than starting another', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { sql, count } = fakeSql(async (n) => {
      if (n === 1) await gate;
      return [];
    });
    const prewarm = createPrewarm(sql);

    const a = prewarm.run();
    const b = prewarm.run();
    assert.equal(a, b, 'two concurrent callers must share one pass');
    release!();
    await Promise.all([a, b]);
    /**
     * Four steps, not eight. A restart storm that started a pass per caller would
     * put N concurrent scans onto the one database the mechanism exists to
     * protect.
     */
    assert.equal(count(), 4, `expected 4 queries for one pass, saw ${count()}`);
  });
});

describe('N-4 · readiness waits for warm, and a failed warm is not an outage', () => {
  it('holds readiness at 503 while cold and while warming', async () => {
    assert.equal(await readyStatus('cold'), 503, 'a cold corpus must not be routed traffic');
    assert.equal(await readyStatus('warming'), 503, 'a warming corpus must not be routed traffic');
  });

  it('releases readiness once warm', async () => {
    assert.equal(await readyStatus('warm'), 200);
  });

  it('releases readiness on a FAILED warm — slow is not the same as down', async () => {
    /**
     * The deliberate asymmetry. A prewarm that could not run means the first query
     * will be slow; refusing to serve at all would turn that into downtime. The
     * failure is logged at error level and appears in the /ready body, so it is
     * loud rather than absorbed.
     */
    assert.equal(await readyStatus('failed'), 200);
  });

  it('a deployment that supplies no prewarm is ready — absent is not cold', async () => {
    assert.equal(await readyStatus(undefined), 200);
  });

  it('a cold corpus does not mask a genuinely broken database', async () => {
    /**
     * The one ordering that would have made this fix dangerous: if `corpusWarm`
     * were checked in a way that short-circuited the reachability checks, an
     * unreachable role could read as "still warming" and an operator would wait
     * for a warm pass that can never finish.
     */
    const app = createApp({
      ping: async () => {},
      readiness: async () => ({
        corpusReachable: false,
        userReachable: true,
        splitMode: 'single',
        rolesDistinct: null,
        servingEnv: 'staging',
        corpusWarm: 'cold',
      }),
    });
    const res = await app.request('/ready');
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: { details: { corpusReachable: boolean } } };
    assert.equal(
      body.error.details.corpusReachable,
      false,
      'the response must still say the corpus is unreachable, not merely cold',
    );
  });
});
