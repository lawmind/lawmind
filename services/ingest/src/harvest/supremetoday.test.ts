/**
 * One account, bought to test, from a company that is also our closest
 * competitor and knows what we intend. **The tests here are about not losing
 * it**, not about throughput.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HARVEST_USER_AGENT,
  MAX_AUTH_ATTEMPTS,
  createSupremeTodayClient,
  orderWorklist,
} from './supremetoday.ts';

const creds = { username: 'u', password: 'p' };

function stubFetch(...responses: (Response | (() => Response))[]) {
  const seen: { url: string; init: RequestInit | undefined }[] = [];
  let i = 0;
  const impl: typeof fetch = (input, init) => {
    seen.push({ url: String(input), init });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return Promise.resolve(typeof next === 'function' ? next() : next!);
  };
  return { impl, seen };
}

const ok = () => new Response('<html>judgment</html>', { status: 200 });

test('without credentials it refuses, and never reaches the network', async () => {
  const { impl, seen } = stubFetch(ok());
  const c = createSupremeTodayClient({ credentials: undefined, fetchImpl: impl });
  assert.equal(c.configured, false);

  const r = await c.get('/api/judgment/1');
  assert.equal(r.ok, false);
  assert.equal(seen.length, 0);
});

test('every request identifies us — a licensed client should look licensed', async () => {
  const { impl, seen } = stubFetch(ok());
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });
  await c.get('/api/judgment/1');

  const ua = (seen[0]!.init!.headers as Record<string, string>)['user-agent'];
  assert.equal(ua, HARVEST_USER_AGENT);
  assert.match(ua, /Lawmind/, 'we must be identifiable in their logs');
  assert.match(ua, /contact:/, 'they must be able to ring us instead of blocking us');
});

test('a 401 halts the entire run and does NOT retry', async () => {
  // Repeated auth attempts are indistinguishable from credential stuffing on
  // their side of the wire. One account; a suspension ends the relationship.
  const { impl, seen } = stubFetch(new Response('no', { status: 401 }));
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });

  const first = await c.get('/api/judgment/1');
  assert.equal(first.ok, false);
  assert.equal(first.ok === false ? first.halted : null, 'auth_rejected');

  const second = await c.get('/api/judgment/2');
  assert.equal(second.ok, false);
  assert.equal(seen.length, 1, 'it kept knocking after being told no');
});

test('a 403 halts too — that is what a ban looks like', async () => {
  const { impl } = stubFetch(new Response('nope', { status: 403 }));
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });
  const r = await c.get('/api/judgment/1');
  assert.equal(r.ok === false ? r.halted : null, 'forbidden');
  assert.equal(c.state().halted, 'forbidden');
});

test('a halt is sticky — nothing resumes without a human', async () => {
  const { impl } = stubFetch(new Response('nope', { status: 403 }), ok());
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });
  await c.get('/a');
  const after = await c.get('/b');
  assert.equal(after.ok, false);
  assert.equal(c.waitMs(), null, 'a halted run must report no next request');
});

test('authentication is attempted once, ever', async () => {
  assert.equal(MAX_AUTH_ATTEMPTS, 1);
  const { impl } = stubFetch(new Response('{}', { status: 200 }));
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });

  const first = await c.login();
  assert.equal(first.ok, true);

  const second = await c.login();
  assert.equal(second.ok, false, 'a second login was permitted');
  assert.equal(second.ok === false ? second.halted : null, 'auth_rejected');
});

test('a 5xx is retryable and does NOT halt — transient is not fatal', async () => {
  const { impl } = stubFetch(new Response('boom', { status: 502 }));
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });
  const r = await c.get('/a');
  assert.equal(r.ok, false);
  assert.equal(r.ok === false ? r.halted : 'x', null, 'a transient error halted the run');
  assert.equal(c.state().halted, null);
});

test('strain slows the pace rather than stopping', async () => {
  const { impl } = stubFetch(new Response('slow down', { status: 429 }));
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });
  const before = c.state().pace.intervalMs;
  await c.get('/a');
  assert.ok(c.state().pace.intervalMs > before);
  assert.equal(c.state().halted, null, '429 should slow us, not stop us');
});

test('the daily ceiling stops the run, and says it is a stop', async () => {
  const { impl } = stubFetch(ok());
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl, maxRequestsPerDay: 2 });
  await c.get('/a');
  await c.get('/b');
  const third = await c.get('/c');
  assert.equal(third.ok, false);
  assert.equal(third.ok === false ? third.halted : null, 'budget_spent');
  assert.match(third.ok === false ? third.reason : '', /not a slow-down/);
});

test('the session cookie is carried after login', async () => {
  const { impl, seen } = stubFetch(
    new Response('{}', { status: 200, headers: { 'set-cookie': 'sid=abc; Path=/; HttpOnly' } }),
    ok(),
  );
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });
  await c.login();
  await c.get('/api/judgment/1');
  assert.equal((seen[1]!.init!.headers as Record<string, string>)['cookie'], 'sid=abc');
});

test('the body is returned raw — archive first, parse later', async () => {
  const { impl } = stubFetch(new Response('<html>RAW</html>', { status: 200 }));
  const c = createSupremeTodayClient({ credentials: creds, fetchImpl: impl });
  const r = await c.get('/a');
  assert.equal(r.ok, true);
  assert.equal(r.ok === true ? r.body : '', '<html>RAW</html>');
});

test('the worklist is ours, ordered by priority then stably', () => {
  // Our own corpus is the index into theirs: a finite worklist we own on day
  // one, which cannot run away with the budget the way a crawler can.
  const ordered = orderWorklist([
    { judgmentId: 'b', citation: '(2019) 4 SCC 221', priority: 2 },
    { judgmentId: 'a', citation: 'AIR 1973 SC 1461', priority: 2 },
    { judgmentId: 'c', citation: '2024 INSC 123', priority: 1 },
  ]);
  assert.deepEqual(
    ordered.map((w) => w.judgmentId),
    ['c', 'a', 'b'],
  );
});
