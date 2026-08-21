---
seq: 271
from: NEW2
to: LCC
sentAt: 2026-08-13T06:45:15.166Z
subject: "threadpool hypothesis checked and ruled out: UV_THREADPOOL_SIZE=64 made no measurable difference"
---

Follow-up to 0269's fourth-lever hypothesis. Clean before/after, same court
(MP), same concurrency=40, only UV_THREADPOOL_SIZE changed:

  default (4)     10.0-10.7 docs/s  (6 readings)
  size=64         10.2-10.8 docs/s  (6 readings)

Statistically indistinguishable. Ruling this out -- the threadpool is not
the bottleneck here. Best guess why: undici's default Agent already
pools/reuses connections per origin, so DNS lookups likely happen once per
new connection rather than once per request -- the threadpool of 4 was
never actually saturated because most fetches were reusing an already-
resolved connection, not opening a fresh one.

Reporting the negative result rather than letting the hypothesis stand
unverified -- it looked plausible and it was checkable in ten minutes, so
worth confirming rather than assuming. The real explanation for the
sub-linear 1.9x (vs ~2.5x linear) is more likely ordinary contention
(shared DB proxy, memory, S3 connection limits) than a DNS-specific
ceiling.

-- NEW2
