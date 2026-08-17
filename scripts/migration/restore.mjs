#!/usr/bin/env node
/**
 * pg_restore an archive into the local cluster — and REFUSE to call it a
 * success on the strength of an exit code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE THING THIS FILE EXISTS TO PREVENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `pg_restore` exits 0 with errors. That is not a bug; with `--exit-on-error`
 * off (the default) it reports problems and carries on, so a restore that
 * skipped an extension, failed to build an index, or could not create a
 * constraint still ends in a zero. The founder directive is explicit that
 * cutover must not be decided by "restore succeeded", and this is the concrete
 * reason why.
 *
 * So this script does three things pg_restore alone does not:
 *
 * 1. **Counts errors from pg_restore's own output** and reports them
 *    separately from the exit code. `errors: 0` is the claim; the exit code is
 *    not.
 * 2. **Runs with `--exit-on-error` for the schema**, where any failure is
 *    structural and continuing is worse than stopping. The DATA restore does
 *    not use it — a single bad row should not discard six hours of work — but
 *    its errors are counted and surfaced.
 * 3. **Writes a receipt** naming what was restored, how long it took, and how
 *    many errors were seen, so the STAGE F comparison has something to read
 *    other than a scrollback buffer.
 *
 * ANALYZE is run at the end, always. A freshly restored database has no
 * statistics at all, so every query planner decision it makes is a guess —
 * and the first person to run a retrieval smoke test against it would measure
 * the missing statistics rather than the migration.
 *
 *   node scripts/migration/restore.mjs --archive schema --schema-only
 *   node scripts/migration/restore.mjs --archive full --jobs 4
 *   node scripts/migration/restore.mjs --archive full --clean   # drop first
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESTORE THE FULL ARCHIVE INTO AN EMPTY DATABASE. DO NOT --data-only INTO A
 * PRE-BUILT SCHEMA. Learned by doing it the wrong way round first:
 *
 *   pg_restore: error: COPY failed for table "judgment_citations":
 *     violates foreign key constraint "judgment_citations_citing_fk"
 *
 * A `--data-only` restore loads into a schema whose foreign keys already exist
 * and are enforced, so every table is checked against tables that have not been
 * loaded yet. Table order cannot fix it — the graph has cycles in practice and
 * one table's parent is always still empty.
 *
 * A FULL archive has none of this problem, and not by luck: pg_dump writes its
 * table of contents in three sections — pre-data (tables), data, post-data
 * (indexes, constraints, foreign keys) — and pg_restore honours that order. The
 * FKs are created after every row is in, and are validated once, in bulk.
 *
 * So `--data-only` stays available for restoring one table into a live
 * database, which is what it is good for, and the migration itself uses
 * `--clean` + the full archive.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PG, pgEnv, psqlValue, psqlExec } from './pg-local.mjs';

const exe = (n) => path.join(PG.bin, `${n}.exe`);

/**
 * pg_restore prints every problem as a line beginning `pg_restore: error:` or
 * `pg_restore: warning:`. Counting them is the only way to distinguish "restored
 * cleanly" from "exited zero".
 */
function classify(line) {
  if (/^pg_restore:\s*error:/i.test(line)) return 'error';
  if (/^pg_restore:\s*warning:/i.test(line)) return 'warning';
  return null;
}

