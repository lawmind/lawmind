# HIGH COURT EXTRACTION COST — measured on 1,000 real PDFs, 10 August 2026

`docs/CURRENT_PLAN.md` §A3.3: **measure PDF→text extraction on 1,000 real HC
PDFs and publish an honest completion date.** *Extraction is the cost, not
download or storage — AWS sponsors the transfer.*

```bash
pnpm --filter @lawmind/ingest hc:extract     # → docs/HC_EXTRACTION_SAMPLE.json
```

**Method.** 1,000 PDFs, **40 from each of 25 courts**, drawn from a **random
offset** into a rotating selection of that court's parquet files so years and
benches both vary. 2016 onward — what §A3.2 would actually ingest. Extraction
runs through the **same `unpdf` path the Supreme Court loader uses**
(`src/text.ts`), so this is the cost the real loader pays, not a benchmark of a
different library.

---

## 1 · THE ANSWER: EXTRACTION IS NOT THE BOTTLENECK

| | |
| --- | --- |
| extracted | **994 — 99.4%** |
| needs OCR (no usable text layer) | 2 — 0.2% |
| failed (corrupt PDF) | 4 — 0.4% |
| missing (404) | 0 — 0.0% *(but see §4 — this is the sample hiding something)* |

| per PDF | mean | p95 |
| --- | --- | --- |
| download | **154 ms** | 342 ms |
| extract | **32 ms** | 124 ms |
| **total** | **186 ms** | |
| size | 112.8 kB | |
| pages | 4.6 | |

### Projected completion — 15,771,566 documents

| workers | wall clock |
| --- | --- |
| 1 | 33.9 days |
| **8** | **4.2 days** |
| 32 | 1.1 days |
| 128 | 0.3 days |

**Four days on eight workers.** The projection is a multiplication and its
inputs are printed beside it deliberately — `CONTINUATION_PROMPT.md` §1 records
a 274 GB estimate that was 7× too high because a total was scaled by a row count
without checking the unit matched.

**Download dominates extraction 5:1.** Extraction is 32 ms; the wait for AWS is
154 ms. So the lever is concurrency, not a faster PDF library — and the ceiling
is whatever rate the bucket tolerates, which **is not measured here** and should
be established before anyone runs 128 workers at it.

---

## 2 · TEXT VOLUME, AND IT CORROBORATES `CORPUS_TIERING.md`

| characters per judgment | |
| --- | --- |
| mean | 5,823 |
| median | 2,423 |
| p95 | 20,164 |
| under 1,000 chars | 179 of 994 — **18%** |

**15.77M × 5,823 ≈ 96.4 GB of raw text.** `CORPUS_TIERING.md` §3 budgeted
**37 GB brotli** for the whole corpus, which implies ~2.0 kB/judgment compressed
against 5.8 kB raw — a **2.9× compression ratio**, entirely ordinary for text.
**Two independent estimates agree**, and the storage plan stands unchanged.

### The per-court spread is 11×, and it retires a generalisation

| court | mean characters |
| --- | --- |
| High Court of Delhi | **17,424** |
| High Court of Tripura | 14,811 |
| High Court of Sikkim | 12,842 |
| Gauhati High Court | 9,951 |
| … | … |
| Patna High Court | 2,521 |
| High Court of Jharkhand | 2,252 |
| Orissa High Court | 1,866 |
| **High Court of Uttarakhand** | **1,519** |

`DATASETS.md` measured *"2,223 characters for Punjab & Haryana"* and 4,010 for
Bombay OS, and concluded most of the corpus is procedural. **Both of those
courts are at the bottom of this distribution** — P&H measures 3,099 here and
Bombay 3,421. The finding was a true number about two low-volume-text courts
generalised to twenty-five. **Delhi is 11× Uttarakhand.**

That does not overturn `DATASETS.md`'s conclusion — 18% of documents are still
under 1,000 characters, and §A3.1 puts the judgment share at 0.75%–18.64% — but
**"most of it is procedural" is a per-court property, not a corpus constant**,
and the ingest order should reflect it.

---

## 3 · OCR BURDEN IS SMALL, AND SMALLER THAN FEARED

**2 of 996 fetched PDFs — 0.2% — have no usable text layer.** Extrapolated:
**~31,700 documents** across the last decade.

Both are Punjab & Haryana, and one of the two is borderline:

| pages | characters | chars/page | |
| --- | --- | --- | --- |
| 14 | 1,287 | 92 | just under the 100 floor |
| 1 | 0 | 0 | a genuine scan |

