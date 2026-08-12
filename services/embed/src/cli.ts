/**
 * Chunk and embed judgments into `judgment_chunks`.
 *
 *   pnpm --filter @lawmind/embed run embed [--limit N] [--batch 8]
 *     [--embed-endpoint URL] [--write-concurrency 3]
 *
 * Resumable: a judgment already carrying chunks is skipped, and each judgment's
 * chunks are written in one transaction, so an interrupted run leaves either all
 * of a judgment's chunks or none. Half-embedded judgments would retrieve
 * partially and silently.
 */
import postgres from 'postgres';

import { chunkJudgment } from './chunk.ts';
import { getEmbedder, getRemoteEmbedder, toVectorLiteral } from './embed.ts';
import { textQuality } from './quality.ts';

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v === undefined ? fallback : Number(v);
}

function stringArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Scores chunks written before `text_quality` existed. Idempotent. */
async function backfillQuality(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ id: string; chunk_text: string }[]>`
    SELECT id, chunk_text FROM judgment_chunks WHERE text_quality IS NULL
  `;
  console.log(`chunks missing text_quality: ${rows.length}`);
  for (const row of rows) {
    await sql`
      UPDATE judgment_chunks SET text_quality = ${textQuality(row.chunk_text)} WHERE id = ${row.id}
    `;
  }
  const [left] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM judgment_chunks WHERE text_quality IS NULL
  `;
  console.log(`still unscored (no Latin tokens to assess): ${left?.n}`);
}

type ChunkRow = {
  judgment_id: string;
  chunk_index: number;
  chunk_text: string;
  embedding: string;
  token_count: number;
  text_quality: number | null;
  char_offset: number;
  char_length: number;
};

/**
 * Writes one judgment's chunks in one transaction, retrying transient failures.
 *
 * A full corpus run is hours long over a link that will drop at least once — a
 * single stalled socket previously took the run down after ~1,000 judgments. The
 * work is worth retrying because it is idempotent at the judgment level: either
 * the whole transaction committed or none of it did.
 *
 * A unique violation on (judgment_id, chunk_index) is treated as SUCCESS, not
 * failure. It means an earlier attempt committed and only the acknowledgement was
 * lost — retrying then hits the constraint, and the rows we wanted are already
 * there.
 */
async function writeJudgment(
  sql: postgres.Sql,
  judgmentId: string,
  rows: ChunkRow[],
  attempts = 4,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO judgment_chunks ${tx(rows)}`;
      });
      return;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        console.log(`  ${judgmentId} already present — a previous attempt committed`);
        return;
      }
      if (attempt >= attempts) throw err;
      const backoffMs = 1000 * 2 ** (attempt - 1);
      console.log(
        `  ${judgmentId} write failed (${String((err as Error).message).slice(0, 90)}), ` +
          `retry ${attempt}/${attempts - 1} in ${backoffMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

async function main(): Promise<void> {
  const limit = arg('--limit', 50);
  const batchSize = arg('--batch', 8);
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  // One connection per concurrent write, plus one for the pending-judgments read.
  //
  // The timeouts exist because a silently dead TCP connection is what actually
  // kills a multi-hour run: without them postgres.js waits on the socket
  // indefinitely, the write never settles, and the process exits having written
  // nothing since the stall. Bounded waits turn that into a retryable error.
  const sql = postgres(url, {
    max: arg('--write-concurrency', 3) + 1,
    connect_timeout: 30,
    // Recycles connections periodically so a half-dead one cannot be reused for
    // the rest of the run.
    max_lifetime: 60 * 30,
    connection: {
      // Server-side ceiling on a single statement. Generous — the largest
      // judgment is ~1,200 rows — but finite.
      statement_timeout: 120_000,
    },
  });

  try {
    if (process.argv.includes('--backfill-quality')) {
      await backfillQuality(sql);
      return;
    }

    // IDs only. Selecting full_text here too would pull the entire corpus into
    // memory before the first chunk is embedded — 1.35 GB of judgment text, which
    // measured 2.9 GB resident and stalled the run for ~13 minutes at startup.
    // The text is fetched a page at a time below instead.
    const pendingIds = await sql<{ id: string }[]>`
      SELECT j.id
      FROM judgments j
      WHERE NOT EXISTS (SELECT 1 FROM judgment_chunks c WHERE c.judgment_id = j.id)
      -- RECENT FIRST. Advocates cite recent law, so if a long run is interrupted
      -- the coverage we already have is the coverage that matters. Oldest-first
      -- also front-loads the 1950s scans, which are both the least cited and the
      -- most OCR-damaged text in the corpus (text_quality ~0.90 there).
      ORDER BY j.judgment_date DESC
      LIMIT ${limit}
    `;
    console.log(`judgments needing chunks: ${pendingIds.length}`);
    if (pendingIds.length === 0) return;

    const pageSize = arg('--page-size', 200);

    /** Yields judgments a page at a time, preserving the recent-first order. */
    async function* pages(): AsyncGenerator<{ id: string; full_text: string }> {
      for (let i = 0; i < pendingIds.length; i += pageSize) {
        const ids = pendingIds.slice(i, i + pageSize).map((r) => r.id);
        const page = await sql<{ id: string; full_text: string }[]>`
          SELECT id, full_text FROM judgments WHERE id = ANY(${ids})
        `;
        // ANY() does not preserve order; restore the recent-first sequence.
        const byId = new Map(page.map((r) => [r.id, r]));
        for (const id of ids) {
          const row = byId.get(id);
          if (row) yield row;
        }
      }
    }

    // `--embed-endpoint http://127.0.0.1:8799` routes the matrix multiply to the
    // GPU sidecar (`gpu/server.py`). Everything else — chunking, quality scoring,
    // ordering, the one-transaction-per-judgment write — is unchanged, so the GPU
    // run and a local run differ in exactly one place.
    const endpoint = stringArg('--embed-endpoint');
    const embedder = endpoint ? getRemoteEmbedder(endpoint) : await getEmbedder();
    console.log(endpoint ? `embedding via sidecar ${endpoint}` : 'embedding in-process');
    const startedAt = Date.now();
    let totalChunks = 0;

    // Writes overlap the GPU; see the note at the insert. Kept small on purpose —
    // this is enough to hide the round trip behind the next judgment's embedding,
    // and more would just queue against the connection pool.
    const writeConcurrency = arg('--write-concurrency', 3);
    const inFlight = new Set<Promise<void>>();
    let writeError: unknown;

    /**
     * Keeps a write in `inFlight` without letting its rejection escape into an
     * unhandled rejection, and records the first failure so the run can stop.
     *
     * The tracked promise deliberately never rejects: `Promise.race` and
     * `Promise.all` are called on this set, and a rejecting member would take
     * down the run at an arbitrary point rather than where it is checked.
     */
    const track = (write: Promise<void>, onDone: () => void): void => {
      const tracked = write.then(
        () => {
          inFlight.delete(tracked);
          onDone();
        },
        (err: unknown) => {
          inFlight.delete(tracked);
          writeError ??= err;
        },
      );
      inFlight.add(tracked);
    };

    let n = 0;
    for await (const judgment of pages()) {
      // Captured per iteration. The progress line is logged from the write's
      // callback, which runs after the loop has moved on — reading `n` there
      // reports whatever judgment is being embedded now, not the one that landed.
      const index = ++n;
      const chunks = chunkJudgment(judgment.full_text);
      if (chunks.length === 0) {
        console.log(`  ${judgment.id} produced no chunks — skipping`);
        continue;
      }

      const rows: ChunkRow[] = [];

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
            // Scored on exactly the text that gets embedded, overlap included —
            // if the carried tail is damaged, the embedding carries that damage
            // too, so the score should reflect it.
            text_quality: textQuality(chunk.text),
            // ocr_confidence stays unset: the source ships no engine confidence
            // and we did not run the OCR, so any number here would be invented.
            char_offset: chunk.offset,
            char_length: chunk.bodyLength,
          });
        });
      }

      // One transaction per judgment: all of its chunks, or none.
      //
      // Not awaited here. Embedding and writing cost almost exactly the same per
      // chunk — measured 40.3 ms on the GPU against 36.9 ms for the round trip to
      // Railway — and run back to back they simply add up. Letting a bounded
      // number of writes run while the GPU works on the next judgment overlaps
      // them instead, which is worth about half the total wall clock on a run
      // this size.
      //
      // Each judgment keeps its own transaction, so atomicity and resumability
      // are unchanged: concurrent writes are for DIFFERENT judgments, and a
      // killed run still leaves every judgment either whole or absent.
      track(writeJudgment(sql, judgment.id, rows), () => {
        totalChunks += rows.length;
        const elapsed = (Date.now() - startedAt) / 1000;
        console.log(
          `[${index}/${pendingIds.length}] ${judgment.id} chunks=${rows.length} ` +
            `total=${totalChunks} elapsed=${elapsed.toFixed(0)}s ` +
            `(${(elapsed / Math.max(totalChunks, 1)).toFixed(2)}s/chunk)`,
        );
      });

      // Surface a write failure at the next opportunity rather than pressing on.
      if (writeError) throw writeError;
      if (inFlight.size >= writeConcurrency) await Promise.race(inFlight);
    }

    // Anything still in flight has to land before the count below is read.
    await Promise.all(inFlight);
    if (writeError) throw writeError;

    const [count] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgment_chunks`;
    console.log(`\njudgment_chunks in database: ${count?.n}`);
  } finally {
    await sql.end();
  }
}

await main();
