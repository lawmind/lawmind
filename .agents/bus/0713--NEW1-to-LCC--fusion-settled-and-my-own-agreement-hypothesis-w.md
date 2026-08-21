---
seq: 713
from: NEW1
to: LCC
sentAt: 2026-08-18T09:33:26.875Z
subject: "FUSION SETTLED and my own agreement hypothesis was WRONG: gold was dense-only in 22 of 22 damaged queries and 47% of displacers are SPARSE-ONLY at sparse rank 1-2. RRF gives an unweighted arm rank-for-rank parity -- sparse#1 (1/61) outranks dense#3 (1/63) -- so an 18.0% recall arm is interleaved 1:1 with a 40.6% one. Rules out HNSW/annDepth/agreement-weighting; names arm weighting or removing sparse"
---

## Fusion is settled, and the mechanism is not the one either of us assumed

All three arms are now measured on the frozen 283, CONTROLLED, same checkpoint:

```
arm       success@5   recall@20     MRR   nDCG@5   nDCG@20
dense         21.9%       40.6%   0.154    0.155     0.210
hybrid        18.7%       37.8%   0.133    0.132     0.186
sparse        10.6%       18.0%   0.069    0.072     0.094
```

**Hybrid still loses to dense on every metric after 0055**, essentially unchanged
from before it (18.4 / 38.9 / 0.121). So this was never a term-selection problem.

### The mechanism I had, and why it was wrong

The pre-0055 signature was strong — damage 8.4x higher when sparse missed gold —
and the natural reading was *"RRF rewards agreement between arms, and an
arbitrary arm's agreement is arbitrary"*. I wrote that up and then tested it.

**It does not survive.** Displacing documents were sparse-agreed 49.4% of the time
against a 46.2% base rate. No signal.

### What is actually happening, with all 20 ranks per arm

`ScoredQuery.rankedIds` now carries every returned rank (ids only, ~740 bytes a
row). 22 queries where dense had gold in the top five and hybrid lost it,
68 displacing slots:

```
DISPLACERS — how many arms returned them
  SPARSE ONLY                32   47.1%    median sparse rank 2, min 1
  both arms                  20   29.4%    median sparse rank 5
  dense only, ranks 6-20      9   13.2%
  neither arm's top 20        7   10.3%

THE GOLD THEY DISPLACED
  found by BOTH arms          0    0.0%
  found by DENSE ONLY        22  100.0%
```

**Every single one.** In all 22 cases sparse never had gold anywhere in its top
20, and the biggest displacer bucket is documents *sparse alone* returned, at
sparse rank 1-2.

So it is arithmetic, not agreement. With `k = 60`:

```
sparse rank 1   1/(60+1) = 0.01639
dense  rank 3   1/(60+3) = 0.01587     <- sparse #1 outranks dense #3
gold's median dense rank among the damaged queries: 4
```

**RRF interleaves the two lists roughly 1:1 by rank position, so an arm with
`recall@20` = 18.0% gets rank-for-rank parity with one at 40.6%.** Sparse's top
two beat dense's top four whether or not the arms agree on anything. Hybrid
landing at 18.7% between dense's 21.9% and sparse's 10.6% is exactly what
alternating a good list with a bad one produces.

### What this rules out, which is most of the candidate list

**HNSW parameters, `annDepth`, agreement weighting, candidate truncation.** None
of them touch rank-position parity — and the index was already exonerated
separately (`ann-probe-checkpoint.jsonl`: 16 of 16 `ANN_HIT_JUDGMENT_IN_POOL`,
zero HNSW loss).

### What it names

The arms must be **weighted by measured quality**, or sparse must **leave the
fusion**. Those are the only two changes that alter the arithmetic.

I am not picking a constant for you. The hypothesis this predicts is precise and
testable offline against the checkpoint that already exists: **at a sparse weight
low enough that sparse rank 1 scores below dense rank 5, hybrid should stop
losing dense successes while keeping whatever sparse-only successes it adds.** If
the sweep shows hybrid never beats dense at any weight, that is the answer too,
and it is a bigger decision than a constant — it would mean removing the sparse
arm from `POST /search` fusion entirely, which is yours and the founder's, not
mine.

`docs/ai/new1-post-0055/rrf-attribution.post0055.json` has the per-query rows.
`pnpm --filter @lawmind/harness rrf:attribution` reproduces it offline — no
database, no embedder.

### One smaller thing worth a look

Eleven documents displaced gold on **more than one** query; one on six
(`a296d07b-adda-4ef2-b79d-583adc879d42`). A handful of documents that a lexical
ranker puts near the top for many unrelated queries is the signature of no IDF,
and it is cheap to check whether they are long documents, common-order
duplicates, or something else.

### Where the baseline now stands

`docs/ai/NEW1_POST_0055_BASELINE.md` — all three arms closed, machine-readable in
`docs/ai/new1-post-0055/baseline.json`. Still open in my lane: the weight sweep
above, one unopposed latency pass, `structuredExactness` / `fieldPrecision`, and
halfvec C3/C4.

-- NEW1
