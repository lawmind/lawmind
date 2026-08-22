/**
 * NEW1 — run LAUNCH_BENCHMARK_V1 through the REAL production path.
 *
 *   pnpm --filter @lawmind/harness launch:bench [--classes citation,case_title]
 *
 * WHAT "PRODUCTION PATH" MEANS HERE, EXACTLY
 * ------------------------------------------
 * `createApp(...).request('/search', …)` — the Hono app the service actually
 * serves, exercised in-process. That is deliberately NOT the same as calling
 * `hybridSearch` directly, and the difference is not cosmetic:
 *
 *   validate('json', searchRequest)   the 500-char cap, which rejects 97.8% of
 *                                     one gold set before any retrieval happens
 *   answerStructured(...)             the qlang / exact-identity gate, which
 *                                     answers citation and title queries and
 *                                     RETURNS BEFORE `hybridSearch` is reached
 *   deps.embedQuery(...)              the dense arm's input, under its 2s budget
 *   hybridSearch(...)                 fused sparse + dense, with pinning
 *
 * `production-route-benchmark.ts` called `hybridSearch(sql, query, null, …)`.
 * Passing `null` for the vector means **its dense arm never ran** — every number
 * in that file is sparse-plus-pinning only. It also skipped `answerStructured`
 * entirely, so it could not see the exact-identity path that owns two of the
 * seven launch classes. Neither is a defect in that file for the question it was
 * built to answer; both make it the wrong instrument for a launch gate.
 *
 * NOTHING RUNS UNBOUNDED
 * ----------------------
 * P4 is a standing constraint, not advice: a 900-character verbatim passage kept
 * the sparse arm alive for 32 minutes. Three independent bounds apply here, and
 * a query that trips any of them is RECORDED AS A TIMEOUT WITH ITS DURATION
 * rather than allowed to consume the run:
 *
 *   statement_timeout   per SQL statement, at the connection
 *   per-query wall      Promise.race around the whole request
 *   run budget          the walk keeps the GPU busy; this must not become the
 *                       thing that starves it
 *
 * A timeout is a product outcome, not a missing measurement. An advocate whose
 * search takes 32 minutes has had a failure, and it belongs in the numbers.
 *
 * THE FAILURE CASCADE (P2), AND WHY IT IS ORDERED
 * -----------------------------------------------
 * Every failure gets exactly ONE reason, assigned by the first rule that fires.
 * The order is not arbitrary — it runs from "nobody could have found this" to
 * "we had everything and still got it wrong", so the reason always names the
 * EARLIEST broken link and therefore the lane that owns the fix:
 *
 *   AUTHORITY_NOT_HELD   the corpus does not contain it        -> NEW3
 *   TEXT_UNSAFE          held, but the text is proven damaged  -> NEW2
 *   NOT_ELIGIBLE         held and readable, contract refuses   -> LCC
 *   NOT_EMBEDDED         eligible, no vector in the searched   -> NEW1 (walk)
 *                        index
 *   RETRIEVAL_MISS       embedded, never entered the candidate -> NEW1 (recall)
 *                        pool
 *   BADLY_RANKED         in the pool, below the cut            -> NEW1 (ranking)
 *   CURRENTNESS_FAIL     found and ranked, but unsafe about    -> LCC + NEW1
 *                        law that has moved
 *
 * Getting this wrong in either direction is expensive in a specific way: calling
 * a ranking problem "missing data" sends the acquisition lane after documents
 * that are already on disk, and calling a missing document "badly ranked" sends
 * this lane tuning a ranker over an empty set.
 *
 * NOT_EMBEDDED IS SKIPPED FOR THE EXACT CLASSES, ON PURPOSE
 * ---------------------------------------------------------
 * A citation lookup resolves through `judgment_citation_aliases` and needs no
 * vector at all. Charging a citation failure to "not embedded" would be a true
 * statement about the row and a false statement about the failure.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { getEmbedder, toVectorLiteral } from '@lawmind/embed';

import { createApp } from '@lawmind/api/app';
import { buildLaunchGold, EXACT_ROUTE_CLASSES, type LaunchClass, type LaunchGoldRow } from './launch-gold.ts';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));

const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/launch-benchmark-v1.json');
/**
 * Checkpointed after EVERY query, not at the end.
 *
 * 160 of 283 queries were lost once to a teardown because the write was at the
 * end of the run. A benchmark that only exists if it finishes is a benchmark
 * that mostly does not exist.
 */
