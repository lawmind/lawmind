# HIGH COURT CORPUS SURVEY — counted, 10 August 2026

`docs/CURRENT_PLAN.md` §A3.1: **count the AWS Parquet metadata per court per
year before downloading anything.** *"15.9M" is a headline; nobody has counted
the working set.* This is the count.

**Reproduce it:**

```bash
pnpm --filter @lawmind/ingest hc:count        # → docs/HC_METADATA_SURVEY.json
pnpm --filter @lawmind/ingest hc:ordertypes   # → docs/HC_ORDER_TYPES.json
```

**Method: parquet footers only.** `parquetMetadataAsync` reads a row count out
of a footer in one ranged HTTP request without decoding a single row. 1,493
files in **85 seconds**, a few MB moved. Counting a corpus must not become an
ingest of it. The only full-column read is `order_type`, and only on the 104
files that carry it.

---

## 1 · THE HEADLINE WAS RIGHT, AND IT WAS HIDING SOMETHING

| | documents |
| --- | --- |
| all years, 1950–2026 | **20,529,202** |
| **last 10 years, 2016–2026** | **15,771,566** |

So "15.9M" was a fair headline for the last-decade working set. **The finding is
not the total. It is what the total is made of.**

### The bucket publishes TWO metadata files per partition, and they are disjoint

Every partition may hold `metadata.parquet` **and**
`metadata-mobile.parquet`. The first survey treated the second as an
unparseable key and skipped 104 of 1,493 files. Measured on
`year=2024/court=27_1/bench=newos`:

| | `metadata.parquet` | `metadata-mobile.parquet` |
| --- | --- | --- |
| rows | 1,841 | **53,753** |
| distinct CNRs | 1,841 | 17,843 |
| **CNRs present in both** | **0** | **0** |

**Zero overlap.** These are not two views of one record set; they are two record
sets. Corpus-wide: **19,237,683 plain + 1,291,519 mobile.**

**The mobile variant carries eighteen columns the plain one does not** —
`order_type`, `is_final`, `case_type`, `case_no`, `bench_name`, `petitioner`,
`respondent`, `pet_advocate`, `res_advocate`, `fir_no`, `lower_court`,
`disposal_code`, `order_number`, `source` and more. It also uses a **differently
shaped `pdf_link`**: bare `orders_2024_250200000022024_3.pdf` against the plain
file's pathed `court/cnrorders/<bench>/orders/<CNR>_<n>_<date>.pdf`. **The
variant decides how a PDF key is derived and cannot be flattened away.**

Only **four of twenty-five courts** publish it: Bombay (27_1), Allahabad (9_13),
Madhya Pradesh (23_23), Himachal Pradesh (2_5).

### Reconciled against the only prior measurement, and it agrees exactly

`DATASETS.md` counted three years independently on 6 Aug. Same three years from
this survey:

| year | `DATASETS.md` | this survey | |
| --- | --- | --- | --- |
| 2023 | 2,078,757 | **2,078,757** | exact |
| 2024 | 1,747,681 | **1,747,681** | exact |
| 2025 | 2,034,647 | **2,034,647** | exact |

Exact to the digit on all three. **And that identity is itself the evidence that
the earlier count included the mobile files without distinguishing them** —
2023 holds 18,477 mobile rows, and a plain-only count would have read 2,060,280.
The old totals were right; the composition was never looked at.

---

## 2 · DOCUMENT COUNT IS NOT JUDGMENT COUNT

`DATASETS.md` concluded *"most of it is not an authority"* by sampling PDF text
length. **The bucket labels it directly** — in `order_type`, on the mobile
variant only. All 1,291,519 labelled rows:

| rows | share | `order_type` |
| --- | --- | --- |
| 439,844 | 34.06% | View Interim Order |
| 374,531 | 29.00% | View |
| **231,067** | **17.89%** | **View Judgement/Order** |
| 186,114 | 14.41% | View Farad order |
| 42,695 | 3.31% | View APPOINT P.LIQUIDATOR |
| **9,527** | **0.74%** | **View Judgement** |
| 5,075 | 0.39% | View Farad Order |
| 830 | 0.06% | View Speaking to minutes |
| 721 | 0.06% | View Final/Oral Order |
| 441 | 0.03% | View Registrar Order |
| 317 | 0.02% | View Proof Of Service / publication |
| 202 | 0.02% | View Order |
| **151** | **0.01%** | **View Judgment** |
| 4 | 0.00% | View Lok Adalat Order |

### The judgment share is a RANGE, 0.75% – 18.64%, and the spread is one label

**A first pass matched `/judgment|judgement/` and reported 18.64%. That number
was wrong.** `View Judgement/Order` — 231,067 rows — says *judgment **or**
order*, and it is almost the entire 18.64%. Folding an ambiguous label into the
confident bucket produces a figure that looks measured and is a guess.

| | rows | share |
| --- | --- | --- |
| unambiguously a judgment | 9,678 | **0.75%** |
| `View Judgement/Order` — either | 231,067 | 17.89% |
| everything else | 1,050,774 | 81.36% |

