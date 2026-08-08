/**
 * `pnpm --filter @lawmind/harness ab <lever>` — does a retrieval change earn
 * its place?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS SEPARATELY FROM THE GATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The gate answers one question: is the product good enough to ship. It runs on
 * the 30 queries `SPRINT_2.md` fixes, and that set must not move.
 *
 * This answers a different one: did THIS change help. Thirty queries cannot
 * answer it. One additional hit on thirty queries is 3.3 percentage points, so
 * a real improvement of a few points and pure noise produce the same number —
 * and the first reranker measurement landed exactly there, 24.0% to 28.0%,
 * which was one query changing its mind. Shipping a model on that would be
 * shipping on a coin flip.
 *
 * So: 100 derived queries, both arms in one process against one corpus, and
 * **the paired difference reported with an interval**. Paired matters — the two
 * arms see identical queries, so query difficulty cancels and only the lever's
 * effect remains, which is a far tighter test than comparing two independent
 * averages.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A RESULT MEANS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The interval is a normal approximation on the paired differences. It is a
 * guide, not a p-value, and it is reported so a small delta is read as small
 * rather than as a win. **The standing rule from `docs/DATA_ADVANTAGE.md` §1d
 * is unchanged: if it does not move the number on our own corpus, it does not
 * ship.** An interval spanning zero is "did not move it".
 *
 *   pnpm --filter @lawmind/harness ab rerank
 *   pnpm --filter @lawmind/harness ab graph
 *   pnpm --filter @lawmind/harness ab both
 */
import { readFileSync } from 'node:fs';

import { getEmbedder, getReranker, toVectorLiteral } from '@lawmind/embed';
import postgres from 'postgres';

import { type HarnessQuery, type ScoredQuery, scoreQuery } from './retrieval.ts';

const lever = (process.argv[2] ?? 'rerank') as 'rerank' | 'graph' | 'both';
const limit = Number(process.env['AB_LIMIT'] ?? '100');

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}

const doc = JSON.parse(
  readFileSync(new URL('./fixtures/queries.eval.json', import.meta.url), 'utf8'),
) as { queries: HarnessQuery[] };
const queries = doc.queries.slice(0, limit);

const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 4 });

/** Share of queries whose gold answer reached the top five. */
function successAt5(rows: ScoredQuery[]): number {
  return rows.filter((r) => r.goldRanks.length > 0).length / rows.length;
}
function recallAt20(rows: ScoredQuery[]): number {
  return rows.filter((r) => r.foundAtAnyRank !== null).length / rows.length;
}
function mrr(rows: ScoredQuery[]): number {
  return rows.reduce((a, r) => a + (r.foundAtAnyRank ? 1 / r.foundAtAnyRank : 0), 0) / rows.length;
}

try {
  const embedder = await getEmbedder();
  const embedQuery = async (text: string): Promise<string | null> => {
    const [e] = await embedder.embed([text]);
    return e ? toVectorLiteral(e.vector) : null;
  };

  const wantsRerank = lever === 'rerank' || lever === 'both';
  const wantsGraph = lever === 'graph' || lever === 'both';
  const reranker = wantsRerank ? await getReranker() : null;

  console.log(`A/B: ${lever} · ${queries.length} queries · paired`);
  console.log('='.repeat(70));

  const control: ScoredQuery[] = [];
  const treatment: ScoredQuery[] = [];

  for (const [i, q] of queries.entries()) {
    // Both arms in the same iteration, so a corpus that changed mid-run would
    // affect both identically rather than showing up as a lever effect.
    control.push(await scoreQuery(sql, q, embedQuery));
    treatment.push(
      await scoreQuery(sql, q, embedQuery, 20, reranker ? reranker.score : undefined, wantsGraph),
    );
    if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/${queries.length}\r`);
  }

  /**
   * Paired difference on the per-query hit indicator, which is what success@5
   * averages. Its mean IS the change in success@5, and its spread is the thing
   * a single before/after pair of percentages cannot show you.
   */
  const diffs = queries.map(
    (_, i) =>
      (treatment[i]!.goldRanks.length > 0 ? 1 : 0) - (control[i]!.goldRanks.length > 0 ? 1 : 0),
  );
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(diffs.length - 1, 1);
  const stderr = Math.sqrt(variance / diffs.length);
  const lo = mean - 1.96 * stderr;
  const hi = mean + 1.96 * stderr;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log('');
  console.log(`  success@5   ${pct(successAt5(control))} → ${pct(successAt5(treatment))}`);
  console.log(`  recall@20   ${pct(recallAt20(control))} → ${pct(recallAt20(treatment))}`);
  console.log(`  MRR         ${mrr(control).toFixed(3)} → ${mrr(treatment).toFixed(3)}`);
  console.log('');
  console.log(`  paired delta on success@5: ${pct(mean)}  (95% interval ${pct(lo)} to ${pct(hi)})`);
  console.log(
    `  ${diffs.filter((d) => d > 0).length} queries gained · ` +
      `${diffs.filter((d) => d < 0).length} lost · ` +
      `${diffs.filter((d) => d === 0).length} unchanged`,
  );
  console.log('');
  console.log(
    lo > 0
      ? 'SHIPS: the interval excludes zero, so the gain is not noise.'
      : hi < 0
        ? 'DOES NOT SHIP: it makes retrieval measurably worse.'
        : 'DOES NOT SHIP: the interval spans zero — this did not move the number.',
  );
} finally {
  await sql.end();
}
