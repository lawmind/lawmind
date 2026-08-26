# PASSAGE_100K_VALIDATION_V1

**Deliverable:** R8.1 §6.9 · **Lane:** NEW1 · **Date:** 26 August 2026
**Source:** `PASSAGE_100K_METRICS.json`, built 2026-08-26T01:55:23Z
**Index:** 418,116 passages over 81,720 documents · tranche `b8b9773583…` · `buildComplete: true`
**HNSW:** `m=16`, `ef_construction=64`, built fresh on the complete table in 224.6 s

---

## 1. Outcome

**Passage retrieval beats whole-document retrieval by a margin whose confidence intervals
do not overlap**, and it does so while being 3× faster. That is the round's positive
result and it is the strongest evidence yet for the passage representation.

**And three families score zero, one of them zero all the way to rank 100.** The runbook
hoped the partial index's `adverse_authority 0.25` and `statute 0.33` would hold at full
scale and called that "the sprint's headline." **It did not hold.** The honest headline is
the opposite one, and Fifth predicted the mechanism in bus 1255 before the numbers existed.

---

## 2. END_TO_END and CONDITIONAL, together — never one alone

| arm | e2e s@1 | e2e s@5 | **cond s@1** | **cond s@5** | cond s@20 | cond s@100 | cond MRR | p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `exact` | 0.0068 | 0.0136 | **0.2746** | **0.4034** | 0.5186 | 0.6542 | 0.3349 | 1709 | — |
| `ann_ef200` | 0.0068 | 0.0136 | **0.2678** | **0.3831** | 0.4814 | 0.5966 | 0.3216 | **107** | 309 |
| `ann_ef40` | 0.0068 | 0.0136 | 0.2339 | 0.3356 | 0.4136 | 0.4305 | 0.2788 | 2 | 3 |
| `head_ef200` | 0 | 0.0136 | 0.1423 | 0.2409 | 0.3358 | 0.4708 | 0.1924 | 300 | 505 |

**END_TO_END is a near-floor number by construction and must never be quoted alone.** Of
213 gold targets, **210 are forced and 3 are natural** — the draw is gold-blind over 8.85 M
documents, so a forced target is an END_TO_END miss by definition. `e2e_s@5 = 0.0136` is
measuring the draw, not the retriever. CONDITIONAL is the informative column.

**Zero-result rate is 0 for every arm on all 295 tasks.** No arm ever returned nothing.

### cond s@5 with 95% CI, bootstrapped over TARGET CLUSTERS

| arm | cond s@5 | 95% CI | clusters |
|---|---:|---|---:|
| `exact` | 0.4034 | [0.3478, 0.4634] | 211 |
| `ann_ef200` | 0.3831 | [0.3265, 0.4444] | 211 |
| `ann_ef40` | 0.3356 | [0.2821, 0.3962] | 211 |
| `head_ef200` | 0.2409 | [0.1845, 0.2978] | 200 |

Bootstrapped over clusters, not tasks: two tasks sharing an authority are not independent
observations.

---

## 3. Passage vs HEAD — the positive result, and its one real asymmetry

`ann_ef200` **0.3831 [0.3265, 0.4444]** against `head_ef200` **0.2409 [0.1845, 0.2978]**.
A 59% relative improvement, and **the intervals do not overlap.**

**The asymmetry, stated because it cuts in the passage build's favour and would otherwise
look like something I hid.** The two arms are scored against different indexes:

| | passage arms | HEAD arm |
|---|---:|---:|
| documents in arm index | 81,720 | **20,947** |
| tasks whose target is in that index | 295 | **274** |

CONDITIONAL for each arm is scored against **its own** reachable set, which is the correct
treatment — but it means HEAD is being scored on a **smaller, easier index with a quarter
of the distractors**, over a denominator of 274 rather than 295. **It still loses by 59%.**
An easier index that scores lower is a stronger result for passages than a like-for-like
comparison would have been, not a weaker one.

**What this does NOT license.** HEAD's index is the documents that already had a
whole-document vector; it is not a fresh HEAD build over the same 81,720. This says
*passage beats the HEAD representation we actually have*, not *passage beats HEAD in
principle*.

---

## 4. Per family — read this before any aggregate above

R8.1 §G3: **no aggregate may hide a zero family.** Three do not hide.

| family | n | in index | c@5 | c@20 | c@100 | e2e@5 | HEAD c@5 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `current_law` | 4 | 4 | **0.75** | 1.0 | 1.0 | 0.25 | 0 |
| `long_narrative` | 3 | 3 | 0.6667 | 0.6667 | 0.6667 | 0 | 0.3333 |
| `pasted_passage` | 3 | 3 | 0.6667 | 1.0 | 1.0 | 0 | 0.5 |
| `lifted` | 77 | 77 | 0.4545 | 0.5195 | 0.6104 | 0 | 0.2838 |
| `proposition` | 86 | 86 | 0.3837 | 0.4651 | 0.5698 | 0.0116 | 0.1744 |
| `legal_issue` | 87 | 87 | 0.3563 | 0.4483 | 0.5747 | 0.0115 | 0.2907 |
| `doctrine` | 12 | 12 | 0.3333 | 0.6667 | 0.9167 | 0.0833 | 0.2857 |
| `fact_pattern` | 10 | 10 | 0.30 | 0.40 | 0.70 | 0 | 0 |
| **`statute`** | 3 | 3 | **0** | 0.3333 | 0.3333 | 0 | 0.3333 |
| **`adverse_authority`** | 4 | 4 | **0** | 0.25 | 0.50 | 0 | 0 |
| **`supporting_authority`** | 6 | 6 | **0** | **0** | **0** | 0 | 0 |

