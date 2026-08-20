# COVERAGE GAP MATRIX — court × held, live

**UPDATED 20 Aug 2026 (NEW3) — two corrections to carry forward, neither
edited into the body below; read these first.**

1. **The 20,529,203 denominator throughout this file is now 20,239,701.**
   NEW2 bus 0889 (20 Aug, retracting 0798): 289,502 of the parquet rows
   counted in `HC_METADATA_SURVEY.json` carry `bench = 'testcase'` — a test
   fixture, correctly never fetched by any worker, not a real document.
   Every occurrence of 20,529,203 below (and the derived per-court
   percentages built on it) is high by that amount; not walked row-by-row
   and corrected in place this session — treat every held/gap percentage
   in this file as a slight over-statement of the true gap until a full
   pass re-derives them against 20,239,701. This is a **different** cause
   from NEW2's separate plain/mobile-duplication finding (bus 0692/0721),
   which is about counting the same document twice, not about a document
   that was never real.
2. **The "judgment share 0.75%–18.64% depending on court" line at old §0
   (below, unedited) should not be trusted for per-court gap-sizing.** NEW2
   bus 0622/0623 (17 Aug) retracted this exact figure as it was being used
   in NEW2's own bus 0607/0611/0614: measured as **6.3% of the corpus on a
   disjoint variant**, not a corpus-wide or reliably per-court rate. This
   file cites it to `docs/DATASETS.md`, but that figure is not present in
   `DATASETS.md` as currently written — the citation could not be
   re-verified this session. The 25,000–650,000 Allahabad estimate derived
   from it two paragraphs below is downstream of an unreliable number and
   should not be quoted further without re-deriving the judgment-share rate
   properly first.

---

**UPDATED 13 Aug 2026 (bus 0266) — the denominator question is resolved.
The founder's 20.5M target is not unexplained. It is the AWS bucket's
ALL-YEARS total (plain + mobile combined), measured to the digit at
20,529,203 in `docs/HC_METADATA_SURVEY.json` (generated 2026-08-11T09:24:03Z,
25 courts, parquet footers, no rows decoded). Add Supreme Court's 38,351 and
the combined denominator is 20,567,554 — within 0.3% of "20.5M." See §3b,
rewritten below.**

**The "~17.8M" figure used throughout `RING_PROGRAM.md` and the ring's own
"5%, ~20 days" arithmetic does not match either real denominator** — not the
all-years combined total (20.53M) and not the last-10-years combined total
(15.77M, `docs/HC_CORPUS_SURVEY.md`, 10 Aug). Traced to `RING_PROGRAM.md`'s
own bus 0140 origin — an earlier, rougher figure that predates the 10-11 Aug
parquet-footer surveys and was never reconciled against them. **Not this
lane's file to fix** — flagged to LCC, who owns it.

**NEW3, 12 Aug 2026, table refreshed 13 Aug.** `held` queried live against
production (`SELECT court, count(*) FROM judgments GROUP BY court`,
read-only, `packages/db`, script deleted after use). `source_total` now
carries BOTH cuts from `docs/HC_METADATA_SURVEY.json`'s `perCourt` array
(the authoritative parquet-footer count, 11 Aug) — `allYears` (1950–2026,
plain+mobile combined) and `last10Years` (2016–2026) — rather than only the
last10Years figure this table used before. **A same-day discovery drove
the switch to allYears as primary:** three small courts (Tripura, Meghalaya,
Sikkim) showed held EXCEEDING last10Years source_total, which is
impossible if source_total is accurate — using allYears instead resolves
all three to just-under-100% coverage, which is what surfaced the
wrong-denominator problem in the first place.

**The mission's own rule, restated because this table gets misread easily:
`source_total` counts DOCUMENTS, not JUDGMENTS.** `docs/DATASETS.md` already
measured the judgment share at **0.75%–18.64%** depending on court — most of
what AWS holds per court is procedural orders, not reasoned decisions. A gap
of 3.4M documents at Allahabad is not a gap of 3.4M missing judgments; it is
closer to 25,000–650,000 depending where in that range Allahabad actually
falls (not independently measured per-court this session — flagged as a
real follow-up, not asserted).

---

## 1 · THE TABLE — both denominators, ranked by absolute all-years gap

| court | held | allYears source | last10Years source | %allYears | %last10 |
| --- | --- | --- | --- | --- | --- |
| Allahabad High Court | 83,344 | 3,493,992 | 3,493,696 | 2.39% | 2.39% |
| Bombay High Court | 6,493 | 2,421,666 | 1,528,665 | 0.27% | 0.42% |
| Madras High Court | 25,088 | 1,696,917 | 1,510,131 | 1.48% | 1.66% |
| High Court of Punjab and Haryana | 16,673 | 1,860,228 | 1,260,007 | 0.90% | 1.32% |
| Patna High Court | 58,834 | 1,706,872 | 1,068,907 | 3.45% | 5.50% |
| High Court Of Rajasthan | 33,419 | 1,095,547 | 848,617 | 3.05% | 3.94% |
| High Court of Kerala | 43,831 | 1,036,226 | 570,700 | 4.23% | 7.68% |
| High Court for State of Telangana | 21,938 | 1,044,211 | 526,825 | 2.10% | 4.16% |
| High Court of Karnataka | 40,942 | 955,609 | 730,432 | 4.28% | 5.61% |
| Orissa High Court | 22,756 | 795,093 | 761,067 | 2.86% | 2.99% |
| High Court of Madhya Pradesh | 109,235 | 693,424 | 588,593 | 15.75% | 18.56% |
| High Court Of Chhattisgarh | 19,379 | 669,323 | 401,696 | 2.90% | 4.82% |
| High Court of Jharkhand | 26,241 | 459,701 | 393,079 | 5.71% | 6.68% |
| High Court of Gujarat | 31,290 | 422,041 | 290,144 | 7.41% | 10.78% |
| High Court of Delhi | 27,477 | 383,604 | 306,893 | 7.16% | 8.95% |
| Calcutta High Court | 23,953 | 410,158 | 406,413 | 5.84% | 5.89% |
| High Court of Andhra Pradesh | 26,313 | 356,072 | 355,497 | 7.39% | 7.40% |
| Gauhati High Court | 33,859 | 322,307 | 232,057 | 10.51% | 14.59% |
| High Court of Himachal Pradesh | 36,071 | 287,088 | 188,548 | 12.56% | 19.13% |
| High Court of Uttarakhand | 50,153 | 235,634 | 137,869 | 21.28% | 36.38% |
| High Court of Jammu and Kashmir | 44,482 | 113,600 | 112,046 | 39.16% | 39.70% |
| High Court of Manipur | 18,745 | 20,895 | 20,890 | 89.71% | 89.73% |
| High Court of Tripura | 33,863 | 33,872 | 25,423 | **99.97%** | 133.20% ⚠️ |
| High Court of Meghalaya | 12,682 | 12,683 | 11,744 | **99.99%** | 107.99% ⚠️ |
| High Court of Sikkim | 2,428 | 2,440 | 1,628 | **99.51%** | 149.14% ⚠️ |
| **Supreme Court of India** | **38,342** | **38,351** | **38,351** | **99.98%** | **99.98%** |
| **TOTAL** | **887,831** | **20,567,554** | **15,809,918** | **4.317%** | **5.616%** |

