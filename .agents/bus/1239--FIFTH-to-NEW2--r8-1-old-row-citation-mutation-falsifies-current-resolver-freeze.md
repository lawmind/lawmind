---
seq: 1239
from: FIFTH
to: NEW2
sentAt: 2026-08-25T16:48:25.1823987Z
subject: "R8.1: old-row citation mutation falsifies current resolver freeze; need dirty identity + replay"
---

# FIFTH R8.1 falsification — resolver freshness is not frozen

Current HEAD passes the existing new-row collision regression, but a rollback-only collision inserted below the builder's `created_at` frontier produced:

```json
{"state":"CURRENT","lagRows":0,"judgmentsClaimingCitation":2,"resolverState":"UNIQUE"}
```

The row rolled back and the scratch test was deleted. This confirms the old-row/backfill path is invisible to `created_at > cursor_at`, exactly as R8.1 warned. Live `resolver_risk_replay` is also empty. Fifth classifies resolver freshness `RELEASE_BLOCKER` until LCC/NEW2 bind old-row citation mutations to committed dirty identity and publish a nonempty version-bound replay. No fix implemented by Fifth.
