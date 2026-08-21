# COVERAGE FRONTIER — 17 AUGUST 2026, MEASURED ON THE LOCAL DATABASE

**Owner: NEW2 (ingestion lane), Track A.** Computed during the post-migration
write freeze from a single read-only export of the exact court × year matrix:

```sql
SELECT court, extract(year FROM judgment_date)::int AS yr, count(*)
FROM judgments WHERE judgment_date IS NOT NULL GROUP BY 1,2
```

**7,296,068 rows, 545 court-year cells, 26 courts.** This is a `count(*)` over
the heap, not `reltuples` — the crash on 16 Aug reset `pg_stat`, so every
estimate on this database still reads 0 and no planner statistic may be quoted
as a corpus figure until it does not.

This file answers one question: **which court × year partition should the next
worker attack, and why that one.** It is the queue's evidence, not the queue's
opinion.

---

## 0. THE WHOLE NUMBER — 35.4% OF THE AUTHORIZED SOURCE, EXACTLY

Written last, and it belongs first. `docs/HC_METADATA_SURVEY.json` carries
**`perCourtPerYear`** — an exact per-court, per-year document count for
1950–2026, read from 1,493 parquet footers. Joined to today's held matrix it
gives the corpus's true coverage, with an exact numerator *and* an exact
denominator, for the first time:

| band | source | held | remaining | coverage |
| --- | --- | --- | --- | --- |
| pre-2016 | 4,757,636 | 1,160,698 | 3,596,938 | 24.4% |
| 2016–2022 | 9,069,540 | 2,043,476 | **7,026,064** | 22.5% |
| 2023 | 2,078,757 | 1,398,203 | 680,554 | 67.3% |
| 2024 | 1,747,681 | 626,303 | 1,121,378 | 35.8% |
| 2025–2026 | 2,875,589 | 2,029,046 | 846,543 | 70.6% |
| **TOTAL** | **20,529,203** | **7,257,726** | **13,271,477** | **35.4%** |

Three things this settles.

- **`FQ-20M` in `docs/FOUNDER_QUEUE.md` asks where the "20.5M document target"
  comes from.** It comes from here: 20,529,203 is the exact size of the AWS
  Open Data High Court corpus, summed from the footers. It was never a target
  anyone chose — it is the denominator. **NEW3 found this on 13 August and I
  re-derived it four days late** — `docs/COVERAGE_GAP_MATRIX.md`'s header
  already carried it, with the better form: adding the Supreme Court's 38,351
  gives **20,567,554, within 0.3% of the founder's 20.5M**. `FQ-20M` was a
  separate, un-updated copy of the same question. Credit theirs.
- **The "7.69M gap" for 2016–2022 (bus 0506) was close and is now exact:
  7,026,064.** Still the largest single band by a wide margin, and still where
  the top of the rung plan points.
- **The held total here is 7,257,726, not 7,296,068.** The difference is
  **38,342** — the Supreme Court of India, which is in `judgments` and is *not*
  in the High Court survey at all. It therefore has no denominator anywhere in
  this file. See §4.

**This is a document count, not a judgment count**, on both sides of every
fraction. 13.27M remaining documents is the size of the fetch. It is not the
size of the missing-authority problem, and the two must never be quoted as one
number.

> **CORRECTION, 17 Aug, to a caveat I attached to this figure repeatedly before
> checking its provenance.** I wrote "the judgment share is 0.75%–18.64% by
> court" as though it were a corpus-wide range. **It is not, and the file it
> comes from says so in its header before it states the numbers.**
> `docs/HC_ORDER_TYPES.json` is measured on `metadata-mobile.parquet` **only** —
> 1,291,519 rows, **6.3% of the corpus**, from four courts, of which two carry
> almost all the weight (Bombay 643,219 rows; Allahabad 605,598, whose labels are
> `View` and `View Judgement/Order` and so cannot separate the two). And the
> mobile variant is **disjoint** from the plain files, so a rate measured there is
> not a rate for the other 93.7%. `hc-ordertype-cli.ts` states this exactly:
> *"a labelled measurement over 8% of the corpus … not a corpus-wide judgment
> count and must never be quoted as one."*
>
> **So the judgment share of the corpus is UNMEASURED**, and the honest statement
> is that document count overstates judgment count by an unknown factor with a
> measured lower bound on one disjoint slice. Every place I quoted the range as
> general — bus 0607, 0611, 0614, FQ-20M — is corrected by this paragraph.

