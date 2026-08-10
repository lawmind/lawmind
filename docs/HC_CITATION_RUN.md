# THE HIGH COURT CITATION PASS — running since 11 August 2026

**Started and verified writing.** This is the runbook: how to check it, stop it,
restart it, and what it is producing.

---

## 1 · WHAT IS RUNNING

```bash
cd services/ingest
HC_CITE_CONCURRENCY=16 HC_CITE_BATCH=500 pnpm --filter @lawmind/ingest hc:citations --apply
```

Detached on this machine, logging to `hc-citations.log`, pid in
`hc-citations.pid`.

It streams High Court PDFs from AWS Open Data, extracts every citation, resolves
what it can against our corpus, writes the sightings, and **throws the text
away**.

**It uses no GPU, embeds nothing, and stores no text.** `DATASETS.md`'s objection
to this bucket — no citation column, a 0.75%–18.64% judgment share, ~3,956
GPU-hours, 96.4 GB — **applies to storing the documents and not to reading
them.**

## 2 · CHECK IT

```bash
tail -f hc-citations.log
```

or, the number that matters:

```sql
SELECT count(*) FROM external_citation_documents;              -- progress
SELECT count(*) FROM external_citations;                       -- sightings
SELECT count(*) FROM external_citations WHERE cited_judgment_id IS NOT NULL;
```

**Stop it** by killing the pid in `hc-citations.pid`. **Restart it** with the
same command — it skips every document already in
`external_citation_documents`, so a crash, a restart or a closed laptop costs
only the batch in flight.

## 3 · THE MEASURED RATES IT WAS SIZED BY

**Nothing here is projected from an assumption.** `CONTINUATION_PROMPT.md` §1
records a 274 GB estimate that was 7× too high because a total was scaled by a
row count, so every figure below was observed first.

| measured on | result |
| --- | --- |
| `hc:extract`, 1,000 PDFs | **186 ms per PDF**, download dominating extraction 5:1 |
| `hc:yield`, 400 PDFs | **13.8% carry any citation** · **1.05 citations per document** · **33.7% of those resolve to a judgment we hold** |
| the live run, concurrency 16 | **~36.6 documents/second** |

**At 36.6/s, the 15,771,566-document decade is roughly five days.** That is a
rate times a count and should be read as an order of magnitude — throughput
varies with document size and with AWS.

**86.2% of documents yield nothing, and that is the expected result, not a
failure.** Most of the bucket is procedural orders. A zero is recorded so the
pass never re-reads that document.

## 4 · WHAT IT IS BUILDING

`external_citations` — one row per citation per document, deliberately **not**
in `judgment_citations`, because that table's `citing_judgment_id` is a FK into
`judgments` and a High Court document is not a judgment we hold. Mixing *"a
judgment we hold cites X"* with *"a document we merely read cites X"* would put
an unauditable claim inside the table the citator trusts.

**One sighting per citation per document.** A judgment repeating an authority
five times is **one court relying on it**, not five, and counting it five times
would inflate exactly the corroboration signal this exists to provide.

Three uses:

1. **Authority weight** — how often the High Courts actually cite a given
   Supreme Court judgment. A Supreme-Court-only corpus cannot see this at all.
2. **The concordance** — more independent sightings of an AIR/SCC string make
   each alias safer, per `A3d.3`. Early rows already show why: `(2009) 8SCC 539`
   and `(2010)14 SCC 103` resolve correctly **despite the missing spaces**,
   because the key is alphanumeric-only.
3. **Existence evidence** — a citation printed by many independent courts
   demonstrably exists. **A PROPOSAL, not a verification tier.**
   `CITATION_HARNESS.md` is spec and only the founder changes it.

## 5 · WHAT IT DOES NOT DO

- **It does not widen the extractor.** The five Supreme-Court-centric forms are
  exactly right for this pass: a High Court judgment citing the Supreme Court
  writes `AIR 1973 SC 1461` or `(1973) 4 SCC 225`. Widening buys High-Court-to-
  High-Court edges, which are worth having **later** and are not needed for the
  concordance or for treatment of Supreme Court authorities. `CURRENT_PLAN.md`
  called widening a prerequisite; **that ordering was wrong** and this is the
  correction.
- **It does not make High Court judgments searchable.** They are still not in
  `judgments` and still carry no citation column. Coverage still reports
  **0 of 3,493,695** at Allahabad, correctly.
- **It does not need the GPU.** The GPU is for §6 below.

## 6 · WHAT THE GPU IS ACTUALLY FOR — and it is not this

The founder has a GPU ready. **This pass does not use it**, and starting the
GPU work first would have burned days before knowing what the citation pass
returns.

The GPU is for **embedding**, and there are two candidate jobs:

| job | cost | worth it? |
| --- | --- | --- |
| **Re-embed the existing 616,197 chunks** | measured at **36.6 ms/chunk on CPU ≈ 6.3 h**; far less on a GPU | Only if late chunking or summary-augmented chunking is being tested. `CURRENT_PLAN.md` parks both |
| **Embed High Court judgments** | `DATASETS.md`: **~3,956 GPU-hours** for a decade | **Not yet.** It is downstream of a decision the citation pass informs |

**The honest sequencing.** Embedding High Court text only pays if those
judgments become *searchable and citable*. They are searchable-and-not-citable
today because neither metadata variant carries a citation column — and the
citation pass now running is the cheapest route to changing that, because a
document whose citation many courts print is a document we can name.

**So the GPU waits on one number this run produces**: how many distinct High
Court citation strings accumulate enough independent sightings to be named with
confidence. That is measurable from `external_citations` in days, not weeks, and
it is what turns "15.77M documents" into "the subset worth embedding."
