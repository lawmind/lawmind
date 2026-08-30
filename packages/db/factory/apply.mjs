#!/usr/bin/env node
/**
 * THE FACTORY SCHEMA APPLIER — forward-only, idempotent, journalled.
 *
 *   node packages/db/factory/apply.mjs status
 *   node packages/db/factory/apply.mjs apply  [--bootstrap-active <json>] [--policy strict|lenient --reason "..."]
 *   node packages/db/factory/apply.mjs register --file <json> [--activate]
 *   node packages/db/factory/apply.mjs seal    --snapshot-hash <h> [--activate-next <json>]
 *   node packages/db/factory/apply.mjs policy  --strict|--lenient --reason "..."
 *   node packages/db/factory/apply.mjs predicate --snapshot-hash <h>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND MIGRATOR EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `packages/db/drizzle` is the PRODUCT schema. It is applied to the remote
 * serving plane, and roadmap v7.1 §7 excludes dense vectors from that plane —
 * `vectorExportRefusal()` refuses to export the vector stage by name. So the
 * factory's own tables must be reproducible from HEAD *without* being pushed to
 * production. That is this file, and its journal is separate from Drizzle's.
 *
 * Forward-only in the same sense as the product migrator: a file that has been
 * applied may never change. The journal stores the sha256, and a changed file
 * is refused rather than silently re-run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SCHEMA AND ITS FIRST GENERATION LAND IN ONE TRANSACTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `0001` drops the constant DEFAULT and installs a trigger that refuses any
 * write it cannot bind to a registered ACTIVE generation. On a live box with a
 * GPU writer inserting continuously, committing the schema without the ACTIVE
 * row would stop the walk within seconds. So `--bootstrap-active` is applied
 * inside the SAME transaction: schema and identity land together or not at all.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const HERE = new URL('./', import.meta.url);
const ROOT = new URL('../../../', import.meta.url);

/** Hosts that are this machine. Same set as `services/harness/src/db-url.ts`. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function databaseUrl() {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  const env = readFileSync(new URL('.env', ROOT), 'utf8');
  const line = env.match(/^DATABASE_URL=(.*)$/m);
  if (!line) throw new Error('DATABASE_URL is not set and .env has no DATABASE_URL line');
  return line[1].trim();
}

function sslFor(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) ? false : 'require';
  } catch {
    // Fails CLOSED: an unparseable URL is treated as remote.
    return 'require';
  }
}

/** Every `NNNN_*.sql` in this directory, in lexical order, with its sha256. */
function schemaFiles() {
  return readdirSync(fileURLToPath(HERE))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((name) => {
      const body = readFileSync(new URL(name, HERE), 'utf8');
      return { name, body, sha256: createHash('sha256').update(body).digest('hex') };
    });
}