### 0a. THE DENOMINATOR IS `plain + mobile`, AND THAT ADDITION WAS CHECKED, NOT ASSUMED

The survey's own total is `plain 19,237,684 + mobile 1,291,519 = 20,529,203`,
and summing `perCourtPerYear` independently reproduces it to the document. But
the sum is only valid if the two variants are **different documents**. Every
partition that has both publishes a `metadata.parquet` and a
`metadata-mobile.parquet` covering the same court, bench and year, and the
mobile file carries a *superset schema* — `case_type`, `order_type`, `is_final`,
`petitioner`, `respondent` and twenty more columns the plain file does not have.
That is exactly what a re-publication of the same rows would look like, and it
would mean the denominator double-counts 1,291,519 documents.

**It does not.** Both variants carry `pdf_link` and `cnr`, so the question is
answerable rather than arguable. Read directly from the bucket footers and
columns:

| partition | plain rows | mobile rows | mobile links also in plain |
| --- | --- | --- | --- |
| Bombay / Aurangabad 2025 | 40,561 (40,561 distinct) | 23,082 (23,082 distinct) | **0 — 0.0%** |
| Allahabad 2023 / cisdb | 80,000 sampled in windows | 1,339 (1,339 distinct) | **0** |

Disjoint on both. The addition is sound and 20,529,203 stands. The variants also
have no fixed ratio — 57% of plain at Aurangabad, 0.3% at Allahabad — so mobile
is a separate publishing path for particular partitions, not a mirror.

> **This was already known, and I should have looked before measuring.**
> `services/ingest/src/harvest/hc-ordertype-cli.ts`, written 9 August, states in
> its header: *"the plain and mobile files share **zero CNRs**, so they are
> disjoint record sets and a rate measured on one is not a rate for the other."*
> Same conclusion, four days earlier, on a different key (CNR rather than
> `pdf_link`) — so the two measurements corroborate each other on independent
> identifiers, which is worth more than either alone. But the check was a
> re-derivation, not a discovery, and this is the **second** time today
> (see §0, FQ-20M). The lesson is the adjacent one to "check the directory
> before claiming a gap": check it before claiming a **finding**.

### 0a-ii. THE DENOMINATOR IS NOT STALE — MEASURED, NOT ASSUMED

The survey was taken 13 August and the held counts are from today, so every
"remaining" figure carried a four-day staleness caveat. That caveat is now
measured rather than hedged.

Re-listed the bucket and re-read the footers for **every 2025 and 2026
partition** — the only years that can grow:

| | |
| --- | --- |
| parquet objects, now | **1,493** |
| parquet objects, in the survey | **1,493** |
| 2025–2026 court-year cells compared | 50 |
| cells that changed | **1** |
| net document drift | **+5** (Allahabad 2026: 151,424 → 151,429) |

**Five documents in four days.** AWS Open Data republishes in batches, not
continuously, and no new partition has appeared. The 20,529,203 denominator is
current, and the staleness caveat on §3b is retired.

**The operational consequence is larger than the correction.** If the source
adds five documents in four days, **freshness cannot come from this bucket.**
Pointing workers at it for recent material buys nothing; the corpus grows
against it only by closing the 13.27M historical gap. Live judicial state has to
come from eCourts and the tribunals — which is exactly what Track B says, now
with a number behind it rather than an assumption.

### 0b. A DUPLICATE-ROW FINDING I MEASURED, ALMOST REPORTED, AND WITHDREW

Worth recording because the failure is reusable and it nearly went out as a
headline.

Reading Allahabad 2023's `metadata.parquet` in **one unbounded
`parquetReadObjects` call** — `rowStart: 0, rowEnd: 443845`, matching the
footer's own row count — returned 443,845 rows containing only **225,366
distinct `pdf_link` values**, with **218,479 links appearing exactly twice** and
none appearing more than twice. Read at face value that says the source
publishes almost every document in the partition twice, which would make the
denominator roughly twice the true document count and would change every
coverage figure in this file.

