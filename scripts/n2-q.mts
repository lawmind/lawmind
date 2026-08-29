/**
 * NEW2 — a one-line SQL reader. Read-only by convention: it refuses anything
 * that is not a single SELECT/WITH statement, because the one thing a scratch
 * query tool must never do is become an unregistered corpus writer.
 *
 * Usage: tsx scripts/n2-q.mts "select 1"
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}
const q = process.argv.slice(2).join(' ');
if (!/^\s*(select|with)\b/i.test(q)) {
  console.error('n2-q: read-only — statement must begin with SELECT or WITH');
  process.exit(2);
}
const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 5, connect_timeout: 30 });
try {
  const rows = await sql.unsafe(q);
  console.log(JSON.stringify(rows, null, 1));
} finally {
  await sql.end({ timeout: 5 });
}
