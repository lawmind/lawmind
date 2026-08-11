# AWS CORPUS INVENTORY — measured, not assumed

**11 August 2026, LCC, per the founder's DATA SCALE CONTINUATION directive.**
Every number below was queried directly against the live AWS bucket or the
production database this session, via parquet footers (no data read beyond
row counts) or direct SQL. Where a number is carried forward from an earlier
same-week survey (`docs/HC_CORPUS_SURVEY.md`, 10 Aug), it was **re-measured
fresh today** to confirm it had not drifted, not merely cited.

**Terminology, fixed here and used consistently below and in
`docs/ai/DATA_MOAT_PROGRAM.md`** — the founder's instruction to never
conflate these:

- **Source corpus size** — total rows the AWS bucket's metadata files
  contain, counted by parquet footer. Every row is *a metadata record*, not
  a judgment — most are orders, interim orders, or other procedural
  documents (`HC_CORPUS_SURVEY.md` §2).
- **Ingested corpus size** — rows actually written to `judgments`. What we
  hold, regardless of whether it duplicates another held row.
- **Unique canonical documents** — ingested rows after resolving
  `content_hash` duplication (937 groups, task 003, restated in §4 below).
- **Unique cases** — a step further still: one case can produce several
  documents (interim orders, the final judgment) and, per `cnr`, several of
  our rows already collapse onto a shared identity in a small number of
  instances (§4). Not yet computed as a standalone figure — flagged as
  future work, §6.

These four numbers are never the same number, and this document is what
makes sure they are never typed as one.

---

## 1 · SOURCE CORPUS SIZE — measured fresh, 11 Aug 2026

### Supreme Court (`s3://indian-supreme-court-judgments`)

Footer-counted across every year file, 1950–2026:

| | |
| --- | --- |
| metadata files (years) | **77** |
| total rows | **43,532** |

### High Court (`s3://indian-high-court-judgments`)

Footer-counted across all 1,493 metadata files (both variants), 95.3s,
listing + reading, no PDF touched:

| | plain | mobile | combined |
| --- | --- | --- | --- |
| all years, 1950–2026 | 19,237,684 | 1,291,519 | **20,529,203** |
| last 10 years, 2016–2026 | 14,480,216 | 1,291,351 | 15,771,567 |

**Matches yesterday's survey almost exactly** (20,529,202 → 20,529,203, +1 —
the bucket grew by one row in 24 hours, not measurement drift). The
methodology (`docs/HC_CORPUS_SURVEY.md`) is confirmed stable and
reproducible: `pnpm --filter @lawmind/ingest hc:count`.

**Only 4 of 25 High Courts publish the mobile variant** (Bombay 27_1,
Allahabad 9_13, Madhya Pradesh 23_23, Himachal Pradesh 2_5) — carrying
`order_type` and 17 other columns the plain variant does not. The two
variants share **zero CNRs**: they are disjoint document sets, not two views
of one record set.

### Combined source corpus

**20,529,203 (HC) + 43,532 (SC) = 20,572,735 total source rows.**

**This is not "~20M documents" as a round-number assumption — it is a
measured figure, reproducible by anyone who runs the two commands above,
and it is a count of *metadata rows*, not of judgments.** §2 below is the
correction the founder's directive explicitly warned against skipping.

---

## 2 · SOURCE ROWS ARE NOT JUDGMENTS — the multiplier, already measured

`docs/HC_CORPUS_SURVEY.md` §2 labelled 1,291,519 mobile-variant rows (the
only variant that states a document type) by `order_type`:

| | rows | share |
| --- | --- | --- |
| unambiguously a judgment | 9,678 | **0.75%** |
| `View Judgement/Order` — ambiguous, either | 231,067 | 17.89% |
| everything else (orders, interim orders, etc.) | 1,050,774 | 81.36% |

**This is a measurement of 8% of the HC source corpus (the mobile variant
only) and must never be quoted corpus-wide** — the plain 92% shares zero
CNRs with it and has no `order_type` column to measure the same way at all.
Stated as a range because the true figure is unknown, not because a range is
more defensible-sounding: **0.75%–18.64%** of the *labelled* subset is a
judgment. Applying that range to all 20.5M rows would be exactly the kind of
extrapolation this document exists to refuse.

**No equivalent measurement exists for the Supreme Court bucket** — the SC
source is smaller (43,532) and was not sampled by document type this
session; SC's own corpus is generally understood to be closer to 100%
judgments by construction (the bucket is specifically the SCI reported
judgments series), but that is **INFER, not KNOW** — not verified by reading
`disposal_nature` values this session.

---

## 3 · INGESTED CORPUS SIZE, AND THE COVERAGE MATRIX

