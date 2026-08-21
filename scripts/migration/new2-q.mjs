#!/usr/bin/env node
/** NEW2 ad-hoc read-only query runner. `node scripts/migration/new2-q.mjs "SQL"` or `--file f.sql`. */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { sslFor } from './new2-ssl.mjs';

const url = process.env['DATABASE_URL'];
if (!url) { console.error('DATABASE_URL not set — run with node --env-file=.env'); process.exit(2); }
const i = process.argv.indexOf('--file');
const sql_text = i === -1 ? process.argv[2] : readFileSync(process.argv[i + 1], 'utf8');
const sql = postgres(url, { ssl: sslFor(url), max: 1, idle_timeout: 5, connect_timeout: 30, prepare: false });
try {
  const rows = await sql.unsafe(sql_text);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
