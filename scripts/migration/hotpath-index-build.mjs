#!/usr/bin/env node
/**
 * Build `0052`'s two indexes CONCURRENTLY, out of band, before the migration runs.
 *
 * LCC, 17 Aug 2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT JUST RUN THE MIGRATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `0052` creates a GIN index over a function call and a ~500 MB btree over a
 * normalised `case_title`, both on `judgments` — 7,296,068 rows, 65 GB. It uses
 * plain `CREATE INDEX`, and it has to: a Drizzle migration runs inside a
 * transaction and `CONCURRENTLY` cannot.
 *
 * Plain `CREATE INDEX` takes a `SHARE` lock for the whole build. That blocks
 * every INSERT and UPDATE on `judgments` until it finishes — and the ingest
 * fleet has just been unfrozen onto this database. Holding writes off a 65 GB
 * table for the length of two index builds, immediately after telling NEW2 to
 * resume, would be self-inflicted.
 *
 * `0052`'s own comment anticipates exactly this and names the resolution:
 *
 *   > Both were built CONCURRENTLY out of band against the local cluster first,
 *   > so `IF NOT EXISTS` makes this a no-op there. Any future rebuild against a
 *   > populated database must be done out of band too.
 *
 * This is that step. Afterwards the migration still runs, still records itself in
 * the ledger, and does no work — which is the correct end state, not a shortcut
 * around it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFINITIONS ARE READ FROM THE MIGRATION, NEVER RETYPED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * If the index this builds differs from the index `0052` describes by so much as
 * a cast, then `IF NOT EXISTS` makes the migration a no-op against the WRONG
 * object and `compare.mjs` reports a definition mismatch on some later cutover —
 * or worse, does not, because both sides were built from the same typo. So the
 * statements are extracted from the `.sql` file and the only edit applied is
 * inserting the `CONCURRENTLY` keyword.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONCURRENTLY CAN FAIL, AND IT FAILS DIRTY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A failed `CREATE INDEX CONCURRENTLY` leaves an INVALID index behind. It is not
 * used by the planner but it IS maintained on every write, so a silent one is a
 * pure write-amplification tax nobody would think to look for. This checks
 * `pg_index.indisvalid` afterwards and says so loudly.
 *
 *   node scripts/migration/hotpath-index-build.mjs
 *   node scripts/migration/hotpath-index-build.mjs --check   # report only
 */
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = join(ROOT, 'packages', 'db', 'drizzle', '0052_hot_path_exact_lookup_indexes.sql');
const checkOnly = process.argv.includes('--check');

function localUrl() {
  const env = fs.readFileSync(join(ROOT, '.env'), 'utf8');
  const url = (/^LOCAL_DATABASE_URL=(.+)$/m.exec(env) ?? [])[1]?.trim();
  if (!url) throw new Error('LOCAL_DATABASE_URL missing from .env');
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`refusing a non-loopback host: ${host}`);
  }
  return url;
}

/**
 * Every `CREATE INDEX …;` statement in the migration, comments stripped, with
 * `CONCURRENTLY` inserted. Comment lines are removed FIRST — `0052` discusses
 * `CREATE INDEX` in prose several times, and a naive scan picks up the prose.
 */
function indexStatements() {
  const sqlText = fs
    .readFileSync(MIGRATION, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

  const statements = [...sqlText.matchAll(/CREATE\s+INDEX[\s\S]*?;/gi)].map((m) => m[0]);
  if (statements.length === 0) throw new Error('no CREATE INDEX statements found in 0052');

  return statements.map((stmt) => {
    if (/CONCURRENTLY/i.test(stmt))
      throw new Error('migration already says CONCURRENTLY — it cannot, inside a transaction');
    const concurrent = stmt.replace(/CREATE\s+INDEX/i, 'CREATE INDEX CONCURRENTLY');
    const name = /IF\s+NOT\s+EXISTS\s+"?([A-Za-z0-9_]+)"?/i.exec(stmt)?.[1];
    if (!name) throw new Error(`could not read index name from: ${stmt.slice(0, 80)}`);
    return { name, sql: concurrent };
  });
}

async function report(sql, names) {
  const rows = await sql`
    SELECT c.relname AS name, i.indisvalid AS valid, pg_size_pretty(pg_relation_size(c.oid)) AS size
    FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relname = ANY(${names})
  `;
  const found = new Map(rows.map((r) => [r.name, r]));
  for (const n of names) {
    const r = found.get(n);
    if (!r) console.log(`  ${n.padEnd(40)} ABSENT`);
    else console.log(`  ${n.padEnd(40)} ${r.valid ? 'VALID  ' : 'INVALID'} ${r.size}`);
  }
  return [...found.values()].filter((r) => !r.valid).map((r) => r.name);
}

async function main() {
  const statements = indexStatements();
  const names = statements.map((s) => s.name);
  // No statement_timeout and no lock_timeout: CONCURRENTLY waits for existing
  // transactions by design, and killing it halfway is what leaves the INVALID
  // index this script exists to avoid.
  const sql = postgres(localUrl(), {
    max: 1,
    connect_timeout: 20,
    idle_timeout: 0,
    onnotice: () => {},
  });
  try {
    console.log('before:');
    await report(sql, names);
    if (checkOnly) return;

    for (const { name, sql: text } of statements) {
      const started = Date.now();
      console.log(`\nbuilding ${name} CONCURRENTLY …`);
      await sql.unsafe(text);
      console.log(`  built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    }

    console.log('\nafter:');
    const invalid = await report(sql, names);
    if (invalid.length > 0) {
      console.error(`\nINVALID index left behind: ${invalid.join(', ')}`);
      console.error('It is not used by the planner but IS maintained on every write.');
      console.error('DROP INDEX CONCURRENTLY it and rebuild — do not leave it.');
      process.exit(1);
    }
    console.log(
      '\nall indexes VALID — migration 0052 will now be a no-op through its own IF NOT EXISTS',
    );
  } finally {
    await sql.end({ timeout: 10 });
  }
}

await main();
