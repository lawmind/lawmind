# NEW2 — LAUNCH CONVERGENCE SPRINT BOARD

**Lane:** NEW2 · data truth / provenance / ingestion quality
**Round:** `LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2_OWNERSHIP_CORRECTED_2026-08-25.md` §8
**Session:** `37711162` · lease `.agents/leases/NEW2.json` acquired 25 Aug 2026
**Supersedes as the live board:** `NEW2_NEXT_ROUND_TODO.md` (23 Aug round — its
"carried forward" table is folded in below as N2-8…N2-12)

Status vocabulary: **DONE** = deliverable written and every number OBSERVED ·
**RUNNING** = executing now · **QUEUED** = not started · **BLOCKED** = outside
this lane (bus or founder).

**Mission in one line:** when NEW1 retrieves far more passages, that must mean
*more good law* — not more procedural orders, party submissions, headnotes, OCR
garbage, or false treatment.

---

## Board

| # | task | pri | status | acceptance (what makes it DONE) |
| --- | --- | --- | --- | --- |
| **N2-0** | Acquire NEW2 lease; declare resource posture; do not disturb NEW1's tranche | P0 | **DONE** | lease held by `37711162`; zero NEW2 jobs running (bus 1113); quiet-window answer already given to LCC |
| **N2-1** | **Treatment provenance CONSUMER CONTRACT** for LCC-3 | P0 | **DONE** | `TREATMENT_PROVENANCE_CONSUMER_CONTRACT_V1.md` + machine-readable twin: 8 states × 7 cells. Headline: **72 of 76 add-to-matter refusals rest on a headnote alone**. Bus 1144 (LCC) · 1145 (NEW3 copy) · 1146 (RCC render) |
| **N2-1b** | Re-adjudicate the MODALITY_DEFECT edge and its near variants | P0 | **QUEUED** | the 1985 dissent re-read against the **majority** judgment as primary evidence; variant scan over the treated-edge population; verdicts published, no mass rewrite |
| **N2-1c** | Populate/repair `judgment_citations.treatment_provenance` (0082) where the contract changes a verdict | P0 | **QUEUED** | delta measured **before** apply; badge impact stated; `NULL` ≠ `UNKNOWN` preserved |
| **N2-2** | **Resolver freshness truth** — publish the acceptance test LCC left to me | P0 | **DONE** | collapses 33,013 → 99 (99.70%, predicted 99.96%); residual is a FLOW not a leftover; false-unique 15.63% → 0.00%; published bus 1112 |
| **N2-2b** | Replay the risky strata after key catch-up | P0 | **QUEUED** | INSC conservative misses · Allahabad shared serials · LKO/AUR · Madras stamps · OCR damage · NOT_A_CITATION · connected/common orders · shared neutral citations — each replayed, each recorded |
| **N2-2c** | Reconcile LCC's despatch-stamp fix (bus 1116) — the test LCC asked me to run | P0 | **DONE** | `FALSE_RESOLVE_NON_CITATION` 30 → **0**, `CORRECT_REJECTED_NON_CITATION` 10 → **40**, material false-unique **0/54**; corpus stamp keys 431 → **0**, UNIQUE-resolving stamps 75 → **0**. Bus 1136 |
| **N2-2e** | **Misspelled-month despatch stamps pass LCC's gate** — found while reconciling 1116 | P0 | **REPORTED** | corpus token census: 442 stamp judgments, gate refuses 431, **11 pass** (`JANURARY` 9 · `ARPIL` 1 · `SEPTEMEBER` 1). **`2011:ARPIL:05` is indexed today and resolves UNIQUE.** Fix is LCC's (`PLACEHOLDER_PATTERNS` + builder + re-run their purge). Bus 1136 |
| **N2-2f** | **293 real neutral citations stranded in 9 never-walked ingest batches** | P0 | **QUEUED** | shortfall is 734 not 163: 439 stamps correctly unkeyed + 293 unwalked + **0** lag. My id-watermark hypothesis was FALSIFIED (`batch_never_walked_at_all` 303/303). Builder is `services/ingest` ⇒ mine; cause not yet diagnosed |
| **N2-2d** | Define the **continuous** freshness gate with LCC (key frontier · lag rows · lag time · freshness time · last replay) | P0 | **QUEUED** | numeric safe bound proposed; resolver enrichment fails **closed/qualified** past it; agreed on bus, not applied unilaterally |
| **N2-3** | **`quality_screen_runs` migration + import** — make completed screen state queryable without rescanning 18.7M rows | P0 | **QUEUED** | migration `0083` announced on the bus **before** apply (DB_MIGRATION); run-level table per `BODY_TEXT_EVIDENCE_STATE_V1` §4.1; watermark is `created_at < started_at`, cursor deliberately absent |
| **N2-3b** | Expose `PROVEN_DAMAGED` / `SCREENED_NO_DAMAGE_FOUND` / `NEVER_SCREENED` | P0 | **QUEUED** | view expression ships **before** import (empty table ⇒ everything reads NEVER_SCREENED, so the contract can only get more generous); documents created after a completed run stay NEVER_SCREENED — proven with a post-run insert |
| **N2-3c** | Never call `SCREENED_NO_DAMAGE_FOUND` "clean" | P0 | **QUEUED** | wording audited across every consumer surface and the contract doc; a grep-able assertion, not a promise |
| **N2-4** | **Passage-level role / safety study** for NEW1's validation tranche | P0 | **QUEUED** | sample from NEW1's own tranche; classify court reasoning · facts · party submission · quoted precedent · procedural history · reporter apparatus · damaged/OCR suspect · other |
| **N2-4b** | Measure the four safety questions | P0 | **QUEUED** | (a) how often passage retrieval surfaces non-authoritative text; (b) whether party submissions are semantically attractive; (c) whether reporter/headnote text contaminates candidates; (d) whether body-text safety catches damaged passages |
| **N2-4c** | **PASSAGE SAFETY / FILTER CONTRACT** to NEW1 + LCC | P0 | **QUEUED** | delivered **before** any full passage build; states explicitly that whole-document eligibility is not sufficient for passage retrieval |
| **N2-5** | **Second-adjudicator uncited-authority study** | P1 | **QUEUED** | independent pass B on below-gate residual/no-marker, the 2,000–3,000 admitted control, court-diverse HC, recent HC, and the cohorts NEW1 needs; report A · B · agreement · disagreement · resolved consensus |
| **N2-5b** | Identify a HIGH-PRECISION addable cohort — or state that none exists | P1 | **QUEUED** | the goal is precision, **not** vector count; no global gate change from weak evidence |
| **N2-6** | **Official old criminal codes** — repair the India Code route | P1 | **QUEUED** | 23 Aug diagnosis: root 200, listing **404 not 504** — the site moved, our URL builder is stale. Conservative re-derivation, two requests at a time |
| **N2-6b** | Acquire authoritative IPC 1860 / CrPC 1973 / Evidence Act 1872 | P1 | **QUEUED** | provenance · version · section · effective metadata preserved |
| **N2-6c** | Recompute old→new correspondence evidence | P1 | **QUEUED** | correspondence only. **Temporal applicability is never inferred from correspondence** |
| **N2-7** | **Own-worker health discipline** | P0 | **QUEUED** | for every worker: PID · startup mechanism · checkpoint · **real row delta** · last progress · restart count · state. Alive but no progress = `STALLED`, not RUNNING |
| **N2-8** | 14 pins into different-document groups (11 `followed`, 3 `distinguished`) | P2 | **QUEUED** | hand adjudication by id, not a batch — carried from the 23 Aug board |
| **N2-9** | The 4 `dis-approved` rows' true treatment | P2 | **QUEUED** | currently withdrawn to `cites`, which understates; our vocabulary has no `disapproved` |
| **N2-10** | A second reader for the 140 treatment labels | P2 | **QUEUED** | one adjudicator so far, no inter-rater figure; every label carries its reason so a second reader can disagree specifically |
| **N2-11** | `followed` / `distinguished` provenance at scale (15,776 of 16,001 edges) | P2 | **QUEUED** | drives no badge today; becomes load-bearing if counterargument ships |
| **N2-12** | Recall of the treatment extractor | P2 | **BLOCKED** | how many real overrulings the corpus contains that we never extracted is **not measurable from what we hold** — needs an external ground truth |
| **N2-13** | Final §16 report + `CURRENT_PLAN.md` update | P0 | **QUEUED** | last |