function runCounting(cmd, args, env, logPath) {
  return new Promise((resolve) => {
    const log = fs.createWriteStream(logPath, { flags: 'a' });
    log.write(`\n=== ${new Date().toISOString()} ${args.join(' ')} ===\n`);
    const child = spawn(cmd, args, { env, windowsHide: true });
    let errors = 0;
    let warnings = 0;
    const samples = [];
    let buf = '';

    const consume = (chunk, toStd) => {
      const text = chunk.toString();
      log.write(text);
      toStd.write(text);
      buf += text;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) {
        const k = classify(l);
        if (k === 'error') {
          errors++;
          if (samples.length < 25) samples.push(l.trim());
        } else if (k === 'warning') {
          warnings++;
          if (samples.length < 25) samples.push(l.trim());
        }
      }
    };

    child.stdout.on('data', (d) => consume(d, process.stdout));
    child.stderr.on('data', (d) => consume(d, process.stderr));
    child.on('close', (code) => {
      log.end();
      resolve({ code, errors, warnings, samples });
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const archiveName = argv.includes('--archive') ? argv[argv.indexOf('--archive') + 1] : null;
  const schemaOnly = argv.includes('--schema-only');
  const dataOnly = argv.includes('--data-only');
  const clean = argv.includes('--clean');
  const jobs = argv.includes('--jobs') ? Number(argv[argv.indexOf('--jobs') + 1]) : 4;
  const skipAnalyze = argv.includes('--no-analyze');

  if (!archiveName) {
    console.error('usage: restore.mjs --archive <name> [--schema-only|--data-only] [--clean] [--jobs N]');
    process.exit(2);
  }

  const archiveDir = path.isAbsolute(archiveName) ? archiveName : path.join(PG.dump, archiveName);
  if (!fs.existsSync(path.join(archiveDir, 'toc.dat'))) {
    console.error(`No directory-format archive at ${archiveDir} (no toc.dat).`);
    process.exit(2);
  }

  if (clean) {
    // Dropping and recreating beats --clean inside pg_restore: it leaves no
    // residue from a previous attempt, and it is the only way to be sure a
    // "restored" table is not half of a table from two runs ago.
    console.log(`restore: dropping and recreating database ${PG.database}`);
    psqlExec(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = '${PG.database}' AND pid <> pg_backend_pid()`,
    );
    psqlExec(`DROP DATABASE IF EXISTS ${PG.database}`);
    const r = spawn(exe('createdb'), [
      '--encoding=UTF8',
      '--locale-provider=icu',
      '--icu-locale=en-US',
      '--template=template0',
      PG.database,
    ], { env: pgEnv(), windowsHide: true });
    await new Promise((res) => r.on('close', res));
    // The extensions must exist BEFORE the data restore, because column types
    // depend on them. The archive creates them too, but doing it here means a
    // missing extension fails in a second rather than four hours in.
    for (const ext of ['pg_trgm', 'vector']) psqlExec(`CREATE EXTENSION IF NOT EXISTS ${ext}`, PG.database);
    console.log('restore: database recreated with pg_trgm + vector');
  }

  const logPath = path.join(PG.logs, `restore-${archiveName}.log`);
  const args = [
    '--dbname',
    PG.database,
    '--no-owner',
    '--no-privileges',
    '--verbose',
    archiveDir,
  ];

  if (schemaOnly) {
    args.push('--schema-only');
    // Structural. Any failure here means the target does not match the source,
    // and there is nothing to be gained by continuing past it.
    args.push('--exit-on-error');
  } else {
    args.push(`--jobs=${jobs}`);
    if (dataOnly) args.push('--data-only');
    // Deliberately NOT --exit-on-error: one unrestorable row should not discard
    // hours of a data load. Errors are counted instead, and a non-zero count
    // blocks cutover just as firmly — see the exit handling below.
  }

  console.log(`restore: ${archiveDir} -> ${PG.database} (${schemaOnly ? 'schema-only' : `jobs=${jobs}`})`);
  const started = Date.now();
  const res = await runCounting(exe('pg_restore'), args, pgEnv(), logPath);
  const elapsedS = (Date.now() - started) / 1000;

  console.log('');
  console.log(`restore: exit ${res.code} · ${Math.round(elapsedS)}s · errors ${res.errors} · warnings ${res.warnings}`);
  if (res.samples.length) {
    console.log('restore: first problems reported ---');
    for (const s of res.samples) console.log(`  ${s}`);
  }

  let analyzeSeconds = null;
  if (!skipAnalyze && !schemaOnly) {
    console.log('restore: ANALYZE (a restored database has no statistics at all)');
    const a = Date.now();
    psqlExec('ANALYZE', PG.database);
    analyzeSeconds = Math.round((Date.now() - a) / 1000);
    console.log(`restore: ANALYZE done in ${analyzeSeconds}s`);
  }

  const receipt = {
    tool: 'scripts/migration/restore.mjs',
    archive: archiveDir,
    database: PG.database,
    mode: schemaOnly ? 'schema-only' : dataOnly ? 'data-only' : 'full',
    jobs: schemaOnly ? 1 : jobs,
    cleanFirst: clean,
    exitCode: res.code,
    pgRestoreErrors: res.errors,
    pgRestoreWarnings: res.warnings,
    problemSamples: res.samples,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedSeconds: Math.round(elapsedS),
    analyzeSeconds,
    databaseSizeBytes: Number(psqlValue(`SELECT pg_database_size('${PG.database}')`)),
  };
  const receiptPath = path.join(PG.dump, `restore-${archiveName}.receipt.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(`restore: receipt ${receiptPath}`);
  console.log(`restore: local database now ${(receipt.databaseSizeBytes / 1024 ** 3).toFixed(2)} GB`);

  // The gate. An exit code of 0 with errors above zero is precisely the case
  // the directive warned about, and it fails here rather than at cutover.
  if (res.code !== 0 || res.errors > 0) {
    console.error(
      `restore: NOT CLEAN — exit ${res.code}, ${res.errors} errors. This archive has NOT been verified as restored.`,
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
