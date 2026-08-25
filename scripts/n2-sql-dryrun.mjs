/**
 * NEW2 — dry-run a .sql file that ends in ROLLBACK.
 *
 * Refuses any file whose last statement is not ROLLBACK, so a dry-run runner
 * can never become an execution runner by accident. Sets lock_timeout and
 * statement_timeout so a dry run cannot block another lane's heavy job, and
 * prints every RAISE NOTICE, because the NOTICEs are the whole point.
 *
 * Usage: node scripts/n2-sql-dryrun.mjs scripts/n2-fixture-removal.sql
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found in environment or .env');
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/n2-sql-dryrun.mjs <file.sql>');
  process.exit(2);
}

const text = readFileSync(join(ROOT, file), 'utf8');

// Last non-comment, non-blank statement must be ROLLBACK.
const tail = text
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, '').trim())
  .filter(Boolean)
  .pop();

if (!/^rollback\s*;?$/i.test(tail ?? '')) {
  console.error(`refused: dry-run runner requires the file to end in ROLLBACK, found: ${tail}`);
  process.exit(2);
}

const notices = [];
const sql = postgres(databaseUrl(), {
  max: 1,
  idle_timeout: 10,
  connect_timeout: 20,
  onnotice: (n) => {
    notices.push(n.message);
    console.log(`NOTICE  ${n.message}`);
  },
});

const started = Date.now();
try {
  // Guard rails first, on the same session the script will run in.
  await sql.unsafe(`set lock_timeout = '5s'; set statement_timeout = '120s';`).simple();
  await sql.unsafe(text).simple();
  console.log('');
  console.log(`DRY RUN COMPLETE — rolled back, ${notices.length} notices, ${Date.now() - started} ms`);
} catch (err) {
  console.log('');
  console.error(`DRY RUN FAILED after ${Date.now() - started} ms`);
  console.error(`  ${err.severity ?? 'ERROR'}: ${err.message}`);
  if (err.where) console.error(`  where: ${err.where}`);
  if (err.detail) console.error(`  detail: ${err.detail}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
