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

### The accuracy question, answered properly

**Compression does not have to cost accuracy. Measured, on this corpus, at 616,197
vectors against exact sequential-scan ground truth.**

Two things were being conflated and they need separating first:

- **Citation accuracy** — never showing a fake or unverified citation as
  confirmed. **Nothing on this page can affect it.** Citation fields render from
  the database row and pass the three tiers of `CITATION_HARNESS.md`. A vector
  index chooses *which* judgments to show; it cannot change what a judgment's
  citation says.
- **Retrieval recall** — whether the right authority is found at all. This is what
  compression puts at risk, and it is what everything below measures.

Storage, built on the real corpus rather than a benchmark set:

| | table | index | total | vs fp32 |
|---|---|---|---|---|
| fp32 `vector(1024)` | 4,438 MB | 4,811 MB | 9,249 MB | — |
| fp16 `halfvec(1024)` | — | — | **3,275 MB** | 2.8x |
| binary `bit(1024)` | 117 MB | 255 MB | **362 MB** | **25.5x** |

Binary builds in 2.4 minutes against 9.8 for fp32.

**Asked to produce the final answer directly, binary fails.** Recall@50 is 57.3%
at `ef_search` 100 and does not improve with more search — 57.8% at 200, 56.7% at
400. The information is lost at quantisation, not at search time. Four authorities
in ten missing is not a search product, and an earlier note in this repo claiming
87.6% was never measured here.

**But that is the wrong question.** In the tiered design binary never produces the
answer — it produces *candidates*, which are then re-scored against exact fp32
vectors. The final ranking is therefore **exact by construction**. The only thing
that can be lost is a true neighbour that never reached the candidate list, and
that is what oversampling buys:

| candidates | oversample | binary `bit(1024)` | fp16 `halfvec` |
|---|---|---|---|
| 50 | 1x | 57.2% | 99.6% |
| 200 | 4x | 91.1% | 99.7% |
| 500 | 10x | **98.2%** | 99.9% |
| 1000 | 20x | **99.8%** | 100.0% |

*(Fraction of the exact fp32 top-50 present in the candidate list. Latency is ~1.7s
in all cells because it is dominated by the round trip from this workstation to
sfo, not by the index — server-side the fp32 index answers in 10.7 ms.)*

**So the trade-off is not accuracy against storage. It is oversampling against
storage, and oversampling is nearly free.** 25.5x smaller at 99.8% candidate
recall and an exact final ranking.

Two settings, both defensible, and the choice is about tier not about principle:

- **fp16 `halfvec` — 99.6% at no oversampling, 2.8x smaller.** Use where recall
  must be beyond argument and the corpus is small enough to afford it.
- **binary + 20x oversample + exact re-score — 99.8%, 25.5x smaller.** Use for the
  long tail, where the alternative is not having the judgment at all.

This matches what the field does: Qdrant, MongoDB Atlas and OpenSearch all pair
binary quantisation with oversampling and a full-precision re-score, and Qdrant
publishes 3x oversampling for 0.939 recall. Our own curve is better than that
because we oversample harder.

**Better methods exist and are worth watching.** Extended RaBitQ reaches ~95%
recall at 5 bits per dimension and ~99% at 7, *without* re-ranking, and it ships
in Milvus, LanceDB and Weaviate — **not in pgvector**, which is why it is not the
recommendation today. `pgvectorscale` (StreamingDiskANN + Statistical Binary
Quantisation) is a Postgres extension and reports 99% recall on 50M vectors, but
it needs a custom Postgres image on Railway, which is a production database
migration and not a thing to do casually.

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

## 5a · What it costs — and why cost turns out not to decide it

Published prices, 6 Aug 2026. Sizes are our own measurements divided out, not
estimates.

| | |
|---|---|
| Railway volume | **$0.15 / GB-month**, self-serve to 1 TB on Pro |
| Cloudflare R2 | **$0.015 / GB-month**, zero egress, 10 GB free |
| Amazon S3 Vectors | **$0.06 / GB-month**, $0.20/GB one-off write |

Per-vector cost of a tier-2 row, measured: fp16 `halfvec` came to 5.31 KB each
including its HNSW index (3,275 MB / 616,197), binary `bit(1024)` to 0.6 KB.

| option | where tier 2 lives | recall | added $/month |
|---|---|---|---|
| **A — all Railway, fp16** | Postgres, ~107 GB | **99.6%**, no oversampling | **~$18** |
| B — hybrid, S3 Vectors | AWS, ~80 GB exact fp32 | exact | ~$5.35 |
| C — hybrid, binary + re-score | Postgres 17 GB + R2 115 GB | 99.8% after re-score | ~$5.18 |

**The spread between them is about $13 a month — $150 a year.** That is not a
number that should choose an architecture.

**So the recommendation is A, on simplicity.** One vendor, one network in the read
path, no cross-cloud hop, no oversample-and-re-score machinery to get wrong, and
99.6% recall with no tuning knob at all. B and C save $150 a year and buy a second
system in the hot path; at this stage that is a bad trade.

