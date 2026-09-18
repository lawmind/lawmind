/**
 * The ownership map, checked against the CATALOGUE rather than against its own
 * good intentions.
 *
 * A list of table names in a source file is an opinion. What makes it a fact is
 * that a database can refute it — and on first writing, it did: `ocr_jobs` and
 * `ecourts_transition` were classified as corpus acquisition machinery, and the
 * foreign-key invariant below caught both in one query because they reference
 * `matters` and `users`. They are an advocate's monitoring events and the OCR of
 * an advocate's uploaded document, which is sensitive-class user data a corpus
 * rollback must never touch.
 *
 * These tests need a database. They SKIP without `DATABASE_URL` rather than
 * fail, because a unit-test run on a machine with no Postgres is not evidence of
 * a misclassification — but they must never pass vacuously, so the suite first
 * asserts it actually read something.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres, { type Sql } from 'postgres';

import { CORPUS_SKIP, hasCorpus } from '../testing/corpus-required.ts';
import {
  CORPUS_TABLES,
  USER_TABLES,
  doublyClassifiedTables,
  isClassified,
  phantomTables,
  roleOf,
  unclassifiedTables,
} from './db-roles.ts';

describe('the corpus/user ownership map', () => {
  it('classifies nothing twice - ambiguous ownership is worse than none', () => {
    assert.deepEqual(doublyClassifiedTables(), []);
  });

  it('defaults an UNKNOWN table to user, which is the failure that loses nothing', () => {
    /* A corpus table wrongly called `user` means a release does not carry it:
     * loud, and nothing is destroyed. A user table wrongly called `corpus` means
     * a rollback TRUNCATEs an advocate's saved authorities: silent. */
    assert.equal(roleOf('a_table_nobody_has_added_yet'), 'user');
    assert.equal(isClassified('a_table_nobody_has_added_yet'), false);
  });

  it("puts NEW3 R20's eight soft-reference tables in the user role, all of them", () => {
    // bus 1723, verbatim: these carry a judgment id and live in the user database.
    for (const t of [
      'alerts',
      'citation_checks',
      'citation_copies',
      'citation_disputes',
      'citation_fanouts',
      'judgment_annotations',
      'matter_authorities',
      'verification_cache',
    ]) {
      assert.equal(roleOf(t), 'user', `${t} must be user-owned`);
    }
  });

  it('puts the corpus itself in the corpus role', () => {
    for (const t of ['judgments', 'judgment_chunks', 'judgment_paragraphs', 'statutes']) {
      assert.equal(roleOf(t), 'corpus', `${t} must be corpus-owned`);
    }
  });
});

const url = process.env['USER_DATABASE_URL'] ?? process.env['DATABASE_URL'];

