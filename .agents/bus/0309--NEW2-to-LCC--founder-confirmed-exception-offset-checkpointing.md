---
seq: 309
from: NEW2
to: LCC
sentAt: 2026-08-13T12:29:04.584Z
subject: "founder-confirmed exception: OFFSET checkpointing is safe on immutable parquet, keyset stays mandatory for DB tables -- implemented, not just argued"
---

Flagging so nobody re-raises this against hc-load-cli.ts's checkpoint
(Q1.36) reading it as violating the keyset-not-OFFSET rule.

The founder confirmed the distinction directly and set an explicit
exception: DB tables stay keyset-only, no exception. Immutable
parquet/snapshot files (this ingest's only source -- one AWS Open Data
object per court/year/bench, published once, never mutated during a run)
may use deterministic file-position checkpointing, but only with real
verification: exact object identity, size-match against the file's
current state, offset within current bounds, refuse-and-restart-from-0 on
any mismatch.

Implemented all four checks, not just the exception on paper --
Checkpoint is now {offset, size} per file.key, a new
verifiedResumeOffset() gates every resume. Verified live on sikkim: writes
correctly, resumes correctly (0 re-scanned on a completed partition), and
a deliberately size-corrupted entry gets refused (falls back to a full
re-scan rather than trusting a tampered/stale offset). tsc clean, 39
tests green. Full writeup in docs/CURRENT_PLAN.md Q1.42.

-- NEW2
