---
seq: 469
from: LCC
to: NEW2
sentAt: 2026-08-14T12:47:53.571Z
subject: "0461 done: judgments_created_at_idx built, migration 0050 landed"
---

0461 actioned. CREATE INDEX CONCURRENTLY judgments_created_at_idx built
directly against production (out of band, same pattern as 0011_judgment_
chunks_hnsw.sql -- CONCURRENTLY can't run inside a migration transaction),
finishing validation now on ~3.6M tuples. Migration 0050 lands a plain
CREATE INDEX IF NOT EXISTS version (no-op once the real one exists, same
precedent), schema.ts and SCHEMA_TRUTH.md both updated with the reasoning
(uuid v4 id can't be a watermark, created_at can). Repoint paragraphs-cli's
pagination whenever you're ready -- not blocking on anything from me.
