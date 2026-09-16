#!/usr/bin/env node
/**
 * LCC R32A — BLOCK-I/O SNAPSHOT, for bounding the Gate-C working set.
 *
 * Writes pg_statio counters for the Gate-C tables and their indexes to a file.
 * Run once before and once after a Gate-S1 load; the delta of (hit + read) is
 * an UPPER bound on the distinct blocks the load touched — a block read twice
 * counts twice, and any concurrent local writer's reads are included too.
 * Read-only.
 *
 *   pnpm exec tsx scripts/lcc-r32a-io-snapshot.mjs <out.json>
 *   pnpm exec tsx scripts/lcc-r32a-io-snapshot.mjs --diff before.json after.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';

const TABLES = [
  'judgments',
  'judgment_citations',
  'judgment_judges',
  'judgment_statute_refs',
  'statutes',
  'statute_sections',
  'lexeme_document_frequency',
  'judgment_paragraphs',
];
const BLOCK_MIB = 8 / 1024;

if (process.argv[2] === '--diff') {
  const a = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const b = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  const rows = b.rows
    .map((r) => {
      const p = a.rows.find((x) => x.kind === r.kind && x.name === r.name) ?? { hit: 0, read: 0 };
      return { ...r, dHit: r.hit - p.hit, dRead: r.read - p.read };
    })
    .filter((r) => r.dHit + r.dRead > 0)
    .sort((x, y) => y.dHit + y.dRead - (x.dHit + x.dRead));
  const total = rows.reduce((s, r) => s + r.dHit + r.dRead, 0);
  const out = {
    kind: 'lcc-r32a-io-delta',
    from: a.at,
    to: b.at,
    note: 'UPPER bound on distinct blocks touched: repeat reads and concurrent local readers are both counted',
    touchedBlocksUpperBound: total,
    touchedMiBUpperBound: Math.round(total * BLOCK_MIB),
    readsFromOsMiB: Math.round(rows.reduce((s, r) => s + r.dRead, 0) * BLOCK_MIB),
    rows: rows.map((r) => ({ ...r, touchedMiB: Math.round((r.dHit + r.dRead) * BLOCK_MIB) })),
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const url =
  process.env.DATABASE_URL ??
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='))
    .slice(13)
    .trim();
const sql = postgres(url, { max: 1, idle_timeout: 5 });
try {
  const t = await sql`
    SELECT 'heap' AS kind, relname AS name, COALESCE(heap_blks_hit,0)::bigint AS hit, COALESCE(heap_blks_read,0)::bigint AS read
      FROM pg_statio_user_tables WHERE relname = ANY(${TABLES})
    UNION ALL
    SELECT 'toast', relname, COALESCE(toast_blks_hit,0)::bigint, COALESCE(toast_blks_read,0)::bigint
      FROM pg_statio_user_tables WHERE relname = ANY(${TABLES})
    UNION ALL
    SELECT 'index', indexrelname, COALESCE(idx_blks_hit,0)::bigint, COALESCE(idx_blks_read,0)::bigint
      FROM pg_statio_user_indexes WHERE relname = ANY(${TABLES})`;
  const snap = {
    at: new Date().toISOString(),
    rows: t.map((r) => ({ kind: r.kind, name: r.name, hit: Number(r.hit), read: Number(r.read) })),
  };
  writeFileSync(process.argv[2], JSON.stringify(snap));
  console.log(`snapshot ${snap.rows.length} rows -> ${process.argv[2]}`);
} finally {
  await sql.end();
}