**What made this affordable was the architecture, not the vendor.** The original
5,369 GB — $805/month on Railway — collapses to ~107 GB because of three changes,
none of which involve a cloud: one vector per judgment instead of ~16, fp16
instead of fp32, and full text in object storage instead of in the database.
Choosing AWS instead would have saved $13/month on a problem that was never about
who hosts it.

**Revisit B when tier 2 outgrows a single Railway volume.** The 1 TB self-serve
ceiling is roughly 10x what this needs, so that is not close.

### AWS credits — take them, but do not let them choose the design

DPIIT-recognised startups get **$5,000 in AWS Activate credits** through Startup
India, plus partner offers. Conditions: a Startup India Organizational ID,
self-funded or pre-Series B, a functioning company website, founded within the
last 10 years, and no equal-or-greater Activate credit already received. The
self-serve Founders tier is up to $1,000; the larger Portfolio amounts come
through a VC or accelerator.

$5,000 would cover option B's AWS line for decades. **It should still not decide
this.** Credits expire — typically one to two years — and the classic mistake is
letting free credit pick a platform whose complexity outlives the credit. Take
them and spend them on something that ends when they do: the batch embedding runs
for tier 2, which are one-off GPU cost and a perfect fit.

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

---

## 6 · Update, 9 August 2026 — a new cap, verified prices, and structured search

Three things changed since this was written. **None of them breaks the design;
one of them makes it cheaper still.**

### 6a · Railway now caps the volume at 250 GB

The founder reports Railway will not extend past **250 GB** without a
prerequisite step, with 1 TB available after that. **This design never approaches
either number.** Tier 1 is 10.8 GB and tier 2 is ~23 GB — **34 GB of a 250 GB
ceiling for 19.5M judgments.** The cap is not a constraint on this plan, and the
1 TB tier does not need to be bought.

The trap it *would* have been a constraint on is the naive design: full text and
tsvector for every judgment inside Postgres. That is where a 250 GB wall is real,
and it is exactly what tiers 2 and 3 exist to avoid.

### 6b · Prices verified rather than remembered

| | rate | source |
| --- | --- | --- |
| Railway volume | **$0.15 / GB / month** | Railway pricing, checked 9 Aug 2026 |
| Railway egress | $0.05 / GB outbound, inbound free | same |
| Cloudflare R2 storage | **$0.015 / GB / month** | R2 pricing, checked 9 Aug 2026 |
| Cloudflare R2 egress | **$0** | same |

**R2 is exactly ten times cheaper per GB than the Railway volume, and Railway
charges for outbound while R2 does not.** Both facts point the same way, and the
§3 split already follows them. The §3 estimate of "~$2/month" for 115 GB checks
out: 115 × $0.015 = **$1.73**.

Running cost of the whole tiered corpus:

| | |
| --- | --- |
| Postgres, 34 GB × $0.15 | **~$5.10 / month** |
| R2, 115 GB × $0.015 | **~$1.73 / month** |
| Original PDFs on AWS Open Data | **$0 — we store a key, not a file** |
| **Total** | **under $7 / month** |

### 6c · Structured search makes tier 2 more valuable than it was designed to be

This file was written before the decision to build field and Boolean search. That
decision changes what tier 2 is *for*, and improves the economics:

**Tier 2's per-judgment row is already everything structured search needs.**
Citation, party, judge, court, date, case number — all metadata, none of it
requiring a vector, a chunk or a full-text index. Measured on the Supreme Court
corpus, the metadata columns are **335 bytes per judgment stored**, which is
within a third of this file's ~250-byte estimate and confirms the shape.

So **field search over the entire 19.5M corpus is essentially free** — it rides
on a tier that was going to be built anyway for semantic candidate generation.
Two additions to the row budget, both small:

- `judgment_judges` — ~1.16 judges per judgment measured, so ~23M rows at ~80 B
  ≈ **2 GB**. Required because `bench` is a comma-delimited list and facets over
  the raw string count bench *compositions* rather than judges.
- `judgment_statute_refs` — the "cases on s.138 NI Act" index, a few rows per
  judgment ≈ **6 GB**.

Tier 2 therefore lands nearer **31 GB**, and the total nearer **42 GB of 250**.

### 6d · One correction to a figure quoted elsewhere today

An estimate of **274 GB** for full text at 15.9M judgments was derived by scaling
this repository's *Supreme Court* average of 35 KB. **That is the wrong
denominator.** §2 of this file measured 20 real High Court judgments at **6.8 KB
raw and 2.0 KB brotli** — High Court judgments are roughly a fifth the length of
Supreme Court ones, and the figure that stands is this file's **37 GB
compressed**, not 274 GB.

**Scaling a whole-database total by a row count is not analysis.** The per-column
measurement is the one to trust, and it is already here.
