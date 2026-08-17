#!/usr/bin/env node
/**
 * Restore the chunked dump into the local cluster, in the only order that works.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ORDER, AND WHY IT IS THE WHOLE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. pre-data   tables, types, enums, functions        <- from the SCHEMA archive
 *   2. data       COPY every chunk file                  <- from the CHUNKED dump
 *   3. post-data  indexes, constraints, foreign keys     <- from the SCHEMA archive
 *
 * This is not a scheme invented here — it is exactly what a normal `pg_restore`
 * of a full archive does internally, exposed as `--section=`. Reproducing that
 * order is the entire reason the chunked dump is safe to restore at all.
 *
 * `restore.mjs` learned this the hard way: a `--data-only` load into a schema
 * whose foreign keys already exist fails, because every table is checked against
 * tables that have not been loaded yet —
 *
 *   pg_restore: error: COPY failed for table "judgment_citations":
 *     violates foreign key constraint "judgment_citations_citing_fk"
 *
 * Building indexes after the data is also the fast way round, by a wide margin:
 * 29.6 GB of indexes built once over finished tables, in parallel, instead of
 * being maintained incrementally through 74 GB of inserts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS RESUMABLE, LIKE THE DUMP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Its own ledger records which chunks are already loaded. A chunk is marked done
 * only after `COPY` returns success, so an interrupted load redoes at most one
 * chunk. That matters because the data phase moves 74 GB and the index phase
 * runs for a long time afterwards; neither should have to start over.
 *
 * **Re-running a chunk that already loaded would DUPLICATE rows** — there is no
 * primary key to conflict against yet, because post-data has not run. That is
 * precisely why the ledger is authoritative and why `compare.mjs` fails a target
 * whose row count EXCEEDS the source rather than treating "more" as harmless.
 *
 *   node scripts/migration/restore-chunked.mjs --pre-data
 *   node scripts/migration/restore-chunked.mjs --data
 *   node scripts/migration/restore-chunked.mjs --post-data
 *   node scripts/migration/restore-chunked.mjs --all --clean
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { PG, pgEnv, psqlValue, psqlExec } from './pg-local.mjs';

const OUT = path.join(PG.dump, 'chunked');
const DUMP_LEDGER = path.join(OUT, 'ledger.json');
const LOAD_LEDGER = path.join(OUT, 'restore-ledger.json');
const SCHEMA_ARCHIVE = path.join(PG.dump, 'schema');
const ZSTD = process.env.LAWMIND_ZSTD ?? 'C:\\lawmind\\bin\\zstd.exe';

const exe = (n) => path.join(PG.bin, `${n}.exe`);

function loadJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    console.error(`${p} is unreadable; refusing to proceed rather than overwrite it.`);
    process.exit(2);
  }
}

function saveLoadLedger(l) {
  const tmp = `${LOAD_LEDGER}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(l, null, 2));
  fs.renameSync(tmp, LOAD_LEDGER);
}

function pgRestoreSection(section) {
  if (!fs.existsSync(path.join(SCHEMA_ARCHIVE, 'toc.dat'))) {
    console.error(`No schema archive at ${SCHEMA_ARCHIVE}. Run: node scripts/migration/dump.mjs --schema-only`);
    process.exit(2);
  }
  const args = [
    '--dbname', PG.database,
    '--no-owner', '--no-privileges',
    `--section=${section}`,
    '--verbose',
    SCHEMA_ARCHIVE,
  ];
  // pre-data must be exact — a missing table makes every later step meaningless.
  // post-data is allowed to report and continue so that ONE failing index does
  // not discard a completed 74 GB load; its errors are counted and gate the exit.
  if (section === 'pre-data') args.push('--exit-on-error');
  else args.push('--jobs=4');

  console.log(`restore: pg_restore --section=${section}`);
  const started = Date.now();
  const r = spawnSync(exe('pg_restore'), args, {
    env: pgEnv(),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const errors = (out.match(/^pg_restore: error:/gm) ?? []).length;
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`restore: ${section} finished in ${secs}s · exit ${r.status} · ${errors} error(s)`);
  if (errors) {
    for (const line of out.split(/\r?\n/).filter((l) => /^pg_restore: (error|warning):/.test(l)).slice(0, 20)) {
      console.log(`  ${line}`);
    }
  }
  return { code: r.status, errors, seconds: secs };
}

/**
 * One chunk file -> `COPY ... FROM PROGRAM`, decompressed by the SERVER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT THE OBVIOUS `zstd -d -c file | psql -c "COPY ... FROM STDIN"`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Because it silently corrupts the data on Windows. That pipeline was written
 * first and it failed with:
 *
 *   ERROR:  COPY file signature not recognized
 *
 * The file was not the problem — its first bytes are a textbook PostgreSQL
 * binary header, `PGCOPY\n\377\r\n\0`, confirmed with `od -c`. The problem is
 * that **psql reads stdin in TEXT mode on Windows**, so the CRLF sitting inside
 * that 11-byte signature is translated on the way in and the header stops being
 * a header. Every byte of a binary COPY stream is exposed to the same mangling.
 *
 * This is the dangerous class of bug: the header happens to fail loudly, but
 * text-mode translation of a binary stream is the kind of thing that could
 * equally have corrupted a row in the middle of 74 GB and been found weeks later.
 *
 * `COPY ... FROM PROGRAM` sidesteps it completely: the SERVER runs zstd and
 * reads its output, with no client-side stream and no text mode. It is available
 * here because the server is on this machine, runs as the same user, and the
 * connection is superuser — all three are true only because of the migration,
 * and none of them is true of the Railway source.
 *
 * The DUMP direction was checked rather than assumed to have the same flaw: the
 * archives it produced carry an intact binary signature, so writing out through
 * `\copy ... TO PROGRAM` is binary-safe. Only the read path was affected.
 */
