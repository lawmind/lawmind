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
| 4 | **Uncited substantive authority study V2** (P0/P1) | **RUNNING** | 140 documents drawn from NEW1's stratified frame + a new above-gate control; adjudication in progress |
| 5 | **Historical treatment-regex correction** (P1) | **RUNNING** | all 16,001 re-derived against BOTH writers; 19 rows isolated, badge-impact check clear, apply decision pending |
| 6 | India Code official old-code acquisition | **BLOCKED** | service returning 504; `FQ-INDIACODE-AVAILABILITY`. Do not hammer it |
| 7 | eCourts | **NO TRAFFIC** | §8/NEW2-7. Not touched |
| 8 | HC classifier / targeted OCR | **NOT RESUMED** | background only, and the box has had 2–13 concurrent queries all session |
| 9 | Bus messages to LCC / NEW1 / NEW3 | **QUEUED** | after 4 and 5 land |
| 10 | `CURRENT_PLAN.md` update + §16 report | **QUEUED** | last |

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
3. **The re-derivation nearly deleted 1,624 real treatment claims.** Diffing
   against `detectTreatment` alone reported 1,680 rows "wrong". There are **two**
   treatment writers with different vocabularies — `detectTreatment`
   (`citations.ts`, narrow) and `readTreatment` (`treatment.ts`, wide, run by
   `citator-cli.ts` on resolved edges). Against both, the disagreement is **19**.
   A single-writer diff is not evidence.

---

## Not done, and deliberately

- **No corpus mutation of any kind so far.** No backfill, no treatment rewrite,
  no resolver apply, no `quality_screen_runs` import.
- **No classifier built** on the uncited-authority question — §8 forbids it until
  there are enough positives to measure precision, and there are not.
- **No eligibility threshold changed.** That is NEW1's gate.
- **`followed` / `distinguished` provenance at scale** — 15,776 of 16,001 edges,
  driving no badge, not hand-read.
- **Recall of the treatment extractor** — how many real overrulings the corpus
  contains that we never extracted is not measurable from what we hold.
