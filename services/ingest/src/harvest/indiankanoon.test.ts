/**
 * The budget guard is the point of this client. ₹500 is 2,500 documents, and a
 * loop with an off-by-one spends it before anyone reads a log.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PRICE_PAISE,
  budgetSummary,
  canAfford,
  createIndianKanoonClient,
  formatRupees,
  initialSpend,
} from './indiankanoon.ts';

/** A fetch that succeeds and records how many times it was called. */
function countingFetch(status = 200) {
  const calls: string[] = [];
  const impl: typeof fetch = (input) => {
    calls.push(String(input));
    return Promise.resolve(new Response(JSON.stringify({ docs: [] }), { status }));
  };
  return { impl, calls };
}

test('without a token every call refuses, and says why', async () => {
  const c = createIndianKanoonClient({ token: undefined, fetchImpl: countingFetch().impl });
  assert.equal(c.configured, false);

  const r = await c.search('anticipatory bail');
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : '', /INDIANKANOON_API_TOKEN/);
});

test('a missing token spends nothing — it refuses before the network', async () => {
  const { impl, calls } = countingFetch();
  const c = createIndianKanoonClient({ token: undefined, fetchImpl: impl });
  await c.search('x');
  await c.document(1);
  assert.equal(calls.length, 0, 'an unconfigured client reached the network');
  assert.equal(c.spend().spentPaise, 0);
});

test('the budget is checked BEFORE the request, not after', async () => {
  // A guard that reports what was spent is an invoice. One that refuses is a
  // control.
  const { impl, calls } = countingFetch();
  const c = createIndianKanoonClient({ token: 't', budgetPaise: 30, fetchImpl: impl });

  const first = await c.document(1); // 20 paise, affordable
  assert.equal(first.ok, true);
  assert.equal(calls.length, 1);

  const second = await c.document(2); // would take it to 40 > 30
  assert.equal(second.ok, false);
  assert.equal(calls.length, 1, 'the refused call still hit the network');
  assert.match(second.ok === false ? second.reason : '', /budget exhausted/);
});

test('prices are the published ones, in paise', () => {
  assert.equal(PRICE_PAISE.search, 50);
  assert.equal(PRICE_PAISE.document, 20);
  assert.equal(PRICE_PAISE.fragment, 5);
});

test('spend is recorded even when the call fails — a metered API charges anyway', async () => {
  const c = createIndianKanoonClient({
    token: 't',
    budgetPaise: 10_000,
    fetchImpl: countingFetch(500).impl,
  });
  const r = await c.document(1);
  assert.equal(r.ok, false);
  assert.equal(c.spend().spentPaise, PRICE_PAISE.document, 'a failed call was treated as free');
});

test('a transport error also costs — and does not throw', async () => {
  const impl: typeof fetch = () => Promise.reject(new Error('socket hang up'));
  const c = createIndianKanoonClient({ token: 't', budgetPaise: 10_000, fetchImpl: impl });
  const r = await c.document(1);
  assert.equal(r.ok, false);
  assert.equal(c.spend().spentPaise, PRICE_PAISE.document);
});

test('strain slows the pace, so a struggling service is not hammered', async () => {
  const c = createIndianKanoonClient({
    token: 't',
    budgetPaise: 10_000,
    fetchImpl: countingFetch(429).impl,
  });
  const before = c.spend().pace.intervalMs;
  await c.document(1);
  assert.ok(c.spend().pace.intervalMs > before, '429 did not slow the pace');
});

test('a fragment is a quarter the price of a document — the cheap way to sample', async () => {
  const c = createIndianKanoonClient({
    token: 't',
    budgetPaise: 10_000,
    fetchImpl: countingFetch().impl,
  });
  await c.fragment(1, 'bail');
  assert.equal(c.spend().spentPaise, 5);
  assert.equal(c.spend().calls.fragment, 1);
});

test('canAfford refuses with an explanation, not a boolean', () => {
  const s = { ...initialSpend(), spentPaise: 49_990 };
  const r = canAfford(s, 'search', 50_000);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : '', /₹499\.90 of ₹500\.00/);
});

test('money formats as rupees but is never stored as them', () => {
  assert.equal(formatRupees(50_000), '₹500.00');
  assert.equal(formatRupees(5), '₹0.05');
  assert.equal(formatRupees(0), '₹0.00');
});

test('the ₹500 credit is 2,500 documents — a sample, not a corpus', () => {
  const summary = budgetSummary(50_000);
  assert.match(summary, /2500 documents/);
  assert.match(summary, /1000 searches/);
  assert.match(summary, /not a corpus/);
});
