/**
 * Time the CONTROLLED sparse query for real. The planner says 52,176 against
 * 1,581,287 unfiltered; if the filtered form is genuinely seconds then the arm's
 * observed 12+ minutes is NOT this query and the search moves elsewhere.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim();
const sql = postgres(url, { max: 2, idle_timeout: 20, statement_timeout: 300000 });

const doc = JSON.parse(readFileSync('services/harness/src/fixtures/queries.eval.json', 'utf8'));
const SC = ['Supreme Court of India'];
const N = Number(process.env.N ?? 5);

for (let i = 0; i < N; i++) {
  const q = doc.queries[i * 20];
  const t0 = Date.now();
  const terms = await sql`
    WITH scored AS (
      SELECT l.lexeme, coalesce(f.document_count::numeric / nullif(f.sampled_documents,0), 0) AS df
        FROM unnest(to_tsvector('english', ${q.query})) AS l
        LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
    ), d AS (SELECT lexeme, df FROM scored WHERE df <= 0.5)
    SELECT lexeme FROM (SELECT lexeme, df FROM d UNION ALL SELECT lexeme, df FROM scored WHERE NOT EXISTS (SELECT 1 FROM d)) c
    ORDER BY df ASC, length(lexeme) DESC LIMIT 40`;
  const tsq = terms.map((t) => `'${t.lexeme.replace(/'/g, "''")}'`).join(' | ');
  const tTerms = Date.now() - t0;

  const t1 = Date.now();
  let n = 0;
  let err = null;
  try {
    const rows = await sql.unsafe(
      `SELECT j.id FROM judgments j
        WHERE j.full_text_tsv @@ to_tsquery('english', $1)
          AND j.court = ANY($2)
        ORDER BY ts_rank(j.full_text_tsv, to_tsquery('english', $1)) DESC LIMIT 200`,
      [tsq, SC],
    );
    n = rows.length;
  } catch (e) {
    err = e.message.slice(0, 90);
  }
  console.log(
    `${q.id.padEnd(20)} terms ${String(tTerms).padStart(5)}ms  sparse(SC) ${String(Date.now() - t1).padStart(7)}ms  rows ${n}${err ? '  ERR ' + err : ''}`,
  );
}
await sql.end();