function loadChunk(file, table) {
  const posix = file.replace(/\\/g, '/');
  const sqlText =
    `COPY public.${table} FROM PROGRAM '${ZSTD.replace(/\\/g, '/')} -d -c "${posix}"' (FORMAT binary)`;
  return new Promise((resolve) => {
    const psql = spawn(exe('psql'), ['-d', PG.database, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sqlText], {
      env: pgEnv(),
      windowsHide: true,
    });
    let err = '';
    psql.stderr.on('data', (d) => (err += d));
    psql.stdout.on('data', (d) => (err += d));
    psql.on('close', (code) => resolve({ code, err: err.trim() }));
  });
}

async function dataPhase() {
  const dump = loadJson(DUMP_LEDGER, null);
  if (!dump) {
    console.error(`No dump ledger at ${DUMP_LEDGER}. Nothing to restore.`);
    process.exit(2);
  }
  const load = loadJson(LOAD_LEDGER, { chunks: {}, startedAt: new Date().toISOString() });

  const keys = Object.keys(dump.chunks).filter((k) => dump.chunks[k].ok).sort();
  const outstanding = keys.filter((k) => load.chunks[k]?.ok !== true);
  console.log(`restore: ${keys.length} chunk(s) in the dump, ${outstanding.length} still to load`);

  let bytes = 0;
  const started = Date.now();
  for (const key of outstanding) {
    const table = key.split('#')[0];
    const target = stageTargetFor(table);
    const file = path.join(OUT, dump.chunks[key].file);
    if (!fs.existsSync(file)) {
      console.error(`restore: MISSING chunk file ${file} — the dump ledger and the directory disagree.`);
      process.exit(1);
    }
    const t0 = Date.now();
    const res = await loadChunk(file, target);
    if (res.code !== 0) {
      console.error(`restore: FAILED ${key} — ${res.err.split('\n').slice(0, 3).join(' | ')}`);
      console.error('restore: the ledger records what loaded; fix the cause and re-run --data.');
      process.exit(1);
    }
    const sz = fs.statSync(file).size;
    bytes += sz;
    load.chunks[key] = { ok: true, bytes: sz, seconds: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() };
    saveLoadLedger(load);
    const el = (Date.now() - started) / 1000;
    console.log(
      `  ok   ${key.padEnd(30)} ${(sz / 1024 ** 2).toFixed(1).padStart(8)} MB  ` +
        `${String(load.chunks[key].seconds).padStart(4)}s  [${(bytes / 1024 ** 2 / el).toFixed(1)} MB/s avg]`,
    );
  }
  console.log(`restore: data phase complete — ${keys.length} chunk(s) loaded`);
}

