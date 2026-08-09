/**
 * precision@5, measured against the retrieval path the product actually uses.
 *
 * **It calls `hybridSearch` directly rather than `POST /search` over HTTP.**
 * The decision is worth stating because the opposite is usually right: an
 * end-to-end test through the real route catches wiring nobody unit-tested.
 * Here it would measure the wrong thing. `handleSearch` wraps `hybridSearch`
 * with an envelope, a `searches` row and citation-check writes; none of that
 * changes the ranking, and running it would write thirty rows of synthetic
 * search history into whatever database the harness points at, which is the
 * production corpus. The gate measures ranking. Ranking is `hybridSearch`.
 *
 * The citation-harness metrics — hallucination, silent drop, stale overruled,
 * leakage — do go through the row-level path, in `harness-checks.ts`, because
 * those are about what is WRITTEN and rendered rather than about order.
 */
import { expandByCitations } from '@lawmind/api/search/graph-expand';
import { hybridSearch, passagesForRerank } from '@lawmind/api/search/retrieve';
import type { Sql } from 'postgres';

import { PRECISION_AT_K } from './metrics.ts';

export type ScoredQuery = {
  id: string;
  group: string;
  language: string;
  /** Ranks (1-based) at which a gold judgment appeared, within the top K. */
  goldRanks: number[];
  /** Gold judgments found anywhere in the returned list, however deep. */
  foundAtAnyRank: number | null;
  precision: number;
  returned: number;
  /**
   * Document-Level Retrieval Mismatch — the share of the top K that came from
   * no gold document. Not a gate metric and deliberately not one: it is a
   * diagnostic that tells you WHY precision moved, and it is the number the
   * reranker work will be judged on first. arXiv 2510.06999 names it.
   */
  drm: number;
  topTitles: string[];
  /**
   * The top-K results as EVIDENCE for the generation path — added 9 Aug 2026.
   *
   * Carried here rather than re-retrieved because the generation metrics must
   * grade the answer produced from **the retrieval the gate actually scored**.
   * A second retrieval pass could return a different set, and then
   * `hallucinationRate` would describe an answer nobody was graded on.
   */
  retrieved: { judgmentId: string; caseTitle: string; passage: string }[];
  /**
   * The query text itself. Carried because the generation path needs the actual
   * QUESTION — an earlier version passed `id` by mistake and the model was
   * handed `civil-a259ece9` as its prompt, which is why it cited almost nothing.
   */
  queryText: string;
};

export type HarnessQuery = {
  id: string;
  group: string;
  language: string;
  query: string;
  goldJudgmentIds: string[];
  provenance?: { citingJudgmentId?: string };
};

/**
 * The judgment the query was cut out of, which must not be scored.
 *
 * The first run made this obvious and it would have been invisible in a summary
 * number. `criminal-96f5c829` returned its own citing judgment at rank 1 with a
 * vector distance of 0.127 while the gold sat at 0.306 — of course it did, the
 * query is a verbatim passage from it. Counting that as a miss punishes the
 * retriever for being right, and counting it as a hit would be worse.
 *
 * CLERC removes the citing case for the same reason. The advocate's real
 * situation is the one being modelled: they are WRITING that document. It is
 * not in the corpus they are searching, because they have not filed it yet.
 */
function excludedFor(q: HarnessQuery): Set<string> {
  const citing = q.provenance?.citingJudgmentId;
  return citing ? new Set([citing]) : new Set<string>();
}

/**
 * Score one query.
 *
 * **A gold judgment at rank 6 counts for nothing** — `metrics.ts` fixed that
 * before any measurement, and the reason is that the advocate reads five. It is
 * still RECORDED, as `foundAtAnyRank`, because "ranked 7th" and "not retrieved
 * at all" are different problems with different fixes: the first is a reranking
 * problem and the second is a recall or an ingest problem. Collapsing them
 * would make a failing precision number unactionable.
 */