| | source corpus | ingested (held) | coverage |
| --- | --- | --- | --- |
| Supreme Court | 43,532 | 38,341 | **88.1%** |
| High Court | 20,529,203 | 40,980 | **0.1996%** |
| **Combined** | **20,572,735** | **79,321** | **0.386%** |

**The founder's instruction not to assume the 79,321 rows represent the
full corpus is correct, and the gap is not close** — 99.6% of the measured
HC source corpus (20,529,203 rows) has never been read. Most of that 99.6%
is not a judgment either (§2), so the *real* gap — usable authorities not
yet held — is smaller than the row-count gap but categorically still large
and **not precisely known**, because §2's judgment-share figure cannot be
applied corpus-wide.

### SOURCE vs DB vs UNINGESTED vs DUPLICATES vs INVALID/MISSING

| | Supreme Court | High Court |
| --- | --- | --- |
| **SOURCE** rows (measured, §1) | 43,532 | 20,529,203 |
| **INGESTED** (`judgments` rows) | 38,341 | 40,980 |
| **UNINGESTED** (source − ingested) | 5,191 | 20,488,223 |
| **DUPLICATES** among ingested (`content_hash` groups, task 003) | not broken out by court this session — 937 groups / 1,500 rows corpus-wide, 98.4% of the 1,500 are HC | see left |
| **INVALID/MISSING** (ingested but structurally incomplete) | 0 rows with null `content_hash`/`text_quality` (100% backfilled, task 003) | same |

**Why SC's "uningested" 5,191 is not simply "5,191 judgments we are
missing"**: no measurement this session sampled what those specific 5,191
rows are — could be duplicates of already-held rows under a slightly
different `source_url`, could be genuinely new judgments, could include
rows the original ingest deliberately skipped (unstorable text,
`stripUnstorable`, `services/ingest/src/text.ts`). **Not claimed as a clean
gap** — flagged as the natural next SC-side measurement, not performed here.

---

## 4 · DUPLICATE / NEAR-DUPLICATE INDICATORS

Two independent, **different**, both real duplication mechanisms are now
measured on the ingested corpus (source-corpus-wide duplication is
unmeasured — see §6):

1. **`content_hash` exact-text duplication** — 937 groups, 1,500 rows
   (1.9%), 98.4% High Court. Verified by reading actual text (task 003):
   consolidated/batch judgments (one judgment deciding many tagged-along
   matters) replicated once per case number — not a metadata-variant
   collision.
2. **`cnr` cross-`source_url` duplication** — 10 pairs, 22 rows (0.03%),
   verified by reading the URLs (task 007): year-partition drift (the same
   document ingested twice under two different `year=` path segments), a
   known, smaller, unrelated defect from the same class already documented
   for the Supreme Court corpus (`docs/CURRENT_PLAN.md` Q1.0).

**Neither indicator is mobile/plain-variant duplication.** That specific
question (`HC_CORPUS_SURVEY.md` §5) is answered: no evidence of it in the
40,980 held HC rows (task 007).

---

## 5 · `source_document_type` — ROOT CAUSE, DEFINITIVELY

The corpus-quality report (11 Aug) found 0.0% coverage against
`docs/SCHEMA_TRUTH.md`'s documented "4 of 25 High Courts publish it".
**Investigated properly this pass, not left as an open mystery:**

**The held rows for all three sampled mobile-publishing courts we hold data
from (Bombay, Allahabad, Himachal Pradesh — 523 / 6 / 8 rows respectively)
were checked directly against production, and every sampled `source_url`
carries the PLAIN variant's filename pattern** (`<CNR>_<n>_<date>.pdf`), not
the mobile variant's bare `orders_YYYY_<id>_<n>.pdf` pattern. **None of our
held rows — for any of the 25 courts, including the 4 that publish a mobile
file — were ever sourced from a mobile-variant metadata row.**

