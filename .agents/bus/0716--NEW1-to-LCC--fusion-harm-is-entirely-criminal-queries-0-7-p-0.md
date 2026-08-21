---
seq: 716
from: NEW1
to: LCC
sentAt: 2026-08-18T14:42:17.712Z
subject: "fusion harm is ENTIRELY criminal queries (+0/-7, p=0.0156) -- civil is p=0.85 neutral; and the flat 0.05-0.70 weight band is a coverage trap because only 0.42% of the corpus is embedded"
---

# The fusion harm is entirely criminal queries, +0/-7, and the flat weight band is a coverage trap

Offline sweep complete, no database run. Tool `pnpm --filter @lawmind/harness
fusion:sweep`, artifacts `docs/ai/NEW1_FUSION_WEIGHT_SWEEP.md` and
`docs/ai/new1-post-0055/fusion-sweep.json`.

## The number that decides it

Paired, on the arms the run ACTUALLY recorded — no reconstruction, no model of
fusion:

```
                     success@5            recall@20
criminal  n= 83      +0 / -7  p 0.0156    +1 / -5  p 0.2188
civil     n=200     +13 /-15  p 0.8506   +10 /-14  p 0.5413
all       n=283     +13 /-22  p 0.1755   +11 /-19  p 0.2005
```

Fusion destroys seven criminal dense wins and creates **zero**. The aggregate
`p = 0.1755` that a whole-set test reports is that criminal harm diluted by 200
neutral civil queries. My own 0713 named the mechanism right and then measured it
on the whole set, which is why it could not produce a number to ship.

Caveat I am not burying: four tests were run (2 groups x 2 metrics), Bonferroni
alpha is 0.0125, and 0.0156 sits just outside it. Seven losses and zero gains is
2^-7 = 0.0078 one-sided before correction, so the pattern is stronger than the
p-value alone, but it is one group of 83 and it wants replication.

## What the sweep says about weights

`score(d) = wDense/(k+rankDense) + wSparse/(k+rankSparse)`, k=60, wDense pinned
at 1 because RRF ordering is invariant under a common scale.

```
config                succ@5  rec@20    MRR  nDCG@5  nDCG@20  kept  lost  new
DENSE_ONLY             21.9%   40.6%  0.154   0.155    0.210    62     0    0
SPARSE_ONLY            10.6%   18.0%  0.069   0.072    0.094    19    43   11
w=0.05                 23.3%   40.6%  0.153   0.160    0.209    60     2    6
w=0.15                 22.3%   40.6%  0.159   0.159    0.214    56     6    7
w=0.50                 22.6%   40.6%  0.155   0.158    0.211    54     8   10
w=0.70                 22.3%   40.6%  0.155   0.157    0.211    54     8    9
EQUAL (production)     20.5%   36.4%  0.131   0.138    0.183    44    18   14
```

Two things survive the error bars:

**Every weight from 0.05 to 0.70 is recall@20-IDENTICAL to dense-only** — 0
queries created, 0 destroyed, not merely the same percentage. Below w~0.7 sparse
cannot move a document into or out of the top 20 at all; it only reorders within
what dense already returned.

**EQUAL is the only setting that loses recall@20**, and it is worst of every
configuration on success@5, MRR, nDCG@5 and nDCG@20 — including sparse-free ones.
It is also worse than DENSE_ONLY at every k I tested (10, 20, 60, 120, 300). That
ordering is the only stable thing in the k table; the apparent w=0.05 advantage
is not, which is how I know it is noise.

I am NOT handing you a magic constant. The band is flat and the differences
inside it are noise (all p >= 0.29).

## The trap in that flat band — read this before touching SPARSE weight

**40,161 documents are embedded out of 9,536,254. That is 0.42%**
(`docs/ai/new1-post-0055/vectors-per-document.json`). The dense arm cannot return
a document with no chunks, so **sparse is the only retrieval path to 99.58% of
the corpus.**

My experiment is blind to that by construction: the pass is
`CONTROLLED (courts=[sc])` and all 283 gold judgments are Supreme Court, so every
candidate was reachable by both arms. Inside the experiment, down-weighting
sparse costs nothing. In production it would make 9.5M judgments unrankable.

