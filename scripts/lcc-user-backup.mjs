#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OTHER HALF OF THE SEPARATION: BACK UP WHAT THE CORPUS CANNOT REBUILD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `lcc-moat-backup.mjs` backs up the curated CORPUS data whose test is "could we
 * rebuild this from the sources we are authorised to use". Everything it omits,
 * it omits because the answer is yes.
 *
 * For an advocate's matters the answer is NO, and nothing backed them up. LCC
 * R24 recorded the gap by name — `USER_DB_RESTORE_DRYRUN = NOT_AVAILABLE`, "no
 * script writes `users`, `matters`, `matter_authorities`, `documents`,
 * `judgment_annotations`" — and Gate C's separation property has two halves of
 * which only the corpus half was built. This is the other half.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A BACKUP THAT HAS NEVER BEEN RESTORED IS A HYPOTHESIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * So the default run does the whole loop, exactly as the moat backup does:
 *
 *     DUMP -> create a PRISTINE disposable database -> RESTORE -> verify per
 *     table row counts and the tenant-ownership invariants -> drop it
 *
 * and refuses to call a dump alone viable.
 *
 * **The restore target is always a NEW database, never the source.** Restoring
 * over the source would make the rehearsal itself the disaster it rehearses for,
 * and `--force` is not offered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `pg_dump -Fc` AND NOT A COPY OF THE WHOLE DATABASE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Custom format, because it is the only one `pg_restore` can load selectively,
 * in parallel, and into a database whose name differs from the source's. Plain
 * SQL cannot do the first two and a physical copy cannot do the third.
 *
 * The table list is ENUMERATED from `services/api/src/ops/db-roles.ts` rather
 * than derived from a pattern, for the same reason `release-export-cli.ts`
 * enumerates the corpus set: a pattern silently acquires whatever is added next,
 * and the direction it fails in is "this dump quietly contains 328 GB of corpus".
 * `pg-dump -t` also carries a trap this repository has already recorded — it
 * omits the ENUM TYPES the tables depend on — so the schema is dumped with
 * `--schema-only` over the whole database first, and the data restricted after.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flag('out') ?? './user-backup-pack');
const BIN = flag('pgbin') ?? process.env['LAWMIND_PGBIN'] ?? 'C:/lawmind/pgsql/pgsql/bin';
const DO_RESTORE = !args.includes('--no-restore');
const KEEP = args.includes('--keep-restored');

/**
 * The USER role, never an ambiguous `DATABASE_URL` when a split is configured.
 *
 * §19 of the round brief: no command may choose a database solely from
 * `DATABASE_URL` when split mode is enabled. In single mode the two are the same
 * database by definition and the fallback is correct rather than sloppy.
 */
const SPLIT = process.env['DB_SPLIT_MODE'];
const url = process.env['USER_DATABASE_URL'] ?? (SPLIT === 'split' ? undefined : process.env['DATABASE_URL']);
if (!url) {
  console.error(
    SPLIT === 'split'
      ? 'DB_SPLIT_MODE=split but USER_DATABASE_URL is not set. Refusing to guess which database ' +
          'holds user and matter data.'
      : 'Neither USER_DATABASE_URL nor DATABASE_URL is set.',
  );
  process.exit(2);
}

const parsed = new URL(url);
const DB = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const SCRATCH = `lawmind_user_restore_${stamp}`;
const env = { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) };
const conn = ['-h', parsed.hostname, '-p', parsed.port || '5432', '-U', decodeURIComponent(parsed.username)];

function pg(tool, toolArgs, opts = {}) {
  return execFileSync(join(BIN, tool), toolArgs, {
    env,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    ...opts,
  });
}
const q = (db, sql) => pg('psql', [...conn, '-d', db, '-tAc', sql]).trim();

function sha256File(path) {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('end', () => res(h.digest('hex')))
      .on('error', rej);
  });
}