### 4.1 `supporting_authority` is the finding — and it is a RANKING failure, not a retrieval one

**Corrected on review before publication.** My first reading of this row was "zero, full
stop." Checking every depth rather than the three in the summary table says something
different and more useful:

| arm | c@5 | c@20 | c@100 | **c@500** |
|---|---:|---:|---:|---:|
| `ann_ef200` | 0 | 0 | **0** | **0.3333** |
| `exact` | 0 | 0 | **0.1667** | **0.6667** |
| `head_ef200` (4 of 6 in index) | 0 | — | — | — |

**The authorities are there and they are findable — they rank between 100 and 500.**
`exact` recovers 4 of 6 by depth 500. So this is not a coverage wall (target in index for
all six) and it is not the retriever failing to hold the document. **It is a ranking
failure at every depth a human being would ever read.**

That distinction matters for what fixes it. A representation failure would need a
different representation; a ranking failure at depth 100–500 is the shape a reranker
addresses — **and the reranker program is forbidden this round** (R8.1 §17). This is
recorded as a pointer for the round that is allowed to test it, not as a proposal.

**`ann_ef200` is also strictly worse than `exact` here** — 0 vs 0.1667 at 100, 0.3333 vs
0.6667 at 500 — so ANN's recall loss falls hardest on exactly the family that was already
weakest.

"Find me an authority that supports this proposition" is not an exotic query. It is close
to the centre of what an advocate wants, and at usable depth we return nothing for it.

### 4.2 The runbook's hoped-for headline is refuted, and Fifth called the mechanism first

The runbook said: *"`adverse_authority` and `statute` were ZERO for every representation
ever tested on this project; on the partial index they read 0.25 and 0.33. If that holds
at full scale it is the sprint's headline."*

At full scale both read **0 at rank 5**. The partial-index signal did not survive.

**Why it was never real, per Fifth's bus 1255:** the CLI embeds
`ids = [...forced, ...natural]`, so the partial index was **forced-complete plus a uniform
natural prefix** — every gold target was present from the first minute while only a
fraction of the distractors were. A score computed there is biased toward gold
availability by construction. Fifth published that before these numbers existed, and this
is what it looks like when the bias is paid off.

**I had quoted those partial numbers as a possible headline. They were an artifact.**

### 4.3 What the zeros do and do not support

With 0 successes the 95% upper bound is roughly `3/n`:

| family | n | 0 successes → 95% upper bound on the true rate |
|---|---:|---|
| `supporting_authority` | 6 | ≤ 0.50 |
| `adverse_authority` | 4 | ≤ 0.75 |
| `statute` | 3 | ≤ 1.0 |

**These n are far too small to state a rate.** `statute` at n = 3 supports essentially no
claim at all. What survives the small-n objection is narrower and still serious:

- `supporting_authority` is **0/6 at rank 100 on `ann_ef200`** while `exact` finds 1 and
  reaches 4 by rank 500 — so the signal exists and is being lost by ranking and by ANN
  recall, not by absence. That is a sharper observation than a bare zero.
- All three families were zero **before** this build too. The consistent direction across
  independent attempts is the evidence; the individual rates are not.

**`supporting_authority`, `adverse_authority` and `statute` need a larger task set before
any G3 verdict rests on them.** That is a Gold-coverage request, and it belongs to
NEW2/Fifth.

---

## 5. ANN vs exact

| | recall@100 vs exact | cond s@5 | p50 |
|---|---:|---:|---:|
| `ann_ef200` | **0.8631** | 0.3831 | 107 ms |
| `ann_ef40` | **0.3336** | 0.3356 | 2 ms |

**`ef_search=40` loses two thirds of the exact top-100 and it is the probe harness's
default, not production's.** Production `retrieve.ts` runs 200. Every ANN number in this
project must name its arm; a probe figure quoted as production is a 67% error.

**ANN at ef200 costs 0.0203 absolute cond s@5 against exact (0.4034 → 0.3831, a 5%
relative loss) and buys a 16× latency improvement** — 1,709 ms → 107 ms p50.
`exact` reaches 1,991–2,634 ms p50 on some families. **`exact` is a measurement
instrument, not a deployable arm.**

Recall@100 also **fell** from 0.889 on the 66k prefix to 0.8631 here. Larger index, same
`ef_search`, lower recall — the expected direction, and a reason not to treat any single
`ef_search` as settled at a different scale.

---

## 6. What this artifact does not claim

- **Nothing about the corpus.** 81,720 documents drawn with a deliberate era skew (5%
  pre-1990 against a 0.08% corpus share). No corpus-wide rate may be quoted from it.
- **Nothing about production latency.** `LOCAL_QUIET`, one box, a tranche-sized index.
  Local timings stay local labels.
- **No hidden-holdout result.** Fifth owns that and it has not been run.
- **No claim that 0.3831 is good enough.** It is a measurement. Whether it clears G3 is
  Fifth's adjudication against preregistered criteria, and R8.1 §G3 explicitly forbids
  reusing a stale 70% threshold against a benchmark with a different measured ceiling.
- **Reporter contamination is unmeasured on this tranche.** NEW2's 0.10% figure was
  measured on the vector stage where the Supreme Court is 0.49% of rows; the SC corpus is
  92.77% SCR reporter edition. §7.7 of R8.1 requires re-measurement on this exact tranche,
  top-k rather than pool base rate, SC separately from HC. **Until that runs, these
  retrieval numbers do not distinguish a court's reasoning from a reporter's headnote.**
- **2.53%→1.80% of passages carry `char_offset = -1`** (7,535 of 418,116) and cannot
  support a pinpoint citation. The cause is known and deferred: `SEGMENTATION_V2_EXPERIMENT_DESIGN`.
