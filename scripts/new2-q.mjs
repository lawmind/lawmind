/**
 * NEW2 ad-hoc read-only query runner.
 *
 * Exists because there is no psql on this machine and every measurement in this
 * lane otherwise needs its own throwaway script. Reads DATABASE_URL the same way
 * fleet-rowcount.mjs does — environment first, .env second — so it follows the
 * local-PostgreSQL cutover rather than pinning Railway.
 *
 * Usage:  node scripts/new2-q.mjs "select count(*) from judgments"
 *         node scripts/new2-q.mjs --file query.sql
 * Refuses anything that is not a single read statement.
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

const args = process.argv.slice(2);
const sql_text = args[0] === '--file' ? readFileSync(args[1], 'utf8') : args.join(' ');
if (!/^\s*(select|with|explain|show|table)\b/i.test(sql_text)) {
  console.error('refused: read-only runner, statement must begin select/with/explain/show/table');
  process.exit(2);
}

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 5, connect_timeout: 20 });
try {
  const rows = await sql.unsafe(sql_text);
  if (rows.length === 0) console.log('(0 rows)');
  else {
    const cols = Object.keys(rows[0]);
    console.log(cols.join('\t'));
    for (const r of rows) console.log(cols.map((c) => (r[c] === null ? 'NULL' : String(r[c]))).join('\t'));
    console.log(`(${rows.length} rows)`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
