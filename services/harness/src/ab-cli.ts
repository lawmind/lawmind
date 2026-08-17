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
import { hydeText } from '@lawmind/api/search/hyde';
import postgres from 'postgres';

import { type HarnessQuery, type ScoredQuery, scoreQuery } from './retrieval.ts';
import { mcnemarExactP, queriesToSettle } from './stats.ts';
import { sslFor } from './db-url.ts';

const lever = (process.argv[2] ?? 'rerank') as 'rerank' | 'graph' | 'both' | 'hyde' | 'all';
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

const sql = postgres(url, { ssl: sslFor(url), max: 4 });

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

/**
 * Wrapped in a function rather than left as top-level await, because the fp32
 * run taught the difference.
 *
 * It died at query 80 of 100 — the ONNX session aborted, almost certainly out of
 * memory with a 2.2 GB cross-encoder alongside BGE-M3 — and the promise simply
 * never settled. Node exited 13 with "Detected unsettled top-level await" and no
 * mention of a model, which reads like a bug in this file. Two hours of compute
 * produced a message pointing at the wrong place.
 *
 * Inside a function, the same failure surfaces as the error it is.
 */
async function main(): Promise<void> {
  try {
    const embedder = await getEmbedder();
    const embedQuery = async (text: string): Promise<string | null> => {
      const [e] = await embedder.embed([text]);
      return e ? toVectorLiteral(e.vector) : null;
    };

    const wantsRerank = lever === 'rerank' || lever === 'both' || lever === 'all';
    const wantsGraph = lever === 'graph' || lever === 'both' || lever === 'all';
    const wantsHyde = lever === 'hyde' || lever === 'all';
    const reranker = wantsRerank ? await getReranker() : null;

    /**
     * HyDE, when asked for. **Counted, not assumed.**
     *
     * `hydeText` falls back to the raw query on any refusal, failure or stunted
     * completion — which is correct behaviour and a catastrophic thing to
     * measure silently: a run where every call refused would report "HyDE does
     * not help" while having never once run HyDE. The 512-token run already
     * taught this lesson in another form, where a key merely EXISTING made two
     * metrics report a pass.
     *
     * So the count is printed, and a run that generated nothing says so.
     */
    let hydeGenerated = 0;
    let hydeFellBack = 0;
    let hydeSkipped = 0;
    const hydeMs: number[] = [];
    const hyde = wantsHyde
      ? async (query: string): Promise<string> => {
          const started = Date.now();
          const r = await hydeText(sql, query, 'public');
          if (r.skipped) hydeSkipped++;
          else {
            hydeMs.push(Date.now() - started);
            if (r.generated) hydeGenerated++;
            else hydeFellBack++;
          }
          return r.text;
        }
      : undefined;

    /**
     * Latency, timed here because accuracy is only half the ship/no-ship
     * question and the other half has a hard number attached.
     *
     * Gate S1 budgets **3 seconds for the whole search request**, and
     * `services/api/src/index.ts` already caps query EMBEDDING at 2s because a
     * model that hangs is worse than one that throws. A cross-encoder scoring 20
     * candidates is twenty forward passes of a 568M-parameter model, on the
     * Railway CPU that serves the request — not on the GPU that embedded the
     * corpus.
     *
     * So a lever can be accurate and still not ship. Measuring this alongside the
     * gain is what stops that being discovered in production.
     */
    const rerankMs: number[] = [];
    const timedRerank = reranker
      ? async (q: string, passages: readonly string[]) => {
          const started = Date.now();
          try {
            return await reranker.score(q, passages);
          } finally {
            rerankMs.push(Date.now() - started);
          }
        }
      : undefined;

    console.log(`A/B: ${lever} · ${queries.length} queries · paired`);
    console.log('='.repeat(70));

    const control: ScoredQuery[] = [];
    const treatment: ScoredQuery[] = [];

    for (const [i, q] of queries.entries()) {
      // Both arms in the same iteration, so a corpus that changed mid-run would
      // affect both identically rather than showing up as a lever effect.
      control.push(await scoreQuery(sql, q, embedQuery));
      treatment.push(await scoreQuery(sql, q, embedQuery, 20, timedRerank, wantsGraph, hyde));
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

    const gained = diffs.filter((d) => d > 0).length;
    const lost = diffs.filter((d) => d < 0).length;
    const discordant = gained + lost;

    /**
     * **McNemar's exact test, which is the correct one for this data.**
     *
     * The normal-approximation interval above is kept because it states the
     * effect SIZE in the units the gate cares about. It is not the right
     * significance test, and the first real run showed why: 100 queries produced
     * 11 gains, 5 losses and **84 unchanged**. An approximation over 100
     * differences that are almost all zero is driven by 16 observations while
     * presenting itself as 100.
     *
     * `stats.ts` holds the arithmetic and a test checks it against a value
     * computed by hand. This is not a lower bar — on that run it gives p ≈ 0.21,
     * the same verdict, reached honestly.
     */
    const mcnemarP = mcnemarExactP(gained, lost);

    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    console.log('');
    console.log(`  success@5   ${pct(successAt5(control))} → ${pct(successAt5(treatment))}`);
    console.log(`  recall@20   ${pct(recallAt20(control))} → ${pct(recallAt20(treatment))}`);
    console.log(`  MRR         ${mrr(control).toFixed(3)} → ${mrr(treatment).toFixed(3)}`);
    console.log('');
    console.log(
      `  paired delta on success@5: ${pct(mean)}  (95% interval ${pct(lo)} to ${pct(hi)})`,
    );
    console.log(
      `  ${gained} queries gained · ${lost} lost · ` +
        `${diffs.length - discordant} unchanged (they carry no information)`,
    );
    console.log(
      `  McNemar exact, two-sided, on the ${discordant} discordant pairs: ` +
        `p = ${mcnemarP === null ? 'n/a' : mcnemarP.toFixed(3)}`,
    );

    /**
     * How many queries it would take to settle it, when it is not settled.
     *
     * Reported because "not significant" and "no effect" are different findings
     * and the difference is actionable: one says stop, the other says the run was
     * too small. Rough — a normal-approximation sample size for a paired binary
     * test at 80% power, using the discordance observed here.
     */
    if (mcnemarP !== null && mcnemarP > 0.05) {
      /**
       * "Not significant" and "no effect" are different findings, and only one
       * of them means stop. This says which.
       */
      const need = queriesToSettle(gained, lost, diffs.length);
      if (need !== null) {
        console.log(
          `  not settled. At this effect size ~${need} queries would settle it ` +
            `(this run: ${diffs.length}).`,
        );
      }
    }

    if (rerankMs.length > 0) {
      const sorted = [...rerankMs].sort((a, b) => a - b);
      const mean = rerankMs.reduce((a, b) => a + b, 0) / rerankMs.length;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
      console.log('');
      console.log(
        `  rerank latency: mean ${mean.toFixed(0)}ms · p95 ${p95}ms · ` +
          `${rerankMs.length} calls, 20 candidates each`,
      );
      console.log(
        p95 > 3000
          ? '  BUDGET BREACHED: Gate S1 allows 3s for the WHOLE search request. ' +
              'Accuracy is moot until this fits — a GPU endpoint or a smaller ' +
              'cross-encoder, measured again.'
          : '  Within the 3s Gate S1 request budget, on this machine.',
      );
    }
    /**
     * **Did the lever actually run.** `hydeText` falls back to the raw query on
     * every refusal and every failure, which is right for production and lethal
     * for measurement: a run in which nothing generated is indistinguishable, in
     * the numbers alone, from a run in which HyDE simply did not help.
     */
    if (wantsHyde) {
      const total = hydeGenerated + hydeFellBack;
      console.log('');
      console.log(
        `  HyDE: generated ${hydeGenerated}/${total} · fell back ${hydeFellBack} · ` +
          `skipped by query shape ${hydeSkipped}`,
      );
      if (hydeMs.length > 0) {
        const s = [...hydeMs].sort((a, b) => a - b);
        const m = hydeMs.reduce((a, b) => a + b, 0) / hydeMs.length;
        const p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]!;
        console.log(`  HyDE latency: mean ${m.toFixed(0)}ms · p95 ${p95}ms, on attempted calls`);
        console.log(
          p95 > 3000
            ? '  BUDGET BREACHED on the attempted path. Gate S1 allows 3s for the WHOLE request — ' +
                'this is generation alone, before retrieval or reranking.'
            : '  Within the 3s Gate S1 request budget, before retrieval.',
        );
      }
      if (hydeGenerated === 0) {
        console.log(
          '  NOT MEASURED: every call fell back, so the treatment arm was the control arm. ' +
            'This is not evidence about HyDE.',
        );
      } else if (hydeFellBack > total * 0.1) {
        console.log(
          `  CAUTION: ${((hydeFellBack / total) * 100).toFixed(0)}% fell back, so the measured ` +
            'effect is diluted — the true effect is larger in either direction.',
        );
      }
    }

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
}

try {
  await main();
} catch (error) {
  console.error('');
  console.error('the A/B run FAILED — no verdict, and no partial verdict either.');
  console.error(
    'A run that stopped early is not a smaller run: the queries it did not reach ' +
      'are not a random sample of the set, so the numbers from the ones it did ' +
      'reach cannot be reported as a result.',
  );
  console.error('');
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