const CKPT = abs(process.env['CKPT'] ?? 'docs/ai/new1-tier-a/launch-benchmark-v1.checkpoint.jsonl');

const PER_QUERY_MS = Number(process.env['PER_QUERY_MS'] ?? 30_000);
const STATEMENT_MS = Number(process.env['STATEMENT_MS'] ?? 25_000);
const TOP_K = Number(process.env['TOP_K'] ?? 20);
const EMBED_TIMEOUT_MS = Number(process.env['EMBED_TIMEOUT_MS'] ?? 2_000);

export type FailureReason =
  | 'AUTHORITY_NOT_HELD'
  | 'TEXT_UNSAFE'
  | 'NOT_ELIGIBLE'
  | 'NOT_EMBEDDED'
  | 'RETRIEVAL_MISS'
  | 'BADLY_RANKED'
  | 'CURRENTNESS_FAIL'
  | 'QUERY_REJECTED'
  | 'TIMEOUT';

/** Everything the cascade needs about one gold authority, read from the DB. */
export type AuthorityState = {
  held: boolean;
  textSafety: string | null;
  semanticTier: string | null;
  axisAIdentity: boolean | null;
  textQuality: number | null;
  /** A vector in the index PRODUCTION searches (`judgment_chunks`). */
  embeddedForProduction: boolean;
  /** A vector in NEW1's Tier-A stage, which production cannot see today. */
  embeddedInTierAStage: boolean;
  overruledStatus: string | null;
};

/**
 * Assign exactly one reason. Pure, so it is testable without a database.
 *
 * `rank === null` after every data check has passed means the authority was
 * available and the search did not return it. Distinguishing RETRIEVAL_MISS from
 * BADLY_RANKED needs the candidate pool, which the HTTP surface does not expose
 * — so a hit outside TOP_K is BADLY_RANKED, and no hit at all is RETRIEVAL_MISS.
 * That is a slight over-count of RETRIEVAL_MISS at exactly one boundary and it
 * is stated here rather than hidden behind the label.
 */
export function classifyFailure(input: {
  launchClass: LaunchClass;
  rank: number | null;
  timedOut: boolean;
  rejected: boolean;
  state: AuthorityState;
  currentnessUnsafe: boolean;
}): FailureReason | null {
  if (input.rejected) return 'QUERY_REJECTED';
  if (input.timedOut) return 'TIMEOUT';
  if (input.currentnessUnsafe) return 'CURRENTNESS_FAIL';
  if (input.rank !== null && input.rank <= TOP_K) return null;

  const s = input.state;
  if (!s.held) return 'AUTHORITY_NOT_HELD';
  /**
   * TEXT_UNSAFE fires only where the BODY TEXT is the route to the document.
   *
   * NEW2's `judgment_quality_contract` (migration 0072, bus 1005) splits
   * `body_text_safe` from `metadata_discoverable` and asks explicitly that the
   * two not be collapsed. They are right, and the first cut of this cascade got
   * it wrong: it charged every failure on a damaged document to TEXT_UNSAFE
   * whatever the query was.
   *
   * A glyph-dumped judgment is still perfectly findable by its citation and by
   * its case name, because `neutral_citation`, `case_title` and
   * `judgment_citation_aliases` do not come from the body. Blaming a citation
   * miss on body damage would send NEW2 to OCR a document whose identity fields
   * were never damaged — a true statement about the row and a false one about
   * the failure, which is exactly what this cascade exists to prevent.
   */
  if (s.textSafety === 'UNSAFE_VERIFIED' && !EXACT_ROUTE_CLASSES.includes(input.launchClass)) return 'TEXT_UNSAFE';
  if (s.semanticTier === 'NOT_ELIGIBLE' || s.semanticTier === 'UNRESOLVED_EXPERIMENTAL') return 'NOT_ELIGIBLE';
  // An exact-identity route needs no vector, so absence of one cannot be the
  // reason a citation or a title failed.
  if (!EXACT_ROUTE_CLASSES.includes(input.launchClass) && !s.embeddedForProduction) return 'NOT_EMBEDDED';
  if (input.rank === null) return 'RETRIEVAL_MISS';
  return 'BADLY_RANKED';
}

