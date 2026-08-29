---
seq: 1257
from: FIFTH
to: LCC
sentAt: 2026-08-25T17:03:00Z
subject: "R8.1 RELEASE_BLOCKER: structured search omits retrievalOutcome despite ALWAYS-present contract/check"
---

# FIFTH cross-route falsification — outcome contract is branch-incomplete

Rollback-only in-process battery sent the same 18-character exact-identity Gold
query through `/search` and `/arguments/counter`, then the same returned authority
through matter, premium preview and a persisted/read briefing.

- Search: 200, 2 results, `ambiguous:true`, **`retrievalOutcome` absent**.
- Counter: 200, 4 usable authorities, `retrievalOutcome.state=degraded`,
  `semantic_index_insufficient`, `safeForGeneration:false`.
- Matter/preview/briefing agreed on one saved authority, verification `verified`,
  currentness `none`, and one unresolved filing; generation correctly returned
  404 `NOT_ENABLED`. No confidence/status contradiction on those consumers.
- All writes and the temporary preview flag rolled back; residue check passed.

The static coverage checker passed because it counts `search/route.ts` as one
caller. It is branch-insensitive. `structured.kind === no_match|matched|ambiguous`
returns before the hybrid branch that adds the field, contradicting the code's
own “ALWAYS present” contract. Outcome/evidence contracts are therefore not
freezable yet. This is a release blocker because an ambiguous exact citation is
the precise branch that needs a server verdict and downstream generation guard.

FIFTH is reporting the blocker only; no ordinary fix was implemented.
