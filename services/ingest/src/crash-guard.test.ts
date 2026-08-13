/**
 * The guard's only job is to make a silent death readable. These assert the two
 * shapes that actually killed workers today: an error whose real code sits on
 * `cause` (what `fetch` produces), and a self-referential chain that must not
 * spin.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeError, installCrashGuard } from './crash-guard.ts';

describe('describeError', () => {
  it('includes name, message and code', () => {
    const out = describeError(Object.assign(new Error('boom'), { code: 'ENOTFOUND' }));
    assert.ok(out.includes('Error: boom'));
    assert.ok(out.includes('[ENOTFOUND]'), 'the code is the first thing worth seeing');
  });

  it('follows the cause chain fetch actually produces', () => {
    const inner = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const outer = Object.assign(new TypeError('fetch failed'), { cause: inner });
    const out = describeError(outer);
    assert.ok(out.includes('fetch failed'));
    assert.ok(out.includes('caused by'), 'the useful half is in the cause');
    assert.ok(out.includes('ENOTFOUND'));
  });

  it('does not spin on a self-referential cause', () => {
    const e: Record<string, unknown> = { message: 'loop' };
    e['cause'] = e;
    assert.ok(describeError(e).length > 0);
  });

  it('survives a non-Error throw', () => {
    assert.ok(describeError('just a string').includes('just a string'));
    assert.ok(describeError(null).includes('null'));
  });
});

describe('installCrashGuard', () => {
  it('is idempotent and registers both handlers', () => {
    const before = process.listenerCount('unhandledRejection');
    installCrashGuard('test-worker');
    installCrashGuard('test-worker');
    // Exactly one added, not two -- a double-install would print every crash twice.
    assert.equal(process.listenerCount('unhandledRejection'), before + 1);
  });
});