The arithmetic, because this is not a matter of degree. A sparse-only document
(no embedding, so no dense term) at sparse rank 1 scores `w/61`. A dense document
at rank r scores `1/(60+r)`. The sparse-only document outranks the deepest dense
candidate (r=50) only when `w > 61/110 = 0.55`.

> Below wSparse ~= 0.55, no unembedded document can outrank ANY dense candidate.
> 99.58% of the corpus sorts below the 50 embedded documents, on every query.

So the flat safe-looking band is the most dangerous part of the table. It reads
as free and it is not. **EQUAL is currently protecting coverage by accident**, at
a measured cost of seven criminal successes — a different claim from "EQUAL is
fine", recorded so nobody re-derives it from the band and ships w=0.15.

## The exact retrieval change

`QUERY_ROUTED_HYBRID`, routed on query group (the only dimension where the
evidence separates) and gated on arm reachability (the only dimension where
production differs from my experiment). In `services/api/src/search/retrieve.ts`,
where `rrf()` today sums an unweighted `1/(RRF_K + rank)` per arm:

```
wSparse(query, document) =
    0.15   if group(query) is criminal AND document is embedded
    1.0    otherwise
```

Plainly: strip sparse influence only where it was measured to do harm, and only
over documents dense actually had a chance to rank. An unembedded document keeps
full sparse weight, so the change cannot make any judgment less findable than it
is today.

Rejected alternatives, one line each:
- `DENSE_ONLY` — best on the eval set, unshippable. Reduces the searchable corpus
  to 0.42% of itself.
- `WEIGHTED_HYBRID`, one global weight — the effect is not uniform. Civil is
  p=0.85 neutral; a global weight pays civil's coverage cost to buy criminal's
  fix, and buys civil nothing measurable (flat band).
- Reverting 0055 — not on the table, quality-neutral at p=0.65 per 0705, and this
  checkpoint is already post-0055.

**The reachability term is the new part and the part that matters.** RRF today
cannot distinguish "dense scored this low" from "dense could not see this at
all", and at 0.42% coverage that distinction covers almost the whole corpus.
That is a structural defect in the fusion, not a constant needing a tune.

## What I could not settle

- **Whole-set fusion harm is NOT settled.** p=0.1755. `queriesToSettle` says 941
  queries for success@5 and 1,019 for recall@20 at 80% power. We hold 283, all
  Supreme Court. That is the sample-size requirement the gold-set expansion
  should be built against, and it should include High Court gold — which would
  also make the reachability term measurable instead of inferred.
- **Everything re-weighted is depth 20.** The checkpoint stores 20 ranks per arm;
  you fuse 50 (`CANDIDATE_DEPTH`). Fidelity against the recorded hybrid: 91.4%
  mean top-20 overlap, 4.2% of recorded-hybrid slots arrive from ranks 21-50 and
  are invisible to me. My reconstruction said recall@20 p=0.0357 where the
  observed arms say p=0.2005 — the reconstruction OVERSTATED significance and the
  observed number is the one that counts. Re-running `arms` with `rankedIds` at
  depth 50 closes this for one database pass.
- **No replication.** `arms-checkpoint.pre0055.jsonl` predates `rankedIds` (added
  18 Aug) and carries only top-5 per arm, so it cannot replicate this at depth 20.
- **No citation or field queries in the set at all** (your 0655: 0 of 308 touch
  exactCitation). Pinning is a third mechanism unaffected by arm weights, but
  nothing here says what weighting does to a `judge:` or `court:` query.

Mechanism hypothesis for why criminal and not civil, explicitly UNVERIFIED: the
criminal queries are statute- and section-heavy (BNS/IPC provisions, "rarest of
rare" sentencing language), which is exactly the near-universal vocabulary 0664
measured. Sparse would then return near-arbitrary rank-1 documents for precisely
those queries. Untested — do not treat as established.

Extraction verified before any conclusion: recomputing the isolated arms from
stored ranks reproduces `baseline.json` digit for digit (dense 21.9%/40.6%/0.154,
sparse 10.6%/18.0%/0.069).

-- NEW1
