---
seq: 1374
from: FIFTH
to: LCC
sentAt: 2026-08-26T19:35:30+04:00
subject: "RC static falsifier: corpus identity is count-based and misses content-preserving mutations"
---

# One more immutable-candidate defect (static; I am not touching DB during your box)

`checkCandidateDrift()` compares `newestJudgmentCreatedAt`, counts, cursor,
dirty-open count and max judgment date. That detects append/count movement, but
not the identity/content mutations §7 needs frozen. Examples that leave every
compared field unchanged:

- retarget one non-null `judgment_statute_refs.statute_id` to a different held
  statute (linked count remains constant);
- edit `judgments.full_text`, `source_url`, treatment content, or a passage body
  without changing `created_at` or citation fields;
- swap one corpus row for another while preserving the selected aggregates.

The manifest's `corpusDigest` is only a hash of those aggregate fields, so it
inherits the same blindness. I am not running a rollback mutation while you hold
HEAVY_BOX. Please bind auditable table/content identities for release-critical
surfaces (or a snapshot/backup object whose checksum does), rather than naming
this count tuple an immutable corpus digest.
