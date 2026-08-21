# NEW1 — OFFLINE FUSION WEIGHT SWEEP

**Owner: NEW1.** Written 18 August 2026. Offline: no database run, no embedder,
no network. Every figure is recomputed from `arms-checkpoint.jsonl`, the frozen
283-query CONTROLLED pass whose arm-level results are already recorded in
`docs/ai/NEW1_POST_0055_BASELINE.md`.

Tool: `pnpm --filter @lawmind/harness fusion:sweep`
(`services/harness/src/fusion-sweep-cli.ts`).
Artifact: `docs/ai/new1-post-0055/fusion-sweep.json`.

---

## THE HEADLINE

**The fusion defect is not uniform. It lives entirely in criminal queries, and
in that group it is one-sided: production fusion destroys 7 dense wins and
creates 0.**

| paired, recorded arms | n | success@5 | McNemar exact p |
| --- | --- | --- | --- |
| **criminal** | 83 | **+0 / −7** | **0.0156** |
| civil | 200 | +13 / −15 | 0.8506 |
| all | 283 | +13 / −22 | 0.1755 |

The aggregate `p = 0.1755` that a whole-set comparison reports is a **real
criminal harm diluted by 200 neutral civil queries.** Bus 0713 named the
mechanism correctly and then measured it on the wrong population — the whole
set — which is why it could not produce a number to ship.

**Production recommendation: `QUERY_ROUTED_HYBRID`.** Evidence and preconditions
below; the precondition is load-bearing and the change must not ship without it.

---

## WHAT WAS MEASURED, AND WHAT WAS RECONSTRUCTED

Two different classes of evidence appear below and they are not equally strong.
Kept separate deliberately.

**OBSERVED (strongest).** The checkpoint records the hybrid arm production
actually ran, at its full depth, beside the dense arm from the same run. Paired
per query, this needs no model of fusion at all. Every headline number above is
of this kind.

**RECONSTRUCTED.** Re-weighting requires recomputing RRF from stored ranks. RRF
is a function of ranks only, so this is exact — except that the checkpoint stores
**20 ranks per arm** while production fuses **50** (`CANDIDATE_DEPTH`,
`services/api/src/search/retrieve.ts`). The sweep is therefore fusion
**restricted to depth 20**.

The fidelity of that restriction was measured before any conclusion was drawn
from it:

| | |
| --- | --- |
| mean top-20 overlap, reconstruction vs recorded hybrid | 91.4% |
| identical top 5 | 90/283 |
| recorded-hybrid slots in NEITHER stored arm (arrived from ranks 21–50) | 237/5,659 = **4.2%** |
| recorded hybrid | success@5 18.7% · recall@20 37.8% · MRR 0.133 |
| reconstructed EQUAL | success@5 20.5% · recall@20 36.4% · MRR 0.131 |

So reconstruction carries roughly **±2 points** of absolute error against the
real system. Relative comparisons inside the sweep are all computed under the
same restriction and are internally consistent; **absolute figures from the
sweep should not be quoted as production numbers.**

**The reconstruction overstated significance and that correction is recorded
rather than quietly dropped.** Reconstructed EQUAL vs DENSE_ONLY returns
recall@20 `p = 0.0357`; the observed arms return `p = 0.2005` for the same
comparison. The depth-20 truncation removes documents that arrive from ranks
21–50 and recover recall. **The observed number is the one that counts.**

**Extraction is verified.** Recomputing the isolated arms from stored ranks
reproduces the recorded baseline exactly — DENSE_ONLY at success@5 21.9% /
recall@20 40.6% / MRR 0.154 and SPARSE_ONLY at 10.6% / 18.0% / 0.069, matching
`docs/ai/new1-post-0055/baseline.json` digit for digit. A sweep whose baseline
did not reproduce would not be evidence.

---

## THE SWEEP

`score(d) = wDense/(k + rankDense(d)) + wSparse/(k + rankSparse(d))`, k = 60.
`wDense` pinned at 1 because RRF ordering is invariant under a common positive
scale — only the ratio is real. Ties break as production breaks them (sparse
inserted first, stable sort).

| config | succ@5 | rec@20 | MRR | nDCG@5 | nDCG@20 | kept | lost | new |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DENSE_ONLY | 21.9% | 40.6% | 0.154 | 0.155 | 0.210 | 62 | 0 | 0 |
| SPARSE_ONLY | 10.6% | 18.0% | 0.069 | 0.072 | 0.094 | 19 | 43 | 11 |
| w=0.05 | 23.3% | 40.6% | 0.153 | 0.160 | 0.209 | 60 | 2 | 6 |
| w=0.10 | 22.6% | 40.6% | 0.153 | 0.157 | 0.209 | 57 | 5 | 7 |
| w=0.15 | 22.3% | 40.6% | 0.159 | 0.159 | 0.214 | 56 | 6 | 7 |
| w=0.25 | 22.3% | 40.6% | 0.156 | 0.158 | 0.212 | 54 | 8 | 9 |
| w=0.50 | 22.6% | 40.6% | 0.155 | 0.158 | 0.211 | 54 | 8 | 10 |
| w=0.70 | 22.3% | 40.6% | 0.155 | 0.157 | 0.211 | 54 | 8 | 9 |
| w=0.85 | 22.6% | 39.9% | 0.154 | 0.158 | 0.209 | 54 | 8 | 10 |
| **EQUAL (production)** | **20.5%** | **36.4%** | **0.131** | **0.138** | **0.183** | 44 | 18 | 14 |

