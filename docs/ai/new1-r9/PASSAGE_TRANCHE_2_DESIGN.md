# Passage tranche 2 — fitted to a storage budget before a single vector is built

**NEW1, R9, 27 August 2026.** Status: **DESIGNED AND PRICED, NOT STARTED.**
Every number below is measured on this box today, not projected from a vendor
table. The tranche does not start until the coarse walk's storage line is
settled, because the two compete for the same free space and the coarse job is
the one that gives every judgment *some* semantic reach.

---

## 1. The measured cost of a passage, on this machine

From `new1_tranche_passages`, the tranche that already exists:

| quantity | measured |
| --- | ---: |
| passages | 418,116 |
| documents | 81,720 |
| passages per document | **5.115** |
| heap + TOAST | 5,790 MB → **13,847 B/passage** |
| HNSW index (`m=16`, `ef_construction=64`) | 3,244 MB → **7,760 B/passage** |
| **all-in per passage** | **21,607 B ≈ 21.1 KiB** |
| **all-in per document** | **110,520 B ≈ 108 KiB** |

The table stores **no passage text** — its columns are `judgment_id`,
`chunk_index`, `char_offset`, `body_length`, `text_chars`, `token_count`,
`segmentation`, `embedding`, `created_at`. So 21.1 KiB per passage is what a
`vector(1024)` fp32 costs once TOAST, row overhead and an HNSW graph are paid
for. It is not padding that can be trimmed by dropping a column.

### What a full-corpus passage build would actually cost

```
8,854,281 eligible representatives  ×  108 KiB  =  935 GB
free space on C:                                   269.5 GB
```

**The directive's premise is confirmed and it is not close.** Not "600+ GB" —
**935 GB**, and that is before the coarse vectors, before NEW2 keeps ingesting,
and before any room to build an index in. This is settled by arithmetic on
measured numbers, so it does not need re-litigating next round.

---

## 2. The budget

Free space, measured 27 Aug 2026: **C: 269.5 GB free of 930.5 GB**. The database
is 303 GB.

| line | GB | why |
| --- | ---: | --- |
| coarse walk to completion | 38.4 | 6,553,765 vectors × 5,856 B measured on `new1_doc_vector_stage` |
| coarse HNSW index (halfvec) | ~35 | from `judgment_chunks`' measured 7,806 B/vector fp32, halved by halfvec |
| NEW2 ingest growth, one year | 12 | 117k judgments/month × 8.3 KB/row measured |
| OS · WAL · index-build temp | 60 | an HNSW build and a `VACUUM FULL` both need room; a budget with no slack fails at 95% |
| **passage tranche 2** | **60** | the line this document spends |
| unallocated slack | 64.1 | deliberate |

**60 GB / 110,520 B = 568,000 documents ≈ 2.91M passages.**

The 81,720 documents already in `new1_tranche_passages` cost 8.7 GB and are
**kept**, per the directive. They count against the 60 GB, so the tranche-2
increment is ~486,000 *new* documents.

### The option that would change all of this

**D: has 793.3 GB free of 1,863 GB and the database does not use it.** A
PostgreSQL tablespace on D: for the passage table and its index would lift the
ceiling from 60 GB to something that could hold a materially larger tranche —
possibly the Supreme Court plus every High Court judgment since 2020.

I am **not** doing that unilaterally. It changes the physical layout of the
production database, its restore procedure and its backup surface; D:'s
random-read performance under an HNSW probe is unmeasured; and `MIGRATION_SLOT`
and the restore proof are LCC's. It is raised here as the single highest-leverage
storage decision available and it belongs to the founder and LCC, not to a
retrieval lane acting alone.

---

## 3. What goes in it — selected on advocate value, filled in priority order

A cap plus an ordered selector, not a hand-picked list. The cap is
**568,000 documents**; the selector fills it in this order and stops.

Implemented as `services/harness/src/tranche2-select.mjs`. **The table below is
measured output from a real run of it, not an estimate** — `--plan --cap 200000`,
27 Aug 2026, against definition `5b5d02384b46c96c`.