const JOURNAL = `
  CREATE TABLE IF NOT EXISTS factory_schema_journal (
    name       text PRIMARY KEY,
    sha256     text        NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}
const has = (flag) => process.argv.includes(flag);

/**
 * A generation is described by a JSON file, never by a pile of flags — the
 * description is evidence and belongs under version control next to the
 * manifest it came from.
 */
function readGeneration(path) {
  const g = JSON.parse(readFileSync(path, 'utf8'));
  for (const k of ['snapshotHash', 'generation', 'definitionVersion', 'modelIdentity', 'recipe', 'dimensions', 'metric']) {
    if (g[k] === undefined || g[k] === null || g[k] === '') {
      throw new Error(`generation file ${path} is missing required field ${k}`);
    }
  }
  return g;
}

async function registerActive(t, g, { activate }) {
  await t`
    INSERT INTO embedding_snapshot
      (snapshot_hash, generation, definition_version, manifest_sha256, model_identity,
       recipe, dimensions, metric, state, represents_sql_null, note, sealed_at)
    VALUES (${g.snapshotHash}, ${g.generation}, ${g.definitionVersion}, ${g.manifestSha256 ?? null},
            ${g.modelIdentity}, ${g.recipe}, ${g.dimensions}, ${g.metric},
            ${activate ? 'ACTIVE' : 'SEALED'}, false, ${g.note ?? null},
            ${activate ? null : new Date()})
    ON CONFLICT (snapshot_hash) DO NOTHING`;
}

async function main() {
  const cmd = process.argv[2] ?? 'status';
  const url = databaseUrl();
  const sql = postgres(url, {
    ssl: sslFor(url),
    max: 1,
    onnotice: () => {},
    connection: { statement_timeout: 0 },
  });

  try {
    await sql.unsafe(JOURNAL);

    if (cmd === 'status') {
      const applied = await sql`SELECT name, sha256, applied_at FROM factory_schema_journal ORDER BY name`;
      const files = schemaFiles();
      const rows = files.map((f) => {
        const a = applied.find((r) => r.name === f.name);
        return {
          name: f.name,
          state: !a ? 'UNAPPLIED' : a.sha256 === f.sha256 ? 'APPLIED' : 'CHANGED_AFTER_APPLY',
          sha256: f.sha256.slice(0, 16),
          appliedAt: a?.applied_at ?? null,
        };
      });
      const orphans = applied.filter((a) => !files.some((f) => f.name === a.name)).map((a) => a.name);
      const snapshots = await sql`
        SELECT snapshot_hash, generation, state, represents_sql_null, manifest_sha256
          FROM embedding_snapshot ORDER BY state, snapshot_hash`.catch(() => []);
      const [policy] = await sql`
        SELECT require_explicit_writer_identity, note, updated_at
          FROM embedding_snapshot_policy WHERE id`.catch(() => [undefined]);
      console.log(JSON.stringify({ kind: 'factory_schema_status', files: rows, appliedOrphans: orphans, snapshots, policy }, null, 2));
      return;
    }

    if (cmd === 'apply') {
      const bootstrapPath = arg('--bootstrap-active');
      const bootstrap = bootstrapPath ? readGeneration(bootstrapPath) : null;
      const policy = arg('--policy');
      const reason = arg('--reason');
      if (policy && !['strict', 'lenient'].includes(policy)) throw new Error('--policy must be strict or lenient');
      if (policy === 'lenient' && !reason) throw new Error('--policy lenient requires --reason: a loosened guard with no recorded reason is how it becomes permanent');

      const files = schemaFiles();
      const applied = await sql`SELECT name, sha256 FROM factory_schema_journal`;
      const results = [];

      for (const f of files) {
        const prior = applied.find((r) => r.name === f.name);
        if (prior && prior.sha256 === f.sha256) {
          results.push({ name: f.name, action: 'NOOP_ALREADY_APPLIED' });
          continue;
        }
        if (prior && prior.sha256 !== f.sha256) {
          throw new Error(
            `${f.name} was applied at sha ${prior.sha256.slice(0, 16)} and now hashes ${f.sha256.slice(0, 16)}. ` +
              'Factory schema is forward-only: write a new NNNN file rather than editing an applied one.',
          );
        }
        await sql.begin(async (t) => {
          // A catalogue-only ALTER still needs ACCESS EXCLUSIVE. Under a live
          // writer, wait a bounded time and fail loudly rather than queue behind
          // a 20-minute batch holding every subsequent insert.
          await t.unsafe(`SET LOCAL lock_timeout = '15s'`);
          await t.unsafe(f.body);
          if (bootstrap) await registerActive(t, bootstrap, { activate: true });
          if (policy) {
            await t`
              UPDATE embedding_snapshot_policy
                 SET require_explicit_writer_identity = ${policy === 'strict'},
                     note = ${reason ?? null},
                     updated_at = now()
               WHERE id`;
          }
          await t`INSERT INTO factory_schema_journal (name, sha256) VALUES (${f.name}, ${f.sha256})`;
        });
        results.push({ name: f.name, action: 'APPLIED', bootstrapped: Boolean(bootstrap), policy: policy ?? 'file default' });
      }
      console.log(JSON.stringify({ kind: 'factory_schema_apply', results }, null, 2));
      return;
    }

    if (cmd === 'register') {
      const g = readGeneration(arg('--file'));
      await sql.begin(async (t) => registerActive(t, g, { activate: has('--activate') }));
      console.log(JSON.stringify({ kind: 'factory_snapshot_register', snapshotHash: g.snapshotHash, activated: has('--activate') }, null, 2));
      return;
    }

    if (cmd === 'seal') {
      const target = arg('--snapshot-hash');
      const nextPath = arg('--activate-next');
      const next = nextPath ? readGeneration(nextPath) : null;
      // Seal and activate in ONE transaction. Between them there is no instant
      // at which zero generations are ACTIVE, so the walk never sees a window
      // in which every write is refused.
      await sql.begin(async (t) => {
        await t`UPDATE embedding_snapshot SET state = 'SEALED', sealed_at = now() WHERE snapshot_hash = ${target} AND state = 'ACTIVE'`;
        if (next) await registerActive(t, next, { activate: true });
      });
      console.log(JSON.stringify({ kind: 'factory_snapshot_seal', sealed: target, activated: next?.snapshotHash ?? null }, null, 2));
      return;
    }

    if (cmd === 'policy') {
      const reason = arg('--reason');
      if (!reason) throw new Error('--reason is required');
      const strict = has('--strict');
      if (strict === has('--lenient')) throw new Error('pass exactly one of --strict or --lenient');
      await sql`
        UPDATE embedding_snapshot_policy
           SET require_explicit_writer_identity = ${strict}, note = ${reason}, updated_at = now()
         WHERE id`;
      console.log(JSON.stringify({ kind: 'factory_snapshot_policy', requireExplicitWriterIdentity: strict, reason }, null, 2));
      return;
    }

    if (cmd === 'predicate') {
      const [row] = await sql`SELECT snapshot_index_predicate(${arg('--snapshot-hash')}) AS predicate`;
      console.log(row.predicate);
      return;
    }

    throw new Error(`unknown command ${cmd}`);
  } finally {
    await sql.end({ timeout: 10 });
  }
}

await main();
