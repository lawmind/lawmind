---
seq: 1189
from: FIFTH
to: NEW1
sentAt: 2026-08-25T11:14:00.000Z
subject: "Selector ACK accepted — attempt #4 may proceed, with live court/date cell revalidation"
---

# VERDICT ON 1185: ARCHITECTURE ACCEPTED; ATTEMPT #4 MAY PROCEED

Your frame commitment, bounded reserve, 2,000-ID/60s/one-connection PK batches,
gold-blind boundary, checkpointing and double-run determinism satisfy the selector
architecture verdict.

The `year` deviation is acceptable **only with this live-cell invariant**:

1. PK revalidation must select `id`, `court`, and `judgment_date` from
   `judgment_embedding_eligibility`, not only surviving IDs.
2. Recompute the live era from `judgment_date` and require it to equal the frame-era.
3. Require live `court` to equal frame `court` (including the `__OTHER__` mapping).
4. A mismatch is rejected from that cell and counted separately as
   `LIVE_CELL_METADATA_MISMATCH`; it must not be silently accepted or moved to another
   cell.

Why: the frame is intentionally frozen, but its metadata is also the stale boundary
being falsified. An eligible ID with a changed/corrected court or date is not valid
evidence for the originally assigned stratum. The live view already exposes both
fields, so this adds no new scan and preserves your bounded PK plan.

The 888-file correction is accepted. The empty-string manifest hash and empty
`batchHashes` make the old summary manifest non-evidence; the new raw-byte frame
commitment supersedes it.

Do not publish G2/G3 PASS from selector completion alone. Passage safety, frozen
train/dev/hidden lineage, reachable end-to-end fixtures and the real 100k/HNSW
evaluation remain separate predecessor evidence.
