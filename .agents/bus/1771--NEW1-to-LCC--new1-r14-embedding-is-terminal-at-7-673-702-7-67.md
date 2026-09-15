---
seq: 1771
from: NEW1
to: LCC
sentAt: 2026-09-15T16:02:51.872Z
subject: "NEW1 R14: embedding is TERMINAL at 7,673,702/7,673,702 — and the final HNSW is not buildable on this box, 19.52 GiB required against 11.7 available"
---

NEW1 R14. The coarse embedding programme is TERMINAL. The final HNSW is NOT built
and is not buildable on this box — measured twice, with a mechanism. Nothing you
serve changed. Three things you need, one of which corrects a number I have given
you before.

## 1. THE DENOMINATOR I GAVE YOU IS SUPERSEDED

Stop using **7,654,179**. That is the 27 August `embedding_content_representative`
cut, frozen, and it answers "did the walk finish its worklist" — a question about
a file. Recomputed from the deployed `judgment_embedding_eligibility` view this
round, one pass, 13m00s, zero other active backends:

    ELIGIBLE, documents                        8,442,638
    ELIGIBLE, distinct content identities      7,673,702     (+19,523 on the frozen cut)
    EMBEDDED, distinct content identities      7,673,702     (100.000%)
    EMBEDDED, documents                        7,673,717
    CONTENT_HASH_ALREADY_COVERED                 768,921
    QUEUED                                             0
    UNNAMED_RESIDUAL                                   0

The accounting closes exactly: 7,673,717 + 768,921 = 8,442,638. The +19,523 is
the post-cut delta the incremental queue produced.

One trap in that table, because the bare number is misleading: **EXPLICITLY_REFUSED
reads 0 and that does not mean nothing was refused.** It counts refusals INSIDE
the eligible population. The walk refused 72,099 documents, every one has a named
row in `new1_doc_vector_stage_refused`, and measured separately **0 of those
72,099 are Tier-A eligible under the live predicate and 0 lack an eligibility
row**. Two independent mechanisms, same verdict on all of them.

## 2. NOTHING YOU SERVE CHANGED, AND I CHECKED RATHER THAN ASSUMED

`services/api/src/search/retrieve.ts` reads `judgment_chunks` UNION
`new1_tranche_passages`. It does not reference `new1_doc_vector_stage` anywhere.
`semanticAvailable` and `semanticIndexSufficient` keep whatever they say today.
No contract change, no migration, no `LCC_HANDOFF_REQUIRED`.

## 3. THE BUILD — WHAT IT COST YOU TODAY, AND WHY THERE IS NO INDEX

Two attempts, both plain `CREATE INDEX` (not CONCURRENTLY) taking a ShareLock on
`new1_doc_vector_stage` **only**. Reads on that table were unaffected and nothing
else was locked. The delta queue kept firing every fifteen minutes throughout and
completed normal empty passes — observed, not assumed.

    attempt 1   4 GB mwm,  4 workers   09:51:40Z–14:46:01Z   cancelled at 52.5%
    attempt 2   8 GB mwm, 10 workers   14:48:16Z–15:39:02Z   cancelled at 41.2%

`maintenance_work_mem` was session-local in both. **Your autovacuum workers and
the retrieval path were never touched, and `shared_buffers` was not changed.**

If you saw retrieval p95 move between 09:51Z and 15:39Z, that was me and it is
over. The box has been clear since.

**Why there is no index.** Post-spill throughput was 24.7 tuples/s on 4 workers
and 24.2 tuples/s on 10 — two and a half times the workers, 2.3x the disk reads
(21,818/s vs ~9,500/s), identical progress. The post-spill insert path does not
parallelise. The only lever is residency, and the build needs **19.52 GiB**
resident: both spills landed within 0.02% of 2,731 bytes/tuple, so that is a
measurement, not an estimate. This box has **11.7 GiB** available. No setting
closes that gap.

Raised as `FQ-NEW1-R14-RAM`. Both cancels were clean `pg_cancel_backend` and the
table was verified intact after each — 8,160,672 rows, pkey the only index.

**One thing that IS yours, and it is the most useful thing this round found.**
Measured on the 1M probe index (identical form), `ef_search = 40`, filtered to one
High Court holding 17% of the rows:

    hnsw.iterative_scan = off             137 of 283 queries returned ZERO rows
                                          146 returned fewer than 100
                                          mean rows returned 2.68 of 100
    hnsw.iterative_scan = relaxed_order   0 zero-results, 0 short of k, mean 100
                                          but p50 2 ms -> 356 ms, p95 1,790 ms

That is the exact failure `NEW1_COVERAGE_STATE_CONTRACT.md` exists to prevent: an
empty screen that is a property of the index rather than of the law, on a filter
that is not even narrow. Full ef sweep lands in
`docs/ai/new1-r14/ann-evaluation-probe1m.json`. I am not asking you to change
anything yet — the figures are at 1M rows and I will not let them be quoted as if
they were at 7.67M.

Round: `docs/ai/new1-r14/NEW1_R14_FINALIZATION.md`.
Build mechanism: `docs/ai/new1-r14/HNSW_BUILD_COST_AT_SCALE.md`.
