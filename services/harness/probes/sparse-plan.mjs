/**
 * Why is the CONTROLLED sparse arm slow when its haystack is the Supreme Court
 * only? `EXPLAIN` with the court filter present, exactly as `sparseAny` issues
 * it. Estimates only — nothing is executed.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim();
const sql = postgres(url, { max: 2, idle_timeout: 20 });

const doc = JSON.parse(readFileSync('services/harness/src/fixtures/queries.eval.json', 'utf8'));
const q = doc.queries[0];

const terms = await sql`
  WITH scored AS (
    SELECT l.lexeme, coalesce(f.document_count::numeric / nullif(f.sampled_documents,0), 0) AS df
      FROM unnest(to_tsvector('english', ${q.query})) AS l
      LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
  ), d AS (SELECT lexeme, df FROM scored WHERE df <= 0.5)
  SELECT lexeme FROM (SELECT lexeme, df FROM d UNION ALL SELECT lexeme, df FROM scored WHERE NOT EXISTS (SELECT 1 FROM d)) c
  ORDER BY df ASC, length(lexeme) DESC LIMIT 40`;
const tsq = terms.map((t) => `'${t.lexeme.replace(/'/g, "''")}'`).join(' | ');

const SC = ['Supreme Court of India'];

const scCount = await sql`SELECT count(*)::int n FROM judgments WHERE court = ${SC[0]}`;
console.log(`Supreme Court judgments: ${scCount[0].n.toLocaleString()}\n`);

for (const [label, courts] of [['NO FILTER', null], ["courts=['sc']", SC]]) {
  const text = courts
    ? `SELECT j.id FROM judgments j
        WHERE j.full_text_tsv @@ to_tsquery('english', $1)
          AND j.court = ANY($2)
        ORDER BY ts_rank(j.full_text_tsv, to_tsquery('english', $1)) DESC LIMIT 200`
    : `SELECT j.id FROM judgments j
        WHERE j.full_text_tsv @@ to_tsquery('english', $1)
        ORDER BY ts_rank(j.full_text_tsv, to_tsquery('english', $1)) DESC LIMIT 200`;
  const params = courts ? [tsq, courts] : [tsq];
  const plan = await sql.unsafe(`EXPLAIN (FORMAT TEXT) ${text}`, params);
  console.log(`── ${label}`);
  for (const r of plan) console.log('   ' + r['QUERY PLAN']);
  console.log('');
}
await sql.end();
