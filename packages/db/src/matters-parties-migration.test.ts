/**
 * Migration 0101 — `matters.parties` string scalars become objects, and the rows
 * that cannot be converted STOP the migration instead of being repaired.
 *
 * NEW3 bus 1706. The writer bug (`JSON.stringify(...)::jsonb`) is fixed in
 * `services/api/src/matters/route.ts`; this proves the other half, which is the
 * half that decides whether RCC ever needs a defensive `JSON.parse`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT RUNS THE SHIPPED FILE, NOT A COPY OF IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The SQL under test is read from `drizzle/0101_*.sql` and executed verbatim. A
 * test that re-types the conversion asserts that the test's SQL is correct and
 * says nothing about the migration every database will actually run — and this
 * migration's whole value is in a refusal, which is exactly the sort of clause a
 * transcription quietly loosens.
 *
 * Every case runs inside a transaction that is rolled back, so the real
 * `matters` rows on this database are read but never written. `matters` is USER
 * data; no canonical legal-data table is touched here at all.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { TransactionSql } from 'postgres';
import postgres from 'postgres';

import { databaseUrl } from './env.ts';

const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} });

const MIGRATION = readFileSync(
  fileURLToPath(new URL('../drizzle/0101_matters_parties_jsonb_object.sql', import.meta.url)),
  'utf8',
);

const rollback = new Error('rollback');

async function inRolledBackTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  let result!: T;
  await sql
    .begin(async (tx) => {
      result = await fn(tx);
      throw rollback;
    })
    .catch((error: unknown) => {
      if (error !== rollback) throw error;
    });
  return result;
}

/** The FK parent a matter needs. 0098's trigger gives it its personal workspace. */
async function seedAdvocate(tx: TransactionSql): Promise<string> {
  const tag = `parties-migration-${crypto.randomUUID()}`;
  const [user] = await tx<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email)
    VALUES (${tag}, 'Test Advocate', '+910000000000', ${`${tag}@example.invalid`})
    RETURNING id
  `;
  assert.ok(user, 'seed user was not inserted');
  return user.id;
}

/**
 * Inserts one matter whose `parties` is EXACTLY the supplied jsonb text.
 * A literal cast is the only way to plant a shape the fixed writer can no
 * longer produce — which is the entire population this migration exists for.
 */
async function seedMatter(tx: TransactionSql, userId: string, partiesLiteral: string) {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                         our_side, status, source)
    VALUES (${userId}, 'Fixture v. State', 'Delhi High Court', 'criminal',
            ${partiesLiteral}::text::jsonb,
            'Fixture Client', 'accused', 'active', 'manual')
    RETURNING id
  `;
  assert.ok(row, 'seed matter was not inserted');
  return row.id;
}

async function shapeOf(tx: TransactionSql, id: string) {
  const [row] = await tx<{ t: string; v: string }[]>`
    SELECT jsonb_typeof(parties) AS t, parties::text AS v FROM matters WHERE id = ${id}::uuid
  `;
  assert.ok(row, 'matter disappeared');
  return row;
}

/** What the broken writer produced: an object, JSON-encoded, stored as a scalar. */
const STRING_SCALAR = JSON.stringify(
  JSON.stringify({ description: 'Ramesh Kumar v. State of NCT of Delhi' }),
);