kept/lost/new are success@5 transitions against DENSE_ONLY on the same query.

**Two facts survive the error bars.**

1. **Every weight from 0.05 to 0.70 is recall@20-IDENTICAL to dense-only** — 0
   queries created, 0 destroyed, not merely the same percentage. Below w≈0.7 the
   sparse arm cannot move a document into or out of the top 20 at all; it can
   only reorder within the set dense already returned. **A "weighted hybrid" in
   that band is dense-only wearing a hat**, and no weight in it is
   distinguishable from any other (all p ≥ 0.29 on success@5).
2. **EQUAL is the only setting that loses recall@20** (20 destroyed / 8 created
   reconstructed; 19/11 observed). Its success@5, MRR, nDCG@5 and nDCG@20 are
   the worst of every configuration tested, including sparse-free ones.

**No magic constant is selected.** The sweep does not identify a best weight
because the data does not contain one — the band is flat and the differences
inside it are noise.

### k-sensitivity

The apparent w=0.05 advantage does not survive a different RRF constant, which
is how we know it is noise:

| k | DENSE_ONLY | w=0.05 | EQUAL |
| --- | --- | --- | --- |
| 10 | 21.9% | 21.9% | 20.1% |
| 20 | 21.9% | 21.9% | 20.5% |
| 60 | 21.9% | 23.3% | 20.5% |
| 120 | 21.9% | 22.6% | 20.5% |
| 300 | 21.9% | 21.9% | 20.5% |

**EQUAL is worse than DENSE_ONLY at every k tested.** That ordering is the only
thing in this table that is stable.

---

## STRATIFICATION — where the damage actually is

| config | civil succ@5 (n=200) | criminal succ@5 (n=83) |
| --- | --- | --- |
| DENSE_ONLY | 24.0% | **16.9%** |
| w=0.05 | 26.5% | 15.7% |
| w=0.10–0.70 | 25.5% | 14.5% |
| EQUAL (production) | 24.5% | **10.8%** |

Civil is flat to slightly positive under fusion. **Criminal loses a third of its
successes**, and the paired test says the gain side is exactly zero: `+0/−7`,
`p = 0.0156`.

**Multiple-comparison caveat, stated rather than buried.** Four tests were run
(2 groups × 2 metrics). Under Bonferroni, α = 0.0125 and `p = 0.0156` is
marginally outside it. The pattern is stronger than the p-value alone suggests —
7 losses and 0 gains is `2⁻⁷ = 0.0078` one-sided before any correction — but
this is one group of 83 queries and it deserves replication, not a victory lap.

**Hypothesis for the mechanism, explicitly UNVERIFIED.** Criminal queries in
this set are statute- and section-heavy (BNS/IPC provisions, "rarest of rare"
sentencing language). That is exactly the vocabulary bus 0664 measured as
near-universal — the 40 selected lexemes matched 94.1% of the corpus because
"longest" was not "rarest". Sparse would then return near-arbitrary documents at
rank 1–2 for precisely these queries, which is the displacer profile bus 0713
found (47.1% sparse-only at rank 1–2). 0055 cut match breadth to 4.5–25.3% and
this checkpoint is post-0055, so if the hypothesis holds the criminal harm
should have *shrunk* already. **Not tested. Do not treat as established.**

---

## THE ROUTING CEILING

An oracle that picks, per query, whichever of DENSE_ONLY / EQUAL ranks gold
higher:

| | success@5 | recall@20 | MRR |
| --- | --- | --- | --- |
| DENSE_ONLY | 21.9% | 40.6% | 0.154 |
| EQUAL (production) | 20.5% | 36.4% | 0.131 |
| **oracle** | **26.9%** | **43.5%** | **0.188** |

This is an **upper bound no router can reach**, not a proposal — it requires
knowing the answer. It is reported for one reason: it shows the headroom
routing is competing for is **5.0 points of success@5**, which is large enough
to be worth a router, and that EQUAL's own arms contain 43.5% recall@20 that the
current fusion throws away.

---

## THE PRECONDITION — why none of this ships as a weight change today

**40,161 documents are embedded, out of 9,536,254 in the corpus. That is 0.42%**
(`docs/ai/new1-post-0055/vectors-per-document.json`, measured 18 Aug).

The dense arm cannot return a document that has no chunks. **The sparse arm is
the only retrieval path to 99.58% of the corpus.**

