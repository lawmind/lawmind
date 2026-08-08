/**
 * `pnpm --filter @lawmind/harness diagnose [queryId]` — why a query missed.
 *
 * The first real run returned precision@5 = 4.8% against a floor of 70%, and a
 * number that bad is more often a broken measurement than a broken system. This
 * separates the two by splitting the fused ranking back into its halves and
 * asking, for each, where the gold judgment actually sits.
 *
 * Four different failures produce the same 0.00 in the run output, and they
 * need four different fixes:
 *
 *   dense misses, sparse hits   the embedder is cold, or the query is too long
 *   sparse misses, dense hits   vocabulary mismatch — the reranking case
 *   both miss entirely          recall problem: the gold's chunks are not close
 *   both hit, fusion buries it  RRF weighting, the cheapest thing to change
 */
import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

import type { HarnessQuery } from './retrieval.ts';

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}

function load(name: string): HarnessQuery[] {
  const doc = JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as {
    queries?: HarnessQuery[];
  };
  return doc.queries ?? [];
}

const queries = [...load('queries.derived.json'), ...load('queries.hand.json')];
const wanted = process.argv[2];
const subset = wanted ? queries.filter((q) => q.id === wanted) : queries.slice(0, 6);

const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 3 });

try {
  const embedder = await getEmbedder();

  for (const q of subset) {
    const [embedded] = await embedder.embed([q.query]);
    const vector = embedded ? toVectorLiteral(embedded.vector) : null;
    const gold = q.goldJudgmentIds[0]!;

    console.log('');
    console.log('='.repeat(78));
    console.log(q.id, '→ gold', gold.slice(0, 8));
    console.log(`query ${q.query.length} chars · vector ${vector ? 'PRESENT' : 'ABSENT'}`);

    /* ------------------------------------------------------------- sparse -- */
    const sparse = await sql<{ id: string; case_title: string; r: number }[]>`
      SELECT id, case_title, ts_rank(full_text_tsv, plainto_tsquery('english', ${q.query})) AS r
        FROM judgments
       WHERE full_text_tsv @@ plainto_tsquery('english', ${q.query})
       ORDER BY r DESC
       LIMIT 50
    `;
    const sparseRank = sparse.findIndex((r) => r.id === gold) + 1;
    console.log(
      `sparse  ${sparse.length} matched · gold at ${sparseRank || 'NOT IN TOP 50'}` +
        (sparse[0] ? ` · top: ${sparse[0].case_title.slice(0, 50)}` : ''),
    );

    /* -------------------------------------------------------------- dense -- */
    if (vector) {
      const dense = await sql<{ judgment_id: string; case_title: string; d: number }[]>`
        SELECT c.judgment_id, j.case_title, min(c.embedding <=> ${vector}::vector) AS d
          FROM judgment_chunks c
          JOIN judgments j ON j.id = c.judgment_id
         WHERE c.embedding IS NOT NULL
         GROUP BY c.judgment_id, j.case_title
         ORDER BY d
         LIMIT 50
      `;
      const denseRank = dense.findIndex((r) => r.judgment_id === gold) + 1;
      console.log(
        `dense   gold at ${denseRank || 'NOT IN TOP 50'}` +
          (dense[0]
            ? ` · top: ${dense[0].case_title.slice(0, 50)} (d=${Number(dense[0].d).toFixed(3)})`
            : ''),
      );

      // How close IS the gold, if it is anywhere? A distance tells you whether
      // reranking could ever recover it or whether the vector is simply wrong.
      const [goldDist] = await sql<{ d: number }[]>`
        SELECT min(embedding <=> ${vector}::vector) AS d
          FROM judgment_chunks WHERE judgment_id = ${gold} AND embedding IS NOT NULL
      `;
      console.log(
        `        gold best chunk distance ${goldDist?.d === undefined ? 'NO EMBEDDED CHUNKS' : Number(goldDist.d).toFixed(3)}`,
      );

      /**
       * **Crowding.** `dense()` takes 200 CHUNKS and then keeps the best chunk
       * per judgment, so the number of distinct judgments it can offer the
       * fusion is whatever survives that de-duplication — not 200. The corpus
       * averages sixteen chunks per judgment, and a long judgment whose every
       * section is near the query can occupy dozens of the 200 slots, pushing
       * other judgments out of the candidate list entirely.
       *
       * This prints both numbers so the gap is visible: how many distinct
       * judgments the chunk-level list actually yields, and where the gold
       * would sit if de-duplication happened in SQL instead.
       */
      const [crowding] = await sql<{ chunks: number; judgments: number }[]>`
        WITH top AS (
          SELECT judgment_id FROM judgment_chunks
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> ${vector}::vector
           LIMIT 200
        )
        SELECT count(*)::int AS chunks, count(DISTINCT judgment_id)::int AS judgments FROM top
      `;
      console.log(
        `        crowding: top ${crowding?.chunks ?? 0} chunks cover only ` +
          `${crowding?.judgments ?? 0} distinct judgments`,
      );
    }
  }
} finally {
  await sql.end();
}
