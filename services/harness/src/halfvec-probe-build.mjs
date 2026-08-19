/**
 * NEW1 C3/C4 — build the DISPOSABLE halfvec structure.
 *
 * Production keeps `judgment_chunks.embedding vector(1024)` and a valid
 * `judgment_chunks_embedding_hnsw` (m=16, ef_construction=64, 4839 MB). Those two
 * give arms 1 and 2 for free:
 *   arm 1  exact fp32   = seq scan with index scans disabled
 *   arm 2  HNSW fp32    = the production index, read-only
 * Only arm 3 needs building, so this script builds ONLY arm 3 and never touches
 * production: a separate table, a separate index, identical HNSW parameters so
 * the comparison isolates the representation and not the graph.
 *
 * Detached on purpose. A console signal on this box has killed Postgres six times
 * (0xC000013A); a long index build must not be attached to an interactive shell.
 */
import postgres from 'postgres';
import { readFileSync, appendFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1].trim();
const LOG = new URL('../../../docs/ai/new1-halfvec/build.log', import.meta.url);
const log = (m) => {
  const line = `${new Date().toISOString()}  ${m}\n`;
  process.stdout.write(line);
  appendFileSync(LOG, line);
};

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 0, idle_in_transaction_session_timeout: 0 } });

try {
  log('START halfvec probe build');
  await sql`DROP TABLE IF EXISTS new1_halfvec_probe`;
  await sql`
    CREATE TABLE new1_halfvec_probe (
      id uuid PRIMARY KEY,
      judgment_id uuid NOT NULL,
      embedding halfvec(1024) NOT NULL
    )
  `;
  log('table created');

  // Keyset walk, never OFFSET.
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
      INSERT INTO new1_halfvec_probe (id, judgment_id, embedding)
      SELECT id, judgment_id, embedding::halfvec(1024) FROM page
      RETURNING id
    `;
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    // RETURNING order is not guaranteed to be the walk order, so take the max.
    for (const r of rows) if (r.id > cursor) cursor = r.id;
    copied += rows.length;
    log(`copied ${copied} rows  cursor ${cursor}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  log(`COPY DONE ${copied} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const [{ size }] = await sql`SELECT pg_size_pretty(pg_total_relation_size('new1_halfvec_probe')) AS size`;
  log(`table size ${size}`);

  log('building HNSW halfvec index (m=16, ef_construction=64) — identical to production fp32');
  const t1 = Date.now();
  await sql`SET maintenance_work_mem = '2GB'`;
  await sql`SET max_parallel_maintenance_workers = 4`;
  await sql`
    CREATE INDEX new1_halfvec_probe_hnsw
      ON new1_halfvec_probe USING hnsw (embedding halfvec_cosine_ops)
      WITH (m = 16, ef_construction = 64)
  `;
  log(`INDEX DONE in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  const [{ isize }] = await sql`SELECT pg_size_pretty(pg_relation_size('new1_halfvec_probe_hnsw')) AS isize`;
  log(`index size ${isize}`);
  log('BUILD COMPLETE');
} catch (e) {
  log(`FAILED ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