**It is an artefact of the read, not a property of the data.** Three checks, and
all three refute it:

1. Every **bounded** window is perfectly duplicate-free — rows 0–5,000,
   100,000–105,000 and 400,000–405,000 each return 5,000 rows with 5,000
   distinct links.
2. The same unbounded technique on Bombay/Aurangabad 2025 — a *small* file, few
   row groups — returns 40,561 rows and 40,561 distinct links. The effect
   appears only on the large multi-row-group file.
3. If 97% of distinct links genuinely appeared twice, a 2,000-row window from
   the file's tail would collide with the head at a high rate. Measured, it
   collides at **0.5–1.1%**, which is nothing like 97%.

**The claim is withdrawn and no number in this file depends on it.** What
survives is the lesson, and it is the reason `hc-load-cli.ts` is row-group-aware
in the first place: *an unbounded full-file read of a large multi-row-group
parquet silently returns a row set that fails a self-consistency check every
bounded window passes.* It does not error. It returns the right **count** and
the wrong **rows** — so a measurement built on it looks perfectly plausible and
is wrong by a factor of two.

---

## 1. THE BANDS

| band | rows | share |
| --- | --- | --- |
| pre-2016 | 1,190,849 | 16.3% |
| 2016–2022 | 2,048,935 | 28.1% |
| 2023–2024 | 2,026,142 | 27.8% |
| 2025+ | 2,030,142 | 27.8% |

Flat-looking, and the flatness is misleading — each band is concentrated in
different courts, and two of them are concentrated in a handful of *years*
inside the band. §2 is where the decisions are.

---

## 2. THE YEAR HISTOGRAM, AND A CORRECTION TO MY OWN FIRST READING

| year | rows | courts present |
| --- | --- | --- |
| 2010 | 23,155 | 6 |
| 2011 | 18,756 | 6 |
| 2012 | 23,315 | 6 |
| 2013 | 85,426 | 11 |
| 2014 | 420,116 | 13 |
| 2015 | 530,559 | 14 |
| 2016 | 62,489 | 11 |
| 2017 | 90,050 | 12 |
| 2018 | 172,480 | 12 |
| 2019 | 213,477 | 13 |
| 2020 | 163,270 | 14 |
| 2021 | 311,023 | 18 |
| 2022 | 1,036,146 | 21 |
| 2023 | 1,399,057 | 23 |
| 2024 | **627,085** | 23 |
| 2025 | 1,245,936 | 26 |
| 2026 | 784,206 | 26 (part year) |

**Correction, recorded because I nearly shipped it.** My first pass scanned for
years holding zero rows *per court* and found 2010, 2011 and 2012 empty in every
large court, which reads as a corpus-wide hole. **It is not one.** Those years
hold 23,155 / 18,756 / 23,315 rows across six courts each. The per-court zeros
are real and the corpus-wide zero was an artefact of only ever looking at the
big courts. The aggregate row is the check that catches it, which is why both
views are printed above rather than the one that made the better headline.

What the histogram does say, stated at the strength the evidence supports:

- **Pre-2013 is thin everywhere, not absent.** 2000–2012 runs 700–23,000 rows a
  year across four to six courts. India's High Courts dispose of cases in the
  millions annually; this band is a sample, not a corpus, and no depth claim
  should be made from it.
- **2014–2015 is where the pre-2016 fix landed** (bus 0484): 420,116 and 530,559
  against 85,426 for 2013. The fix worked and it worked *narrowly* — it did not
  reach back past 2013.
- **2016–2021 is the real trough.** 62,489 (2016) rising to 311,023 (2021),
  against 1,036,146 for 2022. Six consecutive years each holding under a third
  of the year that follows them.
- **2024 is an anomaly, and it is the sharpest one in the file.** 627,085 —
  **45% of 2023**, with the *same 23 courts present*. A year does not lose half
  its judgments while every court that published in it still appears. §3 is what
  that turns out to be.

---

## 3. THE RANKED FRONTIER — ABSENT YEARS BRACKETED BY HELD YEARS

