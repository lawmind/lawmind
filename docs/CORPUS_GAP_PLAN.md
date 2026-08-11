# CLOSING THE CORPUS GAP — 38,341 → millions

Written 11 August 2026 on the founder's question: *"Why do we only hold around
thirty-eight thousand when there are literally twenty million on AWS?"*

**Every number below was measured on this machine or queried from our database
tonight. None is recalled and none is from a blog.**

---

## 1 · THE HONEST ANSWER TO "WHY ONLY 38,341"

Three reasons, and only one of them is a decision.

| | |
| --- | --- |
| **1. The loader does not exist.** | `upsertJudgments` in `services/ingest/src/load.ts` is generic, resumable and battle-tested — and **only `cli.ts` (the Supreme Court ingest) calls it.** `hc-metadata.ts` enumerates the bucket, `hc-extract.ts` **measures** extraction cost, `hc-citations-cli.ts` streams PDFs and **throws the text away**. Nothing writes a High Court judgment into `judgments`. |
| **2. Two questions are with the founder** (§Q2, open since 9 Aug) | citability and embedding cost |
| **3. Nobody costed it correctly** | the cost everyone quoted was **GPU hours**. That is not the binding constraint. §4 |

**It was never a storage problem and it was never an AWS problem.** AWS sponsors
the transfer, the licence is CC-BY-4.0, and §2 shows the storage is trivial on
this machine.

---

## 2 · WHAT THIS MACHINE ACTUALLY HAS — measured tonight

The project moved from a MacBook to this Windows machine for storage and speed.
That was the right call and the numbers say so:

| | |
| --- | --- |
| **Disk free, C:** | **685.8 GB** of 930.5 GB |
| **RAM** | **31.7 GB** |
| **CPU** | **i7-12700K · 12 cores · 20 threads** |
| **GPU** | **RTX 4060 Ti · 8,188 MiB VRAM** (6,598 MiB free) |

### Against what the corpus needs

| | |
| --- | --- |
| High Court raw text, whole decade | **96.4 GB** (`HC_EXTRACTION_COST.md`: 15.77M × 5,823 chars) |
| Same, brotli | **~37 GB** (`CORPUS_TIERING.md`) |
| **Disk headroom** | **7× the raw figure. Storage is a non-issue.** |

**A correction worth keeping:** an earlier estimate of **274 GB** was **7× too
high** — a total scaled by a row count. The real figure is 96.4 GB raw.

### Extraction time on THIS machine

Extraction is measured at **186 ms/PDF**, and the High Court citation pass is
running right now at **41 documents/second** doing exactly this work — download,
extract, discard.

**15.77M ÷ 41/s ≈ 107 hours ≈ 4.5 days**, single process, on the pass's current
concurrency of 16. **The 20 threads here can carry more than one such process.**

**So the text of every High Court judgment of the decade is roughly four to five
days of this machine's time and 96 GB of its disk.** That is the whole cost of
making 15.77M documents searchable.

---

## 3 · THE NUMBER THAT CHANGES THE DECISION

Queried tonight, from our own database:

| table | size |
| --- | --- |
| `judgment_chunks` | **9,267 MB** |
| ⤷ of which `judgment_chunks_embedding_hnsw` | **4,811 MB** |
| `judgments` (38,341 rows, 1,293 MB of text) | **1,485 MB** |
| whole database | **11 GB** |

**Embeddings are 7.2× the size of the text they were made from.**

- 616,197 chunks, **all embedded**, **1024 dimensions**
- **16.07 chunks per Supreme Court judgment**
- HNSW index: **4.7 GB for 616k vectors** ≈ **7.8 kB of index per vector**

### Scaled to the High Courts

High Court documents are far shorter than Supreme Court ones — **5,823 characters
against 35,358** — because most are orders, not judgments. So:

| | |
| --- | --- |
| chunks per HC document | 5,823 ÷ ~2,200 ≈ **2.6** |
| **HC chunks** | 15.77M × 2.6 ≈ **41 million vectors** |
| raw vector data | 41M × 1024 × 4 bytes ≈ **168 GB** |
| HNSW index at our measured 7.8 kB/vector | ≈ **320 GB** |
| **total, and it wants to be in RAM** | **≈ 490 GB** |

**Our database is 11 GB today. This is roughly 45× larger.**

### And pgvector is documented to stop before that

