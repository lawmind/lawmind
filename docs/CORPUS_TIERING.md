# CORPUS TIERING — serving 19.5M judgments without storing them

Written 6 Aug 2026, in answer to a direct question: can the High Court corpus
reach advocates without paying for 5.4 TB of database?

**Yes. Measured: ~23 GB in Postgres and ~115 GB in object storage, against 5,361
GB.** A ~40x reduction on the database and roughly $2/month on storage we already
pay for. Nothing here needs a new vendor.

This is a design, not a decision. Narrowing OD-4 stage 3 is still the founder's
call — but it is now a $2/month decision instead of a four-figure one.

---

## 1 · Where the 5,361 GB actually goes

Measured on our own Supreme Court corpus — 38,341 judgments, so every figure below
is divided out of something real rather than estimated:

| | total | per judgment | share |
|---|---|---|---|
| `judgments` (full text, tsvector, metadata) | 1,471 MB | 38 KB | 14% |
| `judgment_chunks` (chunk text + fp32 vectors) | 4,438 MB | 116 KB | 41% |
| HNSW index | 4,811 MB | 125 KB | 45% |

**Text is the small part.** Vectors and their index are 86% of the cost. Any plan
that moves the text and leaves the vectors saves 14% and solves nothing — which is
the trap in "just put it on a drive".

---

## 2 · What was measured, including the thing that failed

### Binary quantisation: 25x smaller, and not usable alone

Built on the real corpus, not a benchmark set. `binary_quantize()` into
`bit(1024)`, HNSW over `bit_hamming_ops`:

| | fp32 | binary | ratio |
|---|---|---|---|
| table | 4,438 MB | **117 MB** | 38x |
| index | 4,811 MB | **255 MB** | 19x |
| build | 9.8 min | **2.4 min** | — |

Recall against the same exact ground truth the fp32 index was tuned on:

| `ef_search` | recall@50 |
|---|---|
| 100 | 57.3% |
| 200 | 57.8% |
| 400 | 56.7% |

**57.8% is not a search product.** Four authorities in ten missing, and raising
`ef_search` does not help — the information is gone at quantisation, not at search
time. An earlier note in this repo put binary at 87.6%; that number was not
measured on this corpus and should not be relied on.

So binary quantisation is a **candidate generator**, never an answer. That is also
how everyone else uses it: Qdrant, MongoDB Atlas and OpenSearch all pair it with
oversampling and a re-score against full-precision vectors, and Qdrant's published
figure is 3x oversampling to reach 0.939 recall.

### Text compresses hard, because these documents are short

20 real High Court judgments, Delhi / Kerala / Madras / Punjab & Haryana:

- raw extracted text **6.8 KB** average
- brotli **2.0 KB** average (3.4x)

19.5M judgments of full text is therefore **37 GB compressed**, about $0.55/month
on R2. The text was never the problem.

---

## 3 · The design

Three tiers, split by what each storage medium is actually good at.

### Tier 1 — hot, Postgres, unchanged

The 38,341 Supreme Court judgments exactly as they are now: full text, per-chunk
fp32 vectors, HNSW, the citation graph, `overruled_status`. 10.8 GB. This is the
citable core and it does not change.

### Tier 2 — warm, Postgres, ~23 GB for 19.5M judgments

**One row per judgment**, not per chunk:

| | bytes |
|---|---|
| metadata — court, date, parties, judge, CNR, disposal, storage key | ~250 |
| `bit(1024)` binary vector | 128 |
| row overhead | ~40 |

19.5M x ~418 B ≈ 8 GB, roughly 23 GB with the Hamming HNSW index on top. **That
fits in the existing 50 GB volume** beside tier 1.

One vector per judgment rather than ~16 also cuts the embedding job 16x — 19.5M
vectors instead of 313M.

### Tier 3 — cold, Cloudflare R2, ~115 GB, ~$2/month

- brotli full text, 37 GB
- flat fp32 vectors as binary blobs, 19.5M x 4 KB = 78 GB

R2 is **already in the approved stack** and has **zero egress fees**, which is the
property that makes this work at all.

### The original PDFs are never copied

