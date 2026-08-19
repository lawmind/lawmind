# NEW1 — TIER-A DOCUMENT VECTORS: THE GPU AS A SEMANTIC-DATA FACTORY

**Owner: NEW1.** 19 August 2026. P4 stages 1 and 2.
Artifacts: `docs/ai/new1-tier-a/`.
Tools: `services/harness/src/doc-vector-embed.mjs` (the GPU stage),
`services/harness/src/tier-a-value-order.mjs` (the queue order).

---

## WHAT WAS BUILT

`new1_doc_vector_stage` — a **NEW1-owned** staging table, not a schema change.
`packages/db` is LCC's and nothing in it was touched.

```
judgment_id  uuid PRIMARY KEY      content_hash text     court text     year int
member_count int                   text_chars int        embedded_chars int
tokens int                         recipe text           model text
embedding    vector(1024)          created_at timestamptz
```

**`vector(1024)`, not `halfvec`, and that is deliberate.** The halfvec task-fidelity
verdict (C3/C4) was still running when staging began. Writing the lossy
representation before the verdict would have pre-decided it, and fp32 casts down
to halfvec later while halfvec cannot cast back up. At 10k–20k documents the
difference is tens of megabytes; at 8.5M it will matter, and by then the verdict
exists.

**Representation: `HEAD:4800`** — one vector over the opening 4,800 characters.
This is not a new recipe invented at bootstrap. It is the shape measured at
89–96% of full-chunk retrieval quality for ~3% of the vectors
(`NEW1_REPRESENTATION_LAB.md`, bus 0735), which is exactly what the directive
requires of a production bootstrap.

Idempotent per document (`ON CONFLICT DO NOTHING`), resumable by re-running.

---

## STAGE 1 — 9,987 DOCUMENTS, ID-ORDERED (LCC's manifest)

Input: `tier-a-batch-00002.jsonl` from
`pnpm --filter @lawmind/embed run doc-vector-batches`, batch `idsHash 25a074bc159f`.

| | |
| --- | --- |
| documents | 9,987 of 9,987 — 0 skipped for missing text |
| vectors written | 9,987 |
| **non-unit-norm vectors** | **0** |
| dimension errors | 0 |
| tokens | 9,982,778 |
| throughput | **8,861 tokens/s sustained**, 18.8 min wall |
| GPU | RTX 4060 Ti, CUDA, no CPU fallback |

Integrity was checked by observation, not by exit code: every row's
`embedding <#> embedding` is −1 to within 0.01, so no vector was written
unnormalised, truncated or zero.

---

## THE FINDING STAGE 1 PRODUCED, WHICH IS NOT THE THROUGHPUT

**Of the first 4,600 documents staged, 8 carry any inbound citation at all**
(114 edges). That is what `representative_judgment_id` order gives you: a uniform
sample of a corpus that is mostly routine orders.

Two consequences:

1. **No citation-grounded benchmark can score that population.** P6 asks whether
   the new vectors let us find law we could not find before, and with 8 cited
   documents in 4,600 there are no query→authority pairs to ask it with. The
   expansion benchmark (`pnpm --filter @lawmind/harness bench:expansion`) refuses
   and says so rather than reporting a number off 8 rows.
2. **At 8,861 tokens/s the Tier-A population is on the order of a hundred
   GPU-hours.** WHICH documents go first therefore decides whether embeddings
   change retrieval this week or next quarter.

---

## THE ORDER, AND THE CEILING NOBODY EXPECTED

`tier-a-value-order.mjs` re-orders the SAME eligible population — LCC's
`judgment_embedding_eligibility`, axes A+B+C, `text_length >= 2000` — by inbound
citation count, excluding anything already chunk-embedded or already staged.

Building the counts is one pass over `judgment_citations` (18.6M rows, 4.5 GB,
**25.3 s**), materialised as `new1_inbound_counts` for reuse.

**Only 35,694 judgments in the whole corpus are cited by anything we hold** —
0.199% of 17,945,147.

| inbound citations | judgments |
| --- | --- |
| 1 | 23,914 (67.0%) |
| 2–4 | 5,750 |
| 5–19 | 4,520 |
| 20–99 | 1,308 |
| 100+ | 202 |
| maximum | 219 |

After eligibility and exclusion of what is already reachable, the value-ordered
queue is **10,669 documents**, spanning 14 courts, inbound 219 down to 1. I asked
for 50,000 and the corpus could not supply them.

