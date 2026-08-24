# NEW2 NEXT ROUND — BOARD

**Lane:** NEW2 (data truth / provenance / corpus quality) · **Round:**
`LAWMIND_NEXT_ROUND_MASTER_ORCHESTRATION_PLAN_2026-08-23.md` §8
**Session:** `f210633e` · lease `.agents/leases/NEW2.json` · **Started 23 Aug 2026**

Status vocabulary: **DONE** = deliverable written and every number observed ·
**RUNNING** = executing now · **QUEUED** = not started · **BLOCKED** = outside
this lane.

---

## Board

| # | task | status | evidence |
| --- | --- | --- | --- |
| 0 | **Acquire exclusive NEW2 lease** | **DONE** | prior owner's 3 registry pids absent from `Win32_Process`, newest NEW2 log 23h stale → safe takeover |
| 1 | **Treatment provenance program** (P0) | **DONE** | `TREATMENT_PROVENANCE_DECISION_INPUT_V1.md` · commit `a9bea22` |
| 2 | **Resolver false-unique / collision truth** (P0) | **DONE** | `RESOLVER_FALSE_UNIQUE_AUDIT_V1.md` · commit `a819dca` |
| 3 | **Body-text evidence state** (P0/P1) | **DONE** | `BODY_TEXT_EVIDENCE_STATE_V1.md` · commit `c4fe3f0` |
| 4 | **Uncited substantive authority study V2** (P0/P1) | **DONE** | `UNCITED_SUBSTANTIVE_AUTHORITY_STUDY_V2.md` · commit `a874ab5` |
| 5 | **Historical treatment-regex correction** (P1) | **DONE** | 19 rows corrected, 0 badges moved · commit `be04734` |
| 6 | India Code official old-code acquisition | **DIAGNOSIS CHANGED** | root 200, listing **404 not 504** — the site moved, our URL builder is stale. Two requests only · commit `95baa5d` |
| 7 | eCourts | **NO TRAFFIC** | §8/NEW2-7. Not touched |
| 8 | HC classifier / targeted OCR | **NOT RESUMED** | background only; the box carried 2–13 concurrent queries all session |
| 9 | Bus messages to LCC / NEW1 / NEW3 | **DONE** | seq 1097–1103 |
| 10 | `CURRENT_PLAN.md` update + §16 report | **RUNNING** | last |

### Carried forward, for whoever holds this lane next

| what | why it is not done |
| --- | --- |
| **Re-derive India Code's browse path** | bounded engineering, one session. The 404 says the path moved; §8 forbids hammering and forbids inventing mappings, so it was left rather than hunted |
| **`modality` on treatment claims** | the 1985 dissent proves the mood of the verb is load-bearing and nothing records it. Needs the majority judgment read as primary evidence |
| **14 pins into different-document groups** | 11 `followed`, 3 `distinguished`, named by id. Hand adjudication, not a batch |
| **The 4 `dis-approved` rows' true treatment** | withdrawn to `cites`, which understates. Our vocabulary has no `disapproved` |
| **A second reader for the 140 labels** | one adjudicator, no inter-rater figure. Every label carries its reason so a second reader can disagree specifically |

---

## What each finished task actually concluded

### 1 · Treatment provenance — **the answer is 5**

All 16,001 treated edges classified, not sampled. All 137 edges that drive a
**LAW MOVED** badge **hand-read**, not screened.

| | |
| --- | ---: |
| driving edges that are law-reporter editorial apparatus | **131 = 95.62%** |
| driving edges that are the court's own words | **5 = 3.65%** |
| a 1985 **dissent describing a proposal** to overrule, stored as a holding | **1** |
| judgments rendering LAW MOVED (+6 Test Court fixtures) | **98** |
| **badges surviving if reporter evidence may not promote** | **5** |

Enforcement: five production surfaces promote on a bare `relationship IN (...)`,
and `judgment_citations` has **no provenance column**, so none of them could
filter even if it wanted to. `OFFICIAL_REGISTRY_STATUS` has no source —
`ecourts_observation` holds 0 rows.

New defect class found by reading: **MODALITY**. Polarity is the wrong verb;
modality is the right verb in the wrong mood, and `MARKER_RE` guards neither.

### 2 · Resolver — **materially unsafe rate is 0, and the cause is a stale index**

First grading of `citation-resolver-v0.1` against truth set v2 (283 records, 201
adjudicated).

| | |
| --- | ---: |
| false unique, any severity | **10 / 64 = 15.63%** [8.71, 26.43] |
| **materially unsafe** | **0 / 64 = 0.00%** [0.00, 5.66] |
| non-citations wrongly resolved | 0 of 40 |
| **adverse treatments sitting on a collision** | **0 of 137** |

