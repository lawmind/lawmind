import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_TRANSIENT_RETRIES,
  isTransientDbOrNetworkError,
  transientBackoffMs,
  withTransientRetry,
} from './db-transient.ts';

/** The exact shape `postgres` throws. `.code` holds a SQLSTATE, not an errno. */
const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('isTransientDbOrNetworkError — the one that killed the fleet', () => {
  it('recognises the literal error every worker died on', () => {
    /**
     * 17 Aug 2026, 22:39Z: twenty-odd scopes, all with this message, all exited
     * 1, all abandoned by supervise.mjs as "a defect, not a network blip".
     */
    const err = pgError('57P03', 'the database system is not yet accepting connections');
    assert.equal(isTransientDbOrNetworkError(err), true);
  });

  it('recognises it from the message alone, with no code at all', () => {
    const err = new Error('the database system is not yet accepting connections');
    assert.equal(isTransientDbOrNetworkError(err), true, 'the backstop must not depend on .code');
  });

  it('covers the states seen on the way DOWN, not just on the way up', () => {
    for (const [code, msg] of [
      ['57P01', 'terminating connection due to administrator command'],
      ['57P02', 'terminating connection because of crash of another server process'],
      ['08006', 'connection failure'],
      ['08001', 'could not establish connection'],
      ['08004', 'server rejected the connection'],
    ] as const) {
      assert.equal(isTransientDbOrNetworkError(pgError(code, msg)), true, code);
    }
  });

  it('still recognises the errno codes the old classifier handled', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']) {
      assert.equal(isTransientDbOrNetworkError(pgError(code, 'socket')), true, code);
    }
  });

  it('unwraps undici, which hides the real code one level down in .cause', () => {
    const wrapped = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
    });
    assert.equal(isTransientDbOrNetworkError(wrapped), true);
  });

  it('REFUSES defects — a retried constraint violation is a slow bug, not a fixed one', () => {
    for (const [code, msg] of [
      ['23505', 'duplicate key value violates unique constraint'],
      ['42601', 'syntax error at or near "UNION"'],
      ['22021', 'invalid byte sequence for encoding "UTF8"'],
      ['42P01', 'relation "judgments" does not exist'],
    ] as const) {
      assert.equal(isTransientDbOrNetworkError(pgError(code, msg)), false, code);
    }
  });

  it('is false for undefined and for a bare object', () => {
    assert.equal(isTransientDbOrNetworkError(undefined), false);
    assert.equal(isTransientDbOrNetworkError({}), false);
  });
});

describe('the retry budget outlasts a real recovery', () => {
  it('sums to more than the 150.9s this cluster actually took to recover', () => {
    let total = 0;
    for (let a = 1; a < MAX_TRANSIENT_RETRIES; a++) total += transientBackoffMs(a);
    assert.ok(
      total > 150_900,
      `budget ${total}ms must outlast the measured 150,900ms recovery (bus 0585)`,
    );
  });

  it('the OLD budget of five attempts would NOT have', () => {
    /** Recorded so nobody lowers it back without meeting this number. */
    let old = 0;
    for (let a = 1; a < 5; a++) old += transientBackoffMs(a);
    assert.ok(old < 150_900, `the old ${old}ms budget expired mid-recovery, which is the defect`);
  });
});

describe('withTransientRetry', () => {
  it('waits out a transient failure and returns the eventual result', async () => {
    let calls = 0;
    const got = await withTransientRetry(
      'test',
      async () => {
        calls++;
        if (calls < 3) throw pgError('57P03', 'the database system is not yet accepting connections');
        return 'ok';
      },
      () => {},
    );
    assert.equal(got, 'ok');
    assert.equal(calls, 3);
  });

  it('rethrows a defect immediately, without burning a single retry', async () => {
    let calls = 0;
    await assert.rejects(
      withTransientRetry(
        'test',
        async () => {
          calls++;
          throw pgError('23505', 'duplicate key');
        },
        () => {},
      ),
      /duplicate key/,
    );
    assert.equal(calls, 1, 'a defect must reach supervise.mjs as an exit, not be slept on');
  });
});
