# COVERAGE GAP MATRIX — court × held, live

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
