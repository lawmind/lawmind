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
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import type { RetrievalMode } from '@lawmind/api/search/retrieve';
import { openDb } from '@lawmind/ingest/db-host';
import {
  MAX_TRANSIENT_RETRIES,
  isTransientDbOrNetworkError,
  transientBackoffMs,
} from '@lawmind/ingest/db-transient';
import type { Sql } from 'postgres';

import { categoryOf } from '@lawmind/api/search/court-category';
import type { SearchFilters } from '@lawmind/api/search/retrieve';

import { type HarnessQuery, type ScoredQuery, scoreQuery } from './retrieval.ts';
import { meanNdcgAtK } from './metrics.ts';
import { mcnemarExactP, queriesToSettle } from './stats.ts';

/**
 * Which arms to run. All three by default; `ARMS_MODES=dense` runs one.
 *
 * Added 18 Aug 2026 because the arms now cost wildly different amounts and a
 * three-arm run is priced by its slowest. Measured that day: the dense arm is
 * an HNSW probe at ~10 ms, while the sparse arm's OR'd tsquery matches 4.5-25.3%
 * of a 9.3M-row corpus (planner estimate over 8 eval queries) and `ts_rank` must
 * read the tsvector of every matching row — three sparse queries did not finish
 * in fifteen minutes under ingest load. Coupling them means the arm that CAN be
 * measured cleanly today does not get measured at all.
 *
 * Paired McNemar still requires arms scored on the identical query set, so this
 * selects which arms RUN, never which queries they see, and the per-row
 * checkpoint keys on the arm — a later `ARMS_MODES=sparse,hybrid` fills the same
 * checkpoint and the pairing is recovered offline.
 */
const ALL_ARMS: RetrievalMode[] = ['sparse', 'dense', 'hybrid'];
const ARMS: RetrievalMode[] = (process.env['ARMS_MODES'] ?? ALL_ARMS.join(','))
  .split(',')
  .map((m) => m.trim().toLowerCase())
  .filter((m) => m.length > 0)
  .map((m) => {
    if (!ALL_ARMS.includes(m as RetrievalMode)) {
      throw new Error(`ARMS_MODES: unknown arm "${m}" — expected some of ${ALL_ARMS.join(', ')}`);
    }
    return m as RetrievalMode;
  });

/**
 * The corpus's distinct court names, then classified by the SERVER'S OWN
 * `categoryOf` — so the benchmark still cannot drift from `POST /search` by
 * hardcoding a court name, which is why this used `expandCategories` before.
 *
 * What changed is the ENUMERATION, not the classification. `expandCategories`
 * issues `SELECT DISTINCT court FROM judgments`, and Postgres has no index skip
 * scan for `DISTINCT` on a single column: the plan is a full parallel
 * index-only scan of `judgments_court_idx`. That was 19 rows over 79,322
 * judgments when the comment on it was written. Measured 18 Aug 2026 against
 * 9,041,159 judgments under ingest load it had **not returned after 10 minutes**,
 * and it runs once per arms pass before a single query is scored.
 *
 * The recursive form below is the standard loose index scan: one index descent
 * per distinct value instead of one scan of every entry. Same 26 courts,
 * measured **716 ms cold / 1 ms warm** on the same box in the same window.
 *
 * `expandCategories` itself is on the `POST /search` path and has the same
 * problem there. That is LCC's module, so this fixes the harness only and the
 * finding goes to them rather than being silently worked around here.
 */