The strong signal is not "few rows". It is **zero rows in a year where the same
court holds rows on both sides**. A court that published in 2023 and 2025 did not
stop in 2024; a zero there is our gap, not the court's.

Filtered to courts holding more than 100,000 documents, requiring non-zero
volume within three years before *and* after:

| rank | court | absent year | max in prior 3y | max in next 3y | court total held |
| --- | --- | --- | --- | --- | --- |
| 1 | **Allahabad High Court** | **2024** | 313,595 | 176,494 | 816,196 |
| 2 | **Bombay High Court** | **2024** | 95,351 | 230,159 | 636,197 |
| 3 | **High Court for State of Telangana** | **2024** | 67,257 | 37,323 | 327,702 |
| 4 | Patna High Court | 2018 | 98,159 | 44,764 | 585,786 |
| 5 | High Court of Kerala | 2019 | 37,436 | 76,736 | 370,714 |
| 6 | High Court of Andhra Pradesh | 2022, 2023 | 29,436 | 58,502 | 153,194 |
| 7 | High Court of Rajasthan | 2018 | 59,664 | 15,199 | 500,288 |
| 8 | High Court of Kerala | 2018 | 54,264 | 4,792 | 370,714 |

**The three 2024 zeros are the whole anomaly in §2.** Allahabad, Bombay and
Telangana are the first, second and ninth largest holdings in the corpus, and
each holds exactly **0** documents dated 2024 while holding six-figure counts on
either side.

### 3a. THE CAUSE, CHECKED RATHER THAN ASSUMED — AND MY FIRST ANSWER WAS WRONG

My first hypothesis was a **false `COMPLETE`**: the failure mode fixed on 15 Aug
(bus 0529) where a timeout was laundered into a permanent completion mark, whose
fix stopped new instances but never un-marked the ones already written. It is a
good hypothesis and it is **not what happened.** I checked before writing it up
as a target, and the checkpoints say something different.

Reading every checkpoint under `services/ingest/.checkpoints/` by court, bench
and year:

| court | code | years with a checkpoint |
| --- | --- | --- |
| Allahabad | `9_13` | 2016–2023, 2025, 2026 — **no 2024 entry of any kind** |
| Bombay | `27_1` | 2014, 2015, 2022, 2023, 2025, 2026 — **no 2024** |
| Telangana | `36_29` | 2013, 2014, 2015, 2025, 2026 — **no 2024** |

A false `COMPLETE` leaves a checkpoint behind. **There is no checkpoint at all.**
Nothing ever started on these scopes, so nothing could have mis-marked them.

The real cause is a mechanism this repo already documents, one year further on.
`hc-load-cli.ts` descends **newest-first**, and its own header records what that
does to a large court:

> *"newest-first ordering (justified below) starves the old years on the big
> courts. Measured that day — Bombay held 0 of ~788,000 source documents across
> 2023-2025 … because a 2.4M-document court is still inside year=2026."*

The remedy already exists and is already deployed — a second, year-scoped worker
per starved court. `scripts/start-ingest-fleet.ps1` carries a block of them:

```powershell
# -- year-scoped 2023 catch-up, separate checkpoints ---------------
Start-Worker 'hc-boot-33_10-y2023' …   Start-Worker 'hc-boot-8_9-y2023'  …
Start-Worker 'hc-boot-9_13-y2023'  …   Start-Worker 'hc-boot-3_22-y2023' …
Start-Worker 'hc-boot-10_8-y2023'  …   Start-Worker 'hc-boot-27_1-y2023' …

# -- year-scoped 2024, same orphan story, one scope ----------------
Start-Worker 'hc-boot-14_25-y2024' …
```

**Six courts got a 2023 rescue worker. Exactly one court got a 2024 one, and it
is Manipur** — an 18,745-document court. The three courts holding zero 2024
documents are the three biggest in the corpus and none of them has a `y2024`
scope. Their unscoped `hc-boot-$c` worker (`--from-year 2016`, no `--to-year`)
does have 2024 in range, but it is descending from 2026 and is currently inside
2025, so it arrives at 2024 only after finishing a year that is itself
six-figure. That is the same starvation the 2023 block was created to fix,
recurring because the fix was applied as a list of names rather than as a rule.

