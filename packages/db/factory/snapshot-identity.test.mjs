#!/usr/bin/env node
/**
 * REPRO_DEBT_1 — the tests that make "snapshot A cannot be stamped as B" a fact
 * rather than a design intention.
 *
 *   node --test packages/db/factory/snapshot-identity.test.mjs
 *
 * Every case runs against a DISPOSABLE database created and dropped by this
 * file. That is deliberate and it is also the fresh-install proof: if these pass
 * on an empty database, a fresh clone reproduces the schema from HEAD, which is
 * the half of REPRO_DEBT_1 that a live-box check cannot establish.
 *
 * The live factory database is never touched. The connection string is derived
 * from `DATABASE_URL` by swapping the database name, and the test refuses to run
 * if the resulting name is not the probe name.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const ROOT = new URL('../../../', import.meta.url);
const HERE = new URL('./', import.meta.url);
const PROBE_DB = 'lawmind_factory_snapshot_probe';

function baseUrl() {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  return readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
}

function probeUrl() {
  const u = new URL(baseUrl());
  u.pathname = `/${PROBE_DB}`;
  if (u.pathname !== `/${PROBE_DB}`) throw new Error('refusing to run against anything but the probe database');
  return u.toString();
}

const ADMIN = (() => {
  const u = new URL(baseUrl());
  u.pathname = '/postgres';
  return u.toString();
})();

/** A vector literal the stage will accept — 1024 dimensions, unit-ish. */
const VEC = `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;

let sql;

/** Rows enough to satisfy the NOT NULLs; the vector is the only fiddly part. */
async function insertStaged(t, id, snapshotHash) {
  if (snapshotHash === undefined) {
    return t.unsafe(
      `INSERT INTO new1_doc_vector_stage (judgment_id, recipe, model, embedding)
       VALUES ($1, 'HEAD:4800', 'probe', $2::vector)`,
      [id, VEC],
    );
  }
  return t.unsafe(
    `INSERT INTO new1_doc_vector_stage (judgment_id, recipe, model, embedding, snapshot_hash)
     VALUES ($1, 'HEAD:4800', 'probe', $2::vector, $3)`,
    [id, VEC, snapshotHash],
  );
}

const GEN_A = { snapshotHash: 'aaaa0000aaaa0000', generation: 'probe-A', definitionVersion: 'v-A', modelIdentity: 'probe', recipe: 'HEAD:4800', dimensions: 1024, metric: 'cosine' };
const GEN_B = { snapshotHash: 'bbbb1111bbbb1111', generation: 'probe-B', definitionVersion: 'v-B', modelIdentity: 'probe', recipe: 'HEAD:4800', dimensions: 1024, metric: 'cosine' };

function writeGeneration(name, g) {
  const path = fileURLToPath(new URL(`.probe-${name}.json`, HERE));
  execFileSync(process.execPath, ['-e', `require('fs').writeFileSync(process.argv[1], process.argv[2])`, path, JSON.stringify(g)]);
  return path;
}

function applyCli(args, env) {
  return execFileSync(process.execPath, [fileURLToPath(new URL('apply.mjs', HERE)), ...args], {
    env: { ...process.env, DATABASE_URL: probeUrl(), ...env },
    encoding: 'utf8',
  });
}

before(async () => {
  const admin = postgres(ADMIN, { ssl: false, max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${PROBE_DB}`);
  await admin.end();

  sql = postgres(probeUrl(), { ssl: false, max: 1, onnotice: () => {} });
  await sql.unsafe('CREATE EXTENSION IF NOT EXISTS vector');
});