describe('the ownership map against the live catalogue', { skip: !url }, () => {
  let sql: Sql;
  let live: string[] = [];
  let fks: { child: string; parent: string; conname: string }[] = [];

  before(async () => {
    sql = postgres(url!, { max: 2, connection: { statement_timeout: 30_000 } });
    live = (
      await sql<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`
    ).map((r) => r.tablename);
    fks = await sql<{ child: string; parent: string; conname: string }[]>`
      SELECT src.relname AS child, tgt.relname AS parent, c.conname
        FROM pg_constraint c
        JOIN pg_class src ON src.oid = c.conrelid
        JOIN pg_class tgt ON tgt.oid = c.confrelid
        JOIN pg_namespace n ON n.oid = src.relnamespace
       WHERE c.contype = 'f' AND n.nspname = 'public'`;
  });

  after(async () => {
    await sql?.end();
  });

  it('read a real schema, so nothing below can pass vacuously', () => {
    assert.ok(live.length > 50, `expected a populated schema, saw ${live.length} tables`);
    assert.ok(fks.length > 0, 'expected foreign keys, saw none');
  });

  it('classifies EVERY live table - a table nobody decided about is a decision deferred', () => {
    const unknown = unclassifiedTables(live);
    assert.deepEqual(
      unknown,
      [],
      `these tables are in neither list in services/api/src/ops/db-roles.ts: ${unknown.join(', ')}. ` +
        'Add each to CORPUS_TABLES or USER_TABLES. They default to user, so nothing is at risk ' +
        'today - but a corpus release will not carry a corpus table nobody classified.',
    );
  });

  it('names no table that does not exist, so the list cannot quietly rot', async (t) => {
    /**
     * A PHANTOM ON AN EMPTY DATABASE IS NOT A PHANTOM.
     *
     * Several classified tables are created OUT OF BAND by the DATA lane and
     * appear in no migration - `new1_tranche_passages` and
     * `new1_doc_vector_stage` among them. On the migrations-only database CI and
     * `pnpm ci:local` build they are genuinely absent, so this assertion
     * convicts the classification list of naming tables that do exist, just not
     * here. The rot it is written to catch is a name that exists NOWHERE, and
     * only a populated database can tell the two apart.
     */
    if (!(await hasCorpus(sql))) return t.skip(CORPUS_SKIP);
    assert.deepEqual(phantomTables(live), []);
  });

  it('NO CORPUS TABLE holds a foreign key into a user table', () => {
    /* The corpus is published law and the machinery that acquired it. It existed
     * before any advocate signed up and must survive every one of them leaving.
     * A corpus row that cannot exist without a user row is a misclassification -
     * and this assertion has already found two. */
    const offenders = fks
      .filter((f) => roleOf(f.child) === 'corpus' && roleOf(f.parent) === 'user')
      .map((f) => `${f.conname}: ${f.child} -> ${f.parent}`);
    assert.deepEqual(offenders, [], offenders.join(' | '));
  });

  it('holds NO cross-role foreign key at all, in either direction', () => {
    /* Migration 0102 replaced the user -> corpus ones with indexed soft
     * references (NEW3 R20, SOFT_CORPUS_REFERENCE). PostgreSQL has no
     * cross-database referential integrity, so a surviving one is a constraint
     * that cannot exist once the roles are two databases - it would fail at
     * restore, not at review. */
    const crossing = fks
      .filter((f) => roleOf(f.child) !== roleOf(f.parent))
      .map((f) => `${f.conname}: ${f.child} -> ${f.parent}`);
    assert.deepEqual(crossing, [], crossing.join(' | '));
  });

  it('leaves every soft corpus reference INDEXED, so nothing got slower', async () => {
    /* Dropping a foreign key never drops an index - PostgreSQL never made one -
     * but the reference is only usable if one was there independently. */
    const softRefs: [string, string][] = [
      ['alerts', 'judgment_id'],
      ['citation_checks', 'judgment_id_matched'],
      ['citation_copies', 'judgment_id'],
      ['citation_disputes', 'judgment_id'],
      ['citation_fanouts', 'judgment_id'],
      ['judgment_annotations', 'judgment_id'],
      ['matter_authorities', 'judgment_id'],
      ['verification_cache', 'judgment_id'],
    ];
    const unindexed: string[] = [];
    let checked = 0;
    for (const [table, column] of softRefs) {
      if (!live.includes(table)) continue;
      checked++;
      const [row] = await sql<{ indexed: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_index i
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
           WHERE t.relname = ${table} AND a.attname = ${column}
        ) AS indexed`;
      if (!row?.indexed) unindexed.push(`${table}.${column}`);
    }
    assert.ok(checked > 0, 'no soft-reference table was present to check');
    assert.deepEqual(unindexed, [], `unindexed soft references: ${unindexed.join(', ')}`);
  });

  it('lists more corpus tables than the release exports, and says so out loud', () => {
    /* Not a defect: `release-export-cli.ts` enumerates the SERVING set, which is
     * deliberately smaller than everything corpus-owned. This asserts the
     * relationship rather than letting the two lists drift into agreement. */
    assert.ok(CORPUS_TABLES.length > 7);
    assert.ok(USER_TABLES.length > 0);
  });
});
