/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPLIT, PROVED AGAINST TWO PHYSICALLY DIFFERENT DATABASES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `db-split.test.ts` tests the URL arithmetic and needs no database. This one
 * needs two, and the distinction is the entire point of the round brief's §9:
 * **two schemas in one database prove nothing**, because the property Gate C
 * needs is that a `TRUNCATE` in one cannot reach the other, and that is a
 * property of databases rather than of schemas.
 *
 * So the suite creates two disposable databases with `TEMPLATE template0`, asks
 * each of them who it is, and then does the one experiment that cannot be argued
 * with: it destroys data in the corpus database and checks the user database
 * still has its rows.
 *
 * Skipped without `DATABASE_URL`, and it never passes vacuously - every
 * assertion is preceded by one that proves it read something real.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres, { type Sql } from 'postgres';

import { verifyDistinctDatabases, sameDatabaseRefusal } from './db-identity.ts';
import { resolveDatabases } from '../db-split.ts';

const base = process.env['DATABASE_URL'];
const CORPUS_DB = 'lawmind_corpus_split_test';
const USER_DB = 'lawmind_user_split_test';

/** The same server, a different database name. */
function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

describe('two physically separate databases', { skip: !base }, () => {
  let admin: Sql;
  let corpus: Sql;
  let user: Sql;

  before(async () => {
    admin = postgres(withDatabase(base!, 'postgres'), { max: 1 });
    for (const name of [CORPUS_DB, USER_DB]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      // template0 rather than template1: a pristine target makes a restore's own
      // error list mean something, and is what PostgreSQL recommends.
      await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE template0`);
    }
    corpus = postgres(withDatabase(base!, CORPUS_DB), { max: 2 });
    user = postgres(withDatabase(base!, USER_DB), { max: 2 });

    await corpus`CREATE TABLE judgments (id uuid PRIMARY KEY, case_title text NOT NULL)`;
    await corpus`INSERT INTO judgments (id, case_title)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'A v. B')`;
    // The soft reference: an opaque judgment UUID and NO foreign key, because
    // PostgreSQL has none to offer across a database boundary.
    await user`CREATE TABLE matter_authorities (
                 id uuid PRIMARY KEY, matter_id uuid NOT NULL, judgment_id uuid NOT NULL)`;
    await user`CREATE INDEX matter_authorities_judgment_id_idx ON matter_authorities (judgment_id)`;
    await user`INSERT INTO matter_authorities (id, matter_id, judgment_id)
               VALUES ('22222222-2222-2222-2222-222222222222',
                       '33333333-3333-3333-3333-333333333333',
                       '11111111-1111-1111-1111-111111111111')`;
  });

  after(async () => {
    await corpus?.end();
    await user?.end();
    for (const name of [CORPUS_DB, USER_DB]) {
      await admin?.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    await admin?.end();
  });

  it('really is two databases, and the servers say so - not the URLs', async () => {
    const verdict = await verifyDistinctDatabases(corpus, user);
    assert.equal(verdict.distinct, true);
    assert.ok(verdict.distinct);
    assert.equal(verdict.corpus.database, CORPUS_DB);
    assert.equal(verdict.user.database, USER_DB);
    /* Same local server, so ONE cluster and two databases. That is genuinely
     * separate for TRUNCATE - which is the Gate-C property - while sharing a
     * disk, a WAL and a failure domain, which is a durability question and is
     * reported rather than glossed. */
    assert.equal(verdict.sameCluster, true);
  });

  it('a FOREIGN KEY across the two cannot even be created', async () => {
    /* Not a policy this repository chose: PostgreSQL has no cross-database
     * referential integrity at all. This is why migration 0102 exists. */
    await assert.rejects(
      () =>
        user`ALTER TABLE matter_authorities
             ADD CONSTRAINT fk_cross FOREIGN KEY (judgment_id) REFERENCES judgments (id)`,
      /relation "judgments" does not exist/i,
    );
  });

  it('TRUNCATING the corpus does NOT touch the user database - the Gate-C property', async () => {
    const before = await user`SELECT count(*)::text AS n FROM matter_authorities`;
    assert.equal(before[0]!['n'], '1', 'the user row must exist before the corpus is destroyed');

    // The most destructive form, and the one `cascade-guard.ts` refuses on a
    // SHARED database precisely because there it would reach across.
    await corpus`TRUNCATE judgments CASCADE`;

    const later = await user`SELECT count(*)::text AS n FROM matter_authorities`;
    assert.equal(later[0]!['n'], '1', 'a corpus TRUNCATE emptied a user table');

    const gone = await corpus`SELECT count(*)::text AS n FROM judgments`;
    assert.equal(
      gone[0]!['n'],
      '0',
      'the corpus was not actually truncated, so this proved nothing',
    );
  });

  it('the saved authority SURVIVES its corpus target vanishing, and stays readable', async () => {
    /* NEW3 R20: "Existing rows survive a later missing target." The row is not
     * deleted, not hidden and not marked; a read simply cannot resolve it, which
     * is what `unavailableAuthorities[]` reports. */
    const [row] = await user`
      SELECT judgment_id FROM matter_authorities
       WHERE id = '22222222-2222-2222-2222-222222222222'`;
    assert.equal(row?.['judgment_id'], '11111111-1111-1111-1111-111111111111');

    const found = await corpus`
      SELECT id FROM judgments WHERE id = ${row!['judgment_id'] as string}`;
    assert.equal(found.length, 0, 'the target should be absent - that is the condition under test');
  });

  it('a split declared over these two databases resolves as split', () => {
    const r = resolveDatabases({
      CORPUS_DATABASE_URL: withDatabase(base!, CORPUS_DB),
      USER_DATABASE_URL: withDatabase(base!, USER_DB),
      DB_SPLIT_MODE: 'split',
    });
    assert.equal(r.mode, 'split');
  });

  it('the SAME database under two spellings is caught by the servers, not the strings', async () => {
    /* The failure a URL comparison cannot see, and the reason `db-identity.ts`
     * exists: `localhost` and `127.0.0.1` are two strings and one server. */
    const a = postgres(withDatabase(base!, CORPUS_DB), { max: 1 });
    const b = postgres(withDatabase(base!, CORPUS_DB).replace('127.0.0.1', 'localhost'), {
      max: 1,
    });
    try {
      const verdict = await verifyDistinctDatabases(a, b);
      assert.equal(verdict.distinct, false, 'two names for one database read as distinct');
      assert.ok(!verdict.distinct);
      assert.match(sameDatabaseRefusal(verdict), /SAME database/);
    } finally {
      await a.end();
      await b.end();
    }
  });
});