type ResultRow = {
  queryId: string;
  launchClass: LaunchClass;
  goldAuthorityId: string;
  queryChars: number;
  httpStatus: number;
  rank: number | null;
  returned: number;
  ms: number;
  timedOut: boolean;
  failureReason: FailureReason | null;
  /**
   * What the product actually put at rank 1.
   *
   * Recorded because the instrument could not otherwise see its own
   * highest-severity failure. An exact-identity route that PINS THE WRONG
   * JUDGMENT is far worse for an advocate than one that finds nothing: a miss
   * sends them to look elsewhere, and a confident wrong pin sends them into
   * court with the wrong case. Scoring only the gold's rank makes those two
   * outcomes the same number.
   *
   * Null when nothing came back. `wrongPin` is deliberately narrow — it means
   * an EXACT-ROUTE class returned something at rank 1 that is not the gold,
   * which is the only place the product claims certainty rather than relevance.
   */
  topHitId?: string | null;
  wrongPin: boolean;
  /** Present when the law has moved on the gold authority. */
  goldOverruledStatus: string | null;
  currentnessUnsafe: boolean;
};

const quantile = (xs: number[], q: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const pct = (a: number, b: number): number | null => (b === 0 ? null : Number(((100 * a) / b).toFixed(2)));

/**
 * Read the state of every gold authority in one pass.
 *
 * By primary key, in chunks — not a scan. The eligibility view is joined rather
 * than re-derived, because a private copy of the contract is exactly the drift
 * the walk's own hash guard exists to prevent.
 */
async function loadAuthorityStates(
  sql: postgres.Sql,
  ids: string[],
): Promise<Map<string, AuthorityState>> {
  const out = new Map<string, AuthorityState>();
  const CHUNK = 250;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const rows = await sql<
      {
        id: string;
        text_safety: string | null;
        semantic_tier: string | null;
        axis_a_identity: boolean | null;
        text_quality: string | null;
        overruled_status: string | null;
        has_chunk: boolean;
        in_stage: boolean;
      }[]
    >`
      SELECT j.id,
             e.text_safety,
             e.semantic_tier,
             e.axis_a_identity,
             e.text_quality::text AS text_quality,
             j.overruled_status,
             EXISTS (SELECT 1 FROM judgment_chunks c WHERE c.judgment_id = j.id) AS has_chunk,
             EXISTS (SELECT 1 FROM new1_doc_vector_stage s WHERE s.judgment_id = j.id) AS in_stage
      FROM judgments j
      LEFT JOIN judgment_embedding_eligibility e ON e.id = j.id
      WHERE j.id = ANY(${slice}::uuid[])
    `;
    for (const r of rows) {
      out.set(r.id, {
        held: true,
        textSafety: r.text_safety,
        semanticTier: r.semantic_tier,
        axisAIdentity: r.axis_a_identity,
        textQuality: r.text_quality === null ? null : Number(r.text_quality),
        embeddedForProduction: r.has_chunk,
        embeddedInTierAStage: r.in_stage,
        overruledStatus: r.overruled_status,
      });
    }
  }
  for (const id of ids) {
    if (!out.has(id)) {
      out.set(id, {
        held: false,
        textSafety: null,
        semanticTier: null,
        axisAIdentity: null,
        textQuality: null,
        embeddedForProduction: false,
        embeddedInTierAStage: false,
        overruledStatus: null,
      });
    }
  }
  return out;
}

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const gold = buildLaunchGold();
  const wanted = (process.env['CLASSES'] ?? '').split(',').filter(Boolean);
  const rows0 = wanted.length > 0 ? gold.rows.filter((r) => wanted.includes(r.launchClass)) : gold.rows;

  console.log(`LAUNCH_BENCHMARK_V1  frozenHash=${gold.frozenHash}`);
  console.log(`  classes: ${JSON.stringify(gold.byClass)}`);
  console.log(`  running ${rows0.length} of ${gold.rows.length} rows`);
  console.log(`  bounds: per-query ${PER_QUERY_MS}ms · statement ${STATEMENT_MS}ms · topK ${TOP_K}`);

  const sql = postgres(url, {
    max: 4,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: STATEMENT_MS },
  });

  // Resume: a checkpointed query is never re-run. The benchmark is fixed, so a
  // partial file plus the rest is the same measurement as one clean pass.
  const done = new Set<string>();
  const results: ResultRow[] = [];
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as ResultRow & { frozenHash?: string };
        if (r.frozenHash && r.frozenHash !== gold.frozenHash) continue;
        done.add(r.queryId);
        results.push(r);
      } catch {
        // A truncated last line from a killed run is expected; skip it.
      }
    }
    if (done.size > 0) console.log(`  resuming: ${done.size} already measured`);
  }
  mkdirSync(dirname(CKPT), { recursive: true });

  const states = await loadAuthorityStates(sql, [...new Set(rows0.map((r) => r.goldAuthorityId))]);

  /**
   * The SAME embedQuery contract production uses: a hard 2s budget, and null
   * (lexical-only) rather than a hang when it is exceeded. Copying the budget
   * matters — measuring dense recall with an unlimited embedder would report a
   * quality the product never delivers.
   */
  const embedQuery = async (text: string): Promise<string | null> => {
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), EMBED_TIMEOUT_MS);
    });
    try {
      const embed = (async (): Promise<string | null> => {
        const embedder = await getEmbedder();
        const [embedded] = await embedder.embed([text]);
        return embedded ? toVectorLiteral(embedded.vector) : null;
      })();
      return await Promise.race([embed, budget]);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const app = createApp({ ping: async () => void (await sql`SELECT 1`), search: { sql, embedQuery } });

  // Warm the embedder once, OUTSIDE the measured loop. Production warms on boot
  // (index.ts), so charging the first query for a model load would report a
  // latency no advocate ever sees.
  const warmStart = Date.now();
  await embedQuery('warm');
  console.log(`  embedder warm in ${Date.now() - warmStart}ms`);

  const run = async (g: LaunchGoldRow): Promise<ResultRow> => {
    const state = states.get(g.goldAuthorityId)!;
    const t = Date.now();
    let httpStatus = 0;
    let rank: number | null = null;
    let returned = 0;
    let topHitId: string | null = null;
    let timedOut = false;
    let currentnessUnsafe = false;

    const request = (async (): Promise<void> => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: g.query, language: 'en' }),
      });
      httpStatus = res.status;
      if (res.status !== 200) return;
      const body = (await res.json()) as { data?: { results?: Record<string, unknown>[] } };
      const hits = body.data?.results ?? [];
      returned = hits.length;
      const at = hits.findIndex((h) => h['judgmentId'] === g.goldAuthorityId);
      rank = at === -1 ? null : at + 1;
      topHitId = hits.length > 0 ? String(hits[0]?.['judgmentId'] ?? '') || null : null;

      /**
       * CURRENTNESS, checked on what was actually returned rather than on the
       * gold row. `overruled_status` is never cached (CLAUDE.md), so the only
       * honest test is whether the RESPONSE carries the live value. A result
       * whose stored status has moved and whose payload says `none` is the
       * stale-overruled failure with a zero threshold.
       */
      for (const h of hits) {
        const id = String(h['judgmentId'] ?? '');
        const s = states.get(id);
        if (!s?.overruledStatus || s.overruledStatus === 'none') continue;
        if (String(h['overruledStatus'] ?? 'none') === 'none') currentnessUnsafe = true;
      }
    })();

    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, PER_QUERY_MS);
    });
    try {
      await Promise.race([request, budget]);
    } catch {
      httpStatus = httpStatus || 500;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const ms = Date.now() - t;
    const failureReason = classifyFailure({
      launchClass: g.launchClass,
      rank,
      timedOut,
      rejected: httpStatus === 400 || httpStatus === 422,
      state,
      currentnessUnsafe,
    });

    return {
      queryId: g.queryId,
      launchClass: g.launchClass,
      goldAuthorityId: g.goldAuthorityId,
      queryChars: g.query.length,
      httpStatus,
      rank,
      returned,
      ms,
      timedOut,
      failureReason,
      topHitId,
      // Only the exact classes can "pin". For a ranked class a non-gold first
      // result is an ordinary ranking outcome, not a false claim of identity.
      wrongPin: EXACT_ROUTE_CLASSES.includes(g.launchClass) && topHitId !== null && topHitId !== g.goldAuthorityId,
      goldOverruledStatus: state.overruledStatus,
      currentnessUnsafe,
    };
  };

  try {
    let i = 0;
    for (const g of rows0) {
      i += 1;
      if (done.has(g.queryId)) continue;
      const row = await run(g);
      results.push(row);
      appendFileSync(CKPT, JSON.stringify({ ...row, frozenHash: gold.frozenHash }) + '\n');
      if (i % 25 === 0) console.log(`  ${i}/${rows0.length}  last ${row.launchClass} ${row.ms}ms rank=${row.rank}`);
    }
  } finally {
    await sql.end({ timeout: 10 });
  }

  // ── report, never pooling an exact route with a semantic one ───────────────
  const byClass: Record<string, unknown> = {};
  for (const cls of [...new Set(results.map((r) => r.launchClass))].sort()) {
    const sub = results.filter((r) => r.launchClass === cls);
    const lat = sub.map((r) => r.ms);
    const reasons: Record<string, number> = {};
    for (const r of sub) if (r.failureReason) reasons[r.failureReason] = (reasons[r.failureReason] ?? 0) + 1;
    byClass[cls] = {
      route: EXACT_ROUTE_CLASSES.includes(cls as LaunchClass) ? 'exact_identity' : 'ranked_retrieval',
      queries: sub.length,
      successAt1: pct(sub.filter((r) => r.rank === 1).length, sub.length),
      successAt5: pct(sub.filter((r) => r.rank !== null && r.rank <= 5).length, sub.length),
      successAt20: pct(sub.filter((r) => r.rank !== null && r.rank <= TOP_K).length, sub.length),
      mrr: Number((sub.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / Math.max(1, sub.length)).toFixed(4)),
      timeouts: sub.filter((r) => r.timedOut).length,
      /**
       * NULL, not 0, when the field was never recorded.
       *
       * `topHitId` was added after the first runs, so a resumed checkpoint can
       * hold rows that predate it. Counting `wrongPin` over those yields zero —
       * and a check that answers zero for every input is not a check, it is a
       * clean bill of health issued by a missing column. Reporting null forces
       * a rerun to answer the question instead of letting silence answer it.
       */
      wrongPins: sub.some((r) => r.topHitId === undefined) ? null : sub.filter((r) => r.wrongPin).length,
      nonOkResponses: sub.filter((r) => r.httpStatus !== 200).length,
      latencyMs: { p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), max: Math.max(0, ...lat) },
      failureReasons: reasons,
    };
  }

  const report = {
    kind: 'new1_launch_benchmark_v1',
    measuredAt: new Date().toISOString(),
    frozenHash: gold.frozenHash,
    goldClassCounts: gold.byClass,
    excludedFromGold: gold.excluded,
    diagnosticVerbatimRows: gold.diagnosticVerbatim.length,
    path: "createApp(...).request('/search') — validation, answerStructured, embedQuery, hybridSearch",
    conditions: 'LOCAL_CONTENDED — the Tier-A GPU walk and other lanes were writing throughout',
    bounds: { perQueryMs: PER_QUERY_MS, statementMs: STATEMENT_MS, embedTimeoutMs: EMBED_TIMEOUT_MS, topK: TOP_K },
    poolingRule: 'exact_identity classes are NEVER pooled with ranked_retrieval classes',
    byClass,
    rows: results,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

  console.log('\nLAUNCH BENCHMARK V1 — production path');
  for (const [cls, m] of Object.entries(byClass)) {
    const v = m as Record<string, unknown>;
    console.log(`\n  ${cls}  [${v['route']}]  (${v['queries']} queries)`);
    console.log(`    s@1 ${v['successAt1']}%  s@5 ${v['successAt5']}%  s@${TOP_K} ${v['successAt20']}%  MRR ${v['mrr']}`);
    console.log(`    latency ${JSON.stringify(v['latencyMs'])}  timeouts ${v['timeouts']}  non-200 ${v['nonOkResponses']}`);
    console.log(`    failures ${JSON.stringify(v['failureReasons'])}`);
  }
  console.log(`\nwrote ${OUT}`);
  return 0;
}

process.exitCode = await main();