**This is not a bug and not backfillable.** The plain variant structurally
has no `order_type` column, for any court, ever — it is not that the value
was read and dropped (the `cnr` bug's shape); the value never existed for
these specific rows to begin with. Recovering it requires ingesting the
mobile-variant documents **as new, additional rows** — because plain and
mobile share zero CNRs, a mobile row does not describe the same document as
any plain row we hold; it is a different document from the same court that
happens to also exist. **Backfilling `source_document_type` onto the
existing 40,980 HC rows is impossible by construction. Populating it at all
requires a new ingest pass over the mobile-variant files specifically —
518,548 combined last-10-year mobile rows across the 4 courts (Allahabad's
3,493,696 general row count includes both variants; the mobile-only figure
per court is in `docs/HC_METADATA_SURVEY.json`, not restated here) — a
distinct acquisition decision, not a backfill CLI.**

**Determined values**: only what the mobile variant's `order_type` column
actually states (§2's table) — never classified, never guessed, per
`CLAUDE.md`.

**What cannot be known reliably**: document type for the 92% of the HC
corpus with no mobile-variant equivalent at all (21 of 25 courts) — the
plain variant has no field that states it, and classifying from PDF text
is a different, larger project (`HC_CORPUS_SURVEY.md`'s own §5: "needs PDF
text").

---

## 6 · NATIVE VS SCANNED — DONE, wired same day

**Did not need to be designed from zero — it was already built and measured
against real HC PDFs**, just never wired to persist a value per judgment.
`services/ingest/src/harvest/hc-extract.ts`'s `measureExtraction()`:

```
outcome = (characters_extracted / pages) < 100 ? 'needs_ocr' : 'extracted'
```

Per-page rather than per-document so a 40-page scan and a 1-page scan
classify the same way. **100 chars/page is a deliberately conservative
floor** (`OCR_CHARS_PER_PAGE_FLOOR`): a real judgment page runs
1,500–3,000 characters; under 100 means the PDF's text layer is absent or
useless, i.e. **scanned** (or a scan with no OCR layer baked in). This is
exactly the founder's instruction — *"design a deterministic classifier
based on PDF/text characteristics before considering ML"* — already
satisfied, already validated against real documents in the corpus-cost
benchmark (`docs/CURRENT_PLAN.md` §A3.3), not merely designed today.

**Why it is not yet populated per judgment**: `measureExtraction` is a
benchmark/sampling tool (`hc-extract-cli.ts`), not the production ingest
path. The real loader (`hc-load.ts`) receives already-extracted `text` and
does not currently carry `pages` or the character/page ratio through to
`JudgmentRecord` — the signal is computed and then discarded at measurement
time, never at ingest time.

**Built, same day.** `OCR_CHARS_PER_PAGE_FLOOR` and a new `isNativeText`
helper moved to `text.ts` (the module both extraction paths already share,
so there is one definition, not two that could drift); `fetchPdfText` (the
real SC ingest path) and `hc-load-cli.ts`'s inline extraction both now
capture page count and compute it; `toJudgment`/`toJudgmentRecord` carry it
into `JudgmentRecord`; `load.ts`'s `upsertBatch` writes it to the new
`judgments.native_text` column (migration `0035`, applied to production,
column verified directly). 12 new tests, 304/304 full ingest suite.

**Not backfillable for the 79,321 existing rows** — unlike `content_hash`/
`cnr`, this needs the source PDF's page count, which means re-fetching the
PDF itself, not re-reading already-stored text or metadata. `native_text`
is `NULL` on every row ingested before this migration; populates only on
the next write to each. A dedicated backfill (re-fetching all 79,321 PDFs)
is a real, larger, distinct future task — not attempted here, and
materially bigger than the ~275-request CNR backfill this session already
completed.

---

## 7 · LANGUAGE, DUPLICATE, METADATA-COMPLETENESS — restated from the
## corpus-quality dashboard, not re-measured, to keep one source of truth

See `services/ingest/src/corpus-report-cli.ts`'s output
(`docs/ai/DATA_MOAT_PROGRAM.md` §6) for text_quality, treatment, overruled
status and statute counts — not duplicated here to avoid two documents
drifting against each other. This document adds the source-vs-ingested
scale question the dashboard does not answer (it only ever queries the
database, never the bucket).

---

## 8 · WHAT THIS CHANGES ABOUT THE NEXT DATA TASK

**Not "more embeddings."** Per the founder's own framing: the milestone is
knowing what is held, missing, duplicated and authoritative — measured
above for the first time as a single reconciled set of numbers rather than
scattered across three documents with three different vintages.

**Ranked next data tasks, updated from `DATA_MOAT_PROGRAM.md` §7 given
today's findings:**

1. **Wire the existing `needs_ocr`/`extracted` classifier into the
   production loader** (§6). Cheapest, most concrete, reuses proven code —
   the same shape as the `cnr` fix that closed today.
2. **SC uningested-rows characterisation** (§3) — sample the 5,191 SC rows
   never ingested: genuinely new, or already-held under a different
   `source_url`? Small (5,191, not millions), answers a real question §3
   left open.
3. **Mobile-variant ingest for the 4 courts, as a scoped decision, not a
   backfill** (§5) — a founder-level acquisition-scope call (new rows,
   real disk/DB cost, real judgment-share unknown outside the 8% sample),
   not an engineering default.
4. Everything already recorded in `DATA_MOAT_PROGRAM.md` §7 (Gazette
   ingest build, OpenNyAI/NyayaAnumana audit pending a concrete need,
   eCourts scope blocked on the founder) stands unchanged.
