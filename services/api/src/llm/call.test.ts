/**
 * The ledger is an audit record, so the tests are mostly about it being
 * COMPLETE — including for calls that failed, which are the ones an audit most
 * wants and the ones easiest to omit.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';

import type { Sql } from 'postgres';

import { callModel } from './call.ts';

/** Captures every INSERT without a database. */
function fakeSql(): { sql: Sql; rows: unknown[][] } {
  const rows: unknown[][] = [];
  const sql = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
    rows.push(values);
    return Promise.resolve([]);
  }) as unknown as Sql;
  return { sql, rows };
}

const ok = (body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

afterEach(() => {
  delete process.env['DPA_COUNTERSIGNED'];
  delete process.env['ANTHROPIC_DRAFTING_MODEL'];
});

/**
 * **`callModel` falls back to `process.env` when a key is not passed**, so a
 * developer with a real key in their shell tested a different code path from CI
 * — and once the keys went live on 9 Aug 2026 the "no key" test started failing
 * on this machine while passing everywhere it had ever run.
 *
 * Cleared for the whole file rather than in one test, because the failure mode
 * is silent in the other direction too: a test that thinks it supplied a fake
 * key would otherwise reach the real API with a real one.
 */
const REAL_KEYS = {
  openRouter: process.env['OPENROUTER_API_KEY'],
  anthropic: process.env['ANTHROPIC_API_KEY'],
  inferx: process.env['INFERX_API_KEY'],
};
before(() => {
  delete process.env['OPENROUTER_API_KEY'];
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['INFERX_API_KEY'];
});
after(() => {
  if (REAL_KEYS.openRouter !== undefined) process.env['OPENROUTER_API_KEY'] = REAL_KEYS.openRouter;
  if (REAL_KEYS.anthropic !== undefined) process.env['ANTHROPIC_API_KEY'] = REAL_KEYS.anthropic;
  if (REAL_KEYS.inferx !== undefined) process.env['INFERX_API_KEY'] = REAL_KEYS.inferx;
});

test('a refused route sends nothing and writes NO ledger row', async () => {
  // Nothing was spent and nothing left the system, so there is nothing to
  // record. A row here would describe traffic that never happened.
  const { sql, rows } = fakeSql();
  let called = false;
  const res = await callModel(
    sql,
    { dataClass: 'sensitive', feature: 'draft', prompt: 'x', userId: null },
    {
      fetchImpl: (async () => {
        called = true;
        return new Response('{}');
      }) as never,
    },
  );
  assert.ok(!res.ok);
  assert.match(res.reason, /no countersigned DPA/);
  assert.equal(called, false, 'a refused call still hit the network');
  assert.equal(rows.length, 0, 'a refused call wrote a ledger row');
});

test('TWO DOCUMENTS THROWS before anything is sent', async () => {
  const { sql } = fakeSql();
  await assert.rejects(
    callModel(sql, {
      dataClass: 'public',
      feature: 'search',
      prompt: 'x',
      userId: null,
      documentIds: ['a', 'b'],
    }),
    /One document per call/,
  );
});

test('a successful public call writes a ledger row with the right class', async () => {
  const { sql, rows } = fakeSql();
  const res = await callModel(
    sql,
    { dataClass: 'public', feature: 'search', prompt: 'what is section 138', userId: 'u-1' },
    {
      openRouterKey: 'k',
      fetchImpl: ok({
        choices: [{ message: { content: 'an answer' } }],
        usage: { prompt_tokens: 11, completion_tokens: 4, cost: 0.000003 },
      }),
    },
  );
  assert.ok(res.ok);
  assert.equal(res.text, 'an answer');
  assert.equal(rows.length, 1, 'no ledger row was written');
  const row = rows[0]!;
  assert.equal(row[0], 'u-1');
  assert.equal(row[1], 'search');
  assert.ok(String(row[2]).includes('deepseek'), 'wrong model recorded');
  assert.equal(row[7], 'public', 'data_class was not recorded');
  assert.equal(row[8], false, 'pseudonymised was not recorded');
});

test('A FAILED CALL STILL WRITES THE LEDGER ROW', async () => {
  // The row an audit most wants, and the easiest to omit. A failed call still
  // spent latency and may still have been billed; leaving it out would make
  // the ledger describe a cheaper, healthier system than the real one.
  const { sql, rows } = fakeSql();
  const res = await callModel(
    sql,
    { dataClass: 'public', feature: 'search', prompt: 'x', userId: 'u-2' },
    { openRouterKey: 'k', fetchImpl: (async () => new Response('nope', { status: 429 })) as never },
  );
  assert.ok(!res.ok);
  assert.match(res.reason, /http 429/);
  assert.equal(rows.length, 1, 'a failed call wrote no ledger row');
  assert.equal(rows[0]![7], 'public');
});

test('a thrown network error also writes the ledger row', async () => {
  const { sql, rows } = fakeSql();
  const res = await callModel(
    sql,
    { dataClass: 'public', feature: 'search', prompt: 'x', userId: null },
    {
      openRouterKey: 'k',
      fetchImpl: (async () => {
        throw new Error('socket hang up');
      }) as never,
    },
  );
  assert.ok(!res.ok);
  assert.match(res.reason, /socket hang up/);
  assert.equal(rows.length, 1);
});

test('a ledger write failure does NOT fail the call — that would double-spend', async () => {
  // Losing one audit row is bad. Turning a successful, billed call into an
  // error the caller retries is worse.
  const exploding = (() => Promise.reject(new Error('db down'))) as unknown as Sql;
  const res = await callModel(
    exploding,
    { dataClass: 'public', feature: 'search', prompt: 'x', userId: null },
    {
      openRouterKey: 'k',
      fetchImpl: ok({ choices: [{ message: { content: 'fine' } }], usage: {} }),
    },
  );
  assert.ok(res.ok, 'a ledger failure was allowed to fail the whole call');
  assert.equal(res.text, 'fine');
});

test('a missing key refuses honestly rather than pretending', async () => {
  const { sql, rows } = fakeSql();
  const res = await callModel(
    sql,
    { dataClass: 'public', feature: 'search', prompt: 'x', userId: null },
    { openRouterKey: undefined, fetchImpl: ok({}) },
  );
  assert.ok(!res.ok);
  assert.match(res.reason, /No API key/);
  assert.equal(rows.length, 0);
});

test('a search call prefers inferx over OpenRouter when both keys are present', async () => {
  const { sql, rows } = fakeSql();
  const calledUrls: string[] = [];
  const res = await callModel(
    sql,
    { dataClass: 'public', feature: 'search', prompt: 'x', userId: null },
    {
      openRouterKey: 'or-key',
      inferxKey: 'ix-key',
      fetchImpl: (async (url: unknown) => {
        calledUrls.push(String(url));
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    },
  );
  assert.ok(res.ok);
  assert.equal(calledUrls.length, 1);
  assert.match(calledUrls[0]!, /inferx\.net/, 'inferx was not preferred over OpenRouter');
  assert.equal(res.costUsd, 0, 'the free grant must never be billed');
  // The recorded model stays the logical one routeCall chose — inferx is a
  // delivery detail, not a different model.
  assert.ok(String(rows[0]![2]).includes('deepseek'));
});

test('falls back to OpenRouter when no inferx key is configured', async () => {
  const { sql } = fakeSql();
  const calledUrls: string[] = [];
  const res = await callModel(
    sql,
    { dataClass: 'public', feature: 'search', prompt: 'x', userId: null },
    {
      openRouterKey: 'or-key',
      inferxKey: undefined,
      fetchImpl: (async (url: unknown) => {
        calledUrls.push(String(url));
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 } }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    },
  );
  assert.ok(res.ok);
  assert.match(calledUrls[0]!, /openrouter\.ai/);
  assert.equal(res.costUsd, 0.001);
});

test('inferx is never used for a model other than DeepSeek V4 Flash', async () => {
  // Drafting routes to Claude Sonnet via ANTHROPIC_DRAFTING_MODEL — an inferx
  // key present must not redirect an Anthropic-routed call anywhere near it.
  process.env['ANTHROPIC_DRAFTING_MODEL'] = 'claude-sonnet-4-6-test';
  const { sql } = fakeSql();
  const calledUrls: string[] = [];
  const res = await callModel(
    sql,
    { dataClass: 'public', feature: 'draft', prompt: 'x', userId: null },
    {
      anthropicKey: 'a-key',
      inferxKey: 'ix-key',
      fetchImpl: (async (url: unknown) => {
        calledUrls.push(String(url));
        return new Response(JSON.stringify({ content: [{ text: 'ok' }], usage: {} }), { status: 200 });
      }) as unknown as typeof fetch,
    },
  );
  assert.ok(res.ok);
  assert.match(calledUrls[0]!, /anthropic\.com/);
});

test('sensitive data is refused even WITH a DPA, because no pseudonymiser exists', async () => {
  /**
   * The second gate, and it must outlive the first. Opening the DPA gate must
   * not silently start sending raw client text while recording
   * `pseudonymised = true` — a false claim in an audit ledger is worse than no
   * call at all.
   */
  process.env['DPA_COUNTERSIGNED'] = 'true';
  const { sql, rows } = fakeSql();
  const res = await callModel(
    sql,
    { dataClass: 'sensitive', feature: 'extract', prompt: 'client file', userId: null },
    { anthropicKey: 'k', fetchImpl: ok({}) },
  );
  assert.ok(!res.ok);
  assert.match(res.reason, /no pseudonymiser exists/);
  assert.equal(rows.length, 0);
});