⚠️ = last10Years source_total is IMPOSSIBLE as a denominator for this court
(held exceeds it) — the tell that surfaced the wrong-denominator problem.
allYears resolves all three to a coherent just-under-100%.

**Remaining against the founder's actual target (allYears + SC = 20,567,554):
19,679,723 documents.** This is the number "5%" and "~20 days" should be
computed against, not against "17.8M" — see §3b.

**Supreme Court is effectively complete** (99.98%, the 9-document gap
already characterised in `docs/DATASETS.md` as 6 HTTP 404s + 3 corrupt PDFs,
none recoverable). **Every High Court is a live, moving ingest** — NEW2 is
running ~34,000 documents/hour per `docs/LANE_PROTOCOL.md` §6, so this table
is a snapshot, not a steady state. Re-run before relying on it for a
resourcing decision more than a day or two out.

---

## 1a · REFRESHED 14 Aug 2026 — coverage nearly tripled in 24 hours

**Kept the 13 Aug table above for the record, not deleted — this replaces
it as the current snapshot.** Live re-query, same method (`SELECT court,
count(*) FROM judgments GROUP BY court`), same `HC_METADATA_SURVEY.json`
denominators.

| court | held | allYears source | last10Years source | %allYears | %last10 |
| --- | --- | --- | --- | --- | --- |
| Allahabad High Court | 303,050 | 3,493,992 | 3,493,696 | 8.67% | 8.67% |
| Bombay High Court | 134,856 | 2,421,666 | 1,528,665 | 5.57% | 8.82% |
| High Court of Punjab and Haryana | 77,077 | 1,860,228 | 1,260,007 | 4.14% | 6.12% |
| Madras High Court | 87,400 | 1,696,917 | 1,510,131 | 5.15% | 5.79% |
| Patna High Court | 131,431 | 1,706,872 | 1,068,907 | 7.70% | 12.30% |
| High Court Of Rajasthan | 101,162 | 1,095,547 | 848,617 | 9.23% | 11.92% |
| High Court for State of Telangana | 66,971 | 1,044,211 | 526,825 | 6.41% | 12.71% |
| High Court of Kerala | 156,977 | 1,036,226 | 570,700 | 15.15% | 27.51% |
| High Court of Karnataka | 80,172 | 955,609 | 730,432 | 8.39% | 10.98% |
| Orissa High Court | 24,955 | 795,093 | 761,067 | 3.14% | 3.28% |
| High Court Of Chhattisgarh | 44,746 | 669,323 | 401,696 | 6.69% | 11.14% |
| High Court of Madhya Pradesh | 263,719 | 693,424 | 588,593 | 38.03% | 44.80% |
| High Court of Jharkhand | 61,084 | 459,701 | 393,079 | 13.29% | 15.54% |
| Calcutta High Court | 57,296 | 410,158 | 406,413 | 13.97% | 14.10% |
| High Court of Gujarat | 94,390 | 422,041 | 290,144 | 22.37% | 32.53% |
| High Court of Delhi | 56,213 | 383,604 | 306,893 | 14.65% | 18.32% |
| High Court of Andhra Pradesh | 84,095 | 356,072 | 355,497 | 23.62% | 23.66% |
| Gauhati High Court | 77,166 | 322,307 | 232,057 | 23.94% | 33.25% |
| High Court of Himachal Pradesh | 119,535 | 287,088 | 188,548 | 41.64% | 63.40% |
| High Court of Uttarakhand | 137,973 | 235,634 | 137,869 | 58.55% | 100.08% ⚠️ |
| High Court of Jammu and Kashmir | 108,651 | 113,600 | 112,046 | 95.64% | 96.97% |
| High Court of Manipur | 18,745 | 20,895 | 20,890 | 89.71% | 89.73% |
| High Court of Sikkim | 2,428 | 2,440 | 1,628 | 99.51% | 149.14% ⚠️ |
| **Supreme Court of India** | **38,342** | **38,351** | **38,351** | **99.98%** | **99.98%** |
| High Court of Tripura | 33,871 | 33,872 | 25,423 | **100.00%** | 133.23% ⚠️ |
| High Court of Meghalaya | 12,682 | 12,683 | 11,744 | **99.99%** | 107.99% ⚠️ |
| **TOTAL** | **2,374,987** | **20,567,554** | **15,809,918** | **11.547%** | **15.022%** |

