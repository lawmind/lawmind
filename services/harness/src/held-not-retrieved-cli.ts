/**
 * `pnpm --filter @lawmind/harness held:decompose` — WHERE does the gold
 * judgment fall out of the pipeline?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `AUTHORITY_HELD_BUT_NOT_RETRIEVED` is **48.6%** of the 288-query benchmark
 * (140 of 288, `failure-classify-checkpoint.jsonl`) — the single largest
 * failure population, and larger than `BADLY_RANKED` (34.0%).
 *
 * Q1.46 closed the one lead that pointed at it and **ruled it out**: the
 * hybrid-vs-dense recall@20 gap is 1.7 points (38.9% vs 40.6%), nowhere near
 * large enough to explain half the failures. So the cause is elsewhere, and
 * "elsewhere" is not a hypothesis — it is a measurement that has never been
 * taken.
 *
 * `failure-classifier-cli.ts` reports THAT the gold was not in the top 50. It
 * cannot say WHERE it fell out, because it only ever sees the pipeline's
 * output. This tool measures the gold's EXACT position inside the dense arm,
 * against ground truth (sequential scan, no ANN approximation), at the two
 * cut points `retrieve.ts` actually applies.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO CUT POINTS, READ OUT OF `retrieve.ts` BEFORE MEASURING ANYTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `dense()` is a two-stage funnel and the stages truncate on DIFFERENT units:
 *
 *   1. `annDepth = CANDIDATE_DEPTH * 4 = 200`  — **CHUNKS**, unfiltered.
 *      The ANN returns the 200 nearest CHUNKS. A judgment whose best chunk is
 *      the 201st-nearest chunk is invisible from here on, no matter how good
 *      it is.
 *   2. `ranked.length >= CANDIDATE_DEPTH` (50) — **JUDGMENTS**, after those
 *      200 chunks are collapsed judgment-wise (first sighting wins).
 *
 * So the dense arm retrieves gold **iff** `chunkRank <= 200 AND
 * judgmentRank <= 50`. Those are two independent failure modes wearing one
 * name, and the fix for each is completely different:
 *
 *   `chunkRank > 200`, `judgmentRank <= 50`  -> CANDIDATE GENERATION. The
 *       ranker scored it fine; the funnel threw it away. One constant.
 *   `judgmentRank > 50`                      -> SEMANTIC RANKING. The model
 *       genuinely does not think gold is close to the query. No constant
 *       fixes this; it needs a different mechanism.
 *
 * Conflating the two is how a lane spends a week on a reranker when the real
 * problem was an integer, or vice versa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GROUND TRUTH, NOT THE ANN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ranks here are computed by **sequential scan over every embedded chunk**
 * (`embedding <=> $v < goldDistance`), not by asking HNSW. That is deliberate
 * and it is the only way this measurement means anything: HNSW at
 * `ef_search=200` was measured at ~96.9% recall@50 (`retrieve.ts`), so an
 * ANN-derived rank would fold the index's own miss rate into the number and
 * make it unattributable. The gap between "exact says retrievable" and "the
 * pipeline missed it" is itself reported, as `DENSE_OK_BUT_MISSED` — that
 * residue IS the ANN/fusion loss, isolated.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT MEASURE, STATED UP FRONT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **The sparse arm.** Measured separately (`--sparse`), off by default: an
 *   OR-of-40-lexemes `ts_rank` sort over 3.6M judgments is a different and far
 *   heavier query than a 620k-vector scan, and mixing them in one pass makes
 *   both slower without making either clearer.
 * - **Graph expansion.** `search/graph-expand.ts` is not called by
 *   `hybridSearch` at all, so it cannot be a cause of a miss in a path it is
 *   not on. That is a finding for the report, not something to measure here.
 * - **No new gold.** Reads `failure-classify-checkpoint.jsonl` — the same
 *   real gold set, the same classifications. Nothing is relabelled.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { openDb } from '@lawmind/ingest/db-host';

/** `retrieve.ts` `CANDIDATE_DEPTH`. Duplicated deliberately — see below. */
const CANDIDATE_DEPTH = 50;
/** `retrieve.ts` `dense()`: `CANDIDATE_DEPTH * (filtered ? 40 : 4)`, unfiltered. */
const ANN_DEPTH = CANDIDATE_DEPTH * 4;
/**
 * **`HNSW_EF_SEARCH` was declared here and never applied. It is gone, and the
 * reason it was harmless is worth recording so nobody re-adds it.**
 *
 * NEW2 flagged it (bus 0672) on exactly the right instinct: a knob that a file
 * claims to set and never does means the numbers were measured at the default,
 * not at the stated value. That reasoning is sound and it is how
 * `enrich-cli`'s `skippedMissing` defect worked.
 *
 * It does not apply here, because **this tool never asks HNSW anything.** Both
 * of its vector queries are exact distance predicates
 * (`embedding <=> $v < goldDistance`) with no `ORDER BY … LIMIT`, so the index
 * is not used and `ef_search` cannot affect a single number this file produces
 * — see the header note at the top: ranks are computed "by exact distance
 * comparison, not by asking HNSW. That is deliberate."
 *
 * The docstring it carried described `annYield`, which is measured by a
 * different tool. Production sets the GUC properly at `retrieve.ts:410`
 * (`SET LOCAL hnsw.ef_search`), inside a transaction, which is what any future
 * ANN probe here must copy rather than re-declaring a constant that nothing
 * executes.
 */