The floor is **100 characters per page** — deliberately conservative, and *per
page* so a 40-page scan and a 1-page scan classify identically. A real judgment
page carries 1,500–3,000 characters.

**OCR is not costed here.** `CURRENT_PLAN.md` §3: paddleocr and tesseract are
both at the benchmark floor on Devanagari (EasyOCR 93.6 → **58.3** on real
scans). This is a count of the problem, not an estimate of solving it. At 0.2%
it is a **rounding error against the 15.77M**, which is the useful finding.

---

## 4 · THE NUMBER THE AGGREGATE HID — PDF AVAILABILITY IS BENCH-AND-YEAR STRUCTURED

**The stratified sample reported `missing 0.0%`. That is true and it is
misleading**, and it is the most important thing in this document.

Chasing the four Bombay failures produced a targeted run, and Bombay alone
looks nothing like the aggregate:

| Bombay High Court | extracted | missing | failed |
| --- | --- | --- | --- |
| 2016–2017 | 84.0% | 0% | **16.0%** |
| 2023–2026 | 58.0% | **29.5%** | 10.0% |

HEAD-checking 12 PDFs per bench per year shows why — **it is not random, it is
whole bench-years**:

| year | bench | rows | PDFs present |
| --- | --- | --- | --- |
| 2024 | hcaurdb, hcbgoa, kolhcdb, newas, newos, newos_spl, testcase | — | **12/12 each** |
| 2023 | newos_spl | 54 | **0/12** |
| 2025 | newas | 847 | **1/12** |
| 2025 | newos | 913 | **0/12** |
| 2026 | newas | 2,590 | **0/12** |
| 2026 | newos | 621 | **0/12** |

**Metadata does not imply a PDF.** Specific bench-years carry rows whose PDFs
the bucket does not serve at all — concentrated in **recent years**, which is
consistent with a publication lag rather than corruption. `pdf_exists` in the
metadata is not the oracle either; `DATASETS.md` already recorded it as false on
rows that return 200.

**Consequences for the ingest, and they are design constraints not warnings:**

1. **Handle 404 as an expected outcome per bench-year**, not an error that halts
   a run. A resumable, content-hashed queue (§A3.2's `harvest_queue` pattern)
   already has the right shape for this.
2. **Probe a bench-year before queueing all of it.** Twelve HEADs answer for
   thousands of rows and cost nothing.
3. **A stratified corpus-wide sample cannot see this.** It averaged a 0%
   corpus-wide rate over a court with a 29.5% one. Per-bench measurement is the
   only thing that surfaces it.

### `bench=testcase` is a test fixture, and it is 16,000 rows a year

Bombay publishes `bench=testcase` — 16,083 rows in 2023, 16,107 in 2024, 17,582
in 2025. The PDFs resolve. **It should be excluded from ingest by name**, and
whether other courts ship something equivalent is not yet checked.

---

## 5 · THE BOMBAY CORRUPTION IS REAL AND ERA-SPECIFIC

All four failures in the 1,000-PDF sample were Bombay, all `Invalid PDF
structure`, all 2015–2016 filings. The targeted run puts **Bombay 2016–2017 at
16.0% unreadable**, against a corpus-wide 0.4%.

**This is a court-and-era property**, so it is a candidate for exclusion or for
a second extraction path, not a reason to distrust the pipeline. It is not
diagnosed further here: the PDFs are corrupt at the structure level, and
`unpdf` refusing them is correct behaviour rather than a bug to work around.

---

## 6 · WHAT THIS DOES AND DOES NOT SETTLE

**Settled.** Extraction cost — **4.2 days on eight workers** for the last
decade. Text volume — 96.4 GB raw, corroborating the existing storage plan. OCR
burden — 0.2%, negligible. These retire "extraction is the cost" as an obstacle.

**NOT settled, and unchanged by anything here:**

- **Embedding.** `DATASETS.md` costs 10 years at **~3,956 GPU-hours**. That is
  the real compute bill and this measurement says nothing about it.
- **Citability.** Neither metadata variant has a citation column. **A High Court
  judgment ingested from this bucket is searchable and not citable.** §A3.1
  said this and it remains the disqualifying fact.
- **The bucket's tolerated request rate.** 8 workers is measured; 128 is
  arithmetic.
- **Whether `View Judgement/Order` rows are judgments** — §A3.1's open range of
  0.75%–18.64%. This sample measured extraction, not classification.
