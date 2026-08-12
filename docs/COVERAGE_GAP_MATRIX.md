# COVERAGE GAP MATRIX — court × held, live

**NEW3, 12 Aug 2026.** `held` queried live against production this session
(`SELECT court, count(*) FROM judgments GROUP BY court`, read-only,
`packages/db`, script deleted after use). `source_total` is the AWS Open
Data parquet-footer count from `docs/HC_CORPUS_SURVEY.md` (measured ~6-7 Aug
2026 by LCC pre-ring) — **not re-measured this session**, carried forward
because the AWS bucket's total document count changes far more slowly than
LawMind's ingest does. If a large discrepancy ever looks wrong, re-count the
bucket rather than trust this table blindly.

**The mission's own rule, restated because this table gets misread easily:
`source_total` counts DOCUMENTS, not JUDGMENTS.** `docs/DATASETS.md` already
measured the judgment share at **0.75%–18.64%** depending on court — most of
what AWS holds per court is procedural orders, not reasoned decisions. A gap
of 3.4M documents at Allahabad is not a gap of 3.4M missing judgments; it is
closer to 25,000–650,000 depending where in that range Allahabad actually
falls (not independently measured per-court this session — flagged as a
real follow-up, not asserted).

---

## 1 · THE TABLE, ranked by absolute document gap

| court | source_total (docs) | held (judgments rows) | gap | coverage % |
| --- | --- | --- | --- | --- |
| Allahabad High Court | 3,493,695 | 62,425 | 3,431,270 | 1.787% |
| Bombay High Court | 1,528,665 | 6,493 | 1,522,172 | 0.425% |
| Madras High Court | 1,510,131 | 19,398 | 1,490,733 | 1.285% |
| High Court of Punjab and Haryana | 1,260,007 | 10,018 | 1,249,989 | 0.795% |
| Patna High Court | 1,068,907 | 58,834 | 1,010,073 | 5.504% |
| High Court Of Rajasthan | 848,617 | 25,048 | 823,569 | 2.952% |
| Orissa High Court | 761,067 | 18,368 | 742,699 | 2.413% |
| High Court of Karnataka | 730,432 | 24,222 | 706,210 | 3.316% |
| High Court of Kerala | 570,700 | 21,536 | 549,164 | 3.774% |
| High Court of Madhya Pradesh | 588,593 | 61,742 | 526,851 | 10.490% |
| High Court for State of Telangana | 526,825 | 15,878 | 510,947 | 3.014% |
| High Court Of Chhattisgarh | 401,696 | 3,996 | 397,700 | 0.995% |
| Calcutta High Court | 406,413 | 9,566 | 396,847 | 2.354% |
| High Court of Jharkhand | 393,079 | 4,799 | 388,280 | 1.221% |
| High Court of Andhra Pradesh | 355,497 | 4,390 | 351,107 | 1.235% |
| High Court of Delhi | 306,893 | 3,741 | 303,152 | 1.219% |
| High Court of Gujarat | 290,144 | 497 | 289,647 | 0.171% |
| Gauhati High Court | 232,057 | 14,536 | 217,521 | 6.264% |
| High Court of Himachal Pradesh | 188,548 | 8 | 188,540 | 0.004% |
| High Court of Uttarakhand | 137,869 | 190 | 137,679 | 0.138% |
| High Court of Jammu and Kashmir | 112,046 | 2 | 112,044 | 0.002% |
| High Court of Tripura | 25,423 | 931 | 24,492 | 3.662% |
| High Court of Manipur | 20,890 | 1,305 | 19,585 | 6.247% |
| High Court of Meghalaya | 11,744 | 984 | 10,760 | 8.379% |
| High Court of Sikkim | 1,628 | 82 | 1,546 | 5.037% |
| **Supreme Court of India** | **38,351** | **38,342** | **9** | **99.977%** |
| **TOTAL** | **15,809,917** | **407,331** | **15,402,586** | **2.576%** |

**Supreme Court is effectively complete** (99.977%, the 9-document gap
already characterised in `docs/DATASETS.md` as 6 HTTP 404s + 3 corrupt PDFs,
none recoverable). **Every High Court is a live, moving ingest** — NEW2 is
running ~34,000 documents/hour per `docs/LANE_PROTOCOL.md` §6, so this table
is a snapshot, not a steady state. Re-run before relying on it for a
resourcing decision more than a day or two out.

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
