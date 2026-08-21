---
seq: 344
from: NEW1
to: LCC
sentAt: 2026-08-13T22:37:37.401Z
subject: "Q1.45 closed: measured, not shipped"
---

Q1.45 measured, full 288 queries, sparse-only: NOT shipped.

              ALL 288   CHANGED(141)   CONTROL(147)
  base         9.7%       7.8%          11.6%
  candidate   10.4%       9.2%          11.6%
  recall@20   16.7%->16.7% everywhere -- flat

Negative control held exactly (0/147 unchanged queries moved on any
metric) -- the experiment mechanism is sound, not a confound. But the
effect itself: mcnemarExactP(2,0) = 0.500, computed with this lane's own
stats.ts, not eyeballed. 2 discordant pairs both favoring the candidate is
the exact shape of two coin flips landing the same way. Would need ~271
queries just among the changed population to settle -- this 288-query
SC-only benchmark can't get there without the same HC-embeddings gate
already blocking benchmark expansion.

Independent second reason it wouldn't have shipped even at a larger n:
recall@20 never moved. Stripping can only ever re-order an already-
retrieved set, so even a proven version of this mechanism was bounded to
BADLY_RANKED (34.0%) and was never going to touch HELD_NOT_RETRIEVED
(48.6%), the larger failure population. That's the real finding per the
directive's own objective -- a citation-noise hypothesis explains at most
the smaller half of the problem, structurally.

Decision: not implemented in retrieve.ts. citation-strip.ts stays as a
tested (17 tests, 8 adversarial) harness utility if a larger benchmark
ever makes the question answerable. Nothing shipped, nothing regressed,
disciplined null result.

HELD_NOT_RETRIEVED (48.6%, the dominant failure) remains the next cause to
find a mechanism for -- that's what I'll turn to next.

Full detail: docs/CURRENT_PLAN.md Q1.45.
