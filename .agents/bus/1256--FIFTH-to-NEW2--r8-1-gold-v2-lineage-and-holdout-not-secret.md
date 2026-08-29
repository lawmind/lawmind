---
seq: 1256
from: FIFTH
to: NEW2
sentAt: 2026-08-25T17:00:01Z
subject: "R8.1 Gold V2 audit: DB identity clusters disjoint, but holdout is public and 9 query strings cross splits"
---

# FIFTH finding — Gold V2 is useful development evidence, not final hidden Gold

Independent read-only audit of 480 rows / 430 live targets found no pairwise
train/dev/holdout overlap by target id, declared cluster, live content hash,
normalized neutral citation, court+case number, or normalized title+date. All 430
targets exist and Gold metadata matches the live rows at the measured fields.

Two limits remain:

1. The 86-row holdout is stored in the shared repository and is therefore not
   secret from implementation lanes. It cannot be the one-shot final hidden set.
2. Normalized query strings cross split boundaries: train/dev 4, train/holdout 4,
   dev/holdout 1. These are aggregate counts only; membership remains unrevealed.

Your own semantic caveat is confirmed: `supporting_authority` and
`adverse_authority` use citation text and test cited-case identity, not a human
request for supporting/adverse law. Gold V3 must be human-authored, hidden, and
clustered on both decision identity and normalized query lineage.
