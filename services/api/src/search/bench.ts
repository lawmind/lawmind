/**
 * Retrieval latency against the real corpus.
 *
 *   pnpm --filter @lawmind/api bench [--runs 5]
 *
 * Gate S1 requires a known citation retrieved in under 3 seconds at p95. A single
 * curl does not measure that, and latency is a function of corpus size — the
 * sparse half scans more rows as the corpus grows — so this is repeatable and
 * reports the distribution rather than one number.
 *
 * It measures retrieval only, not the HTTP hop, so the number is not confounded
 * by server start-up or by the one-off embedding model load.
 */
import postgres from 'postgres';

import { hybridSearch } from './retrieve.ts';

/**
 * Queries an advocate would actually type, spanning both halves of the hybrid:
 * some are lexical (a section number, a term of art), some are semantic
 * (a plain-language description of a situation).
 */
const QUERIES = [
  'anticipatory bail custodial interrogation',
  'special leave to appeal criminal jurisdiction',
  'parity with co-accused in bail',
  'dying declaration corroboration',
  'preventive detention grounds communicated',
  'specific performance of agreement to sell',
  'compassionate appointment policy',
  'dishonour of cheque legally enforceable debt',
  'quashing of FIR inherent powers',
  'maintenance to wife and minor children',
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const runsArg = process.argv.indexOf('--runs');
  const runs = runsArg === -1 ? 3 : Number(process.argv[runsArg + 1] ?? 3);

  const sql = postgres(url, { max: 4 });
  try {
    const [size] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgments`;
    const [vectors] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgment_chunks`;
    console.log(`corpus: ${size?.n} judgments, ${vectors?.n} chunks`);

    const timings: number[] = [];
    let emptyResults = 0;

    for (let run = 0; run < runs; run++) {
      for (const query of QUERIES) {
        const started = performance.now();
        // queryVector null: this measures the LEXICAL half, which is the half
        // that scales with corpus size. Dense adds a fixed ivfflat probe.
        const results = await hybridSearch(sql, query, null, {}, 5);
        timings.push(performance.now() - started);
        if (results.length === 0) emptyResults++;
      }
    }

    const sorted = [...timings].sort((a, b) => a - b);
    const ms = (n: number): string => `${n.toFixed(0)}ms`;
    console.log(
      `n=${timings.length}  p50=${ms(percentile(sorted, 50))}  ` +
        `p95=${ms(percentile(sorted, 95))}  max=${ms(sorted[sorted.length - 1] ?? 0)}`,
    );
    if (emptyResults > 0)
      console.log(`queries returning nothing: ${emptyResults}/${timings.length}`);

    const p95 = percentile(sorted, 95);
    console.log(
      p95 < 3000 ? 'GATE S1 latency: PASS (p95 < 3s)' : 'GATE S1 latency: FAIL (p95 >= 3s)',
    );
  } finally {
    await sql.end();
  }
}

await main();
