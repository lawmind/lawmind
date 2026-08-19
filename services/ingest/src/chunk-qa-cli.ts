/**
 * Chunk-pipeline statistical QA — deterministic measurement over real corpus
 * text, not the stored `judgment_chunks` rows. `verify-exact-span-cli.ts`
 * (services/api) checks whether a STORED offset still matches reality; this
 * checks the CHUNKER ITSELF: re-runs `chunkJudgment` fresh against a sample
 * of real `full_text` and measures its own output. No LLM call anywhere —
 * every measurement here is string arithmetic, computable exactly, and an
 * LLM call would only add cost and a new source of error to answers a
 * `.length` or a `.indexOf` already gives for free.
 *
 *   pnpm --filter @lawmind/ingest chunk:qa [--n 500]
 *
 * Reuses `chunkJudgment` (`@lawmind/embed`, already a workspace dependency
 * here) and `extractCitations` (this package, already tested) rather than
 * re-deriving either.
 */
import postgres from 'postgres';

import { chunkJudgment, defaultChunkOptions } from '@lawmind/embed';

import { extractCitations } from './citations.ts';
import { sslFor } from './db-ssl';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function summarize(label: string, values: number[]): void {
  if (values.length === 0) {
    console.log(`  ${label}: n=0`);
    return;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  console.log(
    `  ${label}: n=${values.length} min=${sorted[0]} p50=${percentile(sorted, 50)} ` +
      `avg=${avg.toFixed(1)} p95=${percentile(sorted, 95)} max=${sorted[sorted.length - 1]}`,
  );
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const nArg = process.argv.indexOf('--n');
  const n = nArg === -1 ? 500 : Number(process.argv[nArg + 1] ?? 500);

  const sql = postgres(url, { max: 4, ssl: sslFor(url) });
  try {
    // TABLESAMPLE for a cheap, honestly-random slice -- same reasoning as
    // paragraph-quality-sample.ts: a full-corpus sweep is the cost this
    // avoids, not a shortcut around correctness.
    const rows = await sql<{ id: string; court: string; full_text: string }[]>`
      SELECT id, court, full_text FROM judgments TABLESAMPLE SYSTEM (2)
      WHERE full_text IS NOT NULL
      LIMIT ${n}
    `;
    console.log(`CHUNK PIPELINE QA — sample n=${rows.length} (requested ${n})`);
    console.log('='.repeat(78));

    const chunksPerDoc: number[] = [];
    const bodyLengths: number[] = [];
    const withOverlapLengths: number[] = [];
    let totalChunks = 0;
    let unverifiedOffsetChunks = 0; // offset === -1, chunk.ts's own self-check failed
    let malformedChunks = 0; // zero-length body, or a chunk with no text at all
    let overlapCorrect = 0;
    let overlapChecked = 0;
    let sentenceEndChunks = 0;
    let sentenceEndChecked = 0;
    let citationsTotal = 0;
    let citationsWhole = 0;
    let citationsSplit = 0;
    let docsWithNoChunks = 0;

    const SENTENCE_END = /[.!?]["')\]]?$/;

    for (const row of rows) {
      const chunks = chunkJudgment(row.full_text, defaultChunkOptions);
      if (chunks.length === 0) {
        docsWithNoChunks++;
        continue;
      }
      chunksPerDoc.push(chunks.length);
      totalChunks += chunks.length;

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        bodyLengths.push(c.bodyLength);
        withOverlapLengths.push(c.text.length);
        if (c.offset < 0) unverifiedOffsetChunks++;
        if (c.bodyLength <= 0 || c.text.trim().length === 0) malformedChunks++;

        if (i > 0) {
          overlapChecked++;
          const prevTail = chunks[i - 1]!.text.slice(-defaultChunkOptions.overlapChars);
          if (prevTail.length > 0 && c.text.startsWith(prevTail)) overlapCorrect++;
        }

        sentenceEndChecked++;
        if (SENTENCE_END.test(c.text.trimEnd())) sentenceEndChunks++;
      }

      // Citation preservation: does every citation the judgment's own text
      // contains land WHOLLY inside one chunk's body, or does it straddle a
      // chunk boundary (split mid-citation -- unreadable and unmatchable)?
      const citations = extractCitations(row.full_text);
      for (const cite of citations) {
        citationsTotal++;
        const citeEnd = cite.offset + cite.raw.length;
        const containedInSome = chunks.some(
          (c) => c.offset >= 0 && cite.offset >= c.offset && citeEnd <= c.offset + c.bodyLength,
        );
        if (containedInSome) citationsWhole++;
        else citationsSplit++;
      }
    }

    console.log(`\ndocuments producing zero chunks: ${docsWithNoChunks} / ${rows.length}`);
    console.log(`total chunks produced: ${totalChunks}\n`);

    console.log('DISTRIBUTIONS');
    summarize('chunks per document', chunksPerDoc);
    summarize('chunk body length (chars)', bodyLengths);
    summarize('chunk text length incl. overlap (chars)', withOverlapLengths);

    console.log('\nINTEGRITY');
    console.log(
      `  merge/overshoot rate (offset=-1, self-verification failed): ${unverifiedOffsetChunks} / ${totalChunks} ` +
        `(${((unverifiedOffsetChunks / Math.max(totalChunks, 1)) * 100).toFixed(2)}%)`,
    );
    console.log(
      `  malformed chunk rate (empty/zero-length body): ${malformedChunks} / ${totalChunks} ` +
        `(${((malformedChunks / Math.max(totalChunks, 1)) * 100).toFixed(2)}%)`,
    );
    console.log(
      `  overlap correctness (chunk[i] starts with chunk[i-1]'s configured tail): ${overlapCorrect} / ${overlapChecked} ` +
        `(${((overlapCorrect / Math.max(overlapChecked, 1)) * 100).toFixed(2)}%)`,
    );
    console.log(
      `  chunks ending at a sentence boundary (distributional, not pass/fail): ${sentenceEndChunks} / ${sentenceEndChecked} ` +
        `(${((sentenceEndChunks / Math.max(sentenceEndChecked, 1)) * 100).toFixed(1)}%) -- the rest end mid-sentence, expected: only the DISPLAYED/located paragraph is trimmed to a sentence start, not the raw chunk`,
    );

    console.log('\nCITATION PRESERVATION');
    console.log(
      `  citations landing wholly inside one chunk: ${citationsWhole} / ${citationsTotal} ` +
        `(${((citationsWhole / Math.max(citationsTotal, 1)) * 100).toFixed(2)}%)`,
    );
    console.log(`  citations split across a chunk boundary: ${citationsSplit} / ${citationsTotal}`);
  } finally {
    await sql.end();
  }
}

await main();