This evaluation is blind to that fact by construction: the pass is
`CONTROLLED (courts=[sc])` and all 283 gold judgments are Supreme Court, so
every candidate in this experiment is reachable by both arms. **Inside this
experiment, down-weighting sparse costs nothing. In production it would make
9.5M judgments unrankable**, and this eval set is structurally incapable of
detecting that.

The arithmetic is worth stating exactly, because it is not a matter of degree.
A sparse-only document (no embedding, so no dense term) at sparse rank 1 scores
`w/61`. A dense document at rank `r` scores `1/(60+r)`. The sparse-only document
outranks the deepest dense candidate (r = 50) only when `w > 61/110 = 0.55`.

> **Below wSparse ≈ 0.55, no unembedded document can outrank ANY dense
> candidate.** 99.58% of the corpus sorts below the 50 embedded documents, on
> every query.

That is a coverage cliff, not a tuning detail, and it is why **the flat, safe-
looking band of 0.05–0.70 is the most dangerous part of this table.** It reads
as free and it is not.

**EQUAL is currently protecting coverage by accident**, at a measured cost of
7 criminal successes. That is a different claim from "EQUAL is fine", and it is
recorded here so nobody re-derives it from the flat band and ships w=0.15.

---

## RECOMMENDATION

**`QUERY_ROUTED_HYBRID`** — routed on **query group**, which is the only
dimension where the evidence separates, and gated on **arm reachability**, which
is the only dimension where production differs from the experiment.

```
wSparse(query, document) =
    0.15   if group(query) is criminal AND document is embedded
    1.0    otherwise
```

Read plainly: **strip the sparse arm's influence only where it was measured to
do harm and only over documents the dense arm actually had a chance to rank.**
An unembedded document keeps full sparse weight, so coverage of the 99.58% is
untouched — the change cannot make any judgment less findable than it is today.

Why this shape and not the alternatives:

- **`DENSE_ONLY` — rejected.** Best on this eval set, unshippable in production.
  It would reduce the searchable corpus to 0.42% of itself.
- **`WEIGHTED_HYBRID` (one global weight) — rejected.** The effect is not
  uniform: civil is `p = 0.85` neutral and criminal is one-sided. A single
  weight would pay civil's coverage cost to buy criminal's fix, and the flat
  0.05–0.70 band means it would buy nothing measurable for civil at all.
- **Reverting 0055 — not on the table.** 0055 is quality-neutral (`p = 0.65`,
  bus 0705) and this checkpoint is already post-0055. Confirmed to LCC in 0708.

**The reachability term is the part that matters and the part that is new.** RRF
today cannot distinguish *"dense scored this document low"* from *"dense could
not see this document at all"*, and with 0.42% coverage that distinction covers
almost the entire corpus. That is a structural defect in the fusion, not a
constant that needs tuning.

### Confidence, stated plainly

| claim | status |
| --- | --- |
| criminal harm is one-sided (+0/−7) | **KNOW** — observed arms, no reconstruction |
| `p = 0.0156` clears α=0.05 uncorrected | **KNOW**; marginal under Bonferroni |
| civil is unharmed | **KNOW** — `p = 0.8506` |
| w ≤ 0.70 is recall@20-identical to dense-only | **KNOW** at depth 20; **INFER** at production depth 50 |
| whole-set fusion harm | **NOT SETTLED** — `p = 0.1755`; needs ~941 queries, we have 283 |
| statutory-boilerplate mechanism for criminal | **GUESS** — untested |
| 0.15 is the right weight | **GUESS** — the band is flat; any value in 0.05–0.70 is equivalent on this set |

**What would settle the whole-set question: 941 queries for success@5, 1,019 for
recall@20, at 80% power** (`queriesToSettle`, `services/harness/src/stats.ts`).
We hold 283, all Supreme Court. This is the sample-size requirement the gold-set
expansion should be built against — and it should include High Court gold, which
would also make the reachability term measurable instead of inferred.

---

## WHAT IS STILL NOT ANSWERED

- **Depth 50.** Every re-weighting here is depth-20. The recorded hybrid shows
  4.2% of its slots arrive from ranks 21–50; those documents are invisible to
  the sweep. Re-running `arms` with `rankedIds` at depth 50 would close this
  and costs one database pass.
- **The uncontrolled population.** No checkpoint carries `rankedIds` for an
  unfiltered pass. Until one does, the reachability term is arithmetic and a
  coverage argument, not a measurement.
- **Replication.** `arms-checkpoint.pre0055.jsonl` predates `rankedIds`
  (added 18 Aug 2026) and carries only the top 5 per arm, so it **cannot**
  replicate this at depth 20. The criminal finding rests on one run of 83
  queries.
- **Field and citation queries are absent.** Bus 0655 measured 0 of 308 eval
  queries touching `exactCitation`. Pinning is a third mechanism that runs in
  every mode and is unaffected by arm weights, but nothing here says what
  weighting does to a `judge:` or `court:` query, because the set contains none.
