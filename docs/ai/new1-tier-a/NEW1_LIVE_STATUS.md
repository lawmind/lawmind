# NEW1 — LIVE STATUS

Updated 2026-08-24T16:35Z · lane lease held by session `22730754` ·
`node scripts/lane-lease.mjs status NEW1`

| # | task (§7) | state | evidence |
| --- | --- | --- | --- |
| NEW1-0 | lane lease + live-state inspection | ✅ **DONE** | `NEW1: FREE` → ACQUIRED; one keeper, one sidecar, **walk was dead 4 h** |
| NEW1-6 | keeper relaunch reliability | ✅ **DONE** | cause measured, fixed, **3 verified relaunches**, **+655,099 vectors unattended** |
| NEW1-5 | eligibility sampling frame for NEW2 | ✅ **DONE** | 21,416 censused; **0 Supreme Court**; 73.6% unclassified; 580 ids drawn |
| NEW1-3 | long-fact validation, posed queries | ✅ **DONE** | **0/6 every arm, every size**; coverage wall 2 of 19 targets |
| NEW1-1 | posed-query representation experiment | ✅ **DONE** | **F 37.8% vs production 2.2%**; V2's answer refuted |
| NEW1-2 | cheapest HC passage sensitivity | ✅ **DONE** | build F: **18 GPU-days, 61 GB** — not 50+/100+ |
| NEW1-4 | no reranker before reachability | ✅ **HELD** | none started; first evidence the bar *might* be met, not acted on |
| NEW1-7 | 1M halfvec checkpoint | ⏸ **DEFERRED** | brief orders it after P0; refusal recorded |
| NEW1-8 | clean-box ADVOCATE rerun | ⏳ **after architecture selection** | by design |

## Deliverables (§15) — all written

| file | state |
| --- | --- |
| `NEW1_NEXT_ROUND_TODO.md` | ✅ |
| `SEMANTIC_REPRESENTATION_DECISION_V3.md` | ✅ |
| `HC_PASSAGE_COVERAGE_EXPERIMENT.md` | ✅ |
| `LONG_FACT_VALIDATION_V2.md` | ✅ |
| `ELIGIBILITY_SAMPLING_FRAME.md` | ✅ |
| `KEEPER_RELAUNCH_PROOF.md` | ✅ |
| halfvec artefact | ⏸ deferred, refusal recorded |

## The headline

| representation | vec/doc | posed s@5 | recall@500 | GPU-days | halfvec |
| --- | ---: | ---: | ---: | ---: | ---: |
| **A HEAD:4800 — staged today** | 1.00 | **2.2%** | 35.6% | 11.7 | 18 GB |
| B POOLED_ALL | 1.00 | 17.8% | **95.6%** | 18.0 | 18 GB |
| D MULTI_3 | 3.00 | 28.9% | 80.0% | 18.0 | 54 GB |
| **F ALL_CHUNKS** | 3.39 | **37.8%** | 91.1% | 18.0 | **61 GB** |

B, D and F cost the **same** GPU time — a pooled vector *is* the mean of the
chunk vectors. The decision is **+6.3 GPU-days and +43 GB** over the head-only
walk already running, for **2.2% → 37.8%**.

## Four things this repo believed that are now measured otherwise

1. **The brief's premise for NEW1-1 was wrong.** V2 already used posed advocate
   queries — leakage guard ≤ 6 shared words, max observed 5.
2. **V2 drew ZERO hard negatives.** `SET LOCAL …; SELECT …` with bound
   parameters is a prepared statement; Postgres refuses multiple commands in
   one. Every call threw, every throw was swallowed. Same arm, same tasks, same
   pool size: B falls **73.3% → 24.4%**.
3. **"More vectors per document is not the lever" is reversed.** D beats B
   everywhere; F beats both; the passage arms decay *slowest* with pool growth.
4. **The passage build was never 40–45M vectors.** Measured **3.392 chunks per
   document**, so 30.0M vectors and 61 GB.

## Findings sent to other lanes

| bus | to | what |
| ---: | --- | --- |
| 1079 | LCC | `text_safety_grade='PROOF'` unreachable — the view tests an **empty array** |
| 1080 | NEW2 | same; it collapses `PROVEN_DAMAGED` into `SCREENED` |
| 1081 | NEW2 | the sampling frame and the estimator they must use |
| 1083 | LCC | long-fact contract rests on lifted queries; posed scores 0/6 |
| 1084 | NEW3 | do not put fact-pattern search in launch copy |
| 1088 | LCC | the representation decision, and my own bus 1061 corrected |
| 1089 | NEW3 | ceiling moved 2.2% → 37.8%, but keep semantic hidden |
| 1090 | NEW2 | a whole-document recipe makes their damage screens load-bearing |

## Background state

- Tier-A walk **running**, relaunch VERIFIED 16:33:00Z, pause released.
- `new1_doc_vector_stage` = **1,753,127** rows.
- GPU sidecar healthy under the keeper (Task Scheduler lineage).

## Open, and not mine to close

- **`adverse_authority` 0/4 and `statute` 0/3 for every arm.** Not diagnosed.
- **8 of 20 posed targets have no production vector at all.** Coverage, not
  ranking.
- **The reboot-to-keeper gap of 1 h 58 min** on 24 Aug is unexplained and is a
  durability question of its own.