⚠️ = last10Years impossible as denominator (held exceeds it), same tell as
13 Aug — Uttarakhand now joins Tripura/Meghalaya/Sikkim in this shape,
consistent with continuing ingest rather than a new problem.

**Coverage went from 4.317% to 11.547% in roughly 24 hours — total held
grew from 887,831 to 2,374,987, a 2.67x increase.** Consistent with NEW2's
own bus reports today (1,590,714 rows / 87.3% evidence coverage as of an
earlier point today, before this further growth) and directly explained by
the row-group-batch-sizing fix NEW2 shipped this session (bus 0407/0419) —
Allahabad alone grew from 83,344 to 303,050 (+264%), the single largest
absolute jump in the table, matching that fix's court.

**Largest remaining absolute gaps unchanged in rank, all still under 25%:**
Allahabad, Bombay, Punjab & Haryana, Madras, Patna — same five courts as
13 Aug, now measurably further along but still the priority set by raw
document count. **Madhya Pradesh remains the only High Court over 30%**,
consistent with its dedicated-worker history noted 13 Aug.

Live, moving ingest — re-run before relying on this for a resourcing
decision more than a day or two out, same caveat as every prior snapshot
in this file.

---

## 1b · UPDATE 13 Aug 2026 — the four gaps in §2 below are CLOSED

Re-queried live: all four courts flagged in the original pass (§2) have
moved dramatically since NEW2 acted on bus 0102/0131:

| court | was | now | date range now |
| --- | --- | --- | --- |
| Himachal Pradesh | 8 | **28,888** | 1970–2026 |
| Jammu & Kashmir | 2 | **30,822** | 1950–2026 |
| Uttarakhand | 190 (stopped 1987) | **37,674** | **1950–2026, no longer stale** |
| Gujarat | 497 (stopped 1995) | **24,712** | **1982–2026, no longer stale** |

Both the near-zero problem and the stale-cutoff problem this lane
originally flagged are resolved. Corpus overall grew from 407,331 to
**817,428** judgments in the same window. **Bombay remains comparatively
low (6,493, unchanged)** but was never a staleness finding — it already
spans 1950–2026, just at lower volume, consistent with the separately-
known corrupted-PDF extraction issue for that court (`docs/ai/
DATA_MOAT_PROGRAM.md` §2b).

---

## 2 · WHAT THE ABSOLUTE-GAP RANKING GETS WRONG, AND WHY IT'S HERE ANYWAY

Sorted by raw document gap, the largest four courts (Allahabad, Bombay,
Madras, Punjab & Haryana) dominate the list — but three of those four are
also the courts with the **lowest** coverage percentage, meaning the
absolute and percentage rankings roughly agree here. **Where they diverge is
the signal worth acting on:**

- **Himachal Pradesh (0.004%) and Jammu & Kashmir (0.002%) are the two
  courts NEW2's own ingest has barely touched at all** — 8 and 2 rows held
  respectively, against 188,548 and 112,046 available. Both are mid-sized
  sources (bigger than Tripura, Manipur, Meghalaya or Sikkim, all of which
  have meaningfully higher coverage), so the near-zero holding looks like
  **an ingest-scheduling gap, not a source-access problem** — worth a bus
  message to NEW2 rather than a NEW3 acquisition action, since the source is
  already the same authorized AWS bucket every other High Court comes from.
- **Madhya Pradesh, at 10.49%, is the only High Court over 10% coverage** —
  a genuinely different shape from the rest of the table, consistent with
  it being one of NEW2's actively-dedicated ingest workers per the bus
  traffic (`LANE_PROTOCOL.md` §6, `held.earliest` for MP is 2023, unlike
  every other court which reaches back to the 1950s-1980s — MP's holding is
  recent-only by construction, not a coverage achievement across its full
  historical range).
- **This table cannot see historical distribution within a court** — a
  court at 3% coverage could be 3% evenly spread 1950-2026, or 100% of one
  recent year and 0% of everything else. §3 below is the start of answering
  that, not yet the full picture.

---

## 3 · HISTORICAL SPREAD — a first pass, not yet complete
> **⚠ THIS SECTION'S CONCLUSION IS WRONG. See §3z (NEW2, 14 Aug 2026), and
> §3z-confirm below it — I verified their correction against production and it
> holds.** The error is mine and it is a method error, not a stale number:
> `min(judgment_date)` proves a year is REACHABLE, never how much of it is
> HELD. One row makes a court look like it spans seventy years. Madras
> "spanning to 1953" was **one** pre-2016 document; Delhi and J&K were two
> each. Kept unedited below so the faulty reasoning stays readable.

`held.earliest`/`held.latest` per court (queried alongside the totals
above) shows most courts' holdings **do** span back to the 1950s-1980s, not
just recent years — e.g. Allahabad 1987–2026, Patna 1967–2026, Kerala
1950–2026, Supreme Court 1950–2026. Two visible exceptions:

- **Madhya Pradesh: 2023–2026 only.** Zero pre-2023 MP judgments held despite
  588,593 documents existing in the source back further (not independently
  year-bucketed this session — the AWS metadata would need a per-year count
  to say how far back MP's *source* actually goes, only that LawMind's
  *holding* of it does not go back past 2023).
- **Uttarakhand and Gujarat: holdings actually STOP well before present**
  (Uttarakhand 1950–1987, Gujarat 1982–1995) — both courts' most recent
  ingested judgment predates 2000, meaning **nothing from either court in
  the last ~25+ years is held at all**, a different and arguably more
  urgent gap than raw percentage suggests for an advocate practising today.

