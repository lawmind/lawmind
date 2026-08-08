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
import { hybridSearch } from '@lawmind/api/search/retrieve';
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
): Promise<ScoredQuery> {
  const vector = await embedQuery(q.query);
  const excluded = excludedFor(q);
  // Over-fetch by the number removed, so excluding the citing judgment does not
  // quietly shorten the list the advocate would have seen.
  const raw = await hybridSearch(sql, q.query, vector, {}, depth + excluded.size);
  const results = raw.filter((r) => !excluded.has(r.judgmentId)).slice(0, depth);

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
    topTitles: topK.map((r) => r.caseTitle),
  };
}