- *"pgvector works well for datasets under about 5 million vectors"*
- *"Skip pgvector if your vector index exceeds 10M rows"*
- An HNSW index on 10M × 1536-dim reaches **80–120 GB**
- When the graph exceeds RAM, *"sub-millisecond queries become multi-second"*

**We would be at 41M vectors — four times past the documented ceiling.** And
`CLAUDE.md` fixes the stack to **Railway Postgres + pgvector, explicitly not
Qdrant**, so changing that is a vendor decision, not an engineering one.

[Scaling pgvector](https://dev.to/philip_mcclarence_2ef9475/scaling-pgvector-memory-quantization-and-index-build-strategies-8m2) ·
[the vector-search memory wall](https://datarekha.com/blog/vector-search-memory-wall/) ·
[ClickHouse on scaling pgvector](https://clickhouse.com/resources/engineering/scale-vector-search-postgres)

### The finding, in one line

**The blocker was never GPU hours. It is that the vectors would not fit, and
would not be servable if they did.** GPU hours are the cost of *creating*
embeddings; RAM is the cost of *using* them, every day, forever.

---

## 4 · AND THE EMBEDDINGS MAY NOT BE WORTH IT ANYWAY

On legal passage retrieval, published ablations put **BM25 at 37.1% and dense
embeddings at 36.8% — a 0.3 point difference.** Dense retrieval's effectiveness
on legal case retrieval is described in the literature as *"limited"*: long
documents, and a need for precise lexical matching of statutes, section numbers
and party names, which is exactly what embeddings are worst at and BM25 is best
at. `RESEARCH_2026-08-11.md` §2.

**An advocate searching `section 138 NI Act` or `Kharak Singh` is doing lexical
retrieval.** Postgres full-text search over 15.77M documents costs a GIN index
and no GPU at all.

---

## 5 · THE PLAN — three stages, and the founder only has to approve stage 1

### Stage 1 · Ingest the text. No embeddings. ~5 days, ~96 GB, £0.

Build `hc-load-cli.ts` next to the pass that already works: stream the AWS PDFs,
extract with the same `unpdf` path, **upsert through the existing
`upsertJudgments`** — which is already resumable on `source_url`, already batched
at 100, and already carries `stripUnstorable` for the invalid-UTF-8 failure that
once silently stopped an ingest after 2022.

Index lexically with Postgres FTS. **15.77M documents become searchable.**

**Ship behind the coverage screen RCC already built** — it says *documents*, never
*judgments*, and states the measured 0.75%–18.64% judgment share as the range it
is. **The honest surface for this already exists.**

### Stage 2 · Embed selectively — and the citation pass is what decides which

**Only 15,218 of our 38,341 Supreme Court judgments are cited by anything at
all** — 40%. The other 60% are in the corpus and no judgment in it refers to them.

**The High Court citation pass running right now is measuring exactly this for
the High Courts.** That is what it is for. When it finishes we will know which
High Court judgments are actually cited, and that set — not 15.77M — is what
deserves a vector.

**This keeps us inside pgvector's working range instead of four times past it.**

### Stage 3 · Only if stage 2 says so

Quantization (int8 with rescoring, ~4× less memory at negligible recall loss) or
`pgvectorscale`/DiskANN. **Both are decisions to take with a measurement in hand,
not now.**

---

## 6 · WHAT THE GPU IS ACTUALLY FOR

Not this. **The pseudonymiser** — `FOUNDER_QUEUE.md` FQ-D1 — which is the single
blocker on core feature #3 (drafting), is NER inference rather than corpus
embedding, and has an Indian-legal baseline available in OpenNyAI's legal NER.
8 GB of VRAM is ample for that and nowhere near enough for a 41M-vector index.

---

## 7 · WHAT IS STILL THE FOUNDER'S

**Stage 1 needs one answer: ship High Court documents behind honest coverage,
knowing most are orders rather than judgments and that pre-2023 ones carry no
citation we can extract?**

The citability half of §Q2 has already narrowed: **from 2023 the courts print a
neutral citation inside the judgment text** (`2023:DHC:2720`, `2023:KHC-D:1`), so
those years are citable with no metadata column. The extractor now has a pattern
for that form. Older years remain searchable-not-citable.

**Stages 2 and 3 need nothing yet.** They need the citation pass to finish.
