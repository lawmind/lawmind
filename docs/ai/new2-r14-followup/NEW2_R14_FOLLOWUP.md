# NEW2 R14 FOLLOW-UP — the source was never unavailable

**Lane NEW2 · 31 August 2026 · HEAD at start `6f0d96bf`**

R14 measured 49 Acts against India Code and could not reach 25 of them. That
verdict was about our reach, not about the source. Every one of the 25 is on
India Code today, was on India Code then, and is now pinned to the handle the
platform itself names for it.

Three artifacts, each with its own `measuredAt`. The frozen R14 measurement
`docs/ai/new2-r14/statute-freshness-v1.json` is **unchanged** — sha256
`2b364f39…` still matches its recorded digest.

| artifact                                    | what it is                                                   |
| ------------------------------------------- | ------------------------------------------------------------ |
| `indiacode-handle-reresolution.json`        | the bounded handle re-resolution, 49 Acts, one verdict each  |
| `statute-freshness-followup.json`           | the same 49 Acts re-measured against the re-resolved handles |
| `human-review-citation-2010-7-scc-626.json` | the evidence packet for the one pin R14 could not close      |

---

## 1 · Why 125 dimension checks read SOURCE_UNAVAILABLE

The frozen run resolved an Act by its stored handle, and fell back to a title
search when the handle 404'd. Both halves failed, for two separate reasons.

**The handle half.** India Code migrated hosts. 845 of our 849 `statutes` rows
still carry a `www.indiacode.nic.in/handle/…` URL, and the handle NUMBER — not
just the host — changed for most items during the migration. `hdl:123456789/20063`
is the Bharatiya Sakshya Adhiniyam in our row and is a 404 upstream.

**The search half, which is the interesting one.** India Code's DSpace
`/discover` endpoint ranks SECTION items above the ACT item. A ten-result search
for `Bharatiya Sakshya Adhiniyam` returns ten _sections_ of the Adhiniyam and
never the Adhiniyam. A top-10 title search therefore **structurally cannot
reach any principal Act with more than ten indexed sections** — which is nearly
every Act that matters. The frozen run's fallback was not unlucky; it was
searching a space that could not contain its answer.

A third, smaller defect sat underneath: our `act_number` is zero-padded on some
rows (`"04"`, `"02"`, `"07"`) and India Code's is not (`"4"`). The frozen run
compared those bytes for equality, so even a correctly found Act could be
rejected as not agreeing.

## 2 · The identity that closed it

`statutes.act_id` holds India Code's own `dc.identifier.act_id` **verbatim** for
rows ingested from India Code. BSA 2023 is
`AC_CEN_5_23_00049_2023-47_1719292804654` in our row and in theirs, byte for
byte. One query —

```
dc.identifier.act_id:"<our act_id>" AND dc.identifier.collection:"ACT"
```

— returns exactly one item, with no ranking involved. That is an identity, not a
resemblance, and it is the reason this round needed 95 requests rather than a
crawler.

Three guards on top of it, all mechanical:

- the source's **act number and act year must agree** with ours on every path,
  with leading zeros stripped on both sides. A title that merely looks right was
  never accepted, and no Act was resolved on title alone;
- **an `AC_` prefix is the test for whether an act_id is upstream's at all.**
  Three rows carry LawMind-minted ids — `MHA_JUD_2022-09_ccp1973`,
  `INDIACODE_547533_iea_1872`, `INDIACODE_547812_ipc_act` — which can never
  match upstream and were never sent as if they could;
- **the stored handle is read, not merely pinged.** `123456789/1565` survived the
  migration attached to a DSpace object named `"Rule"` with no act number, no act
  year and no collection, and the frozen run took that 200 as the Limitation
  Act's upstream item. A 200 is not an identity; an object that is not an Act
  cannot confirm or deny an Act.

## 3 · DEAD_HANDLES — the classification

`docs/ai/new2-r14-followup/indiacode-handle-reresolution.json`, measured
2026-08-31T09:44:17Z, 95 requests at 1.1 s spacing.

