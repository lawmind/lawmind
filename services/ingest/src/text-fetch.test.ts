/**
 * The DNS retry exists because two ingest workers were killed outright by
 * `getaddrinfo ENOTFOUND` on the S3 host. These assert the two things that
 * matter: a transient code is recognised however deeply `fetch` buries it, and
 * a non-transient failure is NOT retried into a silent stall.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { transientNetworkCode } from './text.ts';

describe('transient network detection', () => {
  it('finds the code on the error itself', () => {
    assert.equal(transientNetworkCode(Object.assign(new Error('x'), { code: 'ENOTFOUND' })), 'ENOTFOUND');
  });

  it('digs the code out of a nested cause, which is where fetch puts it', () => {
    // Real shape: TypeError('fetch failed') { cause: Error { code: 'ENOTFOUND' } }
    const inner = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const outer = Object.assign(new TypeError('fetch failed'), { cause: inner });
    assert.equal(transientNetworkCode(outer), 'ENOTFOUND');
  });

  it('recognises the other codes that killed workers', () => {
    for (const code of ['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT']) {
      const e = Object.assign(new TypeError('fetch failed'), { cause: { code } });
      assert.equal(transientNetworkCode(e), code);
    }
  });

  it('returns null for a real failure so it is thrown, not retried', () => {
    // A 404 or a parse error must surface immediately. Retrying a permanent
    // error just turns a fast failure into a slow one.
    assert.equal(transientNetworkCode(new Error('GET ... -> 404')), null);
    assert.equal(transientNetworkCode(Object.assign(new Error('x'), { code: 'ERR_INVALID_URL' })), null);
  });

  it('does not loop forever on a self-referential cause chain', () => {
    const e: Record<string, unknown> = { code: 'NOPE' };
    e['cause'] = e;
    assert.equal(transientNetworkCode(e), null);
  });
});
