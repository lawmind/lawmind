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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONFOUND THAT WOULD HAVE MADE THE HEADLINE NUMBER A LIE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **The two arms do not search the same corpus.** Measured 11 Aug 2026:
 *
 *   sparse reaches      79,322 judgments   — everything, via `full_text_tsv`
 *   dense reaches       38,341 judgments   — only what is embedded
 *   High Court embedded          0 of 40,980
 *
 * Every gold judgment is Supreme Court. So sparse is handicapped by a haystack
 * more than twice the size, in which the extra 40,980 documents **can never be
 * the answer but can absolutely outrank one**, while dense searches a haystack
 * that contains nothing but candidates.
 *
 * The first run gave sparse 10.2% and dense 21.2% success@5. Reporting *"dense
 * is twice as good"* from that would have been a confident wrong number of
 * exactly the kind this program exists to prevent — most of the gap is haystack
 * size, not ranker quality.
 *
 * So this runs **two passes**, and both are real answers to different questions:
 *
 *   UNCONTROLLED  no filter — what the arms do in PRODUCTION today, where
 *                 sparse genuinely does search all 79,322
 *   CONTROLLED    `courts: ['sc']` — which RANKER is better, holding the
 *                 haystack constant at what dense can actually reach
 *
 * Neither is "the" answer and the write-up must carry both.
 */
import { readFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import type { RetrievalMode } from '@lawmind/api/search/retrieve';
import { openDb } from '@lawmind/ingest/db-host';
import type { Sql } from 'postgres';

import { expandCategories } from '@lawmind/api/search/court-category';
import type { SearchFilters } from '@lawmind/api/search/retrieve';

import { type HarnessQuery, type ScoredQuery, scoreQuery } from './retrieval.ts';
import { meanNdcgAtK } from './metrics.ts';
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

/**
 * `openDb` (LCC, bus 0169, `services/ingest/src/db-host.ts`) — root-fixes the
 * exact crash attempts 1 and 2 hit, rather than only retrying around it.
 * `connect_timeout` alone does not cover this: it governs establishing a
 * connection, and a DNS lookup that stalls never gets far enough to be
 * timed — confirmed in the driver's own source, not assumed. This machine's
 * only configured DNS server is the consumer router, which is intermittently
 * the thing failing, not Railway. `openDb` resolves the hostname itself
 * against Cloudflare/Google and hands postgres a direct address, taking the
 * OS resolver out of the path entirely; every failure path returns the
 * original url unchanged, so this cannot be worse than the previous
 * `postgres(url, ...)` call it replaces. `scoreQueryResilient`'s retry stays
 * — this closes the hole it was working around, not a reason to remove it.
 */
const sql = await openDb(url, 8);

/**
 * Bounded concurrency, not full-blast. Found live 13 Aug 2026: a fully
 * sequential pass under current five-lane load spent most of its wall time
 * waiting on the network, not the CPU — round-tripping one query at a time
 * to a proxy every other lane is also hitting. `CONCURRENCY` queries in
 * flight overlaps that wait without piling onto the shared proxy the way an
 * unbounded `Promise.all` over all 100 would. Order is preserved (`results[i]
 * = ...`) because paired McNemar needs each arm's row aligned to the same
 * query index as every other arm.
 */
const CONCURRENCY = 6;
async function scoreAllConcurrently(
  sql: Sql,
  queries: HarnessQuery[],
  embedQuery: (text: string) => Promise<string | null>,
  mode: RetrievalMode,
  filters: SearchFilters,
  onProgress: (done: number) => void,
): Promise<ScoredQuery[]> {
  const results: ScoredQuery[] = new Array(queries.length);
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= queries.length) return;
      results[i] = await scoreQueryResilient(
        sql,
        queries[i]!,
        embedQuery,
        20,
        undefined,
        false,
        undefined,
        mode,
        filters,
      );
      done++;
      onProgress(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queries.length) }, () => worker()));
  return results;
}

/**
 * Found live 13 Aug 2026: this run died on `hybrid 20/100` with an UNCAUGHT
 * `ENOTFOUND` — postgres.js throws it straight from query construction, not
 * as a catchable rejection `connect_timeout` can bound. NEW2 root-caused the
 * identical symptom on their own workers (bus 0159): a transient local DNS
 * hiccup resolving `hayabusa.proxy.rlwy.net`, not shared-proxy load — DNS
 * resolution happens before the TCP connect phase `connect_timeout` covers,
 * so it hung unprotected. Their fix retries the whole (resumable) run; this
 * loop has no checkpoint and paired McNemar needs every arm on the identical
 * query set, so retrying per-query is the correct analog here — it costs one
 * query's delay, not the ~90 minutes sparse+dense had already taken.
 */
function isTransientNetworkError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return (
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT'
  );
}