/**
 * The USER role's tables, read from the ONE map rather than restated.
 *
 * Imported from the TypeScript source through a tiny parse rather than through
 * `tsx`, so this script keeps working as plain node. The alternative — a second
 * copy of the list in this file — is exactly the drift `db-roles.ts` exists to
 * prevent, and a copy that fell behind would produce a backup missing a table
 * nobody noticed until a restore.
 */
function userTablesFromRoleMap() {
  const src = readFileSync(
    new URL('../services/api/src/ops/db-roles.ts', import.meta.url),
    'utf8',
  );
  const block = src.split('export const USER_TABLES: readonly string[] = [')[1];
  if (!block) throw new Error('USER_TABLES not found in services/api/src/ops/db-roles.ts');
  const list = block.split('];')[0];
  const tables = [...list.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  if (tables.length === 0) throw new Error('USER_TABLES parsed empty');
  return tables;
}

const WANTED = userTablesFromRoleMap();

// ── 1. ROLE SAFETY ─────────────────────────────────────────────────────────
//
// §19: a user backup verifies it is pointed at a USER role. In split mode that
// is checkable and is checked: a database holding a populated `judgments` is the
// corpus, and dumping it here would produce a 328 GB "user backup".
const live = q(DB, `SELECT string_agg(tablename, ',') FROM pg_tables WHERE schemaname='public'`)
  .split(',')
  .filter(Boolean);
const present = WANTED.filter((t) => live.includes(t));
const missing = WANTED.filter((t) => !live.includes(t));

if (SPLIT === 'split') {
  const corpusRows = live.includes('judgments') ? Number(q(DB, 'SELECT count(*) FROM judgments')) : 0;
  if (corpusRows > 0) {
    console.error(
      `REFUSING: DB_SPLIT_MODE=split and USER_DATABASE_URL points at "${DB}", which holds ` +
        `${corpusRows} rows in judgments. That is the CORPUS role. A user backup here would ` +
        'dump the corpus and would not be a user backup.',
    );
    process.exit(2);
  }
}

console.log(`user backup — database "${DB}"`);
console.log(`  role map: ${WANTED.length} user tables, ${present.length} present, ${missing.length} absent`);
if (missing.length > 0) console.log(`  absent (not an error; not every table exists yet): ${missing.join(', ')}`);

// ── 2. DUMP ────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const schemaPath = join(OUT, 'user-schema.dump');
const dataPath = join(OUT, 'user-data.dump');
const started = Date.now();

/**
 * SCHEMA FIRST, WHOLE-DATABASE, AND THAT IS NOT AN OVERSIGHT.
 *
 * `pg_dump -t <table>` omits the ENUM TYPES those tables depend on — recorded in
 * this repository already, and the failure is narrow enough to miss: only the
 * enum-bearing tables fail to restore, so a dump-only check reports success.
 * Dumping the schema without `-t` carries every type, function and extension the
 * user tables need; the DATA is where the restriction belongs.
 */
console.log('  dumping schema (whole database, --schema-only) ...');
pg('pg_dump', [...conn, '-d', DB, '--schema-only', '--format=custom', '--file', schemaPath], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

console.log(`  dumping data for ${present.length} user tables ...`);
pg('pg_dump', [
  ...conn, '-d', DB, '--data-only', '--format=custom', '--file', dataPath,
  ...present.flatMap((t) => ['-t', `public.${t}`]),
], { stdio: ['ignore', 'inherit', 'inherit'] });

const dumpMs = Date.now() - started;
const schemaSha = await sha256File(schemaPath);
const dataSha = await sha256File(dataPath);
const counts = Object.fromEntries(present.map((t) => [t, Number(q(DB, `SELECT count(*) FROM ${t}`))]));

const manifest = {
  kind: 'lawmind-user-backup',
  version: 1,
  createdAt: new Date().toISOString(),
  sourceDatabase: DB,
  splitMode: SPLIT ?? 'single',
  dumpMs,
  tables: present,
  absentTables: missing,
  counts,
  artifacts: {
    'user-schema.dump': { sha256: schemaSha, bytes: statSync(schemaPath).size },
    'user-data.dump': { sha256: dataSha, bytes: statSync(dataPath).size },
  },
};
writeFileSync(join(OUT, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`  dump complete in ${dumpMs} ms`);
console.log(`  user-data.dump  sha256 ${dataSha}`);

if (!DO_RESTORE) {
  console.log('\n--no-restore: stopping at the dump. This pack is UNPROVEN.');
  process.exit(0);
}

// ── 3. RESTORE INTO A PRISTINE DISPOSABLE DATABASE ─────────────────────────
//
// `TEMPLATE template0` is the PostgreSQL-recommended shape for a restore target:
// template1 can carry whatever a previous operator installed into it, and an
// object already present is an object `pg_restore` reports an error for. A
// pristine template makes the restore's own error list meaningful.
console.log(`\nrestoring into a pristine disposable database: ${SCRATCH}`);
pg('psql', [...conn, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
  `CREATE DATABASE ${SCRATCH} TEMPLATE template0`], { stdio: ['ignore', 'inherit', 'inherit'] });

let failed = null;
const restoreStart = Date.now();
try {
  /**
   * The schema restore is allowed to report errors and is NOT `--exit-on-error`.
   * The dump carries the whole database's schema, including corpus tables whose
   * extensions (pgvector) may be absent from a bare restore target — and a user
   * restore does not need them. The DATA restore below is the one that must be
   * clean, and it is run with `--exit-on-error`.
   */
  pg('pg_restore', [...conn, '-d', SCRATCH, '--no-owner', '--no-privileges', schemaPath],
    { stdio: ['ignore', 'inherit', 'pipe'] });
} catch {
  console.log('  schema restore reported errors (expected: corpus-side objects); continuing');
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `--disable-triggers`, AND IT IS CORRECTNESS BEFORE IT IS SPEED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A restore must REPRODUCE the rows that were dumped. It must not re-run the
 * business logic that produced them, because that logic is not idempotent and
 * its inputs are no longer the same.
 *
 * Measured here, 2 September 2026, on the first run of this script without the
 * flag — the restore aborted at the first table:
 *
 *     COPY failed for table "users": ERROR: relation "workspaces" does not exist
 *     QUERY: INSERT INTO workspaces (owner_user_id, kind) VALUES (NEW.id, ...)
 *     CONTEXT: PL/pgSQL function public.ensure_personal_workspace()
 *
 * `users_personal_workspace` fired on every restored row. Fourteen user-defined
 * triggers exist on this schema and several are worse than that one: `audit_log`
 * carries `audit_log_no_update_or_delete` and `audit_log_no_truncate`, and
 * `ecourts_observation` and `official_source_artifact` each carry a no-update
 * guard. Those exist to protect an append-only table from a live process and
 * they are exactly wrong during a load.
 *
 * The flag needs superuser on the TARGET, which is a disposable database this
 * script just created. It applies only to `--data-only`, which is what this is.
 */
try {
  pg('pg_restore', [...conn, '-d', SCRATCH, '--no-owner', '--no-privileges',
    '--disable-triggers', '--exit-on-error', '--single-transaction', dataPath],
    { stdio: ['ignore', 'inherit', 'inherit'] });
} catch (e) {
  failed = `data restore failed: ${String(e.message).split(String.fromCharCode(10)).slice(0, 3).join(' | ')}`;
}
const restoreMs = Date.now() - restoreStart;

// ── 4. VERIFY ──────────────────────────────────────────────────────────────
//
// Row counts per table, then the invariants that a count cannot see. A restore
// that loaded every row but lost the tenant column would pass a count check and
// hand one advocate another's matters.
const restored = {};
const countMismatches = [];
for (const t of present) {
  const n = Number(q(SCRATCH, `SELECT count(*) FROM ${t}`));
  restored[t] = n;
  if (n !== counts[t]) countMismatches.push(`${t}: source ${counts[t]}, restored ${n}`);
}

/**
 * TENANT OWNERSHIP, CHECKED RATHER THAN ASSUMED.
 *
 * Every check is written to be meaningful on an EMPTY table too: `count(*)
 * WHERE <broken>` is 0 for a table with no rows, which is the correct answer,
 * and none of them can pass vacuously in a way that hides a real breakage.
 */
const invariants = [
  ['every matter has an owner', 'matters', 'SELECT count(*) FROM matters WHERE user_id IS NULL'],
  ['every matter owner exists', 'matters',
    'SELECT count(*) FROM matters m WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)'],
  ['every saved authority belongs to a matter', 'matter_authorities',
    'SELECT count(*) FROM matter_authorities a WHERE NOT EXISTS (SELECT 1 FROM matters m WHERE m.id = a.matter_id)'],
  ['every matter event belongs to a matter', 'matter_events',
    'SELECT count(*) FROM matter_events e WHERE NOT EXISTS (SELECT 1 FROM matters m WHERE m.id = e.matter_id)'],
  ['every annotation has an author', 'judgment_annotations',
    'SELECT count(*) FROM judgment_annotations WHERE user_id IS NULL'],
  ['every document belongs to a matter', 'documents',
    'SELECT count(*) FROM documents d WHERE d.matter_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM matters m WHERE m.id = d.matter_id)'],
  ['no duplicate idempotency key', 'api_idempotency_records',
    'SELECT count(*) FROM (SELECT 1 FROM api_idempotency_records GROUP BY user_id, idempotency_key, route HAVING count(*) > 1) d'],
];
const invariantFailures = [];
const invariantResults = [];
for (const [name, table, sql] of invariants) {
  if (!present.includes(table)) {
    invariantResults.push({ name, table, skipped: 'table absent' });
    continue;
  }
  let broken;
  try {
    broken = Number(q(SCRATCH, sql));
  } catch (e) {
    invariantResults.push({ name, table, error: e.message.split('\n')[0] });
    invariantFailures.push(`${name}: could not be checked (${e.message.split('\n')[0]})`);
    continue;
  }
  invariantResults.push({ name, table, broken });
  if (broken > 0) invariantFailures.push(`${name}: ${broken} broken rows`);
}

const identity = q(SCRATCH, 'SELECT current_database()');
const corpusInRestore = Number(q(SCRATCH,
  `SELECT CASE WHEN to_regclass('public.judgments') IS NULL THEN 0 ELSE (SELECT count(*) FROM judgments) END`));

console.log(`\nrestore into ${identity} took ${restoreMs} ms`);
for (const t of present) console.log(`  ${t.padEnd(28)} ${String(counts[t]).padStart(9)} -> ${String(restored[t]).padStart(9)}`);
for (const r of invariantResults) {
  console.log(`  invariant ${r.name.padEnd(45)} ${r.skipped ?? r.error ?? (r.broken === 0 ? 'OK' : `${r.broken} BROKEN`)}`);
}
console.log(`  judgments rows in the restored user database: ${corpusInRestore} (expected 0 — the corpus is not in a user backup)`);

const problems = [
  ...(failed ? [failed] : []),
  ...countMismatches.map((m) => `row count mismatch — ${m}`),
  ...invariantFailures,
  ...(corpusInRestore > 0 ? [`the user backup restored ${corpusInRestore} corpus rows`] : []),
];

writeFileSync(join(OUT, 'RESTORE_PROOF.json'), `${JSON.stringify({
  restoredInto: identity, restoreMs, sourceCounts: counts, restoredCounts: restored,
  invariants: invariantResults, corpusRowsInUserRestore: corpusInRestore,
  verdict: problems.length === 0 ? 'RESTORE_VERIFIED' : 'RESTORE_FAILED', problems,
}, null, 2)}\n`);

if (!KEEP) {
  pg('psql', [...conn, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`],
    { stdio: 'ignore' });
  console.log(`  dropped ${SCRATCH}`);
} else {
  console.log(`  KEPT ${SCRATCH} — connect with the same credentials to run an API smoke against it`);
}

if (problems.length > 0) {
  console.error(`\nRESTORE_FAILED\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('\nRESTORE_VERIFIED');