after(async () => {
  if (sql) await sql.end({ timeout: 5 });
  const admin = postgres(ADMIN, { ssl: false, max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
  await admin.end();
});

test('FRESH_INSTALL: an empty database reaches the full schema from the committed files alone', async () => {
  const genA = writeGeneration('A', GEN_A);
  applyCli(['apply', '--bootstrap-active', genA]);

  const [{ n: tables }] = await sql`
    SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('embedding_snapshot','embedding_snapshot_policy','new1_doc_vector_stage','new1_doc_vector_stage_refused')`;
  assert.equal(tables, 4, 'all four tables exist after a fresh apply');

  const [col] = await sql`
    SELECT column_default FROM information_schema.columns
     WHERE table_name = 'new1_doc_vector_stage' AND column_name = 'snapshot_hash'`;
  assert.equal(col.column_default, null, 'no constant DEFAULT survives a fresh install');

  const [policy] = await sql`SELECT require_explicit_writer_identity AS strict FROM embedding_snapshot_policy WHERE id`;
  assert.equal(policy.strict, true, 'a fresh install is strict from the first write');
});

test('MIGRATION_NOOP_SECOND_RUN: applying twice changes nothing', async () => {
  const out = JSON.parse(applyCli(['apply']));
  assert.deepEqual(
    out.results.map((r) => r.action),
    out.results.map(() => 'NOOP_ALREADY_APPLIED'),
  );
});

test('A cannot be written while nothing is ACTIVE, and the error says so', async () => {
  await sql`UPDATE embedding_snapshot SET state = 'SEALED', sealed_at = now() WHERE snapshot_hash = ${GEN_A.snapshotHash}`;
  await assert.rejects(
    () => insertStaged(sql, '00000000-0000-4000-8000-000000000001', undefined),
    /no snapshot identity supplied/i,
  );
  await sql`UPDATE embedding_snapshot SET state = 'ACTIVE', sealed_at = NULL WHERE snapshot_hash = ${GEN_A.snapshotHash}`
    .catch(() => {});
  // A sealed generation may not be reactivated — re-register the probe instead.
  const [{ state }] = await sql`SELECT state FROM embedding_snapshot WHERE snapshot_hash = ${GEN_A.snapshotHash}`;
  assert.equal(state, 'SEALED', 'the registry refuses SEALED -> ACTIVE');
});

test('SNAPSHOT_A_WRITES_AS_A', async () => {
  // A fresh ACTIVE generation, because the first probe generation is now sealed.
  const genA2 = { ...GEN_A, snapshotHash: 'a2a2a2a2a2a2a2a2', generation: 'probe-A2' };
  applyCli(['register', '--file', writeGeneration('A2', genA2), '--activate']);

  await insertStaged(sql, '00000000-0000-4000-8000-00000000000a', genA2.snapshotHash);
  const [row] = await sql`SELECT snapshot_hash FROM new1_doc_vector_stage WHERE judgment_id = '00000000-0000-4000-8000-00000000000a'`;
  assert.equal(row.snapshot_hash, genA2.snapshotHash);

  // And a writer that omits it gets the ACTIVE generation, never a schema constant.
  await sql`UPDATE embedding_snapshot_policy SET require_explicit_writer_identity = false WHERE id`;
  await insertStaged(sql, '00000000-0000-4000-8000-00000000000b', undefined);
  const [resolved] = await sql`SELECT snapshot_hash FROM new1_doc_vector_stage WHERE judgment_id = '00000000-0000-4000-8000-00000000000b'`;
  assert.equal(resolved.snapshot_hash, genA2.snapshotHash);
  await sql`UPDATE embedding_snapshot_policy SET require_explicit_writer_identity = true WHERE id`;
});

test('SNAPSHOT_B_WRITES_AS_B, and A_NOT_B: a stale writer is refused, never mixed in', async () => {
  applyCli(['seal', '--snapshot-hash', 'a2a2a2a2a2a2a2a2', '--activate-next', writeGeneration('B', GEN_B)]);

  await insertStaged(sql, '00000000-0000-4000-8000-0000000000b1', GEN_B.snapshotHash);
  const [row] = await sql`SELECT snapshot_hash FROM new1_doc_vector_stage WHERE judgment_id = '00000000-0000-4000-8000-0000000000b1'`;
  assert.equal(row.snapshot_hash, GEN_B.snapshotHash, 'B writes as B');

  // THE CASE THE CONSTANT DEFAULT COULD NOT CATCH: a writer still carrying A's
  // hash after the generation moved. Under the old schema this silently produced
  // one population wearing two names.
  await assert.rejects(
    () => insertStaged(sql, '00000000-0000-4000-8000-0000000000b2', 'a2a2a2a2a2a2a2a2'),
    /refusing to add rows to a generation that is not the active one/i,
  );

  // And the rows A already wrote are still A's.
  const [a] = await sql`SELECT snapshot_hash FROM new1_doc_vector_stage WHERE judgment_id = '00000000-0000-4000-8000-00000000000a'`;
  assert.equal(a.snapshot_hash, 'a2a2a2a2a2a2a2a2', 'sealing B did not relabel A');
});

test('an UNKNOWN identity cannot be written', async () => {
  await assert.rejects(
    () => insertStaged(sql, '00000000-0000-4000-8000-0000000000c1', 'deadbeefdeadbeef'),
    /unknown snapshot identity/i,
  );
});

test('an existing row can never be relabelled', async () => {
  await assert.rejects(
    () => sql`UPDATE new1_doc_vector_stage SET snapshot_hash = ${GEN_B.snapshotHash} WHERE judgment_id = '00000000-0000-4000-8000-00000000000a'`,
    /refusing to relabel/i,
  );
});

test('a registered generation is immutable and cannot be deleted', async () => {
  await assert.rejects(
    () => sql`UPDATE embedding_snapshot SET model_identity = 'something else' WHERE snapshot_hash = ${GEN_B.snapshotHash}`,
    /is immutable/i,
  );
  await assert.rejects(
    () => sql`DELETE FROM embedding_snapshot WHERE snapshot_hash = ${GEN_B.snapshotHash}`,
    /append-only/i,
  );
});

test('the HNSW population predicate is derivable from a named identity, and refuses an unnamed one', async () => {
  const [{ predicate }] = await sql`SELECT snapshot_index_predicate(${GEN_B.snapshotHash}) AS predicate`;
  assert.equal(predicate, `snapshot_hash = '${GEN_B.snapshotHash}'`);

  const [{ legacy }] = await sql`SELECT snapshot_index_predicate('UNIDENTIFIED_LEGACY_V1') AS legacy`;
  assert.equal(legacy, 'snapshot_hash IS NULL', 'the legacy class is named, and its predicate is exact');

  await assert.rejects(() => sql`SELECT snapshot_index_predicate('not-a-generation')`, /unknown snapshot identity/i);
});

test('two ACTIVE generations cannot exist at once', async () => {
  await assert.rejects(
    () => sql`
      INSERT INTO embedding_snapshot (snapshot_hash, generation, definition_version, model_identity, recipe, dimensions, metric, state)
      VALUES ('cccc2222cccc2222', 'probe-C', 'v-C', 'probe', 'HEAD:4800', 1024, 'cosine', 'ACTIVE')`,
    /embedding_snapshot_one_active/i,
  );
});
