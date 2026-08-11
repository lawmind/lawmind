# High Court dense coverage — what it actually costs

**Measured 11 Aug 2026, against production, with the real chunker.**
Answers the standing question *"what subset / chunking / index architecture gives
HC dense coverage without blowing up Postgres?"*

**Answer: no subset is needed. The corpus we hold is 94,049 chunks and 1.38 GB.
The rejection in `CORPUS_GAP_PLAN.md` §3 is sound and does not apply to it.**

---

## 1 · The rejection was scoped to a corpus 385× larger than ours

`CORPUS_GAP_PLAN.md` §3 rejected embedding the High Courts: **~41M vectors,
≈490 GB wanting RAM, against an 11 GB database**, four times past pgvector's
documented ceiling. That analysis is correct and stands.

**It was computed for the full AWS bucket — 15.77M documents.** We hold
**40,980**, which is **0.26%** of it. Every number scales accordingly, and
nothing about the 15.77M figure was ever a statement about our own corpus.

---

## 2 · What we actually hold, measured

| | Supreme Court | High Court |
| --- | --- | --- |
| judgments | 38,342 | **40,980** |
| mean chars | 35,357 | **4,071** |
| median chars | 24,011 | **3,018** |
| total text | 1,293 MB | **159 MB** |

High Court documents are **8.7× shorter** — they are mostly orders, not reasoned
judgments (`HC_CORPUS_CHARACTERIZATION.md`: measured judgment share 0.75–18.64%).

### Chunks, from the real chunker rather than a division

`chunkJudgment` (maxChars 2400 / minChars 320 / overlap 240) run over a **random
400-judgment HC sample**: 918 chunks → **2.29 chunks per document**.

*(`CORPUS_GAP_PLAN.md` estimated 2.6 by dividing 5,823 ÷ 2,200. The real chunker
on the corpus we actually hold gives 2.29, and our held HC documents are shorter
than the bucket-wide average it used.)*

| | |
| --- | --- |
| HC chunks projected | **94,049** |
| existing SC chunks | 616,197 |
| **total after** | **710,246 vectors** |

### Storage, from our own tables

`judgment_chunks` is 9,267 MB over 616,197 rows including its HNSW index →
**15,770 bytes per chunk row**.

| | |
| --- | --- |
| projected added storage | **+1.38 GB** |
| database today | 11 GB |
| database after | **≈12.4 GB** |

**710k vectors is comfortably inside pgvector's working range** (the documented
caution starts at 5–10M). The existing HNSW already serves 616k.

---

## 3 · The real constraint is TIME, not storage

Measured on this machine, CPU, BGE-M3 via the existing embed CLI: **45 chunks in
35 s = 0.78 s/chunk.**

    94,049 chunks × 0.78 s ≈ 73,000 s ≈ 20.4 hours

That is the honest cost. Three things make it acceptable rather than blocking:

- **The CLI is resumable.** A judgment already carrying chunks is skipped, and
  each judgment's chunks are written in one transaction — an interrupted run
  leaves all of a judgment's chunks or none, never a half-embedded judgment that
  would retrieve partially and silently.
- **It orders `judgment_date DESC`**, so partial coverage is *useful* coverage:
  advocates cite recent law, and an interrupted run has embedded the recent end.
- **No code change is needed.** `WHERE NOT EXISTS (chunks)` already selects
  exactly the 40,980 — measured: 40,980 High Court and **1** Supreme Court
  judgment remain unembedded.

**No selective subset is proposed.** `CORPUS_GAP_PLAN.md` §5 Stage 2 suggested
embedding only cited judgments to stay inside pgvector's range — that reasoning
was driven by the 41M figure and is unnecessary at 94k. Selecting a subset here
would add a filtering mechanism, a coverage question and a "why is this judgment
not dense-searchable" support burden, to save 1.38 GB. That is complexity bought
for nothing.

---

## 4 · What this does and does not fix

**Does:** High Court judgments become reachable by dense retrieval, and stop
being structurally down-ranked by RRF. A judgment appearing in both candidate
lists collects two `1/(k+rank)` contributions; one that can only appear in the
lexical list collects one. No HC judgment can currently collect the second, so
the whole HC corpus competes one-armed — verified against production, where
three ordinary HC practice queries returned **five results each and zero from a
High Court**.

**Does not:** fix recall. `recall@20` is 38.9% on the production path over the
Supreme-Court-only eval set — six queries in ten never surface their gold
judgment anywhere in the top twenty. That is a separate, upstream problem and no
reranker addresses it.

**Does not** tell us anything about HC *ranking quality*, because **no evaluation
query has a High Court gold judgment**. 283 of 283 are Supreme Court. Embedding
the HC corpus without HC eval queries means the improvement is unmeasurable —
which is why Stage 9's first category is HC queries with HC gold.

---

## 5 · If the corpus grows toward 15.77M

`CORPUS_GAP_PLAN.md` §3 applies again, and its conclusion is unchanged: at that
scale the vectors do not fit and would not be servable. **The selective-embedding
and quantization options in its §5 Stage 2/3 are the right response then.** This
document changes nothing about that; it only records that the current holdings
are three orders of magnitude away from it.