| classification                 | dead handles (25) | controls (24) |
| ------------------------------ | ----------------: | ------------: |
| `MOVED_OFFICIAL_HANDLE`        |            **25** |            21 |
| `HANDLE_STILL_CURRENT`         |                 0 |             3 |
| `SOURCE_CURRENTLY_UNAVAILABLE` |             **0** |             0 |
| `WRONG_IDENTITY`               |                 0 |             0 |
| `DUPLICATE_SOURCE_ENTRY`       |                 0 |             0 |
| `UNKNOWN`                      |                 0 |             0 |

All 25 resolved through the act_id path. All 46 replacement items are `CENTRAL`.
`--apply` rewrote `statutes.source_url` for those 46 rows and touched nothing
else — no text, no section, no repeal state, no schema.

The 21 controls matter as much as the 25. Those Acts were _reported resolved_ by
the frozen run, but on the weak `SEARCH` identity and against a stored URL that
was already dead. They are now pinned by act_id to the official handle.

**The three `HANDLE_STILL_CURRENT` are a finding, not a pass.** CrPC 1973, the
Indian Penal Code and the Indian Evidence Act resolve — to the **Chhattisgarh**
and **Chandigarh** State reproductions, not to the CENTRAL item. Act number and
year agree, so the item is the right Act; the provenance is a State repository's
copy of a Central Act. That is recorded as a cluster and is not silently
equated with the Central item.

---

## 4 · The re-measurement

`docs/ai/new2-r14-followup/statute-freshness-followup.json`, measured
2026-08-31T09:47:03Z. Same 49 Acts, same five dimensions, same verdict
vocabulary, same worst-of-dimensions per-Act rule — so the two runs compare.
Two things differ: each Act is fetched by the handle the source itself names,
and act numbers are compared with leading zeros stripped on both sides.

| dimension check          | frozen R14 | follow-up |
| ------------------------ | ---------: | --------: |
| `EXACT_MATCH`            |         46 |    **98** |
| `STALE`                  |          0 |     **0** |
| `UNKNOWN`                |         74 |       147 |
| `SOURCE_UNAVAILABLE`     |        125 |     **0** |
| material temporal errors |          0 |     **0** |

Denominator unchanged: 49 Acts × 5 dimensions = 245 checks.

**Read the UNKNOWN honestly.** It rose because the 125 unreachable checks
became reachable, and three of the five dimensions are untestable against this
source for _every_ Act. 147 is exactly 49 × 3 — `currentRepealedState` (we store
nothing to compare), `latestRepresentedAmendment` (the source item carries no
amendment history), `sectionExistence` (the source publishes
`no_of_section = 0`). Nothing became less certain. The measurable half went from
46 of 98 to **98 of 98**.

Of the two testable dimensions, across all 49 Acts:

- `actIdentity` — **49 EXACT_MATCH, 0 STALE**
- `commencement` — **49 EXACT_MATCH, 0 STALE**

By population:

| population                            | EXACT | STALE | UNKNOWN | UNAVAILABLE |
| ------------------------------------- | ----: | ----: | ------: | ----------: |
| affected, was SOURCE_UNAVAILABLE (25) |    50 |     0 |      75 |           0 |
| affected, was SEARCH-resolved (21)    |    42 |     0 |      63 |           0 |
| control, handle unchanged (3)         |     6 |     0 |       9 |           0 |

The per-Act tally is 49 `UNKNOWN` in both runs, because the worst-of rule takes
the worst dimension and three dimensions are structurally UNKNOWN. That number
did not move and was never going to; it is the dimension tally that carries the
result.

No applicability conclusion is drawn anywhere. That the source flags an Act
repealed is recorded as what the source says.

---

## 5 · The repeal column — request RETRACTED

R14 raised a possible `statutes` repeal-column migration. **I am withdrawing
it**, on evidence gathered for that purpose rather than on a schema opinion.

The fact the column would have carried is India Code's own
`dc.identifier.repealed`. Across the 49 sampled Acts that flag reads:

