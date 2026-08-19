/**
 * A self-retrieval sanity check on the staged Tier-A vectors.
 *
 * Norms and row counts prove the write path worked. They do not prove the
 * vectors MEAN anything — a pipeline that embedded the wrong text, or embedded
 * the same text repeatedly, would pass both. This takes a handful of staged
 * documents, re-embeds their own HEAD span on the sidecar, and asks whether the
 * nearest neighbour of a document's own text is that document.
 *
 * Cheap: a few PK reads and a seq scan over ~20k rows.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const GPU = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const N = Number(process.env.N ?? 8);
const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 60000 } });

const docs = await sql`
  SELECT s.judgment_id, s.embedded_chars, left(j.full_text, s.embedded_chars) AS head
  FROM new1_doc_vector_stage s
  JOIN judgments j ON j.id = s.judgment_id
  ORDER BY s.judgment_id
  LIMIT ${N}`;

const res = await fetch(GPU, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ texts: docs.map((d) => d.head) }),
});
const body = await res.json();

let selfFirst = 0;
for (const [i, d] of docs.entries()) {
  const lit = '[' + body.vectors[i].join(',') + ']';
  const hits = await sql`
    SELECT judgment_id, (embedding <=> ${lit}::vector) AS dist
    FROM new1_doc_vector_stage
    ORDER BY embedding <=> ${lit}::vector
    LIMIT 3`;
  const rank = hits.findIndex((h) => h.judgment_id === d.judgment_id) + 1;
  if (rank === 1) selfFirst += 1;
  console.log(
    d.judgment_id.slice(0, 8),
    'self-rank',
    rank || '>3',
    'dist',
    Number(hits[0].dist).toFixed(6),
  );
}
console.log(`self-retrieval: ${selfFirst}/${docs.length} documents are their own nearest neighbour`);
await sql.end({ timeout: 5 });