async function courtsInCategory(sql: Sql, category: 'sc' | 'hc'): Promise<string[]> {
  const rows = await sql<{ court: string }[]>`
    WITH RECURSIVE t AS (
      (SELECT court FROM judgments ORDER BY court LIMIT 1)
      UNION ALL
      SELECT (SELECT j.court FROM judgments j WHERE j.court > t.court ORDER BY j.court LIMIT 1)
        FROM t WHERE t.court IS NOT NULL
    )
    SELECT court FROM t WHERE court IS NOT NULL`;
  return rows.map((r) => r.court).filter((c) => categoryOf(c) === category);
}

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
 * Per-row JSONL checkpoint. Added 14 Aug 2026 after the full 283-query
 * CONTROLLED run died to the "unsettled top-level await" shutdown quirk
 * (the same benign Node/postgres shutdown interaction Q1.31 and Q1.45 both
 * hit) at dense 260/283 with nothing to resume from — every other
 * long-running tool in this harness checkpoints (`experiment-citation-
 * strip-cli.ts`, `failure-classifier-cli.ts`), this one did not, and that
 * gap is why 3417s of sparse plus 1903s of dense were lost outright rather
 * than resumed. One line per (pass, mode, index) row; a restart skips
 * whatever is already on disk instead of re-running it blind.
 */
