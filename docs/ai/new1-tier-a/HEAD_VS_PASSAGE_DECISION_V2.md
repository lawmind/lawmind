# HEAD vs PASSAGE — DECISION V2

**Deliverable:** R8.1 §6.9 · **Lane:** NEW1 · **Date:** 26 August 2026

> **This file RECOMMENDS. It does not decide.** Full scale needs NEW1 evidence **and**
> Fifth approval **and** founder approval where compute or storage expands materially.
> R8.1 §17 forbids starting a full-corpus passage build, and nothing here starts one.

Evidence: `PASSAGE_100K_VALIDATION_V1` (quality) · `NEW1_PROCESS_RESOURCE_REPORT_R8_1` §6
(cost) · `PASSAGE_INDEX_BUILD.json` (index).

---

## 1. The recommendation in one line

**Neither arm wins outright, and the framing "HEAD *or* passage" is the thing this round
should retire.** Passage is measurably better and does not fit the corpus; HEAD is
measurably worse and does fit. **Recommended: HEAD as the corpus-wide coarse layer,
passages on a bounded high-value subset** — with the HEAD walk resumed only after its
stale census is rebuilt.

| | HEAD walk | full-corpus passages |
|---|---|---|
| disposition | **RESUME AS COARSE-ONLY** | **DO NOT START** |

---

## 2. Quality: passage wins, and the intervals do not overlap

| arm | cond s@5 | 95% CI | p50 |
|---|---:|---|---:|
| `ann_ef200` (passage) | **0.3831** | [0.3265, 0.4444] | 107 ms |
| `head_ef200` | 0.2409 | [0.1845, 0.2978] | 300 ms |

59% relative improvement, non-overlapping intervals, and **3× faster**.

**The comparison is if anything unfair to passages**, which is why it is worth trusting:
HEAD is scored against its own smaller index — 20,947 documents and 274 of 295 targets,
against the passage arms' 81,720 and 295 — so HEAD faces **a quarter of the distractors**
and still loses.

Passage also wins in 9 of 11 families. It loses in exactly one, `statute`
(0 vs 0.3333, n = 3 — a number that supports no claim), and ties at zero in
`supporting_authority`.

---

## 3. Cost: passage loses, and not narrowly

Measured, not projected (§6 of the resource report):

| | per document | at Tier A 8,854,281 docs |
|---|---:|---:|
| HEAD — 1 vector/doc | 13,847 B | **≈ 123 GB** |
| passages — **5.116** chunks/doc | 70,842 B | **≈ 627 GB** |