---

## Sequencing, and why

1. **N2-2 first, then N2-2c.** LCC closed the upstream cause (key shortfall
   309,414 → 163) and deliberately did **not** run my acceptance test, so that I
   am not marking their homework and they are not marking mine. That measurement
   is owed and it is cheap.
2. **N2-3 before N2-4.** The passage study needs a working
   `PROVEN_DAMAGED` / `SCREENED` / `NEVER_SCREENED` distinction to answer
   question (d) — whether body-text safety catches damaged *passages*. NEW1's
   bus 1090 is the reason it now matters more: the winning representation reads
   **whole documents**, so damage anywhere in a judgment costs a passage.
3. **N2-4c before any full 30M build.** That is the gate the plan actually cares
   about, and it is the one deliverable other lanes are waiting on.
4. **N2-1 in parallel** — it is reading and writing, not DB load, so it does not
   compete with NEW1's tranche.
5. **N2-6 last of the P1s.** It is network work against a third party and it is
   the only item that can stall on something outside the box.

---

## DO NOT — the round's hard bounds, restated so they cannot be lost

- no resolver mass backfill
- no destructive dedup
- no treatment mass rewrite
- no broad OCR
- no uncoordinated migration — `DB_MIGRATION` announced on the bus before apply
- no live eCourts traffic
- no relaxing corpus eligibility merely to raise coverage
- **no `UNKNOWN` → `CLEAN`**, in any direction, on any surface

Plus the ownership bound this round added: NEW2 does not touch `apps/**`
(`CLIENT_APPS` belongs to RCC) and does not race LCC on schema.

---

## Resource posture, declared

NEW2 currently runs **zero** jobs. Classifier / OCR / citation work is explicitly
**secondary** to the P0 items above and will not be started against NEW1's
decision-critical passage experiment without a bus exchange first. Any job I do
start gets a registry row with a progress invariant that is a **row delta**,
never process liveness — the failure that hid a 19.5-hour dead walker in this
very repo two days ago.