/**
 * GENERATED columns must be un-generated for the data phase, and generated
 * again afterwards.
 *
 * This cost a failed restore before it was understood. The dump side writes
 * `\copy (SELECT * FROM t) TO ...`, and `SELECT *` includes a STORED generated
 * column — so `judgments` chunks carry 33 fields. The load side issues
 * `COPY public.judgments FROM ...` with no column list, and PostgreSQL EXCLUDES
 * generated columns from that default list, because you may not write to one.
 * So the server expects 32 and the file offers 33:
 *
 *   ERROR:  row field count is 33, expected 32
 *   CONTEXT:  COPY judgments, line 1
 *
 * Two tables are affected — `judgments.full_text_tsv` and
 * `statute_sections.full_text_tsv` — and nothing else in the schema is
 * generated. It went unnoticed because §7b's "binary COPY fidelity proven on
 * real data" was proven on `judgment_chunks`, which has no generated column.
 *
 * DROP EXPRESSION turns the column into a plain one of the same type, in the
 * same ordinal position, so the 33 fields line up and the dumped values — which
 * the SOURCE computed — land verbatim. SET EXPRESSION afterwards restores the
 * generated property, and must run BEFORE post-data: it rewrites the table, and
 * doing that after the 15.5 GB GIN index exists would rebuild the index twice.
 *
 * Re-generating is not optional. Left plain, the column stops being maintained
 * on write and full-text search silently rots from the next INSERT onward.
 */
function generatedColumns() {
  const rows = psqlValue(
    `SELECT coalesce(string_agg(table_name || '~|~' || column_name || '~|~' || generation_expression, '~;~'), '')
       FROM information_schema.columns
      WHERE table_schema = 'public' AND is_generated <> 'NEVER'`,
    PG.database,
  );
  if (!rows) return [];
  return rows.split('~;~').filter(Boolean).map((r) => {
    const [table, column, expression] = r.split('~|~');
    return { table, column, expression };
  });
}

const GENERATED_CACHE = path.join(PG.dump, 'generated-columns.json');

/**
 * `DROP EXPRESSION` IS ONE-WAY — DO NOT REACH FOR IT. This was tried first and
 * cost a failed post-data run. PostgreSQL has
 * `ALTER COLUMN ... DROP EXPRESSION`, but the inverse does not exist:
 * `SET EXPRESSION AS` only *replaces* the expression of a column that is already
 * generated, and there is no `ADD GENERATED` for an existing plain column:
 *
 *   ERROR:  column "full_text_tsv" of relation "judgments" is not a generated column
 *
 * `DROP COLUMN` + `ADD COLUMN ... GENERATED` does work, and is wrong here: it
 * appends the column at the end of the table. Column ORDER is precisely what a
 * `COPY` without a column list depends on, and it would then differ from what
 * the Drizzle migrations define.
 *
 * So the real table is never altered. A staging clone takes the load instead.
 * `CREATE TABLE x (LIKE y)` defaults to **EXCLUDING GENERATED**, so the clone
 * gets a plain column of the same type in the same ordinal position — exactly
 * the 33-field shape the dump wrote — while the real table keeps its generated
 * column untouched. The final `INSERT ... SELECT` names only the non-generated
 * columns and lets PostgreSQL compute the rest.
 */
function stagedTables() {
  const gen = generatedColumns();
  if (gen.length === 0) return [];
  const byTable = new Map();
  for (const c of gen) {
    if (!byTable.has(c.table)) byTable.set(c.table, []);
    byTable.get(c.table).push(c.column);
  }
  return [...byTable].map(([table, generated]) => {
    const cols = psqlValue(
      `SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '${table}'
          AND is_generated = 'NEVER'`,
      PG.database,
    ).trim();
    return { table, stage: `${table}__stage`, generated, plainColumns: cols };
  });
}