```
false : 49
true  : 0
```

It is `false` on the **Indian Penal Code 1860, the Code of Criminal Procedure
1973 and the Indian Evidence Act 1872** — all three repealed on 1 July 2024 by
BNS, BNSS and BSA (`DOMAIN_TRUTH.md`). It is `false` on all ten repeal-titled
Acts in the sample, including the Farm Laws Repeal Act 2021 and the Mussalman
Wakf (Repeal) Act 2025.

A field that takes one value across the whole sample carries no information, and
this one is wrong on precisely the three Acts where an advocate would be harmed
by trusting it. Persisting it as canonical temporal state would move an
unreliable upstream flag from an evidence artifact, where it is labelled, into a
column, where it would read as ours. **That is a worse outcome than the gap.**

The schema is not the limitation here; the source is. So there is no schema
handoff to send — `REPEAL_COLUMN_SCHEMA_REQUIRED = NO`.

What LCC is handed instead is an observation, not an ask, recorded here and on
the bus:

- Act-level repeal is genuinely unrepresentable today. `statute_amendments`
  carries `event_type = 'repealed'` (170 rows across 67 Acts) but is keyed to
  `statute_section_id`, so it is section-scoped, and **22 of 849 statutes have
  zero ingested sections** and could not carry an Act-level fact at all.
- `statute_mappings.old_act` is an enum of exactly `ipc | crpc | evidence`, so
  that table cannot express "Act X was repealed by Act Y" in general either.
- None of that becomes urgent on this measurement, because we have no
  trustworthy source for the fact. The gap to close first is the source, not the
  column. If a reliable Act-level repeal source is ever authorised, the handoff
  can be written then, with the fact in hand.

---

## 6 · `(2010) 7 SCC 626` — HUMAN_REVIEW_REQUIRED

`docs/ai/new2-r14-followup/human-review-citation-2010-7-scc-626.json`.

R14's corroboration screen flagged 41 pins where the citing text names parties
and none is the target. Six were hand-read; five were explained; one was not.
That one is preserved here, unresolved, with its evidence assembled.

**The conflict.** _Madhu S v. Travancore Devaswom Board_ (Kerala HC, 4 Jul 2023)
cites `2010 (7) SCC 626` as _Union of India v. National Confederation for Blind_.
The resolver pins the key `20107SCC626` to _Govt. of India through Secretary v.
Ravi Prakash Gupta_ (SC, 7 Jul 2010). The edge is
`e1b011f2-3ee8-4021-944a-321448d62415`; its `cited_judgment_id` is **NULL** —
the pin is a candidate and has never been written.

**What the corpus says.** Every held edge whose `normalised_citation` is
`(2010) 7 SCC 626`, with a 900-character window around the citation, matchers
written to survive this corpus's documented OCR `s`-dropping ("Ravi Praka h
Gupta"):

```
edges carrying the citation                  236
window names Ravi Prakash Gupta only         158   (17 distinct courts)
window names the blind only                    5   ( 2 distinct courts)
window names both                             28
window names neither                          45
```

**The citing sentence is internally inconsistent.** The same sentence attributes
`[2013 (10) SCC 772]` to _Popat Bahiru Govardhane v. Land Acquisition Officer_.
Our own alias rows key `(2013) 10 SCC 772` to _Union of India v. National
Federation of the Blind_, corroborated 8 times, with its SCR half
(`[2013] 9 SCR 1023`) verifiable against that judgment's own
`reporter_citations`. At least one case-name-to-citation pairing in that sentence
is wrong **in the citing text itself** — which is exactly why the sentence
cannot settle the identity of the citation beside it.

**No judgment titled _Union of India v. National Confederation for Blind_ is
held.** The only Supreme Court judgments in the corpus whose titles name a
federation or confederation of the blind are _National Federation of Blind v.
UPSC_ (1993) and _Union of India v. National Federation of the Blind_ (2013).
Neither is a 2010 decision.

