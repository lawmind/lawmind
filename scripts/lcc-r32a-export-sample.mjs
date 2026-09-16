#!/usr/bin/env node
/**
 * LCC R32A — EXPORT SIZE, MEASURED FROM A RANDOM SAMPLE, NOT GUESSED.
 *
 * No full release export has ever been cut; the two rehearsals exported 500
 * judgments in id order. This COPYs a block sample (TABLESAMPLE SYSTEM,
 * REPEATABLE) of every Gate-C table with the SAME writable-column rule the
 * exporter uses (generated columns excluded), counts the plain bytes and the
 * gzip bytes, and scales by the table's row estimate. Read-only; nothing is
 * written to disk except the report.
 *
 *   pnpm exec tsx scripts/lcc-r32a-export-sample.mjs --out docs/ai/lcc-r32a [--pct 0.05]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import postgres from 'postgres';

import { SERVING_TABLES } from '../services/api/src/ops/release-export-cli.ts';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const outDir = arg('--out', 'docs/ai/lcc-r32a');
const pct = Number(arg('--pct', '0.05'));
const TABLES = [...SERVING_TABLES.map((t) => t.table), 'judgment_paragraphs'];

const url =
  process.env.DATABASE_URL ??
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='))
    .slice(13)
    .trim();
const sql = postgres(url, { max: 1, idle_timeout: 5 });
const GIB = 1024 ** 3;
const gib = (b) => Math.round((b / GIB) * 1000) / 1000;

function counter() {
  const s = new Writable({
    write(chunk, _e, cb) {
      s.bytes += chunk.length;
      cb();
    },
  });
  s.bytes = 0;
  return s;
}

const results = [];
try {
  for (const table of TABLES) {
    const cols = (
      await sql`
      SELECT a.attname FROM pg_attribute a
       WHERE a.attrelid = ${table}::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
       ORDER BY a.attnum`
    ).map((r) => `"${r.attname}"`);
    const [{ est: relEst, bytes }] = await sql`
      SELECT reltuples::bigint AS est, pg_total_relation_size(oid)::bigint AS bytes FROM pg_class WHERE oid = ${table}::regclass`;
    // A block sample of a small table can be empty, and an empty COPY stream
    // hung this script once. Small tables are copied whole: exact, and cheap.
    const whole = Number(bytes) < 2 * GIB;
    const from = whole ? table : `${table} TABLESAMPLE SYSTEM (${pct}) REPEATABLE (32)`;
    const [{ n }] = await sql.unsafe(`SELECT count(*)::bigint AS n FROM ${from}`);
    const est = whole ? n : relEst;
    const t0 = Date.now();
    // One connection per COPY, closed after it, as release-export-cli does: a
    // COPY stream on the shared max:1 handle left it wedged twice.
    const copyConn = postgres(url, { max: 1, idle_timeout: 5 });
    const plain = { bytes: 0 };
    const gz = counter();
    try {
      const readable = await copyConn
        .unsafe(`COPY (SELECT ${cols.join(', ')} FROM ${from}) TO STDOUT`)
        .readable();
      const gzip = createGzip({ level: 6 });
      readable.on('data', (c) => {
        plain.bytes += c.length;
      });
      await pipeline(readable, gzip, gz);
    } finally {
      await copyConn.end({ timeout: 5 });
    }
    const rows = Number(n);
    const scale = rows > 0 ? Number(est) / rows : 0;
    const r = {
      table,
      mode: whole ? 'full' : `sample ${pct}%`,
      estRows: Number(est),
      sampleRows: rows,
      samplePlainBytes: plain.bytes,
      sampleGzipBytes: gz.bytes,
      bytesPerRow: rows ? Math.round(plain.bytes / rows) : null,
      gzipRatio: plain.bytes ? Math.round((plain.bytes / gz.bytes) * 100) / 100 : null,
      projectedPlainGiB: gib(plain.bytes * scale),
      projectedGzipGiB: gib(gz.bytes * scale),
      ms: Date.now() - t0,
    };
    results.push(r);
    console.log(JSON.stringify(r));
  }
  const tot = (k) => Math.round(results.reduce((a, r) => a + r[k], 0) * 1000) / 1000;
  const report = {
    kind: 'lcc-r32a-export-sample',
    measuredAt: new Date().toISOString(),
    method: `COPY of TABLESAMPLE SYSTEM (${pct}%) REPEATABLE(32), writable columns only (generated excluded, as release-export-cli), gzip level 6, scaled by reltuples`,
    caveat:
      'block sampling of a clustered table has variance; projections are INFERRED from a measured sample, not a full export',
    tables: results,
    projectedPlainGiB: tot('projectedPlainGiB'),
    projectedGzipGiB: tot('projectedGzipGiB'),
    manifestOnlyPlainGiB:
      Math.round(
        results
          .filter((r) => r.table !== 'judgment_paragraphs')
          .reduce((a, r) => a + r.projectedPlainGiB, 0) * 1000,
      ) / 1000,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'export-sample.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      plain: report.projectedPlainGiB,
      gzip: report.projectedGzipGiB,
      manifestOnly: report.manifestOnlyPlainGiB,
    }),
  );
} finally {
  await sql.end();
}
