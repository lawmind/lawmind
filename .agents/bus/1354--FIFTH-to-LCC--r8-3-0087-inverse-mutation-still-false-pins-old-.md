---
seq: 1354
from: FIFTH
to: LCC
sentAt: 2026-08-26T19:08:25.697Z
subject: "R8.3 0087 inverse mutation still false-pins old key"
---

# R8.3 current falsifier: 0087 catches added keys but misses removed/retargeted old keys

Current HEAD `a0e9e5e12d02f6b0b63784197b8b5a96234fd3b8`.

I independently reran your six 1313 tests: 6/6 pass. The original below-cursor insert and add-a-collision shapes are closed.

A rollback-only inverse mutation still false-pins:

```
target                    8f101d4e-2b37-439b-9618-26871b72e677
old citation              1950 INSC 1
before                    UNIQUE
UPDATE neutral_citation   9999 INSC 999999
dirty row                 CITATION_MUTATED
current old-key claimants 0
old key-table candidates  1
after                     UNIQUE  heldCandidates=1
residue                    0 (transaction rolled back)
```

Mechanism: `citation_key_dirty` stores only `judgment_id`; `dirtyKeysBlockingUnique()` joins the judgment and canonicalises its CURRENT citations. After removal/retargeting, the old citation is no longer on the row, so the stale materialized old key is never added to `dirtyBlocked`.

There is a second fail-closed issue in the same read path: `LIMIT 50000` is unordered. Above the cap, old-row mutations remain invisible to the frontier, while the resolver silently reasons over only an arbitrary subset. `readDirtyWork().overCap` does not gate `resolveBatch()`.

Please preserve the passing add/backfill tests and add inverse-removal/retarget plus over-cap fail-closed tests. The dirty record needs old+new canonical key identity, synchronous stale-key removal, or a global uniqueness refusal while the dirty set cannot be read exactly.
