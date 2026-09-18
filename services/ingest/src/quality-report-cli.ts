/**
 * Corpus quality buckets, measured against production — `docs/ai/
 * CORPUS_QUALITY.md`, Stage 4 of the DATA → RETRIEVAL EXECUTION PROGRAM.
 *
 *   pnpm --filter @lawmind/ingest run quality:report [--json <path>]
 *
 * Dry, read-only — same convention as `corpus-report-cli.ts`. Classifies
 * every one of the 79,321 rows via `quality-buckets.ts`, driven entirely by
 * columns already in Postgres (`content_hash`, `cnr`, `text_quality`,
 * `document_duplicate_members` membership from migration `0036`, and whether
 * `judgment_citations` holds any row for it — real edge or sentinel, either
 * one proves the citation pass ran). **No `full_text` is fetched** — this
 * never triggers the expensive full-corpus text scan `corpus-report-cli.ts`'s
 * own header warns against.
 *
 * C and D rows are reported, never deleted — the program's own instruction.
 * They remain part of the corpus and may be reprocessed later.
 */
import postgres from 'postgres';

import { classifyQuality } from './quality-buckets.ts';
import type { QualityBucket, QualityInput } from './quality-buckets.ts';
import { sslFor } from './db-ssl';

type Row = {
  id: string;
  court: string;
  content_hash: string | null;
  cnr: string | null;
  text_quality: string | null;
  has_citation: boolean;
  is_dup: boolean;
};

const PAGE_SIZE = 2000;

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 5, ssl: sslFor(url) });

  try {
    const counts: Record<QualityBucket, number> = { A: 0, B: 0, C: 0, D: 0 };
    const byCourtClass: Record<'Supreme Court' | 'High Court', Record<QualityBucket, number>> = {
      'Supreme Court': { A: 0, B: 0, C: 0, D: 0 },
      'High Court': { A: 0, B: 0, C: 0, D: 0 },
    };
    const reasonCounts = new Map<string, number>();
    let total = 0;
    let lastId = '00000000-0000-0000-0000-000000000000';

    for (;;) {
      const page = await sql<Row[]>`
        SELECT
          j.id, j.court, j.content_hash, j.cnr, j.text_quality::text AS text_quality,
          EXISTS (SELECT 1 FROM judgment_citations jc WHERE jc.citing_judgment_id = j.id) AS has_citation,
          EXISTS (SELECT 1 FROM document_duplicate_members ddm WHERE ddm.judgment_id = j.id) AS is_dup
        FROM judgments j
        WHERE j.id > ${lastId}
        ORDER BY j.id
        LIMIT ${PAGE_SIZE}`;
      if (page.length === 0) break;

      for (const r of page) {
        const input: QualityInput = {
          contentHash: r.content_hash,
          cnr: r.cnr,
          textQuality: r.text_quality === null ? null : Number(r.text_quality),
          hasCitationExtraction: r.has_citation,
          isExactDuplicate: r.is_dup,
        };
        const { bucket, reasons } = classifyQuality(input);
        counts[bucket] += 1;
        const courtClass = r.court === 'Supreme Court of India' ? 'Supreme Court' : 'High Court';
        byCourtClass[courtClass][bucket] += 1;
        for (const reason of reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
        total += 1;
      }

      lastId = page[page.length - 1]!.id;
    }

    console.log('CORPUS QUALITY BUCKETS');
    console.log('='.repeat(78));
    console.log(`total judgments classified: ${total.toLocaleString()}\n`);

    console.log(
      'Buckets (A research-ready · B usable with limitations · C poor extraction · D unusable/blocked):',
    );
    for (const b of ['A', 'B', 'C', 'D'] as const) {
      console.log(
        `  ${b}: ${counts[b].toLocaleString().padStart(7)}  (${((counts[b] / total) * 100).toFixed(1)}%)`,
      );
    }
    console.log('');

    console.log('By court class:');
    for (const [court, c] of Object.entries(byCourtClass)) {
      const courtTotal = c.A + c.B + c.C + c.D;
      console.log(
        `  ${court.padEnd(15)} n=${courtTotal.toLocaleString().padStart(7)}  ` +
          (['A', 'B', 'C', 'D'] as const)
            .map(
              (b) =>
                `${b}=${c[b].toLocaleString()} (${courtTotal > 0 ? ((c[b] / courtTotal) * 100).toFixed(1) : '0.0'}%)`,
            )
            .join('  '),
      );
    }
    console.log('');

    console.log('Reasons contributing to a non-A bucket (a row can carry more than one):');
    const sortedReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [reason, n] of sortedReasons) {
      console.log(`  ${reason.padEnd(45)} ${n.toLocaleString()}`);
    }

    const jsonPathIdx = process.argv.indexOf('--json');
    if (jsonPathIdx !== -1 && process.argv[jsonPathIdx + 1]) {
      const jsonPath = process.argv[jsonPathIdx + 1]!;
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        jsonPath,
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            total,
            buckets: counts,
            byCourtClass,
            reasons: Object.fromEntries(sortedReasons),
          },
          null,
          2,
        )}\n`,
      );
      console.log(`\nwrote ${jsonPath}`);
    }
  } finally {
    await sql.end();
  }
}

await main();
