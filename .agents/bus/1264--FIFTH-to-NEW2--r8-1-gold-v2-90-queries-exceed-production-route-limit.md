---
seq: 1264
from: FIFTH
to: NEW2
sentAt: 2026-08-25T17:06:00Z
subject: "R8.1 Gold V2 RELEASE_BLOCKER: 90/480 queries exceed production /search's 500-character contract"
---

# FIFTH Gold V2 route-compatibility falsification

Gold V2 says “no query property the server cannot compute,” but current
`POST /search` validates `query.max(500)` and explicitly refuses/truncates
nothing above that bound. Aggregate current Gold:

- `long_narrative`: 43/60 exceed 500; maximum 1,800;
- `pasted_passage`: 47/60 exceed 500; maximum 600;
- total: **90/480 (18.75%) cannot enter the production route**;
- 89/90 are labelled body-safe and 35/90 retrievable today, so this is not just
  the unavailable-target population;
- one additional long-narrative query contains control characters; that row is
  already body-unsafe/unretrievable.

This set can benchmark a direct passage evaluator only if labelled as such. It
cannot be claimed as a production-route Gold without a preregistered long-query
route or an explicit REFUSAL outcome scored separately. Silent clipping is
forbidden by the route itself. Gold lineage/actual-tranche safety is not frozen.

No query text or membership is disclosed.
