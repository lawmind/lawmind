/**
 * `pnpm --filter @lawmind/harness arms` — Stage 10, the retrieval bake-off.
 *
 *   pnpm --filter @lawmind/harness arms              # all 283 queries
 *   ARMS_LIMIT=50 pnpm --filter @lawmind/harness arms
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ANSWERS THAT `ab` DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ab-cli.ts` measures ENHANCEMENTS on top of a fixed hybrid base — rerank,
 * graph, HyDE. It cannot vary the base itself, so the question *"is the dense
 * half earning its keep at all"* has never been answerable by measurement.
 * `RETRIEVAL_BENCHMARK_DESIGN.md` §3 named that as the single concrete
 * engineering gap; `hybridSearch`'s `mode` parameter closes it and this runs it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FULL 283, NOT THE CI SUBSET — AND WHY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ab-cli.ts`'s own header records the lesson: a reranker measured on too few
 * queries moved 24.0% → 28.0%, which was **one query changing its mind**. A
 * three-arm comparison repeating that would be worse, not better, because there
 * are more pairs to fool you.
 *
 * The gate deliberately runs 25 for CI speed and that set must not move. This
 * runs the whole eval set, and reports McNemar's exact p on each pair — the
 * same paired machinery `ab-cli.ts` already uses, for the same reason: both
 * arms see identical queries, so query difficulty cancels.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO HONESTY CONSTRAINTS ON HOW THE RESULT MAY BE WRITTEN UP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **1 · "lexical" here is Postgres `ts_rank`, and is NOT BM25.** Railway offers
 * no BM25 extension (`RETRIEVAL_BENCHMARK_DESIGN.md` §4). Calling a `ts_rank`
 * arm "BM25" in a write-up would be a claim about a system we did not run.
 *
 * **2 · The eval set is 283 queries and 283 of 283 gold judgments are Supreme
 * Court.** It is a regression set, not a final benchmark (`CURRENT_PLAN.md`
 * §A0). Whatever wins here has been shown to win **on Supreme Court retrieval**,
 * and nothing has been shown about the 40,980 High Court judgments we now hold.
 * Every number this prints carries that caveat and the summary says so out loud
 * rather than leaving it to whoever quotes it later.
 */
import { readFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import type { RetrievalMode } from '@lawmind/api/search/retrieve';
import postgres from 'postgres';

import { type HarnessQuery, type ScoredQuery, scoreQuery } from './retrieval.ts';
import { mcnemarExactP, queriesToSettle } from './stats.ts';

const ARMS: RetrievalMode[] = ['sparse', 'dense', 'hybrid'];

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}

const doc = JSON.parse(
  readFileSync(new URL('./fixtures/queries.eval.json', import.meta.url), 'utf8'),
) as { queries: HarnessQuery[] };
const limit = Number(process.env['ARMS_LIMIT'] ?? String(doc.queries.length));
const queries = doc.queries.slice(0, limit);

const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 4 });

/** The advocate reads five. A gold judgment at rank 6 counts for nothing. */
const successAt5 = (rows: ScoredQuery[]) =>
  rows.filter((r) => r.goldRanks.length > 0).length / rows.length;
/** Retrieved at ALL, however deep — a recall problem, not a ranking one. */
const recallAt20 = (rows: ScoredQuery[]) =>
  rows.filter((r) => r.foundAtAnyRank !== null).length / rows.length;
const mrr = (rows: ScoredQuery[]) =>
  rows.reduce((a, r) => a + (r.foundAtAnyRank ? 1 / r.foundAtAnyRank : 0), 0) / rows.length;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  try {
    const embedder = await getEmbedder();
    const embedQuery = async (text: string): Promise<string | null> => {
      const [e] = await embedder.embed([text]);
      return e ? toVectorLiteral(e.vector) : null;
    };

    console.log(`${queries.length} queries · arms: ${ARMS.join(', ')}\n`);

    const results = new Map<RetrievalMode, ScoredQuery[]>();
    for (const mode of ARMS) {
      const started = Date.now();
      const rows: ScoredQuery[] = [];
      for (const q of queries) {
        rows.push(await scoreQuery(sql, q, embedQuery, 20, undefined, false, undefined, mode));
      }
      results.set(mode, rows);
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      console.log(
        `${mode.padEnd(7)} success@5 ${pct(successAt5(rows))}  ` +
          `recall@20 ${pct(recallAt20(rows))}  MRR ${mrr(rows).toFixed(3)}  ${secs}s`,
      );
    }

    /**
     * Paired comparison, arm against arm.
     *
     * `gained`/`lost` count queries where exactly one arm put a gold judgment in
     * the top five — the discordant pairs, which are the only ones McNemar
     * uses. A pair where both arms succeeded or both failed carries no
     * information about which is better, and averaging over them is what makes
     * an unpaired comparison so much weaker.
     */
    console.log('\npaired, on success@5 — only discordant queries carry information');
    for (let i = 0; i < ARMS.length; i++) {
      for (let k = i + 1; k < ARMS.length; k++) {
        const a = ARMS[i]!;
        const b = ARMS[k]!;
        const ra = results.get(a)!;
        const rb = results.get(b)!;
        let gained = 0;
        let lost = 0;
        for (let n = 0; n < ra.length; n++) {
          const hitA = (ra[n]?.goldRanks.length ?? 0) > 0;
          const hitB = (rb[n]?.goldRanks.length ?? 0) > 0;
          if (hitB && !hitA) gained++;
          if (hitA && !hitB) lost++;
        }
        const p = mcnemarExactP(gained, lost);
        const settle = queriesToSettle(gained, lost, ra.length);
        console.log(
          `  ${b} vs ${a}: +${gained} / -${lost}` +
            (p === null ? '  (no discordant pairs)' : `  McNemar p=${p.toFixed(4)}`) +
            (settle === null ? '' : `  ~${settle} queries to settle`),
        );
      }
    }

    console.log(
      '\nCAVEATS, which belong with every number above:\n' +
        '  · "sparse" is Postgres ts_rank. It is NOT BM25 — Railway has no BM25\n' +
        '    extension, so no BM25 arm was run and none may be claimed.\n' +
        `  · ${queries.length} queries, and 283 of 283 gold judgments in this set are\n` +
        '    Supreme Court. Nothing here measures High Court retrieval, which is\n' +
        '    now 40,980 judgments of the corpus. Regression set, not a benchmark.',
    );
  } finally {
    await sql.end();
  }
}

await main();