**Narrowing it means reading PDFs, which is §A3.3's job, not metadata's.**

**The caveat that governs every number in this section:** it covers the mobile
variant only — **8% of the corpus, sharing zero CNRs with the other 92%.** A
rate measured on one disjoint set is not a rate for the other. This is a
labelled measurement of 8% and **must never be quoted as a corpus-wide
judgment count.**

Even so, the direction is unambiguous and it agrees with `DATASETS.md`'s
independent PDF-length finding: **document count overstates authority count by
between 5× and 130×.**

---

## 3 · PER COURT, LAST 10 YEARS

`*` publishes the mobile variant.

| documents | court | code |
| --- | --- | --- |
| 3,493,695 | * Allahabad High Court | 9_13 |
| 1,528,665 | * Bombay High Court | 27_1 |
| 1,510,131 | Madras High Court | 33_10 |
| 1,260,007 | High Court of Punjab and Haryana | 3_22 |
| 1,068,907 | Patna High Court | 10_8 |
| 848,617 | High Court Of Rajasthan | 8_9 |
| 761,067 | Orissa High Court | 21_11 |
| 730,432 | High Court of Karnataka | 29_3 |
| 588,593 | * High Court of Madhya Pradesh | 23_23 |
| 570,700 | High Court of Kerala | 32_4 |
| 526,825 | High Court for State of Telangana | 36_29 |
| 406,413 | Calcutta High Court | 19_16 |
| 401,696 | High Court Of Chhattisgarh | 22_18 |
| 393,079 | High Court of Jharkhand | 20_7 |
| 355,497 | High Court of Andhra Pradesh | 28_2 |
| 306,893 | High Court of Delhi | 7_26 |
| 290,144 | High Court of Gujarat | 24_17 |
| 232,057 | Gauhati High Court | 18_6 |
| 188,548 | * High Court of Himachal Pradesh | 2_5 |
| 137,869 | High Court of Uttarakhand | 5_15 |
| 112,046 | High Court of Jammu and Kashmir | 1_12 |
| 25,423 | High Court of Tripura | 16_20 |
| 20,890 | High Court of Manipur | 14_25 |
| 11,744 | High Court of Meghalaya | 17_21 |
| 1,628 | High Court of Sikkim | 11_24 |

**The distribution is the ingest order.** The top five courts are **54%** of the
last decade; the bottom five are **0.4%**. §A3.2 says "High Courts, last 10
years first" — this says which High Courts first, and that Delhi (306,893) is
the 16th largest by document count while being among the most cited.

Per-year detail for every court is in `docs/HC_METADATA_SURVEY.json`.

---

## 4 · WHAT THIS CHANGES

**1 · The mobile variant is a structured-search asset, not just extra rows.**
`petitioner`, `respondent`, `pet_advocate`, `res_advocate`, `case_type` and
`bench_name` are exactly the fields §A1 identifies as the strategic gap —
*"Manupatra and SCC Online sell Boolean, field, citation and faceted search —
party, judge, act, section, court, period."* We derived judges for the Supreme
Court by parsing a comma-delimited string. **Four High Courts publish party and
advocate names as columns.** Nothing needs deriving.

**2 · `order_type` is a filter that exists today.** `DATASETS.md`'s
recommendation was *"ingest a filtered subset — reasoned judgments only, by
length and structure"*. For the four mobile courts the filter is a published
column rather than a heuristic. For the other twenty-one it is not, and that
asymmetry belongs in the ingest design rather than being discovered halfway
through it.

**3 · The citation gap `DATASETS.md` found is untouched by any of this.** Zero
of 9,604 metadata rows carried a citation; there is no citation column in either
variant. **A High Court judgment ingested from this bucket is searchable and not
citable** until a citation source exists. That is unchanged, it is the
disqualifying fact, and this survey does not soften it.

**4 · The count is no longer the obstacle to a decision.** §A3.1 is answered.
The next number that matters is §A3.3's — **PDF→text extraction measured on
1,000 real HC PDFs** — because extraction is the cost, not download or storage.

---

## 5 · WHAT IS NOT MEASURED HERE

- **Whether `View Judgement/Order` rows are judgments.** Needs PDF text.
- **The judgment share for the 92% of the corpus with no `order_type` column.**
  Not derivable from metadata at all.
- **Whether mobile rows duplicate plain rows under a different CNR.** Zero CNR
  overlap is established; identity by any other key is not. Two records for one
  judgment would inflate both counts, and de-duplication is an ingest concern.
  **Still open as of 11 Aug 2026** — `content_hash` backfilled across the
  corpus and 937 exact-duplicate groups found (1,500 rows, 98.4% High Court),
  but the two groups sampled directly are consolidated/batch judgments (one
  judgment deciding many tagged-along matters, replicated once per case
  number), both with `cnr IS NULL`, not mobile/plain variants of one judgment.
  A real, different duplication mechanism, measured; this question, not yet.
  `docs/ai/tasks/003-corpus-inventory.md`.
- **Extraction cost, text quality, OCR need.** §A3.3.