**This is not a full court×year×document-type matrix yet** — that needs the
AWS metadata broken out by year per court (available in the parquet
footers, per `HC_CORPUS_SURVEY.md`'s own method) joined against a
`judgments` year-bucketed count. Flagged as the next concrete step in §5,
not built this pass — the totals-level view above already surfaced two
real, actionable findings (HP/J&K near-zero, Uttarakhand/Gujarat stale) that
didn't need it.

---

## 3b · THE FOUNDER'S 20.5M TARGET — RESOLVED 13 Aug, superseding the
"unexplained 2.7M gap" verdict below (kept for the record, not deleted)

**The gap was never real. It was a stale denominator.** This lane's earlier
verdict compared the founder's 20.5M against "~17.8M AWS" — a figure that,
traced today, does not match any actual measurement of the bucket (see the
header of this document). `docs/HC_METADATA_SURVEY.json` (11 Aug, 25
courts, parquet footers, no rows decoded) gives the real all-years combined
total: **20,529,203.** Add Supreme Court's 38,351 and the total is
**20,567,554 — within 0.3% of "20.5M."** That is not a coincidence worth
still calling unexplained; it is the founder's target matching the AWS
bucket's own full history almost exactly.

**What was actually being compared before:** this document's own §1 table,
and `RING_PROGRAM.md`'s "~17.8M" scale line, were both using the **last 10
years only** (2016–2026, combined 15.77M) or an even older, unreconciled
pre-survey figure — not the bucket's full 1950–2026 history. Measuring
progress against either of those understates the true remaining work AND
manufactures a gap against the founder's target that was never there.

**Original hypotheses, now moot but recorded for the trail:** SC (~38,351)
and tribunals (Supreme Today path, "tens of thousands not millions" per
`HARVEST_ENGINE.md`) were checked and correctly found not to close a ~2.7M
gap — because the gap itself was the artifact, not something those sources
needed to explain. District courts (NJDG, ~33M) were correctly never
assumed into scope, and still aren't — the resolution above needs no scope
expansion at all.

**Remaining work against the real target: 19,679,723 documents** (§1).
`RING_PROGRAM.md`'s "~17.8M" scale line is now known-stale — flagged to
LCC, who owns that file, rather than edited here.

---

## 4 · DISTRICT / SUBORDINATE JUDICIARY, TRIBUNALS, STATE LEGISLATION

**Zero held, zero source_total measured** — no confirmed bulk source exists
for any of these (District Courts: searched, not found, `SOURCE_REGISTRY.md`
§4; tribunals: routed to the Supreme Today acquisition path, not a bulk
public source, `AUTHORIZED_SOURCE_MAP.md` §2; state Acts: source exists,
volume not counted, `SOURCE_REGISTRY.md` §3). **A gap matrix needs a
denominator, and none of these three categories has one yet** — recorded as
`UNKNOWN`, not zero and not omitted.

---

## 4b · THE 2023–2024 DONUT HOLE — a real recent-year coverage gap, 13 Aug 2026

**Not an acquisition gap — an ingestion-scheduling one, and worth NEW2's
eyes directly.** Checked live, per court, per year: for roughly half the
25 courts, `judgments` holds substantial 2025–2026 rows AND substantial
pre-1990s rows, but is near-zero for 2023 and 2024 specifically. Verified
against raw dates (not a query artifact) — Allahabad, for example, holds
83,338 rows from 2026 and 15,581 from 2025, then jumps straight to 1993
with zero in between.

| court | held (2023+2024) | source (2023) | source (2024) | gap |
| --- | --- | --- | --- | --- |
| Allahabad High Court | 0 | 534,053 | 264,889 | 798,942 |
| Bombay High Court | 0 | 127,700 | 277,355 | 405,055 |
| Madras High Court | 0 | 181,272 | 177,560 | 358,832 |
| High Court of Punjab and Haryana | 0 | 149,388 | 154,801 | 304,189 |
| Patna High Court | 500 | 135,913 | 123,106 | 258,519 |
| High Court Of Rajasthan | 0 | 119,187 | 91,384 | 210,571 |
| Calcutta High Court | 0 | 85,323 | 68,643 | 153,966 |
| High Court of Andhra Pradesh | 0 | 99,768 | 56,751 | 156,519 |
| Orissa High Court | 0 | 111,641 | 90,078 | 201,719 |
| High Court of Karnataka | 0 | 80,102 | 91,855 | 171,957 |
| High Court for State of Telangana | 0 | 66,857 | 38,931 | 105,788 |
| High Court Of Chhattisgarh | 0 | 42,179 | 50,880 | 93,059 |
| High Court of Delhi | 0 | 8,465 | 50,462 | 58,927 |
| Gauhati High Court | 0 | 27,799 | 27,102 | 54,901 |
| High Court of Kerala | 23,954 | 83,859 | 45,796 | 105,701 |
| High Court of Jharkhand | 9,184 | 46,010 | 46,520 | 83,346 |
| High Court of Himachal Pradesh | 6,584 | 20,635 | 27,911 | 41,962 |

**Approx. 3.4 million source documents from 2023–2024 sit at under 10%
coverage across these courts**, while the smaller-volume courts already
on a fully dedicated worker (Sikkim, Meghalaya, Gujarat, Tripura, Manipur,
Uttarakhand, J&K) show healthy 2023–2024 coverage alongside their 2025–26
rows — consistent with a general-sweep worker currently servicing very
recent (2025–26) and very old (pre-1990s) material for the largest courts
but not yet having reached 2023–2024 for them, rather than any problem
with the source.

**Not this lane's to fix.** The source data is confirmed present (AWS
parquet counts above), so this is purely where NEW2's workers are
currently pointed, not a document that needs acquiring. Flagged as the
sharpest "recent-year gap" this lane has found, since these are exactly
the documents most likely to matter to an advocate doing live research —
sent to NEW2 directly (bus).

## 4c · CHECKED 13 Aug 2026 — does NEW2's MP publication-lag finding
generalise? Allahabad and Madras say no.

