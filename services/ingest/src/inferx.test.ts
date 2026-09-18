import assert from 'node:assert/strict';
import { test } from 'node:test';

import { callInferx } from './inferx.ts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('a successful call returns the text and token counts', async () => {
  const result = await callInferx('hello', {
    apiKey: 'k',
    fetchImpl: (async () =>
      jsonResponse(200, {
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })) as unknown as typeof fetch,
  });
  assert.ok(result.ok);
  assert.equal(result.text, '{"ok":true}');
  assert.equal(result.inputTokens, 10);
  assert.equal(result.outputTokens, 5);
});

test('429 retries with backoff and succeeds once capacity frees up', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await callInferx('hello', {
    apiKey: 'k',
    fetchImpl: (async () => {
      calls++;
      if (calls < 3) return jsonResponse(429, { error: 'capacity' });
      return jsonResponse(200, { choices: [{ message: { content: 'ok' } }], usage: {} });
    }) as unknown as typeof fetch,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.ok(result.ok);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('429 on every attempt exhausts retries and reports why', async () => {
  const result = await callInferx('hello', {
    apiKey: 'k',
    fetchImpl: (async () => jsonResponse(429, {})) as unknown as typeof fetch,
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /retries exhausted/);
});

test('a non-429, non-ok status is not retried', async () => {
  let calls = 0;
  const result = await callInferx('hello', {
    apiKey: 'k',
    fetchImpl: (async () => {
      calls++;
      return jsonResponse(401, {});
    }) as unknown as typeof fetch,
    sleepImpl: async () => {},
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'http 401');
});

test('empty content is reported as a distinct failure, not an empty success', async () => {
  const result = await callInferx('hello', {
    apiKey: 'k',
    fetchImpl: (async () =>
      jsonResponse(200, {
        choices: [{ message: { content: '' } }],
        usage: {},
      })) as unknown as typeof fetch,
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /empty content/);
});
