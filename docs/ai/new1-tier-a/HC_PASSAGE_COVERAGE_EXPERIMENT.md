# HC PASSAGE COVERAGE EXPERIMENT — the cheapest path to passage sensitivity

**Date:** 24 Aug 2026 · **Lane:** NEW1 · **Deliverable:** §7 NEW1-2
**Evidence:** `docs/ai/new1-tier-a/representation-lab-v3.json` (same run) ·
`SEMANTIC_REPRESENTATION_DECISION_V3.md`

> The question as the brief put it:
> *"Can LawMind materially improve posed-question retrieval with a few passages
> per selected document or pooled chunk representation without a 50+ GPU-day /
> 100+ GB full-corpus passage build?"*

---

## Outcome, first sentence

**The premise of the question is wrong in the direction that makes the answer
easy: a full-corpus passage build is not 50+ GPU-days and 100+ GB — it is
~18 GPU-days and 61 GB, it costs the SAME GPU time as the pooled alternative,
and the pooled alternative is 20 points worse.** There is no cheap middle to
find, because the expensive part is not the passages.

---

## 1. Why no separate experiment was built

The brief proposed extending `judgment_chunks` over a chosen HC slice and
comparing against document-vector re-pooling on the same documents. That
comparison is **exactly** arms F and B of the V3 representation lab: same
documents, same queries, same pool, one run. Building a second instrument to
re-ask a question already on the bench would have spent GPU to learn nothing.

What follows is that run read as a build/no-build decision, plus the cost
arithmetic the decision needs.

## 2. The measurement, on the same documents

Posed advocate questions, 19,932-document pool with real hard negatives:

| arm | vectors/document | posed s@5 | posed r@500 | lifted s@5 |
| --- | ---: | ---: | ---: | ---: |
| A HEAD:4800 — *production today* | 1.00 | **2.2%** | 35.6% | 23.2% |
| B POOLED_ALL — *re-pooling* | 1.00 | 17.8% | **95.6%** | 40.4% |
| D MULTI_3 — *3 stored vectors* | 3.00 | 28.9% | 80.0% | 48.4% |
| **F ALL_CHUNKS — *every passage*** | **3.39** | **37.8%** | 91.1% | **53.2%** |

**Re-pooling buys 15.6 points over production. Passages buy another 20.0 on top
of that.** The brief's hypothesis — that pooled re-representation might get most
of the way for free — is measured and rejected: it gets 44% of the way.

## 3. The cost arithmetic, which is the actual finding

Measured in the run: **3.392 chunks per document**, **7,399 characters embedded
per document**. The walk's own accounting: ~993 tokens per 4,800-character head,
~8,700 tok/s sustained on this GPU. Tier-A deduplicated population **8,854,281**
(prior lane measurement, not re-derived here).

| build | vectors | halfvec storage | GPU-days | posed s@5 |
| --- | ---: | ---: | ---: | ---: |
| A HEAD:4800 — the walk running today | 8.85M | 18 GB | 11.7 | 2.2% |
| B POOLED_ALL | 8.85M | 18 GB | **18.0** | 17.8% |
| D MULTI_3 | 26.6M | 54 GB | **18.0** | 28.9% |
| **F ALL_CHUNKS** | **30.0M** | **61 GB** | **18.0** | **37.8%** |

### The line that decides it

**B, D and F cost identical GPU time.** Every one of them must embed every chunk
of every document; a pooled vector *is* the mean of the chunk vectors. They
differ only in what is retained afterwards. **B discards 2.39 of every 3.39
vectors it has already paid to compute, and loses 20 points of s@5 doing it.**

So the decision is not "passages versus pooled". It is:

> **6.3 additional GPU-days and 43 GB of disk over the head-only walk already in
> progress, in exchange for 2.2% → 37.8% posed s@5 at 19,932-document pool
> scale.**

61 GB against 290 GB free. **Storage was never the constraint**, and the
"40–45M vectors / 100+ GB" figure that shaped this question came from an
assumed chunk count, not a measured one. The measured count is 3.39 per
document, not ~15.

## 4. Cost per point of advocate-task improvement

| step | GPU-days | posed s@5 gained | GPU-days per point |
| --- | ---: | ---: | ---: |
| A → B (re-pool, same storage) | +6.3 | +15.6 | 0.40 |
| B → D (keep 3 vectors) | +0.0 | +11.1 | **0.00** |
| D → F (keep every chunk) | +0.0 | +8.9 | **0.00** |
| **A → F total** | **+6.3** | **+35.6** | **0.18** |

**Once the chunks are computed, every further point is free.** The only real
expenditure is the decision to read whole documents instead of their first 4,800
characters.

## 5. Recommendation: BUILD, at passage granularity, and not the middle option

**Build F.** It is the measured winner on every posed metric except
`supporting_authority`, costs the same GPU as the pooled alternative, decays
slowest with pool size (per-decade factor 0.838 against B's 0.722), and its
storage is a rounding error against free disk.

**Do not build a "bounded HC slice" as a hedge.** A slice was the right idea when
the full build looked like 50 GPU-days; at 18 it buys a delay rather than a
saving, and a partial index has a failure mode the numbers here make vivid — a
document absent from the index is unreachable by every arm at every rank, and
**8 of 20 posed targets are already in exactly that state.** Partial coverage is
the problem, not the mitigation.

**Do not promote the current staged HEAD:4800 vectors** on the way. They are the
weakest arm measured and the walk is currently 1,098,028 rows into producing more
of them. Whether that walk continues as-is, restarts on the whole-document
recipe, or runs to completion first is a **sequencing question for the founder
and LCC**, not a NEW1 call — but nothing built on HEAD:4800 should be exposed.

**If storage ever becomes a constraint**, D_MULTI_3 is the fallback: 54 GB,
−8.9 points, same GPU.

## 6. What this does NOT claim

- **Not a corpus-scale result.** 19,932 documents is 0.23% of Tier A. Every arm
  was still losing ground at the largest pool measured, and the extrapolation in
  `SEMANTIC_REPRESENTATION_DECISION_V3.md` §5.1 is explicitly labelled weak.
- **Not a latency claim.** Nothing here was measured against an HNSW index. A
  30M-vector HNSW build has its own build time, RAM footprint and query cost,
  none of which are measured. The 1M halfvec checkpoint (§7 NEW1-7) is the
  instrument for that and is deferred, not done.
- **Not an index-design claim.** 30M vectors in one HNSW index, per-document
  max-pooling at query time, and de-duplicating a document that matches on
  several passages are all real engineering questions this experiment does not
  touch. Scoring here was exhaustive cosine with max-pooling in memory.
- **n = 45 posed, 20 distinct targets.** The CIs are wide and printed with every
  figure in the decision document. `adverse_authority` and `statute` score zero
  for every arm, so "F wins" is a statement about doctrine, fact patterns and
  current-law questions, not about all advocate work.
- **The GPU-day figures are engineering estimates** from this box's sustained
  throughput and the walk's measured tokens-per-character. They are not a
  schedule and they assume the sidecar keeps its current rate for the whole run.
- **`judgment_chunks` was not extended.** The shipped passage table holds 620,300
  chunks over 40,161 documents — 0.45% of Tier A — and only 4 of the 20 posed
  targets. Arm F re-embedded chunks in-memory for the pool rather than reading
  that table, so this experiment says nothing about the quality of what is
  already stored there.
