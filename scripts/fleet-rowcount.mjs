/**
 * Print the current `judgments` row count and nothing else.
 *
 * Exists so fleet-resume.ps1 can verify a resume the only way that counts —
 * rows landing — without embedding a connection string or a driver in a
 * PowerShell script. Deliberately one number on stdout so the caller can
 * subtract two samples.
 *
 * Reads DATABASE_URL from the environment first and .env second, so that after
 * the local-PostgreSQL cutover it follows whatever the fleet itself is pointed
 * at rather than pinning Railway.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function databaseUrl() {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error('DATABASE_URL is set neither in the environment nor in .env');
  return m[1].trim();
}

const url = databaseUrl();
const sql = postgres(url, {
  // `require` rather than a rejectUnauthorized:false object so this keeps working
  // unchanged against a local instance with no TLS: postgres.js downgrades when
  // the server does not offer it, which a hard-coded TLS object does not.
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
});

try {
  const [{ count }] = await sql`select count(*)::bigint as count from judgments`;
  console.log(String(count));
} finally {
  await sql.end({ timeout: 5 });
}
