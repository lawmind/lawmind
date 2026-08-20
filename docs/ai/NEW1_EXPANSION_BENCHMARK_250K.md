# NEW1 — the 250k expansion benchmark, and a 13.2% recall ceiling that throughput cannot lift

20 Aug 2026. `docs/ai/new1-tier-a/expansion-benchmark-250k.json`,
`docs/ai/new1-halfvec/snapshot-250k.json`,
`docs/ai/new1-rerank/gold-contract.json`.

Measured against a frozen snapshot — `new1_probe_fp32_250k`, **256,998 vectors**,
HNSW `m=16, ef_construction=64`, **`ef_search=200`, which is what
`retrieve.ts` actually runs.** Gold is NEW3's citation-verified expansion set,
684 usable rows of 750 after the contract drops 66.

---

## 1. THE FINDING — 13.2% of authorities that judges cite are refused by our own eligibility contract

Every one of the 250 gold authorities is an authority a real judge really cited.
Run each through the deployed `judgment_embedding_eligibility` view:

```
ELIGIBLE                        217    86.8%
REFUSED too short: brief         13     5.2%
REFUSED bail_order               12     4.8%
REFUSED too short: stub           5     2.0%
REFUSED procedural_disposal       2     0.8%
REFUSED axis_b_text               1     0.4%
                                ───
REFUSED total                    33    13.2%
```

**This is a ceiling, not a backlog.** Embedding the whole 8.85M manifest at
perfect quality still leaves these 33 unreachable, because the contract refuses
them before the GPU ever sees them. Nothing about throughput, recipe, index type
or reranking moves it.

The two large groups are the interesting ones:

- **12 bail orders that judges cited.** `eligibility.ts` says, in terms: "Broken
  out rather than excluded by class: bail orders are practically useful and are
  not precedent, and which tier they belong in is a retrieval measurement nobody
  has made yet." **This is that measurement.** 4.8% of a citation-verified gold
  set is a bail order, and Tier A excludes all of them. Bail is also the largest
  single class in the corpus at 515,125 rows.
- **18 judgments under 2,000 characters that judges cited.** The value band is a
  proxy for substance and it is a good one on average — but "short" and
  "not worth citing" are demonstrably different, and 7.2% of this set is the
  difference.

This is LCC's contract and the decision is LCC's. What changed today is that it is
now a decision with a number attached. It also vindicates quarantining rather than
deleting the 34,370 already-embedded `bail_order` / `procedural_disposal` vectors:
if the contract moves, they are one `INSERT ... SELECT` from being back.

## 2. Two of three query types are barely served by dense retrieval at all

Per query type, never pooled — because `exact_citation` hands the authority's own
neutral citation back as the query and `case_title` hands back its title.

```
                     queries  embedded  success@5  recall@20  present@50   MRR    nDCG@10
proposition             228      187      21.5%      28.5%      32.5%     0.175   0.190
case_title              228      187       5.7%      13.2%      17.1%     0.054   0.060
exact_citation          228      187       0.9%       1.8%       3.1%     0.003   0.004
```

Conditioned on the gold actually being embedded — the honest ranking figure,
because the unconditional one moves when coverage changes and ranking does not:

```
proposition     success@5 26.2%   recall@20 34.8%
case_title      success@5  7.0%   recall@20 16.0%
exact_citation  success@5  1.1%   recall@20  2.1%
```

**An advocate who types a citation gets 1.1% success@5 out of the vector index.**
An advocate who types a case name gets 7.0%. This is not a defect in the
embeddings — a 1024-dimension semantic vector over the string `2025:PHHC:089161`
is close to meaningless, and it should be. It is the measured, quantified case for
P12's exact and structured routes: those two query types must never reach the
dense index as their primary path, and until they have their own route the product
cannot answer the two most natural things a lawyer types.

Pooling the three into one "success@5" would have produced 9.4% — a number about
nothing, and one that would have looked like a failing embedding pipeline rather
than a missing route.

## 3. Latency at production settings

```
p50   41 ms
p95  519 ms
max 1225 ms
```

One HNSW probe over 256,998 vectors at `ef_search=200`, no reranking, while the
embedding walk had the GPU and another lane had the database. The p95 is twelve
times the p50, which is the number to watch as the index grows past 8M: it is
already the part that would decide whether this feels instant.

## 4. Index sizes, which settle half of the halfvec question

Same rows, same recipe, same graph parameters, built in one run so "same
embeddings" is structural rather than asserted:

```
                             table     HNSW index    build
fp32     vector(1024)       3388 MB     2006 MB      440.9 s
halfvec  halfvec(1024)      1375 MB      669 MB      329.7 s
                                        ───────
                                        3.0x smaller, 25% faster to build
```

3.0x is exactly the ratio measured at 620,300 chunks in the earlier probe, so the
storage side of the halfvec decision is stable across a 2.4x change in scale. What
is still owed is the QUALITY comparison at `ef_search=200` on this pair — the
previous verdict was taken at 40, which is the probes' setting and not
production's. Both arms now exist, indexed and frozen, so that run is a query
sweep rather than a rebuild.

## 5. What this does NOT say

- **Not that 21.5% is the product's success rate.** It is dense-only, no exact
  route, no sparse arm, no reranker, on a gold set of HIGH COURT authorities in
  courts chosen because they are the ones we have only just started embedding.
- **Not a scale comparison yet.** This is the first measurement on this gold and
  this contract, so it is a baseline, not a delta. The comparison the Tier-A run
  exists to make — does adding millions of judgments help — needs the same
  benchmark at 500k, 1M and 2M, which is why the funnel and the drops are recorded
  rather than the headline alone.
- **Not a measurement of uncited authority.** Every gold row here is gold because
  a judge cited it (`MIN_INBOUND=1`). Recall against authorities nobody has cited
  is invisible to this set, as it was to the reranker set before it.
- **Not clean of the corpus's date defect.** 66 rows were dropped, 65 of them
  because the cited judgment is dated AFTER the citing one. Chased to ground on the
  first: `neutral_citation` says 2025, `judgment_date` says 2026-01-12 — the edge
  is right and the DATE is wrong. That is ingest metadata, and any recency or
  currentness feature built later rests on the same field.