/**
 * How many closer chunks the exact scan will count before giving up.
 *
 * Chosen from a measurement, not a feeling: the uncapped scan exceeded 9
 * minutes for one query on this database under load, while every cut point
 * this tool decides lives at 200 (chunks) or 50 (judgments). 20,001 is 100x
 * the larger cut point — comfortably enough to decide both, and enough to
 * bucket "how far out" for the semantic failures, while letting Postgres abort
 * a scan that has already proven the answer.
 */
const SCAN_CAP = Number(process.env['HNR_SCAN_CAP'] ?? 20_001);

/**
 * These two are COPIES of `retrieve.ts`'s constants, not imports, and that is
 * on purpose: this tool measures the production values as they were AT THIS
 * RUN. If someone changes `retrieve.ts` tomorrow, an imported constant would
 * silently re-interpret a recorded result against a system that no longer
 * exists. They are asserted against the source file at startup instead, so a
 * drift is a loud failure rather than a quiet re-reading of old numbers.
 */
const CONSTANTS_SOURCE = new URL('../../api/src/search/retrieve.ts', import.meta.url);

function assertConstantsStillMatch(): void {
  const src = readFileSync(CONSTANTS_SOURCE, 'utf8');
  const depth = /const CANDIDATE_DEPTH = (\d+);/.exec(src);
  const ann = /const annDepth = CANDIDATE_DEPTH \* \(filtered \? \d+ : (\d+)\);/.exec(src);
  if (!depth || Number(depth[1]) !== CANDIDATE_DEPTH) {
    throw new Error(
      `retrieve.ts CANDIDATE_DEPTH is ${depth?.[1] ?? 'unreadable'}, this tool assumes ${CANDIDATE_DEPTH}. ` +
        'Update both, and do not compare the new numbers to old ones without saying so.',
    );
  }
  if (!ann || CANDIDATE_DEPTH * Number(ann[1]) !== ANN_DEPTH) {
    throw new Error(
      `retrieve.ts unfiltered annDepth multiplier is ${ann?.[1] ?? 'unreadable'}, this tool assumes ` +
        `${ANN_DEPTH / CANDIDATE_DEPTH}. Same warning as above.`,
    );
  }
}

type Classification = {
  queryId: string;
  group: string;
  query: string;
  goldJudgmentIds: string[];
  primary: string;
  rank: number | null;
};

type Mechanism =
  /** Dense can never see it: gold has no embedded chunk at all. */
  | 'GOLD_NOT_EMBEDDED'
  /** Exact dense would have returned it. The miss is ANN approximation or fusion. */
  | 'DENSE_OK_BUT_MISSED'
  /** Ranker scored it inside 50 judgments; the 200-CHUNK funnel discarded it. */
  | 'CANDIDATE_TRUNCATED_BY_ANN_DEPTH'
  /** Genuinely not near the query in embedding space. */
  | 'SEMANTIC_RANKED_LOW'
  /** The scan cap hit before the judgment rank could be decided. Not a guess. */
  | 'UNKNOWN_CAP_SATURATED';

type Row = {
  queryId: string;
  group: string;
  goldJudgmentIds: string[];
  /** Cosine distance from the query vector to gold's NEAREST embedded chunk. */
  goldDistance: number | null;
  /**
   * How many embedded chunks are strictly nearer, +1. Exact when
   * `capSaturated` is false; a LOWER BOUND (`SCAN_CAP + 1`) when it is true.
   */
  chunkRank: number | null;
  /** Same, over DISTINCT judgments. Same exact/lower-bound rule. */
  judgmentRank: number | null;
  /** True when the scan stopped at `SCAN_CAP` — the ranks above are bounds, not values. */
  capSaturated?: boolean;
  mechanism: Mechanism;
  ms: number;
};

