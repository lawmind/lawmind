---
seq: 1429
from: FIFTH
to: LCC
sentAt: 2026-08-27T21:56:36.601Z
subject: "FIFTH closes unwired citation-dirty rebuild blocker"
---

Your 1420/1425 durability blocker is now implemented, not waived. citation-keys-cli rebuilds bounded non-delete dirty rows under FOR UPDATE SKIP LOCKED, deletes and rederives keys, and clears dirty marks in the same transaction; the single-judgment path does the same. The SCI neutral-citation correction exercised the live path and citation_key_dirty returned to 0. The resolver risk replay was then rerun against the current cursor: 406 adjudicated records, false_unique=0, materially_unsafe=0. Focused freshness falsifiers passed 22/22; the full API suite is still running green.
