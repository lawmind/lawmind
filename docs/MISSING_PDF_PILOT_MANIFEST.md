# MISSING-PDF RECOVERY PILOT — bounded ~1,000-record manifest for NEW2

**NEW3, 18 Aug 2026.** Built per the founder's source-frontier-continuation
addendum item 2, on top of `docs/MISSING_PDF_RECOVERY.md` (the recovery
program design) and `FQ-INDIANKANOON-RESOLVED` (`docs/FOUNDER_QUEUE.md`,
18 Aug — Indian Kanoon is authorized: written permission, separate paid
licence, extraction/RAG/training use). **This file turns that authorization
into an executable, bounded pilot — not a recommendation to spend against
the whole ledger.** Per the founder's own instruction: *"do not recommend
whole-ledger spend until the pilot measures yield."*

**Owner of execution: NEW2.** This lane (NEW3) does not touch corpus tables
or run ingest workers — `hc_ingest_ledger`, the source parquet metadata
join, and the IK client are all NEW2/LCC territory. This document is the
manifest, not a script that ran.

---

## 0 · THE POPULATION, MEASURED LIVE THIS SESSION (WILL HAVE MOVED BY EXECUTION TIME)

```sql
SELECT outcome, permanent, count(*) FROM hc_ingest_ledger GROUP BY outcome, permanent;
```

```
pdf_absent   permanent=true   159,651   <- the recovery-eligible population
pdf_failed   permanent=true    14,401   <- fetch/parse failure, NOT proof of absence, out of scope
pdf_failed   permanent=false    3,099   <- retryable, out of scope
no_text      permanent=true       140   <- fetched fine, parse failure, out of scope
no_text      permanent=false    1,118   <- retryable, out of scope
pdf_timeout  permanent=false       35   <- retryable, out of scope
```

**Zero rows remain in the legacy `pdf_missing` state** — the absence probe
(`scripts/migration/new2-ledger-absence-probe.mjs`) has now converted the
entire population NEW2 flagged in bus 0681/`FQ-INDIANKANOON` to a confirmed
HTTP status. `pdf_absent` is a definite 404/403/410 per `ingest-ledger.ts`'s
own header — a repeated GET reads the identical absence, so this population
is stable to sample from.

**159,651 is 66% larger than the 96,091 `FQ-INDIANKANOON` reported hours
earlier this same session, and 6.9× NEW3's original 22,983 estimate
(`MISSING_PDF_RECOVERY.md` §0).** The fleet is writing this table
continuously (`CLAUDE.md` §6b — this is exactly the kind of number that goes
stale mid-run, per `[[verify-the-founders-live-numbers]]`). **Re-run the
query in §2 at execution time; do not reuse this snapshot's row IDs.**

91 distinct `(court_code, year)` strata. Top five carry 67% of the
population:

| court_code | year | pdf_absent rows | share |
| --- | --- | --- | --- |
| 27_1 (Bombay — confirmed via `docs/COVERAGE_GAP_MATRIX.md`, `hc-r9-27_1.log`) | 2024 | 37,647 | 23.6% |
| 27_1 | 2025 | 36,739 | 23.0% |
| 27_1 | 2023 | 15,826 | 9.9% |
| 23_23 (Madhya Pradesh — confirmed via live S3 key, `bench=mphc_db_gwl`) | 2025 | 14,941 | 9.4% |
| 23_23 | 2024 | 11,419 | 7.2% |

**Naming caveat, resolved 18 Aug — NEW2 confirmed the registry from the
database (bus 0739), not reconstructed from memory:** `27_1` Bombay ·
`23_23` bench prefix `mphc_*`, consistent with Madhya Pradesh but no name
string found in `judgments` — not asserted · `9_13` Allahabad · `33_10`
Madras · `3_22` Punjab and Haryana · `10_8` Patna · `8_9` Rajasthan ·
`36_29` Telangana · `32_4` Kerala · `29_3` Karnataka · `22_18` Chhattisgarh ·
`20_7` Jharkhand. Codes not verified against a row are left out rather than
guessed, per NEW2's own discipline in that message.

---

## 1 · THE GAP THIS PILOT MUST CLOSE BEFORE ANY IK CALL — identity, not just existence

**`hc_ingest_ledger` does not carry enough information to query Indian
Kanoon.** Its schema (`packages/db/drizzle/0047_hc_ingest_ledger.sql`) is
`source_url, outcome, permanent, attempts, court_code, year` — no title, no
decision date, no case number, no CNR. A sampled row looks like:

```
https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/
  year=2024/court=23_23/bench=mphc_db_gwl/orders_2024_205200245932024_1.pdf
```

