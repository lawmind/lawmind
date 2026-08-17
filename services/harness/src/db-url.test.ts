import assert from 'node:assert/strict';
import test from 'node:test';

import { sslFor } from './db-url.ts';

/** The exact URL the whole lane now targets, and the one the old test missed. */
test('127.0.0.1 is local — the case that broke every harness CLI', () => {
  assert.equal(sslFor('postgresql://postgres:pw@127.0.0.1:5432/lawmind'), false);
});

test('the other local spellings are local too', () => {
  assert.equal(sslFor('postgresql://u:p@localhost:5432/db'), false);
  assert.equal(sslFor('postgresql://u:p@[::1]:5432/db'), false);
  assert.equal(sslFor('postgresql://u:p@0.0.0.0:5432/db'), false);
});

test('a remote host requires TLS', () => {
  assert.equal(sslFor('postgresql://u:p@hayabusa.proxy.rlwy.net:24909/railway'), 'require');
});

/**
 * The substring test disabled TLS whenever the word appeared ANYWHERE — in a
 * subdomain, or in a password. Both are public connections.
 */
test('a remote host that merely CONTAINS the word still requires TLS', () => {
  assert.equal(sslFor('postgresql://u:p@localhost.db.example.com:5432/db'), 'require');
});

test('a password containing the word does not disable TLS', () => {
  assert.equal(sslFor('postgresql://u:localhost@db.example.com:5432/db'), 'require');
});

/** Fails closed: unparseable means remote, because the cost is asymmetric. */
test('an unparseable url is treated as remote', () => {
  assert.equal(sslFor('not a url'), 'require');
});
