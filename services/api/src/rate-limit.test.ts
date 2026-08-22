/**
 * The limiter's contract, tested without a clock and without a database.
 *
 * The properties that matter are all about EDGES — the limit itself, the moment
 * a window expires, and the burst a fixed window would let through — so `hit()`
 * takes `now` and every test states its own time. A test that slept would be
 * slow, flaky, and would still not be able to assert the sliding-window
 * property, which is the one a naive implementation gets wrong.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { hit, resetRateLimits } from './rate-limit.ts';

describe('rate limiter', () => {
  beforeEach(() => resetRateLimits());

  it('allows exactly `limit` requests and refuses the next', () => {
    for (let i = 0; i < 5; i++) {
      assert.equal(hit('k', 5, 1000, 100).allowed, true, `request ${i + 1} should be allowed`);
    }
    assert.equal(hit('k', 5, 1000, 100).allowed, false);
  });

  it('keys are independent — one caller cannot exhaust another', () => {
    for (let i = 0; i < 5; i++) hit('a', 5, 1000, 100);
    assert.equal(hit('a', 5, 1000, 100).allowed, false);
    assert.equal(hit('b', 5, 1000, 100).allowed, true);
  });

  it('slides: a caller cannot spend two full windows back to back', () => {
    // Spend the whole allowance at the very end of a notional fixed window.
    for (let i = 0; i < 5; i++) hit('k', 5, 1000, 999);
    // One millisecond later, a FIXED window would have reset and allowed five
    // more — ten requests in two milliseconds, which for magic-link mail is the
    // entire abuse. A sliding window still refuses.
    assert.equal(hit('k', 5, 1000, 1000).allowed, false);
    // Only once the original hits have genuinely aged out does it allow again.
    assert.equal(hit('k', 5, 1000, 2000).allowed, true);
  });

  it('reports how long to wait, and the wait is bounded by the window', () => {
    for (let i = 0; i < 3; i++) hit('k', 3, 10_000, 1_000);
    const refused = hit('k', 3, 10_000, 5_000);
    assert.equal(refused.allowed, false);
    // Oldest hit was at 1,000 and expires at 11,000; now is 5,000.
    assert.equal(refused.retryAfterMs, 6_000);
  });

  it('remaining counts down and never goes negative', () => {
    assert.equal(hit('k', 2, 1000, 0).remaining, 1);
    assert.equal(hit('k', 2, 1000, 0).remaining, 0);
    assert.equal(hit('k', 2, 1000, 0).remaining, 0);
  });
});