function beginStaging() {
  const staged = stagedTables();
  if (staged.length === 0) return [];
  for (const s of staged) {
    psqlExec(`DROP TABLE IF EXISTS public.${s.stage}`, PG.database);
    psqlExec(`CREATE TABLE public.${s.stage} (LIKE public.${s.table})`, PG.database);
    console.log(
      `restore: staging ${s.table} via ${s.stage} — generated column(s) ${s.generated.join(', ')} cannot be COPYed into`,
    );
  }
  fs.writeFileSync(GENERATED_CACHE, JSON.stringify(staged, null, 2));
  return staged;
}

function finishStaging() {
  if (!fs.existsSync(GENERATED_CACHE)) return;
  const staged = JSON.parse(fs.readFileSync(GENERATED_CACHE, 'utf8'));
  for (const s of staged) {
    const t = Date.now();
    // The generated values are recomputed here rather than carried across. That
    // is unavoidable — a generated column cannot be written to — and it is also
    // the stronger choice: the value is derived by THIS server from the text it
    // actually holds.
    psqlExec(
      `INSERT INTO public.${s.table} (${s.plainColumns})
       SELECT ${s.plainColumns} FROM public.${s.stage}`,
      PG.database,
    );
    psqlExec(`DROP TABLE public.${s.stage}`, PG.database);
    console.log(
      `restore: unstaged ${s.table} in ${Math.round((Date.now() - t) / 1000)}s (generated column recomputed)`,
    );
  }
  fs.rmSync(GENERATED_CACHE);
}

/** Chunks for a staged table are loaded into its stage clone, not the table. */
function stageTargetFor(table) {
  if (!fs.existsSync(GENERATED_CACHE)) return table;
  const staged = JSON.parse(fs.readFileSync(GENERATED_CACHE, 'utf8'));
  return staged.find((s) => s.table === table)?.stage ?? table;
}

async function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const clean = argv.includes('--clean');

  if (clean) {
    console.log(`restore: dropping and recreating ${PG.database}`);
    psqlExec(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = '${PG.database}' AND pid <> pg_backend_pid()`,
    );
    psqlExec(`DROP DATABASE IF EXISTS ${PG.database}`);
    spawnSync(exe('createdb'), [
      '--encoding=UTF8', '--locale-provider=icu', '--icu-locale=en-US', '--template=template0', PG.database,
    ], { env: pgEnv() });
    for (const ext of ['pg_trgm', 'vector']) psqlExec(`CREATE EXTENSION IF NOT EXISTS ${ext}`, PG.database);
    // The load ledger describes a database that no longer exists. Keeping it
    // would make every chunk look already-loaded against an empty database.
    if (fs.existsSync(LOAD_LEDGER)) {
      fs.rmSync(LOAD_LEDGER);
      console.log('restore: cleared the load ledger — it described the dropped database');
    }
    console.log('restore: recreated with pg_trgm + vector');
  }

  if (all || argv.includes('--pre-data')) {
    const r = pgRestoreSection('pre-data');
    if (r.code !== 0 || r.errors > 0) {
      console.error('restore: pre-data did not complete cleanly. Stopping — everything after this depends on it.');
      process.exit(1);
    }
  }

  if (all || argv.includes('--data')) {
    beginStaging();
    await dataPhase();
  }

  if (all || argv.includes('--post-data')) {
    // Before post-data, never after: unstaging inserts millions of rows, and
    // doing that behind the 15.5 GB GIN index would pay for that index twice.
    finishStaging();
    const r = pgRestoreSection('post-data');
    console.log('restore: ANALYZE (a restored database has no statistics at all)');
    const t = Date.now();
    psqlExec('ANALYZE', PG.database);
    console.log(`restore: ANALYZE done in ${Math.round((Date.now() - t) / 1000)}s`);
    if (r.code !== 0 || r.errors > 0) {
      console.error(`restore: post-data reported ${r.errors} error(s). Indexes or constraints are MISSING.`);
      console.error('restore: do not cut over — run compare.mjs and read the index/constraint findings.');
      process.exit(1);
    }
  }

  const size = psqlValue(`SELECT pg_size_pretty(pg_database_size('${PG.database}'))`);
  console.log(`restore: local database is now ${size}`);
  console.log('restore: this does NOT mean the migration is verified. Run:');
  console.log('    node scripts/migration/manifest.mjs --source local --exact --out .../manifest-local-final.json');
  console.log('    node scripts/migration/compare.mjs --a <railway> --b <local>');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