Every false unique and all 24 recall misses share one cause: the resolver counts
candidates in `judgment_citation_keys` alone, and that index is **309,130
neutral citations behind its own cursor since 17 August**. 33,013 of 155,388
shared-neutral groups collapse to a false UNIQUE; **re-running the existing
builder repairs 33,001 and leaves 0 of the different-document class.**

`citation_concordance_resolutions` is 156 `gold_eval` rows, all unvalidated, and
no production writer reads it. **No backfill approved.**

### 3 · Body text — **no rescan needed, but not by the cursor offered**

| | |
| --- | ---: |
| checkpoint says screened | **18,698,968** |
| created before the run started | **18,698,968** |
| created after the run | 16 |
| **of those 16, sitting below the id cursor** | **16 of 16** |

The count reconciles exactly, so the import is arithmetic — but the id cursor
would certify 100% of the rows created since as screened. The watermark must be
`created_at`, and the run table therefore does not carry the cursor at all.
`body_text_evidence` then reads `SCREENED_NO_DAMAGE_FOUND` 16,906,647 and
`NEVER_SCREENED` **16**, with damage refusal unchanged at 1,792,321 either side.

### 4 · Uncited authority — **the control is the finding**

| | n | substantive | rate |
| --- | ---: | ---: | ---: |
| RESIDUAL_NO_NEGATIVE_MARKER (refused) | 60 | 4 | 6.67% |
| MARKER_CARRYING (refused) | 40 | **0** | 0.00% |
| **CONTROL, ABOVE the gate** | 40 | 3 | **7.50%** |

Weighted refused population **2.87%** [0.15, 5.58], NEW1's estimator, never
pooled. **What LawMind already admits scores the same as what it refuses** — both
about 93% procedural. The discriminator is the marker stratum, not the length.
Still no classifier: 7 positives in 180 refused documents against the ~62
precision needs.

### 5 · Treatment correction — **19 rows, 0 badges moved**

`MARKER_RE`'s bare dash matched a hyphen inside a word: `dis-approved`,
**`contra-distinguished`**, `"un- doubted"`, `"deci- sions"`. Withdrawn to
`cites`, the value both current writers return. `overruled` 117 and
`overruled_in_part` 23 unchanged.

---

## Corrections this session made to its own work

Recorded here because a lane that only reports its wins is not reporting.

1. **The 90-of-91 concordance alarm was co-occurrence, not causation.** Asking
   whether a model-selected candidate appears as a pin *anywhere* answers 90/91
   and means nothing — popular judgments are cited by many. The causal question
   (pinned *on the same citation key*) answers 30, and the writer that made those
   30 is deterministic and never reads the table.
2. **The provenance screen's `UNKNOWN` was not absence of signal.** Hand-reading
   all 42 showed 38 are under-detected reporter apparatus. The error is
   one-directional and makes the finding worse, not better.
3. **I nearly scored the control looser than the treatment group.** Adjudicating
   the uncited study I first marked a control document substantive whose shape I
   had already marked *procedural* in the refused set. Uncorrected, the control
   would have read **30%** against 6.67% and produced the opposite headline. A
   control scored more loosely than the treatment group is worse than no control,
   and the error always flatters whichever group was read second.
4. **The re-derivation nearly deleted 1,624 real treatment claims.** Diffing
   against `detectTreatment` alone reported 1,680 rows "wrong". There are **two**
   treatment writers with different vocabularies — `detectTreatment`
   (`citations.ts`, narrow) and `readTreatment` (`treatment.ts`, wide, run by
   `citator-cli.ts` on resolved edges). Against both, the disagreement is **19**.
   A single-writer diff is not evidence.

---

## Not done, and deliberately

- **Exactly one corpus mutation, 19 rows.** The hyphen-inside-a-word withdrawals,
  measured for badge impact first and re-asserted in the UPDATE's own WHERE
  clause, 0 badges moved, prior values preserved by edge id. **No backfill, no
  treatment rewrite, no resolver apply, no `quality_screen_runs` import.**
- **No classifier built** on the uncited-authority question — §8 forbids it until
  there are enough positives to measure precision, and there are not.
- **No eligibility threshold changed.** That is NEW1's gate.
- **`followed` / `distinguished` provenance at scale** — 15,776 of 16,001 edges,
  driving no badge, not hand-read.
- **Recall of the treatment extractor** — how many real overrulings the corpus
  contains that we never extracted is not measurable from what we hold.