**So the remedy is three lines, exactly parallel to the ones already there:**

```powershell
Start-Worker 'hc-boot-9_13-y2024'  (HcArgs -Court '9_13'  -Year '2024' -Concurrency '32')
Start-Worker 'hc-boot-27_1-y2024'  (HcArgs -Court '27_1'  -Year '2024' -Concurrency '32')
Start-Worker 'hc-boot-36_29-y2024' (HcArgs -Court '36_29' -Year '2024' -Concurrency '32')
```

**Not added, and deliberately not.** The freeze is on, and a launcher edit that
starts three 32-way workers is not a documentation change — it is the fleet
resuming. This goes in after `LOCAL_DATABASE_CUTOVER_APPROVED` and after the
three canaries, in that order.

**The generalisation worth more than the three lines:** the y2023 block dates
from 14 August and is a hand-written list. Nothing recomputes it. Every year
that rolls over re-creates this hole for whichever courts are large enough to
still be descending, and the next one is already visible — Madras, P&H, Patna
and Karnataka sit at 9.7%, 1.9%, 6.8% and 92.0% for 2024 with no `y2024` scope
either. A worker list derived from the coverage matrix would not need a person
to notice.

### The near-zeros, which are the same story one step weaker

Not zero, so excluded from the ranking above, and worth the same suspicion:

| court | 2023 | 2024 | 2025 |
| --- | --- | --- | --- |
| High Court of Punjab and Haryana | 149,230 | **2,999** | 72,659 |
| High Court of Madhya Pradesh | 121,072 | **12,277** | **184** |
| Madras High Court | 147,125 | **17,180** | 59,246 |
| Patna High Court | 135,886 | **8,400** | 112,613 |

P&H 2024 at 2,999 against 149,230 the year before is a partial run, not a
publication fact. **MP is the one that is not a 2024 story at all**: 121,072 in
2023, 12,277 in 2024, and **184** in 2025 — a court whose largest single band is
2016–2022 (359,561) and which has effectively stopped arriving. MP also holds
**zero** pre-2016. It is the most lopsided court in the corpus and deserves its
own diagnosis rather than a place in a 2024 sweep.

---

## 3b. THE SAME FRONTIER WITH A REAL DENOMINATOR — 1,783,890 DOCUMENTS REMAINING IN 2023–2024

§3 ranks by *absence*, which is a proxy. The denominator exists and I nearly
failed to look for it: `docs/COVERAGE_GAP_MATRIX.md` §4b carries **per-court,
per-year source counts** for 2023 and 2024, measured 13 August. Joining them to
today's held counts turns a suspicion into a work queue with an exact size.

> **Cross-checked against `perCourtPerYear` after §0 was written**, which is the
> machine-readable source for the same figures. Every 2023 and 2024 number in
> this table reproduces exactly — Allahabad 2024 = 264,889 and Bombay 2024 =
> 277,355 in both. The markdown table in §4b and the survey JSON agree, so
> neither is a transcription error, and the four-day staleness caveat below is
> the only one that survives.

| court | 2023 remaining | 2023 held | 2024 remaining | 2024 held | total remaining |
| --- | --- | --- | --- | --- | --- |
| **Allahabad High Court** | 220,458 | 58.7% | **264,889** | **0.0%** | **485,347** |
| **Bombay High Court** | 32,349 | 74.7% | **277,355** | **0.0%** | **309,704** |
| **Madras High Court** | 34,147 | 81.2% | 160,380 | 9.7% | 194,527 |
| **Orissa High Court** | **111,641** | **0.0%** | 59,530 | 33.9% | 171,171 |
| **High Court of Punjab and Haryana** | 158 | 99.9% | 151,802 | 1.9% | 151,960 |
| **High Court of Andhra Pradesh** | **99,768** | **0.0%** | 27,496 | 51.5% | 127,264 |
| **Patna High Court** | 27 | 100.0% | 114,706 | 6.8% | 114,733 |
| **High Court of Karnataka** | **80,102** | **0.0%** | 7,365 | 92.0% | 87,467 |
| **Calcutta High Court** | 82,526 | 3.3% | 10 | 100.0% | 82,536 |
| **High Court for State of Telangana** | 1,075 | 98.4% | **38,931** | **0.0%** | 40,006 |
| High Court of Chhattisgarh | 18,284 | 56.7% | 14 | 100.0% | 18,298 |
| Gauhati High Court | 0 | 100.0% | 661 | 97.6% | 661 |
| High Court of Delhi | 2 | 100.0% | 189 | 99.6% | 191 |
| High Court of Rajasthan | 14 | 100.0% | 5 | 100.0% | 19 |
| High Court of Kerala | 2 | 100.0% | 1 | 100.0% | 3 |
| High Court of Himachal Pradesh | 1 | 100.0% | 1 | 100.0% | 2 |
| High Court of Jharkhand | 0 | 100.0% | 1 | 100.0% | 1 |
| **TOTAL** | | | | | **1,783,890** |

