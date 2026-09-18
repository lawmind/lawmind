/**
 * Sampled paragraph-number-detection measurement — `docs/ai/CORPUS_QUALITY.md`,
 * Stage 4 of the DATA → RETRIEVAL EXECUTION PROGRAM.
 *
 *   pnpm --filter @lawmind/api quality:paragraphs [--n 500]
 *
 * `services/ingest/src/corpus-report-cli.ts`'s own header names this exact
 * gap: *"paragraph-extraction quality (numberedShare) at corpus scale... would
 * require fetching every full_text, the expensive full-corpus scan a dry
 * report should not casually trigger."* This is the bounded alternative —
 * a random SAMPLE, not a corpus-wide sweep, fetching `full_text` for `--n`
 * rows only (default 500). Reuses `segmentParagraphs`/`numberedShare`
 * directly rather than re-deriving them — they already live in this service
 * and this script sits beside their definition, so no cross-service import
 * was needed.
 *
 * **Labelled SAMPLED, never MEASURED**, per this program's own labelling
 * discipline (`docs/ai/HC_CORPUS_CHARACTERIZATION.md` §0's convention).
 */
import postgres from 'postgres';

import { numberedShare, segmentParagraphs } from './paragraphs.ts';
import { sslFor } from '../db-ssl';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const nArg = process.argv.indexOf('--n');
  const n = nArg === -1 ? 500 : Number(process.argv[nArg + 1] ?? 500);

  const sql = postgres(url, { max: 4, ssl: sslFor(url) });
  try {
    // TABLESAMPLE for a cheap, honestly-random slice rather than ORDER BY
    // random() over the whole table (which forces a full scan to score every
    // row before sampling — exactly the cost this script exists to avoid).
    const rows = await sql<{ id: string; court: string; full_text: string }[]>`
      SELECT id, court, full_text FROM judgments TABLESAMPLE SYSTEM (2)
      LIMIT ${n}`;

    console.log(`sample size: ${rows.length} (requested ${n})`);

    const shares: number[] = [];
    const byCourtClass: Record<'Supreme Court' | 'High Court', number[]> = {
      'Supreme Court': [],
      'High Court': [],
    };
    let zeroShare = 0;

    for (const r of rows) {
      const paragraphs = segmentParagraphs(r.full_text);
      const share = numberedShare(paragraphs);
      shares.push(share);
      const courtClass = r.court === 'Supreme Court of India' ? 'Supreme Court' : 'High Court';
      byCourtClass[courtClass].push(share);
      if (share === 0) zeroShare++;
    }

    const avg = (xs: number[]): number =>
      xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

    console.log(`\nSAMPLED (not corpus-wide) — TABLESAMPLE SYSTEM, n=${rows.length}:`);
    console.log(`  average numberedShare: ${avg(shares).toFixed(3)}`);
    console.log(
      `  rows with 0.0 numberedShare (no printed paragraph numbers found at all): ${zeroShare} (${((zeroShare / rows.length) * 100).toFixed(1)}%)`,
    );
    for (const [court, xs] of Object.entries(byCourtClass)) {
      if (xs.length === 0) {
        console.log(`  ${court.padEnd(15)} n=0 in this sample`);
        continue;
      }
      console.log(
        `  ${court.padEnd(15)} n=${xs.length.toString().padStart(4)}  avg numberedShare=${avg(xs).toFixed(3)}`,
      );
    }
  } finally {
    await sql.end();
  }
}

await main();