**Against 284 GB free and a database already at 300 GB.** HEAD fits with room. Passages
miss by roughly 2×, before WAL (~180 GB at this build's observed rate), temp, or the
build's working set. `halfvec` would bring passages to ~535 GB — **still does not fit**.

This is the fact that changes the shape of the decision. The quality result argues for
passages everywhere; the cost result forbids it on this hardware. **A recommendation that
ignored either half would be worthless.**

---

## 4. What the two facts together actually imply

Coarse-to-fine, because it is what the numbers describe rather than an architecture chosen
in advance:

1. **HEAD covers the corpus.** One vector per document, ~123 GB, feasible today, and it is
   the *only* arm that can reach 8.85 M documents on this box.
2. **Passages cover a bounded high-value subset.** Reserving ~150 GB for passages buys
   **≈ 10.8 M passages ≈ 2.1 M documents — about 24% of Tier A.**
3. **Selection of that subset is a separate, evidenced decision**, not a leftover. The
   obvious candidates — most-cited authorities, Gold and hidden-holdout targets,
   currentness and treatment blockers — are NEW2's priority ordering in R8.1 §7.8, not
   NEW1's to set.

**What I am NOT claiming:** that a coarse-to-fine *cascade* (HEAD to shortlist, passages
to rerank) works. It has not been measured, and R8.1 §17 forbids the reranker program that
would test it. What is measured is that the two arms have complementary cost/quality
profiles. **The architecture follows from the costs; its retrieval behaviour is
unmeasured.**

---

## 5. HEAD walk disposition — `RESUME AS COARSE-ONLY`, and step 1 is not optional

State: **2,026,872 staged, 72,092 refused**, out of Tier A 9,700,157 — **20.9% complete**,
paused since 2026-08-25T10:55Z.

**Not `abandoned`:** it is the only arm that can cover the corpus, and §4 gives it a
permanent job rather than a consolation one.
**Not `superseded`:** passages do not replace it; they cannot afford to.
**Not an unqualified `resume`:** the walk was producing **zero durable output** when it was
paused — batches 00131–00141 each inserted 0 rows and stage rows sat at 2,026,872 for 65
minutes. That was `RUNNING_REPLAYING`, not progress.

**The cause is known and it is a stale file, not a bug in the walk.**
`stage-coverage.json` was measured 2026-08-20T23:19:43Z and records batch 00131 as
`staged: 13/9990`, while the live stage holds 8,811 of that batch. The runner re-reads the
worklist every run; nobody re-ran the **census** that writes it. So it replays ~119
batches completed between 20 and 25 August.

```
1. node services/harness/src/stage-coverage-census.mjs   <- REQUIRED, the file is stale
2. rm .agents/logs/new1-walk.pause
3. the keeper relaunches on its next silence check
```

**Resuming without step 1 burns GPU and writes nothing.** That is not a hypothesis — it is
what happened for 65 minutes on 25 August.

**Not resumed by this file.** It contends for the same GPU sidecar as everything else, and
NEW2 has three jobs queued behind the `HEAVY_BOX` release (statute linking, ambiguous pin
repair, fixture removal). Sequencing is LCC's to arbitrate.

---

## 6. What would change this recommendation

Stated so it can be revisited on evidence rather than re-argued:

1. **Storage.** If the box gains ~700 GB, the cost objection disappears and passages
   everywhere becomes the obvious answer. This is a founder call and belongs in
   `FOUNDER_QUEUE.md`, not in an engineering trade-off.
2. **`supporting_authority` at 0/6 to rank 100** — but 0.3333 at 500, and `exact` reaches
   0.6667 at 500. **The authorities are findable and mis-ranked, not missing.** If that
   survives a larger task set it outranks the HEAD-vs-passage choice entirely, and it
   points at reranking rather than at a different representation — an experiment R8.1 §17
   forbids this round.
3. **Passage role safety on this exact tranche — now measured at pool level, and worse
   than I assumed.** NEW2, bus 1282: `REPORTER_EDITORIAL` **1.57%** (not 0.10%),
   `PARTY_SUBMISSION` **19.38%**, `CASE_HEADER` **15.47%** — **24.40% that must never be
   shown as the court's reasoning** — against `COURT_REASONING` at **1.15%**. **Top-k
   remains unmeasured**, and top-k is what decides whether this recommendation survives: a
   retriever that preferentially surfaces confident-sounding counsel submissions would
   invert the quality result in §2.
4. **A corpus-representative chunks/doc rate.** 5.116 is this tranche's, and the tranche is
   deliberately era-skewed. A materially lower corpus rate would shrink the 627 GB.
5. **Segmentation V2.** 7,535 passages (1.80%) cannot support a pinpoint citation. If the
   fix changes segmentation for documents outside the affected band, every number here is
   re-measured rather than adjusted.

---

## 7. Explicitly not decided here

- Whether 0.3831 clears G3. Fifth adjudicates against preregistered criteria, and R8.1
  forbids reusing a stale 70% threshold against a benchmark with a different ceiling.
- Whether to buy storage.
- Which documents enter the passage subset — NEW2 owns that priority ordering.
- Whether a cascade works. Unmeasured, and the experiment that would settle it is
  currently forbidden.
