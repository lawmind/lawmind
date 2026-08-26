# NEW1 — R8.1 REMAINING (live)

Audited against the original kickoff prompt, 26 Aug 03:50Z. **All four NEW1-owned items closed 04:05Z.** What remains is blocked on another lane.

## Delivered (verified)

- [x] Read R8.1 lock + `R7_FINAL_RUN_RUNBOOK.md`
- [x] Publish `START_STATE_R8_1`
- [x] HEAD walk NOT resumed
- [x] Embeddings complete — 418,116 passages / 81,720 docs
- [x] HNSW rebuilt on the complete table — 224.6 s, params + resources recorded
- [x] 295-task four-arm eval, exact-vs-ANN
- [x] Common-query benchmark re-run on the final index
- [x] Query shapes reported separately — 11 families, no aggregate above them
- [x] Preregistered dev abstention run unchanged
- [x] Long-input policy declared, no silent truncation
- [x] Retrieval candidate + abstention frozen
- [x] `chunk.ts` untouched
- [x] Segmentation-V2 experiment designed, not run
- [x] `GIT_COMMIT` used, no self-allocated migrations
- [x] `HEAVY_BOX` explicitly released, LCC/NEW2/FIFTH notified

## Open — mine

- [x] **T1 CLOSED** Verify the eval's query-length distribution actually covers the ≤500
      supported band. §6.6 says measure only where product intends support; if the
      295 tasks are all ≤500 the band is measured, and if they are not I have a gap
      I have been describing as closed.
- [x] **T2 CLOSED** Update artifacts with NEW2's actual-tranche role numbers (bus 1282).
      `REPORTER_EDITORIAL` is **1.57%**, not the 0.10% my caveats quote, and
      **24.40%** of tranche passages must never be shown as the court's own
      reasoning. My blocking caveat is now partly ANSWERED at pool level and my
      documents are stale.
- [x] **T3 CLOSED** Check whether anything of mine treats `text_chars` as a position.
      NEW2 found `text_chars` and `body_length` diverge by ~242 on every last
      chunk, because the chunk text carries a join separator the source never had.
- [x] **T4 CLOSED** Acknowledge NEW2 1282/1286 — the top-k window they need, and their
      recorded prediction that top-k carries MORE party submission than the pool.

## Open — blocked on another lane, not mine to close

- [ ] **§6.5 short-English/posed-query validity against Gold V3.** Gold V3 does not
      exist. FIFTH's 1256/1258/1264 put Gold V2 blockers on NEW2. `BLOCKED`.

## Process shortfall — cannot be retroactively fixed, stated rather than hidden

- **§3 15-minute durable-output reporting had a 5.5-hour gap**, 20:06Z → 01:37Z.
  The lease heartbeat stopped when the supervising session died; the *work*
  continued and NEW2 read it independently, which is the only reason the gap was
  visible at all. The keeper now covers the job; nothing yet covers the reporting.

## Closing results

- **T1** found a defect rather than confirming a claim. 288 of 295 tasks are inside
  production's 500-character bound, so the band *is* covered — but the 7 outside it score
  **0.8571** against **0.3715** for the rest, and they concentrate in **3 of 3
  `long_narrative`** and **2 of 3 `pasted_passage`**, two of the three best-scoring
  families. **The production-route figure is 0.3715, not 0.3831.** This is FIFTH's bus 1264
  reproducing inside my own benchmark.
- **T2** NEW2's bus 1282 replaced my caveat with a measurement on this exact tranche:
  `REPORTER_EDITORIAL` **1.57%** where I was carrying 0.10%, **24.40% unsafe in total**,
  and `COURT_REASONING` at **1.15%** — the thing an advocate wants is about one passage in
  ninety. Propagated to all three artifacts. Top-k remains `NOT_MEASURED`.
- **T3** clean. Every read path of mine uses `char_offset` + `body_length`, the correct
  span pair. `text_chars` appears only as an insert-time write, never as a position, so
  NEW2's ~242-character divergence does not reach any evidence path of mine.
- **T4** sent as bus 1298–1300, with NEW2's top-k prediction recorded from my side so it
  counts as preregistered from both lanes.
