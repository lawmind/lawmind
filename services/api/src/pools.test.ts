/**
 * LCC R30 — the pool better-auth is given must not be a pool anything else uses.
 *
 * `createAuth` wraps its client in drizzle, and drizzle's postgres-js driver
 * replaces that client's json/jsonb serializers with an identity function. On
 * the Galaxy S24 that turned all six R16 creates into 500s, because `index.ts`
 * handed it `userSql`. None of this needs a database: postgres.js connects
 * lazily, and the defect is visible in the client's options before any query.
 * `scripts/lcc-r30-r16-real-route.mjs` is the end-to-end proof.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { consoleMailer, createAuth } from '@lawmind/auth';
import postgres from 'postgres';

import { createRolePools, jsonSerializerDefects } from './pools.ts';

const URL = 'postgres://nobody@127.0.0.1:1/never';
const authFor = (sql: postgres.Sql) =>
  createAuth({
    sql,
    secret: 'pools-test-secret-not-used-anywhere-0123456789',
    baseUrl: 'http://127.0.0.1:3000',
    mailer: consoleMailer(() => {}),
  });

describe('json serializers and the auth pool', () => {
  it('a stock client has no defects', () => {
    assert.deepEqual(jsonSerializerDefects({ user: postgres(URL) }), []);
  });

  it('createAuth rewrites the json serializers of the client it is handed', () => {
    const shared = postgres(URL);
    authFor(shared);
    assert.deepEqual(jsonSerializerDefects({ user: shared }), ['user:114', 'user:3802']);
  });

  it('createRolePools gives better-auth its own client, so the user pool stays stock', () => {
    const pools = createRolePools(URL, URL, 1_000);
    assert.notEqual(pools.auth, pools.user);
    authFor(pools.auth);
    assert.deepEqual(
      jsonSerializerDefects({
        corpus: pools.corpus.core,
        research: pools.corpus.research,
        user: pools.user,
      }),
      [],
    );
    assert.deepEqual(jsonSerializerDefects({ auth: pools.auth }), ['auth:114', 'auth:3802']);
  });
});