export async function scoreQuery(
  sql: Sql,
  q: HarnessQuery,
  embedQuery: (text: string) => Promise<string | null>,
  depth = 20,
  rerank?: (query: string, passages: readonly string[]) => Promise<number[]>,
  graph = false,
  hyde?: (query: string) => Promise<string>,
): Promise<ScoredQuery> {
  /**
   * **HyDE changes what is EMBEDDED, never what is SEARCHED lexically.**
   *
   * `hybridSearch` takes the query text and the query vector as separate
   * arguments, so the sparse arm keeps the advocate's literal words — section
   * numbers, the citation they typed, party names — while only the dense arm
   * sees the hypothetical passage. A hypothetical that wanders off topic
   * therefore cannot take BM25 with it, and the exact-citation pin is untouched.
   */
  const denseText = hyde ? await hyde(q.query) : q.query;
  const vector = await embedQuery(denseText);
  const excluded = excludedFor(q);
  // Over-fetch by the number removed, so excluding the citing judgment does not
  // quietly shorten the list the advocate would have seen.
  const raw = await hybridSearch(sql, q.query, vector, {}, depth + excluded.size);
  let results = raw.filter((r) => !excluded.has(r.judgmentId)).slice(0, depth);

  /**
   * Citation-graph expansion, when asked for. **The only stage that can add a
   * candidate**, which is why it is measured against `recallAt20` rather than
   * against `successAt5`: if recall does not move, it did nothing, whatever
   * success@5 says.
   *
   * **Suggestions take reserved slots; they are not appended.** The first
   * attempt appended them and then truncated the list back to `depth`, so every
   * suggestion was discarded before it was scored — the run came back bit-for-bit
   * identical to the baseline, which is what a no-op looks like when it is
   * indistinguishable from a null result. Worth recording: a change that
   * measures as exactly zero is more often not running than not working.
   *
   * So the last `GRAPH_SLOTS` places of the candidate list are given to graph
   * evidence, displacing the weakest text-similarity candidates. That is a real
   * trade with a real cost, which is the point — if following citations is worth
   * less than the 16th-ranked embedding match, the harness should say so.
   *
   * Entering at rank 16 cannot move success@5 on its own. **Graph and reranker
   * are one combination, not two features**: expansion supplies an authority
   * text similarity never found, and the cross-encoder is what can promote it
   * into the top five. Measured together, and separately, against the baseline.
   */
  if (graph) {
    const GRAPH_SLOTS = 5;
    const suggestions = await expandByCitations(
      sql,
      results.map((r) => r.judgmentId),
      GRAPH_SLOTS,
    );
    const known = new Set(results.map((r) => r.judgmentId));
    const fresh = suggestions
      .filter((s) => !known.has(s.judgmentId) && !excluded.has(s.judgmentId))
      .slice(0, GRAPH_SLOTS);
    if (fresh.length > 0) results = results.slice(0, Math.max(0, depth - fresh.length));
    if (fresh.length > 0) {
      const rows = await sql<
        { id: string; case_title: string; operative: string | null; overruled_status: string }[]
      >`
        SELECT j.id, j.case_title, j.overruled_status::text AS overruled_status,
               /**
                * **The chunk nearest the QUERY, not chunk zero.**
                *
                * Chunk zero of an Indian judgment is the cause title, the coram
                * and counsel's names — nearly content-free for relevance. Handing
                * that to the cross-encoder as if it were the reasoning was a
                * quiet second version of the empty-string defect, and it hit
                * exactly the candidates graph expansion exists to promote: the
                * cross-encoder is the only thing that can lift a rank-16
                * suggestion into the top five, and it was being asked to judge
                * them on their letterhead.
                */
               (SELECT c.chunk_text FROM judgment_chunks c
                 WHERE c.judgment_id = j.id AND c.embedding IS NOT NULL
                 ORDER BY ${
                   vector
                     ? sql`c.embedding <=> ${vector}::vector`
                     : sql`c.chunk_index`
                 } LIMIT 1) AS operative
          FROM judgments j
         WHERE j.id = ANY(${fresh.map((f) => f.judgmentId)})
      `;
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const s of fresh) {
        const row = byId.get(s.judgmentId);
        if (!row) continue;
        results.push({
          judgmentId: row.id,
          caseTitle: row.case_title,
          neutralCitation: null,
          reporterCitations: [],
          court: '',
          judgmentDate: '',
          overruledStatus: row.overruled_status,
          overruledByJudgmentId: null,
          overruledParas: null,
          overruledNote: null,
          operativeParagraph: row.operative ?? row.case_title,
          operativeParagraphNumber: null,
        });
      }
      results = results.slice(0, depth);
    }
  }

  /**
   * Reranking reorders the SAME candidates. It cannot add one, which is why
   * `recallAt20` is identical with and without it and `successAt5` is not —
   * that pair of numbers is how the harness tells a reranking gain from a
   * recall gain, and it is why both are reported.
   *
   * The passage handed to the cross-encoder is `operativeParagraph`: the
   * paragraph the match sits in, cleaned of reporter typesetting. Not the whole
   * judgment, which would be tens of thousands of tokens per candidate, and not
   * the raw chunk, which carries marginal letters and hard-wrapped words that
   * cost the model attention on noise.
   */
  if (rerank && results.length > 1) {
    /**
     * ───────────────────────────────────────────────────────────────────────
     * HOW MANY CANDIDATES TO RERANK — the only latency lever left
     * ───────────────────────────────────────────────────────────────────────
     *
     * Measured 9 Aug 2026: 20 candidates at `max_length` 512 costs **4,136 ms
     * mean**, and retrieval is p95 488 ms (`CORPUS_TIERING.md` §4), so Gate S1's
     * 3,000 ms leaves **2,512 ms → about 12 candidates**. Cost is linear in the
     * count; the padding lever is dead (93.5% of real passages already reach the
     * 512 cap, ceiling 1.1%).
     *
     * **AND THE OBVIOUS IMPLEMENTATION WOULD DESTROY THE THING IT IS PROTECTING.**
     * Graph suggestions take the LAST `GRAPH_SLOTS` places, ranks 16–20. A naive
     * "rerank the top 12" never shows them to the cross-encoder — and the whole
     * measured gain is the combination: graph alone moved success@5 by exactly
     * zero with zero discordant pairs, while graph + reranker moved it +4.6 over
     * 45. Cutting the pool from the bottom would silently delete the graph's
     * only contribution to the gate metric.
     *
     * So the pool is taken from **both ends**: the strongest text candidates and
     * every graph suggestion. What is dropped is the weak middle — the text
     * matches ranked 8th to 15th, which are the least likely to belong in a top
     * five and the ones the reranker was least often promoting.
     *
     * Default `20` keeps today's behaviour exactly, so this is inert until
     * measured.
     */
    const pool = Number(process.env['RERANK_POOL'] ?? '20');
    const graphSlots = graph ? 5 : 0;
    /**
     * `slice(-0)` returns the WHOLE array, because `-0 === 0`. With the graph
     * off that made the pool 32 items instead of 12 — a latency experiment that
     * silently reranked more than the control. Caught by `rerank-pool.test.ts`
     * before it ever ran.
     */
    const tail = graphSlots > 0 ? results.slice(-graphSlots) : [];
    const reranked =
      pool >= results.length
        ? results
        : [...results.slice(0, Math.max(0, pool - graphSlots)), ...tail];
    const untouched = results.filter((r) => !reranked.includes(r));

    /**
     * **Never an empty string.** `operativeParagraph` is a display field and is
     * legitimately empty for a lexical-only match — 37.6% of candidates,
     * measured 9 Aug 2026 over 500 from 25 real queries. Handing that to a
     * cross-encoder scores the candidate against nothing and ranks it last,
     * every time, so the reranker was deleting two candidates in five from the
     * top five. `passagesForRerank` fills them from the chunk nearest the query.
     */
    const passages = await passagesForRerank(sql, reranked, vector);
    const scores = await rerank(q.query, passages);
    results = [
      ...reranked
        .map((r, i) => ({ r, s: scores[i] ?? Number.NEGATIVE_INFINITY }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.r),
      /**
       * **Kept, never dropped.** They fall below everything reranked, which is
       * the honest ordering — nothing scored them — but removing them would turn
       * a latency change into a recall change and make `recallAt20` incomparable
       * with every run before it.
       */
      ...untouched,
    ];
  }

  const gold = new Set(q.goldJudgmentIds);
  const goldRanks: number[] = [];
  let anyRank: number | null = null;

  results.forEach((r, i) => {
    if (!gold.has(r.judgmentId)) return;
    const rank = i + 1;
    if (anyRank === null) anyRank = rank;
    if (rank <= PRECISION_AT_K) goldRanks.push(rank);
  });

  const topK = results.slice(0, PRECISION_AT_K);
  const hits = topK.filter((r) => gold.has(r.judgmentId)).length;

  return {
    id: q.id,
    group: q.group,
    language: q.language,
    goldRanks,
    foundAtAnyRank: anyRank,
    /**
     * Denominator is K, not the number returned.
     *
     * Dividing by what came back would reward a retriever that returns two
     * results and gets one right over one that returns five and gets two — the
     * first scores 0.5, the second 0.4, and the advocate is better served by the
     * second. Where fewer than K come back, the missing slots count as misses,
     * because an empty slot is an answer the advocate did not get.
     */
    precision: hits / PRECISION_AT_K,
    returned: results.length,
    drm: topK.length === 0 ? 1 : (topK.length - hits) / topK.length,
    queryText: q.query,
    topTitles: topK.map((r) => r.caseTitle),
    retrieved: topK.map((r) => ({
      judgmentId: r.judgmentId,
      caseTitle: r.caseTitle,
      passage: r.operativeParagraph,
    })),
  };
}