**Why this is not closed anyway.** The discriminating fact is a page number in
Supreme Court Cases — a commercial law report whose copy-edited edition
`CLAUDE.md` forbids this corpus from holding (_EBC v. D.B. Modak_). Every source
we are authorised to use paginates in SCR, not SCC: India Code carries statutes,
the Court's own reports are SCR. **No primary source available to us states what
is printed at (2010) 7 SCC 626.** Our alias for the key is DERIVED — extracted
from a parallel-citation string in other judgments — and its SCR half is
verifiable against our own row while its SCC half is verifiable against nothing
we hold.

158 courts saying a name is strong corroboration and is not the printed page.
Party-name similarity created no edge in R14 and creates none here.

```
HUMAN_REVIEW_CITATION   (2010) 7 SCC 626
HUMAN_REVIEW_STATE      HUMAN_REVIEW_REQUIRED
EDGE_WRITTEN            false
RESOLVER_CHANGED        false
```

What would settle it: a human reading (2010) 7 SCC 626, or an official
SCR-to-SCC concordance from a source we are authorised to use.

---

## 7 · LCC citation gate — committed mid-round, retested independently, and it does not clear

The gate was **untracked** when I first read HEAD at `125b8345`: `cohort.ts`,
its two test files and `docs/ai/lcc-r15/` existed in this shared worktree and in
no clone. I recorded `WAITING_FOR_LCC` and did not run a falsifier against an
uncommitted tree, because a verdict naming a resolver nobody can check out is
not a falsifier result.

LCC then committed it at **`bd2aa74a`**, while this round was still open.
`services/api/src/citations/` is clean at HEAD, so the gate is current and
testable. This section replaces the WAITING one.

**LCC's tests were not run, not read for correctness, and not counted.** Every
number below is this lane's instrument on this lane's population.

### 7.1 · A new population, and one correction to the instrument

`scripts/n2-citation-falsifier-r14.mts` is now round-parameterised — additively,
so with no flags it is the R14 instrument unchanged. `--salt NEW2-R15-2026-08-31`
changes the sampling rank, and R15 draws 3,600 rows sharing only **254 (7.06%)**
with R14's package. A round that re-drew the rows the fix was written from would
be measuring the fix against its own evidence.

```
NEW_APPLY_POPULATION_ID   NEW2-R15-PKG-48be7a6f42282d6d
package sha256            48be7a6f42282d6defc13d96759b6338c91f50d7e009d0aec4cfde166509763b
sampled                   3,600 across 9 strata
edges scanned             6,051,882
```

Both frozen R14 candidates are untouched.

**One instrument change was load-bearing.** `resolveBatch` now takes
`{ raw, citingJudgmentId }` and answers `SELF_REFERENCE`. **A bare string still
compiles, still runs, and silently skips that branch.** Measured directly on
three known self-edges before changing anything:

| citation            | bare string | reference form   |
| ------------------- | ----------- | ---------------- |
| `2025:AHC:79018`    | `UNIQUE`    | `SELF_REFERENCE` |
| `2023:KHC:33727`    | `UNIQUE`    | `SELF_REFERENCE` |
| `2025:BHC-AUG:6358` | `UNIQUE`    | `SELF_REFERENCE` |

A falsifier that kept passing strings would have reported a clean self-edge
class by never reaching the code that decides one. Both resolve sites now pass
the reference form.

### 7.2 · Results

```
FALSE_PIN     0
FALSE_UNIQUE  0
AMBIGUOUS     411
UNTESTABLE    0
```

Resolver states over the 3,600: `SELF_REFERENCE` 1,917 · `UNIQUE` 472 ·
`AMBIGUOUS` 411 · `REFUSED` 400 · `TARGET_NOT_HELD` 400.