NEW2 (bus 0339) verified, for Madhya Pradesh specifically, that the
registrar's PDF publication lags metadata publication by over a year —
15/15 sampled 2025 rows returned live HTTP 404 on the actual PDF URL even
though the metadata row exists — and asked this lane to check whether that
source-side explanation generalises to the other large courts named in
§4b, as a competing explanation to NEW2's own restart/DNS hypothesis
(0336).

**Checked directly against AWS's own bucket** (`hc-metadata.ts`'s
`listMetadataKeys`/`sampleRows`/`pdfUrlFor`, live HEAD request per PDF
URL, same method NEW2 used) for two of the largest-gap courts in §4b:

| court | year | sampled | HTTP 200 | HTTP 404 |
| --- | --- | --- | --- | --- |
| Allahabad High Court | 2025 | 15 | 15 | 0 |
| Allahabad High Court | 2024 | 15 | 15 | 0 |
| Madras High Court | 2025 | 15 | 15 | 0 |
| Madras High Court | 2024 | 15 | 15 | 0 |

**60/60 200 OK — MP's publication-lag pattern does NOT generalise to
Allahabad or Madras.** For both courts, the PDF is live on the AWS bucket
for the exact rows the ingest worker has not yet reached. This is
consistent with NEW2's own restart/DNS hypothesis (0336) — an
ingest-scheduling problem, not a source-side one — for at least these two
courts. **MP's lag is real but appears to be MP-specific, not the general
explanation for the donut hole.**

**Not reached this pass:** Punjab & Haryana and Karnataka — the same
ad-hoc check's `listMetadataKeys()` call (not `main()`'s outer transient-
retry wrapper, which this temp script didn't use) hung past 10 minutes
with no error, consistent with the S3 connect-timeout flakiness
`hc-load-cli.ts` already documents and retries around in production. Not
a new finding — the temp script simply wasn't hardened the way the
production loader is. Stopped rather than chase further; the two-court
result is already sufficient to answer NEW2's actual question ("does it
generalise") in the negative for the sample checked.

**Bounded conclusion for now:** treat the 2023–2024 donut hole in §4b as
primarily an ingest-scheduling gap (NEW2's restart/DNS mechanism, plus the
separately-confirmed missing-worker cause for Bombay/Patna, bus 0342), not
a source-availability one — except for Madhya Pradesh, which is a
confirmed, separate, genuine publication-lag case. No acquisition action
follows from this either way; recorded because it changes which lane
(NEW2 ingest-scheduling vs a hypothetical acquisition workaround) owns the
fix, and NEW2 already owns the scheduling fix.

Script used: a temp file in `services/ingest/src/`, deleted after use —
no trace left in the tree, confirmed by `git status`.

**Separate cause confirmed for two specific courts (bus 0342, NEW2):**
Bombay and Patna had no ingest worker running at all since the 13 Aug
reboot recovery — never crashed, just never relaunched. NEW2 launched
both. Rechecked live afterward: `held_total` jumped for both (Bombay
6,493 → 49,601, Patna 58,834 → 63,026) confirming the workers are running,
but 2023–2024 itself has barely moved (Bombay 0 → 217 of a 405,055-doc
gap, Patna 500 → 700 of 258,519) — **launched, not yet filled.** Workers
descend newest-year-first, so this is expected early on, not a stall.
Re-check later before treating either as resolved.

---

## 5 · NEXT, IN ORDER

1. **Flag HP/J&K near-zero coverage to NEW2** — same authorized source as
   every other court, looks like a scheduling gap not an acquisition one.
2. **Flag Uttarakhand/Gujarat staleness** — both courts' AWS source almost
   certainly extends past their held `latest` date; worth confirming via a
   metadata-only check (year-partition count, no document fetch) before
   assuming it's worth prioritising re-ingest.
3. **Build the real court×year matrix** — join AWS parquet year-partition
   counts (method already exists, `HC_CORPUS_SURVEY.md`) against
   `judgments` grouped by court+year (query pattern proven this session).
4. **Get a per-court judgment-share estimate**, not just the corpus-wide
   0.75%–18.64% range, so document-gap numbers in §1 can be translated into
   an honest judgment-gap estimate per court rather than left as a range
   nobody can apply to a specific row.

---

## 3z · CORRECTION TO §3 — `min(judgment_date)` IS NOT COVERAGE DEPTH · NEW2, 14 Aug 2026

**§3 above concludes that most courts' holdings "DO span back to the
1950s-1980s, not just recent years." That conclusion is wrong, and the method
that produced it is the reusable part.**

`min(judgment_date)` proves a year is REACHABLE. It says nothing about how much
of it is HELD. One row makes a court look like it spans seventy years. Measured
directly, per court, splitting the holding at 2016-01-01:

| court | earliest (what §3 read) | pre-2016 ACTUALLY held |
| --- | --- | --- |
| Madras High Court | 1953 | **1** |
| High Court of Delhi | 1960 | **2** |
| High Court of Jammu and Kashmir | 1950 | **2** |
| Gauhati High Court | 1988 | **3** |
| High Court Of Rajasthan | 1989 | **4** |
| Allahabad High Court | 1987 | **6** |
| High Court of Kerala | 1950 | **60** |
| Calcutta High Court | 1950 | **74** |
| High Court of Punjab and Haryana | 1950 | **93** |
| Patna High Court | 1967 | **149** |
| High Court of Andhra Pradesh | 2020 | **0** |
| High Court of Madhya Pradesh | 2018 | **0** |
| High Court of Karnataka | 2024 | **0** |

**Totals: 11,876 pre-2016 documents across all 25 High Courts, against
~4,757,636 available in the source — 0.25%.** Twenty-three of the twenty-five
hold fewer than 1,000 each. The only High Courts with meaningful historical
depth are the three smallest (Tripura 8,449, Meghalaya 938, Sikkim 800), which
were ingested by full runs rather than by the decade-scoped fleet.

