# NEW1 — HALFVEC_TASK_FIDELITY_WARN

**Owner: NEW1.** 19–20 August 2026. C3 (ANN approximation) and C4 (end-task retrieval).
Tool: `services/harness/src/halfvec-task-probe.mjs`.
Artifact: `docs/ai/new1-halfvec/task-fidelity.json` (283 queries, `complete: true`).
Criteria, fixed before the numbers: `docs/ai/new1-halfvec/verdict-criteria.md`.

---

## THE VERDICT

**`HALFVEC_TASK_FIDELITY_WARN`**, issued by the rule as written rather than by
preference. Read the whole line before acting on the word:

> **halfvec is equal-or-better than fp32 on every end-task metric, its index is
> 3.0x smaller, and it is 23% faster — and it fails one clause of one ANN-layer
> criterion by 0.13 of a percentage point against a tolerance I set arbitrarily
> before knowing what the incumbent scored.**

The WARN is honest and the recommendation is to ship, in the narrow form below.

---

## C4 — THE END TASK, WHICH IS WHAT THE ADVOCATE SEES

283 queries, gold rank after chunk hits are folded into judgments exactly as
`retrieve.ts` folds them.

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| EXACT_FP32 (ground truth) | 22.26% | 40.99% | 0.1239 | 0.1292 | 0.1832 |
| HNSW_FP32 (**production today**) | 20.49% | 39.22% | 0.1177 | 0.1193 | 0.1736 |
| **HNSW_HALFVEC** | **20.85%** | **39.93%** | **0.1231** | **0.1245** | **0.1795** |

**halfvec beats the incumbent on all five.** One extra query in the top five, two
extra in the top twenty, and an MRR within 0.7% of exact search.

Gold-rank movement against exact: fp32 loses **5** queries out of the top five,
halfvec loses **4**. Neither arm gains any. 112 queries land at an identical rank
in both.

Judgment-level candidate overlap with exact at k=20: fp32 0.8744, halfvec 0.8652 —
0.92 points apart, inside the 2-point criterion.

---

## C3 — THE ANN LAYER, AND THE NUMBER NOBODY HAD MEASURED

Chunk-level recall against exact search over the same 620,300 vectors:

| k | HNSW_FP32 | HNSW_HALFVEC | difference | p05 (fp32 / halfvec) |
| --- | --- | --- | --- | --- |
| 5 | 0.9399 | 0.9322 | −0.78 pt | 0.60 / 0.60 |
| 10 | 0.9339 | 0.9226 | **−1.13 pt** | 0.50 / 0.50 |
| 20 | 0.9076 | 0.9012 | −0.64 pt | 0.60 / 0.50 |
| 50 | 0.9066 | 0.9030 | −0.35 pt | 0.64 / 0.62 |

**The finding here is not about halfvec.** It is that **the production HNSW graph
loses 6–9% of the true nearest neighbours at `ef_search = 40`**, and at the 5th
percentile of queries it loses **half of them**. That is a property of the index
LawMind runs today, it was not previously measured, and it costs ~1.8 points of
success@5 against exact search (22.26% → 20.49%).

Anyone reading "halfvec is approximate" should note the fp32 index it would
replace is approximate by very nearly the same amount.

---

## THE CRITERIA, SCORED HONESTLY

| criterion | result |
| --- | --- |
| 1a · halfvec ANN recall within 1 pt of fp32 | **FAIL at k=10** (1.13 pt); passes at k=5, 20, 50 |
| 1b · ANN recall not below 0.98 absolute | **FAIL** — and it fails for the INCUMBENT too (0.907–0.940). Amended 23:32, recorded not deleted |
| 2 · task success@5 / recall@20 within one query of fp32, McNemar p > 0.05 | **PASS** — halfvec is 1 and 2 queries AHEAD |
| 3 · net top-5 loss vs fp32 ≤ 1 | **PASS** — halfvec loses 4 to fp32's 5, gains 0 either way |
| 4 · judgment overlap at k=20 within 2 pt | **PASS** — 0.92 pt |

An ANN-layer failure with intact task metrics routes to **WARN** by the rule
written before the run. I am not moving the threshold to buy a PASS; a criterion
adjusted after seeing the result is not a criterion.

**But the WARN must be read for what it is.** Clause 1b fails for both arms and
therefore says nothing about the representation. Clause 1a fails by 0.13 pt at one
k out of four, in a measurement whose own p05 spread is 40 points wide. On the
evidence that bears on the decision — the task the advocate performs — halfvec is
ahead.

---

## COST, MEASURED

| | HNSW_FP32 | HNSW_HALFVEC |
| --- | --- | --- |
| index size | **4,839 MB** | **1,613 MB** (3.0x smaller) |
| table size | 3,340 MB (narrow fp32 copy) | 1,711 MB |
| build time | not rebuilt (production) | 374.8 s, identical `m=16, ef_construction=64` |
| query p50 | 5,962 ms | **4,579 ms** (23% faster) |
| query mean | 6,426 ms | 5,205 ms |

Latency was NOT a criterion and should not be quoted as a headline: the box
carried NEW2's ingest fleet throughout. But both arms carried it equally, and the
smaller index winning by 23% is the direction physics predicts.

At Tier-A scale the index difference is the whole argument: 3.0x on a
44M-vector index is the difference between a graph that fits in RAM and one that
does not.

---

## RECOMMENDATION

**Use halfvec for the Tier-A document-vector population.** It is task-equal-or-
better, three times smaller, and faster, measured on 283 queries against an exact
ground truth.

**Do NOT rebuild the production `judgment_chunks` index on this evidence.** That
population is the old chunk architecture, it is frozen at 620,300 vectors by a
founder decision, and rebuilding a 4.8 GB index buys a saving on a population that
is being superseded. The place halfvec pays is the population that does not exist
yet.

**What this verdict does not transfer to.** The population measured is Supreme
Court chunk vectors. Tier-A document vectors are a different distribution — one
vector per document, all courts, HEAD spans rather than chunks — and the same
probe runs against any table, so re-measuring there is cheap and should be done
before 8.85M vectors are committed to a representation.

**Two things worth someone's time, neither of them halfvec's problem:**

1. **`ef_search = 40` is costing ~1.8 points of success@5.** Nobody chose 40 on
   evidence; it is pgvector's default. A sweep is cheap and this is the first
   measurement showing it matters.
2. **The p05 tail.** Half the true neighbours are lost on the worst 5% of queries,
   in both graphs. A mean of 0.94 hides that completely.

---

## ONE RESULT THAT LOOKS WRONG AND IS NOT

Mean gold-rank delta against exact is **negative** for both approximate arms
(−10.1 fp32, −8.4 halfvec) — the ANN arms rank gold *better* than exact search
does. That is not an error and not a paradox.

Exact search returns the 2,000 genuinely nearest CHUNKS, and those cluster into
fewer documents; the collapse to judgments therefore yields a shorter list in
which gold sits deeper. The approximate graph returns a more diverse chunk set,
which spreads across more documents and pushes gold up the judgment list. **The
approximation is losing chunks that were redundant at the judgment level** — which
is a fact about the chunk→judgment collapse, not about vector precision, and it is
worth remembering the next time recall@k on chunks is used as a proxy for anything
the advocate sees.
