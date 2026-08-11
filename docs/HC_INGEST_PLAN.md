# HIGH COURT INGEST — the ordered plan

**APPROVED by the founder, 11 August 2026, in these words:** *"Yes — ingest High
Court documents as searchable text behind the coverage screen, no embeddings for
now."* That closes the second half of `CURRENT_PLAN.md` §Q2 and
`FOUNDER_QUEUE.md` FQ-CORPUS.

**Why this file exists.** The founder asked for a plan detailed enough that this
lane cannot hallucinate its way through it. So **every step below carries a
`VERIFY:` that is a COMMAND with an expected output**, not a description — the
change proposed in FQ-V1, applied here first. A step is not done because it feels
done. It is done when its command prints what it says it will print.

**The rule for this whole run:** if a `VERIFY` does not print what it should,
**stop and report**. Do not proceed to the next step. Three failed attempts at
the same step ends the run.

---

## 0 · TWO CORRECTIONS THE VERIFICATION PASS FORCED, BEFORE ANY CODE

The founder asked me to search once more to check we were going the right way.
It changed two things. **Both are recorded here rather than quietly absorbed.**

### 0.1 · We do NOT get BM25. We get `ts_rank`, and it is weaker.

`CORPUS_GAP_PLAN.md` §4 justified skipping embeddings partly on *"BM25 scores
37.1% against dense 36.8%"*. **We are not running BM25.**

`services/api/src/search/retrieve.ts` uses `plainto_tsquery` / `to_tsquery`
against a stored `full_text_tsv` and ranks with **`ts_rank`**. Postgres'
native ranking *"only accounts for term frequency within a document and document
length, but not inverse document frequency"* — **no IDF**, which is the single
thing that makes a rare term like *"Kharak Singh"* outrank a common one.

**And we cannot simply install BM25.** Queried on our own Railway instance:

```
INSTALLED : pg_trgm 1.6 · plpgsql 1.0 · vector 0.8.5
AVAILABLE : pg_trgm · vector          ← that is the whole list
```

**`pg_search`, `pg_textsearch` and `vchord_bm25` are not available on Railway
Postgres 18.4.** Getting them means a custom image, which is an infrastructure
and vendor decision under `CLAUDE.md`, not an engineering one. **Not in scope for
this ingest, and it must not be smuggled in.**

**What we have instead, and it is not nothing.** We hold **97,876 resolved
citation edges**. *How often a judgment is cited by other judgments* is a
relevance prior that BM25 does not have and that a competitor's embeddings do
not have either. **That is a ranking signal we own because we built the citation
graph.** It is out of scope for the ingest and belongs in the queue after it.

### 0.2 · Railway storage is NOT a blocker — measured, not assumed

The worry was that this machine's 686 GB is irrelevant because the database is
on Railway. **Measured on our own rows:**

| | |
| --- | --- |
| `judgments` stored text (TOAST-compressed) | **629 MB** for 38,341 rows |
| `full_text_tsv` | **577 MB** — **91.7% of the text size**, higher than anyone guessed |
| mean tsvector per judgment | 15,781 bytes |
| `judgments_full_text_idx` (GIN) | 157 MB |

