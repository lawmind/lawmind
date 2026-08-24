# NEW1 — LIVE STATUS

Updated 2026-08-24T15:30Z · lane lease held by session `22730754` ·
`node scripts/lane-lease.mjs status NEW1`

| # | task (§7) | state | evidence |
| --- | --- | --- | --- |
| NEW1-0 | lane lease + live-state inspection | ✅ **DONE** | lease `NEW1: FREE` → ACQUIRED; one keeper, one sidecar, **walk was dead 4h** |
| NEW1-6 | keeper relaunch reliability | ✅ **DONE** | mechanism measured, fixed, **2 verified relaunches**, row delta 1,097,864 → 1,098,028 |
| NEW1-5 | eligibility sampling frame for NEW2 | ✅ **DONE** | 21,416 rows censused; **0 Supreme Court**, 73.6% unclassified; 580 ids drawn; bus 1081 |
| NEW1-3 | long-fact validation on posed queries | ✅ **DONE** | **0/6 every arm, every size**; coverage wall 2 of 19 targets; bus 1083/1084 |
| NEW1-1 | posed-query representation experiment | 🔄 **RUNNING** | `rep:lab3` ~4,400 / 19,932 documents · ETA ≈ 2.5 h |
| NEW1-2 | cheapest HC passage sensitivity | ⏳ **BLOCKED on NEW1-1** | answered by arm B vs arm F in the same run; cost model in progress |
| NEW1-4 | no reranker before reachability | ✅ **HELD** | nothing started; three measurements agree the constraint is upstream |
| NEW1-7 | 1M halfvec checkpoint | ⏸ **DEFERRED** | the brief orders it after P0; quiet window spent on NEW1-1 |
| NEW1-8 | clean-box ADVOCATE rerun | ⏳ **after architecture selection** | by design |

## Deliverables (§15)

| file | state |
| --- | --- |
| `NEW1_NEXT_ROUND_TODO.md` | ✅ written |
| `KEEPER_RELAUNCH_PROOF.md` | ✅ written |
| `ELIGIBILITY_SAMPLING_FRAME.md` | ✅ written |
| `LONG_FACT_VALIDATION_V2.md` | ✅ written |
| `SEMANTIC_REPRESENTATION_DECISION_V3.md` | ⏳ waits on the run |
| `HC_PASSAGE_COVERAGE_EXPERIMENT.md` | ⏳ waits on the run |
| halfvec artefact | ⏸ deferred, refusal recorded |

## Commits so far

- `adf1e49` keeper fix + V2 hard-negative defect + V3 instrument
- `6cf2bce` round todo, keeper proof, `PROOF`-unreachable finding (bus 1079/1080/1081)
- `e12ab25` long-fact posed validation
- `4e1d0b3` bus messages 1083/1084

## Findings sent to other lanes

| bus | to | what |
| ---: | --- | --- |
| 1079 | LCC | `text_safety_grade='PROOF'` unreachable — view tests an **empty array** |
| 1080 | NEW2 | same, and it collapses `PROVEN_DAMAGED` into `SCREENED` |
| 1081 | NEW2 | the sampling frame + the estimator they must use |
| 1083 | LCC | long-fact contract's evidence was lifted queries; posed scores 0/6 |
| 1084 | NEW3 | do not put fact-pattern search in launch copy — here is the number |

## Two corrections to things this repo believed

1. **The brief's premise for NEW1-1 is wrong.** V2 already used posed advocate
   queries (leakage ≤ 6 shared words, max observed 5). The lifted gold is a
   different set of files, and it is what `LONG_FACT_SEARCH_CONTRACT_V1` rests on.
2. **V2 drew ZERO hard negatives.** `SET LOCAL …; SELECT …` with bound parameters
   is a prepared statement and PostgreSQL refuses multiple commands in one. Every
   call threw and every throw was swallowed. Its pool was random fill alone.

## Background state

- Tier-A walk **deliberately paused** (`.agents/logs/new1-walk.pause`), reason
  recorded, keeper observed honouring it. **Resume by deleting that file.**
- GPU sidecar healthy, serving `rep:lab3` alone.