| required retest                 | state                                                                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| self-edge class                 | **PASS** — 1,917 refused at source; R14 scored 1,146 of its 3,600 as `SELF_EDGE` while the resolver still called them `UNIQUE`                                                                                              |
| aliases                         | **PASS**, with a known structural limit — 400 of 400 `UNIQUE`, none contradicted; the alias table's UNIQUE index means this path can never return `AMBIGUOUS`, which is unchanged by this gate and is not evidence about it |
| cross-court collisions          | **PASS** — 396 `AMBIGUOUS`, 4 `SELF_REFERENCE`, nothing pinned                                                                                                                                                              |
| prediction-blind positives      | **PASS** — package written and hashed before any resolution existed; 0 of 472 pins contradicted                                                                                                                             |
| prediction-blind negatives      | **PASS** — 400 of 400 malformed strings refused before lookup; 400 of 400 well-formed-but-not-held answered `TARGET_NOT_HELD`                                                                                               |
| connected matter / common order | **NOT PASSED**                                                                                                                                                                                                              |

The self-reference count is larger than R14's self-pin count for a reason worth
recording: the citer claiming the key now ends the question however many others
claim it, so ~785 multi-candidate rows R14 answered `AMBIGUOUS` now answer
`SELF_REFERENCE`. Both withhold a pin, so no false pin is created — but it means
this sample exercises the `AMBIGUOUS` path in `E_MULTI_DISTINCT_CASE` on only 14
rows rather than 400.

### 7.3 · The finding — the gate reads matter numbers case-sensitively and fails OPEN

The cohort gate was **reached on all 472 would-be-`UNIQUE` rows** and refused
none. That is not a pass, because it saw no evidence on any of them:

```
cohort gate evaluations          472
verdicts                         UNIQUE_NOT_REFUTED : 472
declaredMatters histogram        0 : 472
```

Every one had a **readable** cause title — `cohortVerdict` returns
`INSUFFICIENT_TO_PROVE_UNIQUE` when the title is absent, and none did; reading
the 317 distinct pinned judgments directly confirmed `causeTitleAbsent: 0`. So
472 readable cause titles produced **zero declared matters**, not one — not even
the single matter an ordinary judgment prints.

`MATTER_LONG` and `MATTER_SLASH` capture the matter TYPE as `[A-Z][A-Z.&'-]*` —
**upper case only** — while the connector list is matched case-insensitively.
Pure, no database:

| input                                                                      | declaredMatters | connector |
| -------------------------------------------------------------------------- | --------------: | --------- |
| `(Civil appeal No. 2047 of 2007)`                                          |               0 | null      |
| `(CIVIL APPEAL No. 2047 of 2007)`                                          |           **1** | null      |
| `WRIT PETITION No. 123 of 2020` / `WITH` / `WRIT PETITION No. 456 of 2020` |           **2** | WITH      |
| `Writ Petition No. 123 of 2020` / `With` / `Writ Petition No. 456 of 2020` |           **0** | WITH      |

The last row is the failure. A genuine two-matter common order printed in title
case yields `connector = WITH` and `declaredMatters = 0`, so
`declaredMatters > heldCandidates` is `0 > 1` — false — and the reference is
told it is the only one. **The gate fails open on exactly the shape it exists to
refuse.**

Corpus exposure, court-stratified md5 sample of 4,000 key-bearing judgments,
each head read twice — as the gate reads it, and upper-cased:

```
read as zero matters                                 1,577   39.4%
at least one matter recovered by case alone            828   20.7%
JOINED multi-matter cohort visible only upper-cased     78   1.95%
```

That 1.95% is the same order as the 1.48% recall cost the gate was measured to
pay for the cohorts it does catch — so on this evidence it misses about as many
as it catches. Worst affected in the sample: Allahabad HC (772 of 1,615 read
zero), Punjab & Haryana (102 of 122), and the Supreme Court (111 of 111 — the
SCR report format prints `(Civil Appeal No. 2047 of 2007)` in title case).

**Why the suite is green anyway.** `cohort.test.ts` already contains a
title-case matter line and does not notice: the `JHHC_24297` fixture prints
`Miscellaneous Appeal No. 134 of 2018` on line 6, it is silently unmatched, and
the assertion still passes because the same matter is also printed upper-case as
`M.A. No. 134 of 2018` on line 2. Every matter an assertion depends on is upper
case, so no test in the file can fail on letter case.