const MAX_QUERY_RETRIES = 5;
async function scoreQueryResilient(
  ...args: Parameters<typeof scoreQuery>
): ReturnType<typeof scoreQuery> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await scoreQuery(...args);
    } catch (error) {
      if (!isTransientNetworkError(error) || attempt >= MAX_QUERY_RETRIES) throw error;
      const delayMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      const code = (error as NodeJS.ErrnoException).code;
      console.error(
        `  transient network error (${code}), attempt ${attempt}/${MAX_QUERY_RETRIES} — retrying in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

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

    /**
     * LCC's finding (bus 0164): Document-Level Retrieval Mismatch is a named
     * failure mode that WORSENS as a corpus scales (arXiv 2510.06999), and
     * this corpus went 79k -> 761k+ across this session's own baselines.
     * Printed with every run so a before/after comparison states plainly
     * whether it is measuring the change or measuring growth — a number
     * with no row count next to it is a claim nobody downstream can check.
     */
    const corpusSizeRows = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgments`;
    const corpusSize = corpusSizeRows[0]!.n;
    console.log(`${queries.length} queries · arms: ${ARMS.join(', ')} · corpus: ${corpusSize} judgments\n`);

    /**
     * The controlled pass pins the haystack to what dense can actually reach.
     * Expanded through the same server-side mapping `POST /search` uses, so the
     * benchmark cannot drift from the product by hardcoding a court name.
     */
    const scCourts = await expandCategories(sql, ['sc']);
    const ALL_PASSES: { label: string; filters: SearchFilters; note: string }[] = [
      { label: 'UNCONTROLLED', filters: {}, note: 'no filter — the arms as production runs them' },
      {
        label: 'CONTROLLED',
        filters: { courts: scCourts },
        note: `courts=['sc'] — identical haystack for both arms (${scCourts.join(', ')})`,
      },
    ];
    /**
     * `ARMS_PASS=controlled` runs one pass only. A full three-arm sweep is ~35
     * minutes, so re-running a pass whose numbers are already recorded is 35
     * minutes of database load bought for nothing.
     */
    const want = (process.env['ARMS_PASS'] ?? 'both').toUpperCase();
    const PASSES = want === 'BOTH' ? ALL_PASSES : ALL_PASSES.filter((p) => p.label === want);
    if (PASSES.length === 0) {
      throw new Error(`ARMS_PASS must be uncontrolled, controlled or both — got ${want}`);
    }

    const results = new Map<string, ScoredQuery[]>();
    for (const pass of PASSES) {
      console.log(`\n── ${pass.label} · ${pass.note}`);
      for (const mode of ARMS) {
        const started = Date.now();
        // Progress every 20 done -- not a checkpoint, just visibility.
        // `failure-classifier-cli.ts` learned this the hard way this
        // session: a plain sequential loop against this same DB proxy under
        // five-lane load gave zero output for 30+ minutes and had to be
        // killed blind to find out it wasn't actually stuck. Paired McNemar
        // comparison needs every arm scored on the IDENTICAL query set, so
        // unlike that tool this one does not skip a slow query -- it only
        // reports that it is still working on one. `CONCURRENCY`-wide now
        // (see scoreAllConcurrently) rather than one at a time.
        let lastLogged = 0;
        const rows = await scoreAllConcurrently(sql, queries, embedQuery, mode, pass.filters, (done) => {
          if (done - lastLogged >= 20 || done === queries.length) {
            lastLogged = done;
            const elapsedSoFar = ((Date.now() - started) / 1000).toFixed(0);
            console.log(`  ... ${mode} ${done}/${queries.length} (${elapsedSoFar}s)`);
          }
        });
        results.set(`${pass.label}:${mode}`, rows);
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        const ranks = rows.map((r) => r.foundAtAnyRank);
        console.log(
          `${mode.padEnd(7)} success@5 ${pct(successAt5(rows))}  ` +
            `recall@20 ${pct(recallAt20(rows))}  MRR ${mrr(rows).toFixed(3)}  ` +
            `nDCG@5 ${meanNdcgAtK(ranks, 5).toFixed(3)}  nDCG@20 ${meanNdcgAtK(ranks, 20).toFixed(3)}  ${secs}s`,
        );
      }
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
    for (const pass of PASSES) {
      console.log(`\npaired within ${pass.label}, on success@5 — only discordant queries count`);
      for (let i = 0; i < ARMS.length; i++) {
        for (let k = i + 1; k < ARMS.length; k++) {
          const a = ARMS[i]!;
          const b = ARMS[k]!;
          const ra = results.get(`${pass.label}:${a}`)!;
          const rb = results.get(`${pass.label}:${b}`)!;
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
    }

    console.log(
      '\nCAVEATS, which belong with every number above:\n' +
        '  · "sparse" is Postgres ts_rank. It is NOT BM25 — Railway has no BM25\n' +
        '    extension, so no BM25 arm was run and none may be claimed.\n' +
        '  · THE ARMS DO NOT SEARCH THE SAME CORPUS unless controlled: sparse\n' +
        '    reaches all 79,322 judgments, dense only the 38,341 that carry an\n' +
        '    embedding (0 of 40,980 High Court). Read CONTROLLED for a ranker\n' +
        '    comparison; UNCONTROLLED measures production as it stands.\n' +
        `  · ${queries.length} queries, and 283 of 283 gold judgments in this set are\n` +
        '    Supreme Court. Nothing here measures High Court retrieval, which is\n' +
        '    now 40,980 judgments of the corpus. Regression set, not a benchmark.',
    );
  } finally {
    await sql.end();
  }
}

await main();
