#!/usr/bin/env node
/**
 * MIGRATION TRUTH — what the journal says, what the database recorded, and what
 * the schema actually contains, printed side by side and allowed to disagree.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `check-migration-journal.mjs` already proves the journal, the .sql files and
 * git agree. On 25 Aug 2026 it reported **OK — 87 migrations, journalled,
 * ordered and tracked**, and it was right.
 *
 * The live database disagreed with all three:
 *
 *     drizzle.__drizzle_migrations rows          58
 *     _journal.json entries                      87
 *     newest bookkeeping created_at              1786442900000  (11 Aug 2026)
 *
 * The count gap is not the finding. Drizzle's migrator does not count rows — it
 * takes the newest `created_at` in the bookkeeping table and applies every
 * journal entry whose `when` is greater. The newest recorded `when` here is
 * journal index **72**, so `migrate()` believes 73 are applied and 14 are
 * pending, while only 58 rows exist. Both halves are wrong in opposite
 * directions:
 *
 *   - 15 journal entries sit at or below the cursor with NO bookkeeping row.
 *     They were applied by hand. Nothing will ever apply them again, and a
 *     restore built from the journal alone would be fine — but the schema they
 *     produced cannot be attributed to them.
 *   - 14 entries above the cursor are PENDING to drizzle and several are
 *     demonstrably already in the live schema. Running the official migrate path
 *     against this database would re-apply them and abort on the first
 *     `ALTER TABLE ... ADD COLUMN` that is not `IF NOT EXISTS`.
 *
 * So "how many migrations are applied" has three different answers depending on
 * who is asked, and the only one that settles it is **the schema itself**. This
 * tool asks all four and prints the disagreement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It never writes. Not to the schema, not to `__drizzle_migrations`, not to the
 * journal. R7 §8: "Do not run official migrate blindly on the live DB." Deciding
 * what to repair is a separate, deliberate act with a DB_MIGRATION lease behind
 * it; this only establishes what is true first.
 *
 * Usage:
 *   node scripts/migration-truth.mjs                  human table
 *   node scripts/migration-truth.mjs --json           machine-readable manifest
 *   node scripts/migration-truth.mjs --out <path>     write the manifest
 *   node scripts/migration-truth.mjs --url <url>      probe a different database
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRIZZLE = join(REPO, 'packages', 'db', 'drizzle');
const JOURNAL = join(DRIZZLE, 'meta', '_journal.json');

const argv = process.argv.slice(2);
function argOf(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i === -1 || !argv[i + 1] ? fallback : argv[i + 1];
}

function databaseUrl() {
  const explicit = argOf('url');
  if (explicit) return explicit;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = readFileSync(join(REPO, '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('no DATABASE_URL in --url, the environment or .env');
  return m[1].trim();
}

// ───────────────────────────────────────────────────────────────────────────
// what the SQL claims to create
// ───────────────────────────────────────────────────────────────────────────

/**
 * The objects a migration says it creates, extracted from its own SQL.
 *
 * Deliberately a conservative regex pass rather than a parser. A parser would be
 * more precise and would also be a second implementation of PostgreSQL's grammar
 * living in a monitoring script — the failure mode is that it silently mis-parses
 * one statement and a migration reads as touching nothing. Regexes miss loudly:
 * an unmatched statement contributes no object and the migration reports a
 * SMALLER footprint than it has, which biases every verdict toward UNKNOWN
 * rather than toward a false APPLIED.
 */