**What this is not.** It is not a false pin — `FALSE_PIN` is 0 in 3,600. It is
not a claim that the gate is wrong where it fires. It is not measured on query
traffic. `services/api/**` is outside this lane's write set and **no fix was
attempted here**; the shape is one word — match the type case-insensitively, as
the connector already is — and it is LCC's to make, with a title-case-only
fixture as the missing test.

### 7.4 · Verdict

```
LCC_GATE_OBSERVED       COMMITTED at bd2aa74a, verified current
CITATION_RETEST_STATE   RETESTED_INDEPENDENTLY
CITATION_BULK_APPLY     HOLD
```

The connected-matter class — the class the gate was built for, and the one R14
failed on — is not demonstrated. A gate that cannot fire is not a gate that
found nothing to fire on, and 1.5M edges is not the place to discover the
difference.

**No apply candidate was frozen.** A candidate binds rows to a resolver version,
and this one is going to change; freezing 6,051,882 references against a
resolver already known to be blind on this class would produce a hash that has
to be thrown away. The population identity of record for this round is the blind
package.

Evidence: `docs/ai/new2-r15/citation-falsifier-r15.json` and the three files
beside it.

---

## 8 · Continuous ingestion — unchanged, healthy, with two honest verdicts

No new architecture, no changed schedule, provenance preserved.

**The daily delta.** `new2-daily-delta` last ran 30 Aug 18:00 local,
`LastTaskResult 0`, next run 31 Aug 18:00. The 30 Aug cycle owned 5 HC boot
scopes, ran the SCI homepage judgment delta and the source-unavailable
revalidation, and closed `ok` in 13m50s. Newest local row 2026-08-30 14:05:19Z.
Corpus 18,759,022 judgments.

**HC parity**, `scripts/n2-hc-parity-matrix.mts`, 25 court scopes, 7,730
court-month cells:

```
upstream            18,945,988
held                18,724,829   (98.833%)
source-unavailable     221,159
policy-refused               0
actionable                   0
never-attempted              0
accounted_upstream        100%
```

Zero actionable and zero never-attempted: everything upstream publishes is
either held or recorded as unavailable with a reason. 40,634 month conflicts
remain, unchanged, and are a dating question rather than a coverage one.

**SC / SCI freshness**, with the scopes named rather than merged:

- `aws_open_data_hc` — newest upstream write 2026-08-30, newest local ingest
  2026-08-30, newest local decision 2026-08-29. Latest month sits at 40.6% of
  its own baseline, so the decomposition returns `LOCAL_INGEST_BEHIND`. That is
  the correct verdict for a month still in progress against a full-month
  baseline, and it is reported as measured rather than explained away.
- `aws_open_data_sc` — newest upstream write 2026-08-30, but the newest SC
  _decision_ upstream holds is 2026-08-12, and our newest local decision is
  2026-08-04. Verdict `BOTH`: upstream is thin AND we are behind what it does
  hold. 38,352 SC judgments held.
- `sci-live` is a third source and is **not** in that ledger's freshness line.
  Two AWS scopes are not three sources, and the SCI homepage delta ran on the
  30 Aug cycle independently of them.

`aws_open_data_sc` has reported `new: 77` on every recent cycle with bytes
waiting. That is the scope's standing shape, not a growing backlog.

**Two courts read `EFFECTIVELY_ABSENT`, and the reason is upstream, not us.**
This is worth stating precisely because the first reading of it was wrong. The
decomposition scores each court against ITS OWN settled-month baseline, and on
that basis Allahabad and Tripura are effectively absent for 2026-08 — and
Allahabad for **2026-07 as well**, which is a settled month, not a mid-month
artefact. That looked like a stalled scope.

The parity matrix says otherwise, per court-month cell:

| court (code)          | month   | upstream |   held | source-unavailable |  held % |
| --------------------- | ------- | -------: | -----: | -----------------: | ------: |
| Allahabad HC (`9_13`) | 2026-05 |   32,876 | 32,362 |                514 |    98.4 |
| Allahabad HC (`9_13`) | 2026-06 |    5,521 |  5,489 |                 32 |    99.4 |
| Allahabad HC (`9_13`) | 2026-07 |   **54** | **54** |                  0 | **100** |
| Allahabad HC (`9_13`) | 2026-08 |   **29** | **29** |                  0 | **100** |

Upstream itself fell from 32,876 objects in May to 54 in July. We hold every one
of them. Allahabad's absence is AWS Open Data not publishing, and our scope is
reading it correctly — `actionableFailures 0`, `neverAttempted 0` in both cells.
A per-court baseline is the right instrument for asking _is this court's month
complete_, and the wrong one for asking _is our ingest broken_; only the parity
cell separates those, and it does.

**One cell does deserve attention.** Bombay High Court (`27_1`) is at **64.1%**
for 2026-08 — 2,124 held of 3,313 upstream, with 1,189 `source-unavailable` in a
single month, up from 502 in July and 460 in June. It is accounted (nothing
actionable, nothing never-attempted), so it is a source-side refusal rather than
a missed fetch, but the trend is one way and it is named here rather than
absorbed into the 98.833% corpus figure. Carried into the next round; no scope
change made on one month's reading.

---

## 9 · Caveats — what is unverified, assumed or weak

- **Both statute measurements are samples of 49 Acts, not of 849.** The
  re-resolution rewrote 46 `source_url` rows; the other 799 statutes still carry
  a `www.indiacode.nic.in` handle and were not touched, tested or counted. 845
  of 849 rows carry the dead host, so the corpus-wide figure is almost certainly
  the same story — but _almost certainly_ is not measured, and this round does
  not claim it.
- **`EXACT_MATCH` on `actIdentity` means the act number and year agree.** It
  does not mean the text we hold is the text upstream serves. This measurement
  never compared a single character of statutory text.
- **The three State reproductions are not resolved, only labelled.** CrPC, IPC
  and the Indian Evidence Act resolve to Chhattisgarh and Chandigarh copies. I
  did not search for their CENTRAL items; `n2-act-acquire.mts` already records
  that CrPC is filed under State collections upstream, and re-litigating that is
  outside this round's bound.
- **The commencement dimension compares enactment dates only.** The source
  publishes no commencement or enforcement field, so our `enforcement_date` —
  including the 2024-07-01 dates on BNS, BNSS and BSA — is unchecked by this
  round, not confirmed by it.
- **The citing-window census is corroboration, not the report.** 158 windows
  across 17 courts naming _Ravi Prakash Gupta_ is strong and is not the printed
  page at (2010) 7 SCC 626.
- **The R15 falsifier is a sample of 3,600 on a population of 6,051,882.** An
  in-sample zero bounds the false-pin rate near 1e-3, not at zero.
- **The case finding is a corpus-shape measurement, not a query measurement.**
  1.95% is of key-bearing judgments in a 4,000-row md5 sample; it is not the rate
  at which an advocate would meet the defect, and I did not measure that.
- **Upper-casing a head is a proxy for case-insensitive matching, not the same
  thing.** It can in principle create a match the real fix would not, so 20.7%
  and 1.95% are upper bounds on what case alone costs.
- **The `AMBIGUOUS` path is thinly exercised in this round.** The self-reference
  branch now answers 386 of the 400 `E_MULTI_DISTINCT_CASE` rows, so the
  false-unique generator stratum tested `AMBIGUOUS` on 14 rows, not 400.
- **No apply candidate was frozen**, so nothing in this round binds rows, and the
  6.05M-reference sweep that would produce one has not been run against the
  current resolver.
- **The Bombay 2026-08 refusal rate is one month.** Three months of movement is
  a trend; one month at 64.1% is a reading.
- **`n2-hc-parity-matrix.mts` and the freshness decomposition were run, not
  re-derived.** Their method is the method they already had.

---

## FINAL