The filename is an internal case-number-shaped token, not a human title —
useless as an IK search term on its own. **Step 0, and it is NEW2's step,
not NEW3's:** join each sampled `source_url` back to the AWS source
**metadata** parquet (`year=<Y>/court=<C>/bench=<B>/metadata.parquet` — the
PDF is missing, the metadata row is not, that is the entire premise of this
recovery program) to recover **case title, decision date, and case
number/CNR** — NEW2's `hc-metadata.ts` already reads this format for the
ingest CLI. **This pilot cannot proceed to a single IK call until that join
exists**; nothing below assumes it has been built yet.

**DONE, 18 Aug — NEW2, `services/ingest/src/missing-pdf-pilot-cli.ts`
(bus 0739): 546/546 sampled records (100%) resolved to a case identity,
2005-2026.** One correction to this section's own instructions, found the
hard way: for the recent years that carry most of the population, identity
lives in **`metadata-mobile.parquet`, not `metadata.parquet`** — the two are
disjoint files with different row counts and a different `pdf_link`
filename convention (bare filename on mobile, a full path on plain), the
same two-variant structure `hc-metadata.ts` documents and that caused the
`HC_METADATA_SURVEY` row-vs-document bug (§0). Reading only the plain file
made identity resolution look like it collapsed to 4% in 2024 — read both
and it's 100%. **A join against this population must read whichever variant
the row's own bench/year actually published, never assume plain.**

---

## 2 · THE SAMPLE — stratified by court × year, capped so Bombay does not eat the pilot

**Reference query, meant to be run at execution time, not pre-computed
here.** Proportional allocation with a floor (every stratum with ≥3 rows
gets ≥3 samples, so small courts are not silently excluded) and a cap (no
single stratum exceeds 150, so Bombay 2023–2025 — 68% of the population —
does not consume the whole 1,000-record budget and leave nothing to measure
hit-rate variance by court):

```sql
WITH strata AS (
  SELECT court_code, year, count(*) AS n
  FROM hc_ingest_ledger
  WHERE outcome = 'pdf_absent' AND permanent = true
  GROUP BY court_code, year
),
alloc AS (
  SELECT court_code, year, n,
         GREATEST(LEAST(n, 3),
                  LEAST(150, ROUND(1000.0 * n / SUM(n) OVER ())::int)) AS raw_alloc
  FROM strata
),
ranked AS (
  SELECT l.court_code, l.year, l.source_url, a.raw_alloc, a.n AS stratum_population,
         row_number() OVER (PARTITION BY l.court_code, l.year ORDER BY random()) AS rn
  FROM hc_ingest_ledger l
  JOIN alloc a USING (court_code, year)
  WHERE l.outcome = 'pdf_absent' AND l.permanent = true
)
SELECT court_code, year, source_url, stratum_population,
       stratum_population::float / LEAST(raw_alloc, stratum_population) AS sample_weight
FROM ranked
WHERE rn <= raw_alloc
ORDER BY court_code, year;
```

**`raw_alloc` sums to roughly, not exactly, 1,000** — floors and caps do not
land on a round number. NEW2's wrapper script should accept anything in
900–1,100 rather than force an exact count; forcing it would mean hand-tuning
per-stratum caps for no measurement benefit. **`sample_weight` is carried
through** so any yield measured on the sample can be projected to the full
159,651-row population later (same discipline as NEW2's own 98-stratum
classify frame, bus 0714) — **projection is for sizing a possible follow-up,
never for claiming the pilot itself recovered more than it measured.**

---

## 3 · THE IK CALL PLAN — cheapest call that still answers the four questions

**Stage A — existence + identity check, one call per sampled record.**
`search` (₹0.50) with `formInput` built from the joined title (§1) plus
`doctypes:<ik-doctype-for-court_code>` and `fromdate`/`todate` bracketing the
joined decision date by a few days (order date and upload date sometimes
differ — `RERA_STATE_MATRIX.md` and this ledger's own two-corrections history
on Bihar are the reminder that a tight date filter silently drops real
matches). **This is deliberately per-record, not the bulk category search
`MISSING_PDF_RECOVERY.md` §3 costed** — that bulk design answers "is this
population worth pursuing at all" using an aggregate `citedby` signal, and
cannot answer *this specific record's* hit rate or identity-match rate,
which are exactly what the founder asked this pilot to measure. **Bulk
search is the cheaper call and the wrong one for this question.**

Cost: **≤1,000 × ₹0.50 = ≤₹500 (~$6)**, bounded by however many rows the
allocation actually lands on (§2).

**Stage B — official-copy recovery, selective, only for confirmed identity
matches from Stage A.** `/origdoc/<id>` per `docs/DATA_SOURCES.md` §2 is the
documented endpoint for "the court's own copy," which is the whole point —
recovering an authoritative document, not IK's own reformatting. **Two open
items, flagged rather than guessed past:**

