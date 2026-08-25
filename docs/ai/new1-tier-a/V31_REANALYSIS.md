# V3 RE-ANALYSED UNDER THE CORRECT DENOMINATOR

**Date:** 25 Aug 2026 · **Lane:** NEW1 · **Deliverable:** convergence sprint V2 §7 NEW1-1 (T1.10)
**Instrument:** `services/harness/src/v31-reanalyse-v3-cli.mjs` · `v31-metrics.mjs`
**Tests:** `services/harness/src/v31-metrics.test.mjs` — 8/8 pass
**Artifact:** `docs/ai/new1-tier-a/V31_REANALYSIS.json`

> Files only. No DB, no GPU, no re-embedding — V3 already stored the per-task
> rank of every arm at every pool size, so only the statistics needed redoing.
> Run during LCC's LCC-4 quiet window precisely because it touches neither.

---

## Outcome, first sentence

**V3's point estimates and intervals are correct and now reproducible — my own
concern that they were materially too tight is REFUTED by measurement — but the
same data yields a number V3 never reported: on posed advocate questions the
best representation scores 37.8% *conditionally* and only 24.4% *end-to-end*,
because 17 of 45 posed targets are not in the index at all.**

---

## 1. The concern I raised, and the measurement that refuted it

I argued that V3's task-level intervals were too tight because 295 tasks collapse
to 211 target clusters, and that counting correlated queries as independent
authorities inflates confidence. On synthetic maximally-correlated data the
effect is real and large — cluster resampling is **2.11× wider** than task
resampling (`v31-metrics.test.mjs`).

On the **real** correlation structure it is not:

| | POSED | LIFTED |
| --- | ---: | ---: |
| cluster-vs-task interval width | **0.96× – 1.26×** | **1.04× – 1.07×** |

**V3's published intervals were not materially too tight, and I was wrong to
imply otherwise.** The tasks are far less correlated within clusters than the
worst case allows. Where I previously wrote that V3's intervals were "roughly
half as wide as they should have been", that statement is withdrawn — it was
reasoning from a synthetic bound, not from this corpus.

The check was still worth running. A negative result that costs no GPU and
removes a doubt from a launch-critical number is a good trade, and now the
denominator question is settled by evidence rather than by argument.

## 2. V3's intervals reproduce exactly

Seeded bootstrap, same data, `POSED` at pool 19,932, success@5:

| arm | V3 published | V3.1 by task | V3.1 by cluster |
| --- | --- | --- | --- |
| A_HEAD_4800 *(production)* | 2.2% [0.0, 6.7] | 2.2% [0.0, 6.7] | 2.2% [0.0, 7.0] |
| B_POOLED_ALL | 17.8% [6.7, 28.9] | 17.8% [6.7, 28.9] | 17.8% [7.0, 28.3] |
| C_POOLED_SALIENT | 15.6% [6.7, 26.7] | 15.6% [6.7, 26.7] | 15.6% [5.7, 30.8] |
| D_MULTI_3 | 28.9% [15.6, 42.2] | 28.9% [15.6, 42.2] | 28.9% [14.5, 45.9] |
| **F_ALL_CHUNKS** | **37.8% [24.4, 53.3]** | 37.8% [24.4, 53.3] | 37.8% [24.5, 53.8] |

**No point estimate moved. The arm ordering is unchanged.** V3's decision —
passages win, granularity is the lever — stands, and now stands on a replayable
interval.

## 3. The number V3 never reported, and it is the one that matters

V3 scored every arm against a pool that contains the gold. That answers *"can
this representation rank the right authority?"*. It does not answer *"would an
advocate get the right authority?"* — because a document with no vector cannot be
returned at all.

Splitting the same ranks by whether the target is actually in the production
index:

| POSED, pool 19,932 | END-TO-END | CONDITIONAL |
| --- | ---: | ---: |
| A_HEAD_4800 *(production today)* | **2.2%** | 3.6% |
| **F_ALL_CHUNKS** | **24.4%** [10.9, 40.0] | **39.3%** [23.1, 55.6] |

**17 of 45 posed tasks — 38% — have no target in the index and count as misses.**

On the LIFTED set the gap nearly vanishes (52.4% vs 53.3%; only 4 of 250 targets
missing), which is itself diagnostic: **the lifted benchmark cannot see the
reachability problem at all.** It is drawn from documents that are already
indexed. That is a second, independent reason not to quote lifted numbers as
advocate performance, on top of the leakage reason already recorded.

### What this changes in how the figure should be quoted

**37.8% is a conditional number.** I have used it myself in bus traffic
(1088/1089) without that qualifier, and it has since travelled into launch
discussion. The honest framing:

- *"Passages rank the right authority 37.8% of the time **when it is in the
  index**"* — supported.
- *"Passages would answer 37.8% of advocate questions"* — **not** supported. The
  matching figure is **24.4%**, under the condition in §4.

## 4. The condition that must travel with 24.4%

`targetInProduction` means *"this document has a HEAD:4800 vector in
`new1_doc_vector_stage`"*.

- For **arm A** that is exactly production reachability. 2.2% is the true
  end-to-end figure for what LawMind serves today.
- For **arms B/C/D/F** it is a **scenario**, not a property of the arm: V3
  re-embedded every pool document, so those arms had a vector for everything.
  Applying it to F answers *"what would an advocate get if we shipped passages
  over exactly the population HEAD has staged today?"*

So **24.4% is not a bound on a full-corpus passage build**, which would cover
more documents and score higher. It is the figure for shipping passages over
today's staged population — which is a real deployment option and the cheapest
one, so it deserves its own number.

The 100k tranche (§7 NEW1-2) is what replaces this scenario with a measurement,
because it samples gold-blind from the eligibility frame rather than inheriting
HEAD's coverage.

## 5. What did not change

- No arm ordering.
- No point estimate.
- No conclusion in `SEMANTIC_REPRESENTATION_DECISION_V3.md` about which
  representation wins.
- `adverse_authority` and `statute` remain **0 for every arm**. Nothing in this
  re-analysis touches them, and no denominator makes zero into something else.

## 6. Status against NEW1-1

- [x] Seeded, replayable bootstrap — `makeRng`, tested for determinism
- [x] Intervals by **task**, **distinct target**, and **target cluster**
- [x] Cluster denominator justified by measurement, and its effect quantified
- [x] END-TO-END vs CONDITIONAL separated and both reported
- [ ] The lab itself still draws its own pool — V3.1 is the contract, the rewire
      is not done. **No new scores were produced**; this re-analyses existing ones.