```
HEAD_START                          6f0d96bf
HEAD_FINAL                          a8f97ba6
COMMITS                             08baae98  statute follow-up + human-review
                                              packet + founder-queue entry
                                    a8f97ba6  R15 independent falsifier
                                    NEW2-owned only; services/api/** untouched
BUS                                 1637 -> LCC   (NEW2-R15-F1)
                                    1638-1642     (round, all lanes)

CONTINUOUS_INGESTION_HEALTH         HEALTHY
                                    daily delta 30 Aug 18:00 local, result 0,
                                    next 31 Aug 18:00; newest row 30 Aug 14:05Z
                                    HC parity 98.833% held, 100% accounted,
                                    0 actionable, 0 never-attempted
                                    HC freshness LOCAL_INGEST_BEHIND (mid-month)
                                    SC freshness BOTH (upstream thin AND behind)
                                    Allahabad absence is upstream, held 100%
                                    Bombay 2026-08 at 64.1% held — carried

DEAD_HANDLES_ATTEMPTED              25   (+ 24 controls, 49 total)
MOVED_OFFICIAL_HANDLE               25   (controls: 21; total applied 46)
SOURCE_CURRENTLY_UNAVAILABLE        0
WRONG_IDENTITY                      0
DUPLICATE_SOURCE_ENTRY              0
UNKNOWN                             0
HANDLE_STILL_CURRENT                0    (controls: 3, all State reproductions)

STATUTE_FOLLOWUP_SAMPLE             49 Acts · 245 dimension checks
STATUTE_EXACT                       98   (frozen R14: 46)
STATUTE_STALE                       0    (frozen R14: 0)
STATUTE_UNKNOWN                     147  (frozen R14: 74) — exactly 49 x 3
                                         structurally untestable dimensions
STATUTE_SOURCE_UNAVAILABLE          0    (frozen R14: 125)
STATUTE_MATERIAL_TEMPORAL_ERRORS    0

HUMAN_REVIEW_CITATION               (2010) 7 SCC 626
HUMAN_REVIEW_STATE                  HUMAN_REVIEW_REQUIRED

LCC_GATE_OBSERVED                   COMMITTED at bd2aa74a, verified current
                                    (untracked when first read at 125b8345;
                                    LCC committed it mid-round)
CITATION_RETEST_STATE               RETESTED_INDEPENDENTLY

NEW_APPLY_POPULATION_ID             NEW2-R15-PKG-48be7a6f42282d6d
                                    3,600 sampled of 6,051,882 scanned;
                                    254 rows (7.06%) shared with R14
FALSE_PIN                           0
FALSE_UNIQUE                        0
AMBIGUOUS                           411
UNTESTABLE                          0

  self-edge class                   PASS   (1,917 refused at source)
  aliases                           PASS   (structural: never AMBIGUOUS)
  cross-court collisions            PASS   (396 AMBIGUOUS, 0 pinned)
  prediction-blind positives        PASS   (0 of 472 contradicted)
  prediction-blind negatives        PASS   (400 + 400, 0 pins)
  connected matter / common order   NOT PASSED

NEW2-R15-F1                         the cohort gate matches matter numbers
                                    UPPER CASE ONLY while matching the
                                    connector case-insensitively, so a
                                    title-case common order yields
                                    connector=WITH, declaredMatters=0, and
                                    passes as unique. 472 of 472 gate
                                    evaluations saw zero matters. 1.95% of
                                    key-bearing judgments carry a joined
                                    cohort it cannot see. LCC's to fix.

CITATION_BULK_APPLY                 HOLD
                                    no apply candidate frozen, nothing bound

REPEAL_COLUMN_SCHEMA_REQUIRED       NO — request RETRACTED
LCC_SCHEMA_HANDOFF                  NONE SENT (observation only, section 5)

BLOCKERS                            none for this lane.
                                    NEW2-R15-F1 is LCC's to fix; bulk apply
                                    stays HOLD until it is and a further
                                    independent round clears the class.
                                    (2010) 7 SCC 626 needs a human with the
                                    report — queued as FQ-CITE-2010-7-SCC-626,
                                    not blocking.
```