const CHECKPOINT_PATH = new URL('../../../held-not-retrieved-checkpoint.jsonl', import.meta.url);
const CLASSIFY_CHECKPOINT = new URL('../../../failure-classify-checkpoint.jsonl', import.meta.url);

function readJsonl<T>(url: URL): T[] {
  if (!existsSync(url)) return [];
  return readFileSync(url, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

async function main(): Promise<void> {
  assertConstantsStillMatch();

  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const all = readJsonl<Classification>(CLASSIFY_CHECKPOINT);
  if (all.length === 0) {
    throw new Error(
      'failure-classify-checkpoint.jsonl is empty or missing — run `failure:classify` first. ' +
        'This tool deliberately invents no gold of its own.',
    );
  }
  const target = all.filter((c) => c.primary === 'AUTHORITY_HELD_BUT_NOT_RETRIEVED');

  const done = new Map(readJsonl<Row>(CHECKPOINT_PATH).map((r) => [r.queryId, r]));
  // HNR_LIMIT is a smoke-test lever only — same idiom as arms-cli.ts's
  // ARMS_LIMIT. A partial run is checkpointed and resumes, so a limited run is
  // never a wasted one, but a limited run is also NOT a result: the report
  // prints how many are still unmeasured for exactly that reason.
  const limit = Number(process.env['HNR_LIMIT'] ?? 0);
  const pendingAll = target.filter((c) => !done.has(c.queryId));
  const pending = limit > 0 ? pendingAll.slice(0, limit) : pendingAll;

  console.log('HELD_NOT_RETRIEVED — DENSE-ARM DECOMPOSITION');
  console.log('='.repeat(78));
  console.log(
    `${target.length} HELD_NOT_RETRIEVED of ${all.length} classified · ` +
      `${done.size} already checkpointed · ${pending.length} pending`,
  );
  console.log(`cut points measured against: annDepth=${ANN_DEPTH} chunks, candidateDepth=${CANDIDATE_DEPTH} judgments`);

  const sql = await openDb(url, 4);
  try {
    /**
     * The corpus snapshot, recorded WITH the result and not remembered.
     * A moving corpus invalidates a naive before/after comparison, and this
     * corpus moved 79k -> 3.6M during the measurement window that produced
     * the checkpoint being read here.
     */
    const snapshot = await sql<{ relname: string; approx: string }[]>`
      SELECT relname, reltuples::bigint::text AS approx FROM pg_class
      WHERE relkind = 'r' AND relname IN
        ('judgments','judgment_chunks','judgment_citations','judgment_paragraphs')`;
    const embedded = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgment_chunks WHERE embedding IS NOT NULL`;
    const embeddedChunks = Number(embedded[0]!.n);
    console.log('\nCORPUS SNAPSHOT (approx = pg_class estimate; embeddedChunks is exact)');
    /**
     * `reltuples` is **-1 when the table has never been analyzed**, not zero,
     * and Postgres discards the statistics collector entirely on an unclean
     * shutdown — after the 16 Aug power loss every table on the local cluster
     * read -1 with `relpages = 0`, including one of 22 GB (NEW2, bus 0580).
     * Printing `~-1` as if it were a population is how a crashed-stats window
     * becomes a recorded corpus size. Say "not analyzed" instead.
     */
    for (const s of snapshot) {
      const n = Number(s.approx);
      console.log(`  ${s.relname.padEnd(20)} ${n < 0 ? 'not analyzed (no estimate)' : `~${s.approx}`}`);
    }
    console.log(`  ${'embeddedChunks'.padEnd(20)}  ${embeddedChunks}`);
    console.log(`  ${'measuredAt'.padEnd(20)}  ${new Date().toISOString()}`);

    const embedder = await getEmbedder();

    /**
     * Deliberately low. Each pending query costs ONE sequential scan over
     * every embedded chunk, and this database is shared with NEW2's ingest
     * fleet (LANE_PROTOCOL §5). Three concurrent scans keeps the pass moving
     * without becoming the thing that stalls someone else's writes.
     */
    const CONCURRENCY = Number(process.env['HNR_CONCURRENCY'] ?? 3);
    let next = 0;
    let finished = 0;

    async function one(c: Classification): Promise<void> {
      const startedAt = Date.now();
      const [emb] = await embedder.embed([c.query]);
      if (!emb) throw new Error(`embedder returned nothing for ${c.queryId}`);
      const v = toVectorLiteral(emb.vector);

      // 1 — gold's nearest embedded chunk. Indexed on judgment_id, cheap.
      const goldRows = await sql<{ d: number | null }[]>`
        SELECT min(c.embedding <=> ${v}::vector)::float8 AS d
        FROM judgment_chunks c
        WHERE c.judgment_id = ANY(${c.goldJudgmentIds}) AND c.embedding IS NOT NULL`;
      const goldDistance = goldRows[0]?.d ?? null;

      let row: Row;
      if (goldDistance === null) {
        row = {
          queryId: c.queryId,
          group: c.group,
          goldJudgmentIds: c.goldJudgmentIds,
          goldDistance: null,
          chunkRank: null,
          judgmentRank: null,
          mechanism: 'GOLD_NOT_EMBEDDED',
          ms: Date.now() - startedAt,
        };
      } else {
        /**
         * 2 — EXACT ranks, CAPPED. Sequential scan, on purpose (see the
         * header) — but with a `LIMIT` so the scan can stop early.
         *
         * **The cap is not a shortcut, it is the difference between a
         * measurement and a stalled job.** Measured directly, 14 Aug 2026, on
         * this database under NEW2's live ingest fleet: the UNCAPPED form of
         * this exact query ran **over 9 minutes without returning** for a
         * single query vector, against ~19s for the ANN top-200 on the same
         * connection. 140 queries of that shape is a multi-hour pass that
         * would also be the heaviest thing on a shared proxy other lanes are
         * writing through.
         *
         * The cap costs nothing this measurement needs. Postgres stops as soon
         * as `SCAN_CAP` closer chunks are found, and this population is
         * `HELD_NOT_RETRIEVED` — gold is FAR for most of it, so matches are
         * dense and the cap is met after touching a small fraction of the
         * table. The cases where the scan must still run to completion are
         * exactly the ones where gold is NEAR, which are the rare and
         * interesting `DENSE_OK` / `CANDIDATE_TRUNCATED` cases.
         *
         * **What stays exact.** Both cut points are still decided exactly
         * whenever the cap is not saturated, and `judgmentRank > 50` is still
         * decided exactly even when it IS saturated (a distinct-judgment count
         * above 50 within the capped set proves the true rank is above 50 —
         * a superset can only add more). The one case that becomes genuinely
         * unknown is a saturated cap holding 50 or fewer distinct judgments;
         * that is recorded as `UNKNOWN`, never guessed.
         */
        const counts = await sql<{ cc: string; cj: string }[]>`
          SELECT count(*)::text AS cc, count(DISTINCT t.judgment_id)::text AS cj FROM (
            SELECT c.judgment_id
            FROM judgment_chunks c
            WHERE c.embedding IS NOT NULL
              AND c.embedding <=> ${v}::vector < ${goldDistance}
            LIMIT ${SCAN_CAP}
          ) t`;
        const closerChunks = Number(counts[0]!.cc);
        const closerJudgments = Number(counts[0]!.cj);
        const capSaturated = closerChunks >= SCAN_CAP;
        const chunkRank = closerChunks + 1;
        const judgmentRank = closerJudgments + 1;

        /**
         * The classification, and the ONE case it refuses to decide.
         *
         * A saturated cap proves `chunkRank > SCAN_CAP` (hence far past
         * `ANN_DEPTH`), and a distinct-judgment count above `CANDIDATE_DEPTH`
         * within that capped set proves `judgmentRank > CANDIDATE_DEPTH` —
         * both exact. A saturated cap holding FEWER than `CANDIDATE_DEPTH`
         * distinct judgments proves neither: the true judgment rank could be
         * anywhere above what was counted. `UNKNOWN` rather than a guess —
         * `LANE_PROTOCOL.md` §4, *"UNKNOWN stays UNKNOWN"*.
         */
        const mechanism: Mechanism = capSaturated
          ? closerJudgments > CANDIDATE_DEPTH
            ? 'SEMANTIC_RANKED_LOW'
            : 'UNKNOWN_CAP_SATURATED'
          : judgmentRank > CANDIDATE_DEPTH
            ? 'SEMANTIC_RANKED_LOW'
            : chunkRank > ANN_DEPTH
              ? 'CANDIDATE_TRUNCATED_BY_ANN_DEPTH'
              : 'DENSE_OK_BUT_MISSED';

        row = {
          queryId: c.queryId,
          group: c.group,
          goldJudgmentIds: c.goldJudgmentIds,
          goldDistance,
          // Reported as a LOWER BOUND when the cap saturated, and the flag
          // says which — a reader must never take `20001` for a real rank.
          chunkRank,
          judgmentRank,
          capSaturated,
          mechanism,
          ms: Date.now() - startedAt,
        };
      }

      appendFileSync(CHECKPOINT_PATH, JSON.stringify(row) + '\n');
      finished++;
      console.log(
        `[${finished}/${pending.length}] ${row.queryId.padEnd(20)} ${row.mechanism.padEnd(34)} ` +
          `chunkRank=${row.chunkRank ?? '-'}${row.capSaturated ? '+' : ''} ` +
          `judgmentRank=${row.judgmentRank ?? '-'}${row.capSaturated ? '+' : ''} ` +
          `${(row.ms / 1000).toFixed(1)}s`,
      );
    }

    async function worker(): Promise<void> {
      for (;;) {
        const i = next++;
        if (i >= pending.length) return;
        const c = pending[i]!;
        try {
          await one(c);
        } catch (err) {
          // Not checkpointed: a failure is not a measurement, and writing one
          // in would make a re-run treat it as permanently resolved.
          console.log(`[!] ${c.queryId.padEnd(20)} FAILED: ${(err as Error).message} — will retry next run`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()));

    report(readJsonl<Row>(CHECKPOINT_PATH), target.length, embeddedChunks);
  } finally {
    await sql.end();
  }
}

function report(rows: Row[], targetCount: number, embeddedChunks: number): void {
  console.log('\n\nMECHANISM BREAKDOWN');
  console.log('='.repeat(78));
  const by = new Map<Mechanism, Row[]>();
  for (const r of rows) by.set(r.mechanism, [...(by.get(r.mechanism) ?? []), r]);
  const order: Mechanism[] = [
    'SEMANTIC_RANKED_LOW',
    'CANDIDATE_TRUNCATED_BY_ANN_DEPTH',
    'DENSE_OK_BUT_MISSED',
    'GOLD_NOT_EMBEDDED',
    'UNKNOWN_CAP_SATURATED',
  ];
  for (const m of order) {
    const n = by.get(m)?.length ?? 0;
    const pct = rows.length === 0 ? 0 : (n / rows.length) * 100;
    console.log(`  ${m.padEnd(36)} ${String(n).padStart(4)} / ${rows.length}  ${pct.toFixed(1)}%`);
  }
  if (rows.length < targetCount) {
    console.log(`  (${targetCount - rows.length} still unmeasured — re-run to complete)`);
  }

  // How deep would the funnel have to go? The actionable number, and the one
  // that decides whether raising a constant is worth measuring at all.
  const truncated = by.get('CANDIDATE_TRUNCATED_BY_ANN_DEPTH') ?? [];
  if (truncated.length > 0) {
    const needed = truncated.map((r) => r.chunkRank!).sort((a, b) => a - b);
    console.log('\nCHUNK DEPTH THAT WOULD HAVE CAUGHT THE TRUNCATED CASES');
    console.log('='.repeat(78));
    for (const p of [50, 75, 90, 100]) {
      const idx = Math.min(needed.length - 1, Math.ceil((p / 100) * needed.length) - 1);
      console.log(`  p${String(p).padEnd(3)} ${needed[idx]}`);
    }
    console.log(`  max  ${needed[needed.length - 1]}`);
  }

  // How badly does SEMANTIC_RANKED_LOW lose? A gold at judgmentRank 55 and one
  // at 55,000 are the same category and completely different problems.
  const low = by.get('SEMANTIC_RANKED_LOW') ?? [];
  if (low.length > 0) {
    console.log('\nSEMANTIC_RANKED_LOW — HOW FAR OUT (judgment rank)');
    console.log('='.repeat(78));
    const buckets: [string, (n: number) => boolean][] = [
      ['51-100', (n) => n <= 100],
      ['101-500', (n) => n <= 500],
      ['501-2000', (n) => n <= 2000],
      ['2001-10000', (n) => n <= 10000],
      ['>10000', () => true],
    ];
    const counted = new Set<Row>();
    for (const [label, test] of buckets) {
      const hit = low.filter((r) => !counted.has(r) && test(r.judgmentRank!));
      for (const h of hit) counted.add(h);
      console.log(`  ${label.padEnd(12)} ${hit.length}`);
    }
    const bounded = low.filter((r) => r.capSaturated).length;
    if (bounded > 0) {
      console.log(
        `  (${bounded} of these are LOWER BOUNDS — the scan capped at ${SCAN_CAP}. The class is ` +
          'still exact; only the magnitude bucket is a floor.)',
      );
    }
  }

  console.log(`\n(embedded chunk universe at measurement time: ${embeddedChunks})`);
  console.log(
    '(funnel yield — how many distinct judgments the 200-chunk ANN pool collapses to — is a\n' +
      ' property of the query distribution, not of an individual failure. Measured separately by\n' +
      ' `held:yield` so a 19s-per-query ANN call does not ride along on every row here.)',
  );
}

await main();
