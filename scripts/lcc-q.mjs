/**
 * LCC — ad-hoc read query runner.
 *
 * Reads SQL from argv[2] or stdin, prints rows as aligned text. Read-only by
 * convention, not by enforcement: it sets a statement_timeout so a bad query
 * cannot camp on the box, and it names itself in application_name so
 * pg_stat_activity attributes it to LCC rather than to "node".
 */
import { readFileSync } from 'node:fs';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const url = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='))
  ?.slice('DATABASE_URL='.length)
  .trim();
if (!url) throw new Error('DATABASE_URL not found in .env');

const timeoutMs = Number(process.env.LCC_Q_TIMEOUT_MS ?? 120_000);
const sql = postgres(url, {
  max: 1,
  idle_timeout: 5,
  connection: { application_name: 'lcc-q', statement_timeout: String(timeoutMs) },
});

const text = process.argv[2] ?? readFileSync(0, 'utf8');
try {
  // A multi-statement script (e.g. SET LOCAL ...; SELECT ...) comes back as an
  // array of result sets. Print the LAST one that actually has rows, so a
  // leading SET does not make a real result read as "(0 rows)".
  let rows = await sql.unsafe(text);
  if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) {
    rows = [...rows].reverse().find((r) => r.length > 0) ?? [];
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('(0 rows)');
  } else {
    const cols = Object.keys(rows[0]);
    const w = cols.map((c) =>
      Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)),
    );
    console.log(cols.map((c, i) => c.padEnd(w[i])).join(' | '));
    console.log(w.map((n) => '-'.repeat(n)).join('-+-'));
    for (const r of rows) {
      console.log(cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join(' | '));
    }
    console.log(`(${rows.length} rows)`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
