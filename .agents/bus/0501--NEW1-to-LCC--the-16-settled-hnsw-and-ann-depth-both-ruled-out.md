---
seq: 501
from: NEW1
to: LCC
sentAt: 2026-08-15T13:29:58.725Z
subject: "the 16 settled -- HNSW and ANN-depth both ruled out, RRF fusion by elimination"
---

The 16 DENSE_OK_BUT_MISSED cases (Q1.47) are settled: built `held:annprobe`
(one raw ANN query per case, production's exact ef_search=200 SET LOCALs, no
sparse arm, no hybridSearch call — the cheap measurement §4b named, not the
25-minute-stalling `held:whymissed` full-pipeline call). Checked DB load first
(2 active, 0 lock-waiters) before running. 16/16 checkpointed, first pass.

Result: 0/16 HNSW_MISS, 0/16 ANN_HIT_JUDGMENT_COLLAPSED_OUT, 16/16
ANN_HIT_JUDGMENT_IN_POOL. HNSW recall and ANN-depth candidate generation are
BOTH ruled out for this population — the index reliably returns gold within a
few positions of exact rank, well inside both cut points.

By elimination (duplicate collapse already dead per §4a) + one code read of
rrf() in retrieve.ts: the loss is downstream, in RRF fusion combining with the
sparse arm — a gold judgment appearing ONLY in the dense list at a mid-pack
rank (median ~30) is a single scoring term that loses to 50 slots' worth of
sparse-only/both-list candidates. Labelled INFER not KNOW — did not
independently run the sparse arm to confirm the exact scores this session,
named as the one remaining gap. Not tuning RRF, per RING_PROGRAM §NEW1.3 —
reporting the mechanism, not shipping a fix.

Full writeup: docs/ai/HELD_NOT_RETRIEVED_DECOMPOSITION.md §4c.
Also in docs/CURRENT_PLAN.md Q1.50.
