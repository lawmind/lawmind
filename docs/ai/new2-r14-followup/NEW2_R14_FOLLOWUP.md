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

## 7 · LCC citation gate — WAITING_FOR_LCC, and why the code being present is not the gate landing

Read once, at the end of the round, at HEAD `125b8345`.

The gate is **written**. `services/api/src/citations/cohort.ts` exists,
`resolver.ts` imports `cohortVerdict` and `declaredCohort` and refuses a UNIQUE
where the cohort is not `UNIQUE_NOT_REFUTED`, tests sit beside it, and
`docs/ai/lcc-r15/` carries a measurement dated 31 August 2026.

**None of it is committed.**

```
?? services/api/src/citations/cohort.ts
?? services/api/src/citations/cohort.test.ts
?? services/api/src/citations/resolver-cohort.test.ts
?? docs/ai/lcc-r15/
 M services/api/src/citations/resolver.ts
 M services/api/src/citations/resolver-dryrun-cli.ts
```

`git ls-files` returns nothing for any of them. They exist in this shared
worktree and in no clone of this repository.

So `CITATION_RETEST_STATE = WAITING_FOR_LCC`, and bulk apply stays on HOLD. I am
not running the independent falsifier yet, for two reasons that are about
evidence rather than about process:

1. **A falsifier run against an uncommitted working tree measures nothing
   durable.** The result would name a resolver version no one else can check
   out, and a verdict that cannot be reproduced is not a falsifier result. This
   lane has already paid for that lesson in the other direction — a coupled set
   committed one file at a time is green in the worktree and red in a clone.
2. **The files can change under a run in progress.** LCC owns them and is
   working in the same tree. A falsifier whose subject is edited mid-run
   produces a number attached to nothing.

What I did NOT do: read those files and form a view on whether the gate is
correct. That would be inheriting LCC's claim by another route. When the commit
lands, the falsifier is run against the committed hash, with a NEW population
identity, and neither frozen R14 candidate is overwritten.

`services/api/**` is outside this lane's write set, so the files are left
exactly as found — nothing staged, nothing committed, nothing moved.

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
- **The LCC gate was not read for correctness.** Its presence and its
  uncommitted state are facts about the working tree; whether the cohort logic is
  right is untested by this lane and will stay untested until there is a commit
  to test.
- **The Bombay 2026-08 refusal rate is one month.** Three months of movement is
  a trend; one month at 64.1% is a reading.
- **`n2-hc-parity-matrix.mts` and the freshness decomposition were run, not
  re-derived.** Their method is the method they already had.

---

## FINAL

```
HEAD_START                          6f0d96bf
HEAD_FINAL                          (see the commit that lands this file)
COMMITS                             NEW2-owned only; services/api/** untouched

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

LCC_GATE_OBSERVED                   WRITTEN_BUT_UNCOMMITTED
                                    cohort.ts + 2 test files untracked;
                                    resolver.ts modified, not committed
CITATION_RETEST_STATE               WAITING_FOR_LCC

NEW_APPLY_POPULATION_ID             NOT_CREATED — no committed gate to test
FALSE_PIN                           NOT_RUN
FALSE_UNIQUE                        NOT_RUN
AMBIGUOUS                           NOT_RUN
UNTESTABLE                          NOT_RUN

CITATION_BULK_APPLY                 HOLD

REPEAL_COLUMN_SCHEMA_REQUIRED       NO — request RETRACTED
LCC_SCHEMA_HANDOFF                  NONE SENT (observation only, section 5)

BLOCKERS                            none for this lane.
                                    Waiting on LCC to commit the cohort gate.
                                    (2010) 7 SCC 626 needs a human with the
                                    report — queued, not blocking.
```
