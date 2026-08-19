/**
 * NEW1 C3 ground truth — a NARROW fp32 copy, deliberately WITHOUT an index.
 *
 * Exact search is the only defensible ground truth for an ANN-recall number, and
 * exact means the planner must have no approximate option available. Two ways to
 * get that: disable index scans on `judgment_chunks`, or scan a table that has no
 * vector index at all. This is the second, because it is also 5.5x cheaper to
 * read — `judgment_chunks` carries `chunk_text` and totals 9,355 MB, of which the
 * exact scan needs only the 1024-d vector.
 *
 * No index is created here. The resource gate DEFERS `VECTOR_BUILD` while NEW2's
 * fleet is writing, and nothing about this ground truth needs a graph.
 */
import postgres from 'postgres';
import { readFileSync, appendFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const LOG = new URL('../../../docs/ai/new1-halfvec/fp32-build.log', import.meta.url);
const log = (m) => {
  const line = new Date().toISOString() + '  ' + m + '\n';
  process.stdout.write(line);
  appendFileSync(LOG, line);
};

const sql = postgres(url, {
  ssl: false,
  max: 1,
  connection: { statement_timeout: 0, idle_in_transaction_session_timeout: 0 },
});

try {
  log('START fp32 narrow probe copy');
  await sql`DROP TABLE IF EXISTS new1_fp32_probe`;
  await sql`
    CREATE TABLE new1_fp32_probe (
      id uuid PRIMARY KEY,
      judgment_id uuid NOT NULL,
      embedding vector(1024) NOT NULL
    )
  `;
  let cursor = '00000000-0000-0000-0000-000000000000';
  let copied = 0;
  const t0 = Date.now();
  for (;;) {
    const rows = await sql`
      WITH page AS (
        SELECT id, judgment_id, embedding
        FROM judgment_chunks
        WHERE id > ${cursor}::uuid
        ORDER BY id
        LIMIT 20000
      )
      INSERT INTO new1_fp32_probe (id, judgment_id, embedding)
      SELECT id, judgment_id, embedding FROM page
      RETURNING id
    `;
    if (rows.length === 0) break;
    for (const r of rows) if (r.id > cursor) cursor = r.id;
    copied += rows.length;
    if (copied % 100000 === 0) log('copied ' + copied + '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  const [{ size }] = await sql`SELECT pg_size_pretty(pg_total_relation_size('new1_fp32_probe')) AS size`;
  log('COPY DONE ' + copied + ' rows, ' + size + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
} catch (e) {
  log('FAILED ' + e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
