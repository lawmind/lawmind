# HEAD WALK vs PASSAGE BUILD — SEQUENCING INPUTS

**Date:** 25 Aug 2026 · **Lane:** NEW1 · **Deliverable:** convergence sprint V2 §7 NEW1-5
**Status:** INPUTS COMPLETE · **final recommendation deliberately withheld** — the plan
makes it conditional on tranche evidence, and that evidence does not exist yet.

> Every figure below is measured, and every input traces to a log line or a stored
> artifact. Nothing here is projected from a vendor claim or a remembered number.

---

## 1. The measurement that reframes the whole decision

**The 100k validation tranche costs 4.5 GPU-hours.** The HEAD walk has **7.9
GPU-days** left to run.

The tranche is **0.2%** of the compute already committed to finishing HEAD. Whatever
the right answer turns out to be, *not* spending 4.5 hours to find out before
spending 7.9 days is not a defensible use of the GPU.

That is the single most useful thing in this document.

## 2. Cost model, from measured throughput

Inputs, all from `stage-runner.log` (last 12 completed batches) and
`representation-lab-v3.json`:

| input | value | source |
| --- | ---: | --- |
| Tier A manifest | 8,631,360 documents (864 batches) | worklist |
| HEAD walk complete | **208/864 = 24.1%** | worklist 208/864 |
| median throughput, clean | **8,368 tok/s** | last 12 batches |
| tokens per document, HEAD:4800 | **873** | median, last 12 batches |
| chunks per document, passages | **3.39** | V3: 67,618 / 19,932 |
| chars per document, passages | **7,399** | V3: 147,467,434 / 19,932 |
| tokens per document, passages | **1,346** (1.54× HEAD) | derived from the two above |

Which gives:

| option | GPU cost | output |
| --- | ---: | --- |
| **finish the HEAD walk** | **7.9 GPU-days** | 6,553,440 more HEAD:4800 vectors |
| **full passage build** | **16.1 GPU-days** | 29.3M passage vectors |
| passages for the remainder only | 12.2 GPU-days | keeps HEAD's 2.08M as-is |
| **100k validation tranche** | **4.5 GPU-hours** | 339k vectors |

And the reason §13's quiet window is a precondition rather than a preference:

> the same 100k tranche costs **75.7 GPU-hours** at the contended rate measured
> today (494 tok/s) instead of 4.5 at the clean rate. **A 17× penalty.**

## 3. What each option actually buys, end-to-end

From `V31_REANALYSIS.md` — posed advocate questions, pool 19,932, success@5:

| representation | END-TO-END | CONDITIONAL |
| --- | ---: | ---: |
| **A_HEAD_4800** — what the walk is building | **2.2%** | 3.6% |
| **F_ALL_CHUNKS** — passages | **24.4%** | 39.3% |

So the 7.9 GPU-days remaining on HEAD extend a representation measured at **2.2%
end-to-end** across 6.5M more documents.

**HEAD is weak even as a candidate generator**, which is the strongest remaining
argument for finishing it. V3, posed, recall@500:

| arm | recall@500 |
| --- | ---: |
| A_HEAD_4800 | **35.6%** |
| B_POOLED_ALL | **95.6%** |
| F_ALL_CHUNKS | 91.1% |

A one-vector-per-document representation at *identical storage* to HEAD reaches
95.6% of targets in the top 500 where HEAD reaches 35.6%. If the goal of finishing
HEAD is "a coarse first stage we can rerank", **the coarse stage we are building is
the worst of the four measured**, and re-pooling the vectors we already have costs
no new embedding at all.

## 4. What is NOT an argument

- **Sunk compute.** 2,077,920 documents are staged and that is 24.1% of the walk.
  The plan says explicitly: do not optimise for sunk cost. Those vectors keep
  whatever value they have regardless of what is built next, and re-pooling can
  extract more from them without re-embedding.
- **"Passages are 50+ GPU-days and 100+ GB."** Measured at **16.1 GPU-days**. The
  premise that made passages look unaffordable is wrong by 3×.
- **The 37.8% figure.** It is conditional. The end-to-end figure at today's
  coverage is 24.4%, and neither supports shipping semantic search.

## 5. What the tranche must settle before any recommendation

The tranche is not a formality; three things are genuinely unknown and each could
change the answer:

1. **Does the passage gain survive a real ANN index?** Every V3 number is exact
   search over a 19,932 pool. HNSW at production `ef_search=200` over 339k vectors
   is a different machine, and the ANN-vs-exact loss is unmeasured.
2. **Does it survive a realistic distractor population?** V3's pool was 25k. The
   product's is millions. V3 itself showed every arm decaying with pool size —
   passages decayed *slowest* (0.838 per decade vs A's 0.697), which is why they
   are promising, but 25k → 8.6M is two more decades than anyone has measured.
3. **Do `adverse_authority` and `statute` move at all?** They are **0 for every
   representation tested**. If passages leave them at zero, the feature they were
   supposed to unlock does not exist regardless of the aggregate.

## 6. Provisional position, and what would change it

Stated because the plan asks for a recommendation and withholding one entirely is
less useful than labelling one — but this is **not** the §7 NEW1-5 answer, which
is owed after the tranche.

> **On current evidence I would pause the HEAD walk, spend 4.5 GPU-hours on the
> tranche, and let it decide.** Spending 7.9 GPU-days extending a 2.2% end-to-end
> representation — one that is also the worst of four as a candidate generator —
> ahead of a 4.5-hour experiment that could redirect it is the sunk-cost move the
> plan warns against.

**What would change it, concretely:**

- The tranche showing the passage gain collapsing under a real ANN index → HEAD
  becomes the safer coarse stage and should finish.
- `adverse_authority`/`statute` still at zero under passages → neither option
  unlocks the blocked features, and the decision becomes purely about cost, where
  finishing HEAD is cheaper.
- Passage index size or HNSW build time proving unaffordable at 29.3M vectors →
  option **C** (HEAD as coarse/fallback only) becomes the answer.

**A full 30M passage build requires this tranche, a fifth-agent audit, and founder
approval — in that order.** Nothing in this document is a request to start one.

## 7. Status

- [x] **T5.1** HEAD completion — 208/864 = 24.1%, 2,077,920 documents staged
- [x] **T5.2** Retrieval gain — 2.2% vs 24.4% end-to-end; recall@500 35.6% vs 91.1%
- [x] **T5.3** Resource cost — HEAD 7.9 GPU-days · passages 16.1 · tranche 4.5 GPU-hours
- [x] **T5.5** Sunk compute explicitly excluded; falsifiers named in §6
- [x] **T5.6** Full build gated on tranche + fifth-agent audit + founder approval
- [ ] **T5.4** The single recommendation — **owed after the tranche runs**
