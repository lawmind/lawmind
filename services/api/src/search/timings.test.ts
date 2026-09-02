/**
 * The phase line, asserted through the REAL route rather than by calling the
 * clock directly.
 *
 * A unit test of `createPhaseClock` would pass while the route measured
 * nothing — which is precisely the failure this instrumentation exists to stop
 * happening to `/search` itself. So these drive `POST /search` and read the
 * object the route handed its sink.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';
import {
  createPhaseClock,
  measurePoolWaitMs,
  poolProbeEnabled,
  SEARCH_TOP_LEVEL_PHASES,
} from './timings.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

const lines: Record<string, unknown>[] = [];
const app = createApp({
  ping: async () => {},
  search: {
    sql,
    embedQuery: async () => null,
    onPhaseTiming: (line) => {
      lines.push(line);
    },
  },
});

async function search(query: string): Promise<Record<string, unknown>> {
  lines.length = 0;
  await app.request('/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, language: 'en' }),
  });
  const line = lines[lines.length - 1];
  assert.ok(line, 'the route emitted no phase line at all');
  return line;
}

describe('search phase timing', () => {
  after(async () => {
    await sql.end();
  });

  it('emits exactly one line per request, carrying the request-level fields', async () => {
    const line = await search('cite:"(1994) 3 SCC 1"');
    assert.equal(lines.length, 1, 'a request must produce one phase line, not several');
    assert.equal(line['event'], 'search_phase_timing');
    for (const key of [
      'query_class',
      'query_chars',
      'result_count',
      'degraded',
      'status',
      'total_ms',
    ]) {
      assert.ok(key in line, `the phase line is missing ${key}`);
    }
    assert.ok(!('query' in line), 'the phase line must never carry the query text');
  });

  /**
   * The rule `timings.ts` exists to protect. `pool_wait_ms` is measured or it is
   * null; a null must never be filled in from the residual, and the residual
   * must never be named pool wait.
   */
  it('reports pool wait as null when the probe is off, and never derives it', async () => {
    assert.equal(poolProbeEnabled(), false, 'SEARCH_POOL_PROBE must be off by default');
    const line = await search('anticipatory bail in a dowry harassment case');
    assert.equal(line['pool_wait_ms'], null);
    assert.equal(line['pool_wait_measured'], false);
    assert.ok('unattributed_ms' in line, 'the residual must be published under its own name');
  });

  it('measures pool wait at a real acquisition when the probe is on', async () => {
    process.env['SEARCH_POOL_PROBE'] = '1';
    try {
      assert.equal(poolProbeEnabled(), true);
      const measured = await measurePoolWaitMs(sql);
      assert.equal(typeof measured, 'number', 'reserve() must yield a number, not an estimate');
      assert.ok((measured as number) >= 0);
    } finally {
      delete process.env['SEARCH_POOL_PROBE'];
    }
  });

  /**
   * The arithmetic that makes the line readable, and the bug it caught.
   *
   * The phases NEST — `retrievalMs` ⊃ `armsMs` ⊃ `sparseMs` — so summing every
   * `*Ms` key triple counts: this assertion first ran at 79,244 ms of phases
   * against a 26,711 ms request. Only the TOP-LEVEL phases may be subtracted,
   * which is why `SEARCH_TOP_LEVEL_PHASES` exists and why this asserts on that
   * list rather than on every key ending in `Ms`.
   *
   * Without it, `unattributed_ms` floors at zero on every request and reports
   * "fully accounted for" on exactly the slow ones it was added to explain.
   */
  it('top-level phases plus the residual do not exceed the total', async () => {
    const line = await search('dying declaration corroboration requirement');
    let sum = 0;
    for (const name of SEARCH_TOP_LEVEL_PHASES) {
      const v = line[name];
      if (typeof v === 'number') sum += v;
    }
    const total = line['total_ms'] as number;
    const residual = line['unattributed_ms'] as number;
    assert.ok(
      sum <= total + 2,
      `top-level phases (${sum}ms) exceed total (${total}ms) — a phase is double counted`,
    );
    assert.ok(residual >= 0);
    assert.ok(sum + residual <= total + 2, 'phases plus residual overshoot the request');
  });

  /**
   * The nesting itself, asserted rather than assumed: if `sparseMs` ever stopped
   * being inside `armsMs`, or `armsMs` outside `retrievalMs`, the top-level list
   * above would be wrong and the residual would go quietly negative-then-floored.
   */
  it('the nested phases really are nested', async () => {
    const line = await search('dying declaration corroboration requirement');
    const retrieval = line['retrievalMs'];
    const arms = line['armsMs'];
    const sparse = line['sparseMs'];
    if (typeof retrieval !== 'number' || typeof arms !== 'number') return;
    assert.ok(arms <= retrieval + 2, `armsMs ${arms} is not inside retrievalMs ${retrieval}`);
    if (typeof sparse === 'number') {
      assert.ok(sparse <= arms + 2, `sparseMs ${sparse} is not inside armsMs ${arms}`);
    }
  });

  it('the clock accumulates a phase entered twice rather than overwriting it', async () => {
    const clock = createPhaseClock();
    clock.add('aMs', 10);
    clock.add('aMs', 5);
    assert.equal(clock.phases()['aMs'], 15);
  });

  /** A phase that threw is still measured — the slow failures are the interesting ones. */
  it('measures a phase that throws', async () => {
    const clock = createPhaseClock();
    await assert.rejects(
      clock.phase('bMs', async () => {
        await new Promise((r) => setTimeout(r, 5));
        throw new Error('boom');
      }),
    );
    assert.ok((clock.phases()['bMs'] ?? 0) >= 4);
  });
});