**Root cause, and it is not a source gap:** every worker in the fleet was
launched `--from-year 2016`, so each stopped at 2016 by construction and no
worker could ever reach 1950–2015. `hc-load-cli.ts` now takes `--to-year`, and
six historical workers are running against the largest gaps. See
`CURRENT_PLAN.md` §Q1.47.

**The rule worth keeping:** an aggregate that can be satisfied by a single row
(`min`, `max`, `bool_or`, `EXISTS`) cannot answer a coverage question. §1's
`held ÷ source_total` was right to be the headline; §3's `earliest`/`latest` was
never a second opinion on it, and reading it as one hid a 4.7M-document hole
underneath a table that looked complete.

**This also refines §1's own per-court percentages** without contradicting them:
Uttarakhand's 58.55% and Himachal's 41.64% are not partial 2016+ ingests at all
— both are at **99.99%+ of their last-10-years window** and the entire remaining
gap is pre-2016. A court's `%allYears` and its `%last10` mean different things,
and mixing them is how "Uttarakhand is 58% done" became a restart that would
have achieved nothing.

---

## 3z-confirm · NEW3, 14 Aug 2026 — I verified NEW2's §3z correction. It holds, and the remediation is already visible.

**Verified rather than accepted on report**, per `LANE_PROTOCOL.md` §2 —
including because §3 is this lane's own section and the error is this lane's.
Re-queried live, splitting each High Court's holding at 2016-01-01.

**NEW2's per-court figures reproduce exactly:** Madras 1, Delhi 2, J&K 2,
Gauhati 3, Rajasthan 4, Allahabad 6, Kerala 60, Calcutta 74. The method
criticism is correct and §3's conclusion — *"most courts' holdings DO span
back to the 1950s-1980s"* — is false.

**What has changed since they measured, and it is large:**

| | NEW2, 22:50 | NEW3 re-query, later same night |
| --- | --- | --- |
| pre-2016 held, all High Courts | 11,876 | **279,957** |
| share of HC holding | ~0.25% | **5.17%** |

**A 24x increase, and it is their `--to-year` fix landing**, not a measurement
disagreement. The courts now carrying real pre-2016 depth are precisely the
ones they pointed historical workers at:

    Punjab & Haryana   50,237      Uttarakhand   48,246
    Patna              45,734      Bombay        44,372
    Himachal Pradesh   41,692      Telangana     38,784

Against ~4.76M pre-2016 source documents this is still early, but the
direction is confirmed by rows rather than by report.

**Still at zero or near-zero pre-2016:** Karnataka 0, Andhra Pradesh 0,
Madhya Pradesh 0, Madras 1, Delhi 2, J&K 2, Gauhati 3, Chhattisgarh 4,
Rajasthan 4, Manipur 5, Allahabad 6, Jharkhand 8. **Allahabad at 6 pre-2016
documents is the sharpest remaining hole** — it is the largest court in the
dataset (3.49M source documents) and holds 599,393 documents, essentially all
of them post-2016.

**The rule NEW2 states is worth keeping beyond this table:**

> An aggregate a single row can satisfy — `min`, `max`, `bool_or`, `EXISTS` —
> cannot answer a coverage question.

**And their sharpening of §1 is accepted:** Uttarakhand's 58.55% and
Himachal's 41.64% are not partial ingests — both are at 99.99%+ of their
last-10-years window with the entire remaining gap pre-2016. **`%allYears`
and `%last10` answer different columns and this table invites mixing
them.** Read the two columns as separate facts, never as one gradient.

---

## 4 · THE REAL COURT × YEAR MATRIX — built, and it names a bigger hole than pre-2016 · NEW2, 15 Aug 2026

**§5 item 3 of this file asked for the actual court×year matrix — AWS parquet
year-partition counts joined against `judgments` grouped by court and year.
Built and run. It says the priority order everyone has been working to is
wrong.**

Method: `perCourtPerYear` from `docs/HC_METADATA_SURVEY.json` (11 Aug, parquet
footers) joined against a live `GROUP BY court, extract(year FROM
judgment_date)`. Court names matched on whitespace-and-case only — nothing
fuzzy, and an unresolvable name is reported UNMATCHED rather than bucketed.
Totals reconcile to the survey exactly: **20,529,203 source documents**, the
same digit `HC_METADATA_SURVEY.json` carries, which is the check that the join
did not silently drop a court.

### The band table — this is the finding

| band | source | held | coverage | gap |
| --- | --- | --- | --- | --- |
| 1950–2015 | 4,757,636 | 467,742 | 9.83% | 4,289,894 |
| **2016–2022** | **9,069,540** | **1,379,310** | **15.21%** | **7,690,230** |
| 2023 | 2,078,757 | 1,378,862 | 66.33% | 699,895 |
| 2024 | 1,747,681 | 613,138 | 35.08% | 1,134,543 |
| 2025 | 2,034,647 | 1,107,240 | 54.42% | 927,407 |
| 2026 | 840,942 | 721,011 | 85.74% | 119,931 |
| **TOTAL (High Courts)** | **20,529,203** | **5,667,303** | **27.61%** | **14,861,900** |

**2016–2022 is the largest gap in the corpus by a wide margin — 7.69M
documents, nearly double the pre-2016 backlog that the entire `--to-year`
remediation was built for.** It has never been named in this file, in
`RING_PROGRAM.md`, or in the mission's priority list, all of which rank
pre-2016 and the 2023–2024 donut holes above it.

**Ten courts hold ZERO documents in that band:**

    Allahabad     2,055,580      Rajasthan       570,702
    Madras          820,458      Orissa          441,673
    Punjab & Har.   729,606      Karnataka       423,516
    Patna           639,070      Chhattisgarh    215,270
    Bombay          623,223      Calcutta        146,805

**Allahabad's 2016–2022 hole alone (2,055,580) is larger than any other single
court-band gap in the corpus.**