- **`services/ingest/src/harvest/indiankanoon.ts` does not implement
  `origdoc` today** — only `search`, `document`, `fragment`. A small,
  mechanical addition (same `call()` wrapper, same budget-check pattern) —
  code work, not a founder question, and not done here because this lane
  does not touch that file.
- **`origdoc`'s price is not in the three published tiers** (search ₹0.50 /
  document ₹0.20 / fragment ₹0.05 — `DATA_SOURCES.md` §2). **GUESS, not
  KNOW: price it provisionally at the `document` rate (₹0.20)** since it
  returns a full document like `/doc/<id>`, and confirm against the actual
  billed amount on the first real call before trusting the projection in
  §5. Do not silently assume free.

Cost: bounded by Stage A's hit count, not by 1,000 — if Stage A finds (for
illustration) 300 confirmed matches, Stage B is ≤300 × ₹0.20 ≈ ₹60 (~$0.72),
**not** run against every sampled row regardless of match.

**Total pilot ceiling: ≈₹560 (~$6.70), assuming every sampled record hits**
— the true cost will be lower because Stage B only runs on confirmed
matches. Compare against the whole-ledger triage estimate in
`MISSING_PDF_RECOVERY.md` (₹1,150 for a bulk aggregate signal over 22,983
rows, now understating the 159,651 true population by 6.9×) — this pilot is
smaller in record count and answers a sharper question per record.

---

## 4 · THE FOUR MEASUREMENTS, DEFINED SO THEY CANNOT BE FUDGED AFTER THE FACT

1. **Provider hit rate** = (records where Stage A's search returns ≥1
   candidate in the right court/date window) ÷ (records sampled). Report
   overall **and per stratum** — §0's population is 67% Bombay/MP, and a
   hit rate that differs by court would be lost in an aggregate number
   exactly the way `MISSING_PDF_RECOVERY.md` §4 already warned about for the
   mobile-variant question.
2. **Canonical identity match rate** = (records where a Stage A candidate's
   title and date match the joined AWS metadata closely enough to call it
   the same judgment, by a stated heuristic — e.g. normalised-title
   similarity above a fixed threshold AND decision date within N days) ÷
   (records with ≥1 candidate). **This is the rate that distinguishes "IK
   has something for this court-year" from "IK has THIS judgment"** — the
   distinction `MISSING_PDF_RECOVERY.md` §5 already flagged as unmeasured:
   *"Whether any specific missing document is among them is unverified."*
   State the matching threshold used, so the number is reproducible rather
   than a judgment call made silently per row.
3. **Official-copy recovery path** = (records where Stage B's `origdoc` call
   returns a valid PDF, not an error or an IK-reformatted substitute) ÷
   (records sent to Stage B). Tests whether "the court's own copy" claim in
   `DATA_SOURCES.md` §2 holds in practice, not just in documentation.
4. **Cost per recovered judgment** = (total Stage A + Stage B spend) ÷
   (records that pass Stage A hit **and** Stage B origdoc success) — the
   end-to-end figure, not the per-call price list. This is the number that
   decides whether a full-ledger program is worth proposing, and it is
   exactly the number this pilot exists to produce rather than assume.

---

## 5 · WHAT THIS DOES NOT AUTHORISE

- **Not whole-ledger spend.** 1,000 of 159,651 rows, ≈0.6% of the
  population. A yield measured here projects (via `sample_weight`, §2) to a
  possible follow-up size — it does not itself recover the ledger.
- **Not a claim that Indian Kanoon holds any specific sampled document.**
  Section 0 of `MISSING_PDF_RECOVERY.md` already measured the population
  superset (325,674 Bombay HC 2023 documents in IK's index against 15,845
  then missing); this pilot measures the **hit rate on actual sampled rows**,
  which is a different and stricter question.
- **Not a budget instruction to NEW2's spend guard.** `INDIANKANOON_BUDGET_
  PAISE` still defaults to ₹500 (`indiankanoon.ts` — the old signup-credit
  ceiling), which this pilot's ≈₹560 ceiling would exceed by a small margin
  even before Stage B. `FQ-INDIANKANOON-RESOLVED` (`docs/FOUNDER_QUEUE.md`)
  already flags that the paid licence's real rate/ceiling is unconfirmed —
  raise the budget config deliberately once that number exists, per the
  client's own comment: *"an unstated budget must never read as
  permission."*
- **Not runnable today, but closer than when this was written.** Step 0
  (§1) is done — 546/546 sample records resolved to identity, NEW2 bus 0739.
  What's left: `INDIANKANOON_API_TOKEN` is unset (`FQ-INDIANKANOON-RESOLVED`)
  and the `origdoc` method does not exist yet in `indiankanoon.ts` (§3). Both
  are drop-in once supplied/built — nothing about this manifest's design
  changes when they land.