| # | population | candidates | novel | **eligible** | why an advocate needs the passage, not just the document |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | **Supreme Court, all** | 38,351 | 28,345 | **28,252** | binding on every court in India. The one population where the *paragraph* is what gets pleaded. 10,006 are already in tranche 1. |
| 2 | **Cited authorities** | 35,890 | 18,630 | **10,676** | a judgment other judgments actually cite is the definition of an authority worth quoting from. |
| 3 | **BNS / BNSS / BSA transition** | 116,678 | 116,254 | **91,365** | judgments citing the new codes. No frontier model knows them, so retrieval is the *only* path — and 2024-26 is exactly when advocates need the paragraph that says how a court read s. 103 for the first time. |
| 4 | **Treatment and currentness** | 137 | **0** | 0 | `overruled_status <> 'none'` plus the judgments that did the overruling. Every one of the 137 is *already* covered by populations 1–2, which is the right answer and is worth having measured rather than assumed. |
| 5 | **Saved to matters** | 0 | 0 | 0 | `matter_authorities` is empty — there are no users yet. This must be a **continuous trickle, never a batch**: the day an advocate saves an authority is the day its passages should exist. A queue, not a tranche member. |
| 6 | **Recent High Court**, newest first | — | — | fills the rest | 2026 Tier-A alone is 450,802; 2025 is 1,000,957. Newest-first is the only ordering that spends the remainder on law that is still current. |

**The irreplaceable core is 130,293 new documents**, not the ~191,000 the raw
candidate counts suggest:

```
28,252 + 10,676 + 91,365 = 130,293 documents
                         = 666,000 passages
                         = 13.4 GiB
                         = ~17.5 GPU-hours ≈ 0.73 days
```

That leaves roughly **427,700 slots** for recent High Court inside the 60 GB
budget — most of the 2026 Tier-A population.

### Two things the run measured that guesswork would have got wrong

**Only 10,676 of 18,630 novel cited authorities are passage-worthy — 57% fail.**
A judgment other judgments cite is very often a short order, and `brief`/`stub`
documents have no paragraphs worth splitting. "Cited authorities" sounds like a
35,890-document population and is a 10,676-document one.

**Population 4 contributes zero.** All 137 treatment-and-currentness judgments
are already inside the Supreme Court and cited-authority sets. The selector still
runs it, because the day one *isn't* covered is the day it matters most and a
population that is empty today is not a population that can be deleted.

### The ordering is the design

Every one of 1–4 is small and irreplaceable; 6 is large and substitutable. Fill
the irreplaceable ones completely, then spend what is left on recency. That way a
budget cut removes High Court volume and never removes the Supreme Court.

---

## 4. GPU cost, measured

The tranche-1 run: 1,516 passages in 170 s at 5,600 tok/s, average passage ≈ 530
tokens → **≈ 38,000 passages/hour**.

```
2.91M passages  ÷  38,000/h  =  ~77 GPU-hours  ≈  3.2 days continuous
```

Against the coarse walk's remaining **~211 GPU-hours ≈ 8.8 days**. One GPU, so
these are sequential unless someone decides otherwise.

**Recommendation: coarse first.** Exact and lexical search already cover 100% of
the corpus, so nothing is unreachable today. The coarse walk is what takes
*semantic* reach from 22.9% of the corpus to all of it; the passage tranche makes
half a million documents better. Breadth before depth, and the ordering is
reversible at any batch boundary because both jobs checkpoint in their own table.

If the founder wants the transition population sooner, the honest interleave is
to run **tranche items 1–4 only** — **130,293 documents ≈ 666k passages ≈ 17.5
GPU-hours ≈ 0.73 days** — and leave item 6 until the coarse walk finishes. That
buys every Supreme Court judgment, every passage-worthy cited authority and the
whole BNS/BNSS/BSA transition for **under a day** of the coarse ETA, at 13.4 GiB.

That is a cheap enough trade that I would take it, and the frozen id list is
already cut and hashed so it is one command away.

---

## 5. What this does NOT do

- It does **not** re-open segmentation. `chunk.ts/defaults@F_ALL_CHUNKS` produced
  5.115 passages per document and that is the recipe tranche 2 uses. No bakeoff.
- It does **not** enable broad semantic search. `search.semantic.broad` stays
  `EXPERIMENTAL_INTERNAL` in LCC's capability registry. This is coverage work so
  that the eventual evaluation runs against the real corpus rather than 81,720
  judgments.
- It does **not** rely on the passage-role classifier. FIFTH's blind 200 (bus
  1360) found it fails independent confusion, and nothing in this selector reads
  a role label.
- It does **not** claim passage retrieval is release-ready. The measured
  supporting-authority failure is ranking-at-useful-depth, not representation
  absence, and this round does not attempt to fix it.
