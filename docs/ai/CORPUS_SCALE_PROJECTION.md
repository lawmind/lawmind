# Reaching 20.5M documents — time, and the wall that is not time

**13 Aug 2026, LCC.** The founder asked how long it takes to acquire all ~20.5M
documents at the rate we are running. Every number here is measured against the
live database, not estimated.

**The short answer: acquisition takes about a month. Embeddings, at that scale,
need ~5 TB of Postgres — and that, not time, is the constraint.**

---

## 1 · FIRST, A CORRECTION TO THE RATE IN THE QUESTION

The 773k rows/hour figure is **paragraph extraction**, not acquisition. It is
enrichment of judgments already held. Applying it to acquisition would overstate
progress by roughly 7x.

Measured separately:

| | rate |
| --- | --- |
| **ingestion** (new judgments) | **15,364/hr** last hour · 38,146/hr 6-hour avg · 28,343/hr 24-hour avg |
| paragraph extraction | ~773k rows/hr ≈ **106k judgments/hr** |

**Enrichment is ~7x faster than ingestion and is therefore not the bottleneck.**
It will track acquisition comfortably. Ingestion is the critical path — which is
why `RING_PROGRAM.md` puts NEW2 there.

**The ingestion rate is falling**: 38k → 28k → 15k/hr across the 6h, 24h and 1h
windows. Unexplained. Could be S3 throttling, DB proxy contention with six
enrichment workers, or a court with larger documents. **Worth NEW2 checking
before anyone plans against a number that is still moving.**

---

## 2 · TIME TO 20.5M

Held **819,632**. Remaining **~19.68M**.

| at | hours | **days** |
| --- | --- | --- |
| 38,146/hr (6h avg, best observed) | 516 | **21.5** |
| 28,343/hr (24h avg) | 694 | **29** |
| 15,364/hr (last hour, worst) | 1,281 | **53** |

**Three to eight weeks, continuous.** Call it **a month** at the 24-hour average,
which is the most honest single number.

**A caveat on the target itself.** `RING_PROGRAM.md` §1 records the AWS Open Data
high-court dataset as **~17.8M judgments, 25 courts, ~1.25 TiB**, verified
against the source. The founder's 20.5M presumably adds the Supreme Court,
tribunals and other platforms. **The extra ~2.7M has not been inventoried**, and
some of it is not in the authorised AWS bucket. NEW3 owns that question. And per
§1, the source updates **daily** — so this is time-to-parity, not time-to-done.

---

## 3 · STORAGE — THE ACTUAL CONSTRAINT

Measured per judgment, against covered rows only:

| | per judgment |
| --- | --- |
| `judgments` (row + `full_text`) | **11 KB** |
| `judgment_paragraphs` | **8 KB** |
| `judgment_citations` + `judgment_statute_refs` | 0.7 KB |
| **`judgment_chunks` + embedding** | **245 KB** |

Current database: **23 GB** across 819,632 judgments.

### Projected at 20.5M

| | size |
| --- | --- |
| **data-first** (text, paragraphs, citations, statutes — no embeddings) | **~405 GB** |
| embeddings on top | **+4.9 TB** |
| **total with embeddings** | **~5.3 TB** |
| vectors involved | **~316 million chunks** |

**The founder's data-before-embeddings decision lands us at ~405 GB, which is
ordinary.** The embedding step is what multiplies it by thirteen.

### Why embeddings cost so much

1024-dimensional vectors at 4 bytes each = **4 KB per chunk**, 15.4 chunks per
judgment. And the HNSW index is **3.6x the size of the heap it indexes** —
measured, 4,841 MB of index against 1,335 MB of heap. The index, not the data,
is the dominant cost.

---

## 4 · TWO LEVERS, BOTH MEASURED, NEITHER APPLIED

**Not recommendations to act on yet** — embeddings are deferred by founder
decision and the right time to decide is when the data gate is met. Recorded now
because the numbers are cheap to take today and expensive to discover at 5 TB.

### 4a · `halfvec` — roughly halves it

Our Postgres runs **pgvector 0.8.5**, and `halfvec`, `bit` and `sparsevec` are
all available (checked against `pg_type`, not assumed). `halfvec` stores 16-bit
floats — **half the bytes, in both the heap and the HNSW index**.

Vector-related storage is ~64% of `judgment_chunks`, so this is roughly a **third
off the total**: ~245 KB → ~167 KB per judgment.

**Unmeasured: the recall cost.** Half precision is widely reported as near-free
for retrieval quality, but *widely reported* is not *measured on Indian legal
text with our model*. NEW1 owns that measurement, and it must happen before any
migration, not after.

### 4b · Not embedding what has no reasoning in it

Among the **136,009 judgments already classified**:

| class | n | share of classified |
| --- | --- | --- |
| `bail_order` | 57,876 | 42.6% |
| `decided` | 39,914 | 29.3% |
| `procedural_disposal` | 20,641 | 15.2% |
| `reference_stub` | 11,950 | 8.8% |
| `decided_brief` | 5,628 | 4.1% |

**66.5% are bail orders, procedural disposals or reference stubs** — documents
that, per `RING_PROGRAM.md` §3, genuinely cite nothing and contain no reasoning.

**The caveat that keeps this honest: 83.4% of the corpus is unclassified**, so
this is a share of the classified subset, not of the corpus. It is *not* the
Allahabad sampling trap — the classified subset spans Patna (44,561), MP
(22,433), Rajasthan (15,367), Karnataka (12,045) and Allahabad (7,783) — but
five courts is not twenty-five. **Treat 66.5% as indicative, not established.**

If it holds, embedding only substantive judgments cuts the vector workload to
about a third.

### Both together

**~4.9 TB → ~1.1 TB.** Still large, and now a normal infrastructure problem
rather than an impossible one.

**They do not compose blindly.** Skipping a class is a retrieval decision — a
bail order that cannot be found because we chose not to index it is invisible to
the same evidence-span verification that catches fabrication, exactly the
false-negative asymmetry recorded in `GPU_PLAN.md` §4b. That is NEW1's call on
NEW1's measurement, not a storage optimisation anyone imposes on them.

---

## 5 · WHAT THIS CHANGES

- **Nothing about the current plan.** Data first, embeddings after the gate. This
  says what the gate's far side costs.
- **Acquisition is a month of wall-clock**, and ingestion rate is the number to
  watch — it is currently falling and nobody knows why.
- **~405 GB of Railway Postgres is the data-first destination.** That is a
  billing question and it is in `FOUNDER_QUEUE.md`.
- **The 5 TB figure is the one that should not be discovered late.** It is
  reducible to ~1.1 TB by two measured levers, both of which need a retrieval
  measurement first.