function objectsCreatedBy(rawSql) {
  // COMMENTS ARE STRIPPED FIRST, and forgetting to was a real defect in the
  // first version of this file. The migrations in this repo document themselves
  // heavily, including by quoting the exact statement a human should run by hand
  // -- `0079` contains seven commented `CREATE INDEX CONCURRENTLY IF NOT EXISTS`
  // lines describing a manual repair. Extracting from raw text counted every one
  // of them as a declared object, so `0079` reported 2/9 present and read as
  // PARTIALLY_APPLIED when its real footprint is three indexes. A migration-truth
  // tool that invents missing objects out of prose is worse than none: it
  // manufactures exactly the doubt it exists to remove.
  const sql = rawSql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
  const out = [];
  const seen = new Set();
  const push = (kind, name) => {
    if (!name) return;
    const clean = name.replace(/"/g, '').replace(/^public\./i, '').trim();
    if (!clean) return;
    const key = kind + ':' + clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, name: clean });
  };

  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi)) {
    push('table', m[1]);
  }
  for (const m of sql.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi,
  )) {
    push('index', m[1]);
  }
  for (const m of sql.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi,
  )) {
    push('view', m[1]);
  }
  for (const m of sql.matchAll(/CREATE\s+TYPE\s+([\w".]+)\s+AS\s+ENUM/gi)) {
    push('enum', m[1]);
  }
  for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w".]+)\s*\(/gi)) {
    push('function', m[1]);
  }
  // Constraints are objects too, and leaving them out made `0078_credit_direction_fix`
  // -- whose ENTIRE content is one CHECK constraint -- report a footprint of 0/0
  // and land in UNKNOWN. A migration-truth manifest with an UNKNOWN in it is a
  // manifest somebody has to go and read the SQL for, which is the work this is
  // supposed to replace.
  for (const m of sql.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w".]+)\s+ADD\s+CONSTRAINT\s+([\w".]+)/gi,
  )) {
    push('constraint', m[2]);
  }

  for (const m of sql.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w".]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi,
  )) {
    const table = m[1].replace(/"/g, '').replace(/^public\./i, '');
    const col = m[2].replace(/"/g, '');
    const key = 'column:' + `${table}.${col}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'column', name: `${table}.${col}`, table, column: col });
  }
  return out;
}

/**
 * Would re-running this migration on a database that already has it succeed?
 *
 * This is the question that decides whether the official migrate path can be
 * pointed at the live database at all. Drizzle splits a file on
 * `--> statement-breakpoint`; each fragment is one statement, and one
 * non-idempotent statement anywhere aborts the whole run at that point, leaving
 * everything after it unapplied and the bookkeeping row unwritten.
 */
function idempotency(rawSql) {
  const body = rawSql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
  const statements = splitStatements(body);

  // A file that DROPs a constraint IF EXISTS and then ADDs it back is idempotent
  // as a pair, and this repo uses that pattern deliberately —
  // `0082_treatment_provenance_column` widens a CHECK that way. Judging the ADD
  // in isolation flagged the one migration whose whole design is re-runnable, and
  // put a DANGER on it that would have stopped a release for no reason. A false
  // DANGER is not the safe direction: it trains people to run the tool and argue
  // with it.
  const droppedFirst = new Set(
    [...body.matchAll(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+([\w".]+)/gi)].map((m) =>
      m[1].replace(/"/g, '').toLowerCase(),
    ),
  );

  const unsafe = [];
  for (const raw of statements) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    // A DO $$ ... $$ block is assumed guarded: they exist in this repo precisely
    // to make a conditional change, and treating them as unsafe would flood the
    // report with false positives. Recorded as an assumption, not a check.
    if (/^DO\s+\$\$/i.test(s)) continue;
    if (/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(s)) unsafe.push(s.slice(0, 90));
    else if (/^CREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(?!IF\s+NOT\s+EXISTS)/i.test(s))
      unsafe.push(s.slice(0, 90));
    else if (/^CREATE\s+TYPE\s+/i.test(s)) unsafe.push(s.slice(0, 90));
    else if (/^ALTER\s+TYPE\s+\S+\s+ADD\s+VALUE\s+(?!IF\s+NOT\s+EXISTS)/i.test(s))
      unsafe.push(s.slice(0, 90));
    else if (/^ALTER\s+TABLE\s+.*\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/i.test(s))
      unsafe.push(s.slice(0, 90));
    else if (/^ALTER\s+TABLE\s+.*\bADD\s+CONSTRAINT\s+([\w".]+)/i.test(s)) {
      const name = s.match(/ADD\s+CONSTRAINT\s+([\w".]+)/i)[1].replace(/"/g, '').toLowerCase();
      if (!droppedFirst.has(name)) unsafe.push(s.slice(0, 90));
    } else if (/^CREATE\s+(MATERIALIZED\s+)?VIEW\s+(?!IF\s+NOT\s+EXISTS)/i.test(s)) {
      // CREATE OR REPLACE VIEW is fine; a bare CREATE VIEW is not.
      if (!/^CREATE\s+OR\s+REPLACE\s+VIEW/i.test(s)) unsafe.push(s.slice(0, 90));
    }
  }
  return { statements: statements.length, idempotent: unsafe.length === 0, unsafe };
}

/**
 * One fragment per statement — and splitting on `--> statement-breakpoint` alone
 * is not enough.
 *
 * Drizzle writes that marker between statements it generated, but every
 * hand-written migration in this repo is a plain `.sql` file with semicolons and
 * no markers at all. Splitting only on the marker yields ONE fragment for such a
 * file, and every rule here is anchored with `^`, so only its FIRST statement was
 * ever examined. `0082` has four statements and exactly one was being read.
 *
 * `$$` bodies and quoted literals are skipped so a semicolon inside a function
 * body or a COMMENT string does not split a statement in half.
 */
function splitStatements(body) {
  const parts = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let dollarTag = null;

  while (i < body.length) {
    const ch = body[i];

    if (dollarTag) {
      buf += ch;
      if (body.startsWith(dollarTag, i)) {
        buf += body.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'") inSingle = body[i + 1] === "'" ? true : false;
      if (ch === "'" && body[i + 1] === "'") {
        buf += "'";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      i += 1;
      continue;
    }
    const dollar = body.slice(i).match(/^\$[\w]*\$/);
    if (dollar) {
      dollarTag = dollar[0];
      buf += dollarTag;
      i += dollarTag.length;
      continue;
    }
    if (body.startsWith('--> statement-breakpoint', i)) {
      parts.push(buf);
      buf = '';
      i += '--> statement-breakpoint'.length;
      continue;
    }
    if (ch === ';') {
      parts.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────
// the live schema
// ───────────────────────────────────────────────────────────────────────────

async function probeSchema(sql, wanted) {
  const tables = new Set();
  const indexes = new Set();
  const views = new Set();
  const enums = new Set();
  const functions = new Set();
  const columns = new Set();
  const constraints = new Set();

  // AN INVALID INDEX IS NOT AN APPLIED INDEX, and only `pg_index.indisvalid`
  // knows the difference. `0079` documents its own case: a build killed
  // mid-flight by a client-side timeout left `judgment_annotations_judgment_idx`
  // INVALID -- present in `pg_class`, named exactly as the migration intended,
  // and useless to the planner. A `to_regclass` probe reports it as there.
  // Counting it as applied would have marked a repaired-by-hand index as done
  // while queries still sequentially scanned, which is how this repo lost 151 GB
  // of scan to a single DELETE.
  const invalidIndexes = new Set();
  for (const r of await sql`SELECT c.relname, c.relkind, i.indisvalid, i.indisready
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_index i ON i.indexrelid = c.oid
      WHERE n.nspname = 'public'`) {
    if (r.relkind === 'r' || r.relkind === 'p') tables.add(r.relname);
    else if (r.relkind === 'i') {
      if (r.indisvalid === false || r.indisready === false) invalidIndexes.add(r.relname);
      else indexes.add(r.relname);
    } else if (r.relkind === 'v' || r.relkind === 'm') views.add(r.relname);
  }
  for (const r of await sql`SELECT t.typname FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'`) {
    enums.add(r.typname);
  }
  for (const r of await sql`SELECT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`) {
    functions.add(r.proname);
  }
  for (const r of await sql`SELECT con.conname FROM pg_constraint con
      JOIN pg_namespace n ON n.oid = con.connamespace WHERE n.nspname = 'public'`) {
    constraints.add(r.conname);
  }
  // Only the columns any migration actually mentions — the full catalogue is
  // tens of thousands of rows and none of the rest can change a verdict.
  const wantedCols = wanted.filter((o) => o.kind === 'column');
  if (wantedCols.length) {
    const tableNames = [...new Set(wantedCols.map((o) => o.table))];
    for (const r of await sql`SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ${sql(tableNames)}`) {
      columns.add(`${r.table_name}.${r.column_name}`);
    }
  }
  return { tables, indexes, views, enums, functions, columns, constraints, invalidIndexes };
}

function presenceOf(obj, live) {
  switch (obj.kind) {
    case 'table':
      return live.tables.has(obj.name) || live.views.has(obj.name);
    case 'index':
      if (live.invalidIndexes.has(obj.name)) return 'INVALID';
      return live.indexes.has(obj.name);
    case 'view':
      return live.views.has(obj.name) || live.tables.has(obj.name);
    case 'enum':
      return live.enums.has(obj.name);
    case 'function':
      return live.functions.has(obj.name);
    case 'column':
      return live.columns.has(obj.name);
    case 'constraint':
      return live.constraints.has(obj.name);
    default:
      return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// main
// ───────────────────────────────────────────────────────────────────────────

async function main() {
  const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
  const url = databaseUrl();
  const { default: postgres } = await import(
    '../services/ingest/node_modules/postgres/src/index.js'
  );
  const sql = postgres(url, { max: 1, onnotice: () => {}, connection: { statement_timeout: '60000' } });

  try {
    const bookkeeping = await sql`
      SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    const byHash = new Map(bookkeeping.map((r) => [r.hash, r]));

    // Drizzle's own cursor: the newest recorded created_at. Everything with a
    // greater journal `when` is what migrate() would try to apply.
    const cursor = bookkeeping.length
      ? Math.max(...bookkeeping.map((r) => Number(r.created_at)))
      : -1;

    const entries = [];
    const allObjects = [];
    for (const e of journal.entries) {
      const file = join(DRIZZLE, `${e.tag}.sql`);
      const present = existsSync(file);
      const body = present ? readFileSync(file, 'utf8') : '';
      const hash = present ? createHash('sha256').update(body).digest('hex') : null;
      const objects = present ? objectsCreatedBy(body) : [];
      allObjects.push(...objects);
      entries.push({ e, file, present, body, hash, objects, idem: present ? idempotency(body) : null });
    }

    const live = await probeSchema(sql, allObjects);

    const manifest = [];
    for (const row of entries) {
      const { e, present, hash, objects, idem } = row;
      const record = hash ? byHash.get(hash) : undefined;
      const belowCursor = e.when <= cursor;

      const checked = objects.map((o) => ({ ...o, present: presenceOf(o, live) }));
      const found = checked.filter((o) => o.present === true).length;
      const invalid = checked.filter((o) => o.present === 'INVALID');
      const missing = checked.filter((o) => o.present === false);

      let footprint;
      if (checked.length === 0) footprint = 'NO_OBJECTS_DECLARED';
      else if (invalid.length) footprint = 'PRESENT_BUT_INVALID';
      else if (missing.length === 0) footprint = 'FULLY_PRESENT';
      else if (found === 0) footprint = 'ABSENT';
      else footprint = 'PARTIAL';

      let status;
      if (!present) status = 'JOURNALLED_FILE_MISSING';
      else if (record) status = 'APPLIED_RECORDED';
      else if (footprint === 'FULLY_PRESENT') status = 'APPLIED_UNRECORDED';
      else if (footprint === 'ABSENT') status = 'JOURNALLED_UNAPPLIED';
      else if (footprint === 'PRESENT_BUT_INVALID') status = 'APPLIED_BUT_INVALID';
      else if (footprint === 'PARTIAL') status = 'PARTIALLY_APPLIED';
      else status = 'UNKNOWN';

      // What migrate() would DO, which is a different question from what is true.
      const migrateWould = belowCursor ? 'skip' : 'apply';
      let safeAction;
      if (status === 'APPLIED_RECORDED') safeAction = 'nothing';
      else if (status === 'APPLIED_UNRECORDED' && migrateWould === 'skip') {
        safeAction = 'record the bookkeeping row; the schema is already right';
      } else if (status === 'APPLIED_UNRECORDED' && migrateWould === 'apply') {
        safeAction = idem?.idempotent
          ? 'migrate() would re-run it and it is idempotent — harmless, but record the row instead'
          : 'DANGER: migrate() would re-run a NON-idempotent migration that is already applied';
      } else if (status === 'JOURNALLED_UNAPPLIED' && migrateWould === 'apply') {
        safeAction = 'let migrate() apply it';
      } else if (status === 'JOURNALLED_UNAPPLIED' && migrateWould === 'skip') {
        safeAction = 'DANGER: migrate() will SKIP a migration that was never applied';
      } else if (status === 'APPLIED_BUT_INVALID') {
        safeAction =
          'DANGER: an index exists but is INVALID — present to to_regclass, useless to the planner. REBUILD it';
      } else if (status === 'PARTIALLY_APPLIED') {
        safeAction = 'INSPECT BY HAND — some objects present, some absent';
      } else safeAction = 'inspect';

      manifest.push({
        idx: e.idx,
        tag: e.tag,
        when: e.when,
        hash,
        journal: 'PRESENT',
        bookkeeping: record ? { id: record.id, created_at: String(record.created_at) } : null,
        drizzle_cursor_position: belowCursor ? 'AT_OR_BELOW' : 'ABOVE',
        migrate_would: migrateWould,
        schema_footprint: footprint,
        objects_declared: checked.length,
        objects_present: found,
        objects_missing: missing.map((o) => `${o.kind}:${o.name}`),
        objects_invalid: invalid.map((o) => `${o.kind}:${o.name}`),
        idempotent: idem ? idem.idempotent : null,
        non_idempotent_statements: idem ? idem.unsafe : [],
        status,
        safe_action: safeAction,
        rollback_note: rollbackNote(status, objects),
      });
    }

    // Files on disk that no journal entry names.
    const journalled = new Set(journal.entries.map((e) => e.tag));
    const orphanFiles = [];
    for (const f of listSql()) {
      if (!journalled.has(f)) orphanFiles.push(f);
    }
    // Bookkeeping rows whose hash matches no file at all.
    const fileHashes = new Set(entries.map((r) => r.hash).filter(Boolean));
    const orphanRows = bookkeeping
      .filter((r) => !fileHashes.has(r.hash))
      .map((r) => ({ id: r.id, hash: r.hash, created_at: String(r.created_at) }));

    const report = {
      generated_at: new Date().toISOString(),
      database: url.replace(/:[^:@]*@/, ':***@'),
      journal_entries: journal.entries.length,
      sql_files: listSql().length,
      bookkeeping_rows: bookkeeping.length,
      drizzle_cursor_when: cursor,
      drizzle_cursor_tag: journal.entries.filter((e) => e.when <= cursor).pop()?.tag ?? null,
      migrate_would_apply: manifest.filter((m) => m.migrate_would === 'apply').length,
      migrate_would_skip: manifest.filter((m) => m.migrate_would === 'skip').length,
      counts: tally(manifest),
      dangers: manifest.filter((m) => m.safe_action.startsWith('DANGER')),
      orphan_files: orphanFiles,
      orphan_bookkeeping_rows: orphanRows,
      migrations: manifest,
    };

    const out = argOf('out');
    if (out) writeFileSync(resolve(REPO, out), JSON.stringify(report, null, 2) + '\n');
    if (argv.includes('--json')) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      render(report);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function listSql() {
  return readdirSync(DRIZZLE)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort();
}

function rollbackNote(status, objects) {
  if (status === 'APPLIED_RECORDED' || status === 'APPLIED_UNRECORDED') {
    const drops = objects.filter((o) => o.kind === 'table' || o.kind === 'column');
    return drops.length
      ? `reversing this drops ${drops.length} object(s) and any data in them — forward-fix instead`
      : 'reversible by replacing the definition; no data loss';
  }
  if (status === 'JOURNALLED_UNAPPLIED') return 'not applied; nothing to roll back';
  return 'unknown until the status is settled';
}

function tally(rows) {
  const out = {};
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

function pad(s, n) {
  const t = s === null || s === undefined ? '-' : String(s);
  return t.length > n ? t.slice(0, n - 1) + '~' : t.padEnd(n);
}

function render(r) {
  console.log(`MIGRATION TRUTH  ${r.generated_at}`);
  console.log(`database ${r.database}`);
  console.log('');
  console.log(
    `journal ${r.journal_entries} · files ${r.sql_files} · bookkeeping rows ${r.bookkeeping_rows}`,
  );
  console.log(
    `drizzle cursor: created_at ${r.drizzle_cursor_when} = "${r.drizzle_cursor_tag}" ` +
      `-> migrate() would SKIP ${r.migrate_would_skip} and APPLY ${r.migrate_would_apply}`,
  );
  console.log('');
  console.log(
    [pad('IDX', 4), pad('TAG', 42), pad('BOOK', 5), pad('CURSOR', 11), pad('MIGRATE', 8), pad('SCHEMA', 18), pad('OBJ', 7), pad('IDEM', 5), pad('STATUS', 22)].join(' '),
  );
  console.log('-'.repeat(132));
  for (const m of r.migrations) {
    console.log(
      [
        pad(m.idx, 4),
        pad(m.tag, 42),
        pad(m.bookkeeping ? 'yes' : 'NO', 5),
        pad(m.drizzle_cursor_position, 11),
        pad(m.migrate_would, 8),
        pad(m.schema_footprint, 18),
        pad(`${m.objects_present}/${m.objects_declared}`, 7),
        pad(m.idempotent === null ? '-' : m.idempotent ? 'yes' : 'NO', 5),
        pad(m.status, 22),
      ].join(' '),
    );
  }
  console.log('');
  console.log('COUNTS: ' + JSON.stringify(r.counts));
  if (r.orphan_files.length) {
    console.log('');
    console.log(`SQL FILES NOT IN THE JOURNAL (${r.orphan_files.length}): ${r.orphan_files.join(', ')}`);
  }
  if (r.orphan_bookkeeping_rows.length) {
    console.log('');
    console.log(
      `BOOKKEEPING ROWS MATCHING NO FILE (${r.orphan_bookkeeping_rows.length}) — a migration was applied whose SQL has since changed or vanished:`,
    );
    for (const o of r.orphan_bookkeeping_rows) console.log(`  id ${o.id} hash ${o.hash.slice(0, 16)}… created_at ${o.created_at}`);
  }
  if (r.dangers.length) {
    console.log('');
    console.log(`DANGERS (${r.dangers.length}) — what running the official migrate path would do:`);
    for (const d of r.dangers) {
      console.log(`  ${d.tag}`);
      console.log(`     ${d.safe_action}`);
      for (const s of d.non_idempotent_statements.slice(0, 3)) console.log(`       ${s}`);
    }
  }
  console.log('');
  console.log(
    'A migration is applied when the SCHEMA says so. The journal says what should run;\n' +
      'the bookkeeping table says what drizzle believes. All three are printed because\n' +
      'on this database all three disagree.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
