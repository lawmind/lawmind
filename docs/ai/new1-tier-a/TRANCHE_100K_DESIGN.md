# 100k PASSAGE VALIDATION TRANCHE — DESIGN

**Date:** 25 Aug 2026 · **Lane:** NEW1 · **Deliverable:** convergence sprint V2 §7 NEW1-2
**Status:** DESIGN COMPLETE · BUILD NOT STARTED (waiting on a GPU quiet window)

> Written before the build, so the method cannot be shaped by the result.
> The plan's instruction is explicit: *"Do NOT start the full ~30M-vector passage
> build. First complete the 100k validation tranche."* This is that tranche.

---

## 1. The one trap that would invalidate everything

The plan states it in a single line and it is the hardest requirement in §7:

> *"Do NOT force all gold into the index without counting that as artificial
> reachability."*

Here is why it is fatal if got wrong. The V3.1 manifest holds 213 gold targets.
If the tranche is built by taking 100k documents **and then adding all 213 gold**,
every gold document is reachable by construction. End-to-end success then measures
*ranking inside a set rigged to contain the answer* — which is not the product's
question. The product's question is: **when an advocate asks, is the right
authority even in the index?**

Today, for the current production representation, the honest answer is often no:
**12 of 213 gold (5.6%) have no production vector at all**, and among the 20 POSED
concept targets in V3 it was **8 of 20 — 40%**.

A tranche that quietly repairs that would report a large improvement that no
advocate would ever experience.

### The resolution: sample gold-blind, then flag

1. **Sample the tranche without looking at gold membership.** Stratified over
   court / era / case type, drawn from `judgments` — **not** from
   `new1_doc_vector_stage` (see §2).
2. **Measure natural inclusion.** `natural_gold = gold ∩ tranche`. Whatever that
   number is, it is the number.
3. **Add the remainder, flagged.** `forced_gold = gold \ tranche`, inserted into
   the index but marked `forced: true` in the tranche manifest.
4. **Report two metrics off one index:**

| metric | rule | answers |
| --- | --- | --- |
| **END-TO-END** | a task succeeds only if its target is in `natural_gold` **and** ranks in top-k. A task whose target is `forced` counts as a **MISS**. | *"would an advocate get the right authority?"* |
| **CONDITIONAL** | among tasks whose target is in the index at all (natural **or** forced), does it rank? | *"is the representation good at ordering?"* |

One index, two honest numbers, and the `forced` flag makes the gap auditable by
anyone. Without the flag the two metrics are indistinguishable after the fact.

---

## 2. Sample from `judgments`, never from the stage

Sampling from `new1_doc_vector_stage` would guarantee every tranche document is
already reachable by production dense search — which silently deletes one of the
plan's mandated strata:

> *"some documents currently unreachable by production dense search"*

So the frame is `judgments`, and every selected document carries
`in_production_stage: true|false`. The share that is `false` is a **reported
output of the design**, not a target to hit.

This also means the tranche embed is doing real new work for a meaningful slice
of its documents, rather than re-embedding what is already staged.

---

## 3. Strata — what the schema actually holds

This is where the plan's list meets the corpus, and they do not fully match.
Recording the mismatch rather than papering over it.

The plan asks for:

> SC · multiple major HCs · recent + older · criminal · civil · **commercial ·
> constitutional · service · property · family where held**

### What is held as a first-class fact

| stratum | column | status |
| --- | --- | --- |
| court | `judgments.court` | ✅ held — 25+ courts staged, Madras 308k … Meghalaya 1,470 |
| era | `judgments.judgment_date` | ✅ held |
| criminal / civil | `judgments.case_type` | ✅ held — **enum is exactly `criminal, civil`** |
| HC document class | `judgments.hc_document_class` | ✅ held |
| currently unreachable | `NOT EXISTS` in `new1_doc_vector_stage` | ✅ derivable |

### What is NOT held

**`commercial`, `constitutional`, `service`, `property`, `family` are not corpus
facts.** `case_type` is a two-valued enum. There is no subject-matter taxonomy on
`judgments`.

The plan's own wording — *"family where held"* — anticipates this. The honest
options are:

- **(a)** Report those five as **NOT STRATIFIABLE**, and stratify on what is held.
- **(b)** Derive a *labelled inference* from the case-number prefix (Indian
  registries use stable codes: `WP` writ, `CRL` criminal, `MAT`/`HMA`
  matrimonial, `CP` company, `ARB` arbitration, `SA`/`RSA` second appeal), tag
  every derived value as INFERRED, and publish its coverage.

**Decision: (b), with (a)'s honesty attached.** The prefix mapping is a
documented registry convention, not a legal judgement, so it does not violate
"never invent a court hierarchy fact" — but it is inference, it will have gaps,
and every derived label ships marked `INFERRED` with its coverage percentage
beside it. Any class whose coverage is too thin is reported as
**NOT STRATIFIABLE** rather than estimated.

**No derived subject label may ever reach the product.** It exists to stratify an
experiment.

### 3.1 The measurement that settles it

A bounded `TABLESAMPLE SYSTEM (0.1)` over `judgments` — 18,567 rows, deliberately
*not* a full-table scan, because an unbounded aggregate on 15.9M rows while my own
walk reads the same disk is precisely what I reported to LCC:

| signal | populated | null | verdict |
| --- | ---: | ---: | --- |
| `case_number` registry prefix | **98.7%** | 1.3% | ✅ usable |
| `case_type` (criminal/civil) | **24.1%** | **75.6%** | ❌ cannot carry the stratum |
| `hc_document_class` | **25.7%** | **74.3%** | ❌ cannot carry the stratum |

**`case_type` is NULL for three quarters of the corpus.** This kills option (a)
outright: stratifying criminal/civil on the enum would silently restrict the
tranche to the 24% that happens to be classified, and that 24% is not a random
quarter — it is whatever the classifier has reached. The registry prefix covers
98.7% and is the only signal that can carry subject at all.

Note also that NULL here is **two populations, not one** — never classified, and
looked at but refused. Neither is "civil". Any count that treats
`case_type IS NULL` as a subject class is wrong twice over.

Top prefixes in the sample: `WP` 17.8%, then a long criminal tail
(`CR.`, `CRM`, `BAIL`, `CRL`, `MCRC`, `CRLP`, `CRLMB`, `CRL.P`, `BA`, `ABLAPL`).

### 3.2 The corpus is 96.5% post-2010, and "older" must be oversampled

| decade | share of sample |
| --- | ---: |
| 2020s | 54.8% |
| 2010s | 41.7% |
| 2000s | 5.6% |
| 1990s | 0.18% |
| 1980s and earlier | **0.08%** |

A *proportional* 100k sample would contain roughly **48 pre-1990 documents** —
not enough to say anything about older authority, which is exactly the material an
advocate cites for settled propositions.

So the era stratum is **deliberately oversampled** away from proportional, and
the tranche manifest records both the sampled and the corpus proportions so that
nobody later mistakes the tranche's era mix for the corpus's. Oversampling is the
right call for measuring *reachability by era*; it would be the wrong call for
estimating a corpus-wide rate, and no corpus-wide rate will be quoted from it.

---

## 4. Mandated inclusions, named

Beyond the strata, these go in explicitly and are flagged as deliberate:

| inclusion | source | why |
| --- | --- | --- |
| all 213 V3.1 gold targets | `V31_MANIFEST.json` | the queries need answers; split natural/forced per §1 |
| the 12 gold with **no** production vector | manifest `notInIndexIds` | the reachability question in its purest form |
| NEW3-1076 wrong-domain pair | bus 1076 | the commercial-breach query and the IPC 394 robbery judgment it wrongly returned |
| supporting- and adverse-authority targets | manifest strata | **both score 0 for every arm** in V3 |
| statute targets | manifest strata | **also 0 for every arm** |
| long-narrative targets | manifest strata | the input-length question, deferred but not abandoned |

`adverse_authority` and `statute` being zero for *every* representation tested is
the single most important negative result NEW1 currently holds. The tranche must
be able to say whether passages change that, and it can only do so if those
targets are present and separately counted. **They will be reported separately
whatever the aggregate does.**

---

## 5. Size and cost, from measured throughput

Anchored on the V3 run — 19,932 documents, 67,618 chunks, 147,467,434 characters,
5,376 s:

```
chunks per document        3.39  (measured)
100k documents          ≈ 339,000 chunks
GPU time at V3 rate     ≈ 7.5 h        (5,376s × 5.02)
```

Two cautions on that estimate:

- It assumes the **clean** throughput. Under the contention measured this session
  the walk fell from 8,412 to 494 tok/s — a **17×** penalty. At that rate the same
  build is not 7.5 hours, it is days. **This is why the quiet window is a
  precondition and not a preference.**
- It excludes HNSW build time, which is measured separately (T2.13) and is one of
  the numbers the full-build decision turns on.

---

## 6. Preconditions before a single vector is embedded

- [ ] **GPU quiet window.** The HEAD walk and the tranche cannot share the
      sidecar; two concurrent GPU consumers is the measured working limit on this
      box and the walk is one of them.
- [ ] **DB quiet window.** The orphaned `cmd /K` loops (`citations`, `paragraphs`)
      must be quiet or knowingly running. Raised with LCC as bus 1127/1131. A
      p50/p95 recorded next to twelve IO-bound backends is not a number anyone
      should build a launch decision on.
- [ ] **Walk paused deliberately**, via `.agents/logs/new1-walk.pause`, with the
      reason and owner written into the file. Pausing is lossless: the walk
      resumes by re-running the coverage census, never from a batch number.
- [ ] **Checkpointed output.** 160 of 283 queries were lost once before to a
      teardown because the write was at the end. The tranche run writes its
      artifact incrementally or it does not run.

---

## 7. What this design deliberately does NOT do

- It does **not** build 30M passage vectors. That needs this tranche, a
  fifth-agent audit, **and founder approval** — in that order.
- It does **not** re-run the 500/1000/2500/5000 input-length sweep (§7 NEW1-4).
  Reachability has to improve first; until then a length sweep measures the
  index's gaps, not the input length.
- It does **not** switch embedding models. No discriminator exists that would
  justify it.
- It does **not** report an aggregate gain without the per-class table beneath
  it.
