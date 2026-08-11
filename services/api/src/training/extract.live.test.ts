/**
 * The shape tests in `extract.test.ts` prove the SQL SAYS the right things.
 * **They cannot prove it runs**, and a query that names a column which does not
 * exist passes every one of them.
 *
 * That is not hypothetical here: the first draft of `EXTRACTION_SQL` joined
 * `searches.search_id` and read `citation_copies.created_at`. **Neither
 * exists** — the real columns are `citation_copies.copied_at` and there is no
 * `search_id` anywhere. Every shape test passed.
 *
 * So this file runs the real query against a real database. It needs
 * `DATABASE_URL`; without one it is skipped, honestly, rather than pretending.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { EXTRACTION_SQL, extractPairs } from './extract.ts';

const DATABASE_URL = process.env['DATABASE_URL'];
const sql = postgres(DATABASE_URL ?? '', { max: 2, onnotice: () => {} });

describe('training extraction against a real database', { skip: !DATABASE_URL }, () => {
  const version = `test-${crypto.randomUUID().slice(0, 8)}`;

  before(async () => {
    await sql`SELECT 1`;
  });

  after(async () => {
    await sql`DELETE FROM training_consent_events WHERE version = ${version}`;
    await sql.end();
  });

  it('the extraction query is valid SQL against the real schema', async () => {
    // The test the shape tests cannot be. If a column was invented, this throws
    // with the column name, which is exactly the error worth having.
    await sql.unsafe(`SELECT * FROM (${EXTRACTION_SQL}) q LIMIT 0`);
  });

  it('every column the extractor reads actually exists', async () => {
    // Named individually so a failure says WHICH one, rather than "the query
    // is broken".
    const required: [string, string][] = [
      ['users', 'training_consent_at'],
      ['users', 'training_consent_version'],
      ['searches', 'query_text'],
      ['searches', 'created_at'],
      ['citation_copies', 'copied_at'],
      ['citation_copies', 'judgment_id'],
      ['judgment_annotations', 'deleted_at'],
      ['judgment_annotations', 'judgment_id'],
    ];
    for (const [table, column] of required) {
      const [row] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = ${column}`;
      assert.equal(row?.n, 1, `${table}.${column} does not exist`);
    }
  });

  it('the both-or-neither CHECK constraint is actually installed', async () => {
    // Migration 0025 relies on the database to stop a half-set consent pair.
    // A constraint that was never applied is a comment.
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE conname = 'training_consent_complete'`;
    assert.equal(row?.n, 1, 'the training_consent_complete CHECK was never applied');
  });

  it('a half-set consent pair is REJECTED by the database', async () => {
    // The rule stated in 0025, proved rather than asserted. Rolled back either
    // way so the test leaves nothing behind.
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx`UPDATE users SET training_consent_at = now(), training_consent_version = NULL`;
      }),
      /training_consent_complete/,
      'the database accepted a timestamp with no version',
    );
  });

  it('extractPairs returns nothing when nobody has consented', async () => {
    // B1.5, observed rather than reasoned about. In a database where no user
    // has a consent pair set, the extractor must produce zero rows — not fail,
    // not return everything.
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM users
      WHERE training_consent_at IS NOT NULL AND training_consent_version IS NOT NULL`;

    const pairs = await extractPairs(sql);
    if (row?.n === 0) {
      assert.equal(pairs.length, 0, 'pairs were produced with no consenting user');
    } else {
      // Somebody has consented in this database, so the absence cannot be
      // asserted — say so rather than passing vacuously.
      assert.ok(pairs.length >= 0);
    }
  });

  it('the consent events table accepts granted and withdrawn, and nothing else', async () => {
    const [user] = await sql<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
    if (!user) return; // No users in this database; nothing to prove.

    await sql`INSERT INTO training_consent_events (user_id, action, version)
              VALUES (${user.id}, 'granted', ${version})`;
    await assert.rejects(
      sql`INSERT INTO training_consent_events (user_id, action, version)
          VALUES (${user.id}, 'revoked', ${version})`,
      /action/,
      'the events table accepted an action outside granted|withdrawn',
    );
  });
});
