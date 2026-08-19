/**
 * Drop the disposable C3/C4 probe structures once the verdict is issued.
 *
 * `new1_fp32_probe` (3,340 MB) and `new1_halfvec_probe` (1,711 MB + a 1,613 MB
 * index) exist to answer one question and it is answered. They are rebuildable in
 * about thirteen minutes from `halfvec-probe-build.mjs` and `fp32-probe-build.mjs`,
 * and `docs/ai/new1-halfvec/RESUME.md` records how.
 *
 * `new1_inbound_counts` is KEPT: the value-ordered staging queue is regenerated
 * from it, and rebuilding costs a 4.5 GB pass over `judgment_citations`.
 * `new1_doc_vector_stage` is KEPT: it holds real Tier-A vectors.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 300000 } });

const before = await sql`
  SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS size
  FROM pg_class
  WHERE relname IN ('new1_fp32_probe', 'new1_halfvec_probe', 'new1_inbound_counts', 'new1_doc_vector_stage')
    AND relkind = 'r'
  ORDER BY relname`;
console.log('before:', JSON.stringify(before));

await sql`DROP TABLE IF EXISTS new1_fp32_probe`;
await sql`DROP TABLE IF EXISTS new1_halfvec_probe`;

const after = await sql`
  SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS size
  FROM pg_class
  WHERE relname LIKE 'new1_%' AND relkind = 'r'
  ORDER BY relname`;
console.log('kept:  ', JSON.stringify(after));
await sql.end({ timeout: 5 });
