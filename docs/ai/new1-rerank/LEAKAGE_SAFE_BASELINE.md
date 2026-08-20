# NEW1 — the reranker, rebuilt so it cannot lie, and what it is worth

20 Aug 2026. `docs/ai/new1-rerank/leakage-safe-baseline.json`,
`services/harness/src/leakage-safe-rerank.mjs`.

## The setup, and why it is different from the one that produced +21.5 points

The previous reranker gained 21.5 points and the gain was the **benchmark**: all
278 gold authorities were inbound-cited, the model had an inbound-citation
feature, and it was reading back how the gold had been constructed.
Interaction-only features bought 0.69 points.

Here every feature is checked against `gold-contract.ts` per row before it is
computed, and a prohibited one **throws**. On this gold that rules out
`inbound_citation_graph` — the exact feature that produced the illusion — and
nothing in this file can quietly reintroduce it.

- **`proposition` rows only**, 228 of them. `exact_citation` and `case_title` hand
  the authority's own identifier back as the query, and production already answers
  those with a pinned exact lookup; reranking them would measure a route that does
  not run.
- **Split by case family**, deterministically: 158 train, 70 held. An authority
  cannot be tuned on in one half and scored in the other.
- **Candidate pools 50 / 100 / 200.** Not 2,000 — depth from 200 to 2,000 was
  measured at +15.7 points of gold presence and 0.00 points of success@5.
- Features: `dense_similarity`, `sparse_lexical` (`ts_rank` over the candidates),
  `court_and_date` (same court as the matter; not decided after the query's date).

## The result

Held-out, 70 queries:

```
pool 200        success@5   recall@20     MRR    (train success@5)
denseOnly         22.86%      27.14%    0.1932       20.89%
sparseOnly        27.14%      34.29%    0.1856       25.95%
equalBlend        22.86%      27.14%    0.1935       21.52%
blendPlusContext  24.29%      28.57%    0.2000       23.42%
grid best         27.14%      32.86%    0.2068       28.48%
```

**The best a leakage-safe rescoring buys is about 4.3 points of success@5 on
held, and 70 queries means that is three queries.** The train delta is 7.6
points, so roughly half of what a naive report would have claimed is fitting. The
honest summary is: reordering a dense pool with the features this gold permits is
worth something small, and the experiment cannot yet distinguish it from noise.

### Two things that are not small

**1. `sparseOnly` beats `denseOnly` on the pool dense itself selected.** Lexical
alone, rescoring candidates that dense retrieved, puts more gold in the top 5
(27.1% against 22.9%) and far more in the top 20 (34.3% against 27.1%) — while
scoring *worse* on MRR (0.186 against 0.193). It rescues golds dense had buried
and it is worse at the ones dense already had at rank 1. That is a real
complementarity and it is the argument for fusion rather than for a reranker.

It also has a plain explanation that is not leakage: a `proposition` query is a
passage from the CITING judgment, and judges quote the authority they are relying
on. Lexical overlap with the target is high because a real judge really quoted
it. Legitimate signal — but signal that may not transfer to a query an advocate
types in their own words, which is the query this product actually serves.

**2. Depth still buys presence and not position — a third independent
replication.**

```
pool     gold present in pool     denseOnly success@5
 50            31.43%                 22.86%
100            35.71%                 22.86%
200            38.57%                 22.86%
```

Seven more points of the gold arrive in the candidate list and **not one of them
reaches the top five**. Measured before on a contaminated setup, again on the
250k index, and now on a leakage-safe split. Whatever is failing is not recall
into the pool.

## A methodological note that changed the result

The grid sweep chose its own boundary twice: first `sparse = 1.2` from a grid
ending at 1.2, then `sparse = 8` from a grid ending at 8, with the court and time
weights also pinned at their maxima. **An optimum on the edge of a grid is not an
optimum; it is a grid that was too small**, and extending it a third time would
have kept answering the wrong question.

The named arms above answer it directly, and `sparseOnly` is what settles it: the
fit wanted sparse to dominate because dense was contributing little to the
ORDERING once dense had already chosen the pool. The artefact now carries
`bestWeightsOnGridEdge` so a reader does not have to notice this for themselves.

## What this says about where the work is

Not the reranker. Three routes have now been tried — a feature-based reranker on
contaminated gold, a cross-encoder (which made success@5 *worse* by 2.78 points
at fp32 as well as q8), and this — and the leakage-safe ceiling is a few points
on seventy queries.

The measured constraints that are much larger:

- **13.2% of authorities judges cite are refused by the eligibility contract.**
  No ranker reaches them.
- **Only 38.6% of gold reaches a 200-deep candidate pool at all**, so 61% of the
  loss happens before any reranker is consulted.

Both are recall problems, upstream of ranking. That is where the next measurement
should go.

## Caveats, stated because their absence would be a red flag

- 70 held queries. Every difference discussed above is three or four queries.
- One gold set, one query type, High Court authorities in courts chosen for being
  newly embedded.
- `ts_rank` on `plainto_tsquery` over the first 900 characters of the query is a
  crude sparse arm; a tuned BM25 with proper field weighting would likely do
  better, and that is a reason to take the `sparseOnly` result as a floor.
- The pool is dense-selected throughout, so `sparseOnly` here is **not** a sparse
  retrieval arm. A corpus-wide sparse retriever is a different experiment.