### Why it happened, and it is NOT a new defect class

Checked against the running workers rather than reasoned about: the from-2016
fleet descends **newest-first**, and it is still inside 2025. `hc-r9-27_1.log`
showed Bombay working `27_1/2025` at its last write. So 2016–2022 is untouched
because **the descent has not reached it yet** — not because of a scheduling
bound like the `--from-year 2016` defect that hid the pre-2016 hole.

That distinction matters: the pre-2016 hole was unreachable and needed a code
change (`--to-year`). This one is reachable and needs only *scheduling*. But at
the observed descent rate it would be reached late enough that "reachable"
is cold comfort.

**Why 2023 looks healthy while 2024 is a hole** — the same shape §4b noticed and
could not explain. It is not a donut. 2023 has dedicated `--year 2023` workers
(their checkpoints exist: `9_13-y2023.json`, `33_10-y2023.json`, `8_9-y2023.json`
and others). 2024 has none, and the newest-first descent has not arrived. So
**2023's coverage is an artifact of dedicated workers, not of natural descent**,
and reading it as "the fleet has covered 2023, so 2024 is anomalous" inverts
cause and effect.

### Acted on, not just recorded

Six band workers launched this session against the largest zero-coverage
bands — `--from-year 2016 --to-year 2022` for `9_13`, `33_10`, `3_22`, `10_8`,
`27_1`, `8_9` (5.44M documents targeted). Checkpoint keys are scope-suffixed
(`9_13-to2022.json`), verified against `hc-load-cli.ts`'s own
`CHECKPOINT_PATH` derivation before launching — a shared key would have had two
workers erasing each other's progress on every write, which is the trap that
file's header already documents.

### The rule this adds to §3z's

§3z established that an aggregate one row can satisfy cannot answer a coverage
question. This adds the next one:

> **A per-court percentage cannot answer a per-year question.** Allahabad at
> 17.6% of `allYears` looks like a uniformly partial ingest. It is not: it is
> ~100% of 2026, 36% of 2025, **0% of 2024**, 59% of 2023 and **0% of the seven
> years before that**. Every one of those needs a different action, and the
> single percentage recommends none of them.

**Caveat, stated rather than buried:** the source denominator is the 11 Aug
survey and the source updates DAILY, so every figure above understates the
source by four days of publication. The held side is live as of
2026-08-15T13:44Z. Re-run before using this for a resourcing decision.

---

## 4-confirm · NEW3, 15 Aug 2026 — independently verified, and a combined cross-band ranking that changes how "Allahabad is near-complete" should be read

**Verified before relying, per `LANE_PROTOCOL.md`.** Rebuilt the same join
independently (own script, own query, `perCourtPerYear` from
`HC_METADATA_SURVEY.json` joined against a live `GROUP BY court,
extract(year FROM judgment_date)`). **Source total reproduces exactly:
9,069,540 for 2016–2022, 20,529,203 grand total** — the join logic is sound,
confirmed from a second implementation, not just re-trusted.

**Held has already moved since NEW2's 13:44Z snapshot**, consistent with the
restarted 34+ worker fleet actively writing: 2016–2022 held now **1,481,684**
(was 1,379,310, +102,374), gap now **7,587,856** (was 7,690,230). Grand-total
coverage now **29.08%** (was 27.61%). Not a disagreement — a freshness
delta, exactly the caveat NEW2's own entry named.

### The clarification this table exists to make: don't misread my own 0504

**My 0504 (bus, also §3z-correction2 below) said Allahabad's PRE-2016 gap is
~290 documents and "near-complete, not a gap." That is still true for that
one band. Read alone, against this new 2016–2022 finding, it risks implying
Allahabad is a solved court. It is the opposite — the single largest
remaining gap in the entire corpus, by a wide margin, once every band is
combined:**

| court | **total gap (all bands)** | pre-2016 gap | 2016–2022 gap | 2023–2026 gap |
| --- | --- | --- | --- | --- |
| **Allahabad High Court** | **2,872,168** | 290 | 2,051,793 | 820,085 |
| Bombay High Court | 1,927,950 | 805,239 | 610,629 | 512,082 |
| High Court of Punjab and Haryana | 1,458,666 | 475,531 | 704,615 | 278,520 |
| Madras High Court | 1,384,926 | 186,785 | 811,663 | 386,478 |
| Patna High Court | 1,271,233 | 526,383 | 620,286 | 124,564 |
| High Court for State of Telangana | 802,788 | 442,296 | 292,355 | 68,137 |
| High Court Of Rajasthan | 791,408 | 228,136 | 547,947 | 15,325 |
| High Court of Kerala | 764,871 | 449,672 | 315,196 | 3 |
| High Court of Karnataka | 725,877 | 212,536 | 423,516 | 89,825 |
| Orissa High Court | 720,658 | 33,987 | 441,673 | 244,998 |
| High Court Of Chhattisgarh | 485,838 | 252,235 | 215,270 | 18,333 |

*(remaining 14 courts all under 235k total gap each; full table reproducible
from the method above)*

**Allahabad's total gap (2,872,168) is 49% larger than the next court
(Bombay, 1,927,950) and is driven almost entirely by 2016–2022 and
2023–2026 — bands `0504` never touched.** The two findings are both correct
and answer different questions: *"should a historical (`--to-year 2015`)
worker go to Allahabad"* — no, per 0504, its pre-2016 source is nearly
exhausted. *"Is Allahabad covered"* — no, per this table, it has the largest
remaining gap of any court once 2016–2022 and 2023–2026 are counted, and
that is exactly the band NEW2's six new workers are now targeting.

**Grand total, live: source 20,529,203 · held 5,969,140 · gap 14,560,063 ·
coverage 29.08%.**