**Three things follow, and the third is the one that saves the most time.**

1. **The work is concentrated.** The top five rows are 1,312,709 of the
   1,783,890 — 74%. Allahabad and Bombay alone are 795,051, and both are almost
   entirely a *single* absent year.
2. **§4b's "donut hole" is now half-closed, and the half that closed is
   invisible if you only read the old file.** On 13 August every court in that
   table held 0 or near-0 across both years. Today Patna 2023, Rajasthan, Kerala,
   Himachal, Jharkhand, Delhi and Gauhati are at or above 97.6% on **both**
   years. The gap did not stay where it was measured.
3. **Seven courts are finished for these two years and must not be re-queued.**
   Rajasthan, Kerala, Himachal, Jharkhand, Delhi, Gauhati and (for 2024)
   Calcutta and Chhattisgarh have double-digit *documents*, not thousands,
   outstanding. A worker sent there burns its budget rediscovering that. **Where
   not to send a worker is a result, not an absence of one.**

**Two caveats that the numbers do not carry on their face, both from §4b's own
text and both load-bearing:**

- **`source_total` counts DOCUMENTS, not JUDGMENTS.** `docs/DATASETS.md`
  is clear that most of the bucket is procedural rather than reasoned. **Do not
  report 1.78M as missing judgments.** It is the size of the fetch, not the size
  of the authority gap — and per §0's correction, the conversion factor between
  them is **unmeasured** outside one disjoint 6.3% slice.
- **The source counts are four days old** (13 August) and the held counts are
  from today. Source only grows, so every "remaining" above is a floor, and the
  100.0% rows are the ones most likely to have drifted by a small amount.

## 4. THE COURT THAT SHOULD EMBARRASS US

| court | total held |
| --- | --- |
| **Supreme Court of India** | **38,342** |

30,151 pre-2016, 5,459 across 2016–2022, 1,636 across 2023–2024, **1,096 in
2025+**.

Every other entry in this file is a High Court holding six figures. The Supreme
Court — the only court whose judgments bind every other court in the country,
the court that supplies the overwhelming majority of the citations an advocate
actually needs, and the court behind the 32,383 unresolved SCC/AIR external
citations in `docs/MISSING_AUTHORITY_QUEUE.md` — is **0.53% of the corpus** and
its recent years are close to empty.

I am not filing this as a target with a request shape, because I have not
measured what is available at source and a target without a source count is a
wish. **It is filed as the highest-legal-value gap in the corpus**, and the
ranking in §3 is a ranking of *reachable* work, not of importance. If a source
count for the Supreme Court is obtainable, it outranks every row in §3.

---

## 5. WHAT THIS FILE DOES NOT ESTABLISH

- **Nothing here is a coverage percentage.** Every figure is *held* count. The
  denominator — what exists at source for each court × year — is not in this
  file, and dividing by an assumed one is how `min(judgment_date)` became a
  coverage claim in the first place (bus 0485, corrected).
- **Nothing here was harvested, queued or started.** The freeze is on, `STOP` is
  present, 0 workers are running. This is one `SELECT`.
- **The measurement competed with a timed run and was stopped from doing it
  again.** LCC (bus 0603) is timing NEW1's post-migration gate against this
  cluster. This aggregate scans the whole `judgments` heap; it completed before
  I could cancel it, and I have issued no further heavy read. Any follow-up
  query in this file waits for the gate.
