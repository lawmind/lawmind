/**
 * The startup guard that decides whether a deployment's claimed split is real.
 *
 * The failure this prevents does not announce itself: a deployment configured as
 * split, whose two URLs resolve to one database, passes every downstream check —
 * `cascade-guard.ts` finds nothing to warn about, the release tooling's role
 * check is satisfied, the monitoring is green — and the first corpus rollback
 * takes the advocates' matters with it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { databaseTarget, resolveDatabases, sameDatabaseIdentity } from './db-split.ts';

const A = 'postgres://u:p@host-a:5432/lawmind';
const B = 'postgres://u:p@host-b:5432/lawmind';

test('the same database written two ways is recognised as the same database', () => {
  // Every pair here is one database and two strings. A guard comparing the
  // strings passes all of them and announces a split that does not exist.
  assert.ok(sameDatabaseIdentity(A, 'postgres://u:p@host-a/lawmind'), 'default port 5432');
  assert.ok(sameDatabaseIdentity(A, 'postgres://u:p@HOST-A:5432/lawmind'), 'host case');
  assert.ok(
    sameDatabaseIdentity(A, 'postgres://other:secret@host-a:5432/lawmind?sslmode=require'),
    'different credentials and query string, same target',
  );
});

test('a different host, port or database name is a different database', () => {
  assert.ok(!sameDatabaseIdentity(A, B));
  assert.ok(!sameDatabaseIdentity(A, 'postgres://u:p@host-a:5433/lawmind'));
  assert.ok(!sameDatabaseIdentity(A, 'postgres://u:p@host-a:5432/lawmind_user'));
});

test('an unparseable URL is treated as NOT PROVEN DISTINCT, never as distinct', () => {
  /* The question is "have these been proven different". A URL that does not
   * parse proves nothing, and the safe answer is the one that refuses. */
  assert.ok(sameDatabaseIdentity(A, 'not a url'));
  assert.ok(sameDatabaseIdentity('', ''));
  assert.equal(databaseTarget('postgres://u:p@host/'), null, 'no database name');
});

test('both roles default to DATABASE_URL, so no existing deployment needs a new variable', () => {
  const r = resolveDatabases({ DATABASE_URL: A });
  assert.equal(r.mode, 'single');
  assert.equal(r.corpusUrl, A);
  assert.equal(r.userUrl, A);
});

test('two different URLs INFER split — an undeclared mode is not assumed to be single', () => {
  /* If an operator has set two different URLs they meant it. A mode that
   * silently read `single` would skip every guard while running split. */
  const r = resolveDatabases({ CORPUS_DATABASE_URL: A, USER_DATABASE_URL: B });
  assert.equal(r.mode, 'split');
});

test('DB_SPLIT_MODE=split REFUSES when both roles resolve to one database', () => {
  assert.throws(
    () => resolveDatabases({ DATABASE_URL: A, DB_SPLIT_MODE: 'split' }),
    /resolve to the SAME database/,
    'a claimed split over one database must not start',
  );
  // And the refusal must survive the two URLs being spelled differently, which
  // is the whole reason the comparison is on the target and not the string.
  assert.throws(
    () =>
      resolveDatabases({
        CORPUS_DATABASE_URL: A,
        USER_DATABASE_URL: 'postgres://admin:other@HOST-A/lawmind?sslmode=require',
        DB_SPLIT_MODE: 'split',
      }),
    /resolve to the SAME database/,
  );
});

test('DB_SPLIT_MODE=single over one database is allowed, and is the local default', () => {
  const r = resolveDatabases({ DATABASE_URL: A, DB_SPLIT_MODE: 'single' });
  assert.equal(r.mode, 'single');
});

test('a split over two real databases starts, and reports itself as split', () => {
  const r = resolveDatabases({
    CORPUS_DATABASE_URL: A,
    USER_DATABASE_URL: B,
    DB_SPLIT_MODE: 'split',
  });
  assert.equal(r.mode, 'split');
  assert.equal(r.corpusUrl, A);
  assert.equal(r.userUrl, B);
});

test('no database configured at all is a refusal, not a default', () => {
  assert.throws(() => resolveDatabases({}), /No database is configured/);
});

test('an unrecognised DB_SPLIT_MODE is refused rather than ignored', () => {
  /* Ignoring it would silently fall back to inference, and a typo'd `spilt`
   * would then run unguarded on two databases or one, whichever it happened
   * to be. */
  assert.throws(
    () => resolveDatabases({ DATABASE_URL: A, DB_SPLIT_MODE: 'spilt' }),
    /must be "single" or "split"/,
  );
});