`docs/ai/ENRICHMENT_REJECTION_TRIAGE.md` (LCC, 15 Aug) adds a dimension this
table does not carry: court-specific text-quality defects independent of
volume — Karnataka 92.1% of sampled substantive judgments carry page
furniture spliced mid-sentence into `full_text`, Madhya Pradesh 68.6% carry
an e-signature panel the same way. **Not a source-acquisition question** —
both Karnataka and MP's text comes from the same authorized AWS bucket as
every other court; the defect is in extraction, not in what is available to
fetch, and LCC has routed the fix to NEW2. Recorded here only because a
court that is 100% "held" by this table's count could still be
low-usable-text if it is Karnataka or MP — volume and text quality are
different axes and this table only measures the first.

Sent to NEW2, LCC, NEW1 — not a challenge to NEW2's finding, an independent
confirmation plus the cross-band view neither of us had built yet.

---

## 3z-correction2 · NEW3, 15 Aug 2026 — "Allahabad is the sharpest hole" was the wrong metric. Re-measured live, and the real priority list is elsewhere.

**§3z-confirm above, and `CURRENT_PLAN.md` Q1.49's handoff, both call Allahabad
"the sharpest remaining coverage hole" — and both already contained the fact
that disproves it, unused.** Re-queried live, 15 Aug 2026: total corpus
5,706,753 (up from 5,449,039 at NEW2's 14 Aug 23:00 reboot report — ~258k
judgments ingested since), pre-2016 total 499,405. **Allahabad's pre-2016
holding is still exactly 6** — unchanged despite ~258k new judgments landing
corpus-wide in the interim.

**That is not a stalled worker. It is very likely a complete, or
near-complete, court.** §1's own table already carries the number that
proves it: Allahabad's `allYears` source is 3,493,992 and its `last10Years`
source is 3,493,696 — a difference of **296 documents**. That is the entire
pre-2016 population AWS holds for this court, not an estimate. **6 of 296 is
~2%, and the ceiling on this court's remaining pre-2016 opportunity is
approximately 290 documents, full stop** — not a court that dwarfs the
others in raw scale, despite being the single largest court in the dataset
overall. NEW2's own Q1.49 handoff named this exact possibility ("its
historical hole may be genuinely tiny... measure its per-year source
partitions before assuming there is anything to fetch") but the ring kept
calling it "the sharpest hole" in the interim. This is that measurement.

**The real priority list, by the same `allYears − last10Years` arithmetic
already sitting in §1, for every court still at zero-or-near-zero pre-2016
(NEW2's own list, re-used here):**

| court | pre-2016 held (15 Aug) | pre-2016 SOURCE (`allYears − last10Years`) | ceiling |
| --- | --- | --- | --- |
| **High Court Of Chhattisgarh** | 4 | **267,627** | by far the largest untapped pre-2016 population of any near-zero court |
| **High Court Of Rajasthan** | 4 | **246,930** | — |
| **High Court of Karnataka** | 0 | **225,177** | true zero, largest true-zero court by source size |
| **Madras High Court** | 1 | **186,786** | — |
| **High Court of Madhya Pradesh** | 0 | **104,831** | true zero |
| Gauhati High Court | 3 | 90,250 | — |
| High Court of Delhi | 2 | 76,711 | — |
| High Court of Jharkhand | 8 | 66,622 | already has a small foothold |
| **Allahabad High Court** | 6 | **296** | **near-complete, not a gap** |
| High Court of Andhra Pradesh | 0 | 575 | also near-complete despite reading as a true zero |
| High Court of Manipur | 5 | 5 | fully complete |

**Chhattisgarh and Rajasthan — both currently at 4 pre-2016 documents, both
already read as "near-zero" in §3z-confirm's own list — sit on the two
largest untapped pre-2016 populations of any court in this table, over
900x Allahabad's.** Karnataka's true zero is genuinely consequential
(225,177 documents, not 296). Andhra Pradesh's true zero, by contrast, is
the same shape as Allahabad's near-completion — only 575 documents exist
pre-2016 for that court in the source at all.

**Not this lane's to schedule** — NEW2 owns which courts get a
`--from-year 1950 --to-year 2015` worker, per `LANE_PROTOCOL.md`. This is a
correction to the evidence that scheduling decision should be made from, sent
on the bus, not a scheduling instruction.

**CORRECTION TO THIS TABLE, NEW2 (bus 0511) — it has the exact same defect it
was written to fix, and two real courts were missed by it.** The table above
selected courts by filtering on "held is zero or near-zero," then ranked the
survivors by source size. That is two different quantities doing one job.
**Kerala (60 held / 465,526 source / 465,466 gap) and Gujarat (497 held /
131,897 source / 131,400 gap) never entered the table at all** — 60 and 497
don't read as "near-zero" at a glance, so both were filtered out before they
could be ranked, despite Kerala's gap being **larger than Chhattisgarh's**,
which this table called the largest.

> The selection rule and the ranking metric have to be the same quantity.
> Filtering on the numerator (`held`) and ranking by the derived quantity
> (`gap`) drops exactly the courts whose source is large enough to make a
> small holding look respectable — Kerala's 60 is 0.01% of its own source,
> Gujarat's 497 is 0.38%, and neither looked like a zero next to Karnataka's
> literal 0.

Same failure family as this file's own §3z (`min`/`max`/`EXISTS` cannot
answer a coverage question) and Q1.49's per-court-percentage lesson, now from
a third direction: **a threshold on the numerator cannot substitute for
ranking by the gap.** NEW2 independently verified this table's Allahabad
arithmetic exactly (`source 296, held 6, gap 290`) before finding the
omission, launched historical workers on Kerala/Chhattisgarh/Rajasthan/
Karnataka, and left Gujarat for a later wave (RAM-bound at 6.6 GB free).
Corrected, not re-litigated — the combined cross-band table in §4-confirm
below ranks by total gap directly rather than filtering first, which is the
structural fix rather than a repeat of this table with two more rows added.
