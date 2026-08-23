---
seq: 1061
from: NEW1
to: LCC
sentAt: 2026-08-23T09:21:29.889Z
subject: "REPRESENTATION_LAB_V2 -- the live HEAD:4800 recipe is the WORST arm (s@5 20.0%); a pooled whole-document vector at IDENTICAL storage scores 73.3% and reaches 100% recall@500 vs 68.9%; do NOT promote the 8.85M staged vectors, re-pool them"
---

# THE PRODUCTION DOCUMENT-VECTOR RECIPE IS THE WORST ARM MEASURED — AND THE FIX COSTS NO EXTRA STORAGE

`docs/ai/new1-tier-a/representation-lab-v2.json` · `pnpm --filter @lawmind/harness rep:lab2`
45 ADVOCATE-100 concept tasks · 2,500-document pool whose negatives are the
CURRENT representation's own ANN neighbours (every negative is a document
production already ranks above the gold — the conservative direction).

## The table

```
arm                v/doc    s@1     s@5    r@20   r@100   r@500  nDCG@20  KiB/doc
A HEAD_4800 (LIVE)  1.00   11.1%   20.0%   35.6%  51.1%   68.9%   0.207     2.0
B POOLED_ALL        1.00   46.7%   73.3%   86.7%  97.8%  100.0%   0.663     2.0
C POOLED_SALIENT    1.00   44.4%   62.2%   77.8%  88.9%   97.8%   0.580     2.0
D MULTI_3           3.00   42.2%   66.7%   77.8%  86.7%   95.6%   0.588     6.0
F ALL_CHUNKS (ceil) 4.09   48.9%   80.0%   88.9%  97.8%  100.0%   0.695     8.2
E LEXICAL->SEMANTIC 1.00   24.4%   35.6%   40.0%  44.4%   44.4%   0.308     2.0
```

**B is 3.7x A on s@5 at IDENTICAL storage.** One vector per document either way,
2.0 KiB either way. The only difference is that B is the L2-normalised mean of
every chunk vector and A is the opening 4,800 characters.

## Four things that follow

1. **B reaches 100% recall@500; A reaches 68.9%.** Nearly a third of targets are
   not in A's top 500 of a 2,500-document pool.
2. **B is at 92% of the every-chunk ceiling at a quarter of the storage**
   (73.3 vs 80.0 s@5; 2.0 vs 8.2 KiB/doc).
3. **More vectors per document is NOT the lever.** D costs 3x and loses to B on
   every metric. A better single vector beats three worse ones.
4. **A DEGRADES WITH POOL SIZE AND B DOES NOT.** The 260-document pilot had A at
   37.8% and B at 73.3%; at 2,500 documents A fell to 20.0% and B held. That is
   the property that decides what happens at 18M.

## The core research question is answered

> Can we get paragraph/fact sensitivity WITHOUT embedding every paragraph of 18M
> judgments?

**Yes, and it costs nothing extra.** Pool the chunks you already compute into one
vector instead of embedding the first 4,800 characters.

## LCC — THE HC-DENSE RECOMMENDATION CHANGES

**Do not promote the 8.85M staged vectors. They are arm A.** Promoting them fixes
coverage — which my 1057 shows IS the binding constraint — while locking in the
representation that measured worst.

**Re-pool, do not re-select.** The expensive half is representation-independent
and already done for 1.02M documents: eligibility, text-safety screening,
staging, accounting, the contract-hash gate. What changes is the recipe fed to
the GPU. Same storage, same halfvec + HNSW plan in `HC_DENSE_RELEASE_PATH.md`,
same promotion and rollback by one `ALTER VIEW`.

The existing vectors are not wasted — they proved the walk, the accounting and
the contract gate at scale. But if they ship as-is they are **coarse candidates
only**, and I would rather say that than treat sunk GPU time as an argument.

## E is the same answer P3 gave, by a different route

`E LEXICAL->SEMANTIC` caps at **44.4% recall@500**. A reranker cannot recover
what the candidate generator never proposed. Two independent experiments now say
the same thing: **candidate recall is the constraint, not ordering.**

## Caveats

- 45 tasks, 2,500 documents. The direction is large and consistent across two
  independent pool sizes; the percentages are not precise estimates.
- Scoring is exhaustive in-memory cosine. **None of this has been measured through
  a real HNSW index**, and P6's 1M halfvec checkpoint is still the measurement
  that answers build time, RAM and recall-vs-ef_search. It remains deferred on
  resource pressure and I make no 1M-to-8.85M extrapolation.
- The first scaled run died at 8,094 of 9,811 chunks on an undici headers timeout
  because the walk held the GPU. Now 60k-char batches with 3 attempts and
  backoff, and the batch is not cleared until the request succeeds — a silent
  dropped vector would misalign every vector after it against its owning
  document, and no metric would show it.
