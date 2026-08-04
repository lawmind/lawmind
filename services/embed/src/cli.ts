/**
 * Chunk and embed judgments into `judgment_chunks`.
 *
 *   pnpm --filter @lawmind/embed run embed [--limit N] [--batch 8]
 *
 * Resumable: a judgment already carrying chunks is skipped, and each judgment's
 * chunks are written in one transaction, so an interrupted run leaves either all
 * of a judgment's chunks or none. Half-embedded judgments would retrieve
 * partially and silently.
 */
import postgres from 'postgres';

import { chunkJudgment } from './chunk.ts';
import { getEmbedder, toVectorLiteral } from './embed.ts';

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v === undefined ? fallback : Number(v);
}

async function main(): Promise<void> {
  const limit = arg('--limit', 50);
  const batchSize = arg('--batch', 8);
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 2 });

  try {
    const pending = await sql<{ id: string; full_text: string }[]>`
      SELECT j.id, j.full_text
      FROM judgments j
      WHERE NOT EXISTS (SELECT 1 FROM judgment_chunks c WHERE c.judgment_id = j.id)
      ORDER BY j.judgment_date
      LIMIT ${limit}
    `;
    console.log(`judgments needing chunks: ${pending.length}`);
    if (pending.length === 0) return;

    const embedder = await getEmbedder();
    const startedAt = Date.now();
    let totalChunks = 0;

    for (const [n, judgment] of pending.entries()) {
      const chunks = chunkJudgment(judgment.full_text);
      if (chunks.length === 0) {
        console.log(`  ${judgment.id} produced no chunks — skipping`);
        continue;
      }

      const rows: {
        judgment_id: string;
        chunk_index: number;
        chunk_text: string;
        embedding: string;
        token_count: number;
      }[] = [];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const slice = chunks.slice(i, i + batchSize);
        const embedded = await embedder.embed(slice.map((c) => c.text));
        slice.forEach((chunk, k) => {
          const e = embedded[k];
          if (!e) throw new Error(`embedding missing for chunk ${chunk.index}`);
          rows.push({
            judgment_id: judgment.id,
            chunk_index: chunk.index,
            chunk_text: chunk.text,
            embedding: toVectorLiteral(e.vector),
            token_count: e.tokenCount,
            // ocr_confidence is deliberately not set. The source ships no
            // confidence score and we did not run the OCR, so any number here
            // would be invented — and this column down-ranks retrieval.
          });
        });
      }

      // One transaction per judgment: all of its chunks, or none.
      await sql.begin(async (tx) => {
        await tx`INSERT INTO judgment_chunks ${tx(rows)}`;
      });
      totalChunks += rows.length;

      const elapsed = (Date.now() - startedAt) / 1000;
      console.log(
        `[${n + 1}/${pending.length}] ${judgment.id} chunks=${rows.length} ` +
          `total=${totalChunks} elapsed=${elapsed.toFixed(0)}s ` +
          `(${(elapsed / Math.max(totalChunks, 1)).toFixed(2)}s/chunk)`,
      );
    }

    const [count] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgment_chunks`;
    console.log(`\njudgment_chunks in database: ${count?.n}`);
  } finally {
    await sql.end();
  }
}

await main();
