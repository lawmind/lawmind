# HIGH COURT CORPUS CHARACTERIZATION — measured, sampled, estimated, unknown

**11 August 2026, LCC, per the founder's HC CORPUS CHARACTERIZATION
directive.** `docs/ai/AWS_CORPUS_INVENTORY.md` established source-vs-ingested
scale (20,529,203 HC source rows, 40,980 ingested — 0.1996%, upper bound).
This document goes one level deeper on the HC bucket specifically: what those
rows actually *are*, before spending anything on a full 1,493-file
cross-partition dedup sweep.

**Every number below is tagged.** `MEASURED` = a full census (every file, or
every ingested row, via SQL or parquet footers/columns — no extrapolation.
`SAMPLED` = read from a bounded, named subset of files, ratio reported honestly
as a ratio, not scaled into a corpus-wide total unless explicitly marked
`ESTIMATED`. `ESTIMATED` = a sampled ratio applied to a known total, with the
uncertainty stated. `UNKNOWN` = not measured this session, stated as a gap,
not silently assumed.

---

## 1 · ROW DISTRIBUTION BY COURT — MEASURED

Full census, `docs/HC_METADATA_SURVEY.json` (generated 11 Aug, this session,
via `pnpm --filter @lawmind/ingest hc:count` — parquet footers only, every one
of the 1,493 metadata files read). All 25 High Courts, last-10-years totals,
descending:

| court | rows, last 10 yrs | mobile variant |
| --- | ---: | :---: |
| Allahabad | 3,493,696 | ✓ |
| Bombay | 1,528,665 | ✓ |
| Madras | 1,510,131 | |
| Punjab & Haryana | 1,260,007 | |
| Patna | 1,068,907 | |
| Rajasthan | 848,617 | |
| Orissa | 761,067 | |
| Karnataka | 730,432 | |
| Madhya Pradesh | 588,593 | ✓ |
| Kerala | 570,700 | |
| Telangana | 526,825 | |
| Calcutta | 406,413 | |
| Chhattisgarh | 401,696 | |
| Jharkhand | 393,079 | |
| Andhra Pradesh | 355,497 | |
| Delhi | 306,893 | |
| Gujarat | 290,144 | |
| Gauhati | 232,057 | |
| Himachal Pradesh | 188,548 | ✓ |
| Uttarakhand | 137,869 | |
| Jammu & Kashmir | 112,046 | |
| Tripura | 25,423 | |
| Manipur | 20,890 | |
| Meghalaya | 11,744 | |
| Sikkim | 1,628 | |

**Allahabad alone is 17% of the entire last-10-year HC source corpus** —
whatever the next data-acquisition decision is, it is the single highest-
leverage court by raw volume, and it also publishes the mobile variant (the
only source of `order_type`, §3).

---

## 2 · ROW DISTRIBUTION BY YEAR — MEASURED

Same census, aggregated across all 25 courts, both variants:

| decade | rows |
| --- | ---: |
| 1950s | 277 |
| 1960s | 57 |
| 1970s | 63 |
| 1980s | 183 |
| 1990s | 25,784 |
| 2000s | 1,163,929 |
| 2010s | 8,343,252 |
| 2020s | 10,995,658 |
| **total** | **20,529,203** |

Last 5 individual years:

| year | rows |
| --- | ---: |
| 2022 | 1,946,013 |
| 2023 | 2,078,757 |
| 2024 | 1,747,681 |
| 2025 | 2,034,647 |
| 2026 (partial) | 840,942 |

**The corpus is overwhelmingly recent, not historical.** 94% of all rows
(19.3M of 20.5M) are from 2010 onward; the pre-1990 corpus is 580 rows total
across 25 courts and 40 years — either genuinely thin digitisation of older
High Court records, or a scope decision by the bucket's own publisher, and
this session did not determine which (`UNKNOWN`).

---

## 3 · ROW DISTRIBUTION BY DOCUMENT/SOURCE TYPE

**Mobile variant (8% of the corpus, 4 of 25 courts) — MEASURED**,
restated from `AWS_CORPUS_INVENTORY.md` §2 (`order_type` column, mobile-only):

| `order_type` | rows | share |
| --- | ---: | ---: |
| unambiguously a judgment | 9,678 | 0.75% |
| `View Judgement/Order` (ambiguous) | 231,067 | 17.89% |
| everything else (orders, interim orders, etc.) | 1,050,774 | 81.36% |

**Plain variant (92% of the corpus, all 25 courts, incl. Allahabad's own
17%-of-corpus share) — no `order_type` column exists at all**, confirmed
structurally (`AWS_CORPUS_INVENTORY.md` §5). This has been the standing gap.

**New this session — a candidate signal the plain variant DOES carry,
SAMPLED, not previously checked:** `disposal_nature`. Sampled directly from
two Allahabad plain-variant files:

| file | rows | populated | blank |
| --- | ---: | ---: | ---: |
| `year=2026/court=9_13/bench=cisdb_16012018` | 8,202 | 114 (1.4%) | 8,088 (98.6%) |
| `year=2015/court=9_13/bench=cisdb_16012018` | 28 | 28 (100%) | 0 (0%) |

The 2026 file's populated values, when non-blank, are real disposal outcomes
(`Dismiss other than merit`, `Disposed off/Decided on merits`, `Allowed/
Partly Allowed on merits`, etc.) — the same vocabulary a "was this case
actually decided" question would need. **The pattern across the two samples
is consistent with `disposal_nature` being populated once a case is disposed
and blank while pending** — a 2026 file is mostly still-pending filings
(hence 98.6% blank); the tiny 2015 sample under the same bench code is 100%
populated, consistent with an old case being disposed by now. **This is
SAMPLED on 2 files, not verified as a general rule, and not yet checked
against `pdf_link`/case-type text for corroboration.** §7 below explains why
this is the highest-value next step rather than something to chase further
in this pass.

**No equivalent measurement exists, and cannot, for the Supreme Court bucket
against this taxonomy** — restated from `AWS_CORPUS_INVENTORY.md` §2, not
re-derived here.

---

## 4–7 · IDENTITY AND QUALITY COVERAGE ON INGESTED HC ROWS — MEASURED

Extended `services/ingest/src/corpus-report-cli.ts` this session to break
`content_hash`/`cnr`/`native_text`/`text_quality` out by court class (it
previously only reported corpus-wide totals). Run against production,
11 Aug 2026, 40,980 ingested High Court rows (38,342 Supreme Court, for
comparison):

| metric | High Court | Supreme Court |
| --- | ---: | ---: |
| `content_hash` coverage | 100.0% | 100.0% |
| `cnr` coverage | 100.0% | 100.0% |
| `native_text` coverage | **0.0%** (0/40,980) | 0.003% (1/38,342) |
| `text_quality` average | 0.968 | 0.987 |
| `text_quality` below 0.90 | 378 rows (0.92%) | 10 rows (0.03%) |

`content_hash` and `cnr` are both fully backfilled corpus-wide (tasks 003 and
007, same session, both courts). `native_text` populates only on writes since
migration `0035` — the single High Court row with it set does not exist
(0 of 40,980), because every held HC row predates that migration and, unlike
`content_hash`/`cnr`, `native_text` cannot be backfilled without re-fetching
the source PDF for its page count (`AWS_CORPUS_INVENTORY.md` §6). **High
Court text extraction quality is measurably worse than Supreme Court's** —
0.92% of HC rows below the 0.90 damage-proxy threshold against 0.03% of SC
rows, a ~30× rate difference. Not investigated further this session (which
courts, which years) — flagged as a real, measured finding, not chased.

---

## 8–9 · SOURCE URL/KEY UNIQUENESS AND DUPLICATE/COLLISION RATE — SAMPLED

Built `services/ingest/src/harvest/hc-cnr-sample-cli.ts` — reads the full
`cnr` column (not just the footer) from a bounded, named sample of files:
the 6 highest-volume plain-variant courts (3 years each: earliest, middle,
most recent) and the 4 mobile-variant courts (2 most recent years each). 26
files, ~504,000 rows read, all via the same public bucket used everywhere
else in this program.

| variant | files sampled | rows sampled | sum of per-file distinct `cnr` | within-file distinct/rows |
| --- | ---: | ---: | ---: | ---: |
| plain | 18 | 247,255 | 247,085 | **99.9%** |
| mobile | 8 | 257,065 | 185,847 | **72.3%** |

**Plain variant: negligible within-file duplication in the sample** (0.1%,
consistent with the single earlier data point recorded in `hc-metadata.ts`'s
own header comment — 1,841/1,841 on one Allahabad 2024 file). Every one of
the 18 sampled files individually ran 99.6%–100% distinct.

**Mobile variant: real multiplicity, ranging 34.7%–99.8% across the 8
sampled files, wide enough that no single ratio should be quoted as "the"
mobile rate.** This is not literal duplication — it is the documented shape
of the mobile schema (one row per order under a case, `AWS_CORPUS_INVENTORY.md`
§2), and it is the same phenomenon the pre-existing Bombay 2024 example
showed (53,753 rows / 17,843 distinct CNRs = 33.2%, within this session's
sampled range for that same court). The two Bombay files sampled this
session (34.7%, 59.7%) and the two Allahabad files (73.5%, 75.0%) suggest the
ratio may vary by court, not just be noise — **not confirmed, only 2 points
per court, `UNKNOWN` whether court is the actual driver.**

**Cross-file (cross-year, cross-court) CNR collision — explicitly NOT
checked.** The sampling script deliberately does not hold `cnr` values in
memory across files to check this, because doing it properly (the way §3 of
`AWS_CORPUS_INVENTORY.md` did for the Supreme Court bucket) means holding
distinct values across the full 1,493-file, ~20.5M-row sweep — the expensive
operation this whole document exists to justify or defer, not casually
attempt on a sample. **`UNKNOWN`, same caveat as `AWS_CORPUS_INVENTORY.md`
§1: reasoned unlikely to recur by the same *mechanism* SC had (HC's
`pdfUrlFor` keys off partition path, not a row field), but that is INFER,
not KNOW, and this session adds no new evidence either way.**

---

## 10 · UNIQUE CANONICAL DOCUMENTS/CASES — ESTIMATED, wide uncertainty

**Not computable deterministically corpus-wide without the full CNR sweep
flagged as `UNKNOWN` above.** What can be stated, clearly labeled `ESTIMATED`:

- **Plain variant** (92% of source rows, 18.9M of 20.5M): sampled distinct/
  rows ratio is 99.9%, so plain-variant row count is a reasonable proxy for
  unique-case count *within that variant* — i.e., **≈18.8M–18.9M**, not
  20.5M − 1.6M(mobile) recomputed, since the sample only checked
  within-file, not cross-file, duplication (§8–9's `UNKNOWN`).
- **Mobile variant** (8%, 1.29M rows all-years): sampled ratio 72.3% average,
  but ranging 34.7%–99.8% — applying the average gives **≈933,000 unique
  cases**, applying the observed range gives **≈448,000–1,289,000**. Stated
  as a wide band, not a point estimate, because the range in the sample is
  wide enough that a single number would overstate precision.
- **Combined, ESTIMATED**: **≈19.7M–20.2M** unique HC cases, against
  20,529,203 rows. **This is an estimate built from a 26-file sample of
  1,493 (1.7% of files), and should not be quoted as a corpus fact.**

---

## 11 · HIGHEST-VALUE NEXT DATA-QUALITY PROBLEM

**Not the cross-partition dedup sweep.** §8–9 above found the plain
variant's within-file duplication is already near-zero in every sampled
file, and mobile's "duplication" is real case-to-many-orders structure, not
a data defect. Spending the cost of a full 1,493-file/20.5M-row sweep to
close an `UNKNOWN` that the sample suggests is small is not the best use of
the next unit of effort.

**The actual constraint on the HC ingest decision is that we cannot tell
judgment from order for 92% of the corpus (the plain variant, including
Allahabad's own 17% of all HC rows) — and `HC_CORPUS_SURVEY.md` §5's
standing answer, "needs PDF text," is not the only path anymore.**
`disposal_nature` (§3 above) is a plain-variant column, present on every
court including the 21 that never publish the mobile variant at all, and the
sampled pattern — populated for what looks like disposed cases, blank for
pending ones — is a genuine, previously-unexamined, metadata-only candidate
signal. It does not by itself distinguish judgment from order (a disposed
interim application is still not a reportable judgment), but combined with
the case-type token already visible in `title`/`description` (e.g.
`FAFOD` = First Appeal From Order Defective, `NA528` = application under a
numbered section — both present in the two rows read this session, §3), it
is a plausibly much cheaper first pass than opening every PDF.

**Recommended next task, not started here** (characterization, not
implementation, was this session's scope): measure `disposal_nature`
population rate at real scale — a stratified sample across multiple courts
and a spread of years old enough that most filings are disposed (2015–2020,
not 2026) — and cross-tabulate against the mobile variant's `order_type`
for the 4 courts where both exist, to see whether `disposal_nature != blank`
usefully predicts `order_type == judgment`. If it does, that is a corpus-
wide, metadata-only (no PDF fetch) prioritization signal for **all 25
courts**, not just the 4 that publish the mobile variant — a meaningfully
larger win than closing the dedup `UNKNOWN`.

---

## 12 · WHAT THIS DOCUMENT DOES NOT DO

- Does not perform the full 1,493-file cross-partition dedup sweep — deferred,
  per §8–9, on the evidence that the sampled duplication rate is low enough
  not to justify the cost yet, not because it was assumed unnecessary.
- Does not build the `disposal_nature`/case-type judgment classifier — §11
  names it as the next task, not this one.
- Does not touch the retrieval-scale benchmark — `docs/ai/
  RETRIEVAL_BENCHMARK_DESIGN.md`, same day, separate document.
- Does not reopen eCourts district/tribunal scope, mobile-variant ingest
  scope, or any founder-owned acquisition decision — unchanged from
  `AWS_CORPUS_INVENTORY.md` §8.