describe('migration 0101 — matters.parties', () => {
  it('converts a writer-generated string scalar to the object it encodes', async () => {
    await inRolledBackTx(async (tx) => {
      const user = await seedAdvocate(tx);
      const id = await seedMatter(tx, user, STRING_SCALAR);

      assert.equal((await shapeOf(tx, id)).t, 'string', 'fixture must start broken');
      await tx.unsafe(MIGRATION);

      const converted = await shapeOf(tx, id);
      assert.equal(converted.t, 'object');
      assert.deepEqual(JSON.parse(converted.v), {
        description: 'Ramesh Kumar v. State of NCT of Delhi',
      });
    });
  });

  it('preserves the exact contents — no key added, renamed or defaulted', async () => {
    const original = {
      description: "Ramesh v. State — ¶12 'held'",
      petitioner: 'Ramesh Kumar',
      respondent: 'State of NCT of Delhi',
      hindi: 'रमेश कुमार',
      nested: { bench: ['A', 'B'], count: 2, absent: null },
    };
    await inRolledBackTx(async (tx) => {
      const user = await seedAdvocate(tx);
      const id = await seedMatter(tx, user, JSON.stringify(JSON.stringify(original)));
      await tx.unsafe(MIGRATION);
      const converted = await shapeOf(tx, id);
      assert.equal(converted.t, 'object');
      assert.deepEqual(JSON.parse(converted.v), original);
    });
  });

  it('leaves an already-correct object row byte-identical', async () => {
    await inRolledBackTx(async (tx) => {
      const user = await seedAdvocate(tx);
      const id = await seedMatter(tx, user, '{"petitioner": "State", "respondent": "Kumar"}');
      const before = await shapeOf(tx, id);
      await tx.unsafe(MIGRATION);
      const unchanged = await shapeOf(tx, id);
      assert.equal(unchanged.t, 'object');
      assert.equal(unchanged.v, before.v, 'an object row must not be rewritten at all');
    });
  });

  it('is a no-op on a second run', async () => {
    await inRolledBackTx(async (tx) => {
      const user = await seedAdvocate(tx);
      const id = await seedMatter(tx, user, STRING_SCALAR);
      await tx.unsafe(MIGRATION);
      const once = await shapeOf(tx, id);
      await tx.unsafe(MIGRATION);
      const twice = await shapeOf(tx, id);
      assert.equal(twice.v, once.v, 're-running must change nothing');
    });
  });

  /**
   * A fresh install has an empty `matters`, and the migration must complete
   * rather than raise on a table with nothing in it.
   *
   * Proved against a TEMP table that shadows the real one — `pg_temp` precedes
   * `public` in the search path, so the migration's unqualified `matters`
   * resolves to the empty shadow. Emptying the real table instead would mean
   * deleting the rows of every table that references it, which is a fixture
   * this test does not need and a blast radius it should not have.
   */
  it('fresh install: an empty matters table completes silently', async () => {
    await inRolledBackTx(async (tx) => {
      await tx`CREATE TEMP TABLE matters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                          parties jsonb NOT NULL) ON COMMIT DROP`;
      const [shadowed] = await tx<{ ns: string }[]>`
        SELECT n.nspname AS ns FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.oid = 'matters'::regclass
      `;
      assert.match(shadowed!.ns, /^pg_temp/, 'the temp table must be the one the migration sees');

      await tx.unsafe(MIGRATION);

      const [row] = await tx<{ n: string }[]>`SELECT count(*)::text n FROM matters`;
      assert.equal(row?.n, '0');
    });
  });

  /**
   * The refusal. Each of these is a row we do not understand, and the three
   * "helpful" repairs are all worse than stopping: dropping deletes the
   * advocate's case identity, `{}` reads as an empty case, and inventing a
   * `description` invents party names into a legal matter.
   */
  const UNCONVERTIBLE: [string, string][] = [
    ['not JSON at all', JSON.stringify('Ramesh Kumar v. State')],
    ['a JSON array, not an object', JSON.stringify('["Ramesh","State"]')],
    ['a JSON number', JSON.stringify('42')],
    ['the JSON literal null', JSON.stringify('null')],
    ['truncated JSON', JSON.stringify('{"description": "Ramesh')],
  ];

  for (const [why, literal] of UNCONVERTIBLE) {
    it(`fails closed and names the row: ${why}`, async () => {
      await inRolledBackTx(async (tx) => {
        const user = await seedAdvocate(tx);
        const id = await seedMatter(tx, user, literal!);

        await assert.rejects(
          () => tx.unsafe(MIGRATION),
          (err: unknown) => {
            const message = String((err as { message?: string }).message ?? err);
            assert.match(message, /cannot be converted deterministically/);
            assert.ok(message.includes(id), `the migration must NAME the row: ${message}`);
            return true;
          },
          'an unconvertible row must abort the migration, not be repaired around',
        );
      });
    });
  }

  it('does not repair the good rows around a bad one — all or nothing', async () => {
    await inRolledBackTx(async (tx) => {
      const user = await seedAdvocate(tx);
      const good = await seedMatter(tx, user, STRING_SCALAR);
      await seedMatter(tx, user, JSON.stringify('Ramesh Kumar v. State'));

      await tx.unsafe(MIGRATION).catch(() => undefined);
      // The RAISE aborted the transaction, so the convertible row was NOT
      // converted. A half-migrated column is the state this must never leave.
      const state = await shapeOf(tx, good).then(
        (r) => r.t,
        () => 'aborted',
      );
      assert.equal(
        state,
        'aborted',
        'the failed migration must abort its transaction, leaving nothing half-done',
      );
    });
  });

  it('other JSON types are reported, never silently rewritten', async () => {
    // A top-level array/number/boolean is not a string scalar, so the filter
    // does not select it and the migration leaves it exactly as found.
    for (const literal of ['[1,2,3]', '42', 'true', 'null']) {
      await inRolledBackTx(async (tx) => {
        const user = await seedAdvocate(tx);
        const id = await seedMatter(tx, user, literal);
        const before = await shapeOf(tx, id);
        await tx.unsafe(MIGRATION);
        const unchanged = await shapeOf(tx, id);
        assert.equal(unchanged.v, before.v, `${literal} must be left alone`);
        assert.notEqual(unchanged.t, 'object', `${literal} must not be rewritten into an object`);
      });
    }
  });

  it('NULL cannot reach the filter — and the column refuses one anyway', async () => {
    await inRolledBackTx(async (tx) => {
      const [row] = await tx<{ nullable: string }[]>`
        SELECT is_nullable AS nullable FROM information_schema.columns
        WHERE table_name = 'matters' AND column_name = 'parties'
      `;
      assert.equal(row?.nullable, 'NO', 'matters.parties is NOT NULL');
      // jsonb_typeof(NULL) is SQL NULL, so `= 'string'` is UNKNOWN and the row
      // is not selected. The filter would be NULL-safe even without the
      // constraint, which is what makes relaxing it later non-breaking.
      const [t] = await tx<{ selected: boolean }[]>`
        SELECT coalesce(jsonb_typeof(NULL::jsonb) = 'string', false) AS selected
      `;
      assert.equal(t?.selected, false);
    });
  });

  after(async () => {
    await sql.end();
  });
});