const CHECKPOINT_PATH = new URL('../../../arms-checkpoint.jsonl', import.meta.url);
type CheckpointLine = { pass: string; mode: RetrievalMode; index: number; row: ScoredQuery };
const checkpoint = new Map<string, ScoredQuery>();
if (existsSync(CHECKPOINT_PATH)) {
  for (const line of readFileSync(CHECKPOINT_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const c = JSON.parse(line) as CheckpointLine;
    checkpoint.set(`${c.pass}:${c.mode}:${c.index}`, c.row);
  }
  console.log(`${checkpoint.size} rows already checkpointed at ${CHECKPOINT_PATH.pathname}\n`);
}

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
/**
 * `ARMS_CONCURRENCY` overrides, added 18 Aug 2026. Six is right for the dense
 * arm — an HNSW probe that spends its time waiting. It is wrong for the sparse
 * arm, which reads the tsvector of hundreds of thousands of rows per query and
 * competes for IO with an ingest fleet writing ~450k rows/hr; six of those in
 * flight is six sequential-ish scans against one disk, and it slows the fleet
 * as well as itself.
 */
const CONCURRENCY = Number(process.env['ARMS_CONCURRENCY'] ?? 6);
async function scoreAllConcurrently(
  sql: Sql,
  queries: HarnessQuery[],
  embedQuery: (text: string) => Promise<string | null>,
  mode: RetrievalMode,
  filters: SearchFilters,
  onProgress: (done: number) => void,
  passLabel: string,
): Promise<ScoredQuery[]> {
  const results: ScoredQuery[] = new Array(queries.length);
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= queries.length) return;
      const key = `${passLabel}:${mode}:${i}`;
      const cached = checkpoint.get(key);
      if (cached) {
        results[i] = cached;
      } else {
        const row = await scoreQueryResilient(
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
        results[i] = row;
        appendFileSync(
          CHECKPOINT_PATH,
          JSON.stringify({ pass: passLabel, mode, index: i, row } satisfies CheckpointLine) + '\n',
        );
      }
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
 * hiccup, and DNS resolution happens before the TCP connect phase
 * `connect_timeout` covers. Retrying per-query is the correct analog here
 * because paired McNemar needs every arm on the identical query set.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 18 AUG 2026 — THE LOCAL CLASSIFIER HAD THE HOLE NEW2 PREDICTED IT WOULD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It matched Node **errno** strings only. A `PostgresError` carries a
 * **SQLSTATE** in that same `.code` field, so `57P03` ("the database system is
 * not yet accepting connections") fell straight through to `throw`. NEW2 warned
 * in bus 0672 that this harness probably shared the hole their whole ingest
 * fleet died to; it did, and it was observed rather than inferred — the
 * postmaster restarted at 03:59:56Z and the sparse pass exited with **zero**
 * rows written and nothing in the log but the unsettled-top-level-await
 * warning.
 *
 * So this no longer keeps its own copy. `services/ingest/src/db-transient.ts`
 * is the single place that answers "is this worth waiting out", written after
 * the same judgement was found duplicated seven times and wrong in one of them;
 * an eighth copy in the harness is the thing that module exists to prevent. Its
 * budget is also better founded than the one here was — 210 s against 60 s,
 * sized on this cluster's one measured 150.9 s recovery.
 *
 * The only local change was exporting it: `services/ingest/package.json` gained
 * `"./db-transient"`. That is a one-line manifest addition in NEW2's lane, it
 * cannot alter their behaviour, and it is flagged to them rather than done
 * quietly.
 */
const MAX_QUERY_RETRIES = MAX_TRANSIENT_RETRIES;
async function scoreQueryResilient(
  ...args: Parameters<typeof scoreQuery>
): ReturnType<typeof scoreQuery> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await scoreQuery(...args);
    } catch (error) {
      if (!isTransientDbOrNetworkError(error) || attempt >= MAX_QUERY_RETRIES) throw error;
      const delayMs = transientBackoffMs(attempt);
      const code = (error as NodeJS.ErrnoException).code ?? 'no-code';
      console.error(
        `  transient failure (${code}), attempt ${attempt}/${MAX_QUERY_RETRIES} — retrying in ${delayMs}ms`,
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
    /**
     * `reltuples` first, `count(*)` only as a fallback. Measured 18 Aug 2026:
     * `count(*)` on a 9.5M-row `judgments` under ingest load took over five
     * minutes, once per run, for a line that exists purely as provenance —
     * NEW2 hit the same wall from the other side (bus 0666) and reached the
     * same conclusion. An estimate LABELLED as an estimate satisfies what this
     * line is for; an unlabelled one would not.
     *
     * The fallback is not defensive padding. `reltuples` is -1 on a table that
     * has never been analysed and reads 0 on this cluster after a crash before
     * autovacuum catches up, and a run that silently reports "corpus: 0" is a
     * run whose provenance line is worse than useless.
     */
    const estRows = await sql<{ n: number }[]>`
      SELECT reltuples::bigint::int AS n FROM pg_class WHERE relname = 'judgments'`;
    const estimate = estRows[0]?.n ?? 0;
    const corpusSize =
      estimate > 0
        ? estimate
        : (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgments`)[0]!.n;
    const corpusHow = estimate > 0 ? 'reltuples estimate' : 'exact count(*)';
    console.log(
      `${queries.length} queries · arms: ${ARMS.join(', ')} · corpus: ${corpusSize} judgments (${corpusHow})
`,
    );

    /**
     * The controlled pass pins the haystack to what dense can actually reach.
     * Expanded through the same server-side mapping `POST /search` uses, so the
     * benchmark cannot drift from the product by hardcoding a court name.
     */
    const scCourts = await courtsInCategory(sql, 'sc');
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
        // Progress logged every 20 done for visibility (`failure-classifier-
        // cli.ts` learned this the hard way this session: a plain
        // sequential loop against this same DB proxy under five-lane load
        // gave zero output for 30+ minutes and had to be killed blind to
        // find out it wasn't actually stuck) -- and now ALSO a real
        // per-row checkpoint (see CHECKPOINT_PATH above), added after this
        // exact pass died with nothing to resume from. Paired McNemar
        // comparison needs every arm scored on the IDENTICAL query set, so
        // unlike the classifier this one does not skip a slow query -- it
        // only reports that it is still working on one. `CONCURRENCY`-wide
        // now (see scoreAllConcurrently) rather than one at a time.
        let lastLogged = 0;
        const rows = await scoreAllConcurrently(
          sql,
          queries,
          embedQuery,
          mode,
          pass.filters,
          (done) => {
            if (done - lastLogged >= 20 || done === queries.length) {
              lastLogged = done;
              const elapsedSoFar = ((Date.now() - started) / 1000).toFixed(0);
              console.log(`  ... ${mode} ${done}/${queries.length} (${elapsedSoFar}s)`);
            }
          },
          pass.label,
        );
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
