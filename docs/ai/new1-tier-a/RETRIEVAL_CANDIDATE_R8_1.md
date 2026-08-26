# RETRIEVAL_CANDIDATE_R8_1 — FROZEN

**Deliverable:** R8.1 §6.9 · **Lane:** NEW1 · **Frozen:** 2026-08-26T02:10Z
**Evidence:** `PASSAGE_100K_VALIDATION_V1` · `PASSAGE_INDEX_BUILD.json` ·
`COMMON_QUERY_ARMS.json` · `HEAD_VS_PASSAGE_DECISION_V2`

Frozen means **NEW1 will not change these values without publishing a new version and
telling LCC, NEW2 and FIFTH.** It does not mean deployable — §4.

---

## 1. The candidate

| parameter | value | why this and not another |
|---|---|---|
| representation | **passage**, `chunk.ts/defaults@F_ALL_CHUNKS` | cond s@5 0.3831 vs HEAD 0.2409, non-overlapping CIs, 3× faster |
| index | **HNSW**, `m=16`, `ef_construction=64` | built fresh on the complete table in 224.6 s; no alternative was measured |
| `ef_search` | **200** | recall@100 vs exact **0.8631**; at 40 it is **0.3336** |
| embedding | 1024-d `float4`, CLS-pooled, L2-normalised, GPU sidecar | unchanged; a query embedded elsewhere than the corpus is the failure the module exists to prevent |
| retrieval depth | 500 | `cond s@500` still rising for `exact` (0.7322), so depth is not the binding constraint |
| fusion | **candidate, not frozen** | dense+lexical delta vs ANN alone is **+0.0042** mean on-concept — `SHIP-CANDIDATE`, not a win |
| exact arm | **instrument only, never deployed** | p50 **1,709 ms**, up to 2,634 ms on some families |

**Segmentation identity is part of the candidate.** `chunk.ts` is frozen; if
`SEGMENTATION_V2_EXPERIMENT_DESIGN` changes it, this candidate is re-measured, not adjusted.

---

## 2. Measured behaviour this candidate is committing to

Everything below is `ann_ef200` on 418,116 passages over 81,720 documents.

| | value |
|---|---|
| cond s@5, benchmark | **0.3831** [0.3265, 0.4444] over 211 clusters |
| **cond s@5, production-route-reachable** | **0.3715** over the 288 of 295 tasks ≤ 500 chars — §3.8 |
| cond s@1 / s@20 / s@100 | 0.2678 / 0.4814 / 0.5966 |
| e2e s@5 | 0.0136 — **floor by construction**, 210 of 213 gold targets forced |
| zero-result rate | **0 of 295** |
| latency p50 / p95 | 107 ms / 309 ms, `LOCAL_QUIET`, one box |
| common legal queries answered | **48 of 48** |
| mean on-concept @10 | **0.9562** |
| wrong-domain hits | **0 of 4 probes** |
| sparse-guard refusals | **14 of 48 (29.2%)** — production's rule, unchanged by index size |

---

## 3. Known failures this candidate carries into any gate

Named here so no aggregate can hide them.

1. **`supporting_authority`: 0/6 at rank 5, 20 and 100 on this candidate** — but **0.3333
   at rank 500**, and `exact` reaches **0.1667 at 100 and 0.6667 at 500**. Target in the
   index for all six. **The authorities are findable and rank between 100 and 500**, so
   this is a ranking failure at every depth a human reads, not an absence — and ANN's
   recall loss falls hardest on the family that was already weakest.
2. **`adverse_authority`: 0 at rank 5** (0.25 @20, 0.50 @100), n = 4.
3. **`statute`: 0 at rank 5** (0.3333 @20), n = 3.
4. **All three n are far too small to state a rate** — 95% upper bounds of roughly 0.50,
   0.75 and 1.0. The evidence is the consistent direction across independent attempts, not
   the individual numbers. **A larger task set is owed before any G3 verdict rests on them.**
5. **29.2% of common legal queries are refused by the sparse guard**, concentrated in the
   most ordinary practice areas: all four bail, three of four anticipatory bail, three of
   four quashing-FIR. Driver is `min(df)`, not query length. Passage ANN answers all 14 of
   them on-concept — which is the argument for the passage path, and does not by itself
   fix the refusal.
6. **1.80% of passages (7,535 of 418,116) carry `char_offset = -1`** and cannot support a
   pinpoint citation.
7. **24.40% of tranche passages must never be shown as the court's own reasoning** —
   `PARTY_SUBMISSION` 19.38%, `CASE_HEADER` 15.47%, `REPORTER_EDITORIAL` 1.57% — against
   `COURT_REASONING` at **1.15%**. Measured on this exact tranche by NEW2 (bus 1282).
   Classifier precision is `NOT_MEASURED` and top-k is still pending. See §4.
8. **7 of the 295 benchmark tasks exceed production's 500-character bound** and cannot
   enter `/search` at all — including **3 of 3 `long_narrative` and 2 of 3
   `pasted_passage`**, two of the three best-scoring families. They score 0.8571 against
   0.3715 for the rest, so they inflate every aggregate. §3.8.

---

### 3.8 The production-route figure

Production rejects queries over 500 characters. 288 of 295 tasks sit inside that bound, so
the supported band is well covered — but the 7 outside it are the **easiest** queries in
the set, long verbatim passages that nearly duplicate their target.

    all 295 tasks          cond s@5  0.3831
    route-reachable (288)  cond s@5  0.3715   <- what an advocate would experience
    route-refused (7)      cond s@5  0.8571

**`0.3715` is the number that describes the product.** `0.3831` is the benchmark number
and stays in §2 because it is what the frozen artifact contains. Per FIFTH's bus 1264, a
route-refused query is a REFUSAL outcome scored separately — never a success, never a miss.

---

## 4. This is a candidate, not a deployable setting

- **The tranche index is not the production index.** 418,116 passages over 81,720
  deliberately era-skewed documents. Score distributions, `ef_search` behaviour and
  latency all move with index size and composition — recall@100 already fell from 0.889 at
  66k to 0.8631 here at the same `ef_search`.
- **Local timings stay local labels.** Never quoted as mobile latency.
- **A full-corpus passage build is not recommended and does not fit** —
  `HEAD_VS_PASSAGE_DECISION_V2`.
- **Partly answered, and it moved against me.** NEW2 has measured passage roles on **this
  exact tranche** (bus 1282): `REPORTER_EDITORIAL` **1.57%** against the 0.10% I was
  quoting, and **24.40% unsafe in total** once party submission and case headers are
  counted. `COURT_REASONING` is **1.15%** — the thing an advocate actually wants is a very
  thin slice of what this index contains. The substitute frame understated every unsafe
  class.

  **Still `NOT_MEASURED`: top-k.** The pool rate cannot answer the safety question,
  because 19% party submission is only dangerous if it is what ranks first — and counsel
  submissions read like confident legal propositions, which is precisely what an embedding
  model rewards. Until NEW2's top-k run lands, §2 stays `PASS_AT_MEASURED_SCOPE` with an
  attribution risk that is now **bounded in the pool but unquantified at the point of use**.