`s3://indian-high-court-judgments` is public, permanent and CC-BY-4.0. It is
already a CDN and it is already paid for by somebody else. We store a key, not a
file.

---

## 4 · How a query runs

1. Tier 1 answers first, as today — hybrid sparse + dense, p95 488 ms.
2. If the answer needs the long tail, the **binary index picks ~500 candidates**
   from tier 2. Cheap, in Postgres, no network.
3. Those 500 judgments' **fp32 vectors are fetched from R2** — 500 x 4 KB = 2 MB,
   one ranged read, zero egress cost — and re-scored exactly.
4. Surviving candidates have their **text fetched from R2** for snippet and
   operative-paragraph extraction.

**The latency budget allows this.** Gate S1 is 3,000 ms and tier 1 currently
answers at 488 ms p95, so there is ~2.5 s of headroom for a tier-2 path that only
fires when tier 1 is thin.

This is the tiering pattern the industry converged on independently: a small hot
tier for interactive work and a large cold tier on object storage.

---

## 5 · Options considered and rejected, with the reason

**Telegram as free storage.** No. It breaks Telegram's terms for bulk file
storage, it is rate-limited in a way that makes it unusable on a read path, and
`CLAUDE.md` §4 already excludes a Telegram bot from this stack. R2 costs about $2
a month for the same job. Infrastructure that can be revoked for a terms breach is
a liability in a product holding advocate data, not a saving.

**A consumer drive — Google Drive, Dropbox, OneDrive.** Same class of problem:
per-file API quotas, no ranged reads worth the name, terms that do not contemplate
serving an application, and no story for the vector index, which is 86% of the
cost.

**Cloudflare Vectorize.** Attractive because Cloudflare is already in the stack,
but wrong on two counts. Its ceiling is **20M vectors per index** and this corpus
is 19.5M — no headroom at all. And it bills *queried vector dimensions* as a
function of index size rather than of work done, which is the wrong shape for a
large index serving modest query volume. **Verify the current formula against
their pricing page before reconsidering** — it changed recently and the published
worked example is ambiguous about whether the index is counted once per month or
once per query, and those two readings differ by about 100x.

**Amazon S3 Vectors.** Technically the closest fit — GA since December 2025, 2B
vectors per index, $0.06/GB-month, no idle compute, ~100 ms warm and under a
second cold. Rejected only because it introduces AWS as a fourth vendor to do what
R2 plus a Postgres binary index already does at lower cost. **Worth revisiting if
tier 2 ever outgrows a single Postgres volume** — the numbers are good and the
latency fits our budget.

---

## 6 · What this does NOT fix

**Storage was never why High Court judgments are hard to cite.**

- 0 of 9,604 metadata rows carry any citation
- 0 of 30 PDFs across six High Courts carry a neutral citation

Making 19.5M judgments cheap to hold does not make one of them citable, and no
architecture on this page changes that. `docs/DATASETS.md` has the measurement.

**But there is a real path, and the product is already built for it.** Every High
Court row carries a **CNR** — `SKHC010001792023` in the sampled data. CNR is what
eCourts resolves, and eCourts is **Tier 3 of `CITATION_HARNESS.md`**: human
confirmed, cached permanently, CAPTCHA never bypassed.

So a long-tail judgment behaves exactly as the three-field model already
specifies:

- `verification_state` = `unverified`, `verified_by_source` = `none`
- **shown to the advocate — never as confirmed, never silently dropped**
- becomes `verified` / `ecourts` the moment the advocate confirms it through the
  existing flow, and stays that way for everyone afterwards

That is not a workaround. It is the case the harness was designed for, and it is
the difference between "we have 19.5M documents" and "we have 19.5M documents and
we are honest about which ones a court will accept."

---

## 7 · Sequencing

Nothing here blocks S1, and none of it should be built before Gate S2. It exists
so the answer to "can we serve the long tail" is a measured yes rather than an
assumption, and so the storage decision can be taken calmly later.

The one thing worth doing early is **capturing CNR on every tier-2 row at ingest**.
It costs nothing at write time and it is the only key that turns a long-tail
judgment into a citable authority.