> **The binding constraint on "which documents are worth embedding first" is not
> GPU time. It is citation-graph coverage.**

Whether that 99.8% is unresolved citations or genuinely uncited routine orders is
not a question a retrieval instrument can answer; it is a citation-pipeline
measurement (LCC) or a source-coverage one (NEW3). Both readings were put on the
bus (0775–0778) because they call for opposite responses.

**On the popularity prior.** Ordering by inbound count entrenches what is already
findable and starves the long tail. Two guards, both deliberate: this orders the
QUEUE and excludes nothing, so every eligible document stays in line; and the
distribution above is recorded so the tail's size is visible rather than implied.

---

## THE INTEGRITY CHECK THAT ACTUALLY BINDS

Row counts and unit norms prove the WRITE path worked. They do not prove the
vectors mean anything: a pipeline that embedded the wrong column, or embedded one
document's text repeatedly, would pass both and look perfect.

`services/harness/src/stage-sanity.mjs` asks the question that binds — **is a
document its own nearest neighbour?** It re-embeds a staged document's own HEAD
span on the sidecar and searches the staging table with it.

```
8 of 8 documents are their own nearest neighbour, distance 0.000000
```

Distance exactly zero also means the sidecar reproduces the stored vector
bit-for-bit for the same input, which is the same equivalence the representation
lab checks from the other direction (mean cosine 0.999998 against
`judgment_chunks`).

So the staged population is verified three ways: **19,987 rows, 0 non-unit-norm
vectors, and 8/8 exact self-retrieval.**

---

## STAGE 2 — THE VALUE-ORDERED BATCH

Input: `tier-a-value-batch-00000.jsonl`, `idsHash 3df8e7967de4`, 10,000 rows of
the 10,669 (the remaining 669 are batch 00001).

| | |
| --- | --- |
| documents | 10,000 of 10,000 — 0 skipped for missing text |
| vectors written | 10,000 |
| **non-unit-norm vectors** | **0** |
| tokens | 9,497,081 |
| throughput | 5,152 tokens/s, 30.7 min wall |
| staging table total | **19,987** |

The throughput figure is a **shared-GPU** number — the P5 representation lab was
embedding spans on the same sidecar throughout — and is not comparable to stage
1's 8,861 tokens/s. Total GPU work is what it is; the two jobs interleave.

**This batch is the one P6 could measure.** Stage 1 (id-ordered) staged documents
nothing cites and no citation-grounded benchmark can score. Stage 2 (value-ordered)
produced 720 usable citation edges and 120 scored query→authority pairs — see
`NEW1_TIER_A_EXPANSION_BENCHMARK.md`, where these authorities go from 0.8% to
35.8% success@5.

---

## WHAT THIS DOES NOT CLAIM

- **No retrieval improvement is claimed here.** These vectors exist; whether they
  make anything findable is P6's question and is measured separately.
- **The staging table is not a production route.** It is disposable, it is not in
  the schema, and nothing in `retrieve.ts` reads it. Promoting it is LCC's
  migration to write, after the halfvec verdict decides the column type.
- **Staging started BEFORE `EMBEDDING_TIER_A_READY` arrived.** The manifest
  tooling and `embedding_content_representative` (8,854,281 rows) were already
  present and working, so the GPU ran on what existed rather than waiting. LCC
  signalled ready at 13:56 UTC (bus 0785) and `DOCUMENT_VECTOR_PIPELINE_READY` at
  13:57 (bus 0787), after stage 1 had completed.
- **One consequence of that ordering, and it is not cosmetic.** LCC's 0785 reports
  a NULL-boolean defect — `is_bail_order` was NULL for 93.7% of rows, so
  `AND NOT e.is_bail_order` dropped six rows in seven — meaning **any tier manifest
  cut before migration 0058 was ~14% of the intended Tier A**. Stage 1's batch was
  cut before that fix, so its population is a biased subset (weighted toward rows
  that carry an `hc_document_class`), not a uniform Tier-A sample.
  **Checked rather than assumed for MY selection**: the value-ordered query filters
  on `axis_a_identity AND axis_b_text AND axis_c_role`, and over the 35,694 cited
  judgments those three axes are NULL on **zero** rows — strict and null-safe forms
  both keep 35,594. Stage 2 is unaffected. Stage 1's 9,987 vectors are still valid
  vectors of the documents they name; what is skewed is which documents got picked.