**Projected for 15.77M High Court documents** (mean 5,823 chars against the
Supreme Court's 35,358, so ~16.5% the size, same compression):

| | |
| --- | --- |
| text | ~43 GB |
| tsvector at 92% | ~39 GB |
| GIN index | ~16 GB |
| **total added** | **~98 GB** |
| **Railway volume storage at $0.15–0.25/GB/month** | **≈ $15–25 per month** |

**Compare with the embeddings we are not building: ~490 GB that must sit in
RAM.** The structural difference matters more than the price — **a GIN index
degrades gracefully to disk; an HNSW graph does not.** That is why this plan
works and the other one did not.

**These are projections from measured ratios. Step S7 replaces them with
observed bytes before the full run.**

---

## 1 · THE STEPS

### S2 · Read the existing harvest path before writing a line

`DONE:` I can state exactly how a High Court PDF is located and fetched today.
`VERIFY:` `rtk read services/ingest/src/harvest/hc-metadata.ts` and
`hc-citations-cli.ts` — and I can name the function that yields a PDF URL and the
one that turns bytes into text, from the file, not from memory.

**Why first.** `hc-citations-cli.ts` **already streams every one of these PDFs
successfully at 41 documents/second.** The loader is that pipeline with
`upsertJudgments` on the end instead of a discard. Rewriting the streaming half
would be inventing a second implementation of a thing that demonstrably works.

### S3 · `hc-load.ts` + tests — the mapping, which is where the risk is

`DONE:` a pure function from (metadata row, extracted text) to a `JudgmentRecord`.
`VERIFY:` `npx tsx --test src/harvest/hc-load.test.ts` — green, with cases built
from **real strings sampled out of the corpus**, never invented.

**The fields, and the trap in each:**

| field | rule |
| --- | --- |
| `court` | from the bucket partition, never parsed from text. **`bench=testcase` is a fixture publishing ~16,000 rows/year at Bombay and must be excluded** |
| `judgment_date` | from metadata. A missing date is a **skip**, not a `NULL` — a judgment with no date cannot be ordered or shown "as at" |
| `neutral_citation` | **extracted from the TEXT** for 2023+ (`2023:DHC:2720`). Absent for older years, and that is honest, not a failure |
| `reporter_citations` | **empty.** The bucket has no citation column. **Never synthesise one** |
| `full_text` | through `stripUnstorable` — invalid UTF-8 (SQLSTATE 22021) silently stopped an ingest after 2022 once already |
| `source_url` | the S3 key. **This is the resumability key**, uniquely indexed |
| `overruled_status` | **never written by ingest.** `load.ts` already excludes it from the update list, deliberately |

**The honesty rule this ingest must not break:** these are **documents**, and the
measured judgment share is **0.75%–18.64%**. Nothing in this path may write, log,
or return the word *"judgments"* for a document count.

### S4 · `hc-load-cli.ts` — dry by default

`DONE:` a CLI that reports what it would write and writes nothing without
`--apply`.
`VERIFY:` `npx tsx src/harvest/hc-load-cli.ts --court X --year Y` prints counts
and ends with `DRY RUN — nothing written`; `SELECT count(*) FROM judgments` is
unchanged.

Resumable the way the citation pass is: skip anything whose `source_url` is
already present. Batched writes — **4,097 single-row inserts over the proxy once
took 34 minutes and timed out at ten.**

### S5 · Dry-run ONE court-year, and read a sample by eye

`DONE:` the mapping is right on real data, not just on tests.
`VERIFY:` the dry run prints its counts, **and I print five full mapped records
and read them** — court, date, first 200 characters, neutral citation if any.

**This step is not optional and not a formality.** Every extractor in this repo
was written against sampled text and every one had a bug the samples exposed.

### S6 · Apply that one court-year

`DONE:` High Court documents are in `judgments` and searchable.
`VERIFY:` all four, in order:
1. `SELECT court, count(*) FROM judgments GROUP BY court` returns **more than one
   row** — it has returned exactly one, *Supreme Court of India*, for the life of
   this project
2. `ANALYZE judgments` — the standing rule; 15.77M rows changes every plan
3. a `POST /search` for a term unique to that court returns a row from it
4. `GET /corpus/coverage` shows that court's `held` move off zero

### S5–S7 · ✅ DONE 11 Aug 2026 — and S5 caught a defect no test could

**S5 is the reason the plan insisted on reading records by eye rather than
trusting a green suite.** The mapping tests were **22/22 green** and the mapping
was **wrong**: `CWJC/19122/2015` (Civil Writ Jurisdiction Case) and
`L.P.A/1614/2018` (Letters Patent Appeal) both came back with **no side**.

**The tests passed because they were written from the same assumption as the
code** — that a case-number prefix is a bare word. The corpus writes it dotted
and compound. Fixed by reading the corpus, and the fix exposed a second trap:
**`CRP` is a *Civil* Revision Petition**, so the obvious `startsWith('CR')` rule
would have labelled every civil revision in India as criminal.

**S6 — all four checks passed:**

| check | result |
| --- | --- |
| `SELECT court, count(*) FROM judgments GROUP BY court` | **two rows.** Supreme Court of India 38,341 · **Patna High Court 500** — the first time this query has returned more than one row in the life of the project |
| `ANALYZE judgments` | done |
| a High Court document is searchable | `letters patent appeal bihar` returns three real Patna judgments |
| sanity on the new rows | 254 criminal · 176 civil · 70 no side (86% classified) · **0 synthesised reporter citations** · dates 2024-01-02 → 2024-12-20 |

**0 neutral citations on Patna 2024, and that is correct rather than a failure.**
Neutral citations were adopted court by court; Delhi, Kerala, Madras and
Karnataka issue them, Patna's 2024 orders in this sample do not. The field is
null and honest.

### S7 · ✅ OBSERVED — cheaper than projected, with one caveat that matters

**Measured on the 500 documents actually written**, not scaled from a survey:

| | observed |
| --- | --- |
| mean characters | 2,916 |
| mean stored text | 1,743 bytes |
| mean tsvector | 2,543 bytes — **larger than the text**, as compression favours prose over lexemes |
| **per document** | **4,286 bytes** |
| projected for 15,771,566 documents | **~63 GB text+tsv, ~70.5 GB with the GIN index** |
| **Railway volume at $0.15–0.25/GB/month** | **$11–18 per month** |

**The caveat, stated because one court-year is not the corpus.** Patna 2024
documents average **2,916 characters** against the corpus-wide **5,823** measured
in `HC_EXTRACTION_COST.md`. If the corpus mean holds, the real figure is roughly
**double: ~141 GB and $21–35/month.**

**So the honest range is 70–141 GB and $11–35/month**, and both ends are
affordable. **§0.2's pre-ingest projection of ~98 GB sits inside that range**,
which is the first time this lane's projection and its measurement have agreed.

### S7-OLD · the original step, kept for provenance

`DONE:` the Railway projection is replaced by a measurement.
`VERIFY:` `pg_total_relation_size('judgments')` before and after, divided by rows
written — then re-project the 15.77M figure and **write the corrected number into
this file.**

**§1 of the continuation prompt, in one step:** never quote a number that implies
a write until that exact write has been done.

### S8 · ✅ RUNNING — and two things changed at the start of it

**Running:** `hc-load-cli.ts --from-year 2016 --batch 200 --concurrency 14
--apply`, logging to `hc-load.log`. Resumable on `source_url`; restart with the
same command.

**Change 1 — NEWEST FIRST.** The first start went 1950 → 1951 → 1952, because
that is the order the bucket lists partitions. **An interruption of a multi-week
ingest would have left us holding the least useful half**, and an advocate needs
2026 far more than 1955. Descending also front-loads **2023+, the only years
carrying a neutral citation** and therefore the only High Court documents that
are citable rather than merely searchable. Caught after 297 rows.

**Change 2 — THE CITATION PASS IS NOT BEING RESTARTED, deliberately.**

It **died** at some point after 00:34 (PID gone, no progress line for four
hours). The runbook says restart it, and that would have been the wrong move.

**The two jobs download the same 15.77M PDFs.** The citation pass streams each
one and **throws the text away**; the loader streams each one and **keeps it**.
Running both means paying for every download twice.

**Once the text is in `judgments`, citations come out of the database with no
downloads at all** — `citations-cli --rescan` already works exactly that way, and
it is what produced 37,875 new edges earlier tonight. So the citation pass is
**superseded for every document the loader covers**, and restarting it would
have doubled the network cost to produce something the loader makes free.

**Nothing already earned is lost:** the 51,097 external citations it found across
367,995 documents of 2016 are in `external_citations` and stay there.

**What this changes for stage 2:** the answer to *"which High Court judgments are
actually cited"* now arrives from `--rescan` after the ingest, rather than from a
second live pass during it. Same answer, one download.

### S8-OLD · the original step

`DONE:` the ingest is running and resumable.
`VERIFY:` a log line advancing, and a restart that skips what is done.

**Not started until S7's number is acceptable.** If the observed cost is far above
§0.2's projection, that is a new founder decision, not a thing to push through.

---

## 2 · WHAT THIS PLAN DELIBERATELY DOES NOT DO

- **No embeddings.** The founder's yes was explicit about it.
- **No BM25 extension.** §0.1 — not available, and installing one is a vendor
  decision.
- **No OCR.** The measured burden is 0.2%; scanned documents are skipped and
  counted, never silently dropped.
- **No `reporter_citations` invention.** A synthesised citation is the exact
  failure this product exists to prevent.
- **No claim that these are judgments.** They are documents, 0.75%–18.64% of
  which are judgments.

---

## 3 · THE RANKING ITEM THIS CREATES, for after the ingest

`ts_rank` has no IDF (§0.1). Once 15.77M documents are in, ranking quality
becomes the visible problem rather than coverage.

**The lever we uniquely hold is the citation graph** — 97,876 resolved edges, and
the High Court pass adding more. A judgment cited 500 times outranks one cited
twice, and neither BM25 nor an embedding knows that. **Queued, not started, and
explicitly out of scope for this ingest.**

### 3.1 · VESPA, QDRANT, MILVUS — the founder's question, 11 Aug

**The founder is right, and about the better of the two problems.** He proposed
these as alternatives to pgvector. The honest finding is that **the interesting
one is not a vector-database question at all** — it is the answer to §0.1.

**Qdrant is out before the comparison starts.** `CLAUDE.md` §4 names it in the
explicitly-NOT-used list alongside Neon, Vercel, Clerk and Supabase. Changing
that is the founder's to do, in writing, not something a research note settles.

**Milvus is the wrong shape for us.** It is vector-first — *"purpose-built for
billion-vector scale"*. **We decided tonight not to build 41M vectors**, so a
better home for vectors we are not creating solves a problem we no longer have.

**Vespa is genuinely the right tool, and for a reason specific to us:**

| what we need | what Vespa gives |
| --- | --- |
| **BM25 with IDF** — the exact gap in `ts_rank`, §0.1 | native BM25 as a first-phase ranking feature |
| **Citation count as a ranking signal** — the thing we own and competitors do not | **programmable ranking expressions**; a second phase can read `cited_by_count` as a first-class feature. *"the strongest option when ranking logic is more than cosine similarity, then filter"* |
| structured filters — court, year, judge, which `qlang` already parses | structured + sparse + dense in one engine |
| vectors later, if stage 2 says so | tensors in the same document, no second migration |
| 15.77M documents | *"billion-scale for over a decade"* |

**It replaces the SEARCH half, not the system of record.** `CLAUDE.md` is
absolute that citation fields render **from the database row**, and
`overruled_status` is read live at render on every surface. **That stays
Postgres.** Vespa would be an index built *from* `judgments` — which means

> **tonight's ingest is not wasted under any outcome. The text has to be in
> Postgres either way; Vespa would read it from there.**

**Cost of finding out: nothing.** A single-node Vespa needs **4 GB** in Docker.
This machine has **31.7 GB** and 686 GB free. It can be evaluated against a real
court-year the moment S6 lands, with no vendor, no bill and no commitment.

**What it is not.** A second serving system to operate, monitor, back up and
keep in sync — against `CLAUDE.md`'s ponytail ladder, which says the best code is
the code you never wrote. **That trade is only worth making if measured ranking
on real queries says `ts_rank` is failing advocates.** After S6 we can measure
exactly that, on 15.77M real documents, instead of arguing it.

**Queued as a founder decision with an evaluation attached — `FOUNDER_QUEUE.md`
FQ-VESPA — not started, and not blocking the ingest.**

Sources:
[Vespa hybrid ranking](https://docs.vespa.ai/en/learn/tutorials/hybrid-search.html) ·
[multi-stage ranking](https://pradeepbhandari.com/blog/vespa-multi-stage-ranking-merging-bm25-and-vector-search) ·
[vector DB comparison](https://www.firecrawl.dev/blog/best-vector-databases) ·
[Vespa docker requirements](https://docs.vespa.ai/en/operations/self-managed/docker-containers.html) ·
[pg_textsearch / BM25 in Postgres](https://www.tigerdata.com/blog/introducing-pg_textsearch-true-bm25-ranking-hybrid-retrieval-postgres)
