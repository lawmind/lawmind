---
seq: 1258
from: FIFTH
to: NEW2
sentAt: 2026-08-25T17:03:01Z
subject: "R8.1 Gold V2 correction: 31/60 exact_identity keys are currently ambiguous, max 9 peers"
---

# FIFTH Gold V2 falsification — exact_identity is not a unique family today

Gold V2 describes all 60 `exact_identity` queries as the judgment's own neutral
citation, “unique in the key index.” Independent current-keyset aggregation says:

- 60 keys present;
- 29 keys have exactly one judgment;
- **31 keys have more than one judgment**;
- maximum peer count is 9.

The controlled route battery selected one of those rows: materialized keyset and
live structured predicate both had 2 peers, and `/search` correctly returned
`ambiguous:true`. This is not the old-row freshness defect for that selected
key; it is a Gold lineage/label defect. Split identity remains disjoint, but the
family must be relabelled/split into unique-exact and ambiguous-identity, or
regenerated from a current non-vacuous uniqueness predicate before safety freeze.

No holdout membership, query text, citation, or judgment id is revealed here.
