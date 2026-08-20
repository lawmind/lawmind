# NEW1 — the retrieval architecture, argued from what has actually been measured

20-21 Aug 2026. This is P12: what the pipeline should be, and which parts of that
claim rest on a measurement rather than on how a hybrid system is usually drawn.

Every number below comes from an artefact in this repo. Where something is a
judgement rather than a measurement it says so.

---

## 1. What is already true, and was true before I looked

`services/api/src/search/retrieve.ts` already does more of this than I credited it
with, and I corrected that to the other lanes in bus 0927/0928:

- `query-shape.ts` classifies a query as `citation`, `section`, `case_name` or
  `concept`.
- A `citation` query gets an exact lookup on the normalised neutral citation, and
  a `case_name` query an exact title lookup. **Both are PINNED ahead of the ranked
  list, in every mode.**
- Everything else runs sparse + dense + fusion.
- The final read fetches `overruled_status` live, per result, at render.

Timed live on a loaded box: a citation query is **0.7 s**, a case name **3.8 s**,
a concept question **3.5 s**.

So the architecture question is not "should there be exact routes". It is what
happens for the `concept` query, which is the one this lane can improve.

## 2. Fusion, not reranking — and this is the measured part

Three reranking routes have now been tried and none has produced a usable gain:

| route | outcome |
| --- | --- |
| feature reranker on citation-derived gold | +21.5 pt, and the gain WAS the benchmark |
| cross-encoder | success@5 **worse** by 2.78 pt, at fp32 as well as q8 |
| leakage-safe interpretable rescoring | +4.3 pt on 70 held queries — three queries |

Against that, one arm did move something. On the pool dense itself selected, at
depth 200:

```
                success@5   recall@20     MRR
denseOnly         22.86%      27.14%    0.1932
sparseOnly        27.14%      34.29%    0.1856
```

**Sparse alone puts more gold in the top 5 and far more in the top 20, while
scoring worse on MRR.** It rescues authorities dense had buried and it is worse at
the ones dense already had first. That is complementarity in the precise sense
that matters: the two arms fail on different queries.

The architectural reading is that the win is in the UNION, not in a model that
reorders one arm's output. A reranker can only reorder what it is given; two
retrievers with different failure modes change what is there.

**The honest caveat, stated because it could invalidate this.** The `proposition`
queries are passages from citing judgments, and judges quote the authority they
rely on — so lexical overlap with the target is high for a legitimate reason that
may not survive contact with a query an advocate types in their own words. The
sparse arm's advantage is therefore a floor on a favourable query shape, and the
first thing a properly powered gold set should re-test.

**Do not force equal-weight RRF.** The two arms are not equally good at the same
thing — dense is better at rank 1, sparse at ranks 2-20 — and a fixed 50/50
constant would be a decision made by convention rather than by measurement. The
weighting is a measurement nobody has made on leakage-safe gold, and it should be
made per query shape.

## 3. Depth is not the lever, measured three times

```
pool     gold present in pool     denseOnly success@5
  50           31.43%                 22.86%
 100           35.71%                 22.86%
 200           38.57%                 22.86%
```

Seven more points of gold arrive in the candidate list and **not one reaches the
top five**. Measured before at 200 to 2,000 on a contaminated setup (+15.7 pt
presence, 0.00 pt success@5), again on the 250k index, and now on a leakage-safe
split. A pool of 200 is already more than the ranker can use; paying for 2,000
funds a reranker that does not exist.

## 4. The two ceilings that dominate everything above

Both are recall problems upstream of ranking, and both are larger than every
ranking result on this page put together.

**13.2% of authorities judges cite are refused by the eligibility contract.** 33
of NEW3's 250 citation-verified gold — 18 under 2,000 characters, 12 `bail_order`,
2 `procedural_disposal`, 1 on text quality. Replicated at 11.5% on the
independently built uncited set. No route, ranker or fusion weight reaches a
document that is never indexed. This is LCC's contract and LCC's decision; what
changed is that it has a number.

**61% of gold never reaches a 200-deep pool at all.** Presence tops out at 38.6%.
Whatever is failing there is not fixable by reordering.

## 5. The pipeline, as it should be stated

```
query
  ├─ classify shape                     (exists)
  ├─ EXACT routes, pinned               (exists: citation, case title)
  ├─ concept path
  │    ├─ dense candidates              (exists)
  │    ├─ sparse candidates             (exists)
  │    ├─ union + dedup to DOCUMENT     (exists: content_hash collapse)
  │    ├─ weight per query shape        NOT MEASURED — do not default to 50/50
  │    └─ rescoring                     measured, worth ~3 queries in 70
  ├─ currentness read LIVE per result   (exists, and NEW1 holds no cached copy)
  └─ evidence: operative paragraph      (exists)
```

The only box in that diagram this lane can currently justify spending on is the
fusion WEIGHT, and it needs gold that is not built from citing passages before the
answer would mean anything.

## 6. Performance, as far as it has been measured

```
dense-only over 256,998 vectors, ef_search=200   p50   41 ms   p95  519 ms
same, halfvec                                     p50   14 ms   p95  232 ms
production hybridSearch, citation query                 700 ms
production hybridSearch, case name                    3,800 ms
production hybridSearch, concept question             3,500 ms
```

All on a box also running the embed walk, a classifier UPDATE and citation
extraction at concurrency 12, so they are upper bounds rather than clean numbers.

**One shape does not complete at all.** A 900-character verbatim passage through
`hybridSearch` had its sparse arm alive for **32 minutes**; short queries are
fine. The mechanism is in `retrieve.ts`'s own header — `ts_rank` reads the
tsvector of every matching row — and migration 0055's rarest-term selection exists
to keep the match set small. A long passage carries far more rare terms than a
typed question, which is a query shape that rule was never measured against. It is
handed to LCC in bus 0927 and it needs `EXPLAIN` on a quiet box.

A system that is 5% better and takes fifteen seconds is not a better product. On
current evidence nothing in the ranking work is worth 15 seconds, and the sparse
arm's behaviour on long queries is a bigger product risk than any of the ranking
deltas on this page.
