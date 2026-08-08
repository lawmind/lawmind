/**
 * The pace controller decides how much a ₹50,000/month licence costs in total,
 * and how a competitor experiences our traffic. Both deserve tests.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_PACE,
  type PaceLimits,
  initialState,
  nextDelayMs,
  observe,
  projectCompletion,
} from './pace.ts';

/** Faster thresholds so a test can reach a speed-up without 20 iterations. */
const quick: PaceLimits = { ...DEFAULT_PACE, successesBeforeSpeedUp: 3 };

function run(signals: readonly Parameters<typeof observe>[1][], limits = quick) {
  let s = initialState(limits);
  for (const sig of signals) s = observe(s, sig, limits);
  return s;
}

test('it starts slow — politeness is cheap on day one', () => {
  const s = initialState();
  assert.equal(s.intervalMs, DEFAULT_PACE.startIntervalMs);
  assert.equal(nextDelayMs(s), DEFAULT_PACE.startIntervalMs);
  assert.ok(s.intervalMs > DEFAULT_PACE.floorIntervalMs, 'must not begin at full speed');
});

test('it does not speed up before it has earned it', () => {
  const s = run(['ok', 'ok']);
  assert.equal(s.intervalMs, quick.startIntervalMs, 'sped up on two successes');
});

test('it speeds up after a clean run, gradually', () => {
  const s = run(['ok', 'ok', 'ok']);
  assert.ok(s.intervalMs < quick.startIntervalMs);
  assert.equal(s.intervalMs, quick.startIntervalMs * quick.speedUpFactor);
});

test('a retreat costs far more than a speed-up gains', () => {
  // The asymmetry is the safety property: yielding must be cheaper than probing.
  const gained = 1 - quick.speedUpFactor;
  const lost = quick.slowDownFactor - 1;
  assert.ok(lost > gained * 4, `retreat ${lost} should dwarf gain ${gained}`);
});

test('any sign of strain backs off immediately, not after a threshold', () => {
  for (const bad of ['throttled', 'error', 'slow'] as const) {
    const s = run(['ok', 'ok', 'ok', bad]);
    assert.ok(
      s.intervalMs > quick.startIntervalMs * quick.speedUpFactor,
      `${bad} did not slow the pace`,
    );
    assert.equal(s.consecutiveOk, 0, `${bad} did not reset the streak`);
  }
});

test('"slow" counts as strain — a service refuses only after it has struggled', () => {
  // The early warning that matters. Waiting for a 429 spends the goodwill the
  // controller exists to protect.
  const s = run(['slow']);
  assert.ok(s.intervalMs > quick.startIntervalMs);
});

test('it never climbs back through a wall it has already hit', () => {
  // Without this the controller sawtooths into the same limit forever, which
  // looks adaptive and is really a slow-motion loop.
  let s = run(['ok', 'ok', 'ok', 'throttled']);
  const wall = s.ceilingSeen;
  assert.ok(wall !== null, 'the strain point was not recorded');

  for (let i = 0; i < 200; i++) s = observe(s, 'ok', quick);
  assert.ok(
    s.intervalMs >= wall! * 1.1 - 1e-9,
    `climbed to ${s.intervalMs} through a wall seen at ${wall}`,
  );
});

test('it never exceeds the floor or the ceiling', () => {
  let fast = initialState(quick);
  for (let i = 0; i < 500; i++) fast = observe(fast, 'ok', quick);
  assert.ok(fast.intervalMs >= quick.floorIntervalMs);

  let slow = initialState(quick);
  for (let i = 0; i < 50; i++) slow = observe(slow, 'throttled', quick);
  assert.ok(slow.intervalMs <= quick.ceilingIntervalMs);
});

test('a spent budget returns null — STOP, not "wait longer"', () => {
  // The distinction is load-bearing. A caller that conflates them either stalls
  // forever or breaches the contractual cap.
  const limits: PaceLimits = { ...quick, maxRequestsPerDay: 3 };
  const s = run(['ok', 'ok', 'ok'], limits);
  assert.equal(nextDelayMs(s, limits), null);
});

test('the monthly cap stops the run even when the daily one has not', () => {
  const limits: PaceLimits = { ...quick, maxRequestsPerDay: 100, maxRequestsPerMonth: 2 };
  const s = run(['ok', 'ok'], limits);
  assert.equal(nextDelayMs(s, limits), null);
});

test('the budget outranks the pace, however healthy the service looks', () => {
  const limits: PaceLimits = { ...quick, maxRequestsPerDay: 5 };
  let s = initialState(limits);
  for (let i = 0; i < 5; i++) s = observe(s, 'ok', limits);
  assert.equal(nextDelayMs(s, limits), null, 'a healthy service overrode the contract');
});

test('completion projection answers the question the licence fee turns on', () => {
  // 1,000/day against 200,000 documents is 200 days — and the point of the
  // number is that it converts directly into months of Rs 50,000.
  const limits: PaceLimits = { ...DEFAULT_PACE, maxRequestsPerDay: 1_000 };
  const p = projectCompletion(200_000, initialState(limits), limits)!;
  assert.equal(p.days, 200);
  assert.ok(p.months >= 7, `200 days should be at least 7 months, got ${p.months}`);
});

test('a faster permitted rate collapses the cost', () => {
  const slowLimits: PaceLimits = { ...DEFAULT_PACE, maxRequestsPerDay: 1_000 };
  const fastLimits: PaceLimits = {
    ...DEFAULT_PACE,
    maxRequestsPerDay: 100_000,
    maxRequestsPerMonth: 3_000_000,
  };
  const slow = projectCompletion(200_000, initialState(slowLimits), slowLimits)!;
  const fast = projectCompletion(200_000, initialState(fastLimits), fastLimits)!;
  assert.ok(
    fast.days < slow.days / 5,
    `the rate ceiling should dominate total cost: ${fast.days} vs ${slow.days}`,
  );
});

test('an impossible budget projects null rather than a comforting number', () => {
  const limits: PaceLimits = { ...DEFAULT_PACE, maxRequestsPerDay: 0 };
  assert.equal(projectCompletion(1_000, initialState(limits), limits), null);
});

test('nothing left to pull is zero days, not null', () => {
  assert.deepEqual(projectCompletion(0, initialState()), { days: 0, months: 0 });
});
